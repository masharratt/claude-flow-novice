---
description: "CFN Loop pre-planning: Generate structured implementation plans with TDD approach"
argument-hint: "<task description> [--mode=mvp|beta|enterprise]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Bash"]
---

# Write Plan - CFN Loop Pre-Planning

Generate structured implementation plan BEFORE executing CFN Loop. Outputs plan document for review.

🎯 **Use this BEFORE /cfn-loop-task** (default CFN Loop execution)

> **Invoked internally by `/cfn-megaplan`.** Megaplan is the canonical planning entry point: it runs the full tiered DAG (research, spec, decide, pseudo, data, arch, ux, design, test-plan, ops) and calls `/write-plan` plus `/cfn-plan-review` for you, so under megaplan the plan's own directory (`planning/<slug>/`) also holds DATA/UX/DESIGN/OPS/TEST/DECISIONS/RESEARCH artifacts beyond SPEC/PSEUDO/ARCH. Run `/write-plan` standalone only when iterating an existing plan, or after the lighter `/cfn-spa-plan` sub-pipeline (spec+pseudo+arch only, no tiering).

**Task**: $ARGUMENTS

## What This Does

**Pre-planning phase for CFN Loop:**
0a. **Design pre-plan (REQUIRED for non-trivial work):** the design artifacts come from `/cfn-megaplan` (canonical) or the lighter `/cfn-spa-plan` (spec+pseudo+arch only). At minimum this command needs `SPEC_<slug>.md`, `PSEUDO_<slug>.md`, `ARCH_<slug>.md` — resolved from `planning/<slug>/` first, then legacy flat `planning/` (Step 0); under megaplan additional artifacts (DATA/UX/DESIGN/OPS/TEST/DECISIONS/RESEARCH) also exist and are consumed when present. This command auto-detects all of them. If the core SPA trio is missing for non-trivial work (multi-file, shared state, new feature), warn and recommend running `/cfn-megaplan` (or `/cfn-spa-plan`) first.
0b. **GOAP goal modeling** (optional): run `/cfn-goap-plan` to define goal state, derive optimal action sequence via A*, surface assumptions.
1. Analyzes task complexity
2. Selects appropriate agents
3. Defines test cases and success criteria (sourced from SPEC acceptance criteria + edge cases when present)
4. Creates implementation roadmap (sourced from ARCH components and PSEUDO operations when present)
5. Outputs plan document for approval

**Then run (default CFN Loop, subscription-backed):**
```bash
# After reviewing plan
/cfn-loop-task "Implement JWT authentication" --mode=beta
```

Beta mode = full epic implementation, then vote-based verification via `cfn-vote-implement`.
Use `/cfn-loop-cli` only when external API billing required (e.g. delegating to non-Claude providers).

## Command Options

```bash
# Beta planning (default depth)
/write-plan "Implement JWT authentication"

# MVP planning (faster, simpler)
/write-plan "Build prototype feature" --mode=mvp

# Enterprise planning (comprehensive)
/write-plan "Production security system" --mode=enterprise
```

**Options:**
- `--mode=<mvp|beta|enterprise>`: Planning depth (default: beta)

## Execution Pattern

### Step 0: Detect Design Artifacts

Before analyzing, check for the design bundle. The core trio (SPEC/PSEUDO/ARCH) comes from either `/cfn-megaplan` (canonical) or the lighter `/cfn-spa-plan`. Under megaplan, additional artifacts (DATA/UX/DESIGN/OPS/TEST/DECISIONS/RESEARCH) also exist. Build sanitized task slug, then probe:

**Where the artifacts live.** `/cfn-megaplan` and `/cfn-megaplan-lite` put every artifact of one plan in a per-plan directory, `planning/<slug>/`. Older plans (and `/cfn-spa-plan`) sit flat in `planning/`. Never probe for either layout by hand — `plan-paths.sh resolve` checks nested first, flat second, and is the single source of truth for the layout:

