#!/bin/bash
#
# Redis Waiting Mode CLI Wrapper for Agents
#
# Usage:
#   ./invoke-waiting-mode.sh report --task-id <task> --agent-id <agent> --confidence <score> [--iteration <n>]
#   ./invoke-waiting-mode.sh collect --task-id <task> --agent-ids <id1,id2,id3>
#   ./invoke-waiting-mode.sh shutdown --task-id <task> [--reason <reason>]
#
# DEPRECATION NOTICE:
# - 'enter' and 'wake' subcommands are DEPRECATED
# - This script now only supports 'report', 'collect', and 'shutdown' subcommands
# - Agents are expected to exit cleanly without waiting mode
#
# Priority Levels (0-100, higher = more urgent, default = 50):
#   90-100: Critical (security patches, system failures)
#   70-89:  High (urgent features, blocking bugs)
#   40-60:  Medium (normal tasks, default)
#   20-39:  Low (optimizations, refactoring)
#   0-19:   Minimal (documentation, cleanup)

set -euo pipefail

# Debug mode (set DEBUG=true for verbose output)
DEBUG="${DEBUG:-false}"

# Parse command
COMMAND="${1:-}"
shift || true

# Parse arguments
TASK_ID=""
AGENT_ID=""
AGENT_IDS=""
REASON=""
ITERATION=""
CONFIDENCE=""
FEEDBACK=""
PRIORITY=50  # Default medium priority (0-100, higher = more urgent)
MIN_QUORUM=""  # Minimum quorum for consensus validation

while [[ $# -gt 0 ]]; do
    case $1 in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --agent-ids)
            AGENT_IDS="$2"
            shift 2
            ;;
        --reason)
            REASON="$2"
            shift 2
            ;;
        --iteration)
            ITERATION="$2"
            shift 2
            ;;
        --confidence)
            CONFIDENCE="$2"
            shift 2
            ;;
        --feedback)
            FEEDBACK="$2"
            shift 2
            ;;
        --priority)
            PRIORITY="$2"
            shift 2
            ;;
        --min-quorum)
            MIN_QUORUM="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

case "$COMMAND" in
    enter)
        echo "[DEPRECATED] 'enter' subcommand is no longer supported."
        echo "Agents should no longer use waiting mode. Exit cleanly."
        exit 1
        ;;

    wake)
        echo "[DEPRECATED] 'wake' subcommand is no longer supported."
        echo "Coordinator should spawn agents directly without waiting mode."
        exit 1
        ;;

    report)
        if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONFIDENCE" ]; then
            echo "Error: report requires --task-id, --agent-id, and --confidence"
            exit 1
        fi

        RESULT_KEY="swarm:${TASK_ID}:${AGENT_ID}:result"

        # Build result message with optional feedback
        RESULT_MSG=$(jq -n \
            --arg confidence "$CONFIDENCE" \
            --arg iteration "${ITERATION:-0}" \
            --arg feedback "${FEEDBACK:-}" \
            --arg ts "$(date +%s)" \
            '{
                confidence: ($confidence | tonumber),
                iteration: ($iteration | tonumber),
                feedback: ($feedback | split(",") | map(select(length > 0))),
                timestamp: ($ts | tonumber)
            }')

        echo "$RESULT_MSG" | redis-cli -x LPUSH "$RESULT_KEY" >/dev/null

        echo "[$AGENT_ID] ✅ Result reported"
        echo "  Confidence: $CONFIDENCE"
        [ -n "$ITERATION" ] && echo "  Iteration: $ITERATION"
        if [ -n "$FEEDBACK" ]; then
            echo "  Feedback items: $(echo "$FEEDBACK" | tr ',' '\n' | wc -l)"
        fi
        ;;

    collect)
        if [ -z "$TASK_ID" ] || [ -z "$AGENT_IDS" ]; then
            echo "Error: collect requires --task-id and --agent-ids" >&2
            exit 1
        fi

        # Output verbose messages to stderr
        echo "[Coordinator] Collecting results from agents..." >&2
        echo "" >&2

        # Split agent IDs
        IFS=',' read -ra AGENTS <<< "$AGENT_IDS"

        RESULTS=()
        CONFIDENCES=()
        ALL_FEEDBACK=()

        for AGENT in "${AGENTS[@]}"; do
            RESULT_KEY="swarm:${TASK_ID}:${AGENT}:result"

            # Get latest result (non-blocking, non-destructive)
            # Use LINDEX instead of LPOP to preserve results for multiple reads
            RESULT=$(redis-cli LINDEX "$RESULT_KEY" 0)

            if [ -n "$RESULT" ] && [ "$RESULT" != "(nil)" ]; then
                # Handle both simple numeric format and JSON format
                # Try to parse as JSON first, fall back to simple number
                if CONF=$(echo "$RESULT" | jq -r '.confidence' 2>/dev/null) && [ "$CONF" != "null" ]; then
                    # JSON format: {"confidence":0.85,"iteration":1,...}
                    echo "  [$AGENT] Confidence: $CONF" >&2
                    RESULTS+=("$RESULT")
                    CONFIDENCES+=("$CONF")

                    # Check if result includes feedback array
                    FEEDBACK=$(echo "$RESULT" | jq -r '.feedback // empty | .[]?' 2>/dev/null)
                    if [ -n "$FEEDBACK" ]; then
                        echo "  [$AGENT] Feedback provided:" >&2
                        echo "$RESULT" | jq -r '.feedback[]' | sed 's/^/    - /' >&2

                        # Collect all feedback items
                        while IFS= read -r ITEM; do
                            ALL_FEEDBACK+=("$ITEM")
                        done < <(echo "$RESULT" | jq -r '.feedback[]')
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
            echo "[Coordinator] Consensus: $CONSENSUS" >&2

            # Print aggregated feedback if available
            if [ ${#ALL_FEEDBACK[@]} -gt 0 ]; then
                echo "[Coordinator] Aggregated Feedback (${#ALL_FEEDBACK[@]} items):" >&2
                printf '%s\n' "${ALL_FEEDBACK[@]}" | sort -u | sed 's/^/  - /' >&2
            fi

            # Output only consensus value to stdout for callers
            echo "$CONSENSUS"
        else
            echo "" >&2
            echo "[Coordinator] No results to calculate consensus" >&2
            echo "0.0"
        fi
        ;;

    shutdown)
        if [ -z "$TASK_ID" ]; then
            echo "Error: shutdown requires --task-id"
            exit 1
        fi

        SHUTDOWN_KEY="swarm:${TASK_ID}:shutdown"

        # Build shutdown message
        SHUTDOWN_MSG=$(jq -n \
            --arg reason "${REASON:-task_complete}" \
            --arg ts "$(date +%s)" \
            '{
                reason: $reason,
                timestamp: ($ts | tonumber)
            }')

        # Broadcast shutdown signal
        echo "$SHUTDOWN_MSG" | redis-cli -x LPUSH "$SHUTDOWN_KEY" >/dev/null

        echo "[Coordinator] 🛑 Shutdown signal broadcasted"
        echo "  Task ID: $TASK_ID"
        echo "  Reason: ${REASON:-task_complete}"
        ;;

    *)
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  report   - Agent reports result"
        echo "  collect  - Coordinator collects results"
        echo "  shutdown - Coordinator broadcasts shutdown signal"
        echo ""
        echo "Note: 'enter' and 'wake' subcommands are DEPRECATED"
        exit 1
        ;;
esac