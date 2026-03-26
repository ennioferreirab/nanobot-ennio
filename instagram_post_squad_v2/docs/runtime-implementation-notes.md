# Runtime Implementation Notes

This bundle rewrites the skill instructions and contracts, but it does not ship the executable runtime scripts for every skill.

## Skills that assume existing implementation in your environment

- `instagram-scraper`
- `generate-image`

Their rewritten `SKILL.md` files assume you already have the underlying scripts and environment variables wired in your workspace, as suggested by the original material.

## Skills that are instruction-only by design

- `web-search`
- `brand-analysis`
- `instagram-copywriting`
- `creative-qc`

These are meant to standardize behavior, output contracts, and review logic. They do not require extra scripts unless you later decide to automate more of the flow.
