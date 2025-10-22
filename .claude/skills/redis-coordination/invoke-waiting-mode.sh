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
            echo "Error: collect requires --task-id and --agent-ids"
            exit 1
        fi

        echo "[Coordinator] Collecting results from agents..."
        echo ""

        # Split agent IDs
        IFS=',' read -ra AGENTS <<< "$AGENT_IDS"

        RESULTS=()
        CONFIDENCES=()
        ALL_FEEDBACK=()

        for AGENT in "${AGENTS[@]}"; do
            RESULT_KEY="swarm:${TASK_ID}:${AGENT}:result"

            # Get latest result (non-blocking)
            RESULT=$(redis-cli LPOP "$RESULT_KEY")

            if [ -n "$RESULT" ] && [ "$RESULT" != "(nil)" ]; then
                CONF=$(echo "$RESULT" | jq -r '.confidence')
                echo "  [$AGENT] Confidence: $CONF"
                RESULTS+=("$RESULT")
                CONFIDENCES+=("$CONF")

                # Check if result includes feedback array
                FEEDBACK=$(echo "$RESULT" | jq -r '.feedback // empty | .[]?' 2>/dev/null)
                if [ -n "$FEEDBACK" ]; then
                    echo "  [$AGENT] Feedback provided:"
                    echo "$RESULT" | jq -r '.feedback[]' | sed 's/^/    - /'

                    # Collect all feedback items
                    while IFS= read -r ITEM; do
                        ALL_FEEDBACK+=("$ITEM")
                    done < <(echo "$RESULT" | jq -r '.feedback[]')
                fi
            else
                echo "  [$AGENT] ⚠️  No result found"
            fi
        done

        # Calculate consensus
        if [ ${#CONFIDENCES[@]} -gt 0 ]; then
            SUM=0
            for CONF in "${CONFIDENCES[@]}"; do
                SUM=$(echo "$SUM + $CONF" | bc)
            done
            COUNT=${#CONFIDENCES[@]}
            CONSENSUS=$(echo "scale=2; $SUM / $COUNT" | bc)

            echo ""
            echo "[Coordinator] Consensus: $CONSENSUS"

            # Print aggregated feedback if available
            if [ ${#ALL_FEEDBACK[@]} -gt 0 ]; then
                echo "[Coordinator] Aggregated Feedback (${#ALL_FEEDBACK[@]} items):"
                printf '%s\n' "${ALL_FEEDBACK[@]}" | sort -u | sed 's/^/  - /'
            fi

            echo "$CONSENSUS"
        else
            echo ""
            echo "[Coordinator] No results to calculate consensus"
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