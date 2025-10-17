# CFN Loop Mechanics Template

**Purpose:** Standardized CFN Loop coordination patterns for all CFN coordinators

## Loop Structure Overview

### Phases
- Loop 0: Epic/Sprint Orchestration
- Loop 1: Research & Discovery
- Loop 2: Consensus Validation
- Loop 3: Primary Swarm Implementation
- Loop 4: Product Owner Decision Gate

## Decision Framework

### Progression States
1. **PROCEED**:
   - Consensus ≥ threshold
   - All quality gates passed
   - Advance to next phase

2. **LOOP**:
   - Consensus < threshold
   - Fixable issues identified
   - Relaunch with targeted improvements

3. **DEFER**:
   - Out-of-scope items
   - Lower priority
   - Add to backlog, continue current phase

4. **ESCALATE**:
   - Critical blockers
   - Requires human intervention
   - Major architectural changes
   - Compliance/security risks

## Mode-Specific Thresholds

| Mode | Gate | Consensus | Validators | Max Iterations | Timeout |
|------|------|-----------|------------|---------------|---------|
| MVP | ≥0.65 | ≥0.85 | 2 | 5 | 15 min |
| Standard | ≥0.75 | ≥0.90 | 4 | 10 | 30 min |
| Enterprise | ≥0.85 | ≥0.95 | 5 | 15 | 60 min |

## Coordination Patterns

### Auto-Progression Rules
- Autonomous loop progression
- No human approval for iterations
- Immediate relaunch or escalation
- Return to chat ONLY for critical decisions

### Return-to-Chat Triggers
1. Human decision required
2. Sprint completion
3. Escalation scenarios

## Iteration Tracking
- Initialize iteration count in Redis
- Increment on each Loop 3 execution
- Auto-escalate at max iterations
- Persistent across loop cycles

## Key Principles
- Self-correcting autonomous cycles
- Minimal human intervention
- Rapid, iterative improvement
- Transparent decision framework
- Configurable complexity modes