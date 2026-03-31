---
name: create-skill-mc
description: guided mission control runtime skill designer. use when the user wants to create, rewrite, or extend a runtime skill for agents, define when the skill should trigger, choose providers, add references or scripts, or avoid duplicating an existing skill in mission control.
---

# Create Runtime Skill for Mission Control

This skill designs reusable runtime skills for MC agents.

## Start with catalog discovery

Always inspect the existing skills catalog first:

```bash
curl -s http://localhost:3000/api/specs/skills
```

Use it to:

- avoid duplicates
- find extension candidates
- confirm provider support
- see whether a dependency already exists

## Discovery sequence

Ask for:

1. What job the skill enables
2. When it should trigger
3. Which providers must support it
4. Whether it needs scripts, references, or assets
5. What output the downstream agent should get from it

## Skill design rules

A runtime skill should do one of these well:

- teach a workflow
- expose a deterministic script or API pattern
- codify a domain rubric or format
- standardize a review or production protocol

Do not create a skill when a short agent prompt would be enough.

## Structure guidelines

Keep `SKILL.md` as the control plane. Put deeper details in:

- `references/` for domain docs, schemas, rubrics
- `scripts/` for deterministic operations
- `assets/` for templates or files used in outputs

## Trigger description

The frontmatter `description` must explain:

- what the skill does
- when to use it
- what kinds of tasks should activate it

## Validation checklist

- no duplicate purpose with an existing skill unless deliberately extending
- description is explicit enough to trigger the skill
- references are truly reusable
- scripts are only included when needed
- provider support is stated clearly
