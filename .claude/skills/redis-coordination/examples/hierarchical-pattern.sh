#!/bin/bash
# Hierarchical Pattern: 1:Many Broadcast Coordination
# Use Case: One agent's output feeds multiple downstream agents
# Pattern: Coordinator receives result and broadcasts to multiple agent inboxes

set -e

TASK_ID="demo:hierarchical"
TIMEOUT=300  # 5 minutes

echo "=== Hierarchical Pattern Demo (1:Many Broadcast) ==="
echo "Scenario: Researcher → [Analyzer, Architect, Coder]"
echo ""

# Cleanup previous demo data
echo "Cleaning up previous demo data..."
redis-cli del "${TASK_ID}:researcher:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:analyzer:inbox" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:architect:inbox" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coder:inbox" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coordinator:status" > /dev/null 2>&1 || true

# Simulate Researcher Agent (runs in background)
(
  echo "[Researcher] Starting research..."
  sleep 2

  FINDINGS='{
    "agent": "researcher",
    "confidence": 0.85,
    "findings": "JWT-based authentication recommended",
    "patterns": ["OAuth2", "JWT", "Session-based"],
    "recommendation": "Use JWT with refresh tokens"
  }'

  redis-cli lpush "${TASK_ID}:researcher:done" "$FINDINGS" > /dev/null
  echo "[Researcher] Research complete, published to ${TASK_ID}:researcher:done"
) &

# Coordinator: Wait for researcher, then broadcast to multiple agents
echo "[Coordinator] Waiting for researcher to complete..."
RESEARCH_DATA=$(timeout $TIMEOUT redis-cli --csv blpop "${TASK_ID}:researcher:done" 0 2>/dev/null || echo "")

if [ -z "$RESEARCH_DATA" ]; then
  echo "[Coordinator] ERROR: Researcher timeout after ${TIMEOUT}s"
  redis-cli lpush "${TASK_ID}:coordinator:status" '{"status":"error","error":"researcher_timeout"}' > /dev/null
  exit 1
fi

echo "[Coordinator] Received research data, broadcasting to 3 agents..."

# Broadcast to multiple agents (separate inboxes)
redis-cli lpush "${TASK_ID}:analyzer:inbox" "$RESEARCH_DATA" > /dev/null
redis-cli lpush "${TASK_ID}:architect:inbox" "$RESEARCH_DATA" > /dev/null
redis-cli lpush "${TASK_ID}:coder:inbox" "$RESEARCH_DATA" > /dev/null

echo "[Coordinator] Broadcast complete to: analyzer, architect, coder"

# Simulate Analyzer Agent
(
  echo "[Analyzer] Waiting for research data in inbox..."
  DATA=$(timeout $TIMEOUT redis-cli --csv blpop "${TASK_ID}:analyzer:inbox" 0 2>/dev/null || echo "")

  if [ -z "$DATA" ]; then
    echo "[Analyzer] ERROR: Timeout waiting for data"
    exit 1
  fi

  echo "[Analyzer] Received data: ${DATA:0:50}..."
  echo "[Analyzer] Analyzing security implications..."
  sleep 1
  echo "[Analyzer] Analysis complete (confidence: 0.90)"
) &

# Simulate Architect Agent
(
  echo "[Architect] Waiting for research data in inbox..."
  DATA=$(timeout $TIMEOUT redis-cli --csv blpop "${TASK_ID}:architect:inbox" 0 2>/dev/null || echo "")

  if [ -z "$DATA" ]; then
    echo "[Architect] ERROR: Timeout waiting for data"
    exit 1
  fi

  echo "[Architect] Received data: ${DATA:0:50}..."
  echo "[Architect] Designing authentication architecture..."
  sleep 1
  echo "[Architect] Architecture designed (confidence: 0.88)"
) &

# Simulate Coder Agent
(
  echo "[Coder] Waiting for research data in inbox..."
  DATA=$(timeout $TIMEOUT redis-cli --csv blpop "${TASK_ID}:coder:inbox" 0 2>/dev/null || echo "")

  if [ -z "$DATA" ]; then
    echo "[Coder] ERROR: Timeout waiting for data"
    exit 1
  fi

  echo "[Coder] Received data: ${DATA:0:50}..."
  echo "[Coder] Implementing JWT authentication..."
  sleep 1
  echo "[Coder] Implementation complete (confidence: 0.86)"
) &

# Wait for all background jobs to complete
wait

echo ""
echo "=== Hierarchical Pattern Complete ==="
echo "✅ Coordinator successfully broadcast researcher data to 3 agents"
echo "✅ All agents received data in parallel from dedicated inboxes"
echo "✅ No message loss (BLPOP destructive limitation solved)"
echo ""
echo "Key Pattern:"
echo "  1. Researcher → coordinator (LPUSH/BLPOP)"
echo "  2. Coordinator → 3 separate agent inboxes (LPUSH x3)"
echo "  3. Each agent reads from dedicated inbox (BLPOP)"
echo ""

# Cleanup
redis-cli del "${TASK_ID}:researcher:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:analyzer:inbox" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:architect:inbox" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coder:inbox" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coordinator:status" > /dev/null 2>&1 || true