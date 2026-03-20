---
name: generate-image
description: Generate and edit images using OpenRouter image models. Use when an agent needs to create images from text prompts, edit or modify existing photos, generate visual content for marketing or products, or needs guidance on image composition, style, and prompt engineering for visual output.
---

# Generate Image

Create and edit images via OpenRouter's image generation API using models like
Gemini Flash Image and Flux.

## Quick Start

> Scripts run from your agent workspace root. Prefix all script paths with
> `.claude/skills/generate-image/`.

Generate an image with the bundled script:

```bash
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "A minimalist office workspace, flat illustration, soft natural light" \
  --aspect 16:9 --size 2K --output output/workspace.png
```

Edit an existing image:

```bash
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "Remove the background, replace with a gradient from navy to teal" \
  --input photo.jpg --output output/edited.png
```

Requires `OPENROUTER_API_KEY` in environment (already set in your shell).

## Generate Images

### From Text

Call the script with `--prompt`. Combine subject, style, composition, and mood
for best results.

```bash
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "A golden retriever on a sunlit lawn, photorealistic, shallow depth of field, warm afternoon light" \
  --model google/gemini-3.1-flash-image-preview \
  --aspect 3:2 --size 2K --output output/dog.png
```

### Parameters

| Flag | Values | Default |
|------|--------|---------|
| `--model` | Any OpenRouter image model | `google/gemini-3.1-flash-image-preview` |
| `--aspect` | 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 9:21, 21:9, 1:2, 1:4, 4:1, 1:8, 8:1 | Model default |
| `--size` | 0.5K, 1K, 2K, 4K | 1K |
| `--output` | File path | output/generated.png |

### Available Models

Query OpenRouter for current image models:

```bash
curl -s "https://openrouter.ai/api/v1/models?output_modalities=image" | python3 -c "
import json, sys
for m in json.load(sys.stdin).get('data', []):
    print(f\"  {m['id']}  ({m.get('pricing',{}).get('prompt','?')}/tok)\")"
```

Known models: `google/gemini-3.1-flash-image-preview`, `black-forest-labs/flux-2-pro`,
`black-forest-labs/flux-2-flex`.

## Edit Images

Pass `--input` with an existing image to edit it. The prompt describes the
desired transformation.

```bash
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "Convert to watercolor painting style, preserve composition" \
  --input original.jpg --output output/watercolor.png
```

Common editing operations:

| Task | Prompt example |
|------|---------------|
| Background swap | "Replace the background with a modern office interior" |
| Style transfer | "Convert to pencil sketch style, preserve composition" |
| Object removal | "Remove the person on the right, fill naturally" |
| Color correction | "Shift to warmer tones, increase contrast slightly" |
| Add element | "Add a coffee cup on the desk, match existing lighting" |

## Aspect Ratios by Use Case

| Use case | Ratio |
|----------|-------|
| Social post (square) | 1:1 |
| Instagram story / TikTok | 9:16 |
| Presentation / hero | 16:9 |
| Portrait / poster | 2:3 |
| Blog header / landscape | 3:2 |

## Design Guidance

For detailed prompt engineering, composition principles, style keywords, and
quality checklists, read [references/design-guidelines.md](references/design-guidelines.md).

Read this reference when:
- Crafting prompts for marketing or brand imagery
- Choosing color palettes and composition strategies
- Editing photos with specific design intent
- Quality-checking generated images before delivery

## Direct API Usage

When the script doesn't fit (e.g. streaming, custom parameters), call the API
directly:

```python
import requests, os

resp = requests.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "model": "google/gemini-3.1-flash-image-preview",
        "messages": [{"role": "user", "content": "A sunset over mountains"}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": "16:9", "image_size": "2K"},
    },
)

data = resp.json()
images = data["choices"][0]["message"].get("images", [])
# images[0] is a data:image/png;base64,... URL
```
