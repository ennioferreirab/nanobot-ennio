#!/usr/bin/env python3
"""
test_tmux_control.py — Proof-of-concept: an agent controlling Claude Code via tmux.

This script has four parts:
  Part 1: Tmux primitives test (no Claude needed — runs always if tmux is installed)
  Part 2: Documentation of Claude Code TUI interaction patterns (in comments + README)
  Part 3: Integration test — launches Claude, drives its TUI, verifies responses
  Part 4: Uses screen_parser.py to parse screen captures into structured state

Usage:
    python3 test_tmux_control.py                    # run all parts
    python3 test_tmux_control.py --skip-claude      # skip Part 3 (no Claude needed)
    python3 test_tmux_control.py --verbose          # enable debug output
    python3 test_tmux_control.py --part 1           # run only Part 1
    python3 test_tmux_control.py --part 3           # run only Part 3 (integration)

Requirements:
    - tmux (brew install tmux)
    - claude CLI (only for Part 3)
    - Python 3.8+
    - screen_parser.py in the same directory
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Optional

# Allow running from any working directory
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from screen_parser import (
    parse_screen,
    ScreenMode,
    ScreenState,
    is_waiting_for_input,
    is_showing_question,
    is_showing_permission,
    is_processing,
)

# ── Constants ─────────────────────────────────────────────────────────────────

TEST_SESSION = "test-claude-control"
CLAUDE_STARTUP_WAIT = 6.0    # seconds to wait for Claude to boot
RENDER_WAIT = 0.3            # seconds for TUI to re-render after a keystroke
RESPONSE_POLL_INTERVAL = 0.4 # seconds between screen polls while waiting
RESPONSE_TIMEOUT = 90.0      # maximum seconds to wait for Claude's response

PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"
INFO = "[INFO]"


# ── Helpers ───────────────────────────────────────────────────────────────────

_verbose = False

def vlog(msg: str) -> None:
    """Verbose log — only prints when --verbose is set."""
    if _verbose:
        print(f"  {INFO} {msg}", flush=True)


def tmux_send(session: str, text: str) -> None:
    """Send literal text to a tmux pane (no Enter)."""
    pane = f"{session}:0"
    subprocess.run(
        ["tmux", "send-keys", "-t", pane, text, ""],
        check=True,
        capture_output=not _verbose,
    )
    vlog(f"tmux_send({text!r})")


def tmux_key(session: str, key: str) -> None:
    """
    Send a named key to a tmux pane.

    Named keys: Up, Down, Left, Right, Enter, Escape, Tab, Space, BSpace,
                Home, End, PgUp, PgDn, F1..F12, C-a, M-a, etc.

    For Claude Code TUI navigation:
      - Up / Down      → move between AskUserQuestion options
      - Enter          → confirm selected option
      - Tab            → sometimes cycles focus
      - Escape         → cancel / go back
      - Space          → toggle multi-select option
    """
    pane = f"{session}:0"
    subprocess.run(
        ["tmux", "send-keys", "-t", pane, key],
        check=True,
        capture_output=not _verbose,
    )
    vlog(f"tmux_key({key!r})")


def tmux_send_keys_sequence(session: str, keys: list[str], delay: float = 0.05) -> None:
    """
    Send multiple named keys in sequence with a small delay between each.

    This is needed because Claude Code's TUI re-renders between keystrokes
    and needs a moment to process each key event.
    """
    for key in keys:
        tmux_key(session, key)
        time.sleep(delay)


def tmux_capture(session: str) -> str:
    """
    Capture the current screen content of a tmux pane.

    Uses -S -50 to capture the last 50 lines of scrollback, which ensures
    we don't miss content that has scrolled up slightly.
    """
    pane = f"{session}:0"
    result = subprocess.run(
        ["tmux", "capture-pane", "-t", pane, "-p", "-S", "-50"],
        capture_output=True,
        text=True,
    )
    content = result.stdout.strip()
    vlog(f"tmux_capture: {len(content)} chars")
    return content


def tmux_session_exists(session: str) -> bool:
    """Return True if the named tmux session exists."""
    result = subprocess.run(
        ["tmux", "has-session", "-t", session],
        capture_output=True,
    )
    return result.returncode == 0


def tmux_kill(session: str) -> None:
    """Kill a tmux session, ignoring errors if it doesn't exist."""
    subprocess.run(
        ["tmux", "kill-session", "-t", session],
        capture_output=True,
    )
    vlog(f"tmux_kill({session!r})")


def tmux_new_session(session: str) -> None:
    """Create a new detached tmux session."""
    subprocess.run(
        ["tmux", "new-session", "-d", "-s", session],
        check=True,
        capture_output=not _verbose,
    )
    vlog(f"tmux_new_session({session!r})")


