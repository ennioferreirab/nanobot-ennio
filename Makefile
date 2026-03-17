# ─── Mission Control ──────────────────────────────────────────────
#
# make start       Start the full stack (Convex + Next.js + Gateway)
# make down        Stop everything
# make status      Show system health
#
# make test        Unit tests only (no Convex needed, worktree-safe)
# make validate    Lint + typecheck + unit tests (worktree-safe)
# make takeover    Stop any running stack, start from current tree
#
# make lint        Ruff + ESLint
# make typecheck   Pyright + tsc
# make format      Format all code
# ──────────────────────────────────────────────────────────────────

.PHONY: start down status test validate takeover lint typecheck format \
        test-py test-ts lint-py lint-ts typecheck-py typecheck-ts format-py format-ts

# ─── Stack lifecycle ──────────────────────────────────────────────

start:
	@uv run python -m boot mc start

down:
	@uv run python -m boot mc down

status:
	@uv run python -m boot mc status

# Stop any running MC instance, then start from current directory.
# Use this from a worktree to take over the Convex local backend.
takeover: down
	@sleep 2
	@uv run python -m boot mc start

# ─── Testing ──────────────────────────────────────────────────────
# Unit tests are fully mocked — no Convex needed.
# Safe to run from worktrees without touching the running stack.

test: test-py test-ts

test-py:
	uv run pytest

test-ts:
	cd dashboard && npm run test

# ─── Validation (pre-commit / pre-merge) ─────────────────────────
# Runs everything that doesn't need a running stack.

validate: lint typecheck test

# ─── Linting ──────────────────────────────────────────────────────

lint: lint-py lint-ts

lint-py:
	uv run ruff format --check mc/ tests/mc/
	uv run ruff check mc/ tests/mc/

lint-ts:
	cd dashboard && npm run lint

# ─── Type checking ────────────────────────────────────────────────

typecheck: typecheck-py typecheck-ts

typecheck-py:
	uv run pyright mc/

typecheck-ts:
	cd dashboard && npm run typecheck

# ─── Formatting ───────────────────────────────────────────────────

format: format-py format-ts

format-py:
	uv run ruff format mc/ tests/mc/

format-ts:
	cd dashboard && npm run format
