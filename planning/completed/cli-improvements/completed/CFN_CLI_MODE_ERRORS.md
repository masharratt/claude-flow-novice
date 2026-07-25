# CFN Loop CLI Mode - Compatibility Issues Report

**Date:** 2025-11-03
**Project:** ourstories-v2
**CFN Loop Version:** Attempting to use cfn-v3-coordinator with orchestrate.sh
**Environment:** WSL2 Ubuntu, Windows file system

---

## Executive Summary

CFN Loop CLI mode (`/cfn-loop-cli`) fails to execute in the ourstories-v2 project due to infrastructure mismatches between the orchestrator's expectations and the actual project environment.

**Impact**: CLI mode (production, cost-optimized) is non-functional. Task mode works as fallback.

---

## Error Timeline

### Error 1: Missing `store-context.sh` Script

**Error Message**:
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh: line 309:
/mnt/c/Users/masha/Documents/ourstories-v2/.claude/skills/cfn-redis-coordination/store-context.sh:
No such file or directory
```

**Exit Code**: 127

**Root Cause**:
- Orchestrator expects `store-context.sh` in `.claude/skills/cfn-redis-coordination/`
- Script was missing from skills directory

**Resolution Attempted**:
1. Created minimal `store-context.sh` implementation:
```bash
#!/bin/bash
# Store task context in Redis
TASK_ID="$1"
CONTEXT="$2"

redis-cli HSET "cfn_loop:task:${TASK_ID}:context" \
  "task_description" "$CONTEXT" \
  "stored_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Context stored for task: $TASK_ID"
```

2. Fixed line endings for WSL2: `dos2unix store-context.sh`
3. Made executable: `chmod +x store-context.sh`

**Result**: Error persisted (script created after orchestrator started)

---

### Error 2: CLI Spawning Infrastructure Missing

**Expected Behavior**:
Orchestrator should spawn agents via:
```bash
npx claude-flow-novice agent react-frontend-engineer \
  --task-id "$TASK_ID" \
  --context "$CONTEXT"
```

**Actual Behavior**:
- `npx claude-flow-novice` command not available
- Project uses direct repository structure, not npm package installation
- Orchestrator line 309+ references non-existent CLI tool

**Root Cause**:
The orchestrator is designed for projects that have `claude-flow-novice` installed as an npm package:
```bash
# Expected installation:
npm install claude-flow-novice
npx cfn-init
```

**Current Project State**:
- No `node_modules/claude-flow-novice/` directory
- No `npx claude-flow-novice` binary
- Skills exist directly in `.claude/skills/` (copied manually)

---

## Infrastructure Mismatch Analysis

### What Orchestrator Expects

**Directory Structure**:
```
project/
├── node_modules/
│   └── claude-flow-novice/
│       └── dist/
│           └── cli.js (npx entrypoint)
├── .claude/
│   ├── agents/
│   └── skills/
│       ├── cfn-redis-coordination/
│       │   ├── store-context.sh ✅
│       │   └── invoke-waiting-mode.sh ✅
│       └── cfn-loop-orchestration/
│           └── orchestrate.sh ✅
└── package.json (with claude-flow-novice dependency)
```

**Agent Spawning**:
```bash
# Line 309+ in orchestrate.sh
npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" \
  --iteration "$ITERATION"
```

### What Project Actually Has

**Directory Structure**:
```
ourstories-v2/
├── .claude/
│   ├── agents/ ✅
│   └── skills/ ✅ (manually copied)
├── package.json ❌ (no claude-flow-novice dependency)
└── node_modules/ ❌ (no claude-flow-novice binary)
```

**Available Spawning**:
- Task() tool (Main Chat spawns agents via API)
- No CLI-based spawning mechanism

---

## Detailed Error Output

```
==============================================
CFN Loop Orchestration v1.0.0
==============================================
Task ID: cfn-cli-1762149420
Mode: standard
Gate Threshold: 0.75
Consensus Threshold: 0.90
Max Iterations: 10
Timeout: 3600s
==============================================

[ERROR] ./.claude/skills/cfn-loop-orchestration/orchestrate.sh: line 309:
/mnt/c/Users/masha/Documents/ourstories-v2/.claude/skills/cfn-redis-coordination/store-context.sh:
No such file or directory

Exit Code: 127
```

**Line 309 Context** (orchestrate.sh):
```bash
# Store context in Redis for agents to retrieve
"${SKILL_DIR}/cfn-redis-coordination/store-context.sh" \
  "$TASK_ID" \
  "$CONTEXT_JSON"

