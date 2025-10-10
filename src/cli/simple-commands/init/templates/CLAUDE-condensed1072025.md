
# Claude Flow Novice — AI Agent Orchestration

---

## 1) Critical Rules (Single Source of Truth)

* **Use agents for all non-trivial work** (≥4 steps or any multi-file / research / testing / architecture / security / integration / refactor / feature).
* **Initialize swarm before any multi-agent work.**
* **Batch operations**: one message per related batch (spawn, file edits, bash, todos, memory ops).
* **Run post-edit hook after every file edit.**
* **Never work solo** on multi-step tasks. Spawn parallel specialists.
* **Never mix implementers and validators in the same message.**
* **Never run tests inside agents.** Execute once; agents read results.
* **Never save to project root.** Use proper subdirs.
* **No guides/summaries/reports** unless explicitly asked.
* **Use spartan language.**

**Consensus thresholds**

* Gate (agent self-confidence): **≥0.75 each**
* Validators consensus: **≥0.90**

---

## 2) When Agents Are Mandatory (Triggers)

If **any** apply, spawn agents:

* > 3 distinct steps • multiple files • research+implement+test • design decisions • code review/quality • security/performance/compliance • system integration • docs generation • refactor/optimize • any feature work

---

## 3) Execution Patterns

### 3.1 Swarm Init → Spawn (Single Message)

```javascript
// Always init first, then spawn all implementers
mcp__claude-flow-novice__swarm_init({ topology: "mesh", maxAgents: 3, strategy: "balanced" })
Task("Coder", "Implement X. Report confidence.", "coder")
Task("Backend", "API Y. Report confidence.", "backend-dev")
Task("Tester", "Write integration tests for Z. Report confidence.", "tester")
```

**Topology**: mesh (2–7), hierarchical (8+)

### 3.2 Post-Edit Hook (Mandatory)

```bash
node config/hooks/post-edit-pipeline.js "[FILE]" --memory-key "swarm/[agent]/[step]"
```

**Useful flags (optional)**: `--tdd-mode` • `--minimum-coverage 80..90` • `--rust-strict`

### 3.3 Safe Test Execution

```bash
# Run once, save results
npm test -- --run --reporter=json > test-results.json 2>&1
# Agents read results only
cat test-results.json
# Cleanup
pkill -f vitest; pkill -f "npm test"
```

**Forbidden**: tests executed inside agents; concurrent test runs; long-running tests without cleanup.

### 3.4 Batching (One message = all related ops)

* Spawn all agents with Task tool in one message.
* Batch file ops, bash, todos, memory ops.

---

## 4) CFN Loop (Single Section)
Loop 0: Epic/Sprint orchestration (multi-phase) → no iteration limit
Loop 1: Phase execution (sequential phases) → no limit
Loop 2: Consensus validation (validators) → max 10/phase; exit at ≥0.90
Loop 3: Primary swarm implementation → max 10/subtask; exit when all ≥0.75
Loop 4: Product Owner decision gate (GOAP) → PROCEED / DEFER / ESCALATE

Flow

Loop 3 implementers produce output + self-confidence scores.

Gate: if all ≥0.75, go to Loop 2; else retry Loop 3 with targeted/different agents.

Loop 2 validators run; if ≥0.90, phase complete; else retry Loop 3 targeted to issues.

**🎯 CRITICAL:** Loop 4 Product Owner runs autonomous GOAP decision:

After consensus validation, Product Owner agent makes autonomous PROCEED/DEFER/ESCALATE decision:

PROCEED: Relaunch Loop 3 with targeted fixes or move to next sprint

DEFER: Approve work, backlog out-of-scope issues. launch swarms for next steps

ESCALATE: Critical ambiguity → human review.

Auto-transition phases when complete by launching a swarm for next steps. No permission prompts.

Retry Templates (minimal)

Loop 3 retry (low confidence): replace failing agents with specialists; add missing roles (security/perf).
Loop 2 retry (consensus <0.90): target validator issues (e.g., fix SQLi, raise coverage) and re-run Loop 3.

Stop only if: dual iteration limits reached, critical security/compilation error, or explicit STOP/PAUSE.

---

## 5) Coordination Checklist (Before / During / After)

**Before**: assess complexity → set agent count/types → choose topology → prepare single spawn message → unique non-overlapping instructions.

**During**: coordinate via SwarmMemory → post-edit hook after every edit → self-validate and report confidence.

**After**: achieve ≥0.90 validator consensus → store results → auto next steps.

---

## 6) Prohibited Patterns

* Implementers + validators in same message.
* Tests inside agents; multiple concurrent test runs.
* Solo work on multi-step tasks.
* Asking permission to retry/advance when criteria/iterations allow.
* Saving to root.
* Creating guides/summaries/reports unless asked.

---

## 7) Agent Selection Cheatsheet

* **Core**: coder • tester • reviewer
* **Backend**: backend-dev • api-docs • system-architect
* **Frontend/Mobile**: coder (specialized) • mobile-dev
* **Quality**: tester • reviewer • security-specialist • perf-analyzer
* **Planning/Ops**: researcher • planner • architect • devops-engineer • cicd-engineer
* **Docs**: api-docs • researcher

Pick roles for actual needs (no generic redundancy).

---

## 8) Commands & Setup

**Add MCP server**

```bash
claude mcp add claude-flow-novice npx claude-flow-novice mcp start
```

**Essentials**

* `npx claude-flow-novice status` — health
* `npx claude-flow-novice --help` — commands
* `/fullstack "goal"` — full-stack team + consensus
* `/swarm`, `/sparc`, `/hooks` — autodiscovered

**File organization**: never save working files to root.

---

## 9) Output & Telemetry (Concise)

**Agent confidence JSON (per agent)**

```json
{ "agent": "coder-1", "confidence": 0.85, "reasoning": "tests pass; security clean", "blockers": [] }
```

**Phase/Loop status (sample)**

```
Loop 3: avg 0.82 (target 0.75) ✅ → Proceed to Loop 2
Loop 2: 0.87 (target 0.90) ❌ → Relaunch Loop 3 (security + coverage)
```

**Next steps block**

* ✅ Completed: brief list
* 📊 Validation: confidence, coverage, consensus
* 🔍 Issues: debt/warnings
* 💡 Recommendations: prioritized
