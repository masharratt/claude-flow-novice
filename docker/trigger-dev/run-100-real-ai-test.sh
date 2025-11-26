#!/bin/bash
set -euo pipefail

echo "==================================================================="
echo "REAL AI STRESS TEST - 100 Claude CLI Agents"
echo "==================================================================="
echo ""
echo "This test will:"
echo "  1. Trigger 100 test-zai-agent tasks via Trigger.dev"
echo "  2. Each task spawns in its own worker container"
echo "  3. Each container calls: npx @anthropic-ai/claude-code via execa"
echo "  4. Each agent creates a real TypeScript file"
echo ""
echo "Output directory: /tmp/real-ai-stress-test-100"
echo "Monitor at: http://localhost:8030"
echo ""
echo "Press Ctrl+C to cancel, or wait 5 seconds to start..."
sleep 5

echo ""
echo "[$(date +%T)] Starting test..."
echo ""

# Prepare output directory
rm -rf /tmp/real-ai-stress-test-100/*
mkdir -p /tmp/real-ai-stress-test-100

# Start container monitoring in background
(
  while true; do
    COUNT=$(docker ps --filter "name=trigger" --format "{{.Names}}" 2>/dev/null | wc -l)
    echo "[$(date +%T)] Active Trigger.dev containers: $COUNT"
    sleep 10
  done
) &
MONITOR_PID=$!

# Trap to cleanup monitoring
trap "kill $MONITOR_PID 2>/dev/null || true" EXIT

# Trigger the test via webapp API
echo "[$(date +%T)] Triggering stress-test-real-ai task..."
echo ""

curl -s -X POST "http://localhost:8030/api/v1/tasks/stress-test-real-ai/trigger" \
  -H "Authorization: Bearer b412a4975b27d4f16c4c784cad93b31d5458ef785490fd4c6d2d9d29495d3bfc" \
  -H "Content-Type: application/json" \
  -d '{
    "agentCount": 100,
    "outputDir": "/tmp/real-ai-stress-test-100"
  }' | jq '.' || echo "Failed to trigger task - check dev server"

echo ""
echo "[$(date +%T)] Task triggered. Monitor progress:"
echo "  - Webapp UI: http://localhost:8030"
echo "  - Container count: docker ps | grep trigger"
echo "  - Files created: ls /tmp/real-ai-stress-test-100 | wc -l"
echo ""
echo "Monitoring for 5 minutes..."

# Monitor for 5 minutes
for i in {1..30}; do
  sleep 10
  FILE_COUNT=$(ls /tmp/real-ai-stress-test-100/*.ts 2>/dev/null | wc -l || echo 0)
  echo "[$(date +%T)] Files created so far: $FILE_COUNT/100"
  
  if [ "$FILE_COUNT" -ge 100 ]; then
    echo ""
    echo "✅ All 100 files created!"
    break
  fi
done

# Final results
echo ""
echo "==================================================================="
echo "FINAL RESULTS"
echo "==================================================================="
FILE_COUNT=$(ls /tmp/real-ai-stress-test-100/*.ts 2>/dev/null | wc -l || echo 0)
echo "Files created: $FILE_COUNT/100"
echo "Output directory: /tmp/real-ai-stress-test-100"
echo ""

if [ "$FILE_COUNT" -gt 0 ]; then
  echo "Sample files:"
  ls /tmp/real-ai-stress-test-100/*.ts 2>/dev/null | head -5
  echo ""
  echo "Sample content:"
  head -10 $(ls /tmp/real-ai-stress-test-100/*.ts 2>/dev/null | head -1)
fi

echo "==================================================================="
