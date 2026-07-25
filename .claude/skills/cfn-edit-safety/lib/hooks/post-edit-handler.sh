#!/bin/bash

# Post-Edit Hook Handler - Sprint 2.2
# Reusable wrapper for post-edit-pipeline.js with automatic feedback capture
#
# Usage:
#   ./post-edit-handler.sh <file_path> [--memory-key <key>] [--agent-id <id>] [--coordinator-id <id>]
#
# Examples:
#   ./post-edit-handler.sh src/example.js --memory-key "swarm/coder-1/step-2"
#   ./post-edit-handler.sh test.js --agent-id "coder-1" --coordinator-id "coordinator-cfn"

set -euo pipefail

# Resolve the canonical pipeline by absolute path. This script is reached from
# every project through the ~/.claude/skills reverse symlink, so readlink -f
# first or SCRIPT_DIR lands in $HOME; then prefer git for the repo root and fall
# back to the known depth (.claude/skills/cfn-edit-safety/lib/hooks -> repo).
# The previous `node config/hooks/post-edit-pipeline.js` was cwd-relative and
# resolved only when the caller happened to be sitting in the CFN repo root.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$REPO_ROOT" ] || REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
POST_EDIT_PIPELINE="$REPO_ROOT/.claude/hooks/post-edit-pipeline.js"

# Parse arguments
FILE_PATH=""
MEMORY_KEY=""
AGENT_ID=""
COORDINATOR_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --memory-key)
            MEMORY_KEY="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --coordinator-id)
            COORDINATOR_ID="$2"
            shift 2
            ;;
        *)
            if [ -z "$FILE_PATH" ]; then
                FILE_PATH="$1"
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [ -z "$FILE_PATH" ]; then
    echo "Error: File path required"
    echo "Usage: $0 <file_path> [--memory-key <key>] [--agent-id <id>] [--coordinator-id <id>]"
    exit 1
fi

# Auto-detect agent context from memory key if not provided
if [ -z "$AGENT_ID" ] && [ -n "$MEMORY_KEY" ]; then
    # Extract agent ID from memory key pattern: swarm/{agentId}/...
    AGENT_ID=$(echo "$MEMORY_KEY" | grep -oP 'swarm/\K[^/]+' || echo "")
fi

# Set default memory key if not provided
if [ -z "$MEMORY_KEY" ]; then
    MEMORY_KEY="swarm/${AGENT_ID:-unknown}/hook-pipeline"
fi

# Build command arguments
CMD_ARGS="$FILE_PATH --memory-key $MEMORY_KEY"
if [ -n "$AGENT_ID" ]; then
    CMD_ARGS="$CMD_ARGS --agent-id $AGENT_ID"
fi
if [ -n "$COORDINATOR_ID" ]; then
    CMD_ARGS="$CMD_ARGS --coordinator-id $COORDINATOR_ID"
fi

echo "Executing post-edit pipeline: $FILE_PATH"
echo "Memory key: $MEMORY_KEY"
[ -n "$AGENT_ID" ] && echo "Agent ID: $AGENT_ID"
[ -n "$COORDINATOR_ID" ] && echo "Coordinator ID: $COORDINATOR_ID"

# Execute post-edit pipeline
set +e  # Temporarily disable exit on error to capture exit code
node "$POST_EDIT_PIPELINE" $CMD_ARGS
EXIT_CODE=$?
set -e  # Re-enable exit on error

# Extract feedback from log
LOG_FILE=".artifacts/logs/post-edit-pipeline.log"
if [ ! -f "$LOG_FILE" ]; then
    echo "Warning: Log file not found: $LOG_FILE"
    exit $EXIT_CODE
fi

LAST_LOG_ENTRY=$(tail -n 1 "$LOG_FILE")
STATUS=$(echo "$LAST_LOG_ENTRY" | jq -r '.status // "NO_STATUS"' 2>/dev/null || echo "NO_STATUS")

echo "Validation status: $STATUS"

