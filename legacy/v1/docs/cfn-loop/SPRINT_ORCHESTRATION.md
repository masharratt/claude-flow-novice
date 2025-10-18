# Sprint Orchestration Guide

## Overview: Two-Tier Phase/Sprint System

The CFN Loop now supports a **two-tier orchestration system** for managing complex projects with multiple deliverables.

### Architecture

**Tier 1: Phases** - High-level milestones (e.g., "Authentication System")
- Composed of multiple sprints
- Epic-level coordination across 3-5 phases
- Progress tracked at phase level
- Automatic rollup of sprint completion

**Tier 2: Sprints** - Focused deliverables within a phase (e.g., "JWT Token Generation")
- 1-3 day execution cycles
- Self-contained CFN loop per sprint
- Each sprint runs full 3-loop validation
- Maximum 10 iterations (Loop 2) per sprint

---

## Slash Commands

### `/cfn-loop` - Single Phase Execution (Original)

Execute a single-phase CFN loop with automatic retry and consensus validation.

```bash
/cfn-loop "Implement JWT authentication" --phase=auth --max-loop2=10 --max-loop3=10
```

**Parameters**:
- `--phase=<name>`: Phase identifier (default: "default")
- `--max-loop2=<N>`: Maximum Loop 2 iterations (self-validation, default: 10)
- `--max-loop3=<N>`: Maximum Loop 3 iterations (consensus, default: 10)

**Use Cases**:
- Single-feature implementation
- Isolated bug fixes
- Individual component development
- Quick iterations

---

### `/cfn-loop-sprints` - Multi-Sprint Phase Execution (NEW)

Execute multiple sprints sequentially within a single phase.

```bash
/cfn-loop-sprints "Authentication System" --sprints=3 --max-loop2=10
```

**Parameters**:
- `--sprints=<N>`: Number of sprints to execute (1-5 recommended)
- `--max-loop2=<N>`: Maximum iterations per sprint (default: 10)

**Execution Flow**:
```
PHASE: Authentication System
├── Sprint 1: JWT Token Generation
│   ├── Loop 3: Primary swarm (3 agents)
│   ├── Loop 2: Consensus validation (4 validators)
│   └── Iteration 1-10 (self-correcting)
├── Sprint 2: Password Hashing
│   ├── Loop 3: Primary swarm (3 agents)
│   ├── Loop 2: Consensus validation (4 validators)
│   └── Iteration 1-10 (self-correcting)
└── Sprint 3: Auth Middleware
    ├── Loop 3: Primary swarm (3 agents)
    ├── Loop 2: Consensus validation (4 validators)
    └── Iteration 1-10 (self-correcting)
```

**Memory Namespace**:
```
cfn-loop/phase-auth/sprint-1/iteration-0
cfn-loop/phase-auth/sprint-2/iteration-0
cfn-loop/phase-auth/sprint-3/iteration-0
```

**Use Cases**:
- Feature decomposition (e.g., Auth = Token + Hash + Middleware)
- Progressive implementation
- Iterative development within a phase
- Clear checkpoint management

---

### `/cfn-loop-epic` - Multi-Phase Epic Execution (NEW)

Execute a complete epic with multiple phases, each containing multiple sprints.

```bash
/cfn-loop-epic "Complete User Management System" --phases=4 --max-loop2=10
```

**Parameters**:
- `--phases=<N>`: Number of phases in the epic (2-5 recommended)
- `--max-loop2=<N>`: Maximum iterations per sprint (default: 10)

**Epic Structure Example**:
```
EPIC: User Management System
├── PHASE 1: Authentication (3 sprints)
│   ├── Sprint 1.1: JWT Token Generation → CFN Loop (10 iterations)
│   ├── Sprint 1.2: Password Hashing → CFN Loop (10 iterations)
│   └── Sprint 1.3: Auth Middleware → CFN Loop (10 iterations)
├── PHASE 2: Authorization (2 sprints)
│   ├── Sprint 2.1: Role-Based Access → CFN Loop (10 iterations)
│   └── Sprint 2.2: Permission System → CFN Loop (10 iterations)
├── PHASE 3: User Profile (2 sprints)
│   ├── Sprint 3.1: Profile CRUD → CFN Loop (10 iterations)
│   └── Sprint 3.2: Avatar Upload → CFN Loop (10 iterations)
└── PHASE 4: Integration Tests (1 sprint)
    └── Sprint 4.1: End-to-End Tests → CFN Loop (10 iterations)
```

