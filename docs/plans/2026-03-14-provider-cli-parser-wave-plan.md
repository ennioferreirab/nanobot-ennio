# Provider CLI Parser Wave Plan

**Date:** 2026-03-14

**Goal:** Replace the remote TUI path with a process-supervised provider CLI
live-share architecture, deliver explicit human intervention and resume flows,
and retire obsolete TUI-only UI and runtime code in safe waves.

**Execution Context:** Work from the repository root at
`/Users/ennio/Documents/nanobot-ennio`. The requested initiative label is
`provider-cli-parser`. If the branch is created through Codex tooling, use
`codex/provider-cli-parser` to satisfy branch-prefix requirements.

**Detailed Plan:** `docs/plans/2026-03-14-provider-cli-parser-plan.md`

---

## Story Decomposition

- `28-0a-stabilize-provider-request-contracts-before-provider-cli-migration.md`
- `28-0b-stabilize-interactive-supervision-and-state-projection.md`
- `28-0c-restore-claude-step-observability-before-provider-cli-cutover.md`
- `28-1-build-provider-cli-session-core.md`
- `28-2-add-claude-code-provider-cli-parser.md`
- `28-3-add-codex-provider-cli-parser.md`
- `28-4-add-nanobot-runtime-owned-provider-parser.md`
- `28-5-build-live-chat-surface-for-chat-and-steps.md`
- `28-6-add-human-intervention-and-resume-controls.md`
- `28-7-retire-remote-tui-ui-and-runtime.md`

These stories are tracked under `_bmad-output/implementation-artifacts/` and
map to the waves below.

## Cross-Wave Directives

### Canonical ownership

- The source of truth for live share is the MC-owned process/session record.
- Browser terminal state is not authoritative.
- Provider transcript files, hooks, MCP signals, and session artifacts are
  enrichment inputs, not the primary transport contract.

### Scope discipline

- Do not rebuild terminal emulation in the browser.
- Do not keep a hidden “just in case” PTY/xterm path once the new live chat is
  ready.
- Do not conflate provider-native resume ids with Nanobot runtime-owned
  `session_key` continuity.

### Validation discipline

- Use TDD inside each wave.
- Use the full MC stack via `uv run nanobot mc start` for end-to-end validation
  once UI-facing waves begin.
- Do not treat `cd dashboard && npm run dev` as sufficient validation.
- Use `playwright-cli` rather than Playwright MCP unless a later request says
  otherwise.

### Review discipline

- Every wave closes with focused tests, architecture guardrails, and a review
  pass before the next wave starts.
- Stop if a wave reintroduces remote TUI ownership or parallel session truth.

## Wave 0: Preconditions and Story Freeze

**Objective:** Freeze the new initiative boundary and confirm the team is
   executing against the provider CLI live-share design rather than the older
   remote TUI direction.

**Included artifacts:**
- `docs/plans/2026-03-14-provider-cli-parser-design.md`
- `docs/plans/2026-03-14-provider-cli-parser-plan.md`
- `docs/plans/2026-03-14-provider-cli-parser-wave-plan.md`
- `_bmad-output/implementation-artifacts/28-1-build-provider-cli-session-core.md`
- `_bmad-output/implementation-artifacts/28-2-add-claude-code-provider-cli-parser.md`
- `_bmad-output/implementation-artifacts/28-3-add-codex-provider-cli-parser.md`
- `_bmad-output/implementation-artifacts/28-4-add-nanobot-runtime-owned-provider-parser.md`
- `_bmad-output/implementation-artifacts/28-5-build-live-chat-surface-for-chat-and-steps.md`
- `_bmad-output/implementation-artifacts/28-6-add-human-intervention-and-resume-controls.md`
- `_bmad-output/implementation-artifacts/28-7-retire-remote-tui-ui-and-runtime.md`

**Entry gate:**
- design exists
- detailed plan exists
- story set exists
- old TUI design is marked superseded

**Core work:**
- confirm the implementation branch and worktree strategy
- confirm the team will not build new work on top of the remote TUI stories
- confirm the baseline test commands and validation path

**Exit gate:**
- all planning artifacts are present and linked
- the first coding wave is unambiguous

## Wave 0.5: Post-Epic-27 Stabilization

**Stories:**
- `28-0a-stabilize-provider-request-contracts-before-provider-cli-migration.md`
- `28-0b-stabilize-interactive-supervision-and-state-projection.md`
- `28-0c-restore-claude-step-observability-before-provider-cli-cutover.md`

**Objective:** Stabilize the current interactive runtime just enough to stop
active regressions in planning, supervision, and operator visibility before the
provider CLI cutover begins.