# Handle feedback types
case "$STATUS" in
    "ROOT_WARNING")
        echo "⚠️  ROOT_WARNING detected - automatic resolution available"
        FEEDBACK_DIR=".artifacts/feedback"
        mkdir -p "$FEEDBACK_DIR"
        echo "$LAST_LOG_ENTRY" > "$FEEDBACK_DIR/pending-root-warning.json"
        echo "Feedback saved to: $FEEDBACK_DIR/pending-root-warning.json"
        echo "Run: ./claude/skills/hook-pipeline/feedback-resolver.sh --type ROOT_WARNING --auto-resolve"
        exit 2  # Special exit code for ROOT_WARNING
        ;;
    "TDD_VIOLATION")
        echo "⚠️  TDD_VIOLATION detected - test file missing or incomplete"
        FEEDBACK_DIR=".artifacts/feedback"
        mkdir -p "$FEEDBACK_DIR"
        echo "$LAST_LOG_ENTRY" > "$FEEDBACK_DIR/pending-tdd-violation.json"
        echo "Feedback saved to: $FEEDBACK_DIR/pending-tdd-violation.json"
        echo "Run: ./claude/skills/hook-pipeline/feedback-resolver.sh --type TDD_VIOLATION"
        exit 3  # Special exit code for TDD_VIOLATION
        ;;
    "LOW_COVERAGE")
        echo "⚠️  LOW_COVERAGE detected - test coverage below threshold"
        CURRENT=$(echo "$LAST_LOG_ENTRY" | jq -r '.current // 0')
        REQUIRED=$(echo "$LAST_LOG_ENTRY" | jq -r '.required // 80')
        echo "Current coverage: $CURRENT% (required: $REQUIRED%)"
        FEEDBACK_DIR=".artifacts/feedback"
        mkdir -p "$FEEDBACK_DIR"
        echo "$LAST_LOG_ENTRY" > "$FEEDBACK_DIR/pending-low-coverage.json"
        exit 4  # Special exit code for LOW_COVERAGE
        ;;
    "RUST_QUALITY")
        echo "⚠️  RUST_QUALITY issues detected - run cargo clippy and rustfmt"
        FEEDBACK_DIR=".artifacts/feedback"
        mkdir -p "$FEEDBACK_DIR"
        echo "$LAST_LOG_ENTRY" > "$FEEDBACK_DIR/pending-rust-quality.json"
        echo "Run: ./claude/skills/hook-pipeline/feedback-resolver.sh --type RUST_QUALITY --auto-resolve"
        exit 5  # Special exit code for RUST_QUALITY
        ;;
    "LINT_ISSUES")
        echo "⚠️  LINT_ISSUES detected - run linter auto-fix"
        FEEDBACK_DIR=".artifacts/feedback"
        mkdir -p "$FEEDBACK_DIR"
        echo "$LAST_LOG_ENTRY" > "$FEEDBACK_DIR/pending-lint-issues.json"
        echo "Run: ./claude/skills/hook-pipeline/feedback-resolver.sh --type LINT_ISSUES --auto-resolve"
        exit 6  # Special exit code for LINT_ISSUES
        ;;
    "NO_STATUS"|"SUCCESS"|"IMPROVEMENTS_SUGGESTED")
        echo "✅ Validation passed"
        [[ "$STATUS" == "IMPROVEMENTS_SUGGESTED" ]] && echo "ℹ️  Some improvements were suggested but no issues found"
        ;;
    *)
        echo "⚠️  Unknown status: $STATUS"
        ;;
esac

# Publish completion to Redis (if agent context available)
if [ -n "$AGENT_ID" ]; then
    REDIS_CHANNEL="swarm:skills:sprint-2.2:${AGENT_ID}:hooks"
    redis-cli lpush "$REDIS_CHANNEL" "{\"file\": \"$FILE_PATH\", \"status\": \"$STATUS\", \"timestamp\": $(date +%s)}" >/dev/null 2>&1 || true
fi

exit $EXIT_CODE