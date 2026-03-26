---
name: generate-image
description: generate or edit images using openrouter image models with explicit control over quality, aspect ratio, and brand consistency. use when an agent needs draft or production visuals, visual explorations, image edits, or precise generation prompts for marketing and social content.
---

# Generate Image

Create and edit images via OpenRouter image generation models.

## Command

```bash
uv run python .claude/skills/generate-image/scripts/generate_image.py       --prompt "description"       --quality medium       --aspect 1:1       --size 1K       --output output/generated.png
```

## Quality tiers

- `medium` — drafts, brand briefs, exploration
- `high` — final production outputs

Use `medium` by default for development-stage creative work unless the user explicitly asks for final production quality.

## Brand consistency rules

Before generating, define:

- subject and purpose
- format / aspect ratio
- color behavior
- typography behavior if text is part of the concept
- logo treatment if logo exists
- composition and negative space
- what must stay consistent with brand references

See `references/brand-consistency-checklist.md`.

## Error handling

- `HTTP 402` — insufficient OpenRouter credits; do not retry blindly
- `HTTP 401` — invalid API key
- `HTTP 429` — retry once, then stop

## Social defaults

- square post: `1:1`
- story / reel cover: `9:16`
- carousel cover: usually `1:1`

## Anti-patterns

- generating before the visual direction is explicit
- ignoring attachments or approved brand constraints
- switching to final-quality generation too early
