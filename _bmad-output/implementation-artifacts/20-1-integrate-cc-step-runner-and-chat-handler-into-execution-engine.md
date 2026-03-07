# Story 20.1: Integrate cc_step_runner and chat_handler into ExecutionEngine

Status: ready-for-dev

## Story

As a **maintainer**,
I want cc_step_runner and chat_handler to route execution through ExecutionEngine,
so that ExecutionEngine.run() is truly the sole execution path and the "single entrypoint" criterion is met.

## Acceptance Criteria

### AC1: cc_step_runner Uses ExecutionEngine

**Given** `mc/cc_step_runner.py` currently calls `_collect_output_artifacts()` and `_relocate_invalid_memory_files()` directly from executor
**When** the migration is complete
**Then** `execute_step_via_cc()` delegates to ExecutionEngine with a ClaudeCodeRunnerStrategy
**And** post-execution hooks (artifact collection, memory relocation) are handled by the engine's hook system
**And** no direct calls to executor private functions remain in cc_step_runner.py

### AC2: chat_handler Uses ExecutionEngine

**Given** `mc/chat_handler.py` currently runs a direct agent loop bypassing ExecutionEngine
**When** the migration is complete
**Then** chat-initiated execution flows through ExecutionEngine.run()
**And** the chat handler builds an ExecutionRequest with appropriate context
**And** post-execution hooks apply uniformly to chat-initiated execution
**And** session persistence across chat messages is preserved

### AC3: output_enricher Cleanup

**Given** `mc/output_enricher.py` contains a duplicate `_run_agent_on_task()` definition
**When** cleanup is complete
**Then** the duplicate is removed
**And** output_enricher uses the canonical path (runtime.py facade or ExecutionEngine)

### AC4: No Direct Executor Private Function Calls

**Given** the migration is complete
**When** scanning all production code (excluding tests)
**Then** no module outside of `mc/executor.py` and `mc/application/execution/runtime.py` calls:
- `executor._run_agent_on_task()`
- `executor._collect_output_artifacts()`
- `executor._relocate_invalid_memory_files()`
- `executor._background_tasks`
**And** architecture tests enforce this

### AC5: All Tests Pass

**Given** the migration is complete
**When** the full test suite runs
**Then** all existing tests pass
**And** new tests cover cc_step_runner and chat_handler ExecutionEngine integration

## Tasks / Subtasks

- [ ] **Task 1: Analyze current cc_step_runner** (AC: #1)
  - [ ] 1.1 Read `mc/cc_step_runner.py` completely
  - [ ] 1.2 Map all direct calls to executor private functions
  - [ ] 1.3 Identify how to build ExecutionRequest for CC step execution

- [ ] **Task 2: Migrate cc_step_runner to ExecutionEngine** (AC: #1)
  - [ ] 2.1 Replace direct executor calls with ExecutionEngine.run()
  - [ ] 2.2 Build proper ExecutionRequest with CC step context
  - [ ] 2.3 Ensure post-execution hooks handle artifact collection and memory relocation
  - [ ] 2.4 Write tests for the new path

- [ ] **Task 3: Analyze current chat_handler** (AC: #2)
  - [ ] 3.1 Read `mc/chat_handler.py` completely
  - [ ] 3.2 Map the direct agent loop execution path
  - [ ] 3.3 Understand session persistence requirements across chat messages
  - [ ] 3.4 Identify what ExecutionRequest fields are needed

- [ ] **Task 4: Migrate chat_handler to ExecutionEngine** (AC: #2)
  - [ ] 4.1 Build ExecutionRequest for chat-initiated execution
  - [ ] 4.2 Route execution through ExecutionEngine.run()
  - [ ] 4.3 Preserve session persistence across chat messages
  - [ ] 4.4 Write tests for chat_handler ExecutionEngine integration

- [ ] **Task 5: Clean up output_enricher** (AC: #3)
  - [ ] 5.1 Remove duplicate `_run_agent_on_task()` from output_enricher.py
  - [ ] 5.2 Route through canonical path

- [ ] **Task 6: Add architecture guardrail** (AC: #4)
  - [ ] 6.1 Add test to `tests/mc/test_architecture.py` prohibiting direct executor private function calls from production modules
  - [ ] 6.2 Verify the test catches violations and passes on clean code

- [ ] **Task 7: Full regression** (AC: #5)
  - [ ] 7.1 Run `uv run pytest tests/`
  - [ ] 7.2 Run dashboard tests
  - [ ] 7.3 Verify mention, chat, CC step scenarios work end-to-end

## Dev Notes

### Architecture Patterns

**ExecutionEngine is the single entrypoint.** All execution -- task, step, chat, CC -- must flow through `ExecutionEngine.run()`. The engine selects the appropriate RunnerStrategy and runs post-execution hooks uniformly.

**Chat handler special case:** Chat execution has session persistence across messages. The ExecutionRequest must carry session context, and the strategy must preserve it. This may require a new field on ExecutionRequest or a chat-specific strategy adapter.

**Key Files to Read First:**
- `mc/cc_step_runner.py` -- current CC step execution
- `mc/chat_handler.py` -- current chat execution
- `mc/output_enricher.py` -- duplicate code to clean
- `mc/application/execution/engine.py` -- ExecutionEngine
- `mc/application/execution/strategies/claude_code.py` -- CC strategy
- `mc/application/execution/request.py` -- ExecutionRequest model
- `mc/application/execution/runtime.py` -- runtime facades

### Project Structure Notes

**Files to MODIFY:**
- `mc/cc_step_runner.py` -- migrate to ExecutionEngine
- `mc/chat_handler.py` -- migrate to ExecutionEngine
- `mc/output_enricher.py` -- remove duplicate
- `tests/mc/test_architecture.py` -- add guardrail

**Files to CREATE:**
- Tests for new integration paths

### References

- [Source: mc/application/execution/engine.py] -- ExecutionEngine.run()
- [Source: mc/application/execution/strategies/] -- existing strategies
- [Source: docs/ARCHITECTURE.md] -- execution runtime section

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
