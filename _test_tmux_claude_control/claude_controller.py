#!/usr/bin/env python3
"""
claude_controller.py — High-level Python API to control a Claude Code session via tmux.

Combines screen parsing (screen_parser.py) with transcript reading
(transcript_reader.py) to drive Claude Code programmatically.

Usage:
    from claude_controller import ClaudeController, Response

    ctrl = ClaudeController(session_name="my-claude", cwd="/tmp/workdir")
    ctrl.launch()
    resp = ctrl.send_prompt("Write a hello world in Python")
    print(resp.text)
    ctrl.exit_gracefully()
"""

from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from screen_parser import (
    ScreenMode,
    ScreenState,
    parse_screen,
)
from transcript_reader import ToolCall, TranscriptReader


# ── Constants ─────────────────────────────────────────────────────────────────

POLL_INTERVAL: float = 0.4          # seconds between wait_for_idle polls
CLAUDE_STARTUP_WAIT: float = 6.0    # seconds to wait after launching Claude
KEYSTROKE_SLEEP: float = 0.05       # sleep between individual keystrokes
PRE_ENTER_SLEEP: float = 0.1        # sleep after typing text but before Enter

# Patterns that indicate an error state in the screen output
ERROR_PATTERNS: list[str] = [
    "rate limit",
    "Rate limit",
    "Error:",
    "error:",
    "Connection refused",
    "ECONNREFUSED",
    "context window",
    "token limit",
    "API error",
    "timed out",
    "Session expired",
]


# ── Custom exceptions ─────────────────────────────────────────────────────────

class ClaudeError(Exception):
    """Base exception for Claude controller errors."""


class ClaudeTimeoutError(ClaudeError):
    """Timed out waiting for Claude."""


class ClaudeNotReadyError(ClaudeError):
    """Claude is not in the expected state."""


class ClaudeSessionError(ClaudeError):
    """Tmux session does not exist or Claude crashed."""


# ── Response dataclass ────────────────────────────────────────────────────────

@dataclass
class Response:
    """Result of sending a prompt to Claude."""
    text: str                          # The assistant's response text (from JSONL)
    screen_text: str                   # Raw screen capture at completion
    duration: float                    # Seconds from prompt send to idle
    state: ScreenState                 # Final screen state
    tool_calls: list[ToolCall] = field(default_factory=list)  # Tools used during this response


# ── ClaudeController ──────────────────────────────────────────────────────────