**Memory Namespace**:
```
cfn-loop/epic-user-mgmt/phase-1/sprint-1/iteration-0
cfn-loop/epic-user-mgmt/phase-1/sprint-2/iteration-0
cfn-loop/epic-user-mgmt/phase-2/sprint-1/iteration-0
...
```

**Use Cases**:
- Complete system implementation
- Multi-week development cycles
- Complex feature sets
- Enterprise-scale projects

---

## Iteration Limits

### Updated Loop 2 Limits (Self-Validation)

**Previous**: 3 iterations maximum
**Current**: **10 iterations maximum** (updated 2025-10-03)

**Rationale**:
- Allows more sophisticated self-correction with feedback
- Supports complex enterprise scenarios
- Matches Loop 3 iteration limits for consistency
- Total maximum: 10 × 10 = 100 potential iterations

**Impact**:
- More robust autonomous retry behavior
- Better handling of complex validation scenarios
- Reduced escalation to human intervention
- Supports longer validation cycles for complex features

### Loop 3 Limits (Consensus Validation)

**Maximum**: 10 iterations (unchanged)

**Total Capacity**:
- Loop 2: 10 iterations (self-validation)
- Loop 3: 10 iterations (consensus)
- **Combined**: 100 total iterations per sprint/phase

---

## Sprint Planning Guidelines

### Sprint Sizing

**Small Sprint** (1 day):
- Single component implementation
- 1-2 files modified
- 50-200 lines of code
- Example: JWT token generation utility

**Medium Sprint** (2 days):
- Multi-file feature
- 3-5 files modified
- 200-500 lines of code
- Example: Complete password hashing system

**Large Sprint** (3 days):
- Complex integration
- 6-10 files modified
- 500-1000 lines of code
- Example: Full authentication middleware stack

### Sprints per Phase

**Recommended**:
- **Simple Phase**: 1-2 sprints
- **Medium Phase**: 2-3 sprints
- **Complex Phase**: 3-5 sprints

**Maximum**: 5 sprints per phase (beyond this, consider splitting into multiple phases)

### Phases per Epic

**Recommended**:
- **Small Epic**: 2-3 phases (1-2 weeks)
- **Medium Epic**: 3-4 phases (2-3 weeks)
- **Large Epic**: 4-5 phases (3-4 weeks)

**Maximum**: 5 phases per epic (beyond this, consider splitting into multiple epics)

---

## Memory Management

### Namespace Hierarchy

```
cfn-loop/
├── epic-{epic-id}/
│   ├── phase-1/
│   │   ├── sprint-1/
│   │   │   ├── iteration-0/
│   │   │   ├── iteration-1/
│   │   │   └── iteration-N/
│   │   ├── sprint-2/
│   │   │   └── iteration-*/
│   │   └── sprint-N/
│   │       └── iteration-*/
│   ├── phase-2/
│   │   └── sprint-*/iteration-*/
│   └── phase-N/
│       └── sprint-*/iteration-*/
```

### Memory Key Patterns

**Sprint Results**:
```javascript
await memory.store(`cfn-loop/epic-user-mgmt/phase-1/sprint-1/result`, {
  status: 'complete',
  confidence: 0.92,
  consensusScore: 0.95,
  deliverables: ['jwt-handler.js', 'jwt-handler.test.js']
});
```

**Phase Completion**:
```javascript
await memory.store(`cfn-loop/epic-user-mgmt/phase-1/completion`, {
  totalSprints: 3,
  completedSprints: 3,
  averageConfidence: 0.91,
  status: 'complete'
});
```

**Epic Progress**:
```javascript
await memory.store(`cfn-loop/epic-user-mgmt/progress`, {
  totalPhases: 4,
  completedPhases: 2,
  currentPhase: 3,
  overallCompletion: 0.50
});
```

---

## Usage Examples

### Example 1: Simple Authentication Feature

```bash
# Single-phase approach
/cfn-loop "Implement JWT authentication" --phase=auth --max-loop2=10 --max-loop3=10

# Execution:
# - Initialize swarm (3 agents)
# - Implement JWT handler
# - Run post-edit hooks
# - Self-validation (Loop 2: max 10 iterations)
# - Consensus validation (Loop 3: max 10 iterations)
# - Store results
```

### Example 2: Complex Authentication System