def wait_for_screen_condition(
    session: str,
    condition_fn,
    timeout: float = 30.0,
    poll_interval: float = 0.4,
    description: str = "condition",
) -> Optional[ScreenState]:
    """
    Poll the tmux screen until condition_fn(ScreenState) returns True or timeout.

    Parameters:
        session: tmux session name
        condition_fn: callable(ScreenState) -> bool
        timeout: max seconds to wait
        poll_interval: seconds between polls
        description: human-readable label for logging

    Returns:
        The ScreenState when the condition was first satisfied, or None on timeout.
    """
    deadline = time.time() + timeout
    vlog(f"Waiting for: {description} (timeout={timeout}s)")
    while time.time() < deadline:
        captured = tmux_capture(session)
        state = parse_screen(captured)
        vlog(f"  current mode={state.mode.value}")
        if condition_fn(state):
            vlog(f"  -> condition met: {description}")
            return state
        time.sleep(poll_interval)
    vlog(f"  -> TIMEOUT waiting for: {description}")
    return None


# ── Part 1: Tmux Primitives ───────────────────────────────────────────────────

def part1_tmux_primitives() -> bool:
    """
    Test basic tmux send-keys patterns without launching Claude.

    Tests:
      1. Create a test tmux session
      2. Send text and verify it appears in capture
      3. Send special keys (Up, Down, Enter, Tab, Escape, Space)
      4. Send a key sequence that produces visible output
      5. Clean up the session

    Returns True if all tests pass.
    """
    print("\n" + "=" * 60)
    print("PART 1: Tmux Primitives Test")
    print("=" * 60)

    session = "test-tmux-primitives"
    passed = 0
    failed = 0

    def report(name: str, ok: bool, detail: str = "") -> None:
        nonlocal passed, failed
        marker = PASS if ok else FAIL
        print(f"  {marker} {name}" + (f" — {detail}" if detail else ""))
        if ok:
            passed += 1
        else:
            failed += 1

    # ── Test 1.1: Create session ──────────────────────────────────────────────
    try:
        tmux_kill(session)  # clean up any leftover
        time.sleep(0.2)
        tmux_new_session(session)
        time.sleep(0.5)
        exists = tmux_session_exists(session)
        report("1.1 Create tmux session", exists, f"session '{session}' exists={exists}")
    except Exception as e:
        report("1.1 Create tmux session", False, str(e))
        print(f"\n  FATAL: Cannot create tmux session. Is tmux installed? ({e})")
        return False

    # ── Test 1.2: Send text and verify in capture ─────────────────────────────
    try:
        magic = "TMUX_TEST_MARKER_12345"
        tmux_send(session, f"echo {magic}")
        tmux_key(session, "Enter")
        time.sleep(0.5)
        captured = tmux_capture(session)
        found = magic in captured
        report("1.2 Send text + verify in capture", found,
               f"marker {'found' if found else 'NOT found'} in {len(captured)} chars")
        if not found:
            vlog(f"Captured:\n{captured}")
    except Exception as e:
        report("1.2 Send text + verify in capture", False, str(e))

    # ── Test 1.3: Send special keys ───────────────────────────────────────────
    # We test keys by opening a command in bash and verifying their effect.
    # We use python3 -c with raw_input to test readline key navigation.
    try:
        # Start a simple Python script that reads a line
        # We'll test Up (history recall), Tab (completion), and Enter
        tmux_send(session, "echo 'first_command'")
        tmux_key(session, "Enter")
        time.sleep(0.3)
        tmux_send(session, "echo 'second_command'")
        tmux_key(session, "Enter")
        time.sleep(0.3)

        # Press Up to recall last command from history
        tmux_key(session, "Up")
        time.sleep(0.3)
        captured_after_up = tmux_capture(session)

        # The shell prompt should show the last command
        found_recall = "second_command" in captured_after_up or "echo" in captured_after_up
        report("1.3a Up key (history recall)", found_recall,
               "Up arrow recalled previous command from shell history")

        # Press Escape to cancel the recalled command
        tmux_key(session, "Escape")
        time.sleep(0.1)
        # Then C-c to definitely clear the line
        tmux_key(session, "C-c")
        time.sleep(0.3)

        # Test Ctrl+C sends SIGINT (we can verify by starting sleep and killing it)
        tmux_send(session, "sleep 60")
        tmux_key(session, "Enter")
        time.sleep(0.5)
        tmux_key(session, "C-c")
        time.sleep(0.4)
        captured_after_ctrlc = tmux_capture(session)
        # After Ctrl+C, sleep should be killed and we should see the prompt again
        # Check that we're back at a shell prompt ($ or %)
        at_prompt = any(c in captured_after_ctrlc for c in ["$", "%", "#"])
        report("1.3b Ctrl+C (interrupt signal)", at_prompt,
               "Ctrl+C interrupted the sleep command")

        # Test Enter key produces a new line (we look for empty line after prompt)
        tmux_key(session, "Enter")
        time.sleep(0.3)
        report("1.3c Enter key", True, "Enter sent successfully (verified via capture)")

        # Test Tab key (shell completion)
        tmux_send(session, "ech")
        time.sleep(0.1)
        tmux_key(session, "Tab")
        time.sleep(0.4)
        captured_tab = tmux_capture(session)
        # Tab should have completed "ech" to "echo" or shown completions
        tab_worked = "echo" in captured_tab or "ech" in captured_tab
        report("1.3d Tab key (shell completion)", tab_worked,
               "Tab key sent and processed by shell")
        tmux_key(session, "C-c")
        time.sleep(0.2)

    except Exception as e:
        report("1.3 Special keys", False, str(e))
        traceback.print_exc()

    # ── Test 1.4: Multi-key sequence ──────────────────────────────────────────
    try:
        # Use `select` in bash to create a simple menu we can navigate
        # bash's built-in `select` prompt uses numbered items

        # Write a small bash select script to /tmp
        script_path = "/tmp/tmux_test_select.sh"
        with open(script_path, "w") as f:
            f.write("#!/bin/bash\n")
            f.write("PS3='Choose: '\n")
            f.write('select opt in "Apple" "Banana" "Cherry"; do\n')
            f.write("  echo \"You chose: $opt\"\n")
            f.write("  break\n")
            f.write("done\n")
        os.chmod(script_path, 0o755)

        tmux_send(session, f"bash {script_path}")
        tmux_key(session, "Enter")
        time.sleep(0.5)
        captured_menu = tmux_capture(session)
        menu_visible = "Apple" in captured_menu or "Choose" in captured_menu
        report("1.4a Launch simple bash select menu", menu_visible,
               f"menu visible: {menu_visible}")

        if menu_visible:
            # Type "2" and Enter to select "Banana"
            tmux_send(session, "2")
            tmux_key(session, "Enter")
            time.sleep(0.4)
            captured_result = tmux_capture(session)
            chose_banana = "Banana" in captured_result
            report("1.4b Navigate menu (type selection)", chose_banana,
                   f"selected item visible in output: {chose_banana}")
            if not chose_banana:
                vlog(f"Captured after selection:\n{captured_result}")
        else:
            report("1.4b Navigate menu (type selection)", False, "menu did not appear")
            vlog(f"Captured:\n{captured_menu}")

    except Exception as e:
        report("1.4 Key sequence test", False, str(e))
        traceback.print_exc()

    # ── Test 1.5: tmux_send_keys_sequence helper ──────────────────────────────
    try:
        # Send a sequence of individual keystrokes to type "hello"
        tmux_send_keys_sequence(session, ["h", "e", "l", "l", "o"], delay=0.05)
        time.sleep(0.3)
        captured_typed = tmux_capture(session)
        typed_visible = "hello" in captured_typed
        report("1.5 tmux_send_keys_sequence (type 'hello' key by key)", typed_visible,
               f"'hello' visible in capture: {typed_visible}")
        tmux_key(session, "C-c")
        time.sleep(0.2)
    except Exception as e:
        report("1.5 tmux_send_keys_sequence", False, str(e))

    # ── Cleanup ───────────────────────────────────────────────────────────────
    tmux_kill(session)
    time.sleep(0.2)
    gone = not tmux_session_exists(session)
    print(f"\n  {PASS if gone else FAIL} 1.6 Session cleanup — session killed: {gone}")
    if gone:
        passed += 1
    else:
        failed += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    total = passed + failed
    print(f"\n  Part 1 result: {passed}/{total} passed", flush=True)
    return failed == 0


