---
description: "CFN Loop pre-planning: Generate structured implementation plans with TDD approach"
argument-hint: "<task description> [--mode=mvp|standard|enterprise]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Bash"]
---

# Write Plan - CFN Loop Pre-Planning

Generate structured implementation plan BEFORE executing CFN Loop. Outputs plan document for review.

🎯 **Use this BEFORE /cfn-loop-cli or /cfn-loop-task**

**Task**: $ARGUMENTS

## What This Does

**Pre-planning phase for CFN Loop:**
0a. **SPA pre-plan (REQUIRED for non-trivial work):** run `/cfn-spa-plan` first to produce `planning/SPEC_*.md`, `PSEUDO_*.md`, `ARCH_*.md`. This command auto-detects those artifacts and consumes them. If missing for non-trivial work (multi-file, shared state, new feature), HALT and instruct user to run `/cfn-spa-plan` first.
0b. **GOAP goal modeling** (optional): run `/cfn-goap-plan` to define goal state, derive optimal action sequence via A*, surface assumptions.
1. Analyzes task complexity
2. Selects appropriate agents
3. Defines test cases and success criteria (sourced from SPEC acceptance criteria + edge cases when present)
4. Creates implementation roadmap (sourced from ARCH components and PSEUDO operations when present)
5. Outputs plan document for approval

**Then run:**
```bash
# After reviewing plan
/cfn-loop-cli "Implement JWT authentication" --mode=standard
# OR
/cfn-loop-task "Implement JWT authentication" --mode=standard
```

## Command Options

```bash
# Standard planning
/write-plan "Implement JWT authentication"

# MVP planning (faster, simpler)
/write-plan "Build prototype feature" --mode=mvp

# Enterprise planning (comprehensive)
/write-plan "Production security system" --mode=enterprise
```

**Options:**
- `--mode=<mvp|standard|enterprise>`: Planning depth (default: standard)

## Execution Pattern

### Step 0: Detect SPA Artifacts (REQUIRED)

Before analyzing, check for SPA bundle. Build sanitized task slug, then probe:

```bash
SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
SPEC="planning/SPEC_${SLUG}.md"
PSEUDO="planning/PSEUDO_${SLUG}.md"
ARCH="planning/ARCH_${SLUG}.md"

SPA_FOUND=0
[ -f "$SPEC" ]   && SPA_FOUND=$((SPA_FOUND+1))
[ -f "$PSEUDO" ] && SPA_FOUND=$((SPA_FOUND+1))
[ -f "$ARCH" ]   && SPA_FOUND=$((SPA_FOUND+1))
```

**Three branches:**

1. **All three present (`SPA_FOUND == 3`)** — Read all via the `Read` tool. Inject content into Step 1 planner prompt as authoritative context. Test cases derive from SPEC acceptance criteria + edge cases. Agent count derives from ARCH NEW/EXTEND counts.

2. **Partial (`1 <= SPA_FOUND < 3`)** — HALT. Tell user which artifacts are missing. Instruct: `Run /cfn-spa-plan "$ARGUMENTS" to complete the bundle, then re-run /write-plan`. Do not generate a partial plan.

3. **None (`SPA_FOUND == 0`)** — Classify task:
   - **Trivial** (single-file fix, rename, bug fix with reproducing test): proceed to Step 1 with generic heuristics.
   - **Non-trivial** (multi-file, shared state, new feature, security/auth): HALT. Instruct: `Run /cfn-spa-plan "$ARGUMENTS" first. SPA pre-planning is required for non-trivial work (see global CLAUDE.md Plan Mode Protocol)`.
   - If unclear, use `AskUserQuestion` to ask whether to run SPA first or treat as trivial.

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
       ? '- Implementer count = ARCH NEW components + ceil(EXTEND/2)\n     - Validators driven by NFRs in SPEC: security NFR -> security-specialist; perf NFR -> performance-benchmarker; accessibility NFR -> accessibility-advocate-persona; observability NFR -> devops-engineer'
       : '- Loop 3 (Implementation): Based on task type\n       * Backend: backend-dev, researcher, devops\n       * Full-stack: backend-dev, react-frontend-engineer, devops\n       * Mobile: mobile-dev, backend-dev\n       * Security: security-specialist, backend-dev\n     - Loop 2 (Validation): Scale by complexity\n       * Simple: reviewer, tester\n       * Standard: +architect, +security-specialist\n       * Complex: +code-analyzer, +performance-benchmarker'}

  3. Test Cases (TDD Approach):
     ${SPA_FOUND === 3
       ? '- Red Phase: ONE test per SPEC edge case (EC-1..EC-N) + ONE per acceptance criterion (AC scenarios); no skipping\n     - Green Phase: implementations satisfying SPEC postconditions per PSEUDO operation\n     - Refactor Phase: address PSEUDO complexity flags (O(n^2)+, >3 I/O calls)'
       : '- Red Phase: Failure scenarios\n     - Green Phase: Minimal passing implementation\n     - Refactor Phase: Quality improvements'}

  4. Success Criteria:
     ${SPA_FOUND === 3
       ? '- Every SPEC FR has a passing test\n     - Every SPEC EC has a passing test (mandatory; no skipping)\n     - All NFRs measurably met (cite the threshold from SPEC)\n     - DRY audit honored: no NEW component duplicates an existing one'
       : '- Test coverage target (≥80%)\n     - Performance benchmarks (if applicable)\n     - Security requirements (if applicable)\n     - Deliverables list'}

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
[+ architect, security-specialist for standard/enterprise]

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
- Loop 3 Gate: ≥${mode === 'enterprise' ? 0.85 : mode === 'standard' ? 0.75 : 0.70}
- Loop 2 Consensus: ≥${mode === 'enterprise' ? 0.95 : mode === 'standard' ? 0.90 : 0.80}

