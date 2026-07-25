# Docker Coordinator - Full Integration Test Plan

**Date:** 2025-11-13
**Status:** Ready for Execution
**Target:** Full-scale validation with ~1000 TypeScript errors
**Estimated Duration:** 2-3 hours

---

## Objective

Validate the Docker coordinator system under real-world load conditions by:
1. Rolling back ourstories-v2 frontend to a commit with ~1000 TypeScript errors
2. Running the intelligent coordinator through multiple iterations
3. Measuring performance, memory usage, and error reduction
4. Validating all timeout monitoring and agent management features
5. Documenting complete success metrics

---

## Pre-Test Preparation

### 1. Current State Backup

**Frontend Path:** `/mnt/c/Users/masha/Documents/ourstories-v2/frontend`

**Document current state:**
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend

# Record current commit
git log -1 --oneline > /tmp/frontend-current-commit.txt
echo "Current commit: $(cat /tmp/frontend-current-commit.txt)"

# Record current branch
git branch --show-current > /tmp/frontend-current-branch.txt
echo "Current branch: $(cat /tmp/frontend-current-branch.txt)"

# Count current errors
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS" | tr -d ' \n\r'
```

**Create safety branch:**
```bash
git checkout -b backup-before-rollback-test
git push origin backup-before-rollback-test
echo "✅ Safety branch created: backup-before-rollback-test"
```

### 2. Find Target Commit with ~1000 Errors

**Strategy:** Binary search through git history to find commit with desired error count

**Search Script:**
```bash
#!/bin/bash
# File: scripts/find-error-commit.sh

cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend

TARGET_ERRORS=1000
TOLERANCE=100  # Accept 900-1100 errors

echo "🔍 Searching for commit with ~${TARGET_ERRORS} TypeScript errors..."

# Get commits from last 6 months
COMMITS=($(git log --since="6 months ago" --oneline --format="%H" | head -50))

for commit in "${COMMITS[@]}"; do
    echo "Checking commit: $commit"

    # Checkout quietly
    git checkout $commit 2>/dev/null

    # Count errors
    ERROR_COUNT=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS" || echo "0")
    ERROR_COUNT=$(echo "$ERROR_COUNT" | tr -d ' \n\r')

    echo "  Errors: $ERROR_COUNT"

    # Check if within tolerance
    if [ "$ERROR_COUNT" -ge $((TARGET_ERRORS - TOLERANCE)) ] && \
       [ "$ERROR_COUNT" -le $((TARGET_ERRORS + TOLERANCE)) ]; then
        echo ""
        echo "✅ Found target commit!"
        echo "   Commit: $commit"
        echo "   Errors: $ERROR_COUNT"
        echo "   Date: $(git log -1 --format='%ai' $commit)"
        echo ""

        # Save for reference
        echo "$commit" > /tmp/target-test-commit.txt
        echo "$ERROR_COUNT" > /tmp/target-error-count.txt

        exit 0
    fi
done

echo "❌ No commit found with ~${TARGET_ERRORS} errors in last 50 commits"
echo "   Suggestion: Adjust TARGET_ERRORS or search further back"
```

**Alternative: Manual tsconfig.json Strictness Adjustment**

If no suitable commit found, artificially increase error count:

```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend

# Backup current tsconfig
cp tsconfig.json tsconfig.json.backup

# Enable strict checks to generate more errors
jq '.compilerOptions += {
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "strictBindCallApply": true,
  "strictPropertyInitialization": true,
  "noImplicitThis": true,
  "alwaysStrict": true
}' tsconfig.json > tsconfig.json.tmp && mv tsconfig.json.tmp tsconfig.json

# Count new errors
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS"

# If still too few, add more checks
jq '.compilerOptions += {
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noPropertyAccessFromIndexSignature": true
}' tsconfig.json > tsconfig.json.tmp && mv tsconfig.json.tmp tsconfig.json
```

---

## Test Execution Plan

### Phase 1: Environment Validation (5 minutes)

**Verify Docker infrastructure:**
```bash
# Check coordinator image
docker image inspect cfn-intelligent-coordinator:latest
echo "Coordinator image: $(docker images cfn-intelligent-coordinator:latest --format '{{.Size}}')"

# Check agent image (if exists)
docker image inspect claude-flow-novice-agent:frontend 2>/dev/null || \
  echo "⚠️  Agent image not found - will need to build or investigate"

# Verify network
docker network create cfn-network 2>/dev/null || echo "Network already exists"

