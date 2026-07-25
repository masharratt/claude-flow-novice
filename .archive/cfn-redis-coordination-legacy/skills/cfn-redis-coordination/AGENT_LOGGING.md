# Agent Logging System

Dual-output logging for CLI-spawned agents: terminal + Redis + portal visibility.

## Features

✅ **Terminal output** - Colored logs for debugging in tmux/terminal
✅ **File logging** - Persisted to `/tmp/agent-*.log`
✅ **Redis pub/sub** - Real-time streaming to web portal
✅ **Redis history** - Last 7 days stored in sorted sets
✅ **Portal filters** - Filter by repository, agent, or log level

## Quick Start

### 1. Source in Agent Scripts

```bash
#!/usr/bin/env bash
source .claude/skills/redis-coordination/agent-log.sh

# Set context
export AGENT_ID="backend-dev-1"
export TASK_ID="$1"  # Pass from command line

# Log throughout execution
agent_log "info" "Starting task execution"
agent_log "debug" "Loading configuration from $CONFIG_FILE"
agent_log "warn" "High memory usage detected: ${MEMORY}MB"
agent_log "error" "Connection failed: $ERROR_MSG"
```

### 2. Standalone Usage

```bash
# Direct command-line usage
./.claude/skills/redis-coordination/agent-log.sh info "Agent initialized" \
  --agent-id researcher-1 \
  --task-id task-auth-123

# From any script
./.claude/skills/redis-coordination/agent-log.sh error "Validation failed" \
  --agent-id reviewer-2 \
  --task-id task-auth-123
```

### 3. Log Levels

- **debug** - Detailed debugging information (cyan)
- **info** - General informational messages (green)
- **warn** - Warning messages (yellow)
- **error** - Error conditions (red)

## Output Destinations

**1. Terminal (with colors)**
```
[INFO] [backend-dev-1] Starting authentication implementation
[WARN] [backend-dev-1] Database connection slow
[ERROR] [reviewer-1] JWT validation failed
```

**2. File (`/tmp/agent-<id>.log`)**
```
[2025-10-20T07:02:48Z] [INFO] [backend-dev-1] Starting authentication implementation
[2025-10-20T07:02:48Z] [WARN] [backend-dev-1] Database connection slow
[2025-10-20T07:02:48Z] [ERROR] [reviewer-1] JWT validation failed
```

**3. Redis (`swarm:<task-id>:logs`)**
```json
{
  "level": "info",
  "message": "Starting authentication implementation",
  "agentId": "backend-dev-1",
  "taskId": "task-auth-123",
  "repository": "claude-flow-novice",
  "timestamp": "2025-10-20T07:02:48Z"
}
```

