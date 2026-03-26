# Skill Mapping for the Proposed Squad

## Rewritten or newly proposed in this bundle

- `web-search`
- `instagram-scraper`
- `brand-analysis`
- `instagram-copywriting`
- `creative-qc`
- `generate-image`
- `create-agent-mc`
- `create-review-spec-mc`
- `create-skill-mc`
- `create-squad-mc`
- `create-workflow-mc`

## Treated as platform-provided dependencies

- `memory`

`memory` was not present in the uploaded ZIP, but it is still used by `strategist`, `copywriter`, and `post-designer` in the proposed architecture.

The bundle assumes `memory` already exists in your environment as a platform skill or built-in capability.

## Recommended agent → skill mapping

- `research-trend` → `web-search`, `instagram-scraper`
- `brand-sherlock` → `instagram-scraper`, `brand-analysis`, `web-search`
- `copy-researcher` → `web-search`, `instagram-scraper`
- `strategist` → `web-search`, `memory`
- `copywriter` → `instagram-copywriting`, `memory`
- `post-designer` → `generate-image`, `memory`
- `creative-reviewer` → `creative-qc`, `brand-analysis`
