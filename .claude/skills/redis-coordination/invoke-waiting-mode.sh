#!/bin/bash
#
# Redis Waiting Mode CLI Wrapper for Agents
#
# Usage:
#   ./invoke-waiting-mode.sh enter --task-id <task> --agent-id <agent> --context <context>
#   ./invoke-waiting-mode.sh wake --task-id <task> --agent-id <agent> --reason <reason> [--iteration <n>] [--priority <0-100>]
#   ./invoke-waiting-mode.sh report --task-id <task> --agent-id <agent> --confidence <score> [--iteration <n>]
#   ./invoke-waiting-mode.sh collect --task-id <task> --agent-ids <id1,id2,id3>
#   ./invoke-waiting-mode.sh shutdown --task-id <task> [--reason <reason>]
#
# Priority Levels (0-100, higher = more urgent, default = 50):
#   90-100: Critical (security patches, system failures)
#   70-89:  High (urgent features, blocking bugs)
#   40-60:  Medium (normal tasks, default)
#   20-39:  Low (optimizations, refactoring)
#   0-19:   Minimal (documentation, cleanup)
#
# Examples:
#   # Agent enters waiting mode
#   ./invoke-waiting-mode.sh enter --task-id auth-system --agent-id coder-1 --context "iteration-1"
#
#   # Coordinator wakes agent with default priority
#   ./invoke-waiting-mode.sh wake --task-id auth-system --agent-id coder-1 --reason cfn_loop_iteration --iteration 2
#
#   # Coordinator wakes agent with high priority
#   ./invoke-waiting-mode.sh wake --task-id auth-system --agent-id coder-1 --reason security_patch --priority 95
#
#   # Agent reports result
#   ./invoke-waiting-mode.sh report --task-id auth-system --agent-id coder-1 --confidence 0.85 --iteration 1
#
#   # Coordinator collects results
#   ./invoke-waiting-mode.sh collect --task-id auth-system --agent-ids coder-1,reviewer-1,tester-1
#
#   # Coordinator broadcasts shutdown signal
#   ./invoke-waiting-mode.sh shutdown --task-id auth-system --reason task_complete

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
CONTEXT=""
REASON=""
ITERATION=""
CONFIDENCE=""
FEEDBACK=""
TASK_DESC=""
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

