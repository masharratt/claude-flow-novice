#!/bin/bash
# Waiting Mode + Coordinator Wake-Up Pattern
# Agents enter waiting mode, coordinator/peers wake them for iterations/fixes

set -euo pipefail

# Configuration
TASK_ID="auth-system"
ITERATION=1
MAX_ITERATIONS=10
CONSENSUS_THRESHOLD=0.90

echo "========================================="
echo "Waiting Mode + Coordinator Wake-Up Demo"
echo "========================================="
echo ""

# Simulate coordinator spawning agents in waiting mode
echo "Step 1: Coordinator spawns agents in waiting mode"
echo "  Task: agent-coder, agent-reviewer, agent-tester, agent-security"
echo ""

# Agent Pattern: Enter waiting mode immediately after spawn
agent_enter_waiting_mode() {
    local agent_id=$1
    local context=$2

    echo "[$agent_id] Entering waiting mode..."
    redis-cli lpush "swarm:$TASK_ID:$agent_id:ready" "{
        \"status\": \"waiting\",
        \"context\": \"$context\",
        \"timestamp\": $(date +%s)
    }" > /dev/null

    echo "[$agent_id] Blocked on swarm:$TASK_ID:$agent_id:wake (infinite timeout)"
    echo "[$agent_id] Zero token cost while waiting..."
}

# Simulate 4 agents entering waiting mode
agent_enter_waiting_mode "agent-coder" "iteration-1"
agent_enter_waiting_mode "agent-reviewer" "iteration-1"
agent_enter_waiting_mode "agent-tester" "iteration-1"
agent_enter_waiting_mode "agent-security" "iteration-1"

echo ""
echo "========================================="
echo "CFN Loop Iteration 1: Wake agents"
echo "========================================="
echo ""

# Coordinator wakes agents for first iteration
wake_agent() {
    local agent_id=$1
    local iteration=$2
    local task=$3

    echo "[Coordinator] Waking $agent_id for iteration $iteration..."
    redis-cli lpush "swarm:$TASK_ID:$agent_id:wake" "{
        \"reason\": \"cfn_loop_iteration\",
        \"iteration\": $iteration,
        \"task\": \"$task\",
        \"timestamp\": $(date +%s)
    }" > /dev/null

    echo "[Coordinator] Wake signal sent to $agent_id"
}

# Wake all agents for iteration 1
wake_agent "agent-coder" $ITERATION "Implement authentication logic"
wake_agent "agent-reviewer" $ITERATION "Review code quality"
wake_agent "agent-tester" $ITERATION "Write and run tests"
wake_agent "agent-security" $ITERATION "Security audit"

echo ""
echo "Agents process tasks..."
sleep 2

# Simulate agents reporting back
echo ""
echo "Agents report confidence and return to waiting mode:"
redis-cli lpush "swarm:$TASK_ID:agent-coder:result" '{"confidence":0.75,"iteration":1,"status":"needs_improvement"}' > /dev/null
echo "  [agent-coder] Confidence: 0.75 (needs improvement)"

redis-cli lpush "swarm:$TASK_ID:agent-reviewer:result" '{"confidence":0.80,"iteration":1,"issues":["Missing error handling"]}' > /dev/null
echo "  [agent-reviewer] Confidence: 0.80 (issues found)"

redis-cli lpush "swarm:$TASK_ID:agent-tester:result" '{"confidence":0.72,"iteration":1,"coverage":0.65}' > /dev/null
echo "  [agent-tester] Confidence: 0.72 (low coverage)"

redis-cli lpush "swarm:$TASK_ID:agent-security:result" '{"confidence":0.85,"iteration":1}' > /dev/null
echo "  [agent-security] Confidence: 0.85"

# Calculate consensus
echo ""
echo "[Coordinator] Calculating consensus..."
CONSENSUS=$(echo "scale=2; (0.75 + 0.80 + 0.72 + 0.85) / 4" | bc)
echo "[Coordinator] Iteration $ITERATION Consensus: $CONSENSUS"
echo "[Coordinator] Threshold: $CONSENSUS_THRESHOLD"