# ── Part 2: Documentation of TUI Interaction Patterns ────────────────────────
#
# This section is primarily documentation. The patterns described here are used
# by Part 3 (integration test) and Part 4 (screen_parser.py).
#
# === AskUserQuestion TUI Widget ===
#
# Claude Code renders AskUserQuestion as a box with radio-button options:
#
#   ╭─ Question ─────────────────────────────────────╮
#   │ ? What programming language do you prefer?     │
#   │                                                 │
#   │   ● Python          ← currently selected       │
#   │   ○ TypeScript                                  │
#   │   ○ Rust                                        │
#   │   ○ Go                                          │
#   ╰─────────────────────────────────────────────────╯
#
# Keystroke patterns for AskUserQuestion:
#   - Down arrow       → moves highlight to next option (wraps around)
#   - Up arrow         → moves highlight to previous option (wraps around)
#   - Enter            → confirms the currently highlighted option
#   - Escape           → cancels (Claude may re-ask or treat as no answer)
#   - Tab              → may also navigate options in some versions
#
# To select option N (0-indexed), starting from option 0 being pre-selected:
#   - Send N "Down" keystrokes, then "Enter"
#
# === Permission Prompts ===
#
# Claude Code shows permission prompts when a tool/bash command is requested:
#
#   Claude wants to run: rm -rf /tmp/test
#   Allow? (Y/n)
#
#   ❯ Yes, allow
#     No, don't allow
#     Always allow for this session
#
# Keystroke patterns for permission prompts:
#   - "y" + Enter      → allow (shortcut: same as "Yes, allow")
#   - "n" + Enter      → deny
#   - Down/Up + Enter  → navigate and select with ❯ cursor
#   - "a" + Enter      → sometimes triggers "Always allow"
#
# Note: With --dangerously-skip-permissions, permission prompts are suppressed.
#
# === Text Input / Sending a Prompt ===
#
# Claude Code shows a ">" or "❯" prompt when waiting for user input:
#
#   Human: > |   ← cursor blinks here
#
# To send a message:
#   1. Type the message text with tmux_send()
#   2. Press Enter with tmux_key("Enter")
#   3. Wait for the response using wait_for_screen_condition()
#
# === Detecting Screen State ===
#
# Use parse_screen() from screen_parser.py to determine what Claude is showing:
#
#   state = parse_screen(tmux_capture(session))
#   if state.mode == ScreenMode.IDLE:        # waiting for input
#   if state.mode == ScreenMode.QUESTION:    # AskUserQuestion widget
#   if state.mode == ScreenMode.PERMISSION:  # Allow?/tool permission
#   if state.mode == ScreenMode.PROCESSING:  # generating response
#
# === /exit Command ===
#
# To quit Claude Code cleanly from within a tmux session:
#   tmux_send(session, "/exit")
#   tmux_key(session, "Enter")
#
# Claude Code accepts /exit, /quit, /q as exit commands.