```bash
PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh
SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
PDIR=$("$PP" dir "$SLUG")                 # planning/<slug> — where THIS run writes
# prints the resolved path, or nothing + non-zero when neither layout has it
find_art() { local p; p=$("$PP" resolve "$SLUG" "$1_${SLUG}.md" 2>/dev/null) || return 1; printf '%s\n' "$p"; }

SPEC=$(find_art SPEC || true);  PSEUDO=$(find_art PSEUDO || true);  ARCH=$(find_art ARCH || true)

SPA_FOUND=0
for F in "$SPEC" "$PSEUDO" "$ARCH"; do [ -n "$F" ] && SPA_FOUND=$((SPA_FOUND+1)); done

# Optional megaplan artifacts (present when invoked under /cfn-megaplan)
for KIND in DATA UX DESIGN OPS TEST DECISIONS RESEARCH; do
  P=$(find_art "$KIND") && echo "found $P"
done
```

An absent optional artifact stays silent, exactly as before. `$SPEC`/`$PSEUDO`/`$ARCH` are empty when missing, so the three branches below read unchanged.

**Three branches:**

1. **Core trio present (`SPA_FOUND == 3`)** — Read all via the `Read` tool. Also read any optional megaplan artifacts found above and inject them as authoritative context. Do NOT HALT just because only SPEC/PSEUDO/ARCH are present: that is the complete bundle for the lighter `/cfn-spa-plan` path, and under megaplan the additional artifacts will also exist and be consumed. Test cases derive from SPEC acceptance criteria + edge cases (and TEST artifact when present). Agent count derives from ARCH NEW/EXTEND counts.

2. **Partial (`1 <= SPA_FOUND < 3`)** — The design bundle is incomplete. Tell user which core artifacts are missing and recommend: `Run /cfn-megaplan "$ARGUMENTS" (canonical) or /cfn-spa-plan "$ARGUMENTS" to complete the bundle, then re-run /write-plan`. Do not generate a partial plan.

3. **None (`SPA_FOUND == 0`)** — Classify task:
   - **Trivial** (single-file fix, rename, bug fix with reproducing test): proceed to Step 1 with generic heuristics.
   - **Non-trivial** (multi-file, shared state, new feature, security/auth): recommend running `/cfn-megaplan "$ARGUMENTS"` first (canonical; the lighter `/cfn-spa-plan` is the no-tiering fallback). Design pre-planning is expected for non-trivial work (see global CLAUDE.md Plan Mode Protocol).
   - If unclear, use `AskUserQuestion` to ask whether to run the design pipeline first or treat as trivial.

### Step 1: Analyze Task

**Planner self-check (Bar B, run BEFORE writing the plan file).** Whether or not this command runs under megaplan, the planner must verify every implementation step against the Bar B specificity checklist (`.claude/skills/cfn-megaplan/bars/haiku-executable.md`) before the plan is written:

1. **Files**: every step names a full path. No "the relevant component", "the auth module", "wherever X lives".
2. **Signatures**: every function/method to add or change is given typed args + return. No "a helper that does X".
3. **UI controls**: every field names its explicit control type (dropdown vs input vs toggle vs date-picker). No "an input for course".
4. **Value sources**: every value names its origin: which table column, which env var, which constant, which upstream field.
5. **Branches**: every branch enumerated in PSEUDO maps to a named step. No silent fall-through.
6. **No weasel words**: zero occurrences of: appropriately, as needed, as appropriate, handle accordingly, figure out, etc., and so on, TBD, properly, gracefully (without a defined behavior), where applicable.
7. **States**: for any UI surface, loading / empty / error / success / partial / disabled each have a named handling step.
8. **Errors**: every external call (DB, HTTP, queue) names its error path. No bare happy-path-only step.

A step failing any item gets rewritten before output. Under megaplan the orchestrator re-runs this gate independently; standalone runs get it here.

Spawn the planner with ONE of the two prompt variants below. Pick by the Step 0 branch: variant A when the core trio is present (`SPA_FOUND == 3`), variant B when the task is trivial with no bundle.

**Prompt variant A: with design bundle (SPA_FOUND == 3)**

