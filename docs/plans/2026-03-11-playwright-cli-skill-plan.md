# Playwright CLI Skill Clarification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the installed `playwright` skill explicitly steer Codex toward `playwright-cli` and away from Playwright MCP unless the user requests MCP.

**Architecture:** This is a documentation and metadata change in the existing skill directory under `~/.codex/skills/playwright`. The wrapper script and reference files already implement the intended CLI workflow, so the work is limited to frontmatter, body guardrails, and UI-facing metadata.

**Tech Stack:** Markdown skill docs, YAML agent metadata, Python quick validation

---

### Task 1: Lock In The Approved Wording

**Files:**
- Modify: `~/.codex/skills/playwright/SKILL.md`
- Modify: `~/.codex/skills/playwright/agents/openai.yaml`

**Step 1: Prepare the text changes**

Rewrite the skill description so it triggers on `playwright-cli` / wrapper-script browser automation and says not to use Playwright MCP by default. Add a short guardrail at the top of the body repeating that rule.

**Step 2: Apply the metadata update**

Adjust `agents/openai.yaml` so `short_description` and `default_prompt` explicitly reference CLI-first automation and mention MCP only as an explicit opt-in.

**Step 3: Review the final wording**

Confirm the SKILL frontmatter, opening paragraphs, and UI metadata all express the same policy without contradiction.

### Task 2: Validate The Skill

**Files:**
- Test: `~/.codex/skills/playwright/SKILL.md`
- Test: `~/.codex/skills/playwright/agents/openai.yaml`

**Step 1: Run structural validation**

Run: `python3 /Users/ennio/.codex/skills/.system/skill-creator/scripts/quick_validate.py ~/.codex/skills/playwright`
Expected: PASS with no frontmatter or naming errors.

**Step 2: Re-read the changed files**

Run: `sed -n '1,120p' ~/.codex/skills/playwright/SKILL.md` and `sed -n '1,80p' ~/.codex/skills/playwright/agents/openai.yaml`
Expected: The wording explicitly prefers `playwright-cli` and excludes MCP unless the user explicitly requests it.
