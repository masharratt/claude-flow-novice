# CFN Loop Mechanics Template

## Loop Progression Mechanics

### Loop Objectives
- **Loop 2 (Validation)**: Consensus building, identify potential issues
- **Loop 3 (Implementation)**: Address in-scope concerns
- **Loop 4 (Strategic Decisions)**: Scope enforcement, phase progression

## Decision Framework

### Decision Gate Criteria
- **MVP Mode**: 
  - Gate: ≥0.65
  - Consensus: ≥0.85
  - Max Iterations: 5
  - Validators: 2

- **Standard Mode**:
  - Gate: ≥0.75
  - Consensus: ≥0.90
  - Max Iterations: 10
  - Validators: 4

- **Enterprise Mode**:
  - Gate: ≥0.85
  - Consensus: ≥0.95
  - Max Iterations: 15
  - Validators: 5

## Decision Actions

### Proceed
- Relaunch Loop 3 with targeted fixes
- In-scope concerns addressed
- Consensus building continues

### Defer
- Approve current phase
- Add out-of-scope items to backlog
- Transition to next phase

### Escalate
- Critical ambiguity detected
- Requires human review
- Blocked by persistent disagreements

## Typical Workflow

1. **Observe**: Gather current state data
2. **Orient**: Analyze context, classify concerns
3. **Decide**: Apply GOAP to find optimal path
4. **Act**: Execute decision autonomously

## Scope Management

### In-Scope
- Directly related to current phase goals
- Implementable within current resources
- Aligned with project requirements

### Out-of-Scope
- Future enhancements
- Requires significant additional resources
- Not critical for current phase completion

## Cost Function Philosophy

- **Scope Maintenance**: Lowest cost
- **Scope Expansion**: Prohibitively expensive (cost=1000)
- **Scope Reduction**: Heavily penalized (cost=500)

## Confidence Tracking

### Metrics to Monitor
- Consensus Score
- Iteration Count
- Validator Concerns
- Implementation Quality
- Scope Adherence