```
Task("planner", "
  ANALYZE TASK FOR CFN LOOP PLANNING

  Task: $ARGUMENTS
  Mode: <mode>

  SPA BUNDLE (authoritative source of truth):
  --- SPEC ---
  <contents of planning/<slug>/SPEC_<slug>.md>
  --- PSEUDO ---
  <contents of planning/<slug>/PSEUDO_<slug>.md>
  --- ARCH ---
  <contents of planning/<slug>/ARCH_<slug>.md>
  --- OPTIONAL MEGAPLAN ARTIFACTS (inject each found: DATA/UX/DESIGN/OPS/TEST/DECISIONS/RESEARCH) ---
  <contents>

  ANALYSIS REQUIRED:
  1. Complexity Assessment:
     - Use ARCH 'Components' table: count NEW vs EXTEND vs REUSE for true scope
     - Estimated LOC: <200 (simple) | 200-500 (standard) | >500 (complex)
     - Keywords: security, performance, frontend, mobile, etc.

  2. Agent Selection:
     - Implementer count = ARCH NEW components + ceil(EXTEND/2)
     - Validators driven by NFRs in SPEC: security NFR -> security-specialist; perf NFR -> perf-analyzer;
       accessibility NFR -> accessibility-advocate-persona; observability NFR -> devops-engineer

  3. Test Binding (TDD):
     - If planning/<slug>/TEST_<slug>.md exists: inherit its Phase 6 table verbatim into the plan's TDD Sequence;
       do NOT invent new test cases.
     - Otherwise: ONE failing test per SPEC edge case (EC-1..EC-N) + ONE per acceptance criterion; no skipping.
     - Every implementation step binds to exactly one failing test (see plan structure, Step 2).

  4. Success Criteria:
     - Every SPEC FR and EC maps to an executable check (inherit TEST section 3 when present)
     - All NFRs measurably met (cite the threshold from SPEC)
     - DRY audit honored: no NEW component duplicates an existing one

  5. Build Discipline (standing instruction to every Loop 3 implementer):
     - Climb the cfn-arch build ladder before writing anything: YAGNI -> reuse in-codebase -> stdlib ->
       native platform -> reuse installed dep -> one line -> minimum new code -> (last resort) add a NEW dep.
     - A NEW dependency is a planned line item, never an implementer's silent choice. If the plan needs one,
       name it here so cfn-plan-review can blast-radius it.
     - Security carve-out: never hand-roll crypto/auth/parsing/sanitization to avoid a dep. A vetted dep wins there.

  6. Bar B self-check: verify every step against the 8-item specificity checklist (files, signatures,
     UI controls, value sources, branches, weasel words, states, errors) before writing the file.

  OUTPUT: planning/<slug>/PLAN_<slug>.md
  CROSS-REFERENCE: Plan must cite SPEC/PSEUDO/ARCH file paths in every section.
")
```

**Prompt variant B: without design bundle (trivial task, SPA_FOUND == 0)**

```
Task("planner", "
  ANALYZE TASK FOR CFN LOOP PLANNING

  Task: $ARGUMENTS
  Mode: <mode>

  ANALYSIS REQUIRED:
  1. Complexity Assessment:
     - Estimated files: 1-2 (simple) | 3-5 (standard) | >5 (complex)
     - Estimated LOC: <200 (simple) | 200-500 (standard) | >500 (complex)
     - Keywords: security, performance, frontend, mobile, etc.

  2. Agent Selection:
     - Loop 3 (Implementation): Based on task type
       * Backend: backend-dev, researcher, devops
       * Full-stack: backend-dev, react-frontend-engineer, devops
       * Mobile: mobile-dev, backend-dev
       * Security: security-specialist, backend-dev
     - Loop 2 (Validation): Scale by complexity
       * Simple: reviewer, tester
       * Standard: +architect, +security-specialist
       * Complex: +code-analyzer, +perf-analyzer

  3. Test Binding (TDD):
     - Produce the same per-step TDD Sequence table shape as the bundle path (see plan structure, Step 2):
       every implementation step binds to one failing test written first.

  4. Success Criteria:
     - Every deliverable is an executable check (command + pass condition); no prose criteria
     - Performance benchmarks (if applicable)
     - Security requirements (if applicable)

  5. Build Discipline (standing instruction to every Loop 3 implementer):
     - Climb the cfn-arch build ladder before writing anything: YAGNI -> reuse in-codebase -> stdlib ->
       native platform -> reuse installed dep -> one line -> minimum new code -> (last resort) add a NEW dep.
     - A NEW dependency is a planned line item, never an implementer's silent choice. If the plan needs one,
       name it here so cfn-plan-review can blast-radius it.
     - Security carve-out: never hand-roll crypto/auth/parsing/sanitization to avoid a dep. A vetted dep wins there.

  6. Bar B self-check: verify every step against the 8-item specificity checklist (files, signatures,
     UI controls, value sources, branches, weasel words, states, errors) before writing the file.

  OUTPUT: planning/<slug>/PLAN_<slug>.md
")
```

