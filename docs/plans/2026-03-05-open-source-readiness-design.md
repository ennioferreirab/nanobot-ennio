# Design: Open-Source Readiness — nanobot-mcontrol

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Prepare the nanobot-ennio repo for public GitHub release as `nanobot-mcontrol`

## Context

The `mc/` (Mission Control) package is a multi-agent orchestration platform built on top of nanobot. It has ~29k lines of Python across 49 source files, 1082 passing tests (99.9%), and a Next.js + Convex dashboard frontend.

A comprehensive 7-domain audit identified the following areas requiring attention before open-sourcing:

- 2 critical secrets in committed files
- 8 god files (>500 LOC), with executor.py at 2130 LOC
- No defined public API (`__all__` missing)
- Missing documentation (no ARCHITECTURE.md, CONTRIBUTING.md, CHANGELOG.md)
- 14 source files with zero test coverage
- Package named with personal identifier
- 1.1GB+ of build artifacts (node_modules, .next) in git history

## Decisions

- **Distribution:** GitHub open-source only (no PyPI)
- **Vendor code:** Stays in repo (`vendor/`), documented via PATCHES.md
- **God files:** Split before publishing
- **CLAUDE.md:** Backup current, rewrite for public use (BMad structure, gpt-5.4 + claude-sonnet-4-6)
- **Dashboard:** Included in scope, documented in centralized README.md
- **Package name:** `nanobot-mcontrol`
- **Priority order:** Code cleanup → Documentation → Tests

---

## Phase 1 — Security & Hygiene

Pre-requisite phase. Blocks all other work.

### 1.1 Secrets & Sensitive Data

- Delete `dashboard/.env.local` (contains real Convex admin key and deployment URL)
- Add `.env.local` to `.gitignore`
- Remove `dashboard/.env.local` from git cache and history
- Rotate the Convex admin key (`rugged-mink-369`) in the Convex dashboard
- Verify git history has no other committed secrets: `git log -S "rugged-mink" --oneline`

### 1.2 Git History Cleanup

- Clean `node_modules/`, `.next/`, `convex-full-backup.zip` from git history (BFG Repo-Cleaner)
- Update `.gitignore` with: `node_modules/`, `.next/`, `*.zip`, `.env.local`

### 1.3 Internal References

- Remove ticket references from TODOs:
  - `mc/chat_handler.py:9` — `CC-6 H2` → plain English
  - `mc/gateway.py:274` — `CC-6 H1` → plain English
- Update test credentials:
  - `tests/test_email_channel.py` — `"secret"` → `"test-password"`
  - `tests/mc/test_bridge.py` — `"secret123"` → `"test-admin-key"`

### 1.4 Rename Package

- Change `name` in `pyproject.toml` from `nanobot-ennio` to `nanobot-mcontrol`
- Update any internal references to the old name

---

## Phase 2 — Code Refactoring

Priority: code clarity and maintainability for external contributors.

### 2.1 Split God Files

| Current file | LOC | Split into |
|---|---|---|
| `executor.py` | 2130 | `mc/executor.py` (task execution core), `mc/cc_executor.py` (Claude Code integration), `mc/output_enricher.py` (file uploads, output formatting) |
| `gateway.py` | 1523 | `mc/gateway.py` (main loop, agent sync), `mc/process_monitor.py` (subprocess monitoring, crash detection) |
| `cli.py` | 1548 | `mc/cli.py` (core: start/stop/status/logs), `mc/cli_agents.py` (agent management), `mc/cli_config.py` (config/model management) |
| `bridge.py` | 1023 | `mc/bridge.py` (core read/write), `mc/bridge_subscriptions.py` (subscriptions + sync ops) |
| `planner.py` | 851 | `mc/planner.py` (LLM decomposition), `mc/plan_parser.py` (extraction/parsing helpers) |

Files kept as-is (cohesion is acceptable):
- `step_dispatcher.py` (807 LOC) — single responsibility
- `orchestrator.py` (883 LOC) — routing logic is cohesive

### 2.2 Group Related Modules into Sub-packages

```
mc/ask_user/
  __init__.py       # re-exports
  handler.py        # <- ask_user_handler.py
  registry.py       # <- ask_user_registry.py
  watcher.py        # <- ask_user_watcher.py

mc/mentions/
  __init__.py       # re-exports
  handler.py        # <- mention_handler.py
  watcher.py        # <- mention_watcher.py
```

### 2.3 Define Public API

- Add `__all__` to `mc/__init__.py` listing public types, enums, and classes
- Add `__all__` to `mc/hooks/__init__.py` if hooks are meant for extension
- Add return type hints to 12+ functions in `cli.py` and `agent_assist.py`

### 2.4 Code Cleanup

- Remove ~10 unused imports:
  - `mc/chat_handler.py` — `datetime`, `timezone`
  - `mc/executor.py` — `CCTaskResult`
  - `mc/types.py` — `Path`
  - `mc/mention_handler.py` — `LEAD_AGENT_NAME`
  - `mc/plan_negotiator.py` — `LEAD_AGENT_NAME`, `ConvexBridge`
- Extract `_as_positive_int()` (duplicated in 4 files) to `mc/utils.py`
- Extract magic numbers from `memory/index.py` (chunk_size=500, overlap=50) to named constants
- Rename `orientation.py` → `agent_orientation.py`
- Replace inheritance with composition in `HybridMemoryStore` (`mc/memory/store.py`)
- Add comment `# CC = Claude Code` at first occurrence of the CC_ prefix

---

## Phase 3 — Documentation

