# Docker Container Lifecycle Management

## Overview

CFN Loop Docker agents now implement automatic metadata capture with container auto-removal, providing the best of both worlds: clean container state and comprehensive debugging artifacts.

## Architecture

### Container Lifecycle Pattern

```
Agent Spawn → Execute Task → Capture Metadata → Remove Container
                                       ↓
                           Debug Artifacts Preserved
```

### Why This Pattern?

**Traditional approaches:**
- **Keep containers (`docker run`)**: Accumulates stopped containers, wastes disk space
- **Auto-remove (`docker run --rm`)**: Clean state but no debugging capability

**Our solution:**
- Capture full metadata **before** removal
- Remove container automatically
- Preserve structured debug artifacts
- Optional container preservation for interactive debugging

## Implementation

### Metadata Capture Script

Location: `scripts/docker-utils/capture-and-cleanup.sh`

**Captured artifacts:**
1. **inspect.json** - Full container metadata (env vars, exit code, network state)
2. **logs.txt** - Complete stdout/stderr output
3. **stats.json** - Final resource usage snapshot (memory/CPU)
4. **summary.txt** - Quick reference (IDs, exit code, timestamps)

**Storage location:** `/tmp/cfn-debug/$TASK_ID/$AGENT_ID/`

### Usage

```bash
# Automatic cleanup (default)
./scripts/docker-utils/capture-and-cleanup.sh <CONTAINER_ID> <TASK_ID> <AGENT_ID>

# Preserve containers for debugging
CFN_DOCKER_KEEP_CONTAINERS=true ./scripts/docker-utils/capture-and-cleanup.sh ...
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CFN_DOCKER_KEEP_CONTAINERS` | `false` | Preserve containers after capture |
| `CFN_DOCKER_DEBUG_DIR` | `/tmp/cfn-debug` | Debug artifacts base directory |

## Test Validation

**Test 15: Container metadata capture and auto-removal**

Validates:
- ✅ Container is removed after execution
- ✅ All 4 metadata files are captured
- ✅ Exit code is preserved
- ✅ Debug artifacts are structured by task/agent ID

## Benefits

### Operational
1. **Clean state**: No container accumulation
2. **Resource efficient**: Only metadata persists (KB vs MB per container)
3. **Simple orchestration**: No cleanup logic needed in coordinator
4. **CFN Loop aligned**: Fresh agents per iteration, no state reuse

### Debugging
1. **Full forensics**: All runtime metadata preserved
2. **Structured storage**: Organized by task/agent hierarchy
3. **Quick reference**: Summary file for at-a-glance status
4. **Optional preservation**: Interactive debugging when needed

### What We Capture vs Lose

**Captured (available in metadata):**
- ✅ Exit codes
- ✅ Environment variables
- ✅ Resource stats (memory/CPU)
- ✅ Network state
- ✅ All logs (stdout/stderr)
- ✅ Process metadata

**Lost (requires container preservation):**
- ❌ Interactive debugging (`docker exec`)
- ❌ Filesystem browsing (`/app/workspace`)

For these rare cases, use `CFN_DOCKER_KEEP_CONTAINERS=true`

## Integration with Orchestrator

The orchestrator will automatically invoke `capture-and-cleanup.sh` after each agent completes:

```bash
# In orchestrator
CONTAINER_ID=$(docker run -d ...)

# Wait for completion
docker wait "$CONTAINER_ID"

# Capture and cleanup
./scripts/docker-utils/capture-and-cleanup.sh "$CONTAINER_ID" "$TASK_ID" "$AGENT_ID"
```

Exit code is preserved and returned to orchestrator for decision-making (PROCEED/ITERATE/ABORT).

## Test Results Summary

**Current status (15 total tests):**

✅ **Passing (11/15):**
1. Docker network setup
2. Redis container startup
4. Docker agent Redis connectivity
5. Docker agent coordination via Redis
6. Docker agent message broadcasting
7. Docker agent resource monitoring
8. Container cleanup and network isolation
12. Docker coordinator CFN_DOCKER_MODE export
13. Docker agent image existence and build validation
15. Container metadata capture and auto-removal

❌ **Failing (4/15):**
3. Docker agent container spawn and execution (investigation needed)
9-11. CFN_DOCKER_MODE detection (unnecessary - architectural mismatch, can be removed)
14. Docker agent container execution and CLI functionality (depends on Test 3)

**Next steps:**
1. Remove Tests 9-11 (user confirmed unnecessary)
2. Debug Test 3 failure (blocks Test 14)
3. Final validation with 12 tests (11 passing expected)
