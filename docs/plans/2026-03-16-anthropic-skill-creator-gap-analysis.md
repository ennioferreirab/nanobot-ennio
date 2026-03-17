# Anthropic Skill Creator Gap Analysis

Date: 2026-03-16

## Goal

Adopt Anthropic's `skills/skill-creator` as the upstream contract for our local
skill standard without losing the local stack features we already depend on.

Upstream reference studied:

- `/tmp/anthropics-skills-codex-42340/skills/skill-creator/SKILL.md`
- `/tmp/anthropics-skills-codex-42340/skills/skill-creator/agents/`
- `/tmp/anthropics-skills-codex-42340/skills/skill-creator/references/schemas.md`
- `/tmp/anthropics-skills-codex-42340/skills/skill-creator/eval-viewer/`
- `/tmp/anthropics-skills-codex-42340/skills/skill-creator/scripts/`

Local reference before adaptation:

- `/Users/ennio/.codex/skills/.system/skill-creator/SKILL.md`
- `/Users/ennio/.codex/skills/.system/skill-creator/scripts/init_skill.py`
- `/Users/ennio/.codex/skills/.system/skill-creator/scripts/generate_openai_yaml.py`
- `/Users/ennio/.codex/skills/.system/skill-creator/references/openai_yaml.md`

## Main Differences Found

### 1. Upstream is a full skill-iteration system, not just a drafting guide

Anthropic's version includes:

- iterative eval workflow
- grading and analysis agents
- benchmark aggregation
- eval viewer
- packaging helpers

Local version previously focused on:

- skill anatomy guidance
- local scaffold generation
- local UI metadata generation
- quick validation

Decision:

- adopt the Anthropic eval and benchmark structure as the default contract
- keep local scaffold and UI metadata generation as overlay features

### 2. Upstream expects explicit eval artifacts

Anthropic standard centers on:

- `evals/evals.json`
- per-run output directories
- `grading.json`
- `benchmark.json`
- viewer review flow

Local version previously had no first-class eval skeleton.

Decision:

- treat eval artifacts as part of the standard for benchmarkable skills
- update local initializer to optionally create `evals/evals.json`

### 3. Local stack needs adapter metadata for Codex, but that should not become core skill truth

This is not part of Anthropic's public `skill-creator`, but it matters in our
environment for UI-facing metadata.

Decision:

- preserve support for `agents/openai.yaml`
- preserve `references/openai_yaml.md`
- preserve `scripts/generate_openai_yaml.py`
- treat these as adapter-generation support, not a replacement for upstream structure

### 4. Local stack prefers `uv run python`

Repository and local workflows prefer `uv run python` over `python3`.

Decision:

- document and run local helper scripts with `uv run python`
- keep upstream-compatible file layout and JSON shapes

### 5. Squad authoring needs skills-first discovery, not just agent-first design

Anthropic's `skill-creator` is about creating and refining a single skill.
Our squad flow needs:

- capability discovery
- skill gap detection
- missing skill creation before publish
- reuse of available skills

Decision:

- update `create-squad-mc` to use the local `skill-creator` as the missing-skill
  creation path
- expose both `availableSkills` and full `knownSkills` in squad context

## Unified Standard Chosen

We will use this rule:

1. Anthropic `skill-creator` is the upstream contract.
2. Local overlay is narrow and explicit.
3. New skill flows should remain Anthropic-compatible unless there is a
   concrete MC requirement to diverge.

### Required Local Overlay

- `references/openai_yaml.md`
- `scripts/generate_openai_yaml.py`
- `scripts/init_skill.py`
- `scripts/quick_validate.py`

### Optional Generated Adapters

- `agents/openai.yaml` when Codex / OpenAI target is enabled
- Nanobot-compatible metadata/frontmatter projection when Nanobot target is enabled
- Claude Code compatibility validation/profile when Claude target is enabled

### Adopted Upstream Components

- Anthropic-style `SKILL.md` workflow
- eval schemas
- grading/comparison/analyzer agents
- benchmark scripts
- eval viewer
- packaging helper

## Implementation Consequences

- `create-squad-mc` becomes skills-first and can create missing skills before
  publish
- squad context returns the full skill catalog in addition to immediately
  available skills
- squad graph validation now requires explicit new-agent contracts, including
  memorable `displayName`
- local `skill-creator` becomes a real iteration environment instead of only a
  writing guide