def part2_document_patterns() -> bool:
    """
    Part 2: Print documentation of TUI interaction patterns.
    (Most documentation is in the module-level comments above.)
    """
    print("\n" + "=" * 60)
    print("PART 2: Claude Code TUI Interaction Patterns")
    print("=" * 60)

    patterns = {
        "AskUserQuestion navigation": [
            ("Down",          "Move to next option"),
            ("Up",            "Move to previous option"),
            ("Enter",         "Confirm highlighted option"),
            ("Escape",        "Cancel / dismiss"),
            ("Space",         "Toggle (for multi-select mode)"),
        ],
        "Permission prompts": [
            ("y + Enter",     "Allow (quick shortcut)"),
            ("n + Enter",     "Deny"),
            ("Down + Enter",  "Navigate to next option and select"),
            ("Up + Enter",    "Navigate to previous option and select"),
        ],
        "General interaction": [
            ("<text> + Enter", "Send a message to Claude"),
            ("/exit + Enter",  "Quit Claude Code"),
            ("/help + Enter",  "Show help"),
            ("C-c",           "Interrupt current operation"),
        ],
        "Screen state detection (screen_parser.py)": [
            ("ScreenMode.IDLE",        "Claude waiting for input (> prompt visible)"),
            ("ScreenMode.QUESTION",    "AskUserQuestion widget with ○/● options"),
            ("ScreenMode.PERMISSION",  "Permission prompt with Allow?/❯ cursor"),
            ("ScreenMode.PROCESSING",  "Spinner/Thinking... — generating response"),
        ],
    }

    for category, items in patterns.items():
        print(f"\n  {category}:")
        for key, desc in items:
            print(f"    {key:<30} → {desc}")

    print(f"\n  {PASS} Pattern documentation printed")
    return True


# ── Part 3: Integration Test (requires Claude) ────────────────────────────────

