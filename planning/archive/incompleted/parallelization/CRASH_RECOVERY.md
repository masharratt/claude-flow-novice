# Crash Recovery & State Persistence System

## Problem Statement

**Current Behavior**: When VS Code crashes during parallel CFN Loop execution:
- ✅ Sprint 1 (completed) → Files saved
- ⚠️ Sprint 2 (80% done) → **ALL PROGRESS LOST**
- ⚠️ Sprint 3 (50% done) → **ALL PROGRESS LOST**
- ❌ Sprints 4-5 (starting/waiting) → **ALL PROGRESS LOST**

**User Impact**:
- Must restart entire epic from scratch
- Loses 30+ minutes of agent work
- No visibility into what was completed
- No way to resume from checkpoint

---

## Solution: Redis State Persistence

### Key Insight

**Redis runs as a separate process** from VS Code. When VS Code crashes:
- ✅ Redis keeps running with all state
- ✅ Epic progress preserved
- ✅ Sprint checkpoints intact
- ✅ Agent state saved

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                VS Code Process                       │
│  ┌──────────────┐  ┌──────────────┐                │
│  │   Claude     │  │    Epic      │                │
│  │   Code CLI   │  │  Execution   │                │
│  └──────┬───────┘  └──────┬───────┘                │
│         │                  │                         │
│         │  Every 30s       │                         │
│         ▼                  ▼                         │
│  ┌─────────────────────────────────┐                │
│  │  State Checkpoint Manager       │                │
│  └─────────────┬───────────────────┘                │
└────────────────┼─────────────────────────────────────┘
                 │
                 │ Writes to Redis
                 ▼
    ┌────────────────────────────────┐
    │      Redis (Separate Process)  │
    │                                 │
    │  epic:123:state                │
    │  sprint:auth:state             │
    │  sprint:auth:files             │
    │  agent:coder-1:state           │
    │  agent:coder-1:checkpoint      │
    └────────────────────────────────┘
         │
         │ Survives VS Code crash
         │
    ┌────▼───────────────────────────┐
    │  VS Code Restarts              │
    │  ┌──────────────┐              │
    │  │  Crash       │              │
    │  │  Detector    │              │
    │  └──────┬───────┘              │
    │         │                       │
    │         │ Reads Redis           │
    │         ▼                       │
    │  ┌──────────────┐              │
    │  │  Recovery    │              │
    │  │  Engine      │              │
    │  └──────────────┘              │
    └────────────────────────────────┘
```

---

## State Checkpoint Structure

### Epic Level State

```typescript
// Redis key: epic:e-commerce-123:state
{
  epicId: "e-commerce-123",
  name: "E-commerce Platform",
  status: "in_progress",
  startTime: "2025-10-10T20:15:00Z",
  lastCheckpoint: "2025-10-10T20:45:30Z",
  totalSprints: 5,
  completedSprints: 1,
  inProgressSprints: 3,
  waitingSprints: 1,
  sprints: [
    { id: "sprint-1", status: "completed", progress: 100 },
    { id: "sprint-2", status: "in_progress", progress: 80 },
    { id: "sprint-3", status: "in_progress", progress: 50 },
    { id: "sprint-4", status: "starting", progress: 5 },
    { id: "sprint-5", status: "waiting", progress: 0 }
  ],
  dependencies: {
    "sprint-5": ["sprint-1"]  // Sprint 5 depends on Sprint 1
  }
}
```

### Sprint Level State

```typescript
// Redis key: sprint:auth-system:state
{
  sprintId: "auth-system",
  epicId: "e-commerce-123",
  status: "in_progress",
  phase: "Loop 3 - Implementation",
  progress: 80,
  startTime: "2025-10-10T20:20:00Z",
  lastCheckpoint: "2025-10-10T20:45:30Z",

  agents: [
    { id: "coder-1", status: "active", task: "Implement JWT validation" },
    { id: "coder-2", status: "active", task: "Write auth middleware" },
    { id: "tester-1", status: "idle", task: null }
  ],

  filesWritten: [
    { path: "src/auth.ts", completed: true, confidence: 0.88 },
    { path: "src/auth.test.ts", completed: true, confidence: 0.92 }
  ],

  filesInProgress: [
    {
      path: "src/auth-middleware.ts",
      completed: false,
      lastCompletedSection: "validateToken",
      nextSection: "refreshToken",
      currentLine: 127,
      confidence: 0.82
    }
  ],

  confidence: {
    loop3: 0.82,  // Current confidence
    loop2: null   // Not started yet
  }
}
```

### Agent Level State

```typescript
// Redis key: agent:coder-1:state
{
  agentId: "coder-1",
  sprintId: "auth-system",
  epicId: "e-commerce-123",

  currentTask: "Implement JWT token validation",
  fileBeingEdited: "src/auth-middleware.ts",
  lineNumber: 127,

  taskProgress: {
    started: "2025-10-10T20:40:00Z",
    estimatedCompletion: "2025-10-10T20:50:00Z",
    subtasksCompleted: ["function signature", "input validation"],
    subtasksRemaining: ["logic implementation", "error handling"]
  },

  context: {
    dependencies: ["jsonwebtoken", "bcrypt"],
    relatedFiles: ["src/auth.ts", "src/types/auth.ts"],
    testFile: "src/auth-middleware.test.ts"
  },

  confidenceScore: 0.82,
  lastHeartbeat: "2025-10-10T20:45:35Z"
}
```

### Git Checkpoint State

```bash
# Branch: epic-123/sprint-2-wip
# Commit every 5 minutes