class ClaudeController:
    """
    High-level controller for a Claude Code session running inside a tmux pane.

    The controller combines:
      - tmux send-keys / capture-pane for driving the TUI
      - screen_parser.parse_screen() for state detection
      - TranscriptReader for reliable response extraction from JSONL

    All I/O is synchronous (subprocess + time.sleep). No async required.
    """

    def __init__(self, session_name: str = "claude-ctrl", cwd: str = ".") -> None:
        """Initialize controller. Does NOT launch Claude yet; call launch() for that."""
        self.session_name = session_name
        self.cwd = str(Path(cwd).expanduser().resolve())
        self._transcript: Optional[TranscriptReader] = None
        self._pane: str = f"{session_name}:0"

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def launch(
        self,
        dangerous_skip: bool = True,
        wait_ready: bool = True,
        timeout: float = 30.0,
    ) -> None:
        """
        Create a detached tmux session, launch Claude Code inside it, and wait
        until Claude is at the idle input prompt.

        Steps:
          1. Kill any existing session with the same name (cleanup).
          2. Create a new detached tmux session.
          3. cd into self.cwd.
          4. Run 'claude [--dangerously-skip-permissions]'.
          5. Wait CLAUDE_STARTUP_WAIT seconds, then press Enter to dismiss any
             welcome/update banners.
          6. Optionally wait for idle screen state.
          7. Detect the transcript file (most recently modified ses_*.jsonl).
        """
        # 1. Kill any existing session with the same name
        if self._tmux_session_exists():
            subprocess.run(
                ["tmux", "kill-session", "-t", self.session_name],
                check=False,
                capture_output=True,
            )
            time.sleep(0.2)

        # 2. Create a new detached tmux session
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", self.session_name],
            check=True,
            capture_output=True,
        )
        time.sleep(0.1)

        # 3. cd into the working directory
        self._tmux_send(f"cd {self.cwd}")
        self._tmux_key("Enter")
        time.sleep(0.2)

        # 4. Launch Claude Code
        claude_cmd = "claude"
        if dangerous_skip:
            claude_cmd += " --dangerously-skip-permissions"
        self._tmux_send(claude_cmd)
        self._tmux_key("Enter")

        # 5. Wait for Claude to start up and dismiss any welcome / update banner
        time.sleep(CLAUDE_STARTUP_WAIT)
        self._tmux_key("Enter")  # dismiss welcome screen if present
        time.sleep(0.5)

        # 6. Wait for idle state
        if wait_ready:
            try:
                self.wait_for_idle(timeout=timeout)
            except ClaudeTimeoutError:
                # Not necessarily fatal — Claude may just be loading slowly.
                # Capture screen for debugging but don't raise.
                screen_text = self._tmux_capture()
                pass  # Caller can check is_idle() themselves

        # 7. Detect the transcript file (most recently modified ses_*.jsonl)
        transcript_path = TranscriptReader.detect_transcript_for_session(self.session_name)
        if transcript_path is not None:
            self._transcript = TranscriptReader(transcript_path)

    def kill(self) -> None:
        """Kill the tmux session forcefully."""
        if self._tmux_session_exists():
            subprocess.run(
                ["tmux", "kill-session", "-t", self.session_name],
                check=False,
                capture_output=True,
            )

    def exit_gracefully(self) -> None:
        """Send /exit to Claude, wait for process to end, then kill the tmux session."""
        if not self._tmux_session_exists():
            return

        try:
            # Send /exit and press Enter
            self._tmux_send("/exit")
            self._tmux_key("Enter")

            # Wait up to 10 seconds for the session to disappear or Claude to quit
            deadline = time.monotonic() + 10.0
            while time.monotonic() < deadline:
                if not self._tmux_session_exists():
                    return
                # Check if the shell prompt is back (Claude exited but shell running)
                raw = self._tmux_capture()
                clean = raw.strip().splitlines()
                last_lines = [l.strip() for l in clean[-5:] if l.strip()]
                if any(
                    l.startswith("$") or l.startswith("%") or l.endswith("$") or l.endswith("%")
                    for l in last_lines
                ):
                    break
                time.sleep(0.5)
        except Exception:
            pass

        # Forcefully kill whatever remains
        self.kill()

    # ── Core interaction ───────────────────────────────────────────────────────

    def send_prompt(self, text: str, timeout: float = 120.0) -> Response:
        """
        Send a prompt to Claude and wait for the complete response.

        Steps:
          1. Verify Claude is in IDLE state (wait for it if not).
          2. Record the current transcript file position / timestamp.
          3. Type the prompt and press Enter.
          4. Wait for Claude to return to IDLE.
          5. Extract the response from the JSONL transcript.
          6. Return a Response object.
        """
        # 1. Ensure Claude is idle before sending
        state = self.get_state()
        if state.mode != ScreenMode.IDLE:
            self.wait_for_idle(timeout=min(30.0, timeout))

        # 2. Record file position / tool-call baseline before sending
        transcript_position: Optional[int] = None
        tool_call_baseline_time: Optional[str] = None
        if self._transcript is not None:
            try:
                transcript_position = self._transcript.path.stat().st_size
                # Get last tool call timestamp as baseline
                existing_calls = self._transcript.get_tool_calls()
                if existing_calls:
                    tool_call_baseline_time = existing_calls[-1].timestamp
            except Exception:
                transcript_position = None

        start_time = time.monotonic()

        # 3. Type the prompt and press Enter
        # Use tmux send-keys with the literal text (no special key names needed)
        # We send it in one shot to avoid character-by-character delays
        self._tmux_send(text)
        time.sleep(PRE_ENTER_SLEEP)
        self._tmux_key("Enter")

        # Give Claude a moment to start processing before we begin polling
        time.sleep(0.3)

        # 4. Wait for Claude to return to IDLE
        final_state = self.wait_for_idle(timeout=timeout)
        duration = time.monotonic() - start_time

        # 5. Capture the screen at completion
        screen_text = self._tmux_capture()

        # 6. Extract response from transcript
        response_text = ""
        tool_calls: list[ToolCall] = []

        if self._transcript is not None:
            try:
                response_text = self._transcript.get_last_response()
            except Exception:
                response_text = ""
            try:
                all_calls = self._transcript.get_tool_calls()
                if tool_call_baseline_time is not None:
                    tool_calls = [
                        tc for tc in all_calls
                        if tc.timestamp > tool_call_baseline_time
                    ]
                else:
                    tool_calls = all_calls
            except Exception:
                tool_calls = []

        return Response(
            text=response_text,
            screen_text=screen_text,
            duration=duration,
            state=final_state,
            tool_calls=tool_calls,
        )

    def wait_for_idle(self, timeout: float = 120.0) -> ScreenState:
        """
        Poll the screen until Claude is in IDLE state.

        Raises ClaudeTimeoutError if the timeout is exceeded.
        Raises ClaudeError if an error pattern is detected on screen.
        Raises ClaudeSessionError if the tmux session disappears.
        """
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            if not self._tmux_session_exists():
                raise ClaudeSessionError(
                    f"Tmux session '{self.session_name}' no longer exists"
                )

            raw = self._tmux_capture()

            # Check for error patterns before doing normal state detection
            for pattern in ERROR_PATTERNS:
                if pattern in raw:
                    raise ClaudeError(
                        f"Error pattern detected on screen: {pattern!r}\n"
                        f"Screen snippet: {raw[-500:]!r}"
                    )

            state = parse_screen(raw)
            if state.mode == ScreenMode.IDLE:
                return state

            time.sleep(POLL_INTERVAL)

        raise ClaudeTimeoutError(
            f"Timed out after {timeout}s waiting for Claude to become idle"
        )

    def answer_question(self, option: int | str) -> None:
        """
        Answer an AskUserQuestion widget.

        Parameters
        ----------
        option:
            If int   — press that number key directly (1-indexed instant select).
            If str   — navigate to the "Type something" option, type the text,
                       then press Enter.

        Waits for QUESTION state first if not already showing.
        """
        # Ensure we are in QUESTION state
        state = self.get_state()
        if state.mode != ScreenMode.QUESTION:
            # Wait briefly for question to appear
            deadline = time.monotonic() + 10.0
            while time.monotonic() < deadline:
                state = self.get_state()
                if state.mode == ScreenMode.QUESTION:
                    break
                time.sleep(POLL_INTERVAL)
            else:
                raise ClaudeNotReadyError(
                    f"Expected QUESTION mode, got {state.mode.value!r}"
                )

        if isinstance(option, int):
            # Press the digit key directly (Claude Code supports 1-indexed instant select)
            self._tmux_key(str(option))
            time.sleep(PRE_ENTER_SLEEP)
            self._tmux_key("Enter")
        else:
            # Navigate to "Type something" option
            # Find it in options list
            type_something_idx: Optional[int] = None
            for opt in state.options:
                if "type something" in opt.label.lower():
                    type_something_idx = opt.index
                    break

            if type_something_idx is None:
                raise ClaudeNotReadyError(
                    "Could not find 'Type something' option in question widget"
                )

            # Navigate using Up/Down arrows to reach the "Type something" option
            current_idx = state.selected_option_index
            steps = type_something_idx - current_idx
            key = "Down" if steps > 0 else "Up"
            for _ in range(abs(steps)):
                self._tmux_key(key)
                time.sleep(KEYSTROKE_SLEEP)

            # Press Enter to select the "Type something" option
            self._tmux_key("Enter")
            time.sleep(0.2)

            # Type the text and submit
            self._tmux_send(option)
            time.sleep(PRE_ENTER_SLEEP)
            self._tmux_key("Enter")

    def send_slash_command(self, cmd: str) -> None:
        """
        Send a slash command such as /compact, /clear, /model, /exit.

        Does not wait for a response (some commands are instant, others
        may trigger a transition — caller should wait_for_idle() if needed).
        """
        # Ensure cmd starts with a slash
        if not cmd.startswith("/"):
            cmd = "/" + cmd
        self._tmux_send(cmd)
        time.sleep(PRE_ENTER_SLEEP)
        self._tmux_key("Enter")

    def cancel(self) -> None:
        """Cancel the current operation by sending Escape then Ctrl+C."""
        self._tmux_key("Escape")
        time.sleep(KEYSTROKE_SLEEP)
        self._tmux_key("C-c")
        time.sleep(0.2)

    # ── State queries ──────────────────────────────────────────────────────────

    def get_state(self) -> ScreenState:
        """Capture the current screen and parse it into a ScreenState."""
        raw = self._tmux_capture()
        return parse_screen(raw)

    def get_last_response(self) -> str:
        """Return the last assistant response from the JSONL transcript."""
        if self._transcript is None:
            # Try to auto-detect the transcript lazily
            transcript_path = TranscriptReader.detect_transcript_for_session(
                self.session_name
            )
            if transcript_path is None:
                return ""
            self._transcript = TranscriptReader(transcript_path)
        try:
            return self._transcript.get_last_response()
        except Exception:
            return ""

    def is_healthy(self) -> bool:
        """
        Check if the Claude session is alive and responsive.

        Returns False if:
          - The tmux session does not exist.
          - The screen contains a fatal error indicator.
        """
        if not self._tmux_session_exists():
            return False
        try:
            raw = self._tmux_capture()
        except Exception:
            return False
        # Check for hard error patterns
        for pattern in ("Session expired", "ECONNREFUSED", "Connection refused"):
            if pattern in raw:
                return False
        return True

    def is_idle(self) -> bool:
        """Return True if Claude is currently at the idle input prompt."""
        state = self.get_state()
        return state.mode == ScreenMode.IDLE

    # ── Low-level tmux operations ──────────────────────────────────────────────

    def _tmux_send(self, text: str) -> None:
        """
        Send literal text to the tmux pane.

        Uses the empty string "" as the terminator so that special characters
        in `text` are not interpreted as key names by tmux.
        """
        subprocess.run(
            ["tmux", "send-keys", "-t", self._pane, text, ""],
            check=True,
            capture_output=True,
        )

    def _tmux_key(self, key: str) -> None:
        """
        Send a named key to the tmux pane.

        Named keys include: Enter, Up, Down, Left, Right, Escape, C-c, Tab, etc.
        """
        subprocess.run(
            ["tmux", "send-keys", "-t", self._pane, key],
            check=True,
            capture_output=True,
        )

    def _tmux_capture(self) -> str:
        """
        Capture the current tmux pane content.

        Uses -S -100 to include up to 100 lines of scrollback so we don't miss
        content that has scrolled off the visible area.
        """
        result = subprocess.run(
            [
                "tmux", "capture-pane",
                "-t", self._pane,
                "-p",          # print to stdout
                "-S", "-100",  # include 100 lines of scrollback
            ],
            capture_output=True,
            text=True,
        )
        return result.stdout

    def _tmux_session_exists(self) -> bool:
        """Return True if the tmux session currently exists."""
        result = subprocess.run(
            ["tmux", "has-session", "-t", self.session_name],
            capture_output=True,
        )
        return result.returncode == 0


