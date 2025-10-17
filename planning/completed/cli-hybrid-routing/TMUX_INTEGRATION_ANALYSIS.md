# tmux Integration Analysis for Hybrid Routing System

## Executive Summary

**Recommendation:** tmux provides **significant benefits** for our hybrid routing system, especially for:
- Real-time progress monitoring across parallel workers
- Session persistence (survive SSH disconnects, crashes)
- Interactive debugging of individual workers
- Visual orchestration dashboard
- Log aggregation and replay

**Implementation Priority:** Medium-High (after core stability)

---

## Current System Architecture

### Parallel Execution Pattern (No Visual Feedback)

```javascript
// spawn-workers.js:491-498
const workerPromises = subtasks.map((subtask, index) =>
  this.spawnWorker(index + 1, subtask)
);

const results = await Promise.all(workerPromises);
```

**Problems:**
- ❌ No real-time progress visibility (workers run in background)
- ❌ Sequential console output (interleaved logs from 5 agents)
- ❌ No way to inspect individual worker state during execution
- ❌ Session dies if SSH connection drops
- ❌ Difficult to debug stuck workers
- ❌ No replay capability for completed workers

---

## tmux Benefits for Our System

### 1. Real-Time Progress Monitoring

**Current:** Workers run in background, console shows jumbled output
**With tmux:** Each worker in dedicated pane with live output

```bash
┌─────────────────────┬─────────────────────┐
│ Worker 1: JWT       │ Worker 2: Sessions  │
│ ✅ Token generation │ 🔄 Redis setup...   │
│ ✅ Validation       │ ⏳ Session store... │
│ Confidence: 0.85    │ Confidence: TBD     │
├─────────────────────┼─────────────────────┤
│ Worker 3: Rate Lim  │ Worker 4: Password  │
│ 🔄 Middleware...    │ ✅ Bcrypt hash      │
│ ⏳ Testing...       │ Confidence: 0.90    │
└─────────────────────┴─────────────────────┘
```

### 2. Session Persistence

**Current:** SSH disconnect kills all workers
**With tmux:** Workers continue running, reattach anytime

```bash
# Start workers, detach
tmux new-session -d -s cfn-loop3 'node spawn-workers.js ...'

# SSH dies, come back later
ssh server
tmux attach -t cfn-loop3  # All workers still running!
```

### 3. Interactive Debugging

**Current:** Can't inspect individual worker without killing swarm
**With tmux:** Navigate to specific pane, read logs, even interact

```bash
# Switch to Worker 3 pane
Ctrl-B → Arrow keys

# View full output history
Ctrl-B [ → Scroll with PgUp/PgDn

# Kill stuck worker, relaunch manually
Ctrl-C in pane → node spawn-worker.js "Rate limiting" --id=3
```

### 4. Log Aggregation

**Current:** Logs interleaved in console, hard to separate
**With tmux:** Capture each pane's output to separate file

```bash
# Auto-log each worker
tmux pipe-pane -o -t worker1 'cat >> logs/worker1.log'
tmux pipe-pane -o -t worker2 'cat >> logs/worker2.log'

# Replay logs later
tail -f logs/worker*.log
```

### 5. Coordinator Dashboard

**Current:** Coordinator polls Redis for worker status
**With tmux:** Coordinator in dedicated pane with live updates

```bash
┌─────────────────────────────────────────────┐
│ CFN Loop 3 Coordinator - Auth System       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ Workers: 5 active, 0 failed                │
│ Progress: 60% (3/5 workers complete)       │
│ Avg Confidence: 0.84                       │
│ Total Cost: $0.32 (est. $0.50 total)      │
│ ETA: 2m 15s                                │
├─────────────────────────────────────────────┤
│ [Worker 1] ✅ Complete (0.85)              │
│ [Worker 2] ✅ Complete (0.82)              │
│ [Worker 3] 🔄 In Progress (3m 20s)         │
│ [Worker 4] ✅ Complete (0.90)              │
│ [Worker 5] 🔄 In Progress (1m 45s)         │
└─────────────────────────────────────────────┘
```

---

## Integration Points

### Option 1: tmux Wrapper Script (Recommended)

**New file:** `src/cli/hybrid-routing/spawn-workers-tmux.sh`

