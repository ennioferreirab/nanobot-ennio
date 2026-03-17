# Architecture Convergence Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the current legacy ownership layers and compatibility wrappers so the codebase matches the intended backend `runtime/contexts/application/domain/infrastructure/bridge` architecture and the frontend feature-first architecture.

**Architecture:** Execute the migration in waves inside a dedicated git worktree. Each wave removes one category of architectural ambiguity, updates guardrails immediately, and ends with focused tests, architecture regression checks, `/code-review`, and a Playwright smoke pass before the next wave begins.

**Tech Stack:** Python, pytest, Next.js, React, TypeScript, Convex, Vitest, Playwright CLI, git worktrees

---

## Story Decomposition

- `21-1-freeze-architecture-migration-baseline`
- `21-2-make-conversation-own-ask-user-and-mentions`
- `21-3-absorb-services-and-workers-into-canonical-owners`
- `21-4-split-backend-runtime-and-execution-hotspots`
- `21-5-migrate-dashboard-tasks-boards-and-thread-ownership`
- `21-6-finish-dashboard-feature-ownership-migration`
- `21-7-remove-final-compatibility-layers-and-run-full-regression`

These stories are also tracked in `_bmad-output/implementation-artifacts/` and map one-to-one to the wave plan below.

---

### Task 1: Create the migration worktree and freeze the baseline

**Files:**
- Modify: `.gitignore`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `tests/mc/test_architecture.py`
- Modify: `tests/mc/test_module_reorganization.py`
- Modify: `dashboard/tests/architecture.test.ts`
- Create: `docs/plans/2026-03-11-architecture-convergence-design.md`
- Create: `docs/plans/2026-03-11-architecture-convergence-plan.md`

**Step 1: Verify the worktree directory is safe**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio
ls -d .worktrees
git check-ignore -q .worktrees
```

Expected: `.worktrees` exists and is ignored.

**Step 2: Create the dedicated migration worktree**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio
git worktree add .worktrees/architecture-convergence -b codex/architecture-convergence
```

Expected: a new worktree is created at `/Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence`.

