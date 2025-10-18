#!/bin/bash
#
# Redis Waiting Mode CLI Wrapper for Agents
#
# Usage:
#   ./invoke-waiting-mode.sh enter --task-id <task> --agent-id <agent> --context <context>
#   ./invoke-waiting-mode.sh wake --task-id <task> --agent-id <agent> --reason <reason> [--iteration <n>]
#   ./invoke-waiting-mode.sh report --task-id <task> --agent-id <agent> --confidence <score> [--iteration <n>]
#   ./invoke-waiting-mode.sh collect --task-id <task> --agent-ids <id1,id2,id3>
#
# Examples:
#   # Agent enters waiting mode
#   ./invoke-waiting-mode.sh enter --task-id auth-system --agent-id coder-1 --context "iteration-1"
#
#   # Coordinator wakes agent
#   ./invoke-waiting-mode.sh wake --task-id auth-system --agent-id coder-1 --reason cfn_loop_iteration --iteration 2
#
#   # Agent reports result
#   ./invoke-waiting-mode.sh report --task-id auth-system --agent-id coder-1 --confidence 0.85 --iteration 1
#
#   # Coordinator collects results
#   ./invoke-waiting-mode.sh collect --task-id auth-system --agent-ids coder-1,reviewer-1,tester-1

set -euo pipefail

# Parse command
COMMAND="${1:-}"
shift || true

# Parse arguments
TASK_ID=""
AGENT_ID=""
AGENT_IDS=""
CONTEXT=""
REASON=""
ITERATION=""
CONFIDENCE=""
FEEDBACK=""
TASK_DESC=""

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
        --context)
            CONTEXT="$2"
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
        --task)
            TASK_DESC="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
case "$COMMAND" in
    enter)
        if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONTEXT" ]; then
            echo "Error: enter requires --task-id, --agent-id, and --context"
            exit 1
        fi

        # Enter waiting mode
        READY_KEY="swarm:${TASK_ID}:${AGENT_ID}:ready"
        WAKE_KEY="swarm:${TASK_ID}:${AGENT_ID}:wake"

        # Publish ready status
        READY_MSG=$(jq -n \
            --arg status "waiting" \
            --arg context "$CONTEXT" \
            --arg ts "$(date +%s)" \
            '{status: $status, context: $context, timestamp: ($ts | tonumber)}')

        echo "$READY_MSG" | redis-cli -x LPUSH "$READY_KEY" >/dev/null

        echo "[$AGENT_ID] Entered waiting mode (context: $CONTEXT)"
        echo "[$AGENT_ID] Blocking on $WAKE_KEY (infinite timeout)..."
        echo "[$AGENT_ID] Zero token cost while waiting"

        # Block on wake channel (BLPOP with infinite timeout)
        WAKE_RESULT=$(redis-cli BLPOP "$WAKE_KEY" 0)

        # Parse result (BLPOP returns: key \n value)
        WAKE_MSG=$(echo "$WAKE_RESULT" | tail -n 1)

        echo "[$AGENT_ID] ✅ Woken up!"
        echo "$WAKE_MSG" | jq '.'

        # Return wake message to caller
        echo "$WAKE_MSG"
        ;;

    wake)
        if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$REASON" ]; then
            echo "Error: wake requires --task-id, --agent-id, and --reason"
            exit 1
        fi

        WAKE_KEY="swarm:${TASK_ID}:${AGENT_ID}:wake"

        # Build wake message
        WAKE_MSG=$(jq -n \
            --arg reason "$REASON" \
            --arg iteration "${ITERATION:-0}" \
            --arg task "${TASK_DESC:-}" \
            --arg feedback "${FEEDBACK:-}" \
            --arg ts "$(date +%s)" \
            '{
                reason: $reason,
                iteration: ($iteration | tonumber),
                task: $task,
                feedback: ($feedback | split(",") | map(select(length > 0))),
                timestamp: ($ts | tonumber)
            }')

        echo "$WAKE_MSG" | redis-cli -x LPUSH "$WAKE_KEY" >/dev/null

        echo "[Coordinator] ✅ Wake signal sent to $AGENT_ID"
        echo "  Reason: $REASON"
        [ -n "$ITERATION" ] && echo "  Iteration: $ITERATION"
        ;;

    report)
        if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONFIDENCE" ]; then
            echo "Error: report requires --task-id, --agent-id, and --confidence"
            exit 1
        fi

        RESULT_KEY="swarm:${TASK_ID}:${AGENT_ID}:result"

        # Build result message
        RESULT_MSG=$(jq -n \
            --arg confidence "$CONFIDENCE" \
            --arg iteration "${ITERATION:-0}" \
            --arg ts "$(date +%s)" \
            '{
                confidence: ($confidence | tonumber),
                iteration: ($iteration | tonumber),
                timestamp: ($ts | tonumber)
            }')

        echo "$RESULT_MSG" | redis-cli -x LPUSH "$RESULT_KEY" >/dev/null

        echo "[$AGENT_ID] ✅ Result reported"
        echo "  Confidence: $CONFIDENCE"
        [ -n "$ITERATION" ] && echo "  Iteration: $ITERATION"
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

        for AGENT in "${AGENTS[@]}"; do
            RESULT_KEY="swarm:${TASK_ID}:${AGENT}:result"

            # Get latest result (non-blocking)
            RESULT=$(redis-cli LPOP "$RESULT_KEY")

            if [ -n "$RESULT" ] && [ "$RESULT" != "(nil)" ]; then
                echo "  [$AGENT] $(echo "$RESULT" | jq -r '.confidence')"
                RESULTS+=("$RESULT")

                # Extract confidence for consensus calculation
                CONF=$(echo "$RESULT" | jq -r '.confidence')
                CONFIDENCES+=("$CONF")
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
            echo "$CONSENSUS"
        else
            echo ""
            echo "[Coordinator] No results to calculate consensus"
            echo "0.0"
        fi
        ;;

    *)
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  enter   - Agent enters waiting mode"
        echo "  wake    - Coordinator wakes an agent"
        echo "  report  - Agent reports result"
        echo "  collect - Coordinator collects results"
        echo ""
        echo "Examples:"
        echo "  $0 enter --task-id auth --agent-id coder-1 --context iteration-1"
        echo "  $0 wake --task-id auth --agent-id coder-1 --reason cfn_loop_iteration --iteration 2"
        echo "  $0 report --task-id auth --agent-id coder-1 --confidence 0.85 --iteration 1"
        echo "  $0 collect --task-id auth --agent-ids coder-1,reviewer-1,tester-1"
        exit 1
        ;;
esac