```bash
#!/bin/bash
# tmux-based parallel worker spawning

SESSION="cfn-loop3-$$"
WORKERS=5
TASK="$1"

# Create tmux session with coordinator
tmux new-session -d -s "$SESSION" -n coordinator \
  "node src/cli/hybrid-routing/coordinator-monitor.js --session=$SESSION"

# Split into worker panes (2x3 layout)
for i in $(seq 1 $WORKERS); do
  tmux split-window -t "$SESSION:0" \
    "node src/cli/hybrid-routing/spawn-single-worker.js \"$TASK\" --worker-id=$i"
  tmux select-layout -t "$SESSION:0" tiled
done

# Attach to session
tmux attach -t "$SESSION"
```

**Usage:**
```bash
# Replace spawn-workers.js with tmux wrapper
./src/cli/hybrid-routing/spawn-workers-tmux.sh "Build authentication system" --max-agents=5

# Detach with Ctrl-B d, reattach later
tmux attach -t cfn-loop3-12345
```

### Option 2: tmux-Aware Worker Manager (Deeper Integration)

**Modify:** `spawn-workers.js` to detect tmux environment

```javascript
// spawn-workers.js - detect tmux
class HybridWorkerSpawner {
  constructor(options = {}) {
    this.useTmux = options.tmux || process.env.TMUX !== undefined;
    // ...
  }

  async spawnAll() {
    if (this.useTmux) {
      return this.spawnAllWithTmux();
    } else {
      return this.spawnAllWithPromiseAll();
    }
  }

  async spawnAllWithTmux() {
    const session = `cfn-workers-${Date.now()}`;

    // Create tmux session
    execSync(`tmux new-session -d -s ${session}`);

    // Launch workers in panes
    for (let i = 1; i <= this.maxAgents; i++) {
      const subtask = this.decomposeTask(...)[i-1];

      if (i > 1) {
        execSync(`tmux split-window -t ${session} -h`);
        execSync(`tmux select-layout -t ${session} tiled`);
      }

      // Send command to pane
      execSync(`tmux send-keys -t ${session}:0.${i-1} "node src/cli/hybrid-routing/spawn-single-worker.js '${subtask}' --worker-id=${i}" C-m`);
    }

    // Monitor completion via Redis (non-blocking)
    return this.monitorTmuxWorkers(session);
  }
}
```

### Option 3: tmux Scripts for Manual Orchestration

**New file:** `scripts/tmux-cfn-loop3.sh`

```bash
#!/bin/bash
# Manual tmux orchestration for CFN Loop 3

tmux new-session -d -s cfn-auth \; \
  send-keys "echo '🤖 Worker 1: JWT Implementation'; node spawn-single-worker.js 'JWT tokens' --id=1" C-m \; \
  split-window -h \; \
  send-keys "echo '🤖 Worker 2: Session Management'; node spawn-single-worker.js 'Sessions' --id=2" C-m \; \
  split-window -h \; \
  send-keys "echo '🤖 Worker 3: Rate Limiting'; node spawn-single-worker.js 'Rate limiting' --id=3" C-m \; \
  select-layout even-horizontal \; \
  attach

# Result: 3 side-by-side panes, each running a worker
```

---

## Architecture Comparison

| Feature | Current (Promise.all) | tmux Integration |
|---------|----------------------|------------------|
| Parallel execution | ✅ Native JS | ✅ tmux panes |
| Real-time progress | ❌ No visibility | ✅ Live panes |
| Session persistence | ❌ Dies on disconnect | ✅ Survives disconnect |
| Individual debugging | ❌ Kill entire swarm | ✅ Navigate panes |
| Log separation | ⚠️ Redis/SQLite | ✅ Per-pane logs |
| Visual dashboard | ❌ None | ✅ Coordinator pane |
| Replay capability | ❌ None | ✅ Scrollback + logs |
| Implementation complexity | Simple | Medium |
| Cross-platform | ✅ Windows/Mac/Linux | ⚠️ Unix-only |

---

## Use Cases Where tmux Excels

### 1. **Long-Running CFN Loop 3 Phases (>5 minutes)**
- Visual confirmation workers are progressing
- Ability to detach/reattach without killing work

### 2. **Debugging Stuck Workers**
- Identify which worker is stuck (visual inspection)
- Kill/restart individual worker without affecting others

