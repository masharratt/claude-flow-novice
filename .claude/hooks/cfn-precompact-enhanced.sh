#!/usr/bin/env bash
set -euo pipefail

# Enhanced PreCompact Hook for Claude Code
# Preserves context before conversation compaction
# Exit 0 always to ensure non-blocking behavior

# Overall script timeout (9 seconds, allowing 1 second buffer)
(
sleep 9
kill -TERM $$ 2>/dev/null || true
) &
TIMEOUT_PID=$!

SCRIPT_START=$(date +%s)
TIMEOUT_SECONDS=2

# Timeout wrapper for all operations
timeout_wrapper() {
    timeout ${TIMEOUT_SECONDS}s "$@" 2>/dev/null || true
}

# Ensure we kill timeout watcher on exit
trap "kill $TIMEOUT_PID 2>/dev/null || true" EXIT

# Setup
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
ARTIFACTS_DIR="${PROJECT_DIR}/.artifacts/precompact"
TIMESTAMP=$(date +%s)
SESSION_FILE="${ARTIFACTS_DIR}/session-${TIMESTAMP}.json"

# Create artifacts directory
mkdir -p "${ARTIFACTS_DIR}" 2>/dev/null || true

# Parse INPUT from stdin (if available) - non-blocking read
if [ -t 0 ]; then
    # No stdin available (terminal)
    INPUT="{}"
else
    # Read from stdin with timeout
    INPUT=$(timeout 1s cat 2>/dev/null || echo "{}")
fi

COMPACT_TYPE=$(echo "$INPUT" | jq -r '.compact_type // .type // "unknown"' 2>/dev/null || echo "unknown")
CUSTOM_INSTRUCTIONS=$(echo "$INPUT" | jq -r '.custom_instructions // ""' 2>/dev/null || echo "")

# Check for transcript path (if available from environment)
TRANSCRIPT_PATH="${TRANSCRIPT_PATH:-}"

# Initialize context object
CONTEXT="{}"

# === GIT STATE PRESERVATION ===
git_available() {
    command -v git >/dev/null 2>&1 && [ -d "${PROJECT_DIR}/.git" ]
}

# Defaults for every git-derived variable. These used to be assigned ONLY inside
# the `if git_available` block below, but they are read unconditionally further
# down (MODIFIED_COUNT at the APPROX_TOKENS check, GIT_UNCOMMITTED_COUNT in the
# work-indicator check, MODIFIED_FILES/STAGED_FILES/GIT_RECENT_COMMITS in the
# final jq). Outside a git repository that branch is skipped and `set -u` killed
# the script on the first such read -- exit 1, zero output, no context preserved.
GIT_BRANCH="unknown"
GIT_STATUS=""
GIT_UNCOMMITTED_COUNT=0
GIT_LAST_COMMIT="unknown"
GIT_RECENT_COMMITS=""
MODIFIED_FILES=""
MODIFIED_COUNT=0
STAGED_FILES=""
STAGED_COUNT=0

