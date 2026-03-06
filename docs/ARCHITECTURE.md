# Architecture

## Overview

nanobot-mcontrol is a multi-agent orchestration platform that coordinates autonomous AI agents through a centralized Mission Control (MC) layer. It solves the problem of decomposing complex user tasks into structured execution plans, routing each step to the most appropriate specialist agent, and managing the full lifecycle of task execution -- from planning through completion, review, and crash recovery.

The system follows a hub-and-spoke architecture where a React/Next.js dashboard communicates with a Convex real-time backend, which in turn is bridged to a Python-side gateway process. The gateway runs persistent async loops that subscribe to Convex state changes, plan tasks via LLM reasoning, dispatch steps to agents, and monitor execution. Agents can run on either the nanobot runtime (LiteLLM-based) or the Claude Code CLI backend, with the choice determined by per-agent configuration.

A key architectural invariant is the **pure orchestrator pattern**: the Lead Agent plans but never executes. All execution is delegated to specialist agents or the fallback `nanobot` agent. This separation ensures clean planning/execution boundaries and prevents circular delegation.

## System Diagram

```
 +---------------------+
 |     Dashboard        |  Next.js + React
 |  (TypeScript/Convex) |
 +----------+----------+
            |
            | Real-time subscriptions + mutations
            |
 +----------v----------+
 |       Convex         |  Serverless backend
 |   (Tasks, Steps,     |  (schema.ts)
 |   Agents, Messages,  |
 |   Activities, Boards) |
 +----------+----------+
            |
            | Python SDK (ConvexClient)
            |
 +----------v----------+
 |    ConvexBridge      |  mc/bridge.py
 |  (single integration |  snake_case <-> camelCase
 |   point, retry,      |  retry + backoff
 |   key conversion)    |
 +----------+----------+
            |
            | async_subscribe / mutation
            |
 +----------v-------------------------------------------+
 |                  Agent Gateway                        |
 |                  mc/gateway.py                        |
 |                                                       |
 |  +-------------+  +--------------+  +-------------+  |
 |  | Orchestrator |  |   Executor   |  |  Timeout    |  |
 |  | (planning,   |  | (task exec,  |  |  Checker    |  |
 |  |  review,     |  |  CC backend) |  +-------------+  |
 |  |  kickoff)    |  +--------------+                   |
 |  +-------------+  +--------------+  +-------------+  |
 |  | Step         |  | Chat Handler |  | Mention     |  |
 |  | Dispatcher   |  |              |  | Watcher     |  |
 |  +--------------+  +--------------+  +-------------+  |
 |  +--------------+  +--------------+  +-------------+  |
 |  | Plan         |  | Cron Service |  | Ask-User    |  |
 |  | Negotiator   |  |              |  | Watcher     |  |
 |  +--------------+  +--------------+  +-------------+  |
 +-------------------------------------------------------+
            |                    |
            v                    v
 +------------------+   +------------------+
 |  nanobot runtime  |   |  Claude Code CLI  |
 |  (LiteLLM-based)  |   |  (IPC + subprocess|
 |                    |   |   via vendor/cc)   |
 +------------------+   +------------------+
            |                    |
            v                    v
 +------------------+   +------------------+
 |  Memory Subsystem |   |  Memory Subsystem |
 |  (Hybrid BM25 +   |   |  (CC workspace    |
 |   vector search)  |   |   consolidation)  |
 +------------------+   +------------------+
```

## Core Components

### ConvexBridge (`mc/bridge.py`, `mc/bridge_subscriptions.py`)

The ConvexBridge is the **single integration point** between the Python runtime and the Convex backend. No other module imports the `convex` Python SDK directly. It provides:

- **Query/Mutation methods** with automatic snake_case-to-camelCase key conversion (and vice versa for responses).
- **Retry with exponential backoff** on mutations (up to 3 retries with 1s/2s/4s delays). On exhaustion, writes a `system_error` activity event as best-effort.
- **Subscription polling** via the `ConvexBridgeSubscriptionsMixin` (in `bridge_subscriptions.py`), which exposes `async_subscribe()` returning `asyncio.Queue` instances for reactive state observation.
- **Domain-specific helpers**: `update_task_status`, `update_agent_status`, `create_activity`, `send_message`, `post_step_completion`, `batch_create_steps`, `kick_off_task`, `approve_and_kick_off`, and task directory creation.
- **Chat helpers** for direct agent-to-user conversations (Story 10.2).