# ── Self-test ─────────────────────────────────────────────────────────────────

def _print(msg: str) -> None:
    print(msg, flush=True)


def _run_skip_claude_tests() -> None:
    """Tests that do not require a running Claude instance."""
    _print("\n=== --skip-claude tests ===\n")

    # 1. Instantiation
    ctrl = ClaudeController(session_name="test-skip", cwd="/tmp")
    assert ctrl.session_name == "test-skip"
    assert ctrl.cwd == str(Path("/tmp").resolve())
    assert ctrl._pane == "test-skip:0"
    assert ctrl._transcript is None
    _print("[PASS] ClaudeController instantiation")

    # 2. _tmux_session_exists() returns False for a non-existent session
    assert ctrl._tmux_session_exists() is False
    _print("[PASS] _tmux_session_exists() → False for unknown session")

    # 3. is_healthy() returns False when session doesn't exist
    assert ctrl.is_healthy() is False
    _print("[PASS] is_healthy() → False when no tmux session")

    # 4. get_last_response() returns '' when no transcript
    resp = ctrl.get_last_response()
    assert resp == ""
    _print("[PASS] get_last_response() → '' when no transcript")

    # 5. kill() on non-existent session does not raise
    ctrl.kill()
    _print("[PASS] kill() on non-existent session is a no-op")

    # 6. exit_gracefully() on non-existent session does not raise
    ctrl.exit_gracefully()
    _print("[PASS] exit_gracefully() on non-existent session is a no-op")

    # 7. Response dataclass
    from screen_parser import ScreenState, ScreenMode
    state = ScreenState(mode=ScreenMode.IDLE, raw_text="test")
    r = Response(
        text="Hello world",
        screen_text="raw capture",
        duration=1.23,
        state=state,
        tool_calls=[],
    )
    assert r.text == "Hello world"
    assert r.duration == 1.23
    _print("[PASS] Response dataclass construction")

    # 8. Custom exceptions are subclasses of ClaudeError
    assert issubclass(ClaudeTimeoutError, ClaudeError)
    assert issubclass(ClaudeNotReadyError, ClaudeError)
    assert issubclass(ClaudeSessionError, ClaudeError)
    _print("[PASS] Exception hierarchy correct")

    _print("\n=== All --skip-claude tests passed ===\n")