### Deliverables
- [ ] All test cases passing
- [ ] Test coverage ≥80%
- [ ] Code complexity <15 per function
- [ ] Security review complete
- [ ] Documentation updated

### Performance Benchmarks (if applicable)
- [Benchmark 1]
- [Benchmark 2]

## Potential Blockers

**Technical:**
- [Potential blocker 1]
- [Mitigation strategy]

**Dependencies:**
- [External dependency 1]
- [Fallback plan]

## Iteration Strategy
- Max iterations: ${mode === 'enterprise' ? 15 : mode === 'standard' ? 10 : 5}
- Confidence threshold: ${mode === 'enterprise' ? 0.95 : mode === 'standard' ? 0.90 : 0.80}
- Adaptive agent spawning: YES

## Next Steps

1. Review this plan
2. Execute CFN Loop:
   \`\`\`bash
   /cfn-loop-cli "$ARGUMENTS" --mode=${mode}
   # OR for debugging:
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
console.log(`/cfn-loop-cli "$ARGUMENTS" --mode=${mode}`);
```

## Integration with CFN Loop

**Workflow:**
```
0a. /cfn-spa-plan "Task description"  (REQUIRED for non-trivial)
    ↓ Generates planning/SPEC_*.md, PSEUDO_*.md, ARCH_*.md
    ↓ Edge cases enumerated, branch coverage mapped, DRY audited

0b. /cfn-goap-plan  (optional, for complex multi-step goals)
    ↓ Models goal state, derives A* action sequence

1.  /write-plan "Task description" --mode=standard
    ↓ Auto-detects SPA bundle in planning/ and consumes it
    ↓ Generates planning/PLAN_task.md

2.  /cfn-plan-review  (data, APIs, shared state)
    ↓ Dependency trace, blast radius, gap analysis

3.  Human reviews plan (optional)
    ↓ Approve or request changes

4.  /cfn-loop-cli "Task description" --mode=standard
    ↓ Executes implementation following plan

5.  CFN Loop autonomously implements following TDD phases
    ↓ 3-strike failure → /cfn-goap-plan replan mode
```

## Mode Comparison

| Mode | Complexity | Agents | Test Coverage | Use Case |
|------|------------|--------|---------------|----------|
| MVP | Low | 3-4 total | ≥70% | Prototypes, proof-of-concept |
| Standard | Medium | 5-7 total | ≥80% | Production features |
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
/cfn-loop-cli "Implement JWT authentication" --mode=standard
```

## Best Practices

**When to Use:**
- ✅ Complex tasks (>3 steps)
- ✅ Security-critical features
- ✅ Team collaboration (plan review needed)
- ✅ Learning CFN Loop workflow

**When to Skip:**
- Simple bug fixes (go straight to /cfn-loop-cli)
- Urgent hotfixes (no time for planning)
- Well-understood patterns (agent knows what to do)

## Related Commands

- **Execute Plan**: `/cfn-loop-cli` (production) or `/cfn-loop-task` (debugging)
- **Document Results**: `/cfn-loop-document` (after completion)

---

**Version:** 2.0.0 (2025-10-31) - Integrated with CFN Loop v3 architecture
