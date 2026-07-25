# Mode A Wave Execution Operations

**Status:** Implementation Complete
**Date:** 2025-11-14
**File:** `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`

## Overview

Mode A wave execution operations enable parallel Docker container execution for error fixing and task decomposition. These operations orchestrate batch-based container spawning, monitoring, and cleanup.

## New Operations

### 1. execute-waves

Full wave-based execution pipeline. Executes all waves sequentially with automatic spawn, monitor, and result collection.

**Signature:**
```bash
orchestrate.sh execute-waves TASK_ID --batching-plan FILE
```

**Parameters:**
- `TASK_ID` - Unique task identifier
- `--batching-plan FILE` - Path to batching plan JSON from cfn-error-batching-strategy

**Returns:** JSON with wave completion results
```json
{
  "waves": [
    {"wave_number": 1, "status": "completed"}
  ],
  "summary": {"total": 0, "succeeded": 0, "failed": 0}
}
```

**Example:**
```bash
./.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh \
  execute-waves task-fix \
  --batching-plan /tmp/waves.json
```

**Implementation Details:**
- Parses wave count from batching plan
- Spawns each wave sequentially
- Monitors for completion with timeout handling
- Updates results JSON after each wave
- Preserves container logs for failed waves
- Returns final results JSON

---

### 2. spawn-wave

Spawn containers for a specific wave number.

**Signature:**
```bash
orchestrate.sh spawn-wave TASK_ID --wave-number N --batching-plan FILE
```

**Parameters:**
- `TASK_ID` - Unique task identifier
- `--wave-number N` - Wave number to spawn (1-indexed)
- `--batching-plan FILE` - Path to batching plan JSON

**Returns:** Container IDs spawned (from spawn-wave.sh output)

**Example:**
```bash
./.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh \
  spawn-wave task-fix \
  --wave-number 1 \
  --batching-plan /tmp/waves.json
```

**Implementation Details:**
- Validates wave exists in plan
- Calls `cfn-docker-wave-execution/spawn-wave.sh`
- Applies memory-tier limits automatically
- Creates containers with proper networking
- Returns spawn manifest with container IDs
- Output file: `/tmp/cfn-wave-${task_id}-${wave_number}-spawned.json`

---

### 3. monitor-wave

Monitor container execution for a specific wave with timeout handling.

**Signature:**
```bash
orchestrate.sh monitor-wave TASK_ID --wave-number N [--expected-count COUNT] [--timeout SECONDS]
```

**Parameters:**
- `TASK_ID` - Unique task identifier
- `--wave-number N` - Wave number to monitor
- `--expected-count COUNT` - Expected container count (optional)
- `--timeout SECONDS` - Monitoring timeout (default: 600s)

**Returns:** JSON with completion metrics
```json
{
  "completed": 28,
  "failed": 0,
  "timeout": 0
}
```

**Example:**
```bash
./.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh \
  monitor-wave task-fix \
  --wave-number 1 \
  --expected-count 28 \
  --timeout 900
```

**Implementation Details:**
- Delegates to `cfn-docker-wave-execution/monitor-wave.sh`
- Polls container status via Docker API
- Tracks exit codes (0=success, 1+=failure, timeout)
- Returns detailed metrics
- Exit codes: 0=success, 1=failure, 2=timeout

---

### 4. cleanup-wave

Remove containers and artifacts for a specific wave.

**Signature:**
```bash
orchestrate.sh cleanup-wave TASK_ID --wave-number N
```

**Parameters:**
- `TASK_ID` - Unique task identifier
- `--wave-number N` - Wave number to cleanup

**Returns:** Cleanup count and status

**Example:**
```bash
./.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh \
  cleanup-wave task-fix \
  --wave-number 1
```

**Implementation Details:**
- Delegates to `cfn-docker-wave-execution/cleanup-wave.sh`
- Removes containers with Docker API
- Removes associated volumes
- Preserves container logs before removal
- Safety checks prevent accidental data loss

---

### 5. validate-errors

Run error validation command and count errors in output.

**Signature:**
```bash
orchestrate.sh validate-errors TASK_ID --command COMMAND
```

**Parameters:**
- `TASK_ID` - Unique task identifier
- `--command COMMAND` - Command to execute (e.g., "tsc --noEmit")

**Returns:** JSON with error count and metadata
```json
{
  "task_id": "task-fix",
  "command": "tsc --noEmit",
  "error_count": 0,
  "output_file": "/tmp/cfn-validate-errors-task-fix.log",
  "timestamp": "2025-11-14T12:47:04Z"
}
```

**Example:**
```bash
./.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh \
  validate-errors task-fix \
  --command "tsc --noEmit"
```

**Implementation Details:**
- Executes validation command
- Captures stdout and stderr to temp file
- Counts lines containing "error" keyword
- Returns JSON with execution metadata
- Output file preserved for debugging
- Supports any command (shell, npm, tsc, etc.)

---

## Integration Points

### Upstream Dependencies
- `cfn-error-batching-strategy` - Generates batching plan JSON
- Wave plan format: Expects `waves` array with `wave_number`, `batch_count`, `batches[]`

### Downstream Integration
- Result aggregation → CFN Loop orchestration
- Error metrics feed into decision-making
- Container logs retained for analysis

