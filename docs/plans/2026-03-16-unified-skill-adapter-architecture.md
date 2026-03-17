# Unified Skill Adapter Architecture

Date: 2026-03-16

## Objective

Make skill distribution deterministic across:

- Claude Code
- Codex / OpenAI UI integration
- Nanobot / Mission Control

without turning any one runtime's adapter into the source of truth for the
skill itself.

## Decision

Adopt a split architecture:

1. **Core skill**
2. **Canonical manifest**
3. **Deterministic adapters**

The core skill stays Anthropic-compatible. Adapters are generated artifacts or
generated compatibility projections.

## 1. Core Skill

The core skill is what a human authors and what remains portable:

```text
skill-name/
  SKILL.md
  references/
  scripts/
  assets/
  evals/
```

`SKILL.md` remains the primary human-authored source for:

- `name`
- `description`
- body instructions

This preserves compatibility with Anthropic's public skill format.

## 2. Canonical Manifest

Add a local, runtime-neutral manifest as the machine source of truth for adapter
generation.

Recommended path:

```text
skill-name/
  skill.manifest.yaml
```

This file should contain only data that should be compiled into runtime-specific
shapes.

### Proposed Schema

```yaml
schema_version: 1

skill:
  name: "skill-name"
  display_name: "Skill Name"
  short_description: "Short UI summary"
  default_prompt: "Use $skill-name to ..."
  brand_color: "#0F766E"

targets:
  claude_code:
    enabled: true
  codex:
    enabled: true
  nanobot:
    enabled: true

runtime:
  always: false
  requires:
    bins: []
    env: []

assets:
  icon_small: "./assets/icon-small.svg"
  icon_large: "./assets/icon-large.png"

dependencies:
  tools: []
```

### Ownership Rules

- `SKILL.md` owns: `name`, `description`, instructional content
- `skill.manifest.yaml` owns: adapter-facing metadata
- generated adapters must never be edited by hand

If a field exists in both places, `SKILL.md` wins for semantic skill identity
and `skill.manifest.yaml` wins for adapter metadata.

## 3. Adapter Targets

### A. Claude Code

Current behavior:

- Claude Code consumes the core skill directory directly
- it maps skills into `.claude/skills/`
- it does not require a separate product-specific metadata file

Implication:

- Claude Code is best modeled as a **compatibility profile**
- not as a heavy generated artifact

Deterministic output:

- validate the skill layout is Claude-compatible
- optionally generate a compact compatibility report
- no extra runtime file is required in phase 1

### B. Codex / OpenAI

Current behavior:

- Codex/OpenAI uses `agents/openai.yaml` for interface metadata

Deterministic output:

- generate `agents/openai.yaml` from `skill.manifest.yaml`
- optionally cross-check that `display_name` and `short_description` stay within
  UI limits

This is a real generated adapter artifact.

### C. Nanobot

Current behavior:

- Nanobot reads `SKILL.md`
- Nanobot also reads frontmatter metadata for things like `always` and
  `requires`

Near-term deterministic output:

- compile the manifest's runtime block into the `metadata` frontmatter consumed
  by Nanobot today

Longer-term better design:

- teach Nanobot to read `skill.manifest.yaml` directly
- keep frontmatter minimal and human-facing

Phase 1 recommendation:

- generate Nanobot-compatible frontmatter deterministically because the current
  loader already expects it

## Field Mapping Matrix

| Canonical field | Core `SKILL.md` | Claude Code | Codex | Nanobot |
|---|---|---|---|---|
| `skill.name` | frontmatter `name` | validate only | derive file metadata | validate against frontmatter |
| `skill.description` | frontmatter `description` | consumed directly | optional cross-check only | consumed directly |
| `skill.display_name` | not required | optional compatibility label | `interface.display_name` | optional UI metadata only |
| `skill.short_description` | not required | ignore | `interface.short_description` | optional only |
| `skill.default_prompt` | not required | ignore | `interface.default_prompt` | ignore |
| `skill.brand_color` | not required | ignore | `interface.brand_color` | ignore |
| `assets.icon_small` | not required | ignore | `interface.icon_small` | ignore |
| `assets.icon_large` | not required | ignore | `interface.icon_large` | ignore |
| `runtime.always` | optional generated metadata | influences always-on injection if adopted | ignore | generate `metadata.nanobot.always` |
| `runtime.requires.bins` | optional generated metadata | availability checks via skill loader | optional future use | generate `metadata.nanobot.requires.bins` |
| `runtime.requires.env` | optional generated metadata | availability checks via skill loader | optional future use | generate `metadata.nanobot.requires.env` |
| `dependencies.tools` | not required | optional future wiring | generate dependency block when relevant | optional future wiring |
| `targets.*.enabled` | not required | include in validation profile | controls whether `openai.yaml` is emitted | controls whether nanobot metadata is emitted |

## Determinism Rules

To keep adapters deterministic:

1. All adapter files are generated from `SKILL.md` + `skill.manifest.yaml`.
2. Generated files carry a header comment or regen notice where format allows.
3. CI or local validation fails when generated adapters are stale.
4. Manual edits to generated adapters are overwritten on regeneration.

## Generator Responsibilities

The generator should:

1. parse `SKILL.md`
2. parse `skill.manifest.yaml`
3. validate consistency
4. emit enabled adapters only
5. run target-specific validators

Expected commands:

```bash
uv run python scripts/generate_adapters.py <skill-dir>
uv run python scripts/validate_adapters.py <skill-dir>
```

## Recommended Phasing

### Phase 1

- define `skill.manifest.yaml`
- generate `agents/openai.yaml`
- generate Nanobot-compatible metadata/frontmatter
- validate Claude Code compatibility

### Phase 2

- migrate local `skill-creator` to scaffold the manifest
- add stale-adapter validation
- update squad flow to request target set when creating missing skills

### Phase 3

- consider teaching Nanobot to read the manifest directly
- reduce duplicated metadata in `SKILL.md` frontmatter

## Viability Assessment

This is viable and worth doing.

The critical constraint is to avoid turning adapter outputs into handwritten
sources of truth. If the manifest is canonical and the adapters are generated,
the model remains deterministic and maintainable.

The only nuance is Claude Code: it should be treated as a target profile first,
not forced into an unnecessary generated file just for symmetry.