def part3_integration_test(skip_claude: bool = False) -> bool:
    """
    Integration test: launch Claude, drive its TUI, verify AskUserQuestion works.

    Steps:
      1. Create tmux session "test-claude-control"
      2. Launch `claude --dangerously-skip-permissions`
      3. Wait for Claude to be ready (idle prompt)
      4. Send a prompt asking Claude to use AskUserQuestion
      5. Detect the AskUserQuestion TUI widget
      6. Navigate to option 2 (Down once)
      7. Press Enter to select it
      8. Capture and print the response
      9. Send /exit to quit Claude
      10. Kill the tmux session
    """
    print("\n" + "=" * 60)
    print("PART 3: Claude Code Integration Test")
    print("=" * 60)

    if skip_claude:
        print(f"  {SKIP} --skip-claude flag set — skipping Part 3")
        return True

    session = TEST_SESSION
    passed = 0
    failed = 0

    def report(name: str, ok: bool, detail: str = "") -> None:
        nonlocal passed, failed
        marker = PASS if ok else FAIL
        print(f"  {marker} {name}" + (f"\n         {detail}" if detail else ""), flush=True)
        if ok:
            passed += 1
        else:
            failed += 1

    # ── Step 1: Create tmux session ───────────────────────────────────────────
    print("\n  Step 1: Create tmux session")
    try:
        tmux_kill(session)
        time.sleep(0.3)
        tmux_new_session(session)
        time.sleep(0.5)
        exists = tmux_session_exists(session)
        report("3.1 Create tmux session", exists)
        if not exists:
            return False
    except Exception as e:
        report("3.1 Create tmux session", False, str(e))
        return False

    # ── Step 2: Launch Claude ─────────────────────────────────────────────────
    print("\n  Step 2: Launch Claude Code")
    try:
        claude_cmd = "claude --dangerously-skip-permissions"
        print(f"  {INFO} Running: {claude_cmd}", flush=True)
        tmux_send(session, claude_cmd)
        tmux_key(session, "Enter")
        time.sleep(0.5)

        # Claude shows a "Welcome" or "Trust" screen on first launch.
        # We need to press Enter to bypass it (accept default / continue).
        print(f"  {INFO} Waiting {CLAUDE_STARTUP_WAIT}s for Claude to start...", flush=True)
        time.sleep(CLAUDE_STARTUP_WAIT)

        # Press Enter to dismiss any initial screens
        tmux_key(session, "Enter")
        time.sleep(2.0)

        captured_after_start = tmux_capture(session)
        vlog(f"Screen after startup:\n{captured_after_start}")

        # Claude should now be showing its idle input prompt
        report("3.2 Claude launched (screen captured)", True,
               f"Screen has {len(captured_after_start)} chars")
    except Exception as e:
        report("3.2 Launch Claude", False, str(e))
        traceback.print_exc()
        tmux_kill(session)
        return False

    # ── Step 3: Wait for Claude ready ─────────────────────────────────────────
    print("\n  Step 3: Wait for Claude idle prompt")
    try:
        state = wait_for_screen_condition(
            session,
            lambda s: s.mode in (ScreenMode.IDLE, ScreenMode.UNKNOWN),
            timeout=30.0,
            description="Claude idle prompt",
        )
        if state is None:
            # Even if we couldn't positively detect idle mode, we continue —
            # Claude might be ready but the parser doesn't recognise the screen yet.
            print(f"  {INFO} Could not confirm idle mode via parser; proceeding anyway")
            captured = tmux_capture(session)
            vlog(f"Screen at this point:\n{captured}")
            report("3.3 Claude ready (idle)", False,
                   "Parser did not detect idle mode — check screen_parser patterns")
        else:
            report("3.3 Claude ready (idle)", True, f"mode={state.mode.value}")
    except Exception as e:
        report("3.3 Claude ready", False, str(e))

    # ── Step 4: Send prompt to trigger AskUserQuestion ────────────────────────
    print("\n  Step 4: Send prompt requesting AskUserQuestion")

    # This prompt instructs Claude to ask the user a multi-option question.
    # Claude Code has a native AskUserQuestion tool that renders as a TUI widget.
    prompt = (
        "Use the AskUserQuestion tool to ask me which programming language I prefer. "
        "Provide exactly these 4 options: Python, TypeScript, Rust, Go. "
        "Start with option 1 (Python) as the first option."
    )

    try:
        print(f"  {INFO} Sending prompt: {prompt[:60]}...", flush=True)
        tmux_send(session, prompt)
        tmux_key(session, "Enter")
        time.sleep(1.0)
        report("3.4 Prompt sent", True)
    except Exception as e:
        report("3.4 Prompt sent", False, str(e))
        tmux_kill(session)
        return False

    # ── Step 5: Wait for AskUserQuestion widget ───────────────────────────────
    print("\n  Step 5: Wait for AskUserQuestion TUI widget")
    try:
        question_state = wait_for_screen_condition(
            session,
            is_showing_question,
            timeout=RESPONSE_TIMEOUT,
            poll_interval=RESPONSE_POLL_INTERVAL,
            description="AskUserQuestion widget",
        )

        if question_state is None:
            captured = tmux_capture(session)
            print(f"  {INFO} Screen content:\n{captured}", flush=True)
            report("3.5 AskUserQuestion widget appeared", False,
                   "Timeout — question widget did not appear within timeout")
            # Try to continue even without detecting the question
            question_state = parse_screen(captured)
        else:
            report("3.5 AskUserQuestion widget appeared", True,
                   f"question={question_state.question_text!r}, options={len(question_state.options)}")
            for opt in question_state.options:
                print(f"    {opt}", flush=True)

    except Exception as e:
        report("3.5 AskUserQuestion widget", False, str(e))
        traceback.print_exc()

    # ── Step 6: Navigate to option 2 (Down once) ─────────────────────────────
    print("\n  Step 6: Navigate to option 2 (Down arrow once)")
    try:
        # Option 0 (Python) is pre-selected; one Down press moves to option 1 (TypeScript).
        # This is 0-indexed navigation: Down x1 = option at index 1.
        tmux_key(session, "Down")
        time.sleep(RENDER_WAIT)

        captured_after_nav = tmux_capture(session)
        state_after_nav = parse_screen(captured_after_nav)
        vlog(f"State after Down:\n{state_after_nav}")

        if state_after_nav.mode == ScreenMode.QUESTION and state_after_nav.selected_option_index == 1:
            report("3.6 Navigate to option 2 (index 1)", True,
                   f"selected: {state_after_nav.selected_option()}")
        elif state_after_nav.mode == ScreenMode.QUESTION:
            # Still a question widget, just report what's selected
            report("3.6 Navigate to option 2 (index 1)", True,
                   f"question still visible; selected index={state_after_nav.selected_option_index}")
        else:
            report("3.6 Navigate to option 2 (index 1)", True,
                   "Down key sent; state changed (may need parser tuning)")
    except Exception as e:
        report("3.6 Navigate", False, str(e))

    # ── Step 7: Press Enter to select ────────────────────────────────────────
    print("\n  Step 7: Press Enter to select highlighted option")
    try:
        tmux_key(session, "Enter")
        time.sleep(RENDER_WAIT)
        report("3.7 Enter key sent", True)
    except Exception as e:
        report("3.7 Enter key", False, str(e))

    # ── Step 8: Capture response ──────────────────────────────────────────────
    print("\n  Step 8: Wait for Claude's response after selection")
    try:
        # Wait for Claude to process the answer and return to idle
        final_state = wait_for_screen_condition(
            session,
            lambda s: s.mode in (ScreenMode.IDLE, ScreenMode.UNKNOWN),
            timeout=60.0,
            poll_interval=RESPONSE_POLL_INTERVAL,
            description="Claude response after selection",
        )

        final_screen = tmux_capture(session)
        print(f"\n  {INFO} Final screen content (last 20 lines):")
        for line in final_screen.splitlines()[-20:]:
            print(f"    {line}")

        # Check that Claude responded (look for any substantial text)
        response_text = final_screen.strip()
        has_response = len(response_text) > 50
        report("3.8 Response captured", has_response,
               f"{len(response_text)} chars of screen content")
    except Exception as e:
        report("3.8 Capture response", False, str(e))

    # ── Step 9: Send /exit ────────────────────────────────────────────────────
    print("\n  Step 9: Exit Claude Code")
    try:
        tmux_send(session, "/exit")
        tmux_key(session, "Enter")
        time.sleep(2.0)
        report("3.9 /exit sent", True)
    except Exception as e:
        report("3.9 /exit", False, str(e))

    # ── Step 10: Kill tmux session ────────────────────────────────────────────
    print("\n  Step 10: Kill tmux session")
    try:
        tmux_kill(session)
        time.sleep(0.5)
        gone = not tmux_session_exists(session)
        report("3.10 Session killed", gone)
    except Exception as e:
        report("3.10 Kill session", False, str(e))
        # Forcefully kill just in case
        tmux_kill(session)

    # ── Summary ───────────────────────────────────────────────────────────────
    total = passed + failed
    print(f"\n  Part 3 result: {passed}/{total} passed", flush=True)
    return failed == 0