### Step 2: Generate Plan Document

**Plan Structure:**
```markdown
# Implementation Plan: [Task Name]

## Task Analysis
- **Complexity**: Simple | Standard | Complex
- **Estimated Files**: N
- **Estimated LOC**: N
- **Mode**: ${mode}

## Agent Configuration

### Loop 3 (Implementation)
- agent-1 (role)
- agent-2 (role)
- agent-3 (role)

### Loop 2 (Validation)
- reviewer (code review)
- tester (quality assurance)
[+ architect, security-specialist for beta/enterprise]

### Product Owner
- product-owner (PROCEED/ITERATE/ABORT decision)

## Assembly Rule

When megaplan artifacts exist (TEST/OPS/etc. in the plan dir `planning/<slug>/`), this plan is an ASSEMBLY document: the step table below + the inherited TEST tables + the OPS integration rows + the risk register. Do not author freehand Red/Green/Refactor phases or prose deliverables; the tables below replace them entirely.

### Phase 2: Green (Implementation Steps)
Every step MUST fill every column. A step missing a file path, signature, or verification command is invalid (Bar B haiku-executable rejects it). One step = one file where possible; never more than 3 files per step.

| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test (from TEST_<slug> Phase 6) | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/types.ts | add `interface Claims { sub: string; exp: number }` | `src/auth/types.ts:Claims` | `-` | tests/types.spec.ts::claims_shape | `vitest run tests/types.spec.ts 2>&1 | tee "$OUT"` | test green |
| 2.2 | src/auth/jwt.ts | add `verifyToken(token: string): Promise<Claims>` throwing `TokenExpiredError` | `src/auth/jwt.ts:verifyToken` | `src/auth/types.ts:Claims` | tests/jwt.spec.ts::rejects_expired | `vitest run tests/jwt.spec.ts 2>&1 | tee "$OUT"` | test green |

**Produces / Consumes columns (cross-lane ordering metadata).** These let `cfn-loop-task` order parallel lanes into dependency-correct waves instead of discovering a missing symbol at the gate and burning a retry wave.
- **Produces:** new files or exported symbols this step CREATES that did not exist before, as `<full-path>` or `<full-path>:<symbol>`, comma-separated. `-` when the step creates nothing importable (e.g. edits an existing function body only).
- **Consumes:** files or exported symbols from OTHER steps that this step needs to already exist, same identifier form. `-` when the step depends only on already-existing tree symbols. A Consumes value MUST string-match (exact, trimmed) a Produces value of some other step, else it is treated as a pre-existing symbol (no ordering edge) — a typo therefore produces no edge and self-demotes to a gate failure, so keep the strings identical byte-for-byte.
- **No duplicate producers:** two steps in DIFFERENT lanes must not Produce the same identifier (ambiguous owner). Same-lane duplicate is fine.

Banned in any cell (Produces/Consumes included): "appropriately", "as needed", "handle", "the relevant file", "the relevant export", "a helper that", "TBD", "etc". A Produces/Consumes cell is either a concrete `<path>`/`<path>:<symbol>` list or `-`.

## Ops Integration Tasks (required if planning/<slug>/OPS_<slug>.md exists)

One implementation-step row (same schema as above) for each of: the feature flag wrapper (OPS section 3: flag name, default off); EVERY log line / metric from OPS section 2 (emit steps; runtime-observed ACs in TEST section 3 depend on them - an AC asserting a log line with no emit step here is a plan defect); the down-migration file (OPS section 6). If OPS exists and this section is empty, the plan is incomplete.

## TDD Sequence (per step, mechanical)

If planning/<slug>/TEST_<slug>.md exists: copy its Phase 6 table here verbatim and bind each row to a step # from Implementation Steps. Do NOT invent new test cases. If it does not exist, produce the same table shape yourself.

| Step # | Failing test written FIRST (file::case) | Red command (must exit non-zero) | Green command (must exit 0 after step) | Runnable-at (unit/wiring/assembled/runtime-observed) |
|---|---|---|---|---|

Execution rule per step: (1) write test, (2) coordinator runs Red command, confirm non-zero, (3) implement the one change in the step row, (4) coordinator runs Green command, confirm 0. Agents write tests and read results; the coordinator executes test commands (never the implementer agent). A step whose Red command passes before implementation is a defect: stop, fix the test.

## Success Criteria

### Quality Gates
- Loop 3 gate score = (AC checks green) / (total AC checks in TEST section 3)
- Loop 2 consensus = validators voting PASS / validators spawned
- Both computed from the VERIFY manifest, never estimated.
- Canonical thresholds per mode (test_pass_rate_gate / confidence_gate / consensus): .claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md

### Deliverables (every line must be an executable check - Bar A format)

| Deliverable | Check command | Pass condition |
|---|---|---|
| all AC checks green | (inherit planning/<slug>/TEST_<slug>.md section 3 table by reference) | every row green |
| types compile | `tsc --noEmit 2>&1 | tee "$OUT"` | exit 0 |
| security gate | /cfn-security-review manifest | 0 high findings |

Prose criteria ("review complete", ">=80% coverage", "documented") are invalid; Bar A rejects them.

### Performance Benchmarks (if applicable)
Each benchmark is a row in the Deliverables table: check command = the load/bench invocation, pass condition = the SPEC NFR threshold. No prose benchmarks.

## Estimation (gap G29 — gated by mode/extras)

Skip for `mvp`. Light for `beta`. Full for `enterprise`.

- **Effort**: per Loop 3 phase, a coarse size (S/M/L) tied to ARCH NEW/EXTEND counts.
- **Token budget**: estimated implementer + validator spend; if any step uses `claude -p` or an external provider, cite a `--budget` cap (per CLAUDE.md cost-safety).
- **Wall-clock**: critical-path phase count (the build is a DAG, not a list).

## Risk Register (gap G30 — replaces flat "blockers"; gated by mode/extras)

Skip for `mvp`. Light for `beta`. Full for `enterprise`. Each risk is a row, not a bullet.

| id | risk | likelihood (L/M/H) | impact (L/M/H) | mitigation | owner/trigger |
|----|------|:--:|:--:|-----------|---------------|
| R1 | [external dep unavailable] | M | H | [fallback plan] | [who/what triggers it] |
| R2 | [data volume exceeds single-pass migration] | L | H | [batched migration] | [row-count check before cutover] |

Technical risks and dependency risks both live here. A risk with no mitigation AND no trigger is incomplete.

## Iteration Strategy
- Max iterations: 15 (enterprise) | 10 (beta) | 5 (mvp)
- Confidence threshold: per mode from .claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md (confidence_gate)
- Adaptive agent spawning: YES

## Next Steps

1. Review this plan
2. Execute CFN Loop (subscription-backed):
   \`\`\`bash
   /cfn-loop-task "$ARGUMENTS" --mode=${mode}
   \`\`\`
```