### 3.1 CLAUDE.md

- Backup current as `CLAUDE.md.bkp` (add to `.gitignore`)
- Rewrite with:
  - BMad workflow structure (without internal workflow details)
  - Dev agent models: `gpt-5.4` and `claude-sonnet-4-6`; Opus as orchestrator/reviewer
  - Python environment: `uv run python`, `uv run pytest`, `uv` as package manager
  - Project structure: `mc/`, `vendor/`, `dashboard/`, `boot.py`
  - Code conventions: ruff, type hints, snake_case

### 3.2 New Documentation Files

| File | Content |
|---|---|
| `docs/ARCHITECTURE.md` | Component diagram (Bridge, Orchestrator, Executor, Gateway, Memory, Hooks), data flow (task → plan → execute → complete), state machines, extension points |
| `CONTRIBUTING.md` | Setup (`uv sync`), code style (ruff), testing (`uv run pytest`), PR workflow, how to add agents/hooks |
| `CHANGELOG.md` | Version 0.1.0 with initial MC features |
| `KNOWN_ISSUES.md` | 3 pending TODOs + pre-existing test failures |

### 3.3 README.md (Centralized)

- Keep upstream nanobot section (provides context)
- Add dedicated "Mission Control" section:
  - What it is and what problem it solves
  - Main components
  - Quickstart (how to run)
  - Link to ARCHITECTURE.md
- Add "Dashboard" section:
  - Setup (`npm install`, `npx convex dev`)
  - Structure overview
  - How it connects to the Python backend
- Add "Development" section with unified dev instructions

### 3.4 Docstrings

- Add module-level docstrings to the 31 files currently missing them (1-2 lines each)
- Add field-level docstrings to public dataclasses in `types.py`

---

## Phase 4 — Tests

### 4.1 Cover 14 Files with Zero Tests

| Priority | Source file | Test to create |
|---|---|---|
| CRITICAL | `mc/memory/policy.py` | `tests/mc/memory/test_policy.py` |
| CRITICAL | `mc/memory/service.py` | `tests/mc/memory/test_service.py` |
| HIGH | `mc/mention_watcher.py` | `tests/mc/test_mention_watcher.py` |
| HIGH | `mc/hooks/dispatcher.py` | `tests/mc/hooks/test_dispatcher.py` |
| HIGH | `mc/hooks/discovery.py` | `tests/mc/hooks/test_discovery.py` |
| HIGH | `mc/hooks/handler.py` | `tests/mc/hooks/test_handler.py` |
| MEDIUM | `mc/hooks/config.py` | `tests/mc/hooks/test_config.py` |
| MEDIUM | `mc/hooks/context.py` | `tests/mc/hooks/test_context.py` |
| MEDIUM | `mc/hooks/ipc_sync.py` | `tests/mc/hooks/test_ipc_sync.py` |
| MEDIUM | `mc/hooks/handlers/*.py` (4 files) | `tests/mc/hooks/handlers/test_*.py` |

### 4.2 Fix Existing Tests

- Fix `test_cli_tasks.py::test_create_with_title` — assertion expects "Status: inbox" not present in output
- Fix async mock warning in `executor.py:1659` — unawaited coroutine in `set_ask_user_handler`

### 4.3 Reorganize Test Files

Move 12 test files from `tests/` root to `tests/mc/`:
- `test_channel_manager_mc.py`, `test_cli_input.py`, `test_commands.py`
- `test_consolidate_offset.py`, `test_cron_commands.py`, `test_cron_service.py`, `test_cron_tool.py`
- `test_email_channel.py`, `test_filesystem_memory_guard.py`
- `test_init_wizard.py`, `test_mc_channel.py`, `test_tool_validation.py`

### 4.4 Improve Test Infrastructure

- Expand `tests/conftest.py` with shared fixtures (`mock_bridge`, `mock_task_data`, etc.)
- Replace `asyncio.sleep()` with events/conditions in timing-dependent tests

### 4.5 Dashboard Tests

- Verify `vitest` runs correctly after fresh `npm install`
- Document test commands in README.md

---

## Success Criteria

- Zero secrets or personal paths in the repository
- No file in `mc/` exceeds 600 LOC
- `__all__` defined in `mc/__init__.py` and all sub-packages
- ARCHITECTURE.md, CONTRIBUTING.md, CHANGELOG.md, README.md exist and are clear
- 1082+ tests passing, 0 failures
- 14 previously uncovered files have at least basic unit tests
- Package name = `nanobot-mcontrol` in pyproject.toml
- Git history clean of large artifacts (node_modules, .next, backups)
- CLAUDE.md rewritten for public use with BMad structure

---

## Audit Sources

This design is based on findings from 7 parallel investigation agents:

1. **Secrets Scanner** — 2 CRITICAL (Convex admin key, deployment URL), 2 HIGH (internal ticket refs)
2. **Dead Code Hunter** — ~10 unused imports, 2-3 code duplications, 0 dead classes
3. **Architecture Auditor** — 0 circular deps, 8 god files, CC coupling too tight, clean dependency direction
4. **API Surface Reviewer** — missing `__all__`, 12+ functions without type hints, sub-package opportunities
5. **Documentation Auditor** — missing ARCHITECTURE, CONTRIBUTING, CHANGELOG; 37% module docstring coverage
6. **Test Health Checker** — 1082 tests / 99.9% pass rate, 14 files with 0 coverage, 12 misplaced test files
7. **Packaging Auditor** — personal name in package, vendor deps not distributable, sys.path hack, 1.1GB artifacts