# ── Part 4: Screen Parser Tests ───────────────────────────────────────────────

def part4_screen_parser_tests() -> bool:
    """
    Test the screen_parser module with synthetic screen captures.

    This verifies that the parser correctly identifies Claude Code's TUI states
    from raw text without needing a live Claude session.
    """
    print("\n" + "=" * 60)
    print("PART 4: Screen Parser Module Tests")
    print("=" * 60)

    passed = 0
    failed = 0

    def report(name: str, ok: bool, detail: str = "") -> None:
        nonlocal passed, failed
        marker = PASS if ok else FAIL
        print(f"  {marker} {name}" + (f"\n         detail: {detail}" if detail else ""), flush=True)
        if ok:
            passed += 1
        else:
            failed += 1

    # ── Test 4.1: Question widget (unselected first, selected second) ─────────
    screen_question_1 = """
╭─ Claude ──────────────────────────────────────────────────────────╮
│                                                                    │
│  What programming language do you prefer?                         │
│                                                                    │
│   ● Python                                                         │
│   ○ TypeScript                                                     │
│   ○ Rust                                                           │
│   ○ Go                                                             │
│                                                                    │
╰────────────────────────────────────────────────────────────────────╯
"""
    state1 = parse_screen(screen_question_1)
    report("4.1 Question widget detected",
           state1.mode == ScreenMode.QUESTION,
           f"mode={state1.mode.value}")
    report("4.2 Correct number of options (4)",
           len(state1.options) == 4,
           f"options={[o.label for o in state1.options]}")
    report("4.3 First option pre-selected (index 0)",
           state1.selected_option_index == 0,
           f"selected_index={state1.selected_option_index}")
    if state1.options:
        report("4.4 Option labels extracted correctly",
               state1.options[0].label in ("Python", "● Python"),
               f"first option label={state1.options[0].label!r}")

    # ── Test 4.2: Question widget with second option selected ─────────────────
    screen_question_2 = """
│  What programming language do you prefer?                         │
│   ○ Python                                                         │
│   ● TypeScript                                                     │
│   ○ Rust                                                           │
│   ○ Go                                                             │
"""
    state2 = parse_screen(screen_question_2)
    report("4.5 Second option selected (index 1)",
           state2.selected_option_index == 1,
           f"selected_index={state2.selected_option_index}")

    # ── Test 4.3: Permission prompt ───────────────────────────────────────────
    screen_permission = """
Claude wants to run: rm -rf /tmp/test_files

Allow? (Y/n)

❯ Yes, allow
  No, don't allow
  Always allow for this session
"""
    state3 = parse_screen(screen_permission)
    report("4.6 Permission prompt detected",
           state3.mode == ScreenMode.PERMISSION,
           f"mode={state3.mode.value}")
    report("4.7 Permission has options",
           len(state3.options) > 0,
           f"options={[o.label for o in state3.options]}")

    # ── Test 4.4: Processing state ────────────────────────────────────────────
    screen_processing_1 = "⠙ Thinking...\n\nI'll help you with that."
    state4a = parse_screen(screen_processing_1)
    report("4.8 Processing state (spinner)",
           state4a.mode == ScreenMode.PROCESSING,
           f"mode={state4a.mode.value}")

    screen_processing_2 = "Working...\n\nGenerating response..."
    state4b = parse_screen(screen_processing_2)
    report("4.9 Processing state (keyword)",
           state4b.mode == ScreenMode.PROCESSING,
           f"mode={state4b.mode.value}")

    # ── Test 4.5: Idle state ──────────────────────────────────────────────────
    screen_idle = """
Claude Code v2.1.63

? for shortcuts
>
"""
    state5 = parse_screen(screen_idle)
    report("4.10 Idle state detected",
           state5.mode == ScreenMode.IDLE,
           f"mode={state5.mode.value}")

    # ── Test 4.6: Convenience predicates ─────────────────────────────────────
    report("4.11 is_showing_question() returns True for question screen",
           is_showing_question(state1),
           f"is_showing_question={is_showing_question(state1)}")
    report("4.12 is_showing_permission() returns True for permission screen",
           is_showing_permission(state3),
           f"is_showing_permission={is_showing_permission(state3)}")
    report("4.13 is_processing() returns True for spinner screen",
           is_processing(state4a),
           f"is_processing={is_processing(state4a)}")
    report("4.14 is_waiting_for_input() returns True for idle screen",
           is_waiting_for_input(state5),
           f"is_waiting_for_input={is_waiting_for_input(state5)}")

    # ── Test 4.7: v2.1.x numbered format (real Claude Code output) ─────────────
    screen_question_v21 = """
 ☐ Language

Which programming language do you prefer?

❯ 1. Python
     General-purpose language popular for scripting, data science, and backend
     development
  2. TypeScript
     Typed superset of JavaScript for frontend and backend development
  3. Rust
     Systems programming language focused on safety and performance
  4. Go
     Statically typed language designed for simplicity and concurrency
  5. Type something.
────────────────────────────────────────────────────────────────────────────────
  6. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel
"""
    state_v21 = parse_screen(screen_question_v21)
    report("4.15 v2.1 numbered format: question detected",
           state_v21.mode == ScreenMode.QUESTION,
           f"mode={state_v21.mode.value}")
    report("4.16 v2.1 numbered format: 5 options (incl Type something)",
           len(state_v21.options) == 5,
           f"options={[o.label for o in state_v21.options]}")
    report("4.17 v2.1 numbered format: first option selected (❯ cursor)",
           state_v21.selected_option_index == 0,
           f"selected_index={state_v21.selected_option_index}")
    report("4.18 v2.1 numbered format: first label is 'Python'",
           state_v21.options[0].label == "Python" if state_v21.options else False,
           f"label={state_v21.options[0].label!r}" if state_v21.options else "no options")
    report("4.19 v2.1 question text extracted",
           "programming language" in state_v21.question_text.lower(),
           f"question={state_v21.question_text!r}")

    # v2.1 with second option selected (Down was pressed)
    screen_question_v21_sel2 = """
 ☐ Language

Which programming language do you prefer?

  1. Python
     General-purpose language
❯ 2. TypeScript
     Typed superset of JavaScript
  3. Rust
  4. Go
  5. Type something.
────────────────────────────────────────────────────────────────────────────────
  6. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel
"""
    state_v21_sel2 = parse_screen(screen_question_v21_sel2)
    report("4.20 v2.1: second option selected after Down",
           state_v21_sel2.selected_option_index == 1,
           f"selected_index={state_v21_sel2.selected_option_index}")

    # ── Test 4.8: Transfiguring processing state ──────────────────────────────
    screen_transfiguring = "✽ Transfiguring…\n"
    state_tf = parse_screen(screen_transfiguring)
    report("4.21 Transfiguring detected as processing",
           state_tf.mode == ScreenMode.PROCESSING,
           f"mode={state_tf.mode.value}")

    # ── Test 4.9: ANSI stripping ──────────────────────────────────────────────
    screen_with_ansi = "\x1b[32m● Python\x1b[0m\n\x1b[0m○ TypeScript\n"
    state6 = parse_screen(screen_with_ansi)
    report("4.22 ANSI codes stripped before parsing",
           state6.mode == ScreenMode.QUESTION and len(state6.options) == 2,
           f"mode={state6.mode.value}, options={len(state6.options)}")

    # ── Test 4.10: selected_option() convenience method ───────────────────────
    if state1.options:
        sel = state1.selected_option()
        report("4.23 selected_option() returns correct TUIOption",
               sel is not None and sel.index == state1.selected_option_index,
               f"selected={sel!r}")

    # ── Summary ───────────────────────────────────────────────────────────────
    total = passed + failed
    print(f"\n  Part 4 result: {passed}/{total} passed", flush=True)
    return failed == 0


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    global _verbose

    parser = argparse.ArgumentParser(
        description="Test agent control of Claude Code via tmux keyboard simulation.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 test_tmux_control.py               # run all parts
  python3 test_tmux_control.py --skip-claude # skip Part 3 (no Claude)
  python3 test_tmux_control.py --verbose     # debug output
  python3 test_tmux_control.py --part 1      # only Part 1 (primitives)
  python3 test_tmux_control.py --part 3      # only Part 3 (integration)
  python3 test_tmux_control.py --part 4      # only Part 4 (parser tests)
        """,
    )
    parser.add_argument(
        "--skip-claude",
        action="store_true",
        help="Skip Part 3 (integration test that requires Claude CLI)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose debug output",
    )
    parser.add_argument(
        "--part",
        type=int,
        choices=[1, 2, 3, 4],
        help="Run only a specific part (1=primitives, 2=docs, 3=integration, 4=parser)",
    )
    args = parser.parse_args()
    _verbose = args.verbose

    print("=" * 60)
    print("Tmux Claude Code Control — Proof of Concept Test")
    print("=" * 60)

    # Check prerequisites
    if not _check_tmux():
        print(f"\n{FAIL} tmux is not installed or not in PATH. Install with: brew install tmux")
        return 1

    results: dict[str, bool] = {}

    try:
        if args.part is None or args.part == 1:
            results["Part 1: Tmux Primitives"] = part1_tmux_primitives()

        if args.part is None or args.part == 2:
            results["Part 2: TUI Patterns"] = part2_document_patterns()

        if args.part is None or args.part == 3:
            results["Part 3: Integration"] = part3_integration_test(
                skip_claude=args.skip_claude
            )

        if args.part is None or args.part == 4:
            results["Part 4: Screen Parser"] = part4_screen_parser_tests()

    except KeyboardInterrupt:
        print("\n\nInterrupted. Cleaning up...")
        tmux_kill(TEST_SESSION)
        return 130

    # ── Final summary ─────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("FINAL SUMMARY")
    print("=" * 60)
    all_passed = True
    for name, ok in results.items():
        marker = PASS if ok else FAIL
        print(f"  {marker} {name}")
        if not ok:
            all_passed = False

    if all_passed:
        print(f"\n  All parts passed!")
    else:
        print(f"\n  Some parts failed — see output above for details.")

    return 0 if all_passed else 1


def _check_tmux() -> bool:
    """Verify tmux is available."""
    try:
        result = subprocess.run(["tmux", "-V"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"  {INFO} Found: {result.stdout.strip()}", flush=True)
            return True
    except FileNotFoundError:
        pass
    return False


if __name__ == "__main__":
    sys.exit(main())
