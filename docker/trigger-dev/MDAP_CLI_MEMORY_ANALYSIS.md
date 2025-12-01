# MDAP CLI Processes - Memory Leak Risk Analysis

## Executive Summary

**Risk Level**: ⚠️ **MEDIUM** - Sequential execution prevents cascading leaks, but individual Claude CLI processes can consume significant memory

**Key Findings**:
- Non-MDAP mode executes sprints **SEQUENTIALLY** (not in parallel), limiting blast radius
- Each Claude CLI process has 5-minute timeout with proper cleanup via `execa`
- No explicit memory limits on child processes
- Maximum concurrent CLI processes: **1** (sequential execution)
- WSL2 system impact: Contained but could affect long-running tasks

---

## Architecture Analysis

### Non-MDAP Mode Execution Flow

```
Coordinator
  ↓
Sprint Aggregation (21 tasks → 4 sprints)
  ↓
FOR EACH sprint (SEQUENTIAL):
  ├─ Spawn cfn-cli-sprint-implementer
  ├─ cfn-cli-sprint-implementer spawns: execa('claude', args)
  ├─ Wait for completion (timeout: 5 minutes)
  ├─ Process terminates
  └─ Next sprint
```

### Critical Code Paths

#### 1. Sprint Execution (Sequential)
**File**: `docker/trigger-dev/src/trigger/cfn-coordinator.ts:528`

```typescript
// Execute sprints sequentially (each sprint runs ~60-180s via Claude CLI)
for (let i = 0; i < aggregation.sprints.length; i++) {
  const sprint = aggregation.sprints[i];
  
  // Trigger CLI sprint implementer
  const sprintHandle = await tasks.trigger("cfn-cli-sprint-implementer", {
    taskId: payload.taskId,
    sprintId: sprint.id,
    sprint,
    workDir: payload.workDir,
    timeout: 300000, // 5 minutes per sprint
  });

  // Poll for sprint completion
  const sprintResult = await pollWithTimeout<CLISprintImplementerResult>(
    sprintHandle.id,
    300000, // 5 minute timeout
    `CLI Sprint ${sprint.id}`
  );
}
```

**Analysis**:
- ✅ Sequential execution = only 1 CLI process active at a time
- ✅ Each sprint completes before next starts
- ❌ No mechanism to clean up hung child processes if timeout fails

#### 2. Claude CLI Spawning
**File**: `docker/trigger-dev/src/trigger/cfn-cli-sprint-implementer.ts:361`

```typescript
const result = await execa('claude', args, {
  cwd: payload.workDir,
  timeout, // 300000ms = 5 minutes
  reject: false,
  all: true,
  stdin: 'ignore', // ✅ Prevents stdin blocking
  env: { ...process.env },
});
```