# Spawn Loop 3 agents via CLI
for agent in ${LOOP3_AGENTS//,/ }; do
  npx claude-flow-novice agent "$agent" \
    --task-id "$TASK_ID" \
    --context "$CONTEXT_JSON" &
done
```

---

## Why CLI Mode Matters (Context for CFN Team)

### Cost Comparison

**Task Mode** (current fallback):
```
Main Chat → Task(agent1) → Anthropic ($0.015)
Main Chat → Task(agent2) → Anthropic ($0.015)
Main Chat → Task(agent3) → Anthropic ($0.015)
Total: $0.045/iteration
```

**CLI Mode** (broken):
```
Main Chat → Task(coordinator) → Anthropic ($0.015)
Coordinator → npx agent1 → Z.ai ($0.003)
Coordinator → npx agent2 → Z.ai ($0.003)
Coordinator → npx agent3 → Z.ai ($0.003)
Total: $0.024/iteration (47% savings)
```

**For SEO Dashboard Task**:
- Estimated iterations: 5-10
- Task mode cost: $0.225 - $0.450
- CLI mode cost: $0.120 - $0.240
- **Savings**: $0.105 - $0.210 (47%)

---

## Workaround Used

**Solution**: Switched to Task mode by spawning agents directly

```typescript
// Instead of CLI orchestrator:
Task("cfn-v3-coordinator", "...") // ❌ Fails

// Used direct agent spawning:
Task("react-frontend-engineer", "...") // ✅ Works
Task("reviewer", "...") // ✅ Works
Task("tester", "...") // ✅ Works
```

**Result**: Task completed successfully using Task mode (0.85 confidence)

---

## Questions for CFN Team

### 1. Installation Method
**Q**: Is `claude-flow-novice` supposed to be installed via npm in every project?

**Expected**:
```bash
npm install claude-flow-novice
npx cfn-init
```

**Or should orchestrator work without package installation?**

### 2. CLI Binary Availability
**Q**: Should `npx claude-flow-novice agent` command be available after running `npx cfn-init`?

**Current behavior**: Skills copied to `.claude/` but no binary created

### 3. Standalone Orchestrator Support
**Q**: Can orchestrator.sh work in "standalone mode" without npm package?

**Suggestion**: Add fallback to Task() spawning if `npx claude-flow-novice` not found

### 4. Missing Scripts Checklist
**Q**: Which scripts are required in `cfn-redis-coordination/` for orchestrator to work?

**Found missing**:
- `store-context.sh` (created manually)

**Exists**:
- `invoke-waiting-mode.sh` ✅
- `collect-confidence-scores.sh` ✅
- `complete-swarm.sh` ✅

### 5. WSL2 Compatibility
**Q**: Are there known issues with WSL2 + Windows file system?

**Observed**:
- Line ending issues (CRLF vs LF)
- `/mnt/c/` paths work but might have edge cases
- `dos2unix` required for all shell scripts

---

## Recommendations for CFN Team

### Short-term Fix (Option 1): Add Installation Docs
```markdown
# Setup CFN Loop CLI Mode

## Prerequisites
npm install claude-flow-novice
npx cfn-init

## Verify Installation
npx claude-flow-novice --version
which claude-flow-novice
```

### Short-term Fix (Option 2): Standalone Orchestrator
Modify orchestrate.sh to detect environment:
```bash
if command -v npx &> /dev/null && npx claude-flow-novice --version &> /dev/null; then
  # CLI mode
  npx claude-flow-novice agent "$AGENT_TYPE" --task-id "$TASK_ID"
else
  # Fallback to Task mode
  echo "WARN: claude-flow-novice CLI not found, using Task mode fallback"
  # Spawn via Task() somehow (need Main Chat coordination)
fi
```

### Long-term Fix: Hybrid Mode
Create orchestrator that works in both environments:
- Detect if running in npm package context
- Use CLI spawning if available
- Fallback to Task() spawning if not
- Document both modes clearly

### Documentation Gap
**Missing from CFN docs**:
1. Installation instructions for ourstories-v2 context
2. Prerequisite checklist (npm package vs manual setup)
3. Troubleshooting guide for "command not found" errors
4. WSL2-specific setup notes

---

## Test Case for CFN Team

To reproduce this issue in any project:

```bash
# 1. Clone project without claude-flow-novice installed
git clone <project-repo>
cd project

# 2. Copy CFN skills manually (simulating user who copies from docs)
mkdir -p .claude/skills
cp -r /path/to/cfn/skills/* .claude/skills/

# 3. Try to run orchestrator
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "test-123" \
  --mode "standard" \
  --loop3-agents "backend-dev" \
  --loop2-agents "reviewer"

# Expected: Should fail with "command not found: npx claude-flow-novice"
# Actual: Fails with "No such file or directory: store-context.sh"
```

---

## Impact Assessment

**Severity**: MEDIUM
- ❌ CLI mode non-functional in ourstories-v2
- ✅ Task mode works as fallback
- ⚠️ Cost savings unavailable (47% higher cost)
- ⚠️ User confusion ("why isn't CLI mode working?")

**Affected Users**:
- Projects that copy CFN skills manually (not via npm)
- Users following documentation examples
- Teams trying CLI mode for first time

**Workaround Difficulty**: LOW
- Task mode is straightforward alternative
- Same quality results, just higher API cost
- No functionality loss, only cost impact

---

## Files for CFN Team Review

**Orchestrator**:
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (line 309+)

**Missing Dependencies**:
- `node_modules/claude-flow-novice/dist/cli.js`
- `.claude/skills/cfn-redis-coordination/store-context.sh` (now created)

**Working Project Structure**:
- `.claude/agents/` ✅
- `.claude/skills/` ✅ (all skills present)
- Redis running ✅ (localhost:6379)
- Git repository ✅

---

## Summary for CFN Team

**Problem**: Orchestrator assumes `npx claude-flow-novice` is available but it's not installed in ourstories-v2 project.

**Root Cause**: Mismatch between orchestrator design (npm package context) and actual usage (manual skills copy).

**User Impact**: CLI mode fails, forces fallback to Task mode (47% higher cost).

**Needed**:
1. Installation docs (how to set up CLI mode properly)
2. Or: Orchestrator fallback to Task mode when CLI unavailable
3. Or: Clarify CLI mode requires npm package installation

**Current Status**: Task completed successfully using Task mode workaround. All components built and tested (0.85 confidence).
