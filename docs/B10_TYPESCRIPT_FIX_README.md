# B10 TypeScript Error Fix - 32 Agent Deployment

## Overview

This test deploys 32 Docker agents in parallel to fix TypeScript errors in Batch 10 (Security, Permissions & Reliability Services) of the ourstories-v2 frontend.

## Architecture

```
Main Test Script (b10-typescript-fix-test.sh)
    ├── Setup: Network + Redis
    ├── Coordinator Script (coordinator.sh)
    │   ├── Load B10 files from JSON (32 files)
    │   ├── Create Redis task queue
    │   ├── Spawn 32 agents in parallel
    │   └── Monitor completion
    └── 32 Agent Containers
        ├── Claim task via Redis RPOP (atomic)
        ├── Mount /workspace (ourstories-v2/frontend)
        ├── Run TypeScript compiler (initial error count)
        ├── Invoke Claude Code CLI (typescript-specialist agent)
        ├── Run TypeScript compiler (final error count)
        └── Report results to Redis
```

## Pre-Flight Checklist

### 1. Git Status
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend
git status
# Ensure working tree is clean or changes are committed
```

### 2. Create Git Backup Branch
```bash
git checkout -b backup/pre-b10-agent-fix
git push origin backup/pre-b10-agent-fix
git checkout main  # or your working branch
```

### 3. Verify Docker Resources
```bash
docker system df
# Available disk space: >10GB recommended
# Memory: 32GB+ recommended (1GB per agent × 32)
```

### 4. Verify Batch File
```bash
cat /mnt/c/Users/masha/Documents/ourstories-v2/frontend/planning/frontend/frontend-error-batches.json | jq '.B10 | {files: (.files | length), total_errors: .total_errors}'
# Should show: files=32, total_errors=99
```

### 5. Test TypeScript Compiler
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend
npx tsc --version
# Ensure TypeScript is installed
```

## Execution

### Run the Test
```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice
bash tests/docker/b10-typescript-fix-test.sh
```

### Monitor Progress
```bash
# In another terminal
watch -n 2 'docker ps --filter "name=b10-agent-" | wc -l'

# Check Redis task queue
redis-cli -h localhost -p 6381 LLEN task:queue
redis-cli -h localhost -p 6381 GET task:completed
```

### Check Agent Logs
```bash
# View specific agent
docker logs b10-agent-1

# View all agents (first 10 lines each)
for i in {1..32}; do
    echo "=== Agent $i ==="
    docker logs "b10-agent-$i" 2>&1 | head -10
done
```

## Expected Timeline

1. **Setup:** ~5 seconds (network + Redis)
2. **Agent spawn:** ~10 seconds (32 containers)
3. **TypeScript fixes:** 2-5 minutes per agent (varies by file complexity)
4. **Total:** ~10 minutes maximum (600s timeout)

## Results

### Results File
```bash
cat /tmp/b10-fix-results.json | jq '.'
```

### Summary Fields
- `agents_spawned`: Should be 32
- `tasks_completed`: Should be 32
- `fixes_applied`: Total number of errors fixed
- `errors_remaining`: Errors that couldn't be auto-fixed

### Per-File Results
```bash
cat /tmp/b10-fix-results.json | jq '.results[] | select(.status == "success")'
cat /tmp/b10-fix-results.json | jq '.results[] | select(.status == "partial")'
cat /tmp/b10-fix-results.json | jq '.results[] | select(.status == "failed")'
```

## Post-Execution Validation

### 1. Review Git Diff
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend
git diff --stat
git diff src/services/  # Review specific directory
```

### 2. Run Type Check
```bash
npm run type-check
# or
npx tsc --noEmit
```

### 3. Run Tests
```bash
npm test
```

### 4. Review Security Files
Since B10 is security-critical, manually review changes:
```bash
git diff src/services/auth/
git diff src/services/security/
git diff src/services/permissions/
```

## Rollback (If Needed)

### Discard All Changes
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend
git checkout .
git clean -fd
```

### Restore from Backup Branch
```bash
git checkout backup/pre-b10-agent-fix
git checkout -b main-restored
```

## Configuration Options

### Memory Per Agent
```bash
# Default: 1GB per agent
AGENT_MEMORY=512m bash tests/docker/b10-typescript-fix-test.sh

# High complexity files
AGENT_MEMORY=2g bash tests/docker/b10-typescript-fix-test.sh
```

### Frontend Path
```bash
FRONTEND_PATH=/custom/path/to/frontend bash tests/docker/b10-typescript-fix-test.sh
```

## Troubleshooting

### Agent Fails to Start
```bash
# Check Docker resources
docker system df
docker system prune  # If needed

# Check image exists
docker images | grep claude-flow-novice
```

### TypeScript Compiler Not Found
```bash
# Inside agent container
docker exec -it b10-agent-1 sh
cd /workspace
npx tsc --version
```

### File Not Found Errors
```bash
# Verify mount
docker inspect b10-agent-1 | jq '.[0].Mounts'

# Check file exists on host
ls -la /mnt/c/Users/masha/Documents/ourstories-v2/frontend/src/services/
```

### Redis Connection Issues
```bash
# Test from host
redis-cli -h localhost -p 6381 ping

# Test from container network
docker run --rm --network cfn-b10-fix redis:alpine redis-cli -h cfn-b10-redis ping
```

## Safety Features

1. **Read-Write Mount:** Agents can modify files (required for fixes)
2. **Git Backup:** User prompted to commit before execution
3. **Atomic Task Assignment:** Redis RPOP prevents work overlap
4. **Detailed Logging:** All agent actions logged to Docker logs
5. **Results JSON:** Complete audit trail of all fixes

## Next Steps After Success

1. Review `git diff` carefully
2. Run full test suite
3. Commit changes with descriptive message
4. Run the same test on other batches (B1-B9)
5. Consider converting coordinator to AI agent for adaptive strategy

## Future Enhancements

- Convert coordinator script to AI agent (adaptive strategy)
- Add retry logic for failed fixes
- Implement multi-phase fixing (simple errors first, complex later)
- Add automatic commit message generation
- Integrate with CI/CD pipeline