git log --oneline:
a1b2c3d WIP: Sprint 2 checkpoint (80%) - 20:45:30
d4e5f6g WIP: Sprint 2 checkpoint (75%) - 20:40:30
g7h8i9j WIP: Sprint 2 checkpoint (70%) - 20:35:30

# Commit message format:
WIP: Sprint 2 checkpoint (80%)

Files in progress:
- src/auth-middleware.ts (82% confidence)
- src/auth.test.ts (92% confidence)

Last checkpoint: 2025-10-10T20:45:30Z
Redis checkpoint: epic:e-commerce-123:state

🤖 Auto-checkpoint via Claude Code CFN Loop
```

---

## Recovery Flow (Step-by-Step)

### Step 1: VS Code Crashes

```
[20:45:37] ⚠️  VS Code process terminated unexpectedly
[20:45:37] ⚠️  All agent processes stopped
[20:45:37] ⚠️  Claude Code CLI connection lost

BUT:
[20:45:37] ✅ Redis still running (separate process)
[20:45:37] ✅ Last checkpoint: 20:45:30 (7 seconds ago)
[20:45:37] ✅ State preserved in Redis
```

### Step 2: User Restarts VS Code

```
[20:47:00] User reopens VS Code
[20:47:01] Claude Code CLI initializes
[20:47:01] Connecting to Redis...
[20:47:02] ✅ Redis connection established
```

### Step 3: Crash Detection

```
[20:47:02] 🔍 Scanning for interrupted executions...
[20:47:02] Found Redis keys:
  - epic:e-commerce-123:state (status: in_progress)
  - sprint:auth-system:state (status: in_progress)
  - sprint:product-catalog:state (status: in_progress)

[20:47:03] ⚠️  Last checkpoint: 2025-10-10 20:45:30 (90 seconds ago)
[20:47:03] ⚠️  No heartbeats found (crash detected)
```

### Step 4: Recovery Prompt

```
🚨 Interrupted Execution Detected

Epic: E-commerce Platform (epic-e-commerce-123)
Started: 2025-10-10 20:15:00
Last Checkpoint: 2025-10-10 20:45:30 (90 seconds ago)
Crash Duration: 1 minute 30 seconds

Sprint Status:
  ✅ Sprint 1 (auth-system): COMPLETED (100%)
     └─ Files: src/auth.ts, src/auth.test.ts
     └─ Confidence: 0.91

  ⚠️  Sprint 2 (product-catalog): IN PROGRESS (80%)
     └─ Last file: src/products/catalog.ts (line 245)
     └─ Files completed: 8/10
     └─ Confidence: 0.82

  ⚠️  Sprint 3 (checkout-flow): IN PROGRESS (50%)
     └─ Last file: src/checkout/payment.ts (line 89)
     └─ Files completed: 4/8
     └─ Confidence: 0.78

  ❌ Sprint 4 (user-profile): STARTING (5%)
     └─ Last file: src/users/profile.ts (line 15)
     └─ Too early to resume, will restart

  ⏸️  Sprint 5 (admin-panel): WAITING (0%)
     └─ Dependency: Sprint 1 ✅ (resolved)
     └─ Ready to start

