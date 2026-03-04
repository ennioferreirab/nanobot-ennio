# Tmux Claude Code Control — Proof of Concept

This directory contains a standalone proof-of-concept showing how an agent
can control Claude Code's terminal UI (TUI) via tmux keyboard simulation.

## Overview

Claude Code runs as a rich TUI in the terminal. An agent can control it
entirely through tmux `send-keys`, without needing any API hooks or MCP
bridges. This approach works because:

1. tmux lets you create sessions, send keystrokes, and capture screen output
2. Claude Code's TUI renders to the terminal — tmux can capture it as text
3. The screen content can be parsed to determine what Claude is showing
4. Keystrokes can navigate options, confirm selections, and send messages

## Files

| File | Description |
|------|-------------|
| `test_tmux_control.py` | Main test script — four parts described below |
| `screen_parser.py` | Parses raw tmux capture output into structured ScreenState objects |
| `README.md` | This file |

## Running the Tests

```bash
# Run all parts (Parts 1, 2, 4 work without Claude)
python3 test_tmux_control.py

# Skip the integration test (no Claude CLI needed)
python3 test_tmux_control.py --skip-claude

# Verbose debug output
python3 test_tmux_control.py --verbose

# Run only Part 1 (tmux primitives)
python3 test_tmux_control.py --part 1

# Run only Part 3 (integration test, requires Claude)
python3 test_tmux_control.py --part 3

# Run only Part 4 (screen parser unit tests)
python3 test_tmux_control.py --part 4
```

### Requirements

- **tmux** — `brew install tmux` (macOS) or `apt install tmux` (Linux)
- **Python 3.8+** — system Python is fine for this standalone script
- **Claude CLI** — only for Part 3; install from https://claude.ai/code

## Test Parts

### Part 1: Tmux Primitives

Tests basic tmux operations without launching Claude:

- Create a tmux session
- Send text and verify it appears in the captured output
- Send special keys: Up, Down, Enter, Tab, Escape, Ctrl+C
- Send multi-key sequences
- Clean up sessions

These tests always run, even in CI, as long as tmux is installed.

### Part 2: TUI Interaction Patterns

Documents (in code comments and printed output) the exact keystroke patterns
for controlling Claude Code's TUI. No tests run — this is documentation only.

### Part 3: Integration Test

Full end-to-end test that:

1. Creates a tmux session named `test-claude-control`
2. Launches `claude --dangerously-skip-permissions`
3. Waits for Claude to display its idle input prompt
4. Sends a prompt asking Claude to use AskUserQuestion
5. Detects the AskUserQuestion TUI widget on screen
6. Navigates to option 2 (Down arrow once)
7. Presses Enter to select it
8. Captures Claude's response
9. Sends `/exit` to quit Claude
10. Kills the tmux session

Use `--skip-claude` to skip this part in CI.

### Part 4: Screen Parser Unit Tests

Tests the `screen_parser.py` module with synthetic screen captures:

- Detects AskUserQuestion question widget
- Counts and parses option labels
- Identifies the currently selected option (index)
- Detects permission prompts
- Detects processing/spinner states
- Detects idle input prompt
- Strips ANSI escape sequences before parsing

## TUI Interaction Patterns

### AskUserQuestion Widget

Claude Code renders AskUserQuestion as a box with radio-button options:

```
╭─ Question ─────────────────────────────────────╮
│ ? What programming language do you prefer?     │
│                                                 │
│   ● Python          ← currently selected       │
│   ○ TypeScript                                  │
│   ○ Rust                                        │
│   ○ Go                                          │
╰─────────────────────────────────────────────────╯
```

**Unicode glyphs:**
- `●` (U+25CF BLACK CIRCLE) — currently selected/highlighted option
- `○` (U+25CB WHITE CIRCLE) — unselected option
- `◉`, `◎`, `◈` — alternate selected glyphs (version dependent)
- `◯`, `◦`, `•` — alternate unselected glyphs

**Keystroke navigation:**

| Key | Effect |
|-----|--------|
| `Down` | Move highlight to next option (wraps) |
| `Up` | Move highlight to previous option (wraps) |
| `Enter` | Confirm currently highlighted option |
| `Escape` | Cancel / dismiss the widget |
| `Space` | Toggle option in multi-select mode |
| `Tab` | Sometimes cycles focus (version dependent) |

**To select option N (0-indexed):**
```
Send N "Down" keystrokes, then "Enter"
```

Example — select the 3rd option (index 2):
```python
tmux_key(session, "Down")   # move to index 1
tmux_key(session, "Down")   # move to index 2
tmux_key(session, "Enter")  # confirm
```

### Permission Prompts

Claude Code shows permission prompts when a tool needs authorization:

```
Claude wants to run: rm -rf /tmp/test_files

Allow? (Y/n)

❯ Yes, allow
  No, don't allow
  Always allow for this session
```

**Keystroke patterns:**

| Keys | Effect |
|------|--------|
| `y` + `Enter` | Allow (quick shortcut) |
| `n` + `Enter` | Deny |
| `Down` + `Enter` | Move cursor to next option, select |
| `Up` + `Enter` | Move cursor to previous option, select |

**Note:** Using `--dangerously-skip-permissions` when launching Claude
suppresses all permission prompts, which simplifies agent control.