# Check system resources
echo "Available memory: $(free -h | grep Mem | awk '{print $7}')"
echo "Available disk: $(df -h . | tail -1 | awk '{print $4}')"
```

**Validate error count:**
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend

ERROR_COUNT=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS" | tr -d ' \n\r')
echo "Current TypeScript errors: $ERROR_COUNT"

if [ "$ERROR_COUNT" -lt 100 ]; then
    echo "❌ Insufficient errors for full test (need ≥100, have $ERROR_COUNT)"
    echo "   Run rollback or adjust tsconfig.json strictness"
    exit 1
fi

echo "✅ Error count sufficient for testing"
```

### Phase 2: Baseline Metrics Collection (10 minutes)

**Create metrics directory:**
```bash
mkdir -p /tmp/docker-test-metrics
TEST_ID="test-$(date +%Y%m%d-%H%M%S)"
METRICS_DIR="/tmp/docker-test-metrics/${TEST_ID}"
mkdir -p "$METRICS_DIR"

echo "Test ID: $TEST_ID"
echo "Metrics directory: $METRICS_DIR"
```

**Collect baseline:**
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend

# Error breakdown by file
npx tsc --noEmit --project tsconfig.json 2>&1 | \
  grep "error TS" | \
  awk -F'[:(]' '{print $1}' | \
  sort | uniq -c | sort -rn > "$METRICS_DIR/errors-by-file.txt"

echo "Top 10 files with most errors:"
head -10 "$METRICS_DIR/errors-by-file.txt"

# Error breakdown by type
npx tsc --noEmit --project tsconfig.json 2>&1 | \
  grep -o "error TS[0-9]\+" | \
  sort | uniq -c | sort -rn > "$METRICS_DIR/errors-by-type.txt"

echo "Top 10 error types:"
head -10 "$METRICS_DIR/errors-by-type.txt"

# Total counts
TOTAL_ERRORS=$(grep -c "error TS" "$METRICS_DIR/errors-by-file.txt" || echo "0")
TOTAL_FILES=$(wc -l < "$METRICS_DIR/errors-by-file.txt")

echo ""
echo "Baseline Metrics:"
echo "  Total errors: $TOTAL_ERRORS"
echo "  Files with errors: $TOTAL_FILES"
echo "  Average errors per file: $((TOTAL_ERRORS / TOTAL_FILES))"
```

### Phase 3: Full Coordinator Test (30-60 minutes)

**Launch test with full monitoring:**
```bash
cd /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a

# Set test parameters
export MAX_ITERATIONS=10
export MEMORY_BUDGET=40g

# Start background monitoring
./scripts/docker-utils/monitor-memory.sh "$METRICS_DIR" &
MONITOR_PID=$!

# Run test with detailed logging
bash tests/docker/intelligent-coordinator-test.sh 2>&1 | tee "$METRICS_DIR/test-output.log"

# Stop monitoring
kill $MONITOR_PID 2>/dev/null || true
```

**Real-time monitoring (separate terminal):**
```bash
# Monitor coordinator logs
docker logs -f cfn-coordinator

# Monitor agent count
watch -n 5 'docker ps --filter "name=wave" --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"'

# Monitor Redis state
watch -n 5 'docker exec cfn-redis redis-cli INFO stats | grep -E "total_commands|keyspace"'

# Monitor system resources
watch -n 5 'docker stats --no-stream'
```

### Phase 4: Iteration Metrics Collection (During Test)

**Automated metrics collection script:**
```bash
#!/bin/bash
# File: scripts/collect-iteration-metrics.sh

METRICS_DIR=$1
ITERATION=0

while true; do
    ITERATION=$((ITERATION + 1))

    # Wait for iteration marker in logs
    sleep 60

    # Check if test still running
    if ! docker ps --filter "name=cfn-coordinator" -q | grep -q .; then
        echo "Coordinator stopped, ending metrics collection"
        break
    fi

    echo "Collecting metrics for iteration $ITERATION..."

    # Agent count
    AGENT_COUNT=$(docker ps --filter "name=wave" -q | wc -l)
    echo "$ITERATION,$AGENT_COUNT" >> "$METRICS_DIR/agents-per-iteration.csv"

    # Memory usage
    docker stats --no-stream --format "{{.Name}},{{.MemUsage}}" | \
        grep "wave\|coordinator" >> "$METRICS_DIR/memory-usage-iter-${ITERATION}.csv"

    # Redis stats
    docker exec cfn-redis redis-cli GET task:completed > "$METRICS_DIR/completed-iter-${ITERATION}.txt"
    docker exec cfn-redis redis-cli GET task:total > "$METRICS_DIR/total-iter-${ITERATION}.txt"

    # Error count (if possible to access)
    # Note: This requires accessing the frontend workspace