Estimated work loss: 3-5%
Estimated recovery time: 25 minutes

Recovery options:
  1. Resume from checkpoint (recommended)
  2. Restart failed sprints only (sprints 2-5)
  3. Inspect state (dry-run, no execution)
  4. Abandon and start fresh

Choose [1-4]:
```

### Step 5: Resume Execution (Option 1)

```
User selects: 1 (Resume from checkpoint)

[20:47:15] 🔄 Resuming Epic: E-commerce Platform
[20:47:15]
[20:47:15] ✅ Sprint 1 (auth-system): Already complete, skipping
[20:47:15]
[20:47:16] ⚠️  Sprint 2 (product-catalog): Resuming at 80%
[20:47:16]     └─ Loading checkpoint from Redis...
[20:47:17]     └─ Last file: src/products/catalog.ts
[20:47:17]     └─ Last section: "searchProducts()"
[20:47:18]     └─ Next section: "filterProducts()"
[20:47:19]     └─ Spawning agents: coder-2, tester-2
[20:47:20]     └─ Agents ready ✅
[20:47:20]
[20:47:21] ⚠️  Sprint 3 (checkout-flow): Resuming at 50%
[20:47:21]     └─ Loading checkpoint from Redis...
[20:47:22]     └─ Last file: src/checkout/payment.ts
[20:47:22]     └─ Last section: "processPayment()"
[20:47:23]     └─ Next section: "handlePaymentError()"
[20:47:24]     └─ Spawning agents: coder-3, tester-3
[20:47:25]     └─ Agents ready ✅
[20:47:25]
[20:47:26] ❌ Sprint 4 (user-profile): Too early, restarting from beginning
[20:47:26]     └─ Progress was only 5% (below threshold)
[20:47:27]     └─ Spawning agents: coder-4, tester-4
[20:47:28]     └─ Agents ready ✅
[20:47:28]
[20:47:29] ⏸️  Sprint 5 (admin-panel): Dependency resolved, starting
[20:47:29]     └─ Sprint 1 interface found in Redis ✅
[20:47:30]     └─ Spawning agents: coder-5, tester-5
[20:47:31]     └─ Agents ready ✅
[20:47:31]
[20:47:32] 🎯 Epic resumed successfully
[20:47:32] Active sprints: 4 (sprints 2, 3, 4, 5)
[20:47:32] Estimated time to completion: 25 minutes
[20:47:32]
[20:47:32] 📊 Progress:
  Sprint 2: ████████████████░░░░ 80% (resume)
  Sprint 3: ██████████░░░░░░░░░░ 50% (resume)
  Sprint 4: ░░░░░░░░░░░░░░░░░░░░  5% (restart)
  Sprint 5: ░░░░░░░░░░░░░░░░░░░░  0% (starting)