**Analysis**:
- ✅ `timeout` parameter enforces 5-minute limit
- ✅ `stdin: 'ignore'` prevents TTY blocking (Bug fix #1)
- ✅ `--print` flag prevents interactive mode (Bug fix #2)
- ✅ `execa` properly handles process cleanup on timeout
- ❌ No explicit `maxBuffer` limit (defaults to 100MB in Node.js)
- ❌ No memory limit on child process

---

## Memory Leak Vectors

### 1. ✅ **MITIGATED**: Parallel Process Explosion
**Risk**: Multiple CLI processes running concurrently could exhaust memory
**Mitigation**: Sequential execution guarantees max 1 concurrent CLI process

### 2. ⚠️ **MEDIUM RISK**: Large Output Buffer
**Risk**: Claude CLI output exceeding Node.js `maxBuffer` (default 100MB)
**Current State**: No explicit `maxBuffer` limit set
**Impact**: Process could hang or crash if CLI generates >100MB output
**Likelihood**: Low for typical tasks, higher for large codebases

**Recommendation**:
```typescript
const result = await execa('claude', args, {
  cwd: payload.workDir,
  timeout,
  maxBuffer: 50 * 1024 * 1024, // 50MB limit
  stdin: 'ignore',
  // ... rest
});
```

### 3. ⚠️ **MEDIUM RISK**: Claude CLI Internal Memory Leak
**Risk**: Claude CLI process accumulates memory during long execution
**Current State**: 5-minute timeout limits exposure
**Impact**: Individual sprint could consume excessive memory before timeout
**Likelihood**: Medium for complex multi-task sprints

**Observed Behavior** (from E2E test):
- 18 tasks in ~198s = ~11s per task average
- No reported memory issues in test runs
- Timeout provides upper bound on leak accumulation

### 4. ⚠️ **LOW RISK**: Zombie Processes
**Risk**: Claude CLI process not properly killed on timeout
**Current State**: `execa` uses `child_process.spawn` with proper cleanup
**Impact**: Hung process continues consuming memory
**Likelihood**: Low - `execa` is battle-tested

**Evidence**: No zombie processes reported in E2E tests

### 5. ❌ **HIGH RISK (IF PARALLEL)**: Coordinator Retry Loop
**Risk**: Failed sprints retry indefinitely, spawning more CLI processes
**Current State**: Sequential execution + Trigger.dev retry limits
**Impact**: Could spawn multiple CLI processes if coordinator retries
**Likelihood**: Low - coordinator has `retry: { maxAttempts: 1 }`

---

## WSL2 System Impact Analysis

### Resource Consumption Per Sprint

**Typical Sprint** (E2E Test 4 data):
- Duration: ~11s average per task
- Sprint size: 1-10 tasks (avg ~4.5 tasks)
- Estimated memory: 500MB - 2GB per Claude CLI process
- Total sprints: ~4 for 18-task workload

**Worst Case Scenario**:
- 10 sprints × 5 minutes = 50 minutes total
- 1 CLI process active at a time
- Peak memory: ~2GB per sprint
- No parallel accumulation

### WSL2 Memory Limits

**Default WSL2 Config**:
- Memory limit: 50% of host RAM (e.g., 16GB on 32GB system)
- No cgroup limits on individual processes
- OOM killer activates at ~90% memory pressure

**Risk Assessment**:
- Single CLI process at 2GB: **LOW RISK** (4-12% of WSL2 memory)
- Sequential execution: **MITIGATES** cascading leaks
- Timeout enforcement: **BOUNDS** memory exposure

**Could it take down WSL2?**
- ❌ **Unlikely with current sequential design**
- ✅ 5-minute timeout prevents unbounded growth
- ⚠️ Individual sprint could spike to 2-4GB, but OOM would kill just that process
- ⚠️ Long-running coordinator (50+ minute workload) could accumulate memory in Node.js process itself

---

## Recommendations

### Immediate (Priority 1)

1. **Add `maxBuffer` limit to `execa` calls**:
   ```typescript
   maxBuffer: 50 * 1024 * 1024, // 50MB
   ```
   **Rationale**: Prevents hung process on large output

2. **Add memory monitoring to coordinator**:
   ```typescript
   const memUsage = process.memoryUsage();
   console.log(`[memory] RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`);
   ```
   **Rationale**: Early warning for coordinator memory leaks

3. **Add process cleanup verification**:
   ```typescript
   // After execa completes
   if (result.failed && result.timedOut) {
     console.warn(`[cli-sprint] Process timeout - verify cleanup`);
     // Optional: explicit kill signal
   }
   ```

### Short-Term (Priority 2)

4. **Implement circuit breaker for failed sprints**:
   ```typescript
   const MAX_SPRINT_FAILURES = 3;
   let consecutiveFailures = 0;
   
   if (!sprintResult.success) {
     consecutiveFailures++;
     if (consecutiveFailures >= MAX_SPRINT_FAILURES) {
       throw new Error('Circuit breaker: Too many sprint failures');
     }
   } else {
     consecutiveFailures = 0;
   }
   ```

5. **Add WSL2 memory pressure detection**:
   ```bash
   # Before spawning CLI process
   FREE_MEM=$(free -m | awk 'NR==2{print $4}')
   if [ "$FREE_MEM" -lt 2048 ]; then
     echo "⚠️  Low memory: ${FREE_MEM}MB available"
   fi
   ```

### Long-Term (Priority 3)

6. **Consider containerizing CLI processes** (if memory issues arise):
   ```typescript
   // Run each sprint in isolated Docker container with memory limit
   docker run --rm --memory=2g --cpus=2 \
     -v workdir:/workspace \
     claude-cli-runner:latest \
     claude -p "$PROMPT" --print
   ```

7. **Implement sprint result caching** (avoid re-running on retry):
   ```typescript
   // Store successful sprint outputs in Redis
   // Reuse on coordinator retry instead of re-executing
   ```

---

## Monitoring Recommendations

### Metrics to Track

1. **Sprint-level**:
   - Peak memory per sprint (`process.memoryUsage()` before/after)
   - CLI process exit codes
   - Timeout frequency

2. **Coordinator-level**:
   - Total memory growth over full execution
   - Number of sprints executed
   - Retry count

3. **System-level** (WSL2):
   - `free -m` before/after coordinator run
   - OOM kill events (`dmesg | grep oom`)
   - Process count (`ps aux | wc -l`)

### Alerting Thresholds

- ⚠️  **Warning**: Sprint memory >1.5GB
- 🚨 **Critical**: Coordinator RSS >8GB
- 🚨 **Critical**: WSL2 free memory <2GB
- 🚨 **Critical**: 3+ consecutive sprint timeouts

---

## Comparison: MDAP vs Non-MDAP Memory Profile

| Metric | MDAP Mode | Non-MDAP Mode |
|--------|-----------|---------------|
| **Parallel Tasks** | All micro-tasks (18-21) | 1 sprint at a time |
| **Process Count** | 18-21 Cerebras API calls | 1 Claude CLI process |
| **Memory per Task** | ~50-100MB (API client) | ~500MB-2GB (full CLI) |
| **Peak Memory** | ~2-4GB total | ~2GB per sprint |
| **Timeout** | 30s per task | 5min per sprint |
| **Leak Risk** | Low (stateless API) | Medium (stateful CLI) |
| **System Impact** | Distributed, bounded | Sequential, bounded |

**Conclusion**: Non-MDAP has **HIGHER per-process memory** but **LOWER concurrent risk** due to sequential execution.

---

## Test Evidence

### E2E Test 4 Results (Non-MDAP Mode)
```
Duration: 198370ms (~3.3 minutes)
Tasks: 18/18 completed
Sprints: ~4 (estimated from aggregation)
Success Rate: 100%
Memory Issues: None reported
Timeouts: None
```

**Analysis**:
- ✅ No memory-related failures
- ✅ All sprints completed within timeout
- ✅ No zombie processes detected
- ⚠️ No explicit memory metrics collected

---

## Conclusion

**Can MDAP CLI processes take down WSL2?**

**Short Answer**: **Unlikely with current sequential design**, but individual sprints can spike to 2-4GB.

**Detailed Answer**:
1. **Sequential execution** (1 sprint at a time) prevents cascading memory leaks
2. **5-minute timeout** bounds exposure to any single sprint leak
3. **Individual sprint** could consume 2-4GB, but this is <25% of typical WSL2 memory
4. **Coordinator itself** could accumulate memory over 50+ minute runs (needs monitoring)
5. **OOM killer** would terminate individual CLI process, not entire WSL2 system

**Risk Mitigation**:
- Add `maxBuffer` limit (Priority 1)
- Add memory monitoring (Priority 1)
- Implement circuit breaker for sprint failures (Priority 2)
- Consider containerization if issues arise (Priority 3)

**Recommended Action**: Implement Priority 1 and 2 recommendations before production use at scale.

---

## References

- `docker/trigger-dev/src/trigger/cfn-coordinator.ts:521-599` (Non-MDAP execution)
- `docker/trigger-dev/src/trigger/cfn-cli-sprint-implementer.ts:361-371` (CLI spawning)
- `docker/trigger-dev/src/lib/sprint-aggregator.ts:28` (Sprint size limit)
- E2E Test 4: `docker/trigger-dev/E2E_TEST_ANALYSIS_2025-12-01_FINAL.md`

---

**Document Version**: 1.0.0  
**Date**: 2025-12-01  
**Author**: CFN Loop Team
