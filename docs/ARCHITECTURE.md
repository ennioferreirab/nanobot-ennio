# Mission Control Architecture

## Overview

Mission Control is organized around one rule: domain behavior should be
owned in stable modules, while entrypoints stay thin.

- Python owns orchestration, execution context, workers, and runtime services.
- Convex owns transactional state, realtime read models, and workflow validation.
- Next.js renders feature UIs using hooks backed by aggregated read models.

The current stabilization target is:

```text
boot.py
  -> mc.gateway (composition root only)
    -> mc.workers/*
      -> mc.application/*
        -> mc.domain/*
        -> mc.bridge/*
        -> mc.infrastructure/*

dashboard/components/*
  -> dashboard/hooks/*
    -> dashboard/convex/* read models + mutations
      -> dashboard/convex/lib/*

shared/workflow/workflow_spec.json
  -> mc/domain/workflow_contract.py
  -> dashboard/convex/lib/workflowContract.ts
```

## Backend Layers

### `mc.gateway`

`mc.gateway` is the composition root.

- It wires dependencies.
- It starts workers.
- It must not become the home for business rules.
- Modules below bootstrap must not import it.

### `mc.workers`

Workers poll, subscribe, and route work.

- They observe events and call services.
- They do not own dense domain logic.
- They should be individually testable.

Examples:
- inbox routing
- planning kickoff
- review handling
- resume / dispatch triggers

### `mc.application`

This layer coordinates use cases.

- execution context building
- execution engine selection
- post-execution hooks
- conversation and mention routing
- planning and orchestration services

Key rule:
- `ExecutionEngine.run()` is the runtime entrypoint for execution flows.

### `mc.domain`

Pure domain rules live here.

- workflow contract adapters
- transition validation
- state and invariant helpers

Key rule:
- workflow state cannot be duplicated across Python, Convex, and UI code.

### `mc.bridge`

`mc.bridge` is the backend data-access boundary for Convex.

- façade compatibility stays here
- repositories and subscriptions sit behind it
- application/services depend on repositories or façade methods, not raw SDK details

### `mc.infrastructure`

Framework and environment details live here.

- config paths
- filesystem layout
- bootstrap loaders
- external runtime adapters

## Execution Runtime

The execution runtime is split into explicit pieces:

```text
ContextBuilder
  -> ExecutionRequest
  -> ExecutionEngine
    -> NanobotRunnerStrategy
    -> ClaudeCodeRunnerStrategy
    -> HumanRunnerStrategy
    -> post-processing hooks
```

Responsibilities:

- `ContextBuilder`
  builds normalized task/step context once.
- `ExecutionEngine`
  chooses the runner and normalizes failures.
- `RunnerStrategy`
  performs the backend-specific execution only.
- `post_processing`
  handles cross-cutting follow-up like memory relocation/consolidation.

Compatibility note:
- the legacy executor still exists as a compatibility layer and legacy test seam,
  but runtime-facing modules should depend on `mc.application.execution.*`.

## Workflow Contract

The workflow contract is versioned in:

- `shared/workflow/workflow_spec.json`

Consumers:

- [mc/domain/workflow_contract.py](/Users/ennio/Documents/nanobot-ennio/.worktrees/mc-architecture-stabilization-v2/mc/domain/workflow_contract.py)
- [dashboard/convex/lib/workflowContract.ts](/Users/ennio/Documents/nanobot-ennio/.worktrees/mc-architecture-stabilization-v2/dashboard/convex/lib/workflowContract.ts)

This contract defines:

- task statuses
- step statuses
- valid transitions
- workflow action mappings
- thread / workflow message semantics

## Dashboard Architecture

The dashboard is feature-first.

```text
components/
  presentational and composition-focused UI
hooks/
  feature hooks and action hooks
convex/
  read models, queries, mutations
convex/lib/
  pure workflow and view-model helpers
```

Key rules:

- feature components should not call `useQuery` / `useMutation` directly when a
  feature hook already exists
- hooks must not import UI components
- primary reads should come from aggregated read models

Current preferred read APIs:

- `tasks.getDetailView`
- `boards.getBoardView`

These queries are the server-side source for:

- task detail state
- board grouping and counters
- UI flags
- allowed actions
- tag and metadata rendering inputs

## Guardrails

Architecture rules are protected by tests:

- [tests/mc/test_architecture.py](/Users/ennio/Documents/nanobot-ennio/.worktrees/mc-architecture-stabilization-v2/tests/mc/test_architecture.py)
- [dashboard/tests/architecture.test.ts](/Users/ennio/Documents/nanobot-ennio/.worktrees/mc-architecture-stabilization-v2/dashboard/tests/architecture.test.ts)

Current guardrails enforce:

- protected backend modules do not import `mc.gateway`
- runtime-facing modules do not import `mc.executor` directly
- major feature components avoid direct Convex hooks
- view hooks consume aggregated read models
- hooks do not depend on UI components

## Design Rules

These are the working architecture rules for MC v2 stabilization:

1. Rules of the workflow belong in shared/domain modules, not UI or boot code.
2. Bootstrap wires dependencies; it does not own business behavior.
3. Workers trigger services; they do not become god files.
4. Execution uses `ExecutionRequest -> ExecutionEngine -> RunnerStrategy`.
5. Convex read models are preferred over client-side reconstruction.
6. Feature hooks own data orchestration; components focus on rendering and user intent.
7. Compatibility shims may exist temporarily, but they are not architectural authority.