```

---

## Recovery Strategies by Crash Point

### Crash During Loop 3 (Implementation)

**Sprint 2 at 80% when crash occurs**

**What's Saved**:
- ✅ 8/10 files completed (on disk and in Redis)
- ✅ Current file partially written (src/catalog.ts)
- ✅ Last completed function: `searchProducts()`
- ✅ Confidence score: 0.82
- ✅ Test results for completed files

**What's Lost**:
- ❌ In-progress function: `filterProducts()` (partial code)
- ❌ Agent's working memory (context window)

**Recovery**:
```
[20:47:20] Loading src/catalog.ts from disk...
[20:47:21] Comparing with Redis checkpoint...
[20:47:22] Disk version: Last saved at 20:45:25
[20:47:23] Redis version: Last checkpoint at 20:45:30
[20:47:24] Using disk version (last save before crash)
[20:47:25] Agent analyzing code...
[20:47:26] Detected: searchProducts() ✅ complete
[20:47:27] Detected: filterProducts() ⚠️  incomplete
[20:47:28] Resuming from filterProducts()...
```

**Work Loss**: ~2-5% (just the in-progress function)

---

### Crash During Test Execution

**Sprint 2 running tests when crash occurs**

**What's Saved**:
- ✅ All implementation files
- ✅ Test lock holder information
- ✅ Test results up to crash point

**What's Lost**:
- ❌ Test process (killed with VS Code)

**Recovery**:
```
[20:47:30] 🧪 Sprint 2 had test lock at crash
[20:47:30]     └─ Last test: "should search products by category" ✅
[20:47:31]     └─ Tests run: 15/20 (before crash)
[20:47:31]
[20:47:32] Strategy: Re-run all tests (safest)
[20:47:33]     └─ Force releasing stale test lock
[20:47:34]     └─ Re-acquiring test slot...
[20:47:35]     └─ Test slot acquired ✅
[20:47:36]     └─ Running full test suite...
```

**Work Loss**: 0% (tests are idempotent)

---

### Crash During Loop 2 (Validation)

**Sprint 2 being validated when crash occurs**

**What's Saved**:
- ✅ Implementation complete (Loop 3 done)
- ✅ Validator 1 score: 0.88 ✅
- ✅ Validator 2 partially complete

**What's Lost**:
- ❌ Validator 2 in-progress analysis

**Recovery**:
```
[20:47:35] 🔍 Sprint 2 was in Loop 2 (validation)
[20:47:35]     └─ Loop 3: Complete ✅ (confidence: 0.82)
[20:47:36]     └─ Validator 1: Complete ✅ (score: 0.88)
[20:47:37]     └─ Validator 2: In progress (paused at 60%)
[20:47:37]
[20:47:38] Strategy: Resume Validator 2 from checkpoint
[20:47:39]     └─ Last validated: "API endpoint tests"
[20:47:40]     └─ Next: "Error handling tests"
[20:47:41]     └─ Spawning validator-2...
[20:47:42]     └─ Resuming validation...
```

**Work Loss**: ~1-2% (partial validation re-run)

---

### Crash During Dependency Wait

**Sprint 5 waiting for Sprint 1 interface**

**What's Saved**:
- ✅ Dependency list: ["sprint-1"]
- ✅ Productive work completed (mocks, tests)
- ✅ Wait start time

**What's Lost**:
- Nothing (agent was idle)

**Recovery**:
```
[20:47:40] ⏸️  Sprint 5 was waiting for Sprint 1 interface
[20:47:40]     └─ Dependency: Sprint 1 ✅ (already complete)
[20:47:41]     └─ Checking Redis for interface signal...
[20:47:42]     └─ Signal found: interface:sprint-1:ready ✅
[20:47:43]     └─ Interface: AuthAPI (POST /auth/login, /auth/logout)
[20:47:44]
[20:47:45] Strategy: Continue immediately (no longer blocked)
[20:47:46]     └─ Loading interface contract from Redis
[20:47:47]     └─ Spawning sprint coordinator...
[20:47:48]     └─ Starting Loop 3...
```

**Work Loss**: 0% (no work in progress)

---

## CLI Commands

### Check for Interrupted Executions

```bash
# After VS Code restart
claude-flow-novice recovery:status

# Or use dedicated command
/recovery:status
```

**Output**:
```
🔍 Scanning for interrupted executions...

Found 1 interrupted epic:

Epic: E-commerce Platform
  ID: epic-e-commerce-123
  Started: 2025-10-10 20:15:00
  Last Activity: 2025-10-10 20:45:37 (2 minutes ago)
  Crash Duration: 2 minutes

  Sprints:
    ✅ Sprint 1 (auth-system): COMPLETE (100%)
       └─ Files: src/auth.ts, src/auth.test.ts (2 files)
       └─ Confidence: 0.91

    ⚠️  Sprint 2 (product-catalog): INTERRUPTED (80%)
       └─ Files completed: 8/10
       └─ Last file: src/products/catalog.ts (line 245)
       └─ Confidence: 0.82

    ⚠️  Sprint 3 (checkout-flow): INTERRUPTED (50%)
       └─ Files completed: 4/8
       └─ Last file: src/checkout/payment.ts (line 89)
       └─ Confidence: 0.78

    ❌ Sprint 4 (user-profile): INTERRUPTED (5%)
       └─ Too early to resume, will restart

    ⏸️  Sprint 5 (admin-panel): WAITING (0%)
       └─ Dependency: Sprint 1 ✅ (resolved)

  Estimated work loss: 3-5%
  Estimated recovery time: 25 minutes