done
```

### Phase 5: Post-Test Analysis (15 minutes)

**Collect final metrics:**
```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend

# Final error count
FINAL_ERRORS=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS" | tr -d ' \n\r')

# Error breakdown by file
npx tsc --noEmit --project tsconfig.json 2>&1 | \
  grep "error TS" | \
  awk -F'[:(]' '{print $1}' | \
  sort | uniq -c | sort -rn > "$METRICS_DIR/errors-by-file-final.txt"

# Calculate reduction
INITIAL_ERRORS=$(cat "$METRICS_DIR/baseline-error-count.txt")
ERRORS_FIXED=$((INITIAL_ERRORS - FINAL_ERRORS))
REDUCTION_PCT=$((ERRORS_FIXED * 100 / INITIAL_ERRORS))

echo ""
echo "=== TEST RESULTS ==="
echo "Initial errors:  $INITIAL_ERRORS"
echo "Final errors:    $FINAL_ERRORS"
echo "Errors fixed:    $ERRORS_FIXED"
echo "Reduction:       ${REDUCTION_PCT}%"
```

**Analyze test logs:**
```bash
# Extract key events
grep "ITERATION" "$METRICS_DIR/test-output.log" | tee "$METRICS_DIR/iterations-summary.txt"

# Count agent spawns
grep "Spawning.*agents" "$METRICS_DIR/test-output.log" | tee "$METRICS_DIR/agent-spawns.txt"

# Check for timeout events
grep -i "timeout\|stuck" "$METRICS_DIR/test-output.log" | tee "$METRICS_DIR/timeout-events.txt"

# Extract timing
grep -E "Total time:|Duration:" "$METRICS_DIR/test-output.log" | tee "$METRICS_DIR/timing.txt"
```

**Generate summary report:**
```bash
# Create comprehensive report
cat > "$METRICS_DIR/TEST_SUMMARY.md" << 'EOF'
# Docker Coordinator Integration Test Summary

## Test Configuration
- Test ID: ${TEST_ID}
- Date: $(date)
- Frontend Path: /mnt/c/Users/masha/Documents/ourstories-v2/frontend
- Memory Budget: 40GB
- Max Iterations: 10

## Results
- Initial Errors: ${INITIAL_ERRORS}
- Final Errors: ${FINAL_ERRORS}
- Errors Fixed: ${ERRORS_FIXED} (${REDUCTION_PCT}%)
- Total Duration: $(cat "$METRICS_DIR/timing.txt")
- Iterations Completed: $(grep -c "ITERATION" "$METRICS_DIR/iterations-summary.txt")

## Performance Metrics
- Average agents per iteration: $(awk -F',' '{sum+=$2; count++} END {print sum/count}' "$METRICS_DIR/agents-per-iteration.csv")
- Peak memory usage: $(sort -t',' -k2 -rn "$METRICS_DIR/memory-usage-*.csv" | head -1)
- Timeout events: $(wc -l < "$METRICS_DIR/timeout-events.txt")

## Files Modified
$(diff -u "$METRICS_DIR/errors-by-file.txt" "$METRICS_DIR/errors-by-file-final.txt" | grep "^-" | head -20)

## Next Steps
[Add recommendations based on results]
EOF

cat "$METRICS_DIR/TEST_SUMMARY.md"
```

---

## Success Criteria

### Must Have (P0)
- [ ] Coordinator completes without crashes
- [ ] Error count reduces by ≥50%
- [ ] Memory usage stays under 40GB budget
- [ ] All agents timeout correctly (no indefinite hangs)
- [ ] All containers cleaned up after test

### Should Have (P1)
- [ ] Error count reduces by ≥80%
- [ ] Completes in ≤10 iterations
- [ ] Average iteration time ≤10 minutes
- [ ] No agent failures or restarts needed
- [ ] Tier distribution matches expectations

### Nice to Have (P2)
- [ ] Error count reduces to 0
- [ ] Completes in ≤5 iterations
- [ ] Average iteration time ≤5 minutes
- [ ] Perfect agent completion rate (100%)
- [ ] Memory usage ≤30GB (headroom remaining)

---

## Risk Mitigation

### Risk 1: Agent Image Missing or Broken

**Likelihood:** High (discovered in earlier tests)
**Impact:** Critical (blocks all agent execution)

**Mitigation:**
```bash
# Before test, verify agent image functionality
docker run --rm claude-flow-novice-agent:frontend which tsc
docker run --rm claude-flow-novice-agent:frontend node --version

