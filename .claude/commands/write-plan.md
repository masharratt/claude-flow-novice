# Write Plan Command

## Overview
The `write-plan` command helps create structured, test-driven implementation plans for claude-flow-novice projects, leveraging our CFN Loop workflow and adaptive context strategies.

## Core Principles

### 1. Test-Driven Development (TDD)
- Always start with failure scenarios (Red phase)
- Implement minimal code to pass tests (Green phase)
- Refactor for quality and maintainability (Refactor phase)

### 2. CFN Loop Integration
Utilize the CFN Loop workflow for complex implementations:
- **Loop 3 (Implementation)**: Create detailed implementation plan
- **Loop 2 (Validation)**: Comprehensive test and review
- **Product Owner Decision**: Strategic go/no-go checkpoint

## Plan Structure Template

```markdown
# [Feature/Task Name]

## Objectives
- Clear, measurable implementation goals
- Specific deliverables

## Context Injection
- Epic Context
- Sprint Context
- Specific Deliverables

## Coordination Strategy
- Coordinator: `cost-savings-cfn-loop-coordinator`
- Agents: Specify roles (backend-dev, researcher, etc.)
- Iteration Strategy

## Phase 1: Test and Specification
### Deliverables
- [ ] Test script (tests/test-[feature].sh)
- [ ] Specification document

### Test Cases
- Failure scenarios
- Edge cases
- Performance expectations

## Phase 2: Minimal Implementation
### Deliverables
- [ ] Minimal working implementation
- [ ] Initial test coverage

## Phase 3: Refactoring and Optimization
### Deliverables
- [ ] Improved code quality
- [ ] Enhanced test coverage
- [ ] Performance optimization

## Redis Coordination Checkpoints
- Entry point validation
- Iteration confidence reporting
- Context extraction verification

## Success Criteria
- Test coverage ≥ 90%
- Complexity score < 15
- Meets architectural guidelines

## Potential Blockers
- Identify potential implementation challenges
- Pre-emptive mitigation strategies

## Iteration Strategy
- Maximum iterations: 10
- Confidence threshold: ≥ 0.90
- Adaptive agent spawning based on feedback
```

## Usage Guidelines

### Spawning Plan Creation
```bash
/write-plan "Implement JWT Authentication" \
  --epic-context '{"goal":"Secure API access"}' \
  --sprint-context '{"sprint":"Authentication MVP"}' \
  --agents "backend-dev,security-specialist"
```

### Example Workflow
1. Generate initial plan
2. Review with team via Redis pub/sub
3. Refine plan based on feedback
4. Execute using `cost-savings-cfn-loop-coordinator`

## Best Practices
- Keep tasks small and focused
- Prioritize testability
- Leverage adaptive context injection
- Use explicit deliverable tracking

## Notes
- This is a living document
- Continuously update based on team feedback
- Align with claude-flow-novice adaptive context strategies