# CFN Wave Checkpoint Skill

## Overview

Wave checkpoint mechanism provides crash recovery, orphan container detection, and automated resumption capabilities for CFN Docker orchestration. Enables orchestrators to survive process failures and resume wave execution without losing work or leaving orphaned containers.

## Architecture

### Checkpoint Flow

```
execute_waves()
    ├── spawn_wave(task_id, wave_num)
    │   └── save_checkpoint(task_id, wave_num, container_ids, ...)
    ├── monitor_wave(task_id, wave_num)
    │   └── CRASH: Container/process dies
    └── RESUME: detect_checkpoint() → resume_wave() → cleanup_orphans()
```

### Storage

- **Primary**: Redis keys with TTL
- **Format**: JSON serialized checkpoint data
- **Key Pattern**: `cfn:wave:checkpoint:{task_id}:{wave_number}`
- **Index**: `cfn:wave:checkpoints:{task_id}` (set of all wave numbers)

### Checkpoint Data Structure

```json
{
  "task_id": "task-123",
  "wave_number": 1,
  "container_ids": ["id1", "id2", "id3"],
  "spawn_time": 1700000000,
  "expected_count": 3,
  "created_at": "2024-11-14T12:00:00Z",
  "status": "in_progress"
}
```

## Components

### 1. save-checkpoint.sh

Saves execution state before or during wave spawning. Non-blocking: if Redis unavailable, continues execution.

**Operations:**
- `save TASK_ID WAVE_NUMBER CONTAINER_IDS SPAWN_TIME EXPECTED_COUNT`
- `exists TASK_ID [WAVE_NUMBER]`
- `get TASK_ID WAVE_NUMBER`
- `update-status TASK_ID WAVE_NUMBER STATUS`

**Usage:**

```bash
# Save checkpoint before monitoring
./save-checkpoint.sh save task-123 1 "id1,id2,id3" 1700000000 3

# Check if checkpoint exists
./save-checkpoint.sh exists task-123 1

# Get checkpoint data
./save-checkpoint.sh get task-123 1

# Update status to completed
./save-checkpoint.sh update-status task-123 1 "completed"
```

**Exit Codes:**
- 0: Success
- 1: Validation error
- 2: Redis connection error

### 2. resume-wave.sh

Detects checkpoints and resumes orphaned containers. Verifies containers still running, updates status.

**Operations:**
- `resume TASK_ID [WAVE_NUMBER]`
- `get-resumable TASK_ID`
- `verify TASK_ID WAVE_NUMBER`

**Usage:**

```bash
# Resume all waves with checkpoints
./resume-wave.sh resume task-123

# Resume specific wave
./resume-wave.sh resume task-123 1

# Get list of resumable waves
./resume-wave.sh get-resumable task-123

# Verify container status for wave
./resume-wave.sh verify task-123 1
```

**Exit Codes:**
- 0: Success
- 1: Validation error / No checkpoints found
- 2: Redis connection error

### 3. cleanup-orphans.sh

Removes orphaned containers while preserving logs for post-mortem analysis.

**Operations:**
- `cleanup TASK_ID [WAVE_NUMBER]`
- `list TASK_ID [WAVE_NUMBER]`
- `summary TASK_ID`

**Configuration:**
- `LOG_PRESERVE_DIR`: Directory for preserved logs (default: `.logs/wave-recovery`)
- `DRY_RUN`: Preview cleanup without removing (default: `false`)

**Usage:**

```bash
# Clean all orphaned containers for task
./cleanup-orphans.sh cleanup task-123

# Clean specific wave orphans
./cleanup-orphans.sh cleanup task-123 1

# List orphaned containers (no cleanup)
./cleanup-orphans.sh list task-123

# View cleanup summary
./cleanup-orphans.sh summary task-123

# Dry-run: preview cleanup
DRY_RUN=true ./cleanup-orphans.sh cleanup task-123
```

**Exit Codes:**
- 0: Success
- 1: Validation error
- 2: Cleanup errors occurred

## Integration with orchestrate.sh

### Checkpoint Detection

Add to `execute_waves()` before spawning:

```bash
execute_waves() {
    local task_id="$1"
    local plan_file="$2"

    # Check for existing checkpoint
    if source "$HOME/.claude/skills/cfn-sprint-execution/lib/checkpoint/save-checkpoint.sh" && \
       checkpoint_exists "$task_id"; then
        log "Found checkpoint, resuming..."

        # Resume execution
        source "$HOME/.claude/skills/cfn-sprint-execution/lib/checkpoint/resume-wave.sh"
        resume_wave "$task_id"

        # Continue monitoring from checkpoint
    else
        # Normal execution path
        # ... spawn and monitor waves ...
    fi
}
```