# Validate required arguments
case "$COMMAND" in
    enter)
        if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONTEXT" ]; then
            echo "Error: enter requires --task-id, --agent-id, and --context"
            exit 1
        fi

        # Enter waiting mode
        READY_KEY="swarm:${TASK_ID}:${AGENT_ID}:ready"
        WAKE_QUEUE="swarm:${TASK_ID}:${AGENT_ID}:wake-queue"
        SHUTDOWN_KEY="swarm:${TASK_ID}:shutdown"

        # Publish ready status
        READY_MSG=$(jq -n \
            --arg status "waiting" \
            --arg context "$CONTEXT" \
            --arg ts "$(date +%s)" \
            '{status: $status, context: $context, timestamp: ($ts | tonumber)}')

        echo "$READY_MSG" | redis-cli -x LPUSH "$READY_KEY" >/dev/null

        echo "[$AGENT_ID] Entered waiting mode (context: $CONTEXT)"
        echo "[$AGENT_ID] Blocking on priority queue $WAKE_QUEUE and $SHUTDOWN_KEY (infinite timeout)..."
        echo "[$AGENT_ID] Zero token cost while waiting"

        # Poll loop: check shutdown first, then block on wake queue with timeout
        # This allows us to support both priority queues and shutdown signals
        while true; do
            # Check for shutdown signal first (highest priority)
            SHUTDOWN_CHECK=$(redis-cli LPOP "$SHUTDOWN_KEY")

            if [ -n "$SHUTDOWN_CHECK" ] && [ "$SHUTDOWN_CHECK" != "(nil)" ]; then
                # Shutdown signal received
                SHUTDOWN_REASON=$(echo "$SHUTDOWN_CHECK" | jq -r '.reason // "unknown"')
                echo "[$AGENT_ID] 🛑 Shutdown signal received"
                echo "[$AGENT_ID] Reason: $SHUTDOWN_REASON"
                echo "$SHUTDOWN_CHECK" | jq '.'

                # Exit with SIGINT code to indicate graceful shutdown
                exit 130
            fi

            # Block on wake queue with 1-second timeout (allows periodic shutdown checks)
            # BZPOPMIN returns: key, member, score (3 lines)
            WAKE_RESULT=$(redis-cli BZPOPMIN "$WAKE_QUEUE" 1 2>/dev/null)

            if [ -n "$WAKE_RESULT" ] && [ "$WAKE_RESULT" != "(nil)" ]; then
                # Parse result (BZPOPMIN returns 3 lines: key, member, score)
                WAKE_MSG=$(echo "$WAKE_RESULT" | sed -n '2p')

                # Validate JSON before processing
                if echo "$WAKE_MSG" | jq empty 2>/dev/null; then
                    echo "[$AGENT_ID] ✅ Woken up!"
                    echo "$WAKE_MSG" | jq '.'

                    # Return wake message to caller
                    echo "$WAKE_MSG"
                    break
                else
                    echo "[$AGENT_ID] ⚠️  Invalid JSON in wake message, ignoring"
                    continue
                fi
            fi

            # If no wake signal received, loop back to check shutdown again
        done
        ;;

    wake)
        if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$REASON" ]; then
            echo "Error: wake requires --task-id, --agent-id, and --reason"
            exit 1
        fi

        WAKE_QUEUE="swarm:${TASK_ID}:${AGENT_ID}:wake-queue"

        # Build wake message (compact JSON for Redis storage)
        WAKE_MSG=$(jq -nc \
            --arg reason "$REASON" \
            --arg iteration "${ITERATION:-0}" \
            --arg task "${TASK_DESC:-}" \
            --arg feedback "${FEEDBACK:-}" \
            --arg priority "$PRIORITY" \
            --arg ts "$(date +%s)" \
            '{
                reason: $reason,
                iteration: ($iteration | tonumber),
                task: $task,
                feedback: ($feedback | split(",") | map(select(length > 0))),
                priority: ($priority | tonumber),
                timestamp: ($ts | tonumber)
            }')

        # Calculate priority score (lower score = higher priority, popped first)
        # Score = (100 - priority) * 1000000 + timestamp
        # This ensures higher priority messages are processed first, with FIFO for same priority
        TIMESTAMP=$(date +%s)
        PRIORITY_SCORE=$(echo "(100 - $PRIORITY) * 1000000 + $TIMESTAMP" | bc)

        # Debug output
        if [ "$DEBUG" = "true" ]; then
            echo "[DEBUG] WAKE_QUEUE: $WAKE_QUEUE"
            echo "[DEBUG] PRIORITY: $PRIORITY"
            echo "[DEBUG] Priority score: $PRIORITY_SCORE"
            echo "[DEBUG] Message: $WAKE_MSG"
        fi

        # Add to sorted set (ZADD with calculated score)
        # Use redis-cli with ZADD and pass JSON as the member directly
        redis-cli ZADD "$WAKE_QUEUE" "$PRIORITY_SCORE" "$WAKE_MSG" >/dev/null

        echo "[Coordinator] ✅ Wake signal sent to $AGENT_ID"
        echo "  Reason: $REASON"
        echo "  Priority: $PRIORITY (score: $PRIORITY_SCORE)"
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

        # Broadcast shutdown signal (use LPUSH to add to list)
        # All waiting agents will check this key and exit gracefully
        echo "$SHUTDOWN_MSG" | redis-cli -x LPUSH "$SHUTDOWN_KEY" >/dev/null

        echo "[Coordinator] 🛑 Shutdown signal broadcasted"
        echo "  Task ID: $TASK_ID"
        echo "  Reason: ${REASON:-task_complete}"
        echo ""
        echo "Note: Signal added to $SHUTDOWN_KEY"
        echo "All waiting agents will receive shutdown on next poll cycle (max 1 second)"
        ;;

    *)

        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  enter    - Agent enters waiting mode"
        echo "  wake     - Coordinator wakes an agent (supports --priority 0-100)"
        echo "  report   - Agent reports result"
        echo "  collect  - Coordinator collects results"
        echo "  shutdown - Coordinator broadcasts shutdown signal to all waiting agents"
        echo ""
        echo "Priority Levels (0-100, higher = more urgent, default = 50):"
        echo "  90-100: Critical (security patches, system failures)"
        echo "  70-89:  High (urgent features, blocking bugs)"
        echo "  40-60:  Medium (normal tasks, default)"
        echo "  20-39:  Low (optimizations, refactoring)"
        echo "  0-19:   Minimal (documentation, cleanup)"
        echo ""
        echo "Examples:"
        echo "  $0 enter --task-id auth --agent-id coder-1 --context iteration-1"
        echo "  $0 wake --task-id auth --agent-id coder-1 --reason cfn_loop_iteration --iteration 2"
        echo "  $0 wake --task-id auth --agent-id coder-1 --reason security_patch --priority 95"
        echo "  $0 report --task-id auth --agent-id coder-1 --confidence 0.85 --iteration 1"
        echo "  $0 collect --task-id auth --agent-ids coder-1,reviewer-1,tester-1"
        echo "  $0 shutdown --task-id auth --reason task_complete"
        exit 1
        ;;
esac
