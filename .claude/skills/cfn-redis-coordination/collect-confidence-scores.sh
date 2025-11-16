#!/bin/bash
#
# Collect Confidence Scores - Stateless Agent Coordination
#
# Extracts confidence scores from multiple agents after they exit.
# Replaces the 'collect' function from invoke-waiting-mode.sh for stateless architecture.
#
# Usage:
#   ./collect-confidence-scores.sh --task-id <task> --agent-ids <id1,id2,id3> [--min-quorum <0.66|66%|2>] [--namespace swarm]
#
# Returns:
#   Average confidence score (0.0-1.0) to stdout
#   Verbose messages to stderr
#
# Exit Codes:
#   0 - Success (consensus calculated)
#   1 - Quorum not met or missing required parameters

set -euo pipefail

# Source centralized Redis functions (provides graceful fallback for Task mode)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/redis-functions.sh"

# Debug mode (set DEBUG=true for verbose output)
DEBUG="${DEBUG:-false}"

# Parse arguments
TASK_ID=""
AGENT_IDS=""
MIN_QUORUM=""
NAMESPACE="swarm"

while [[ $# -gt 0 ]]; do
    case $1 in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --agent-ids)
            AGENT_IDS="$2"
            shift 2
            ;;
        --min-quorum)
            MIN_QUORUM="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$TASK_ID" ] || [ -z "$AGENT_IDS" ]; then
    echo "Error: collect-confidence-scores requires --task-id and --agent-ids" >&2
    echo "" >&2
    echo "Usage:" >&2
    echo "  ./collect-confidence-scores.sh --task-id <task> --agent-ids <id1,id2,id3> [--min-quorum <0.66|66%|2>]" >&2
    exit 1
fi

# Output verbose messages to stderr
echo "[Coordinator] Collecting confidence scores from agents..." >&2
echo "" >&2

# Split agent IDs
IFS=',' read -ra AGENTS <<< "$AGENT_IDS"

RESULTS=()
CONFIDENCES=()
ALL_FEEDBACK=()

for AGENT in "${AGENTS[@]}"; do
    RESULT_KEY="${NAMESPACE}:${TASK_ID}:${AGENT}:result"

    # Get latest result (non-blocking)
    RESULT=$(redis-cli LPOP "$RESULT_KEY" 2>/dev/null || echo "")

    if [ -n "$RESULT" ] && [ "$RESULT" != "(nil)" ]; then
        # Handle both simple numeric format and JSON format
        # Try to parse as JSON first, fall back to simple number
        if CONF=$(echo "$RESULT" | jq -r '.confidence' 2>/dev/null) && [ "$CONF" != "null" ]; then
            # JSON format: {"confidence":0.85,"iteration":1,...}
            echo "  [$AGENT] Confidence: $CONF" >&2
            RESULTS+=("$RESULT")
            CONFIDENCES+=("$CONF")

            # Check if result includes feedback array
            FEEDBACK=$(echo "$RESULT" | jq -r '.feedback // empty | .[]?' 2>/dev/null || echo "")
            if [ -n "$FEEDBACK" ]; then
                echo "  [$AGENT] Feedback provided:" >&2
                echo "$RESULT" | jq -r '.feedback[]' 2>/dev/null | sed 's/^/    - /' >&2

                # Collect all feedback items
                while IFS= read -r ITEM; do
                    [ -n "$ITEM" ] && ALL_FEEDBACK+=("$ITEM")
                done < <(echo "$RESULT" | jq -r '.feedback[]' 2>/dev/null || echo "")
            fi
        elif [[ "$RESULT" =~ ^[0-9]+\.?[0-9]*$ ]]; then
            # Simple numeric format: "0.85"
            CONF="$RESULT"
            echo "  [$AGENT] Confidence: $CONF" >&2
            CONFIDENCES+=("$CONF")
        else
            echo "  [$AGENT] ⚠️  Invalid result format: $RESULT" >&2
        fi
    else
        echo "  [$AGENT] ⚠️  No result found" >&2
    fi
done

# Validate quorum if specified
TOTAL_AGENTS=${#AGENTS[@]}
RESPONDING_AGENTS=${#CONFIDENCES[@]}

if [ -n "$MIN_QUORUM" ]; then
    # Parse min-quorum (supports: absolute number, percentage, or decimal)
    if [[ "$MIN_QUORUM" =~ ^[0-9]+%$ ]]; then
        # Percentage format: "66%"
        PCT=${MIN_QUORUM%\%}
        REQUIRED=$(echo "scale=0; ($TOTAL_AGENTS * $PCT) / 100" | bc)
    elif [[ "$MIN_QUORUM" =~ ^0\.[0-9]+$ ]]; then
        # Decimal format: "0.66"
        REQUIRED=$(echo "scale=0; ($TOTAL_AGENTS * $MIN_QUORUM) / 1" | bc)
    else
        # Absolute number format: "2"
        REQUIRED=$MIN_QUORUM
    fi

    if [ "$RESPONDING_AGENTS" -lt "$REQUIRED" ]; then
        echo "" >&2
        echo "[Coordinator] ❌ Quorum not met" >&2
        echo "  Required: $REQUIRED agents" >&2
        echo "  Responding: $RESPONDING_AGENTS agents" >&2
        exit 1
    fi
fi

# Calculate consensus
if [ ${#CONFIDENCES[@]} -gt 0 ]; then
    SUM=0
    for CONF in "${CONFIDENCES[@]}"; do
        SUM=$(echo "$SUM + $CONF" | bc)
    done
    COUNT=${#CONFIDENCES[@]}
    CONSENSUS=$(echo "scale=2; $SUM / $COUNT" | bc)

    # Ensure leading zero for bc output (handles .87 -> 0.87)
    if [[ "$CONSENSUS" =~ ^\. ]]; then
        CONSENSUS="0$CONSENSUS"
    fi

    echo "" >&2
    echo "[Coordinator] Average Confidence: $CONSENSUS" >&2

    # Print aggregated feedback if available
    if [ ${#ALL_FEEDBACK[@]} -gt 0 ]; then
        echo "" >&2
        echo "[Coordinator] Aggregated Feedback:" >&2
        for ITEM in "${ALL_FEEDBACK[@]}"; do
            echo "  - $ITEM" >&2
        done

        # Store feedback in Redis for next iteration
        FEEDBACK_JSON=$(jq -n --argjson items "$(printf '%s\n' "${ALL_FEEDBACK[@]}" | jq -R . | jq -s .)" '$items')
        FEEDBACK_KEY="${NAMESPACE}:${TASK_ID}:aggregated-feedback"
        echo "$FEEDBACK_JSON" | redis-cli -x SET "$FEEDBACK_KEY" >/dev/null
        redis-cli EXPIRE "$FEEDBACK_KEY" 3600 >/dev/null
    fi

    # Output consensus to stdout (for script callers)
    echo "$CONSENSUS"
else
    echo "" >&2
    echo "[Coordinator] ❌ No confidence scores collected" >&2
    exit 1
fi