### Sending a Message

When Claude shows the idle input prompt (`>` or `❯`):

```python
tmux_send(session, "Your message here")
tmux_key(session, "Enter")
```

Then wait for Claude to finish processing:

```python
state = wait_for_screen_condition(
    session,
    lambda s: s.mode == ScreenMode.IDLE,
    timeout=60.0,
)
```

### Exiting Claude Code

```python
tmux_send(session, "/exit")
tmux_key(session, "Enter")
time.sleep(2.0)
```

Claude also accepts `/quit` and `/q`.

## Screen Parser

`screen_parser.py` provides `parse_screen(captured_text: str) -> ScreenState`.

### ScreenMode Values

| Mode | Meaning |
|------|---------|
| `IDLE` | Claude is waiting for user input (shows `>` prompt) |
| `QUESTION` | AskUserQuestion TUI widget is visible |
| `PERMISSION` | Tool/bash permission prompt is visible |
| `PROCESSING` | Claude is generating a response (spinner or "Thinking...") |
| `UNKNOWN` | Could not determine the current state |

### ScreenState Fields

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `ScreenMode` | Current UI state |
| `raw_text` | `str` | ANSI-stripped screen text |
| `question_text` | `str` | The question being asked (if mode=QUESTION) |
| `options` | `list[TUIOption]` | Selectable options (QUESTION or PERMISSION) |
| `selected_option_index` | `int` | Index of highlighted option (0-based) |
| `prompt_text` | `str` | Text in input box (if mode=IDLE) |
| `permission_tool` | `str` | Tool name requesting permission |
| `is_multiselect` | `bool` | True if multi-select mode |

### Usage Example

```python
from screen_parser import parse_screen, ScreenMode

captured = subprocess.run(
    ["tmux", "capture-pane", "-t", "my-session:0", "-p", "-S", "-50"],
    capture_output=True, text=True
).stdout

state = parse_screen(captured)

if state.mode == ScreenMode.QUESTION:
    print(f"Question: {state.question_text}")
    for opt in state.options:
        print(f"  {opt}")  # prints ○/● [index] 'label'

    # Select option at index N: send N Down arrows then Enter
    target_index = 2
    for _ in range(target_index - state.selected_option_index):
        subprocess.run(["tmux", "send-keys", "-t", "my-session:0", "Down"])
    subprocess.run(["tmux", "send-keys", "-t", "my-session:0", "Enter"])
```

## tmux Command Reference

```bash
# Create new detached session
tmux new-session -d -s my-session

# Send text (no Enter)
tmux send-keys -t my-session:0 "hello world" ""

# Send named key
tmux send-keys -t my-session:0 "Enter"
tmux send-keys -t my-session:0 "Down"
tmux send-keys -t my-session:0 "Up"
tmux send-keys -t my-session:0 "Tab"
tmux send-keys -t my-session:0 "Escape"
tmux send-keys -t my-session:0 "C-c"

# Capture screen content (last 50 lines)
tmux capture-pane -t my-session:0 -p -S -50

# Check if session exists
tmux has-session -t my-session

# Kill session
tmux kill-session -t my-session

# Attach to session (for manual inspection)
tmux attach -t my-session
```

## Architecture

```
Agent
  |
  | subprocess.run(["tmux", "send-keys", ...])
  v
tmux session
  |
  | PTY (pseudo-terminal)
  v
Claude Code TUI (ink-based React)
  |
  | renders to terminal
  v
tmux capture-pane output
  |
  | parse_screen()
  v
ScreenState (mode, options, selected_index, ...)
  |
  | agent logic
  v
next tmux send-keys
```

The loop is:
1. Capture screen → parse state
2. Decide what keystroke to send based on state
3. Send keystroke via `tmux send-keys`
4. Wait for re-render (50-300ms)
5. Repeat from 1

## Timing Notes

- Claude's TUI re-renders in ~50-150ms after a keystroke
- Claude's AI response can take 5-90 seconds
- `RENDER_WAIT = 0.3` seconds is a safe delay after navigation keystrokes
- `RESPONSE_TIMEOUT = 90.0` seconds is the maximum wait for a response
- Use `wait_for_screen_condition()` rather than fixed sleeps for response detection

## Limitations

- **Fragile to UI changes**: The parser uses text pattern matching. If Anthropic
  changes Claude Code's TUI layout or glyph choices, the parser may need updates.
- **Race conditions**: If Claude renders very slowly, a `0.3s` delay may not be
  enough. Adjust `RENDER_WAIT` if navigation seems unreliable.
- **No scroll back**: `tmux capture-pane -S -50` only captures 50 lines of
  scrollback. For very long responses, increase the `-S` value.
- **ANSI codes**: Some terminals/configurations emit complex ANSI sequences.
  The regex stripper handles common cases but may miss unusual codes.

## Related Files

- `/Users/ennio/Documents/nanobot-ennio/terminal_bridge.py` — production bridge
  using the same tmux primitives, connected to Convex DB
- `/Users/ennio/Documents/nanobot-ennio/.claude/ask-bridge/server.mjs` — MCP
  server approach for intercepting AskUserQuestion at the tool level
- `/Users/ennio/Documents/nanobot-ennio/_test_permission_bridge/` — tests for
  the `--permission-prompt-tool` MCP interception approach