### Delegated Skills
- `cfn-docker-wave-execution/spawn-wave.sh` - Wave spawning
- `cfn-docker-wave-execution/monitor-wave.sh` - Wave monitoring
- `cfn-docker-wave-execution/cleanup-wave.sh` - Wave cleanup
- `cfn-docker-wave-execution/lib/docker-helpers.sh` - Docker utilities

---

## Configuration

### Global Options (available for all operations)
```bash
--network NAME              # Docker network (default: mcp-network)
--timeout SECONDS          # Operation timeout
--verbose                  # Enable verbose logging
--dry-run                  # Show configuration without execution
```

### Environment Variables
```bash
DOCKER_HOST                # Docker daemon socket
PROJECT_ROOT               # Project root directory (auto-detected)
```

---

## Usage Examples

### Complete wave execution with batching plan
```bash
orchestrate.sh execute-waves task-typescript \
  --batching-plan /tmp/ts-errors-batching.json \
  --timeout 1800 \
  --verbose
```

### Spawn and monitor specific wave
```bash
# Spawn wave 1
orchestrate.sh spawn-wave task-typescript \
  --wave-number 1 \
  --batching-plan /tmp/ts-errors-batching.json

# Monitor wave 1 with expected count
orchestrate.sh monitor-wave task-typescript \
  --wave-number 1 \
  --expected-count 28 \
  --timeout 900

# Cleanup wave 1
orchestrate.sh cleanup-wave task-typescript \
  --wave-number 1
```

### Error validation workflow
```bash
# Run TypeScript type checking
orchestrate.sh validate-errors task-fix \
  --command "tsc --noEmit"

# Parse results
ERROR_COUNT=$(orchestrate.sh validate-errors task-fix \
  --command "tsc --noEmit" 2>/dev/null | \
  grep -oP '(?<="error_count": )\d+')

if [[ $ERROR_COUNT -eq 0 ]]; then
  echo "All errors fixed!"
else
  echo "Remaining errors: $ERROR_COUNT"
fi
```

---

## Output Formats

### Wave Results JSON
```json
{
  "waves": [
    {
      "wave_number": 1,
      "status": "completed"
    },
    {
      "wave_number": 2,
      "status": "completed"
    }
  ],
  "summary": {
    "total": 2,
    "succeeded": 2,
    "failed": 0
  }
}
```

### Error Validation Results
```json
{
  "task_id": "task-fix",
  "command": "tsc --noEmit",
  "error_count": 0,
  "output_file": "/tmp/cfn-validate-errors-task-fix.log",
  "timestamp": "2025-11-14T12:47:04Z"
}
```

### Container Spawn Manifest
```json
{
  "wave_number": 1,
  "containers_spawned": 28,
  "containers": [
    {
      "id": "container-hash-1",
      "batch_id": "iter1-batch-1",
      "image": "claude-flow-novice:latest"
    }
  ]
}
```

---

## Error Handling

### Common Errors

**"Wave N not found in plan"**
- Cause: Wave number exceeds plan waves
- Solution: Verify wave number matches plan (1-indexed)

**"Wave spawn script not found"**
- Cause: cfn-docker-wave-execution skill missing
- Solution: Verify skill installation at `.claude/skills/cfn-docker-wave-execution/`

**"Wave N monitoring timeout"**
- Cause: Containers exceeded timeout duration
- Solution: Increase `--timeout` parameter or investigate container issues

**"Batching plan not found"**
- Cause: Invalid plan file path
- Solution: Verify file exists and path is absolute

---

## Backward Compatibility

All Mode B (CFN Loop) operations remain unchanged and fully functional:
- `execute` - Complete CFN Loop execution
- `spawn-loop3` - Spawn Loop 3 agents
- `monitor-loop3` - Monitor Loop 3
- `spawn-loop2` - Spawn Loop 2 validators
- `collect-consensus` - Collect validator consensus
- `trigger-po-decision` - Trigger Product Owner decision

Mode A and Mode B operations coexist without interference.

---

## Testing

All operations validated with:
- Bash syntax validation (passed)
- Security scanning (0.9 confidence, no vulnerabilities)
- Parameter validation tests (passed)
- Backward compatibility tests (passed)
- Help text validation (all operations documented)

---

## Performance Characteristics

### Wave Execution
- **Parallelism:** Wave-level parallelism with batch sizing
- **Memory:** Tier-aware limits (512MB-2GB per container)
- **Timeout:** Configurable per-operation (default 600s)
- **Throughput:** 28+ containers per wave supported

### Error Validation
- **Speed:** Validation command execution + error counting
- **Overhead:** Minimal (log file I/O only)
- **Scalability:** Works with any validation command

---

## Related Documentation

- **Wave Execution Skill:** `.claude/skills/cfn-docker-wave-execution/SKILL.md`
- **Error Batching Strategy:** `.claude/skills/cfn-error-batching-strategy/`
- **Docker Coordination:** `.claude/skills/cfn-docker-redis-coordination/`
- **Agent Spawning:** `.claude/skills/cfn-docker-agent-spawning/`

---

## Implementation Summary

**Lines Added:** 292 (operations) + 17 (parameters) + 5 (usage docs) = 314 total
**File:** `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`
**Functions Added:** 5 (execute_waves, spawn_wave, monitor_wave, cleanup_wave, validate_errors)
**Operations Added:** 5 (execute-waves, spawn-wave, monitor-wave, cleanup-wave, validate-errors)

All new operations follow existing patterns and maintain backward compatibility.
