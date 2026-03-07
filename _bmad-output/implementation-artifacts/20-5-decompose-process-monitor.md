# Story 20.5: Decompose process_monitor

Status: ready-for-dev

## Story

As a **maintainer**,
I want process_monitor.py decomposed into focused modules,
so that it stops being the last utility god file at 778 lines.

## Acceptance Criteria

### AC1: Config/Defaults Extracted

**Given** process_monitor.py contains env/config resolution logic (default model, timestamp parsing, etc.)
**When** the extraction is complete
**Then** config resolution logic lives in `mc/infrastructure/config.py` or a dedicated module
**And** process_monitor.py no longer owns config defaults

### AC2: Sync Utilities Extracted

**Given** process_monitor.py contains sync utilities (model tier sync, embedding model sync, skill distribution)
**When** the extraction is complete
**Then** sync utilities live in `mc/infrastructure/` or `mc/services/` as appropriate
**And** process_monitor.py delegates to these modules

### AC3: Cleanup Logic Extracted

**Given** process_monitor.py contains cleanup logic (deleted agent cleanup, archived file restoration)
**When** the extraction is complete
**Then** cleanup logic lives in a dedicated module
**And** process_monitor.py delegates to it

### AC4: process_monitor.py Reduced

**Given** the extractions are complete
**When** measuring process_monitor.py
**Then** it is under 300 lines
**And** it only contains orchestration/coordination logic, not implementation details

### AC5: No Behavior Change

**Given** this is a pure refactoring
**When** the decomposition is complete
**Then** all existing tests pass
**And** gateway startup behavior is identical
**And** agent sync, model tier sync, skill distribution all work the same

## Tasks / Subtasks

- [ ] **Task 1: Analyze process_monitor.py** (AC: #1, #2, #3)
  - [ ] 1.1 Read `mc/process_monitor.py` completely (778 lines)
  - [ ] 1.2 Categorize each function by responsibility:
    - Config/defaults (lines ~28-72)
    - Timestamp parsing (line ~112)
    - File I/O helpers (line ~138)
    - Session data reading (line ~149)
    - Archived file restoration (line ~175)
    - Agent cleanup (line ~202)
    - Bot identity fetching (line ~257)
    - Model tier sync (line ~321)
    - Embedding model sync (line ~392)
    - Skill distribution (line ~421)
  - [ ] 1.3 Map dependencies between functions

- [ ] **Task 2: Extract config/defaults** (AC: #1)
  - [ ] 2.1 Move config resolution to `mc/infrastructure/config.py`
  - [ ] 2.2 Move timestamp parsing to infrastructure
  - [ ] 2.3 Update imports in process_monitor.py

- [ ] **Task 3: Extract sync utilities** (AC: #2)
  - [ ] 3.1 Move model tier sync, embedding model sync, skill distribution to appropriate module
  - [ ] 3.2 Consider `mc/infrastructure/startup_sync.py` or similar
  - [ ] 3.3 Update imports

- [ ] **Task 4: Extract cleanup logic** (AC: #3)
  - [ ] 4.1 Move deleted agent cleanup, archived file restoration
  - [ ] 4.2 Update imports

- [ ] **Task 5: Verify agent_sync.py overlap** (AC: #4)
  - [ ] 5.1 Read `mc/agent_sync.py` (627 lines)
  - [ ] 5.2 Identify duplication with process_monitor.py and agent_bootstrap.py
  - [ ] 5.3 Consolidate if appropriate

- [ ] **Task 6: Verify and test** (AC: #5)
  - [ ] 6.1 Run `uv run pytest tests/`
  - [ ] 6.2 Verify process_monitor.py is under 300 lines
  - [ ] 6.3 Verify gateway startup still works

## Dev Notes

### Architecture Patterns

**process_monitor.py is a utility collection, not a domain owner.** It accumulated startup/sync logic over time. The goal is to distribute its contents to appropriate infrastructure/service modules.

**Existing infrastructure modules:**
- `mc/infrastructure/config.py` -- already exists, good home for config defaults
- `mc/infrastructure/agent_bootstrap.py` -- 867 lines, handles agent bootstrap
- `mc/agent_sync.py` -- 627 lines, may overlap with process_monitor

**Check for duplication:** agent_sync.py and agent_bootstrap.py may already contain similar logic. Consolidate rather than create new modules.

**Key Files to Read First:**
- `mc/process_monitor.py` -- the target (778 lines)
- `mc/agent_sync.py` -- potential overlap (627 lines)
- `mc/infrastructure/agent_bootstrap.py` -- potential overlap (867 lines)
- `mc/infrastructure/config.py` -- target for config extraction
- `mc/gateway.py` -- how process_monitor is used at startup

### Project Structure Notes

**Files to MODIFY:**
- `mc/process_monitor.py` -- reduce to coordinator
- `mc/infrastructure/config.py` -- receive config functions
- `mc/gateway.py` -- update imports if needed

**Files to CREATE:**
- `mc/infrastructure/startup_sync.py` (or similar) for sync utilities
- Potentially consolidate agent_sync.py content

### References

- [Source: mc/process_monitor.py] -- the god file to decompose
- [Source: mc/infrastructure/] -- target layer for extracted code
- [Source: docs/ARCHITECTURE.md] -- infrastructure layer description

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