def _run_full_tests() -> None:
    """Full integration tests that launch a real Claude Code session."""
    _print("\n=== Full integration tests ===\n")

    session = "claude-ctrl-selftest"
    ctrl = ClaudeController(session_name=session, cwd="/tmp")

    # ── Step 1: Launch
    _print("Step 1: Launching Claude Code...")
    ctrl.launch(dangerous_skip=True, wait_ready=True, timeout=60.0)
    _print(f"        Session alive: {ctrl._tmux_session_exists()}")

    # ── Step 2: Verify idle
    _print("Step 2: Checking is_idle()...")
    idle = ctrl.is_idle()
    assert idle, f"Expected Claude to be idle after launch, got state={ctrl.get_state().mode}"
    _print(f"        is_idle() = {idle}  [PASS]")

    # ── Step 3: Send a simple prompt
    _print("Step 3: Sending prompt 'Say hello in exactly 3 words'...")
    resp = ctrl.send_prompt("Say hello in exactly 3 words", timeout=120.0)
    _print(f"        Response text: {resp.text!r}")
    _print(f"        Duration: {resp.duration:.1f}s")
    _print(f"        Final state: {resp.state.mode.value}")
    assert resp.text, "Expected non-empty response text"
    _print("        [PASS] Response has text")

    # ── Step 4: /compact
    _print("Step 4: Sending /compact...")
    ctrl.send_slash_command("/compact")
    time.sleep(2.0)
    # /compact may ask a question or return to idle; wait for idle
    try:
        ctrl.wait_for_idle(timeout=30.0)
        _print("        /compact completed, back to idle  [PASS]")
    except ClaudeTimeoutError:
        _print("        /compact: still not idle after 30s (may be asking a question)")
        # Try answering with "1" if it's a question
        state = ctrl.get_state()
        if state.mode.value == "question":
            ctrl.answer_question(1)
            ctrl.wait_for_idle(timeout=20.0)
            _print("        Answered question, now idle  [PASS]")

    # ── Step 5: Exit gracefully
    _print("Step 5: Exiting gracefully...")
    ctrl.exit_gracefully()
    time.sleep(1.0)
    session_gone = not ctrl._tmux_session_exists()
    assert session_gone, "Expected tmux session to be gone after exit_gracefully()"
    _print(f"        Session killed: {session_gone}  [PASS]")

    _print("\n=== All full integration tests passed ===\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ClaudeController self-test")
    parser.add_argument(
        "--skip-claude",
        action="store_true",
        help="Only test class instantiation and helper methods, without launching Claude",
    )
    args = parser.parse_args()

    if args.skip_claude:
        _run_skip_claude_tests()
    else:
        _run_skip_claude_tests()
        _run_full_tests()
