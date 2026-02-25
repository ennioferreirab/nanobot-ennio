#!/bin/bash
set -e

PROJECT_DIR="/Users/ennio/Documents/nanobot-ennio"
WORKTREE_DIR="$PROJECT_DIR/.claude/worktrees"
BASE_BRANCH="novo-plano"
MODEL="gpt-5.3-codex"

cd "$PROJECT_DIR"
mkdir -p "$WORKTREE_DIR"

# Helper: build codex prompt from story file
make_prompt() {
  local story_file="$1"
  cat <<PROMPT
You are implementing a story for the nanobot-ennio project.

READ the story file at $story_file — it contains ALL context you need.

Execute ALL tasks and subtasks:
1. Implement each task, checking off subtasks as you go
2. Write tests as specified in the testing strategy
3. Run tests: cd dashboard && npx vitest run (TS) / uv run pytest nanobot/mc/ (Python)
4. Update the story file: check off tasks, fill Dev Agent Record

CRITICAL RULES:
- Follow dev notes EXACTLY — they specify files to create/modify
- Use existing codebase patterns (see references section)
- Run tests after each major task
- Do NOT modify files outside this story's scope
PROMPT
}

# Helper: run codex on a worktree
run_story() {
  local worktree="$1"
  local story_file="$2"
  local prompt
  prompt=$(make_prompt "$story_file")
  echo "[$(date +%H:%M:%S)] Starting: $story_file"
  codex exec -C "$worktree" -m "$MODEL" -s workspace-write "$prompt"
  echo "[$(date +%H:%M:%S)] Finished: $story_file"
}

# Helper: merge a branch into base
merge_branch() {
  local branch="$1"
  echo "Merging $branch..."
  git checkout "$BASE_BRANCH"
  git merge "$branch" --no-edit || {
    echo "CONFLICT merging $branch — resolve manually then run: git merge --continue"
    echo "After resolving, re-run this script from the current wave."
    exit 1
  }
}

# Helper: run all tests
run_tests() {
  echo "Running integrated tests..."
  (cd "$PROJECT_DIR/dashboard" && npx vitest run) || { echo "TS tests failed!"; exit 1; }
  (cd "$PROJECT_DIR" && uv run pytest nanobot/mc/) || { echo "Python tests failed!"; exit 1; }
  echo "All tests passed."
}

# Helper: cleanup worktree and branch
cleanup_worktree() {
  local name="$1"
  git worktree remove "$WORKTREE_DIR/$name" --force 2>/dev/null || true
  git branch -D "story/$name" 2>/dev/null || true
}

# ============================================
# WAVE 1: 2.1 (dispatch) + 2.4 (thread)
# ============================================
echo ""
echo "========================================="
echo "  WAVE 1: Stories 2.1 + 2.4"
echo "========================================="
BASE_COMMIT=$(git rev-parse HEAD)

git worktree add "$WORKTREE_DIR/2-1" -b story/2-1 "$BASE_COMMIT"
git worktree add "$WORKTREE_DIR/2-4" -b story/2-4 "$BASE_COMMIT"

run_story "$WORKTREE_DIR/2-1" "_bmad-output/implementation-artifacts/2-1-dispatch-steps-in-autonomous-mode.md" &
PID_21=$!
run_story "$WORKTREE_DIR/2-4" "_bmad-output/implementation-artifacts/2-4-build-unified-thread-per-task.md" &
PID_24=$!

wait $PID_21 || { echo "Story 2.1 FAILED"; exit 1; }
wait $PID_24 || { echo "Story 2.4 FAILED"; exit 1; }

merge_branch "story/2-4"
merge_branch "story/2-1"
run_tests
cleanup_worktree "2-1"
cleanup_worktree "2-4"
git commit --allow-empty -m "wave-1: Stories 2.1 + 2.4 merged and tested" 2>/dev/null || true

# ============================================
# WAVE 2: 2.2 (subprocesses) + 2.5 (completion)
# ============================================
echo ""
echo "========================================="
echo "  WAVE 2: Stories 2.2 + 2.5"
echo "========================================="
BASE_COMMIT=$(git rev-parse HEAD)

git worktree add "$WORKTREE_DIR/2-2" -b story/2-2 "$BASE_COMMIT"
git worktree add "$WORKTREE_DIR/2-5" -b story/2-5 "$BASE_COMMIT"

run_story "$WORKTREE_DIR/2-2" "_bmad-output/implementation-artifacts/2-2-execute-steps-as-agent-subprocesses.md" &
PID_22=$!
run_story "$WORKTREE_DIR/2-5" "_bmad-output/implementation-artifacts/2-5-post-structured-completion-messages.md" &
PID_25=$!

wait $PID_22 || { echo "Story 2.2 FAILED"; exit 1; }
wait $PID_25 || { echo "Story 2.5 FAILED"; exit 1; }

merge_branch "story/2-5"
merge_branch "story/2-2"
run_tests
cleanup_worktree "2-2"
cleanup_worktree "2-5"
git commit --allow-empty -m "wave-2: Stories 2.2 + 2.5 merged and tested" 2>/dev/null || true

# ============================================
# WAVE 3a: 2.6 (context) + 2.7 (UI)
# ============================================
echo ""
echo "========================================="
echo "  WAVE 3a: Stories 2.6 + 2.7"
echo "========================================="
BASE_COMMIT=$(git rev-parse HEAD)

git worktree add "$WORKTREE_DIR/2-6" -b story/2-6 "$BASE_COMMIT"
git worktree add "$WORKTREE_DIR/2-7" -b story/2-7 "$BASE_COMMIT"

run_story "$WORKTREE_DIR/2-6" "_bmad-output/implementation-artifacts/2-6-build-thread-context-for-agents.md" &
PID_26=$!
run_story "$WORKTREE_DIR/2-7" "_bmad-output/implementation-artifacts/2-7-render-thread-view-in-real-time.md" &
PID_27=$!

wait $PID_26 || { echo "Story 2.6 FAILED"; exit 1; }
wait $PID_27 || { echo "Story 2.7 FAILED"; exit 1; }

merge_branch "story/2-6"
merge_branch "story/2-7"
run_tests
cleanup_worktree "2-6"
cleanup_worktree "2-7"
git commit --allow-empty -m "wave-3a: Stories 2.6 + 2.7 merged and tested" 2>/dev/null || true

# ============================================
# WAVE 3b: 2.3 (auto-unblock) — depends on all prior
# ============================================
echo ""
echo "========================================="
echo "  WAVE 3b: Story 2.3"
echo "========================================="
BASE_COMMIT=$(git rev-parse HEAD)

git worktree add "$WORKTREE_DIR/2-3" -b story/2-3 "$BASE_COMMIT"

run_story "$WORKTREE_DIR/2-3" "_bmad-output/implementation-artifacts/2-3-auto-unblock-dependent-steps.md"

merge_branch "story/2-3"
run_tests
cleanup_worktree "2-3"

# ============================================
# FINAL
# ============================================
echo ""
echo "========================================="
echo "  EPIC 2 COMPLETE"
echo "========================================="
echo ""
echo "All 7 stories implemented and merged into $BASE_BRANCH."
echo ""
echo "Next steps:"
echo "  1. Review: git log --oneline -20"
echo "  2. Update sprint-status.yaml (all stories -> done)"
echo "  3. Run /bmad-bmm-code-review on each story"
echo "  4. Consider /bmad-bmm-retrospective for Epic 2"
