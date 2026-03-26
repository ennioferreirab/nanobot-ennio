---
name: instagram-scraper
description: download images, reels, carousels, captions, and metadata from public instagram profiles through apify. use when an agent needs direct instagram evidence from a brand, competitor, or benchmark account for analysis, trend research, caption analysis, or brand investigation.
---

# Instagram Scraper

This skill downloads recent public Instagram posts and metadata for analysis.

## Command

```bash
uv run python .claude/skills/instagram-scraper/scripts/scrape_profile.py <username>       --count N       --output-dir $TASK_OUTPUT_DIR       --token $APIFY_API_TOKEN
```

## Required environment

- `APIFY_API_TOKEN`

## Output structure

```text
<output-dir>/<username>/
  _manifest.json
  YYYY-MM-DD_<shortcode>.jpg
  YYYY-MM-DD_<shortcode>.txt
  YYYY-MM-DD_<shortcode>.json
  YYYY-MM-DD_<shortcode>_reel.mp4
  YYYY-MM-DD_<shortcode>_slide1.jpg
```

## Usage rules

- Resolve the correct public username before scraping.
- Use an explicit `--count`; do not rely on implicit defaults.
- Read `_manifest.json` first to understand the sample set.
- Read caption `.txt` files in addition to images.
- For carousels, inspect all relevant slides when they carry meaning.
- For reels/videos, inspect the thumbnail and metadata even if full video review is not required.

## Common squad defaults

- brand investigation: exactly 5 recent posts unless instructed otherwise
- competitor/copy benchmark sampling: 3–5 recent posts per benchmark when enough evidence exists

## Anti-patterns

- scraping without a defined analytical question
- ignoring captions and only reading thumbnails
- treating one post as a brand-wide rule
