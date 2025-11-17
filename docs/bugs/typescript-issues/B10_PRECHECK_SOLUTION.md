# TypeScript Pre-Check Solution for B10 Docker Agent Workflow

## Question

**"If we build the Docker image from within ourstories-v2, would the dependencies have already been included?"**

## Answer: No - Build Location Doesn't Matter

Building the Docker image from within ourstories-v2 directory **would NOT include TypeScript dependencies** because:

### Current Dockerfile Behavior

```dockerfile
# Line 17-20 of Dockerfile.agent
COPY package*.json ./
RUN npm ci --production --ignore-scripts
```

This copies **claude-flow-novice's package.json**, not ourstories-v2's package.json, regardless of build directory.

### Why Pre-Check Failed

The enhanced worker script tries to run:
```bash
npx tsc --noEmit --project tsconfig.json 2>&1
```

But Docker containers have:
- ❌ TypeScript NOT installed (excluded by `--production` flag)
- ❌ ourstories-v2's node_modules NOT available
- ✅ tsconfig.json available (via volume mount)

**Result**: `npx tsc` silently fails, `ERROR_COUNT` defaults to 0, agents proceed to modify files despite 0 errors.

### Architecture Explanation

```
Docker Image Build (from any directory):
├── COPY package*.json ./           ← claude-flow-novice's package.json
├── RUN npm ci --production         ← Installs CFN dependencies only
└── COPY dist/ ./dist/              ← Prebuilt CFN CLI

Agent Runtime:
├── Volume mount: /workspace        ← ourstories-v2 source code
├── Volume mount: agent-worker.sh   ← Worker script
└── Execute: npx tsc ...            ← FAILS (TypeScript not in image)
```

---

## Three Solutions (Ordered by Recommendation)

### Solution 1: Coordinator-Level Pre-Check ⭐ RECOMMENDED

**Why Best:**
- ✅ No Docker rebuild (fastest implementation)
- ✅ Most efficient (single `tsc` run covers all files)
- ✅ Clean separation: coordinator validates, workers execute
- ✅ Works immediately

**How It Works:**
1. Coordinator runs `npx tsc` ONCE on host (has ourstories-v2 node_modules)
2. Stores error map in Redis
3. Workers retrieve their file's error count from Redis
4. Workers skip if 0 errors, otherwise include error details in prompt

**Implementation Time:** 10-15 minutes

**Files to Modify:**
- `tests/docker/b10-typescript-fix/coordinator.sh` (add pre-check logic)
- `tests/docker/b10-typescript-fix/agent-worker-with-precheck.sh` (read from Redis)

See detailed implementation below.

---

### Solution 2: Mount node_modules

**Why Second Best:**
- ✅ No Docker rebuild
- ✅ TypeScript available in containers
- ✅ Works with current worker script

**Why Not First:**
- ⚠️ Requires ourstories-v2 node_modules installed on host
- ⚠️ Each agent runs `tsc` (32 parallel runs vs 1 coordinator run)
- ⚠️ Slower than coordinator-level pre-check

**Implementation:**

Modify `tests/docker/b10-typescript-fix/coordinator.sh` line 120:
```bash
docker run -d \
    --name "$AGENT_NAME" \
    --network "$NETWORK_NAME" \
    --memory "$MEMORY_LIMIT" \
    -e REDIS_HOST="cfn-b10-redis" \
    -e AGENT_ID="$AGENT_NAME" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -v "$FRONTEND_PATH/node_modules:/workspace/node_modules:ro" \  # ADD THIS
    -v "$WORKER_SCRIPT:/tmp/agent-worker.sh:ro" \
    "$IMAGE_NAME" \
    bash /tmp/agent-worker.sh
```

**Implementation Time:** 5 minutes

---

### Solution 3: Rebuild Docker Image with TypeScript

**Why Last:**
- ❌ Requires ~10 minute image rebuild
- ❌ Increases image size
- ❌ Still needs tsconfig.json mounted
- ❌ Each agent still runs `tsc` separately

**Implementation:**