### Step 3: Output Plan

The plan is written into the plan's own directory, `planning/<slug>/PLAN_<slug>.md` — the same `$PDIR` every other artifact of this plan lives in (Step 0). Never write it loose in `planning/`: `/cfn-loop-task` and `/cfn-megaplan`'s persistence gate both look for it under the plan dir first, and a loose copy is what splits one plan across two locations.

```javascript
const slug = sanitize($ARGUMENTS);
// planning/<slug>/, created if absent — mirrors `plan-paths.sh write <slug> PLAN_<slug>.md`
const planDir = `planning/${slug}`;
const planPath = `${planDir}/PLAN_${slug}.md`;
Write(planPath, planContent);

console.log(`✅ Implementation plan generated: ${planPath}`);
console.log('');
console.log('📋 Plan Summary:');
console.log(`- Complexity: ${complexity}`);
console.log(`- Loop 3 Agents: ${loop3Agents.length}`);
console.log(`- Loop 2 Validators: ${loop2Agents.length}`);
console.log(`- Test Cases: ${testCases.length}`);
console.log(`- Success Criteria: ${successCriteria.length}`);
console.log('');
console.log('Next: Review plan, then execute CFN Loop');
console.log(`/cfn-loop-task "$ARGUMENTS" --mode=${mode}`);
```