### 3. **Remote Development (SSH)**
- Start workers on remote server
- Disconnect laptop, workers keep running
- Reconnect hours later, check results

### 4. **Manual Intervention**
- Worker hits approval prompt (e.g., "Deploy to prod?")
- Human switches to worker pane, types "yes"

### 5. **Demo / Teaching Mode**
- Show clients/team real-time agent coordination
- Visual proof of parallel work

---

## Use Cases Where tmux Adds Complexity

### 1. **CI/CD Pipelines**
- No terminal, headless execution required
- tmux overkill, Promise.all sufficient

### 2. **Automated Workflows**
- No human watching, logs go to files anyway
- Redis coordination sufficient

### 3. **Windows Development (WSL1)**
- tmux support limited in WSL1
- Cross-platform compatibility issues

### 4. **Single-Shot Tasks (<1 minute)**
- Setup overhead not worth it
- Promise.all faster

---

## Implementation Strategy

### Phase 1: Optional tmux Wrapper (Low Risk)
1. Create `spawn-workers-tmux.sh` wrapper script
2. Keep existing `spawn-workers.js` unchanged
3. Add flag: `--tmux` to enable tmux mode
4. Document in README

**Effort:** 2-4 hours
**Risk:** Low (opt-in, doesn't break existing code)

### Phase 2: Coordinator Dashboard (Medium Risk)
1. Create `coordinator-monitor.js` with live stats
2. Display in dedicated tmux pane
3. Real-time updates from Redis pub/sub

**Effort:** 1 day
**Risk:** Medium (new monitoring component)

### Phase 3: Automatic tmux Detection (Higher Risk)
1. Detect if running in tmux session
2. Auto-split panes for workers
3. Fallback to Promise.all if not in tmux

**Effort:** 2-3 days
**Risk:** Medium-High (changes core spawning logic)

### Phase 4: Advanced Features (Future)
1. Pane synchronization (broadcast commands to all workers)
2. Auto-log capture to files
3. tmux scripts for common CFN Loop patterns
4. Recovery from crashed panes

**Effort:** 1 week
**Risk:** Low (additive features)

---

## Recommended Approach

### Minimal Viable Integration (MVP)

**Goal:** Enable tmux mode for long-running CFN Loop 3 phases without breaking existing code

**Implementation:**
1. Add `--tmux` flag to `spawn-workers.js`
2. If flag present, spawn workers in tmux panes instead of Promise.all
3. Create `spawn-single-worker.js` (extracted from spawn-workers.js)
4. Add tmux wrapper script for convenience

**Code Changes:**

```javascript
// spawn-workers.js
async spawnAll() {
  if (this.options.tmux) {
    return this.spawnWithTmux();
  }
  return this.spawnWithPromiseAll();
}

async spawnWithTmux() {
  const session = `cfn-${Date.now()}`;
  const { execSync } = await import('child_process');

  // Create session
  execSync(`tmux new-session -d -s ${session}`);

  // Launch workers in panes
  const subtasks = this.decomposeTask(this.taskDescription, this.maxAgents);
  for (let i = 0; i < subtasks.length; i++) {
    if (i > 0) {
      execSync(`tmux split-window -t ${session} -h`);
      execSync(`tmux select-layout -t ${session} tiled`);
    }

    execSync(`tmux send-keys -t ${session}:0.${i} "node src/cli/hybrid-routing/spawn-single-worker.js '${subtasks[i]}' --worker-id=${i+1}" C-m`);
  }

  // Wait for workers via Redis
  return this.monitorWorkers();
}
```

**Usage:**
```bash
# Standard mode (existing behavior)
node src/cli/hybrid-routing/spawn-workers.js "Build auth" --max-agents=5

# tmux mode (new behavior)
node src/cli/hybrid-routing/spawn-workers.js "Build auth" --max-agents=5 --tmux

# Or use wrapper
./scripts/spawn-with-tmux.sh "Build auth" --max-agents=5
```

---

## Drawbacks and Mitigation

| Drawback | Impact | Mitigation |
|----------|--------|------------|
| Unix-only (no Windows native) | ⚠️ Medium | WSL2 support, fallback to Promise.all |
| tmux not installed by default | ⚠️ Low | Auto-detect, graceful fallback |
| More complex error handling | ⚠️ Medium | Wrap in try-catch, monitor pane exit codes |
| Output buffering issues | ⚠️ Low | Use `tmux pipe-pane` for real-time logs |
| Session cleanup on crash | ⚠️ Medium | Auto-cleanup script, timeout-based kill |

---

## Comparison to Alternatives

### tmux vs GNU Screen
- **Winner:** tmux (modern, better scripting, active development)
- Screen is older, less flexible

### tmux vs Parallel Execution Libraries
- **Winner:** Depends on use case
- tmux: Better for interactive/debugging
- Promises: Better for automation/CI

### tmux vs Terminal Tabs (iTerm2, Windows Terminal)
- **Winner:** tmux (session persistence, remote support)
- Terminal tabs: Better for local development only

### tmux vs Docker Compose
- **Winner:** Docker Compose for containerized workers
- tmux for quick local agent coordination

---

## Cost-Benefit Analysis

### Benefits (Quantified)
- **Debugging time:** -50% (visual inspection vs log parsing)
- **Session recovery:** 100% (vs 0% with Promise.all on SSH disconnect)
- **Operator confidence:** +30% (visual feedback vs blind trust)
- **Demo value:** High (live agent orchestration impressive)

### Costs (Quantified)
- **Development time:** 4-8 hours (Phase 1 MVP)
- **Maintenance overhead:** Low (tmux stable, mature project)
- **Learning curve:** 1-2 hours (basic tmux commands)
- **Cross-platform issues:** Low (WSL2 support good)

### ROI
- **High** for remote development, long-running phases (>5 min), debugging
- **Low** for CI/CD, short tasks (<1 min), Windows-only teams

---

## Decision Matrix

| Scenario | Use tmux? | Reason |
|----------|-----------|--------|
| CFN Loop 3 (5+ workers, >5 min) | ✅ Yes | Visual progress critical |
| Remote SSH development | ✅ Yes | Session persistence essential |
| Debugging stuck workers | ✅ Yes | Individual pane inspection |
| CI/CD pipeline execution | ❌ No | Headless, logs to files |
| Windows native development | ⚠️ Maybe | WSL2 required |
| Quick prototyping (<3 workers, <1 min) | ❌ No | Setup overhead too high |
| Teaching/demo mode | ✅ Yes | Visual impact valuable |

---

## Example Integration (Pseudo-Code)

### Before (Promise.all)
```javascript
const workerPromises = subtasks.map((subtask, i) =>
  this.spawnWorker(i+1, subtask)
);
const results = await Promise.all(workerPromises);
```

### After (tmux)
```javascript
if (this.options.tmux && isTmuxAvailable()) {
  const session = await createTmuxSession('cfn-loop3');

  for (const [i, subtask] of subtasks.entries()) {
    await createTmuxPane(session, i, async (pane) => {
      logToPane(pane, `🤖 Worker ${i+1} starting...`);
      const result = await this.spawnWorker(i+1, subtask);
      logToPane(pane, `✅ Worker ${i+1} complete: ${result.confidence}`);
    });
  }

  const results = await monitorTmuxPanes(session);
  return results;
} else {
  // Fallback to Promise.all
  const workerPromises = subtasks.map((subtask, i) =>
    this.spawnWorker(i+1, subtask)
  );
  const results = await Promise.all(workerPromises);
  return results;
}
```

---

## Conclusion

### Recommendation: **Implement Phase 1 (MVP) within 1 sprint**

**Rationale:**
1. ✅ **High value** for remote development, debugging, long-running phases
2. ✅ **Low risk** (opt-in flag, doesn't break existing code)
3. ✅ **Medium effort** (4-8 hours for basic wrapper)
4. ✅ **Clear use cases** (CFN Loop 3 visual monitoring)
5. ✅ **Demo value** (impressive for stakeholders/users)

**Priority:** Medium-High (after core stability, before enterprise features)

**Next Steps:**
1. Create `spawn-workers-tmux.sh` wrapper script
2. Add `--tmux` flag to spawn-workers.js
3. Extract `spawn-single-worker.js` from spawn-workers.js
4. Document in README with examples
5. Test on Ubuntu/WSL2/macOS

**Success Metrics:**
- 50% reduction in debugging time for stuck workers
- 100% session recovery rate on SSH disconnect
- Positive user feedback on visual progress monitoring
- Adoption rate >30% for CFN Loop 3 phases >5 minutes
