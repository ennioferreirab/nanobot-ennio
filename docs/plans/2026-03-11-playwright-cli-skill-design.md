# Playwright CLI Skill Clarification Design

## Summary

Make the existing `playwright` skill explicitly CLI-first and explicitly non-MCP by default.

## Decisions

| Decision | Choice |
|----------|--------|
| Skill identity | Keep the installed skill name as `playwright` |
| Primary execution path | Use `playwright-cli` through the bundled `playwright_cli.sh` wrapper |
| MCP stance | Do not use Playwright MCP unless the user explicitly asks for it |
| Scope | Update only skill wording and UI metadata |
| Resources | Reuse the existing wrapper script and references |

## Architecture

The current skill already automates browsers via `playwright-cli`, but the trigger text and UI metadata do not strongly contrast that workflow against MCP-based browser automation. The change is documentation-only:

1. Rewrite the frontmatter description so the trigger condition clearly says to use CLI automation rather than Playwright MCP.
2. Add a top-level rule in the skill body that states the skill is CLI-first and MCP is opt-in only.
3. Update `agents/openai.yaml` so the visible short description and default prompt reinforce the same rule.
4. Leave scripts and references unchanged because the existing wrapper and workflow docs already match the intended behavior.

## UX Notes

- Keeping the skill name as `playwright` preserves current discoverability and avoids breaking any existing references.
- Making MCP opt-in instead of forbidden keeps an escape hatch for explicit user requests.
- The shortest reliable signal is the frontmatter description because it affects whether the skill triggers at all.

## Files Touched

| File | Change |
|------|--------|
| `~/.codex/skills/playwright/SKILL.md` | Make trigger text and guardrails explicitly CLI-first and non-MCP by default |
| `~/.codex/skills/playwright/agents/openai.yaml` | Update UI-facing description and prompt to mention CLI-only default behavior |