**Step 3: Establish a clean baseline inside the worktree**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py -q
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run test:architecture
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run typecheck
```

Expected: the current architecture tests pass before any migration starts.

**Step 4: Tighten the guardrails before moving code**

Add assertions that:
- no new imports may target `mc/services`, `mc/workers`, `mc/ask_user`, `mc/mentions`
- no new dashboard feature code may be added under root `components/` or root `hooks/`
- `dashboard/components/*` wrappers are explicitly temporary and counted down

**Step 5: Run the updated guardrail suite**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py -q
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run test:architecture
```

Expected: PASS with stricter boundaries in place.

**Step 6: Commit the baseline freeze**

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git add .gitignore docs/ARCHITECTURE.md docs/plans tests/mc dashboard/tests/architecture.test.ts
git commit -m "chore: freeze architecture migration baseline"
```

### Task 2: Wave 1 - make conversation the only owner of ask-user and mentions

**Files:**
- Modify: `mc/contexts/conversation/__init__.py`
- Modify: `mc/contexts/conversation/service.py`
- Modify: `mc/contexts/conversation/intent.py`
- Modify: `mc/contexts/planning/negotiation.py`
- Modify: `mc/contexts/execution/executor.py`
- Modify: `mc/contexts/execution/cc_executor.py`
- Modify: `mc/application/execution/strategies/claude_code.py`
- Modify: `tests/mc/test_ask_user_handler.py`
- Modify: `tests/mc/test_ask_user_registry.py`
- Modify: `tests/mc/test_ask_user_watcher.py`
- Modify: `tests/mc/test_mention_handler.py`
- Modify: `tests/mc/test_mention_watcher_universal.py`
- Create: `mc/contexts/conversation/ask_user/service.py`
- Create: `mc/contexts/conversation/ask_user/registry.py`
- Create: `mc/contexts/conversation/ask_user/watcher.py`
- Create: `mc/contexts/conversation/mentions/service.py`
- Create: `mc/contexts/conversation/mentions/watcher.py`
- Delete: `mc/ask_user/__init__.py`
- Delete: `mc/ask_user/handler.py`
- Delete: `mc/ask_user/registry.py`
- Delete: `mc/ask_user/watcher.py`
- Delete: `mc/mentions/__init__.py`
- Delete: `mc/mentions/handler.py`
- Delete: `mc/mentions/watcher.py`
- Delete: `mc/contexts/conversation/ask_user/handler.py`
- Delete: `mc/contexts/conversation/mentions/handler.py`

**Step 1: Write the failing import-path tests**

Update the ask-user and mention tests so they import only from `mc.contexts.conversation.ask_user.*` and `mc.contexts.conversation.mentions.*`.

**Step 2: Run focused tests to capture the break**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_ask_user_handler.py tests/mc/test_ask_user_registry.py tests/mc/test_ask_user_watcher.py tests/mc/test_mention_handler.py tests/mc/test_mention_watcher_universal.py -q
```

Expected: FAIL before imports and ownership move.

**Step 3: Move concrete behavior into conversation-owned modules**

- move real handler/registry/watcher logic into `mc.contexts.conversation.ask_user.*`
- move real mention handling/watching logic into `mc.contexts.conversation.mentions.*`
- update planning, execution, and conversation import sites to use the canonical paths
- remove `sys.modules` compatibility bridges instead of relocating them

**Step 4: Re-run the focused backend suite**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_ask_user_handler.py tests/mc/test_ask_user_registry.py tests/mc/test_ask_user_watcher.py tests/mc/test_mention_handler.py tests/mc/test_mention_watcher_universal.py tests/mc/services/test_conversation.py tests/mc/services/test_conversation_intent.py -q
```

Expected: PASS with canonical imports only.

**Step 5: Run Wave 1 exit gate**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py -q
```

Expected: PASS and no remaining imports from deleted conversation legacy modules.

**Step 6: Request review and close the wave**

Run: `/code-review`

Expected: no critical or important findings remain on the Wave 1 diff.

**Step 7: Commit Wave 1**

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git add mc/contexts/conversation mc/contexts/planning mc/contexts/execution mc/application/execution tests/mc docs/ARCHITECTURE.md
git commit -m "refactor: make conversation own ask-user and mentions"
```

### Task 3: Wave 2 - absorb services and workers into canonical owners

**Files:**
- Modify: `mc/runtime/orchestrator.py`
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/runtime/workers/__init__.py`
- Modify: `mc/contexts/agents/sync.py`
- Modify: `mc/contexts/planning/negotiation.py`
- Modify: `mc/contexts/execution/crash_recovery.py`
- Modify: `mc/contexts/conversation/service.py`
- Modify: `tests/mc/test_process_monitor_decomposition.py`
- Modify: `tests/mc/test_module_reorganization.py`
- Modify: `tests/mc/workers/test_inbox.py`
- Modify: `tests/mc/workers/test_planning.py`
- Modify: `tests/mc/workers/test_review.py`
- Modify: `tests/mc/workers/test_kickoff.py`
- Create: `mc/runtime/workers/inbox.py`
- Create: `mc/runtime/workers/planning.py`
- Create: `mc/runtime/workers/review.py`
- Create: `mc/runtime/workers/kickoff.py`
- Delete: `mc/services/__init__.py`
- Delete: `mc/services/agent_sync.py`
- Delete: `mc/services/conversation.py`
- Delete: `mc/services/conversation_intent.py`
- Delete: `mc/services/crash_recovery.py`
- Delete: `mc/services/plan_negotiation.py`
- Delete: `mc/workers/__init__.py`
- Delete: `mc/workers/inbox.py`
- Delete: `mc/workers/planning.py`
- Delete: `mc/workers/review.py`
- Delete: `mc/workers/kickoff.py`

**Step 1: Write the failing import cleanup tests**

Update `tests/mc/test_module_reorganization.py` and worker tests to remove all accepted imports from `mc.services.*` and `mc.workers.*`.

**Step 2: Run focused tests to prove the old ownership is still active**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_module_reorganization.py tests/mc/test_process_monitor_decomposition.py tests/mc/workers/test_inbox.py tests/mc/workers/test_planning.py tests/mc/workers/test_review.py tests/mc/workers/test_kickoff.py -q
```

Expected: FAIL before service and worker absorption is complete.

**Step 3: Move concrete module bodies to canonical destinations**

- move worker implementations under `mc/runtime/workers/*`
- absorb service modules into owning contexts
- update `mc/runtime/gateway.py` and `mc/runtime/orchestrator.py` to compose only canonical modules
- delete the legacy `services` and `workers` packages after imports are rewritten

**Step 4: Re-run focused runtime and context tests**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_module_reorganization.py tests/mc/test_process_monitor_decomposition.py tests/mc/workers/test_inbox.py tests/mc/workers/test_planning.py tests/mc/workers/test_review.py tests/mc/workers/test_kickoff.py tests/mc/services/test_agent_sync.py tests/mc/services/test_plan_negotiation.py -q
```

Expected: PASS with canonical modules only.

**Step 5: Run Wave 2 exit gate**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py -q
```

Expected: PASS and no lingering `mc.services` or `mc.workers` imports.

**Step 6: Request review and close the wave**

Run: `/code-review`

Expected: the diff is clear on ownership and free of new circular dependencies.

**Step 7: Commit Wave 2**

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git add mc/runtime mc/contexts tests/mc docs/ARCHITECTURE.md
git commit -m "refactor: absorb services and workers into canonical owners"
```

### Task 4: Wave 3 - split the backend hotspots by responsibility

**Files:**
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/runtime/orchestrator.py`
- Modify: `mc/bridge/__init__.py`
- Modify: `mc/contexts/execution/executor.py`
- Modify: `mc/application/execution/context_builder.py`
- Modify: `mc/application/execution/runtime.py`
- Modify: `tests/mc/test_gateway.py`
- Modify: `tests/mc/test_architecture.py`
- Create: `mc/runtime/polling_settings.py`
- Create: `mc/runtime/cron_delivery.py`
- Create: `mc/runtime/task_requeue.py`
- Create: `mc/bridge/facade.py`
- Create: `mc/bridge/repositories/settings.py`
- Create: `mc/contexts/execution/agent_runner.py`
- Create: `mc/contexts/execution/provider_errors.py`
- Create: `mc/contexts/execution/session_keys.py`
- Create: `mc/contexts/execution/message_builder.py`

**Step 1: Lock the refactor shape in tests**

Add or update architecture assertions for:
- smaller gateway responsibilities
- no generic helper leakage from `executor.py`
- reduced `mc.bridge.__init__` facade surface

**Step 2: Run hotspot-focused tests to capture failures**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_gateway.py tests/mc/test_architecture.py tests/mc/test_thread_context.py tests/mc/test_process_monitor_decomposition.py -q
```

Expected: FAIL before the splits are wired.

**Step 3: Split the hotspots**

- move polling/settings reads out of `gateway.py`
- move cron delivery and task requeue helpers out of `gateway.py`
- move provider error policy, task message building, session key generation, and agent-run plumbing out of `executor.py`
- shrink `mc/bridge.__init__` into a thin package facade over focused repositories and adapters

**Step 4: Re-run focused backend tests**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc/test_gateway.py tests/mc/test_architecture.py tests/mc/test_thread_context.py tests/mc/test_process_monitor_decomposition.py tests/mc/test_task_state_machine.py tests/mc/test_step_state_machine.py -q
```

Expected: PASS with reduced hotspot modules.

**Step 5: Run Wave 3 exit gate**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests/mc -q
```

Expected: PASS across the backend test suite.

**Step 6: Request review and close the wave**

Run: `/code-review`

Expected: reviewer confirms improved cohesion and no hidden runtime regressions.

**Step 7: Commit Wave 3**

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git add mc/runtime mc/bridge mc/contexts/execution mc/application/execution tests/mc docs/ARCHITECTURE.md
git commit -m "refactor: split backend execution and runtime hotspots"
```

### Task 5: Wave 4 - migrate dashboard ownership for tasks, boards, and thread

**Files:**
- Modify: `dashboard/app/page.tsx`
- Modify: `dashboard/components/DashboardLayout.tsx`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Modify: `dashboard/features/tasks/components/TaskCard.tsx`
- Modify: `dashboard/features/tasks/components/ExecutionPlanTab.tsx`
- Modify: `dashboard/features/tasks/components/PlanReviewPanel.tsx`
- Modify: `dashboard/features/tasks/components/TaskInput.tsx`
- Modify: `dashboard/features/tasks/hooks/useTaskDetailView.ts`
- Modify: `dashboard/features/tasks/hooks/useTaskDetailActions.ts`
- Modify: `dashboard/features/boards/components/KanbanBoard.tsx`
- Modify: `dashboard/features/boards/hooks/useBoardView.ts`
- Modify: `dashboard/features/thread/components/ThreadInput.tsx`
- Modify: `dashboard/features/thread/components/ThreadMessage.tsx`
- Modify: `dashboard/features/thread/hooks/useThreadInputController.ts`
- Modify: `dashboard/tests/architecture.test.ts`
- Modify: `dashboard/components/TaskDetailSheet.tsx`
- Modify: `dashboard/components/TaskCard.tsx`
- Modify: `dashboard/components/ExecutionPlanTab.tsx`
- Modify: `dashboard/components/TaskInput.tsx`
- Modify: `dashboard/components/KanbanBoard.tsx`
- Modify: `dashboard/components/ThreadInput.tsx`
- Modify: `dashboard/components/ThreadMessage.tsx`
- Create: `dashboard/features/tasks/components/task-detail/TaskDetailHeader.tsx`
- Create: `dashboard/features/tasks/components/task-detail/TaskDetailFiles.tsx`
- Create: `dashboard/features/tasks/components/task-detail/TaskDetailThread.tsx`
- Create: `dashboard/features/tasks/hooks/useTaskDetailMutations.ts`
- Create: `dashboard/features/tasks/lib/taskStatusSelectors.ts`
- Delete: `dashboard/components/TaskDetailSheet.tsx`
- Delete: `dashboard/components/TaskCard.tsx`
- Delete: `dashboard/components/ExecutionPlanTab.tsx`
- Delete: `dashboard/components/TaskInput.tsx`
- Delete: `dashboard/components/KanbanBoard.tsx`
- Delete: `dashboard/components/ThreadInput.tsx`
- Delete: `dashboard/components/ThreadMessage.tsx`

**Step 1: Write the failing frontend boundary tests**

Update architecture and component tests so they import the feature-owned paths directly and fail if root wrappers remain.

**Step 2: Run focused frontend tests to capture current leakage**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard
npm run test -- TaskDetailSheet
npm run test -- TaskCard
npm run test -- ExecutionPlanTab
npm run test -- KanbanBoard
npm run test:architecture
```

Expected: FAIL before the feature-owned composition is complete.

**Step 3: Split and migrate the task-heavy UI**

- break `TaskDetailSheet` into feature-local subcomponents
- remove direct `convex/react` calls from feature components and move them behind feature hooks
- make `DashboardLayout` compose feature entry points instead of root wrapper aliases
- delete the root wrapper files once imports are rewritten

**Step 4: Re-run focused frontend tests**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard
npm run test -- TaskDetailSheet
npm run test -- TaskCard
npm run test -- ExecutionPlanTab
npm run test -- KanbanBoard
npm run test -- ThreadInput
npm run typecheck
npm run test:architecture
```

Expected: PASS with feature-owned imports only.

**Step 5: Run Wave 4 exit gate**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard
npm run lint
npm run typecheck
npm run test
npm run test:architecture
```

Expected: PASS across the dashboard suite.

**Step 6: Request review and run Playwright smoke**

Run: `/code-review`

Then run:

```bash
command -v npx
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run predev
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && PORT=3001 npm run dev:frontend
"$PWCLI" open http://127.0.0.1:3001 --headed
"$PWCLI" snapshot
```

Validate manually through Playwright snapshot/interaction that:
- the dashboard loads
- the board renders
- opening a task still opens the task detail sheet
- thread input and plan tab are reachable

**Step 7: Commit Wave 4**

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git add dashboard/app dashboard/features dashboard/tests
git commit -m "refactor: move core dashboard flows to feature ownership"
```

### Task 6: Wave 5 - finish feature ownership for the remaining dashboard areas

**Files:**
- Modify: `dashboard/components/DashboardLayout.tsx`
- Modify: `dashboard/components/AgentSidebar.tsx`
- Modify: `dashboard/components/ActivityFeedPanel.tsx`
- Modify: `dashboard/components/BoardSelector.tsx`
- Modify: `dashboard/components/BoardSettingsSheet.tsx`
- Modify: `dashboard/components/SettingsPanel.tsx`
- Modify: `dashboard/components/TagsPanel.tsx`
- Modify: `dashboard/components/SearchBar.tsx`
- Modify: `dashboard/components/AgentConfigSheet.tsx`
- Modify: `dashboard/components/AgentSidebarItem.tsx`
- Modify: `dashboard/hooks/useAgentConfigSheetData.ts`
- Modify: `dashboard/hooks/useAgentSidebarItemState.ts`
- Modify: `dashboard/hooks/useSearchBarFilters.ts`
- Modify: `dashboard/hooks/useTagsPanelData.ts`
- Modify: `dashboard/hooks/useBoardView.ts`
- Modify: `dashboard/tests/architecture.test.ts`
- Create: `dashboard/features/agents/components/AgentSidebar.tsx`
- Create: `dashboard/features/activity/components/ActivityFeedPanel.tsx`
- Create: `dashboard/features/settings/components/TagsDrawer.tsx`
- Delete: `dashboard/components/AgentConfigSheet.tsx`
- Delete: `dashboard/components/AgentSidebarItem.tsx`
- Delete: `dashboard/components/SearchBar.tsx`
- Delete: `dashboard/components/SettingsPanel.tsx`
- Delete: `dashboard/components/TagsPanel.tsx`
- Delete: `dashboard/hooks/useAgentConfigSheetData.ts`
- Delete: `dashboard/hooks/useAgentSidebarItemState.ts`
- Delete: `dashboard/hooks/useSearchBarFilters.ts`
- Delete: `dashboard/hooks/useTagsPanelData.ts`
- Delete: `dashboard/hooks/useBoardView.ts`

**Step 1: Lock the remaining wrappers out through tests**

Update `dashboard/tests/architecture.test.ts` so the remaining root component and root hook wrappers are forbidden instead of merely tolerated.

**Step 2: Run focused frontend tests before the move**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard
npm run test -- AgentConfigSheet
npm run test -- AgentSidebarItem
npm run test -- SearchBar
npm run test -- SettingsPanel
npm run test:architecture
```

Expected: FAIL until all wrappers are removed.

**Step 3: Move all remaining feature entry points to their owning features**

- make `DashboardLayout` import feature modules directly
- move remaining feature logic out of root `components/` and `hooks/`
- leave only `components/ui/*`, `components/viewers/*`, and truly shared non-feature helpers

**Step 4: Re-run the frontend suite**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard
npm run lint
npm run typecheck
npm run test
npm run test:architecture
```

Expected: PASS and root wrappers are gone.

**Step 5: Request review and run Playwright smoke**

Run: `/code-review`

Then use Playwright to validate:
- settings opens
- tags panel opens
- search works
- agent sidebar remains functional

**Step 6: Commit Wave 5**

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git add dashboard/app dashboard/features dashboard/components dashboard/hooks dashboard/tests
git commit -m "refactor: finish dashboard feature ownership migration"
```

### Task 7: Wave 6 - delete final compatibility layers and tighten the permanent guardrails

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `tests/mc/test_architecture.py`
- Modify: `tests/mc/test_module_reorganization.py`
- Modify: `dashboard/tests/architecture.test.ts`
- Modify: `README.md`
- Delete: any remaining compatibility-only backend or frontend wrappers discovered in Waves 1-5

**Step 1: Convert the transitional assertions into permanent rules**

Make the tests fail on:
- any import from removed backend namespaces
- any import from deleted root dashboard feature wrappers
- any new direct feature component dependency on `convex/react`

**Step 2: Run the full repository regression**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
uv run pytest tests -q
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run lint
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run typecheck
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run test
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence/dashboard && npm run test:architecture
```

Expected: PASS with no transitional exceptions left.

**Step 3: Run final `/code-review`**

Run: `/code-review`

Expected: no remaining critical or important findings on the migration branch.

**Step 4: Run final Playwright regression**

Use Playwright to smoke the main dashboard flow end-to-end:
- load board
- open task
- switch between thread and plan
- open settings/tags/search
- confirm no obvious routing or hydration regression

**Step 5: Commit the final cleanup**

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git add docs/ARCHITECTURE.md README.md tests dashboard
git commit -m "refactor: remove final architecture compatibility layers"
```

### Task 8: Finish the branch and prepare integration

**Files:**
- Modify: none required beyond the wave commits

**Step 1: Capture the final verification summary**

Record:
- backend test result
- frontend lint/typecheck/test result
- architecture test result
- `/code-review` outcome
- Playwright smoke outcome

**Step 2: Review the branch history for wave-by-wave clarity**

Run:

```bash
cd /Users/ennio/Documents/nanobot-ennio/.worktrees/architecture-convergence
git log --oneline --decorate --graph -n 20
```

Expected: the branch history reflects the wave structure cleanly.

**Step 3: Merge prep**

Prepare either:
- a direct merge if the branch is intentionally short-lived, or
- a PR description organized by waves and architectural outcomes

**Step 4: Close the worktree only after integration**

Run after merge only:

```bash
cd /Users/ennio/Documents/nanobot-ennio
git worktree remove .worktrees/architecture-convergence
```

Expected: the dedicated migration workspace is removed only after the branch is safely integrated.

---

Plan complete and saved to `docs/plans/2026-03-11-architecture-convergence-plan.md`.

Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
