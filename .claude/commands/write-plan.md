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
0. **GOAP goal modeling** (for non-trivial tasks): run `/cfn-goap-plan` first to define goal state, derive optimal action sequence via A*, surface assumptions. Skip only for single-file edits or obvious fixes.
1. Analyzes task complexity
2. Selects appropriate agents
3. Defines test cases and success criteria
4. Creates implementation roadmap
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

### Step 1: Analyze Task

```javascript
Task("planner", `
  ANALYZE TASK FOR CFN LOOP PLANNING

  Task: $ARGUMENTS
  Mode: ${mode}

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
       * Complex: +code-analyzer, +performance-benchmarker

  3. Test Cases (TDD Approach):
     - Red Phase: Failure scenarios
     - Green Phase: Minimal passing implementation
     - Refactor Phase: Quality improvements

  4. Success Criteria:
     - Test coverage target (≥80%)
     - Performance benchmarks (if applicable)
     - Security requirements (if applicable)
     - Deliverables list

  OUTPUT: planning/PLAN_${sanitize($ARGUMENTS)}.md
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
0. /cfn-goap-plan  (non-trivial tasks only)
   ↓ Models goal state, derives A* action sequence, surfaces assumptions

1. /write-plan "Task description" --mode=standard
   ↓ Generates planning/PLAN_task.md

2. /cfn-plan-review  (data, APIs, shared state)
   ↓ Dependency trace, blast radius, gap analysis

3. Human reviews plan (optional)
   ↓ Approve or request changes

4. /cfn-loop-cli "Task description" --mode=standard
   ↓ Executes implementation following plan

5. CFN Loop autonomously implements following TDD phases
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