## Integration with CFN Loop

**Canonical workflow (megaplan runs steps 0a-2 for you):**
```
0.  /cfn-megaplan "Task description" [--tier=mvp|beta|enterprise]   (CANONICAL entry point)
    ↓ Tiered DAG: research → spec → decide/pseudo → data → arch/ux → design/test-plan/ops
    ↓ Calls /write-plan and /cfn-plan-review internally, gated by
    ↓ verifiable-done + haiku-executable bars
    ↓ Emits planning/<slug>/{RESEARCH,SPEC,DECISIONS,PSEUDO,DATA,ARCH,UX,DESIGN,TEST,OPS,PLAN}_<slug>.md

(or the lighter no-tiering path, spec+pseudo+arch only:)

0a. /cfn-spa-plan "Task description"  (lighter sub-pipeline; megaplan supersedes it)
    ↓ Generates planning/<slug>/SPEC_<slug>.md, PSEUDO_<slug>.md, ARCH_<slug>.md
    ↓ Edge cases enumerated, branch coverage mapped, DRY audited

0b. /cfn-goap-plan  (optional bookend, for complex multi-step goals)
    ↓ Models goal state, derives A* action sequence

1.  /write-plan "Task description" --mode=beta
    ↓ Auto-detects the design bundle (planning/<slug>/, then legacy flat planning/) and consumes it
    ↓ (standalone path: run when iterating an existing plan)
    ↓ Generates planning/task/PLAN_task.md

2.  /cfn-plan-review  (data, APIs, shared state)
    ↓ Dependency trace, blast radius, gap analysis

3.  Human reviews plan (optional)
    ↓ Approve or request changes

4.  /cfn-loop-task "Task description" --mode=beta
    ↓ Full epic implementation (TDD, subscription-backed)
    ↓ Then vote-based verification via cfn-vote-implement
    ↓ Unanimous fixes auto-implemented; 2/3 → product-owner decides; 1/3 → batched user prompts at end
```

## Mode Comparison

| Mode | Complexity | Agents | Coverage gate (executable) | Use Case |
|------|------------|--------|----------------------------|----------|
| MVP | Low | 3-4 total | every FR + EC in TEST section 3 has a green check (FR m/m, EC k/k mapped) | Prototypes, proof-of-concept |
| Beta | Medium | 5-7 total | MVP gate + integration/contract AC rows green | Production features |
| Enterprise | High | 8-10 total | Beta gate + non-functional AC rows (perf/load/a11y/security) green | Critical systems, compliance |

Coverage is measured as AC-check rows green per the VERIFY manifest, never as a percent estimate. Thresholds: .claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md.

## Example Output

```
Analyzing task...

✅ Implementation plan generated: planning/jwt_authentication/PLAN_jwt_authentication.md

📋 Plan Summary:
- Complexity: Standard
- Loop 3 Agents: 3 (backend-dev, researcher, devops)
- Loop 2 Validators: 4 (reviewer, tester, architect, security-specialist)
- Test Cases: 8
- Success Criteria: 6

Next: Review plan, then execute CFN Loop
/cfn-loop-task "Implement JWT authentication" --mode=beta
```

## Best Practices

**When to Use:**
- ✅ Complex tasks (>3 steps)
- ✅ Security-critical features
- ✅ Team collaboration (plan review needed)
- ✅ Learning CFN Loop workflow

**When to Skip:**
- Simple bug fixes (go straight to /cfn-loop-task)
- Urgent hotfixes (no time for planning)
- Well-understood patterns (agent knows what to do)

## Related Commands

- **Canonical planning pipeline**: `/cfn-megaplan` (invokes this command internally)
- **Lighter design sub-pipeline**: `/cfn-spa-plan` (spec+pseudo+arch only, no tiering)
- **Execute Plan**: `/cfn-loop-task` (default, subscription-backed). `/cfn-loop-cli` only for external-API delegation.
- **Document Results**: `/cfn-loop-document` (after completion)

---

**Version:** 2.0.0 (2025-10-31) - Integrated with CFN Loop v3 architecture