### Checkpoint Saving

Add after successful wave spawn:

```bash
# In spawn_wave completion
if $($HOME/.claude/skills/cfn-sprint-execution/lib/checkpoint/save-checkpoint.sh \
    save "$task_id" "$wave_num" "$container_ids" "$(date +%s)" "$batch_count"); then
    log_success "Checkpoint saved for recovery"
fi
```

### Orphan Cleanup

Add to wave cleanup phase:

```bash
# After wave completion
$($HOME/.claude/skills/cfn-sprint-execution/lib/checkpoint/cleanup-orphans.sh \
    cleanup "$task_id" "$wave_num")
```

## Recovery Scenarios

### Scenario 1: Orchestrator Crash During Wave Spawn

1. Orchestrator dies while spawning containers
2. Some containers started, recorded in checkpoint
3. On restart:
   - Detect checkpoint for wave N
   - Resume from checkpoint
   - Verify containers still running
   - Continue monitoring

### Scenario 2: Network Failure During Monitoring

1. Network disconnects during wave monitoring
2. Checkpoint persisted in Redis
3. On recovery:
   - Detect checkpoint
   - Verify containers still exist (they continue running in Docker)
   - Resume monitoring from last recorded state
   - Complete monitoring

### Scenario 3: Unplanned Process Termination

1. Orchestrator killed (OOM, signal 9, etc.)
2. Checkpoint in Redis, containers in Docker
3. Recovery process:
   - Scan Redis for checkpoints
   - List all containers for task
   - Clean up orphans with log preservation
   - Option to resume from checkpoint

## Best Practices

### Checkpoint Lifecycle

1. **Create**: Save checkpoint immediately after successful spawn
2. **Update**: Mark as "in_progress", then "monitoring"
3. **Complete**: Mark as "completed" when wave finishes
4. **Clean**: Archive logs, remove checkpoint from Redis

### Log Preservation

- All container logs saved to `.logs/wave-recovery/{task_id}/wave-{number}/`
- Includes Docker inspect output for debugging
- Preserved even if containers are removed
- Accessible for post-mortem analysis

### Redis Configuration

- TTL: 3600 seconds (1 hour, configurable via `CHECKPOINT_TTL`)
- Namespace: `cfn:wave:checkpoint:*`
- Indexed by: `cfn:wave:checkpoints:{task_id}`
- Cleanup: TTL-based auto-expiration

### Error Handling

```bash
# Non-fatal checkpoint errors
if ! save_checkpoint ...; then
    log_warning "Checkpoint save failed, continuing without recovery"
    # Execution continues
fi

# Fatal resume errors
if ! resume_wave ...; then
    log_error "Failed to resume from checkpoint"
    # Decide: retry, abort, or manual intervention
fi
```

## Testing

Test suite validates:

1. **Checkpoint Creation**
   - Save with container IDs
   - Verify Redis storage
   - Check data structure

2. **Checkpoint Recovery**
   - Detect existing checkpoints
   - Verify containers exist
   - Update status correctly

3. **Orphan Detection**
   - Find containers for task/wave
   - Preserve logs before cleanup
   - Record cleanup metadata

4. **Edge Cases**
   - Redis unavailable (non-blocking)
   - Containers removed externally
   - Partial wave completion
   - Multiple concurrent tasks

## Limitations

- Redis required for cross-process recovery
- Docker labels must be set for container filtering
- Log preservation depends on disk space
- TTL means checkpoints expire after 1 hour

## Future Enhancements

1. **Distributed Checkpointing**
   - Multi-region Redis replication
   - Checkpoint mirroring

2. **Enhanced Analytics**
   - Failure root cause analysis
   - Recovery success metrics

3. **Automatic Remediation**
   - Self-healing on detected failures
   - Automatic container replacement

4. **Checkpoint Versioning**
   - Multiple checkpoint snapshots
   - Rollback to earlier state

## Configuration Variables

```bash
# Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Checkpoint settings
CHECKPOINT_TTL=3600           # 1 hour
LOG_PRESERVE_DIR=.logs/wave-recovery

# Cleanup behavior
DRY_RUN=false                 # Preview mode
CLEANUP_PARALLEL=5            # Parallel cleanup workers
```

## Related Skills

- `cfn-docker-wave-execution`: Wave spawning and monitoring
- `cfn-docker-redis-coordination`: Redis communication layer
- `cfn-error-batching-strategy`: Wave batching and planning