# If missing, build minimal test agent
cat > Dockerfile.test-agent << 'EOF'
FROM node:18-alpine
RUN npm install -g typescript@5.9.3
RUN apk add --no-cache bash redis
WORKDIR /workspace
CMD ["sleep", "infinity"]
EOF

docker build -f Dockerfile.test-agent -t claude-flow-novice-agent:frontend .
```

### Risk 2: System Resources Exhausted

**Likelihood:** Medium (40GB budget, many agents)
**Impact:** High (OOM kills, test failure)

**Mitigation:**
- Monitor memory continuously
- Set swap to 20GB minimum
- Reduce MEMORY_BUDGET to 30GB if needed
- Enable agent timeout monitoring (already deployed)

### Risk 3: Test Takes Too Long (>2 hours)

**Likelihood:** Medium (1000 errors, unknown iteration count)
**Impact:** Medium (session timeout, resource costs)

**Mitigation:**
- Set MAX_ITERATIONS=5 initially
- Monitor progress, extend if needed
- Use background execution with progress checks
- Can pause/resume via Redis persistence

### Risk 4: Frontend Rollback Breaks Dependencies

**Likelihood:** Low (using git, reversible)
**Impact:** Medium (test blocked until fixed)

**Mitigation:**
- Created backup branch before rollback
- Can restore with `git checkout backup-before-rollback-test`
- Test `npm install` works after rollback
- Document any manual dependency fixes needed

---

## Rollback Recovery Plan

**If test needs to be aborted or reverted:**

```bash
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend

# Stop all containers
docker stop cfn-coordinator 2>/dev/null
docker rm -f $(docker ps -a --filter "name=agent" -q) 2>/dev/null
docker rm -f $(docker ps -a --filter "name=wave" -q) 2>/dev/null
docker rm -f cfn-redis 2>/dev/null

# Restore frontend to original state
git checkout backup-before-rollback-test

# Or restore to main branch
git checkout main

# Restore tsconfig if modified
cp tsconfig.json.backup tsconfig.json 2>/dev/null || true

# Clean up test branch
git branch -D backup-before-rollback-test 2>/dev/null || true

echo "✅ Frontend restored to original state"
```

---

## Post-Test Checklist

- [ ] Test metrics collected and saved
- [ ] Summary report generated
- [ ] Frontend restored to original state (or committed fixes if successful)
- [ ] All Docker containers stopped and removed
- [ ] Test results documented in success report
- [ ] Lessons learned added to documentation
- [ ] Performance bottlenecks identified
- [ ] Next iteration improvements planned

---

## Expected Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-Test Prep | 15 min | Backup, rollback, verify |
| Baseline Metrics | 10 min | Count errors, analyze breakdown |
| Coordinator Test | 30-60 min | Full test execution (depends on iterations) |
| Metrics Collection | 15 min | Automated during test |
| Post-Test Analysis | 15 min | Generate reports, calculate metrics |
| **Total** | **1.5-2 hours** | **Full integration test** |

---

## Monitoring Checklist

**During test, monitor:**
- [ ] Coordinator logs (docker logs -f cfn-coordinator)
- [ ] Agent count (watch docker ps --filter "name=wave")
- [ ] Memory usage (watch docker stats)
- [ ] Redis state (task:completed / task:total)
- [ ] System resources (free -m, df -h)
- [ ] Test log output (/tmp/docker-test-metrics/${TEST_ID}/test-output.log)

---

## Ready to Execute

When ready to start the full integration test:

```bash
# 1. Review this plan
cat docs/DOCKER_INTEGRATION_TEST_PLAN.md

# 2. Execute pre-test preparation
bash scripts/find-error-commit.sh

# 3. Verify environment
bash scripts/verify-test-environment.sh

# 4. Launch full test
bash scripts/run-integration-test.sh

# 5. Monitor progress in separate terminal
bash scripts/monitor-test-progress.sh
```

---

**Status:** Ready for execution
**Prerequisites:** All coordinator fixes validated ✅
**Estimated Success Rate:** 90% (based on unit test results)
**Recommended:** Start with pilot test on 100-200 errors first

---

**Document Version:** 1.0
**Last Updated:** 2025-11-13
**Author:** Claude Code Integration Test Team
