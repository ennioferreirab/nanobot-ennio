# ─── Open Control ────────────────────────────────────────────────
#
# make start       Start attached — logs stream to terminal (Ctrl+C to stop)
# make up          Start detached — runs in background
# make down        Stop everything
#
# make test        Fast unit tests only (no Convex needed, worktree-safe)
# make test-full   Fast + slow unit tests (no Convex needed, worktree-safe)
# make check       Fast lint + typecheck + tests (worktree-safe)
# make check-full  Full lint + typecheck + tests (worktree-safe)
#
# make docker-test       Spin up isolated test instance (auto-detects ports)
# make docker-test-down  Stop the test instance
#
# make install      Install local dependencies (for make check)
# make lint         Ruff + ESLint
# make typecheck    Pyright + tsc
# make format       Format all code
# ──────────────────────────────────────────────────────────────────

.PHONY: install start up down test test-full check check-full \
        test-py test-py-full test-ts test-ts-full lint lint-py lint-ts typecheck typecheck-py typecheck-ts \
        format format-py format-ts \
        docker-test docker-test-down

# ─── Setup ───────────────────────────────────────────────────────

install:
	uv sync --group dev
	cd dashboard && npm ci

# ─── Stack lifecycle (Docker Compose) ────────────────────────────

start:
	@bash scripts/extract-claude-credentials.sh 2>/dev/null || true
	@docker compose up --build

up:
	@bash scripts/extract-claude-credentials.sh 2>/dev/null || true
	@docker compose up --build -d

down:
	@docker compose down

# ─── Testing ──────────────────────────────────────────────────────
# Unit tests are fully mocked — no Convex needed.
# Safe to run locally without Docker.

test: test-py test-ts

test-full: test-py-full test-ts-full

test-py:
	uv run pytest

test-py-full:
	uv run pytest -o addopts="-m 'not integration'"

test-ts:
	cd dashboard && npm run test

test-ts-full:
	cd dashboard && npm run test:full

# ─── Validation (pre-commit / pre-merge) ─────────────────────────
# Runs everything that doesn't need a running stack.

check: lint typecheck test

check-full: lint typecheck test-full

# ─── Linting ──────────────────────────────────────────────────────

lint: lint-py lint-ts

lint-py:
	uv run ruff format --check mc/ tests/mc/
	uv run ruff check mc/ tests/mc/

lint-ts:
	cd dashboard && npx prettier --check .
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

# ─── Docker (isolated test instances) ────────────────────────────

docker-test:
	@bash scripts/docker-test.sh

docker-test-down:
	@bash scripts/docker-test.sh down