### Agent Gateway (`mc/gateway.py`, `mc/process_monitor.py`)

The Agent Gateway is the entry point for the Python-side runtime (`mc.gateway.main()`). On startup it:

1. Resolves the Convex URL and admin key (from env vars or `dashboard/.env.local`).
2. Creates the ConvexBridge.
3. Syncs the agent registry: validates YAML configs from `~/.nanobot/agents/`, resolves models, upserts to Convex, deactivates removed agents, and handles write-back from Convex-edited agents.
4. Syncs skills, model tiers, embedding model settings, and ensures the default board.
5. Launches persistent async loops for all subsystems.

The `AgentGateway` class (in `process_monitor.py`) handles **crash recovery** with auto-retry:
- **FR37**: On first crash, transitions task to `retrying`, logs the error to the task thread, and re-dispatches.
- **FR38**: On second crash (retry exhausted), transitions to `crashed` with a full error log.
- **NFR10**: Crash recovery completes within 30 seconds.

### Orchestrator (`mc/orchestrator.py`)

The `TaskOrchestrator` manages task lifecycle routing through four subscription loops:

1. **Inbox routing loop**: Picks up new inbox tasks, generates auto-titles via the low-agent (a lightweight LLM call), then transitions to `planning` (or directly to `assigned` if an agent is pre-assigned).
2. **Planning routing loop**: Subscribes to `planning` tasks, creates filesystem directories, fetches available agents (filtered by board-scoped `enabledAgents`), invokes the `TaskPlanner` for LLM-based decomposition, stores the execution plan, and either kicks off autonomous execution or transitions to `review` for supervised tasks.
3. **Review routing loop**: Handles tasks entering the `review` state -- auto-completes autonomous tasks with no reviewers, routes review requests to designated reviewers, or requests human approval for `human_approved` trust level tasks.
4. **Kickoff watch loop**: Watches for supervised tasks approved by users (via `approveAndKickOff`) and resumed tasks (via `resumeTask`). Materializes plans into step records and dispatches execution.

The orchestrator enforces the **pure orchestrator invariant**: if a task is assigned to lead-agent, it is rerouted through the planner to find a real executor.

### Task Planner (`mc/planner.py`, `mc/plan_parser.py`)

The `TaskPlanner` decomposes tasks into structured `ExecutionPlan` objects using LLM reasoning:

- Builds a detailed system prompt with decomposition guidelines, tool awareness, anti-patterns, and response format specification.
- Constructs a user prompt with the task title, description, and an agent roster (name, role, skills, tools).
- Calls the LLM (via `mc.provider_factory`) with a 90-second timeout.
- Parses the JSON response into `ExecutionPlanStep` objects with `tempId`, `title`, `description`, `assignedAgent`, `blockedBy`, `parallelGroup`, and `order`.
- **Falls back to heuristic planning** on LLM failure: uses keyword extraction and `score_agent()` to find the best match.
- Supports **Claude Code backend** for planning when the configured model uses the `cc/` prefix.
- Validates agent names (replacing invalid ones with `nanobot`) and enforces the lead-agent-never-executes invariant.

### Task Executor (`mc/executor.py`, `mc/cc_executor.py`, `mc/output_enricher.py`)

The `TaskExecutor` subscribes to `assigned` tasks and executes them:

1. **Task pickup**: Transitions `assigned` -> `in_progress`, posts a system message, and loads the agent's configuration (prompt, model, skills) from both YAML and Convex (Convex is source of truth).
2. **Description enrichment**: Injects file manifests, thread context (previous messages), and tag attribute metadata into the task description so the agent has full context.
3. **Model resolution**: Resolves tier references (e.g., `tier:standard-medium` -> `anthropic/claude-sonnet-4-6`) and detects `cc/` model prefixes for Claude Code routing.
4. **Execution routing**:
   - **nanobot backend**: Runs the agent via the nanobot agent loop (LiteLLM provider, skill-filtered, orientation-injected).
   - **Claude Code backend** (`CCExecutorMixin` in `mc/cc_executor.py`): Prepares a CC workspace, starts an IPC socket server for MCP bridge communication, and invokes the Claude Code CLI subprocess.
5. **Post-execution**: Posts the result to the task thread, syncs output files to Convex, transitions to `done` (autonomous) or `review` (supervised), writes to `HEARTBEAT.md` for the Telegram bot, and schedules fire-and-forget memory consolidation.

The `CCExecutorMixin` is dynamically injected into `TaskExecutor` at module load time, keeping CC-specific code in a separate file while presenting a unified API.