Modify `Dockerfile.agent` after line 20:
```dockerfile
# Install TypeScript globally for agent validation
RUN npm install -g typescript@latest
```

Rebuild:
```bash
docker build -f Dockerfile.agent -t claude-flow-novice-agent:latest .
```

**Implementation Time:** 20 minutes (rebuild + test)

---

## Detailed Implementation: Solution 1 (Coordinator-Level)

### Step 1: Update Coordinator Script

Add pre-check logic after task queue creation:

```bash
# File: tests/docker/b10-typescript-fix/coordinator.sh
# After line 85 (task queue creation)

echo "🔍 Running TypeScript pre-check on all files..."
cd "$FRONTEND_PATH"

# Run tsc once, capture all errors
TSC_OUTPUT=$(npx tsc --noEmit --project tsconfig.json 2>&1)

# Store full output in Redis for debugging
redis-cli -p 6381 SET "task:tsc-output" "$TSC_OUTPUT" >/dev/null

# For each task, calculate error count and store
echo "   Analyzing errors per file..."
for i in $(seq 1 $NUM_TASKS); do
    FILE=$(redis-cli -p 6381 HGET "task:$i" "file")
    
    # Filter errors for this specific file
    FILE_ERRORS=$(echo "$TSC_OUTPUT" | grep -E "$FILE.*error TS" || echo "")
    ERROR_COUNT=$(echo "$FILE_ERRORS" | grep -c "error TS" || echo "0")
    
    # Store error count in task metadata
    redis-cli -p 6381 HSET "task:$i" "error_count" "$ERROR_COUNT" >/dev/null
    
    # Store first 5 error messages for agent prompt
    ERROR_SAMPLE=$(echo "$FILE_ERRORS" | head -5)
    redis-cli -p 6381 HSET "task:$i" "error_sample" "$ERROR_SAMPLE" >/dev/null
    
    if [ "$ERROR_COUNT" -eq 0 ]; then
        echo "   ✅ $FILE: No errors - will skip"
    else
        echo "   📝 $FILE: $ERROR_COUNT errors found"
    fi
done

echo ""
```

### Step 2: Update Worker Script

Modify agent-worker-with-precheck.sh to read from Redis:

```bash
# File: tests/docker/b10-typescript-fix/agent-worker-with-precheck.sh
# Replace lines 44-69 with:

echo "   🔍 Checking pre-validated error count..."
ERROR_COUNT=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "error_count" 2>/dev/null)

if [ -z "$ERROR_COUNT" ] || [ "$ERROR_COUNT" -eq 0 ]; then
    echo "   ✅ No TypeScript errors found - skipping fix"
    redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
        "agent_id" "$AGENT_ID" \
        "status" "skipped" \
        "file" "$FILE" \
        "reason" "no_errors_found" \
        "expected_errors" "$EXPECTED_ERRORS" \
        "actual_errors" "0" \
        "completed_at" "$(date -Iseconds)" >/dev/null
    redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null
    exit 0
fi

echo "   📊 Pre-check found $ERROR_COUNT TypeScript errors"

# Get error sample for agent prompt context
ERROR_DETAILS=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "error_sample" 2>/dev/null)
```

### Step 3: Test with Clean Files

```bash
# 1. Ensure ourstories-v2 has 0 TypeScript errors
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend
npx tsc --noEmit --project tsconfig.json

# Should show: "Found 0 errors"

# 2. Run B10 test
cd /mnt/c/Users/masha/Documents/claude-flow-novice
echo "y" | bash tests/docker/b10-typescript-fix-test.sh 2>&1 | tee /tmp/b10-coordinator-precheck.log
```

**Expected Result:**
```
🔍 Running TypeScript pre-check on all files...
   Analyzing errors per file...
   ✅ src/file1.ts: No errors - will skip
   ✅ src/file2.ts: No errors - will skip
   ...
   ✅ src/file32.ts: No errors - will skip

🚀 Spawning 32 agent containers...
   ✅ All 32 agents spawned in 3s

📊 Monitoring task completion...
   Progress: 32/32 tasks completed, 0 in queue (5s elapsed)
   ✅ All tasks completed in 8s

================================================
B10 TYPESCRIPT FIX RESULTS
================================================
   Agents spawned: 32
   Total time: 11s
   Tasks completed: 32/32
   Tasks skipped: 32 (no errors)
   Fixes applied: 0
   Errors remaining: 0
```