**4. Web Portal (http://localhost:3456 → Logs tab)**
- Real-time streaming via WebSocket
- Filter by repository, agent, or level
- Shows last 1000 logs (100 displayed)
- Auto-refreshes on new logs

## Integration Points

### Option 1: Source in Main Agent Script

```bash
# In your main agent script
source .claude/skills/redis-coordination/agent-log.sh

# Set global context once
export AGENT_ID="${AGENT_TYPE}-${AGENT_NUM}"
export TASK_ID="$TASK_ID"

# Then log freely
agent_log "info" "Agent spawned successfully"
# ... agent work ...
agent_log "info" "Task completed with confidence 0.95"
```

### Option 2: Wrap Agent Spawning

```bash
# In orchestrate-cfn-loop.sh or spawn-agent.sh
./.claude/skills/redis-coordination/agent-log.sh info \
  "Spawning agent: $AGENT_ID for task: $TASK_ID" \
  --agent-id "$AGENT_ID" \
  --task-id "$TASK_ID"

# Spawn agent
npx claude-flow-novice agent "$AGENT_TYPE" --task-id "$TASK_ID"

# Log completion
./.claude/skills/redis-coordination/agent-log.sh info \
  "Agent $AGENT_ID completed" \
  --agent-id "$AGENT_ID" \
  --task-id "$TASK_ID"
```

### Option 3: Add to Existing Agent Logic

If you have existing CLI agent code, wrap key operations:

```bash
# Before long operation
agent_log "info" "Starting database migration"

# During operation
if [ "$ROWS_UPDATED" -gt 10000 ]; then
  agent_log "warn" "Large migration in progress: $ROWS_UPDATED rows"
fi

# On error
if ! run_migration; then
  agent_log "error" "Migration failed: $ERROR"
  exit 1
fi

# On success
agent_log "info" "Migration completed: $ROWS_UPDATED rows updated"
```

## Advanced Options

### Skip Terminal Output (Quiet Mode)

```bash
agent_log "info" "Background task started" --no-terminal
```

### Skip Redis Output (Local Only)

```bash
agent_log "debug" "Local debug info" --no-redis
```

### Manual Context Override

```bash
agent_log "error" "Connection timeout" \
  --agent-id "custom-agent" \
  --task-id "override-task-id"
```

## Portal Usage

1. **Open portal:** http://localhost:3456
2. **Go to Logs tab** (📝 Logs)
3. **Filter logs:**
   - Repository: Select specific repo or "All Repositories"
   - Agent: Select specific agent or "All Agents"
   - Level: debug/info/warn/error or "All Levels"
4. **Clear logs:** Click "Clear Logs" button

**Stats shown:**
- Total logs in memory
- Number of repositories logging
- Number of active agents

## Redis Keys

**Pub/Sub Channel:**
```
swarm:<task-id>:logs
```

**Sorted Set (History):**
```
swarm:<task-id>:logs:history
```
- Score: Unix timestamp
- Value: JSON log entry
- TTL: 7 days (604800 seconds)

## Examples

### Example 1: CFN Loop Agent

```bash
#!/usr/bin/env bash
source .claude/skills/redis-coordination/agent-log.sh

AGENT_ID="coder-3"
TASK_ID="$1"

agent_log "info" "Starting Loop 3 implementation phase"

# Implement feature
agent_log "debug" "Reading specification from spec.md"
agent_log "info" "Implementing authentication service"

if ! run_tests; then
  agent_log "error" "Tests failed - iteration needed"
  exit 1
fi

agent_log "info" "Implementation complete - confidence: 0.88"
```

### Example 2: Orchestrator Logging

```bash
# In orchestrate-cfn-loop.sh
agent_log "info" "CFN Loop started - mode: $MODE" \
  --agent-id "orchestrator" \
  --task-id "$TASK_ID"

agent_log "info" "Spawning Loop 3 agents: $LOOP3_AGENTS" \
  --agent-id "orchestrator" \
  --task-id "$TASK_ID"

# ... spawn agents ...

agent_log "info" "Loop 3 consensus: $CONSENSUS (gate: $GATE_THRESHOLD)" \
  --agent-id "orchestrator" \
  --task-id "$TASK_ID"
```

## Troubleshooting

**Logs not appearing in portal:**
1. Check Redis connection: `redis-cli ping`
2. Check portal subscription: Look for "✅ Subscribed to swarm:*:logs" in portal startup
3. Verify task ID matches swarm task ID
4. Check Redis pub/sub: `redis-cli psubscribe "swarm:*:logs"`

**Colors not showing in terminal:**
- WSL/Linux should show colors automatically
- tmux: Colors should work by default
- If colors missing, terminal may not support ANSI codes

**Log file not created:**
- Check permissions on `/tmp/`
- Verify `AGENT_ID` is set (file named `/tmp/agent-${AGENT_ID}.log`)

## Performance

- **Minimal overhead:** ~5ms per log entry
- **Non-blocking:** Redis operations use `> /dev/null 2>&1 || true`
- **Memory efficient:** Portal keeps max 1000 logs, shows 100
- **Auto-cleanup:** Redis history expires after 7 days

## Migration from Old Logging

**Before:**
```bash
echo "[INFO] Agent started"
```

**After:**
```bash
source .claude/skills/redis-coordination/agent-log.sh
agent_log "info" "Agent started"
```

Benefits: Same terminal output + Redis pub/sub + portal visibility + file logging
