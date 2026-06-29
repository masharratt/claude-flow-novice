---
description: "CFN Loop pre-planning: Generate structured implementation plans with TDD approach"
argument-hint: "<task description> [--mode=mvp|beta|enterprise]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Bash"]
---

# Write Plan - CFN Loop Pre-Planning

Generate structured implementation plan BEFORE executing CFN Loop. Outputs plan document for review.

🎯 **Use this BEFORE /cfn-loop-task** (default CFN Loop execution)

> **Invoked internally by `/cfn-megaplan`.** Megaplan is the canonical planning entry point: it runs the full tiered DAG (research, spec, decide, pseudo, data, arch, ux, design, test-plan, ops) and calls `/write-plan` plus `/cfn-plan-review` for you, so under megaplan the `planning/` dir also holds DATA/UX/DESIGN/OPS/TEST/DECISIONS/RESEARCH artifacts beyond SPEC/PSEUDO/ARCH. Run `/write-plan` standalone only when iterating an existing plan, or after the lighter `/cfn-spa-plan` sub-pipeline (spec+pseudo+arch only, no tiering).

**Task**: $ARGUMENTS

## What This Does

**Pre-planning phase for CFN Loop:**
0a. **Design pre-plan (REQUIRED for non-trivial work):** the design artifacts come from `/cfn-megaplan` (canonical) or the lighter `/cfn-spa-plan` (spec+pseudo+arch only). At minimum this command needs `planning/SPEC_*.md`, `PSEUDO_*.md`, `ARCH_*.md`; under megaplan additional artifacts (DATA/UX/DESIGN/OPS/TEST/DECISIONS/RESEARCH) also exist and are consumed when present. This command auto-detects all of them. If the core SPA trio is missing for non-trivial work (multi-file, shared state, new feature), warn and recommend running `/cfn-megaplan` (or `/cfn-spa-plan`) first.
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

```bash
SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
SPEC="planning/SPEC_${SLUG}.md"
PSEUDO="planning/PSEUDO_${SLUG}.md"
ARCH="planning/ARCH_${SLUG}.md"

SPA_FOUND=0
[ -f "$SPEC" ]   && SPA_FOUND=$((SPA_FOUND+1))
[ -f "$PSEUDO" ] && SPA_FOUND=$((SPA_FOUND+1))
[ -f "$ARCH" ]   && SPA_FOUND=$((SPA_FOUND+1))

# Optional megaplan artifacts (present when invoked under /cfn-megaplan)
for KIND in DATA UX DESIGN OPS TEST DECISIONS RESEARCH; do
  [ -f "planning/${KIND}_${SLUG}.md" ] && echo "found planning/${KIND}_${SLUG}.md"
done
```

**Three branches:**

1. **Core trio present (`SPA_FOUND == 3`)** — Read all via the `Read` tool. Also read any optional megaplan artifacts found above and inject them as authoritative context. Do NOT HALT just because only SPEC/PSEUDO/ARCH are present: that is the complete bundle for the lighter `/cfn-spa-plan` path, and under megaplan the additional artifacts will also exist and be consumed. Test cases derive from SPEC acceptance criteria + edge cases (and TEST artifact when present). Agent count derives from ARCH NEW/EXTEND counts.

2. **Partial (`1 <= SPA_FOUND < 3`)** — The design bundle is incomplete. Tell user which core artifacts are missing and recommend: `Run /cfn-megaplan "$ARGUMENTS" (canonical) or /cfn-spa-plan "$ARGUMENTS" to complete the bundle, then re-run /write-plan`. Do not generate a partial plan.

3. **None (`SPA_FOUND == 0`)** — Classify task:
   - **Trivial** (single-file fix, rename, bug fix with reproducing test): proceed to Step 1 with generic heuristics.
   - **Non-trivial** (multi-file, shared state, new feature, security/auth): recommend running `/cfn-megaplan "$ARGUMENTS"` first (canonical; the lighter `/cfn-spa-plan` is the no-tiering fallback). Design pre-planning is expected for non-trivial work (see global CLAUDE.md Plan Mode Protocol).
   - If unclear, use `AskUserQuestion` to ask whether to run the design pipeline first or treat as trivial.

### Step 1: Analyze Task