```bash
# Multi-sprint approach
/cfn-loop-sprints "Complete Authentication System" --sprints=4 --max-loop2=10

# Execution:
# Sprint 1: JWT Token Generation
#   - Loop 3: Primary swarm → Self-validation → Consensus (max 10 iterations)
# Sprint 2: Password Hashing
#   - Loop 3: Primary swarm → Self-validation → Consensus (max 10 iterations)
# Sprint 3: Auth Middleware
#   - Loop 3: Primary swarm → Self-validation → Consensus (max 10 iterations)
# Sprint 4: Session Management
#   - Loop 3: Primary swarm → Self-validation → Consensus (max 10 iterations)
```

### Example 3: Enterprise User Management

```bash
# Epic approach
/cfn-loop-epic "Complete User Management Platform" --phases=5 --max-loop2=10

# Execution:
# PHASE 1: Authentication (3 sprints)
#   - Sprint 1.1: JWT Token → CFN Loop
#   - Sprint 1.2: Password Hash → CFN Loop
#   - Sprint 1.3: Auth Middleware → CFN Loop
# PHASE 2: Authorization (2 sprints)
#   - Sprint 2.1: RBAC → CFN Loop
#   - Sprint 2.2: Permissions → CFN Loop
# PHASE 3: User Profile (2 sprints)
#   - Sprint 3.1: CRUD → CFN Loop
#   - Sprint 3.2: Avatar → CFN Loop
# PHASE 4: Admin Panel (2 sprints)
#   - Sprint 4.1: User Management → CFN Loop
#   - Sprint 4.2: Analytics → CFN Loop
# PHASE 5: Integration (1 sprint)
#   - Sprint 5.1: E2E Tests → CFN Loop
```

---

## Best Practices

### When to Use Single-Phase CFN Loop

- Quick bug fixes
- Single-component features
- Isolated functionality
- Rapid prototyping
- Simple integrations

### When to Use Multi-Sprint Phases

- Complex features requiring breakdown
- Features with clear sub-deliverables
- Progressive implementation needed
- Team coordination required
- Clear checkpoint management desired

### When to Use Epic Orchestration

- Complete system implementation
- Multi-week development cycles
- Enterprise-scale projects
- Cross-team coordination
- Full product releases

---

## Monitoring and Progress Tracking

### Sprint-Level Metrics

```javascript
{
  "sprint": "1.1",
  "phase": "authentication",
  "epic": "user-mgmt",
  "status": "complete",
  "iterations": {
    "loop2": 3,
    "loop3": 1
  },
  "confidence": 0.92,
  "consensusScore": 0.95,
  "duration": "2h 15m"
}
```

### Phase-Level Metrics

```javascript
{
  "phase": "1",
  "epic": "user-mgmt",
  "totalSprints": 3,
  "completedSprints": 3,
  "averageConfidence": 0.91,
  "averageConsensus": 0.93,
  "totalDuration": "6h 45m"
}
```

### Epic-Level Metrics

```javascript
{
  "epic": "user-mgmt",
  "totalPhases": 4,
  "completedPhases": 2,
  "currentPhase": 3,
  "overallCompletion": 0.50,
  "estimatedTimeRemaining": "1 week 2 days"
}
```

---

## Troubleshooting

### Sprint Fails to Complete

**Symptom**: Sprint exceeds 10 iterations without consensus

**Solutions**:
1. Break sprint into smaller sub-sprints
2. Review validator feedback for contradictions
3. Clarify requirements before retry
4. Increase agent count for complex tasks

### Phase Takes Too Long

**Symptom**: Phase duration exceeds estimates

**Solutions**:
1. Reduce number of sprints per phase
2. Simplify sprint scope
3. Increase parallel agent execution
4. Review iteration efficiency

### Epic Stalls Mid-Execution

**Symptom**: Epic stops progressing through phases

**Solutions**:
1. Review phase dependencies
2. Check for blocking issues in completed phases
3. Validate memory namespace consistency
4. Manual intervention for edge cases

---

## Version History

- **v1.6.0** (2025-10-03): Initial sprint/phase/epic orchestration system
- Loop 2 iteration limit increased from 3 to 10
- New slash commands: `/cfn-loop-sprints`, `/cfn-loop-epic`
- Memory namespace hierarchy for sprints/phases
- Comprehensive documentation and examples

---

**Documentation Version**: 1.0.0
**Last Updated**: 2025-10-03
**Compatible With**: Claude Flow Novice v1.6.0+
