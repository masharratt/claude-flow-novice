#!/bin/bash
# Quick test for BZPOPMIN fixes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INVOKE_SCRIPT="${SCRIPT_DIR}/invoke-waiting-mode.sh"

echo "=========================================="
echo "Quick BZPOPMIN Fix Verification"
echo "=========================================="

TASK_ID="quick-test-$(date +%s)"
AGENT_ID="agent-1"

cleanup() {
    redis-cli KEYS "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo ""
echo "Test 1: Compact JSON (no newlines)"
echo "-----------------------------------"
"$INVOKE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "test" --priority 50 >/dev/null
QUEUE_KEY="swarm:${TASK_ID}:${AGENT_ID}:wake-queue"
STORED_MSG=$(redis-cli ZRANGE "$QUEUE_KEY" 0 0 2>/dev/null | head -1)

if echo "$STORED_MSG" | jq empty 2>/dev/null && [[ "$STORED_MSG" != *$'\n'* ]]; then
    echo "✅ JSON is compact (no newlines)"
else
    echo "❌ JSON has newlines or is invalid"
    exit 1
fi

# Clear for next test
redis-cli DEL "$QUEUE_KEY" >/dev/null

echo ""
echo "Test 2: Priority Ordering"
echo "--------------------------"
"$INVOKE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "low" --priority 20 >/dev/null
sleep 0.1
"$INVOKE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "high" --priority 90 >/dev/null
sleep 0.1
"$INVOKE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "medium" --priority 50 >/dev/null

# Pop in order
MSG1=$(redis-cli ZPOPMIN "$QUEUE_KEY" 2>/dev/null | sed -n '1p')
MSG2=$(redis-cli ZPOPMIN "$QUEUE_KEY" 2>/dev/null | sed -n '1p')
MSG3=$(redis-cli ZPOPMIN "$QUEUE_KEY" 2>/dev/null | sed -n '1p')

REASON1=$(echo "$MSG1" | jq -r '.reason' 2>/dev/null)
REASON2=$(echo "$MSG2" | jq -r '.reason' 2>/dev/null)
REASON3=$(echo "$MSG3" | jq -r '.reason' 2>/dev/null)

if [ "$REASON1" = "high" ] && [ "$REASON2" = "medium" ] && [ "$REASON3" = "low" ]; then
    echo "✅ Priority order correct: $REASON1 → $REASON2 → $REASON3"
else
    echo "❌ Priority order wrong: $REASON1 → $REASON2 → $REASON3"
    exit 1
fi

echo ""
echo "Test 3: Debug Mode"
echo "------------------"
OUTPUT=$(DEBUG=true "$INVOKE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "debug" --priority 60 2>&1)

if echo "$OUTPUT" | grep -q "\[DEBUG\]"; then
    echo "✅ Debug mode enabled"
else
    echo "❌ Debug mode not working"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ All quick tests passed!"
echo "=========================================="
echo ""
echo "Confidence: 0.95"