### Step Dispatcher (`mc/step_dispatcher.py`)

The `StepDispatcher` executes materialized task steps within execution plans:

- **Dispatch loop**: Iterates over assigned steps grouped by `parallelGroup`, executing each group concurrently via `asyncio.gather`. Checks task status before each group to respect pause/review transitions.
- **Step execution**: For each step, loads agent config, syncs from Convex, resolves tiers, injects orientation and thread context (with predecessor awareness -- includes completion messages from `blockedBy` steps), and routes to either the nanobot runtime or Claude Code backend.
- **Lifecycle management**: Transitions steps through `assigned` -> `running` -> `completed` (or `crashed`), posts structured step-completion messages with artifacts, and unblocks dependent steps via `check_and_unblock_dependents`.
- **Task completion**: When all steps finish successfully, transitions the parent task to `done`.

### Memory (`mc/memory/`)

The memory subsystem provides persistent agent memory with hybrid search:

- **`MemoryIndex`** (`index.py`): SQLite-backed hybrid search combining BM25 full-text search with optional vector embeddings (via `sqlite-vec`). Indexes markdown files from the agent's memory directory.
- **`HybridMemoryStore`** (`store.py`): Extends the upstream `MemoryStore` with hybrid search indexing. Reads settings from `~/.nanobot/memory_settings.json` for configurable history context days and memory context size limits.
- **`consolidation.py`**: Compacts `HISTORY.md` and `MEMORY.md` into a fresh `MEMORY.md` via LLM tool-calling when history exceeds the threshold (160K chars). Uses `save_consolidated_memory` tool.
- **`policy.py`**: Defines the file contract for memory directories -- which files are allowed (`MEMORY.md`, `HISTORY.md`, archives, SQLite index, lock files) and which are invalid.
- **`service.py`**: Canonical helpers shared by nanobot and Claude Code backends for task output consolidation and memory store creation. Quarantines invalid memory files.

### Hooks (`mc/hooks/`)

The hooks system provides event-driven extension points for Claude Code agents:

- **`BaseHandler`** (`handler.py`): Abstract base class. Subclasses declare which events they handle via the `events` class attribute (a list of `(event_name, matcher_value)` tuples). The `handle()` method returns an `additionalContext` string injected into the agent's next turn.
- **`discover_handlers()`** (`discovery.py`): Convention-based auto-discovery that scans `mc/hooks/handlers/*.py` for `BaseHandler` subclasses at runtime.
- **`_dispatch()`** (`dispatcher.py`): Central dispatcher that routes Claude Code hook event payloads to matching handlers. Combines outputs into a JSON response with `hookSpecificOutput.additionalContext`.
- **`HookContext`** (`context.py`): Per-session context object loaded/saved across hook invocations.
- **`ipc_sync.py`**: Synchronous IPC bridge for hook communication with the Claude Code subprocess.

To add a new hook: create a Python file in `mc/hooks/handlers/` with a class extending `BaseHandler`, set the `events` class attribute, and implement `handle()`. The discovery system picks it up automatically.

## Data Flow

A task moves through the system in this sequence:

1. **Task creation**: User creates a task via the dashboard. Convex stores it with status `inbox`.
2. **Inbox routing**: The orchestrator's inbox loop detects the new task, optionally generates an auto-title via the low-agent LLM, and transitions to `planning` (or `assigned` if pre-assigned).
3. **Planning**: The orchestrator's planning loop picks up the task, calls `TaskPlanner.plan_task()` to generate an `ExecutionPlan` with one or more steps, stores the plan on the task document, and either:
   - **Autonomous mode**: Materializes step records in Convex via `PlanMaterializer`, transitions to `in_progress`, and kicks off step dispatch.
   - **Supervised mode**: Transitions to `review` with `awaitingKickoff=true` for user approval.
4. **Kick-off** (supervised only): User approves the plan via the dashboard. The kickoff watch loop detects the transition to `in_progress`, materializes steps, and starts dispatch.
5. **Step dispatch**: The `StepDispatcher` groups steps by `parallelGroup` and executes each group concurrently. For each step:
   - Transitions to `running`.
   - Enriches the step description with file manifests, thread context, and predecessor outputs.
   - Invokes the assigned agent (nanobot or Claude Code backend).
   - On completion: posts a step-completion message with artifacts, transitions to `completed`, and unblocks dependent steps.
   - On crash: transitions to `crashed` with error details.