Run '/recovery:resume epic-e-commerce-123' to continue
```

---

### Resume Interrupted Epic

```bash
# Automatic resume (prompts for confirmation)
claude-flow-novice recovery:resume epic-e-commerce-123

# Or: Resume specific sprints only
claude-flow-novice recovery:resume epic-e-commerce-123 --sprints 2,3

# Dry-run (see what would happen, no execution)
claude-flow-novice recovery:resume epic-e-commerce-123 --dry-run
```

---

### Inspect Epic State

```bash
# Show full state dump
claude-flow-novice recovery:inspect epic-e-commerce-123

# Export to JSON for debugging
claude-flow-novice recovery:export epic-e-commerce-123 --output crash-state.json
```

**Output** (crash-state.json):
```json
{
  "epic": {
    "id": "epic-e-commerce-123",
    "status": "interrupted",
    "crashTime": "2025-10-10T20:45:37Z",
    "lastCheckpoint": "2025-10-10T20:45:30Z",
    "crashDuration": 120
  },
  "sprints": [
    {
      "id": "sprint-2",
      "status": "in_progress",
      "progress": 80,
      "filesCompleted": ["src/products/list.ts", "src/products/detail.ts"],
      "filesInProgress": ["src/products/catalog.ts"],
      "lastCheckpoint": {
        "file": "src/products/catalog.ts",
        "function": "searchProducts",
        "line": 245,
        "confidence": 0.82
      }
    }
  ]
}
```

---

### Abandon Interrupted Epic

```bash
# Clean up Redis state (if you don't want to resume)
claude-flow-novice recovery:abandon epic-e-commerce-123
```

**Confirmation**:
```
⚠️  This will permanently delete:
  - All sprint state
  - All agent checkpoints
  - All file progress data
  - All coordination locks

This action cannot be undone.

Continue? [y/N]: y

✅ Epic abandoned
✅ Redis state cleaned up
✅ WIP branches preserved (epic-123/sprint-*-wip)
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('Crash Recovery', () => {
  it('should detect interrupted epic on startup', async () => {
    // Simulate interrupted epic
    await redis.set('epic:123:state', JSON.stringify({
      status: 'in_progress',
      lastCheckpoint: Date.now() - 120000 // 2 minutes ago
    }));

    // Start CLI
    const detector = new CrashDetector(redis);
    const interrupted = await detector.findInterruptedEpics();

    expect(interrupted.length).toBe(1);
    expect(interrupted[0].epicId).toBe('epic-123');
  });

  it('should resume sprint from checkpoint', async () => {
    // Create checkpoint
    await redis.set('sprint:auth:state', JSON.stringify({
      progress: 80,
      filesInProgress: [{
        path: 'src/auth.ts',
        lastSection: 'validateToken',
        nextSection: 'refreshToken'
      }]
    }));

    // Resume
    const recovery = new RecoveryEngine(redis);
    const resumed = await recovery.resumeSprint('sprint-auth');

    expect(resumed.progress).toBe(80);
    expect(resumed.nextTask).toBe('refreshToken');
  });
});
```

---

### Chaos Tests

```typescript
describe('Crash Scenarios', () => {
  it('should recover from crash at 80% completion', async () => {
    // Execute epic to 80%
    const epic = await executeEpic({ sprints: 3 });

    // Simulate crash at 80%
    await simulateCrash(epic, 0.8);

    // Restart and recover
    const recovered = await recoverEpic(epic.id);

    // Verify work loss < 5%
    const workLoss = calculateWorkLoss(recovered);
    expect(workLoss).toBeLessThan(0.05);
  });
});
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Recovery Time** | <2 minutes | Time from restart to resumed execution |
| **Work Loss** | <5% | Percentage of work re-done after recovery |
| **Checkpoint Overhead** | <100ms | Time to write checkpoint to Redis |
| **Checkpoint Size** | <1MB | Redis memory per sprint checkpoint |
| **Detection Accuracy** | 100% | Correctly identify all interrupted epics |

---

## Next Steps

1. Implement state checkpoint manager: `src/cfn-loop/state-checkpoint-manager.ts`
2. Implement crash detector: `src/cfn-loop/crash-detector.ts`
3. Implement recovery engine: `src/cfn-loop/recovery-engine.ts`
4. Add recovery CLI commands: `src/cli/commands/recovery.ts`
5. Test with chaos engineering: Random crashes at different progress points