if (( $(echo "$CONSENSUS < $CONSENSUS_THRESHOLD" | bc -l) )); then
    echo "[Coordinator] ⚠️  Consensus below threshold - triggering iteration 2"

    # Agents automatically return to waiting mode
    echo ""
    echo "Agents return to waiting mode (context preserved):"
    agent_enter_waiting_mode "agent-coder" "iteration-2"
    agent_enter_waiting_mode "agent-reviewer" "iteration-2"
    agent_enter_waiting_mode "agent-tester" "iteration-2"
    agent_enter_waiting_mode "agent-security" "iteration-2"

    echo ""
    echo "========================================="
    echo "CFN Loop Iteration 2: Wake with feedback"
    echo "========================================="
    echo ""

    # Wake agents with feedback from previous iteration
    echo "[Coordinator] Waking agents with feedback from iteration 1..."

    redis-cli lpush "swarm:$TASK_ID:agent-coder:wake" "{
        \"reason\": \"cfn_loop_iteration\",
        \"iteration\": 2,
        \"previous_consensus\": $CONSENSUS,
        \"feedback\": [\"Add error handling\", \"Improve test coverage\"],
        \"context_from_iteration_1\": \"maintained\"
    }" > /dev/null
    echo "  [agent-coder] Woke with feedback: Add error handling"

    redis-cli lpush "swarm:$TASK_ID:agent-reviewer:wake" "{
        \"reason\": \"cfn_loop_iteration\",
        \"iteration\": 2,
        \"previous_consensus\": $CONSENSUS,
        \"feedback\": [\"Validate error handling fixes\"]
    }" > /dev/null
    echo "  [agent-reviewer] Woke with feedback: Validate fixes"

    redis-cli lpush "swarm:$TASK_ID:agent-tester:wake" "{
        \"reason\": \"cfn_loop_iteration\",
        \"iteration\": 2,
        \"previous_consensus\": $CONSENSUS,
        \"feedback\": [\"Increase coverage to 85%\"]
    }" > /dev/null
    echo "  [agent-tester] Woke with feedback: Increase coverage"

    redis-cli lpush "swarm:$TASK_ID:agent-security:wake" "{
        \"reason\": \"cfn_loop_iteration\",
        \"iteration\": 2,
        \"previous_consensus\": $CONSENSUS
    }" > /dev/null
    echo "  [agent-security] Woke for re-validation"

    echo ""
    echo "Agents process iteration 2 tasks (with context from iteration 1)..."
    sleep 2

    # Simulate improved results
    echo ""
    echo "Agents report improved confidence:"
    redis-cli lpush "swarm:$TASK_ID:agent-coder:result" '{"confidence":0.90,"iteration":2}' > /dev/null
    echo "  [agent-coder] Confidence: 0.90 ✅"

    redis-cli lpush "swarm:$TASK_ID:agent-reviewer:result" '{"confidence":0.92,"iteration":2}' > /dev/null
    echo "  [agent-reviewer] Confidence: 0.92 ✅"

    redis-cli lpush "swarm:$TASK_ID:agent-tester:result" '{"confidence":0.88,"iteration":2,"coverage":0.87}' > /dev/null
    echo "  [agent-tester] Confidence: 0.88 ✅"

    redis-cli lpush "swarm:$TASK_ID:agent-security:result" '{"confidence":0.94,"iteration":2}' > /dev/null
    echo "  [agent-security] Confidence: 0.94 ✅"

    CONSENSUS=$(echo "scale=2; (0.90 + 0.92 + 0.88 + 0.94) / 4" | bc)
    echo ""
    echo "[Coordinator] Iteration 2 Consensus: $CONSENSUS"
    echo "[Coordinator] ✅ Consensus >= threshold - PROCEED"
fi

echo ""
echo "========================================="
echo "Example 2: Incomplete Work Wake-Up"
echo "========================================="
echo ""

# Simulate incomplete work detection
echo "[Coordinator] Detected incomplete work in agent-coder..."
redis-cli lpush "swarm:$TASK_ID:agent-coder:wake" '{
    "reason": "incomplete_work",
    "issues": ["Missing test coverage", "Type errors in auth.ts"],
    "priority": "high"
}' > /dev/null

echo "[Coordinator] Woke agent-coder to fix issues"
echo "  Issues: Missing test coverage, Type errors"
echo ""

echo "========================================="
echo "Example 3: Agent-to-Agent Clarification"
echo "========================================="
echo ""

# Simulate peer-to-peer clarification
echo "[agent-reviewer] Has question for agent-coder..."
redis-cli lpush "swarm:$TASK_ID:agent-coder:wake" '{
    "reason": "clarification",
    "from_agent": "reviewer",
    "question": "Should we use JWT or session cookies for auth?",
    "urgent": false
}' > /dev/null

echo "[agent-reviewer] Sent clarification question to agent-coder"
echo "  Question: JWT or session cookies?"
echo ""

echo "========================================="
echo "Benefits Summary"
echo "========================================="
echo ""
echo "✅ Zero token cost while agents wait (BLPOP blocks, no API calls)"
echo "✅ Context preserved across iterations (agents remember previous work)"
echo "✅ Instant wake-up (<100ms latency)"
echo "✅ Scalable (10+ agents can cycle indefinitely)"
echo "✅ CFN Loop native (agents maintain state across consensus cycles)"
echo ""

# Cleanup
echo "Cleaning up Redis keys..."
redis-cli del "swarm:$TASK_ID:agent-coder:ready" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-coder:wake" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-coder:result" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-reviewer:ready" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-reviewer:wake" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-reviewer:result" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-tester:ready" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-tester:wake" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-tester:result" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-security:ready" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-security:wake" > /dev/null
redis-cli del "swarm:$TASK_ID:agent-security:result" > /dev/null

echo "Demo complete!"
