# Instagram Post Squad V2 — Backlog

Items identified during the v2 bundle analysis that need development before the squad can execute end-to-end.

## System steps without handlers

**Problem:** `step_dispatcher.py` has no dedicated handler for `workflow_step_type == "system"`. System steps silently fall through to the nanobot agent.

**Affected steps:**
- `brief-normalization` — normalizes execution brief (language, market, audience, offer, constraints)
- `memory-writeback` — persists approved learnings after human approval

**Where:** `mc/contexts/execution/step_dispatcher.py`

**Solution needed:** Add system step handler that either auto-completes or runs a registered handler function.

## Memory skill not registered

**Problem:** `strategist`, `copywriter`, and `post-designer` list `memory` as a required skill, but there's no `memory` skill registered in the skills table. Memory consolidation exists as an internal service (`mc/memory/`) but isn't exposed as a skill.

**Where:** `mc/memory/`, `dashboard/convex/skills` table

## Instagram scraper runtime script

**Problem:** The `instagram-scraper` SKILL.md assumes an underlying script exists for downloading posts. Only the instruction file was provided.

**Where:** Needs `mc/skills/instagram-scraper/scripts/` implementation