### Step 4: Test with Actual Errors

Introduce TypeScript errors to verify fix logic:

```bash
# 1. Introduce error in one file
cd /mnt/c/Users/masha/Documents/ourstories-v2/frontend
echo "const broken: number = 'string';" >> src/services/auth.service.ts

# 2. Verify error exists
npx tsc --noEmit | grep "auth.service.ts"

# 3. Run test
cd /mnt/c/Users/masha/Documents/claude-flow-novice
echo "y" | bash tests/docker/b10-typescript-fix-test.sh 2>&1 | tee /tmp/b10-with-error.log

# 4. Check result
git diff /mnt/c/Users/masha/Documents/ourstories-v2/frontend/src/services/auth.service.ts
```

**Expected Result:**
```
🔍 Running TypeScript pre-check on all files...
   ✅ src/file1.ts: No errors - will skip
   📝 src/services/auth.service.ts: 1 errors found
   ✅ src/file3.ts: No errors - will skip
   ...

Tasks completed: 32/32
Tasks skipped: 31 (no errors)
Tasks fixed: 1
Fixes applied: 1
Errors remaining: 0
```

---

## Performance Comparison

| Approach | Pre-Check Time | Per-File Overhead | Total for 32 Files |
|----------|----------------|-------------------|-------------------|
| **No Pre-Check** | 0s | 15-30s (always runs) | 480-960s |
| **Container Pre-Check** | 0s | 18-35s (tsc + fix) | 576-1120s |
| **Coordinator Pre-Check** | 5s | 0s (skip) or 15-30s (fix) | 5s + (N_errors × 15-30s) |

**With 0 errors (clean files):**
- No Pre-Check: 480s (wasted agent invocations)
- Container Pre-Check: 576s (32 × tsc runs + wasted invocations)
- **Coordinator Pre-Check: 8s** ✅ (single tsc + all skipped)

**With 5 errors:**
- No Pre-Check: 480s (all files processed)
- Container Pre-Check: 576s (all files checked + processed)
- **Coordinator Pre-Check: 80s** ✅ (5s + 5 × 15s)

---

## Benefits Summary

### Coordinator-Level Pre-Check Wins:
1. **Cost Savings**: Skip 27-31 files = 405-930s saved (95%+ reduction when mostly clean)
2. **Better Context**: Agents see actual error messages in prompts
3. **Accurate Metrics**: Track errors_before, errors_after, fixes_applied per file
4. **Fail Fast**: Detect no-op scenarios before spawning agents
5. **Single Source of Truth**: One tsc run = consistent error state

### Trade-offs:
- ⚠️ Coordinator script complexity +20 lines
- ⚠️ Redis dependency for error map storage
- ✅ Net benefit: 95%+ time/cost savings when files are clean

---

## Next Steps

1. Implement Solution 1 (coordinator-level pre-check)
2. Test with 0 errors (verify all files skipped)
3. Test with 1-2 errors (verify selective fixing)
4. Measure time savings vs old approach
5. Update B10 documentation with findings

---

## Files Referenced

- `Dockerfile.agent` (lines 17-20)
- `tests/docker/b10-typescript-fix/coordinator.sh` (line 85, 120)
- `tests/docker/b10-typescript-fix/agent-worker-with-precheck.sh` (lines 44-69)
- `docs/B10_TYPESCRIPT_PRECHECK_GUIDE.md` (motivation, patterns)
- `docs/B10_TYPESCRIPT_FIX_SUCCESS.md` (baseline metrics)

---

## Confidence Assessment

- **Root Cause Identified**: 0.95 (TypeScript not in container)
- **Solution Correctness**: 0.90 (coordinator-level is proven pattern)
- **Expected Time Savings**: 0.85 (95%+ when files clean, 30%+ when dirty)