```javascript
const spaContext = SPA_FOUND === 3
  ? `\nSPA BUNDLE (authoritative source of truth):\n--- SPEC ---\n${spec}\n--- PSEUDO ---\n${pseudo}\n--- ARCH ---\n${arch}\n`
  : '';

Task("planner", `
  ANALYZE TASK FOR CFN LOOP PLANNING

  Task: $ARGUMENTS
  Mode: ${mode}
  ${spaContext}

  ANALYSIS REQUIRED:
  1. Complexity Assessment:
     ${SPA_FOUND === 3
       ? '- Use ARCH "Components" table: count NEW vs EXTEND vs REUSE for true scope'
       : '- Estimated files: 1-2 (simple) | 3-5 (standard) | >5 (complex)'}
     - Estimated LOC: <200 (simple) | 200-500 (standard) | >500 (complex)
     - Keywords: security, performance, frontend, mobile, etc.

  2. Agent Selection:
     ${SPA_FOUND === 3
       ? '- Implementer count = ARCH NEW components + ceil(EXTEND/2)\n     - Validators driven by NFRs in SPEC: security NFR -> security-specialist; perf NFR -> perf-analyzer; accessibility NFR -> accessibility-advocate-persona; observability NFR -> devops-engineer'
       : '- Loop 3 (Implementation): Based on task type\n       * Backend: backend-dev, researcher, devops\n       * Full-stack: backend-dev, react-frontend-engineer, devops\n       * Mobile: mobile-dev, backend-dev\n       * Security: security-specialist, backend-dev\n     - Loop 2 (Validation): Scale by complexity\n       * Simple: reviewer, tester\n       * Standard: +architect, +security-specialist\n       * Complex: +code-analyzer, +perf-analyzer'}

  3. Test Cases (TDD Approach):
     ${SPA_FOUND === 3
       ? '- Red Phase: ONE test per SPEC edge case (EC-1..EC-N) + ONE per acceptance criterion (AC scenarios); no skipping\n     - Green Phase: implementations satisfying SPEC postconditions per PSEUDO operation\n     - Refactor Phase: address PSEUDO complexity flags (O(n^2)+, >3 I/O calls)'
       : '- Red Phase: Failure scenarios\n     - Green Phase: Minimal passing implementation\n     - Refactor Phase: Quality improvements'}

  4. Success Criteria:
     ${SPA_FOUND === 3
       ? '- Every SPEC FR has a passing test\n     - Every SPEC EC has a passing test (mandatory; no skipping)\n     - All NFRs measurably met (cite the threshold from SPEC)\n     - DRY audit honored: no NEW component duplicates an existing one'
       : '- Test coverage target (≥80%)\n     - Performance benchmarks (if applicable)\n     - Security requirements (if applicable)\n     - Deliverables list'}

  5. Build Discipline (standing instruction to every Loop 3 implementer):
     - Climb the cfn-arch build ladder before writing anything: YAGNI -> reuse in-codebase -> stdlib -> native platform -> reuse installed dep -> one line -> minimum new code -> (last resort) add a NEW dep.
     - A NEW dependency is a planned line item, never an implementer's silent choice. If the plan needs one, name it here so cfn-plan-review can blast-radius it.
     - Security carve-out: never hand-roll crypto/auth/parsing/sanitization to avoid a dep — a vetted dep wins there.

  OUTPUT: planning/PLAN_${SLUG}.md
  ${SPA_FOUND === 3 ? 'CROSS-REFERENCE: Plan must cite SPEC/PSEUDO/ARCH file paths in every section.' : ''}
`)
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

## Test-Driven Development Plan

### Phase 1: Red (Failure Scenarios)
**Deliverables:**
- [ ] Test script: tests/test-[feature].sh
- [ ] Failure test cases defined

**Test Cases:**
1. [Test case 1 - expected failure]
2. [Test case 2 - edge case]
3. [Test case 3 - performance requirement]

### Phase 2: Green (Minimal Implementation)
**Deliverables:**
- [ ] Minimal working implementation
- [ ] All test cases passing

**Implementation Steps:**
1. [Core functionality]
2. [Basic validation]
3. [Minimal error handling]

### Phase 3: Refactor (Quality Improvement)
**Deliverables:**
- [ ] Code quality improvements
- [ ] Enhanced test coverage (≥80%)
- [ ] Documentation

**Refactoring Goals:**
1. [Code organization]
2. [Performance optimization]
3. [Security hardening]

## Success Criteria

### Quality Gates
- Loop 3 Gate: ≥${mode === 'enterprise' ? 0.85 : mode === 'beta' ? 0.75 : 0.70}
- Loop 2 Consensus: ≥${mode === 'enterprise' ? 0.95 : mode === 'beta' ? 0.90 : 0.80}

### Deliverables
- [ ] All test cases passing
- [ ] Test coverage ≥80%
- [ ] Code complexity <15 per function
- [ ] Security review complete
- [ ] Documentation updated

### Performance Benchmarks (if applicable)
- [Benchmark 1]
- [Benchmark 2]

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
- Max iterations: ${mode === 'enterprise' ? 15 : mode === 'beta' ? 10 : 5}
- Confidence threshold: ${mode === 'enterprise' ? 0.95 : mode === 'beta' ? 0.90 : 0.80}
- Adaptive agent spawning: YES

## Next Steps

1. Review this plan
2. Execute CFN Loop (subscription-backed):
   \`\`\`bash
   /cfn-loop-task "$ARGUMENTS" --mode=${mode}
   \`\`\`
```

### Step 3: Output Plan

```javascript
const planPath = `planning/PLAN_${sanitize($ARGUMENTS)}.md`;
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
    ↓ Emits planning/{RESEARCH,SPEC,DECISIONS,PSEUDO,DATA,ARCH,UX,DESIGN,TEST,OPS,PLAN}_*.md

(or the lighter no-tiering path, spec+pseudo+arch only:)

0a. /cfn-spa-plan "Task description"  (lighter sub-pipeline; megaplan supersedes it)
    ↓ Generates planning/SPEC_*.md, PSEUDO_*.md, ARCH_*.md
    ↓ Edge cases enumerated, branch coverage mapped, DRY audited

0b. /cfn-goap-plan  (optional bookend, for complex multi-step goals)
    ↓ Models goal state, derives A* action sequence

1.  /write-plan "Task description" --mode=beta
    ↓ Auto-detects design bundle in planning/ and consumes it
    ↓ (standalone path: run when iterating an existing plan)
    ↓ Generates planning/PLAN_task.md

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

| Mode | Complexity | Agents | Test Coverage | Use Case |
|------|------------|--------|---------------|----------|
| MVP | Low | 3-4 total | ≥70% | Prototypes, proof-of-concept |
| Beta | Medium | 5-7 total | ≥80% | Production features |
| Enterprise | High | 8-10 total | ≥90% | Critical systems, compliance |

## Example Output

```
Analyzing task...

✅ Implementation plan generated: planning/PLAN_jwt_authentication.md

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