6. **Task completion**: When all steps complete, the task transitions to `done` (autonomous) or `review` (supervised). Output files are synced to Convex. Memory consolidation runs asynchronously.
7. **Review** (if applicable): Autonomous tasks with no reviewers auto-complete. Tasks with reviewers await feedback. `human_approved` tasks require explicit user approval.

## State Machines

### Task Lifecycle (`mc/state_machine.py`)

```
                    +----------+
              +---->|  inbox   |<----+
              |     +----+-----+     |
              |          |           |
              |          v           |
              |     +----------+    |
              |     | planning |    |
              |     +----+-----+    |
              |          |          |
              |    +-----+-----+   |
              |    |           |   |
              |    v           v   |
              | +------+  +------+ |
              | |failed|  |review|--+
              | +------+  +--+---+
              |              |
              |         +----+----+
              |         |         |
              |         v         v
              |    +--------+ +------+
              +----|assigned | | done |
              |    +----+----+ +------+
              |         |
              |         v
              |   +-----------+
              |   |in_progress|
              |   +-----+-----+
              |         |
              |    +----+----+
              |    |         |
              |    v         v
              | +------+  +------+
              | |review|  | done |
              | +------+  +------+
              |
         +----+-----+
         | retrying  |<--- (from ANY state)
         +----+------+
              |
         +----+----+
         |         |
         v         v
   +-----------+ +-------+
   |in_progress| |crashed|<--- (from ANY state)
   +-----------+ +---+---+
                     |
                     v
                  +------+
                  | inbox| (retry from beginning)
                  +------+
```

**Universal targets** (reachable from any state): `retrying`, `crashed`.

### Step Lifecycle

```
  +--------+
  |planned |
  +---+----+
      |
  +---+----+     +--------+
  |assigned|<----|blocked |
  +---+----+     +---+----+
      |              ^
      v              |
  +--------+    (dependency
  |running |     completed)
  +---+----+
      |
  +---+----+
  |        |
  v        v
+-------+ +-------+
|completed| |crashed|
+----------+ +--+---+
                 |
                 v
             +--------+
             |assigned| (retry)
             +--------+
```

Additional step states: `waiting_human` (for ask-user interactions).

## Extension Points

### Adding Agents

1. Create a directory under `~/.nanobot/agents/{agent-name}/` with a `config.yaml` file.
2. The YAML file defines: `name`, `display_name`, `role`, `prompt`, `model`, `skills`, and optionally `backend: claude-code` with `claude_code_opts`.
3. On gateway startup, `sync_agent_registry()` validates the YAML and upserts the agent to Convex.
4. Agents can also be created/edited via the dashboard (Convex is source of truth, with write-back to local YAML).

### Adding Hooks

1. Create a Python file in `mc/hooks/handlers/` (e.g., `my_hook.py`).
2. Define a class extending `BaseHandler` with an `events` class attribute and a `handle()` method.
3. The discovery system auto-detects it -- no registration needed.

### Adding Skills

1. Create a directory under `~/.nanobot/workspace/skills/{skill-name}/` with a `SKILL.md` file.
2. The frontmatter can define: `description`, `metadata`, `always` (auto-inject), and `requires` (environment dependencies).
3. On gateway startup, `sync_skills()` syncs all skills to Convex. Builtin skills from `vendor/nanobot/nanobot/skills/` are distributed automatically.

## Vendor Dependencies

### nanobot (`vendor/nanobot/`)

Git subtree of the upstream HKUDS/nanobot repository. Provides the core agent runtime (agent loop, memory store, bus, channels, CLI, config loader, cron service). All modifications to upstream files are documented in `PATCHES.md` at the project root. To sync with upstream:

```bash
git fetch upstream
git subtree pull --prefix=vendor/nanobot upstream main --squash
```

### claude-code (`vendor/claude-code/`)

Claude Code CLI integration layer. Provides:
- `ClaudeCodeProvider`: Executes tasks via the Claude Code CLI subprocess.
- `CCWorkspaceManager`: Prepares isolated workspaces with agent identity, orientation, and MCP config.
- `MCSocketServer`: Unix socket IPC server for MCP bridge communication between CC and MC.
- `CCMemoryConsolidator`: Post-task memory consolidation for CC workspaces.

### Entry Point (`boot.py`)

The `boot.py` file ensures both vendor packages are on `sys.path` and re-exports the CLI. The `pyproject.toml` entry point is `nanobot = "boot:cli"`, making the CLI available as the `nanobot` command.
