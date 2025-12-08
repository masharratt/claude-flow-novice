# Design Patterns - Architecture Reference

Architecture Decision Records (ADRs), design patterns, and coordination primitives for CFN agent systems.

## Table of Contents
1. [Architecture Decision Records](#architecture-decision-records)
2. [Defensive Programming Patterns](#defensive-programming-patterns)
3. [Coordination Patterns](#coordination-patterns)
4. [Agent Lifecycle Patterns](#agent-lifecycle-patterns)
5. [Data Persistence Patterns](#data-persistence-patterns)
6. [Security Patterns](#security-patterns)

---

## Architecture Decision Records

### ADR-001: Dual-Layer Persistence (Redis + SQLite/PostgreSQL)

**Status:** Accepted

**Decision:** Implement two-layer persistence:
- **Layer 1 (Redis)**: Transient data with automatic expiration
  - Query result cache (TTL: 1 hour default)
  - Coordination signals and state (TTL: 24 hours)
  - Session data (TTL: duration of operation)
  - Lock mechanisms (TTL: operation timeout + grace period)
- **Layer 2 (SQLite/PostgreSQL)**: Persistent operational data
  - Audit logs (TTL: 90 days to archival)
  - Schema definitions (TTL: permanent, versioned)
  - Transaction logs (TTL: 30 days active, then archived)
  - Artifact metadata (TTL: permanent)

**Performance Impact:**
- Query caching: <1ms vs 50-100ms disk access
- Reduced database I/O: ~70% reduction in write operations

### ADR-002: Correlation-Based Tracing

**Status:** Accepted

**Decision:** Every operation receives a unique correlation key:
```
Format: ${OPERATION}:${ITERATION}:${TIMESTAMP}
Example: "query-agents-v2:iter-3:1731752400000"
```

### ADR-003: Multi-Layer Network Isolation

**Status:** Accepted

**Decision:** Three-tier network architecture:
- CFN Network (172.30.0.0/16): Orchestrator, Redis, Agents, Monitoring
- MCP Network (172.31.0.0/16): Isolated MCP servers (Playwright, Redis Tools, N8N, Security)
- Worktree Networks: Branch-isolated with deterministic port allocation

---

## Defensive Programming Patterns

### 1. Defensive File Handling

```bash
# Check existence AND size before reading
if [ -f "$FILE" ] && [ -s "$FILE" ]; then
  DATA=$(cat "$FILE")
  # Parse DATA safely
else
  # Set safe defaults
  DATA=""
  DECISION="ABORT"
  REASON="File missing or empty"
  echo "[WARNING] $FILE missing or empty, using defaults" >&2
fi
```

**Key Principles:**
- Test existence (`-f`) AND size (`-s`)
- Provide explicit defaults for all variables
- Log warnings for debugging
- Never leave coordination variables uninitialized

### 2. Process Group Management

```bash
# Create process group for cleanup control
setsid long_running_command &
PID=$!
PGID=$(ps -o pgid= -p $PID | tr -d ' ')

# Trap for guaranteed cleanup
cleanup() {
  echo "[INFO] Cleaning up process group $PGID"
  kill -TERM -$PGID 2>/dev/null || true
  sleep 1
  kill -KILL -$PGID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait with timeout
timeout 300 wait $PID || {
  echo "[ERROR] Process timeout, forcing cleanup"
  cleanup
  exit 1
}
```

**Key Principles:**
- Use `setsid` to create new process group
- Store both PID and PGID
- Trap EXIT, INT, TERM for all exit paths
- TERM first, then KILL after grace period

### 3. Redis Key Guarantees

```bash
# ALWAYS create key, even on error path
DECISION="${PARSED_DECISION:-ABORT}"
CONFIDENCE="${EXTRACTED_CONFIDENCE:-0.0}"

# Guarantee key creation
redis-cli LPUSH "swarm:$TASK_ID:decision" "$DECISION" >/dev/null
redis-cli LPUSH "swarm:$TASK_ID:confidence:$AGENT_ID" "$CONFIDENCE" >/dev/null

# Log what was stored
echo "[INFO] Stored $DECISION to Redis (confidence: $CONFIDENCE)"
```

**Key Principles:**
- Create coordination keys in all code paths (success and error)
- Use fallback defaults (`:-ABORT`, `:-0.0`)
- Never leave BLPOP dependencies unsatisfied
- Log key creation for debugging

### 4. Timeout with Fallback

```bash
# Timeout with explicit fallback
RESULT=$(timeout 60 redis-cli BLPOP "swarm:$TASK_ID:key" 60 2>/dev/null || echo "")

if [ -z "$RESULT" ]; then
  echo "[WARNING] Timeout waiting for key, using default" >&2
  RESULT="default_value"
fi
```

---

## Coordination Patterns

### Chain Pattern
Sequential execution through agents
```bash
# Agent 1 completes → signals Agent 2
redis-cli LPUSH "chain:$TASK_ID:agent1:complete" "payload"

# Agent 2 waits for Agent 1
redis-cli BLPOP "chain:$TASK_ID:agent1:complete" 60
```

### Broadcast Pattern
One-to-many signal distribution
```bash
# Broadcast to all agents
for agent_id in $AGENT_IDS; do
  redis-cli LPUSH "broadcast:$TASK_ID:$agent_id" "payload"
done
```

### Consensus Collection Pattern
Aggregate decisions from multiple agents
```bash
# Collect N decisions
collect-results --task-id "$TASK_ID" --required $EXPECTED_AGENTS --threshold 0.9
```

### Mesh Pattern
Peer-to-peer coordination without central orchestrator
```bash
# Each agent can signal any other agent
redis-cli LPUSH "mesh:$TASK_ID:$FROM_AGENT:$TO_AGENT" "payload"
```

---

## Agent Lifecycle Patterns

### Spawn Pattern
```bash
# CLI Mode (Production)
./.claude/skills/cfn-agent-spawning/spawn-agent.sh \
  --agent-id "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --mode "cli" \
  --provider "$PROVIDER"

# Task Mode (Debug)
Task("$AGENT_TYPE", "$PROMPT")
```

### Coordination Handoff
```bash
# Signal completion
redis-cli LPUSH "coord:$TASK_ID:loop3:complete" "$AGENT_ID"

# Wait for next loop signal
redis-cli BLPOP "coord:$TASK_ID:loop2:start" 60
```

### Context Injection
```bash
# Store context for next agent
./.claude/skills/redis-coordination/store-context.sh \
  --task-id "$TASK_ID" \
  --key "deliverables" \
  --value "$DELIVERABLES_JSON"
```

---

## Data Persistence Patterns

### Write-Through Cache
```bash
# Always persist to SQLite before Redis expiry
sqlite3 "$DB" "INSERT INTO audit_logs VALUES (...)"
redis-cli SETEX "cache:$KEY" 3600 "$VALUE"
```

### Correlation Key Pattern
```bash
# Generate and propagate correlation key
CORRELATION_KEY="${OPERATION}:${ITERATION}:${TIMESTAMP}"
echo "[INFO] $CORRELATION_KEY: Starting operation"
```

### Event Sourcing for State
```bash
# Store events, derive state
redis-cli LPUSH "events:$TASK_ID" "$EVENT_JSON"
redis-cli EXPIRE "events:$TASK_ID" 86400
```

---

## Security Patterns

### Token-Based MCP Authentication
```bash
# Agent-specific MCP tokens
MCP_TOKEN="agent-${AGENT_ID}-${TASK_ID}-${TIMESTAMP}"
curl -H "Authorization: Bearer $MCP_TOKEN" \
  http://mcp-playwright:8081/execute
```

### Network Isolation
- Separate Docker networks per function
- Bridge connections only where necessary
- Service names for internal communication

### Secret Management
```bash
# Never hardcode secrets
API_KEY="${CLOUDFLARE_API_KEY:-[REDACTED]}"
echo "[INFO] Using API key: ${API_KEY:0:8}..."
```

### Input Validation
```bash
# Validate agent IDs
if [[ ! "$AGENT_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "[ERROR] Invalid agent ID format" >&2
  exit 1
fi
```

---

## Performance Patterns

### Batching Operations
```bash
# Batch SQLite operations
sqlite3 "$DB" <<'EOF'
BEGIN TRANSACTION;
INSERT INTO skills ...;
INSERT INTO approval_history ...;
UPDATE skills SET ...;
COMMIT;
EOF
```

### Connection Pooling
- Maintain persistent Redis connections
- Reuse database connections where possible
- Implement connection limits

### Lazy Loading
```bash
# Load skills on demand
if [ ! -f "$SKILL_CACHE/$SKILL_NAME" ]; then
  ./.claude/skills/cfn-skill-management/load-skill.sh "$SKILL_NAME"
fi
```

---

## Error Handling Patterns

### Circuit Breaker
```bash
# Stop trying after N failures
if [ "$FAILURE_COUNT" -gt 3 ]; then
  echo "[ERROR] Circuit breaker: Too many failures" >&2
  exit 1
fi
```

### Graceful Degradation
```bash
# Fallback to local cache if Redis unavailable
if ! redis-cli ping >/dev/null 2>&1; then
  echo "[WARNING] Redis unavailable, using local cache" >&2
  USE_LOCAL_CACHE=true
fi
```

### Idempotent Operations
```bash
# Check before creating
redis-cli SETNX "lock:$TASK_ID" "$TIMESTAMP" || {
  echo "[INFO] Task already in progress"
  exit 0
}
```

---

## Monitoring Patterns

### Structured Logging
```bash
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"INFO\",\"task_id\":\"$TASK_ID\",\"agent_id\":\"$AGENT_ID\",\"message\":\"Operation completed\"}"
```

### Metrics Collection
```bash
# Push metrics to Prometheus
curl -X POST http://prometheus:9090/metrics/job/cfn_loop \
  -d "cfn_loop_duration_seconds $DURATION"
```

### Health Checks
```bash
# Service health check
check_health() {
  redis-cli ping >/dev/null 2>&1 || return 1
  [ -f "$DB" ] || return 1
  return 0
}
```

---

## Resource Management Patterns

### Memory Limits
```yaml
# Docker Compose memory limits
services:
  agent:
    mem_limit: 512m
    memswap_limit: 512m
```

### Disk Cleanup
```bash
# Cleanup old artifacts
find .artifacts -type f -mtime +7 -delete
docker system prune -f
```

### CPU Throttling
```bash
# Limit CPU usage for background tasks
nice -n 10 ionice -c2 -n7 cpu-intensive-task.sh
```

---

## Implementation Checklist

**Defensive Programming:**
- [ ] Check file existence AND size before reading
- [ ] Provide defaults for all variables
- [ ] Use process groups for background tasks
- [ ] Implement timeouts with fallbacks
- [ ] Guarantee Redis key creation in all paths

**Coordination:**
- [ ] Use correlation keys for tracing
- [ ] Create coordination keys before waiting
- [ ] Implement proper cleanup traps
- [ ] Log at every coordination step
- [ ] Use appropriate patterns (chain, broadcast, consensus)

**Security:**
- [ ] Validate all inputs
- [ ] Use token-based authentication
- [ ] Implement network isolation
- [ ] Never hardcode secrets
- [ ] Follow principle of least privilege

**Performance:**
- [ ] Batch database operations
- [ ] Use connection pooling
- [ ] Implement caching strategies
- [ ] Monitor resource usage
- [ ] Set appropriate resource limits