if git_available; then
    GIT_BRANCH=$(timeout_wrapper git -C "${PROJECT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_STATUS=$(timeout_wrapper git -C "${PROJECT_DIR}" status --short 2>/dev/null || echo "")
    GIT_UNCOMMITTED_COUNT=$(echo "$GIT_STATUS" | grep -c "^" 2>/dev/null || echo "0")

    # Recent commits
    GIT_LAST_COMMIT=$(timeout_wrapper git -C "${PROJECT_DIR}" log -1 --pretty=format:"%h - %s (%ar)" 2>/dev/null || echo "unknown")
    GIT_RECENT_COMMITS=$(timeout_wrapper git -C "${PROJECT_DIR}" log -5 --pretty=format:"%h - %s" 2>/dev/null || echo "")

    # Modified files
    MODIFIED_FILES=$(timeout_wrapper git -C "${PROJECT_DIR}" diff --name-only HEAD 2>/dev/null | head -20 || echo "")
    MODIFIED_COUNT=$(echo "$MODIFIED_FILES" | grep -c "^" 2>/dev/null || echo "0")

    # Staged files
    STAGED_FILES=$(timeout_wrapper git -C "${PROJECT_DIR}" diff --cached --name-only 2>/dev/null | head -20 || echo "")
    STAGED_COUNT=$(echo "$STAGED_FILES" | grep -c "^" 2>/dev/null || echo "0")

    CONTEXT=$(echo "$CONTEXT" | jq --arg branch "$GIT_BRANCH" \
        --arg last_commit "$GIT_LAST_COMMIT" \
        --arg uncommitted "$GIT_UNCOMMITTED_COUNT" \
        --arg modified "$MODIFIED_COUNT" \
        --arg staged "$STAGED_COUNT" \
        '. + {git: {branch: $branch, last_commit: $last_commit, uncommitted_files: $uncommitted, modified_files: $modified, staged_files: $staged}}' 2>/dev/null || echo "$CONTEXT")
fi

# === TODO PRESERVATION ===
TODO_FILES=()
for todo_path in ".claude/todos.json" "TODO.md" ".todos" "todos.json"; do
    if [ -f "${PROJECT_DIR}/${todo_path}" ]; then
        TODO_FILES+=("$todo_path")
        # Copy to artifacts
        cp "${PROJECT_DIR}/${todo_path}" "${ARTIFACTS_DIR}/backup-${todo_path##*/}-${TIMESTAMP}" 2>/dev/null || true
    fi
done

TODO_COUNT=${#TODO_FILES[@]}
CONTEXT=$(echo "$CONTEXT" | jq --arg count "$TODO_COUNT" '. + {todos: {files_found: $count}}' 2>/dev/null || echo "$CONTEXT")

# === SESSION METRICS ===
# Count recently modified files in artifacts and project (with timeout to avoid hanging on slow mounts)
# Only search specific directories to avoid slow Windows mount traversal
RECENT_EDITS=0
for dir in "src" ".claude" "tests" "scripts"; do
    if [ -d "${PROJECT_DIR}/${dir}" ]; then
        DIR_COUNT=$(timeout 1s find "${PROJECT_DIR}/${dir}" -maxdepth 2 -type f -mmin -60 \( -name "*.ts" -o -name "*.js" -o -name "*.sh" -o -name "*.md" \) 2>/dev/null | wc -l)
        DIR_COUNT=${DIR_COUNT:-0}
        RECENT_EDITS=$((RECENT_EDITS + DIR_COUNT))
    fi
done

# Check for common work indicators
TESTS_RUN=false
TEST_STATUS="none"
if [ -d "${PROJECT_DIR}/.artifacts/test-results" ]; then
    RECENT_TEST_FILES=$(timeout_wrapper find "${PROJECT_DIR}/.artifacts/test-results" -type f -mmin -60 2>/dev/null | wc -l || echo "0")
    if [ "$RECENT_TEST_FILES" -gt 0 ]; then
        TESTS_RUN=true
        # Try to extract test pass/fail status
        LATEST_TEST_LOG=$(timeout_wrapper find "${PROJECT_DIR}/.artifacts/test-results" -type f -mmin -60 -name "*.log" 2>/dev/null | head -1)
        if [ -n "$LATEST_TEST_LOG" ] && [ -f "$LATEST_TEST_LOG" ]; then
            if grep -q "All tests passed" "$LATEST_TEST_LOG" 2>/dev/null; then
                TEST_STATUS="passing"
            elif grep -q "FAIL" "$LATEST_TEST_LOG" 2>/dev/null; then
                TEST_STATUS="failing"
            else
                TEST_STATUS="unknown"
            fi
        fi
    fi
fi

# Estimate session duration from git log (more reliable than file times on Windows mounts)
SESSION_DURATION="unknown"
if git_available; then
    FIRST_COMMIT_TODAY=$(timeout_wrapper git -C "${PROJECT_DIR}" log --since="24 hours ago" --format=%ct --reverse 2>/dev/null | head -1 || echo "")
    if [ -n "$FIRST_COMMIT_TODAY" ]; then
        DURATION_MIN=$(( (SCRIPT_START - FIRST_COMMIT_TODAY) / 60 ))
        if [ "$DURATION_MIN" -lt 60 ]; then
            SESSION_DURATION="${DURATION_MIN} minutes"
        else
            DURATION_HOURS=$((DURATION_MIN / 60))
            SESSION_DURATION="${DURATION_HOURS} hour(s)"
        fi
    fi
fi

# Tool usage extraction (if transcript available)
TOOL_COUNT=0
BASH_CALLS=0
EDIT_CALLS=0
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    TOOL_COUNT=$(timeout_wrapper grep -c '"type":"tool_use"' "$TRANSCRIPT_PATH" 2>/dev/null || echo "0")
    BASH_CALLS=$(timeout_wrapper grep -c '"name":"Bash"' "$TRANSCRIPT_PATH" 2>/dev/null || echo "0")
    EDIT_CALLS=$(timeout_wrapper grep -c '"name":"Edit"' "$TRANSCRIPT_PATH" 2>/dev/null || echo "0")
fi

# Approximate token usage (very rough estimate based on file changes)
APPROX_TOKENS="unknown"
if [ "$MODIFIED_COUNT" -gt 0 ]; then
    # Rough: 100 tokens per modified file + 50 per Bash call + 200 per Edit
    APPROX_TOKENS=$((MODIFIED_COUNT * 100 + BASH_CALLS * 50 + EDIT_CALLS * 200))
fi

CONTEXT=$(echo "$CONTEXT" | jq --arg recent "$RECENT_EDITS" \
    --arg duration "$SESSION_DURATION" \
    --argjson tests "$TESTS_RUN" \
    --arg test_status "$TEST_STATUS" \
    --arg tool_count "$TOOL_COUNT" \
    --arg bash_calls "$BASH_CALLS" \
    --arg edit_calls "$EDIT_CALLS" \
    --arg approx_tokens "$APPROX_TOKENS" \
    '. + {session: {recent_file_edits: $recent, estimated_duration: $duration, tests_run: $tests, test_status: $test_status, tool_count: $tool_count, bash_calls: $bash_calls, edit_calls: $edit_calls, approx_tokens: $approx_tokens}}' 2>/dev/null || echo "$CONTEXT")

# === IN-PROGRESS WORK DETECTION ===
WORK_INDICATORS=()
[ -f "${PROJECT_DIR}/.artifacts/runtime/task-in-progress" ] && WORK_INDICATORS+=("Task in progress")
[ -f "${PROJECT_DIR}/.claude/agents/spawned" ] && WORK_INDICATORS+=("Agents spawned")
[ "$GIT_UNCOMMITTED_COUNT" -gt 0 ] && WORK_INDICATORS+=("Uncommitted changes")

# Check for CFN Loop state
if [ -f "${PROJECT_DIR}/.artifacts/runtime/cfn-loop-state.json" ]; then
    LOOP_STATUS=$(timeout_wrapper jq -r '.status // "unknown"' "${PROJECT_DIR}/.artifacts/runtime/cfn-loop-state.json" 2>/dev/null || echo "unknown")
    [ "$LOOP_STATUS" != "unknown" ] && WORK_INDICATORS+=("CFN Loop: ${LOOP_STATUS}")
fi

# Check for Redis coordination (CLI mode)
if command -v redis-cli >/dev/null 2>&1; then
    REDIS_TASKS=$(timeout_wrapper redis-cli --scan --pattern "cfn:task:*" 2>/dev/null | wc -l || echo "0")
    [ "$REDIS_TASKS" -gt 0 ] && WORK_INDICATORS+=("${REDIS_TASKS} active CFN task(s)")
fi

# Check for running Docker containers
if command -v docker >/dev/null 2>&1; then
    CFN_CONTAINERS=$(timeout_wrapper docker ps --filter "name=cfn-" --format "{{.Names}}" 2>/dev/null | wc -l || echo "0")
    [ "$CFN_CONTAINERS" -gt 0 ] && WORK_INDICATORS+=("${CFN_CONTAINERS} CFN container(s) running")
fi

# Check for recent backups (pre-edit)
if [ -d "${PROJECT_DIR}/.artifacts/backups" ]; then
    RECENT_BACKUPS=$(timeout_wrapper find "${PROJECT_DIR}/.artifacts/backups" -type f -mmin -60 2>/dev/null | wc -l || echo "0")
    [ "$RECENT_BACKUPS" -gt 0 ] && WORK_INDICATORS+=("${RECENT_BACKUPS} recent backup(s)")
fi

# === GENERATE OUTPUT FOR CLAUDE ===
echo ""
echo "=== PRE-COMPACT CONTEXT PRESERVATION ==="
echo ""
echo "Compact Type: ${COMPACT_TYPE}"
[ -n "$CUSTOM_INSTRUCTIONS" ] && echo "Custom Instructions: ${CUSTOM_INSTRUCTIONS}"
echo ""

if git_available; then
    echo "Git State:"
    echo "  Branch: ${GIT_BRANCH}"
    echo "  Uncommitted: ${GIT_UNCOMMITTED_COUNT} files"
    [ "$MODIFIED_COUNT" -gt 0 ] && echo "  Modified: ${MODIFIED_COUNT} files"
    [ "$STAGED_COUNT" -gt 0 ] && echo "  Staged: ${STAGED_COUNT} files"
    echo "  Last commit: ${GIT_LAST_COMMIT}"
    echo ""
fi

echo "Session Summary:"
echo "  Recent file edits: ${RECENT_EDITS}"
echo "  Duration: ${SESSION_DURATION}"
echo "  Tests run: ${TESTS_RUN}"
[ "$TEST_STATUS" != "none" ] && echo "  Test status: ${TEST_STATUS}"
[ "$TOOL_COUNT" -gt 0 ] && echo "  Tools used: ${TOOL_COUNT} (Bash: ${BASH_CALLS}, Edit: ${EDIT_CALLS})"
[ "$APPROX_TOKENS" != "unknown" ] && echo "  Approx tokens: ~${APPROX_TOKENS}"
[ ${#WORK_INDICATORS[@]} -gt 0 ] && echo "  In-progress work: ${WORK_INDICATORS[*]}"
echo ""

if [ ${#TODO_FILES[@]} -gt 0 ]; then
    echo "Todo Files Preserved:"
    for todo in "${TODO_FILES[@]}"; do
        echo "  - ${todo}"
    done
    echo ""
fi

if git_available && [ "$MODIFIED_COUNT" -gt 0 ]; then
    echo "Recently Modified Files:"
    echo "$MODIFIED_FILES" | head -10 | sed 's/^/  - /'
    [ "$MODIFIED_COUNT" -gt 10 ] && echo "  ... and $(($MODIFIED_COUNT - 10)) more"
    echo ""
fi

echo "Key Context:"
echo "  - Working directory: ${PROJECT_DIR}"
if [ ${#WORK_INDICATORS[@]} -gt 0 ]; then
    for indicator in "${WORK_INDICATORS[@]}"; do
        echo "  - ${indicator}"
    done
fi
echo ""

echo "Full context saved to: ${SESSION_FILE#${PROJECT_DIR}/}"
echo ""

# Decision log: inject relevant prior decisions based on what we've been working on
if [ -f "$HOME/.claude/decision-log/decisions.db" ] && [ -n "${MODIFIED_FILES:-}" ]; then
    PROJECT_NAME=$(basename "$(git -C "${PROJECT_DIR}" rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || basename "${PROJECT_DIR}")
    WORK_TERMS=$(echo "$MODIFIED_FILES" | head -5 | sed 's|.*/||; s|\.[^.]*$||; s|[-_]| |g' | tr '\n' ' ')
    PRIOR_DECISIONS=$(timeout 2s "$HOME/.claude/skills/decision-log/query.sh" "$WORK_TERMS" 3 "$PROJECT_NAME" 2>/dev/null || echo "")
    if [ -n "$PRIOR_DECISIONS" ]; then
        echo "=== PRIOR DECISIONS (related to current work) ==="
        echo "$PRIOR_DECISIONS" | head -10
        echo ""
    fi
fi

echo "=== CLAUDE.md REMINDERS ==="
echo "• Use CFN Loop for multi-step tasks"
echo "• Batch operations in single messages"
echo "• Pre-edit backup required before edits"
echo "• Run tests before commits"
echo "• Use service names in Docker networks"
echo ""

# === SAVE DETAILED JSON LOG ===
FINAL_CONTEXT=$(echo "$CONTEXT" | jq --arg type "$COMPACT_TYPE" \
    --arg custom "$CUSTOM_INSTRUCTIONS" \
    --arg timestamp "$TIMESTAMP" \
    --argjson indicators "$(printf '%s\n' "${WORK_INDICATORS[@]}" | jq -R . | jq -s . 2>/dev/null || echo '[]')" \
    --arg modified_files "$MODIFIED_FILES" \
    --arg staged_files "$STAGED_FILES" \
    --arg recent_commits "$GIT_RECENT_COMMITS" \
    '. + {
        compact_type: $type,
        custom_instructions: $custom,
        timestamp: $timestamp,
        work_indicators: $indicators,
        git: (.git + {modified_file_list: $modified_files, staged_file_list: $staged_files, recent_commits: $recent_commits})
    }' 2>/dev/null || echo "$CONTEXT")

echo "$FINAL_CONTEXT" > "${SESSION_FILE}" 2>/dev/null || true

# Always exit 0 (non-blocking)
exit 0