**Problems solved in this wave:**
- Anthropic thinking payload rules are not yet pinned by tests
- planning just changed to follow the Lead Agent model and needs contract coverage
- supervision payloads and same-status transitions can still break the runtime
- Claude step execution can become effectively invisible in the transitional path

**Must not do:**
- no new long-term investment in `tmux` or PTY transport
- no new browser terminal features
- no provider CLI session core yet

**Verification gate:**
- focused pytest suites for provider payloads, planning, supervision, and Claude startup
- Python architecture guardrails
- focused dashboard validation only where transitional observability is touched

**Exit gate:**
- the hotfixes are covered by failing-then-passing tests
- same-status supervision no longer crashes the event pipeline
- the Claude transitional path is observable enough to operate while Wave 1 lands

## Wave 1: Provider CLI Session Core

**Stories:**
- `28-1-build-provider-cli-session-core.md`

**Objective:** Establish the generic process/session/live-stream foundation
and activate the new core in production execution wiring for cut-over
providers, without yet shipping provider-specific UI.

**Problems solved in this wave:**
- no canonical owner for provider process metadata
- no generic parser contract for resume/interrupt/stop
- no live stream abstraction independent of PTY transport
- no production step path yet selects the provider CLI core

**Must not do:**
- no user-facing live chat yet
- no provider-specific resume logic yet
- no TUI deletion yet

**Verification gate:**
- focused provider CLI core pytest suites
- Python architecture guardrails

**Exit gate:**
- shared types, parser protocol, process supervisor, registry, and live stream
  projector all exist and are test-covered
- production execution wiring can select the provider CLI core instead of the
  legacy `INTERACTIVE_TUI` runner for cut-over providers

## Wave 2: Provider Adapters

**Stories:**
- `28-2-add-claude-code-provider-cli-parser.md`
- `28-3-add-codex-provider-cli-parser.md`
- `28-4-add-nanobot-runtime-owned-provider-parser.md`

**Objective:** Prove the generic provider CLI architecture works for both
provider-native resume flows and Nanobot runtime-owned continuity.

**Problems solved in this wave:**
- provider-specific session discovery remains ad hoc
- live-share semantics differ by provider
- Nanobot needs a first-class runtime-owned mode
- Claude still runs through the legacy tmux-backed step path

**Must not do:**
- no broad UI rewrite yet
- no remote TUI retirement yet

**Parallelization note:**
- Claude, Codex, and Nanobot stories can run in parallel once Wave 1 lands,
  with shared review on the generic contract before merge.

**Verification gate:**
- focused provider parser suites for Claude, Codex, and Nanobot
- Python architecture guardrails

**Exit gate:**
- all target providers integrate through the same generic high-level session
  contract
- Claude step execution is no longer tmux-backed

## Wave 3: Unified Live Chat and Human Intervention

**Stories:**
- `28-5-build-live-chat-surface-for-chat-and-steps.md`
- `28-6-add-human-intervention-and-resume-controls.md`

**Objective:** Replace terminal-centric interaction with a shared live chat
surface and explicit intervention controls.

**Problems solved in this wave:**
- chat and step live share still need a terminal surface
- intervention is still framed as takeover rather than interrupt/resume

**Must not do:**
- no hidden dependency on `InteractiveTerminalPanel`
- no terminal-only keyboard semantics as the control surface

**Verification gate:**
- focused dashboard tests for live chat and intervention
- full-stack validation via `uv run nanobot mc start`
- Playwright smoke pass on chat and step live-share flows

**Exit gate:**
- chat and step live share run on the same live chat component
- intervention works from the UI without a remote TUI

## Wave 4: Remote TUI Retirement and Stabilization

**Stories:**
- `28-7-retire-remote-tui-ui-and-runtime.md`

**Objective:** Remove or tightly gate obsolete TUI-only UI/runtime paths and
ship the provider CLI live-share model as the supported direction.

**Problems solved in this wave:**
- silent parallel ownership remains between live chat and remote TUI
- dead PTY/websocket/xterm code pollutes the project
- docs and tests may still point to the old model

**Must not do:**
- no indefinite compatibility layer
- no dormant xterm path left enabled by default

**Verification gate:**
- focused backend and dashboard suites for the supported path
- architecture guardrails
- Playwright smoke validation on the final supported flow
- review pass on the wave diff

**Exit gate:**
- remote TUI is no longer the primary or default user path
- obsolete codepaths are removed or explicitly disabled
- docs consistently point to the provider CLI live-share model

## Delivery Guidance

1. Finish Wave 1 before starting provider-specific parser work.
2. Merge provider adapters only after reviewing the generic contract once.
3. Treat Wave 3 as the first user-visible milestone.
4. Use Wave 4 to delete or hard-disable the old TUI path rather than carrying
   it forward indefinitely.
