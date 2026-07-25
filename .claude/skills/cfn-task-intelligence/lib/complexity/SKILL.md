# Task Complexity Estimator

**Version:** 1.0.0
**Purpose:** Estimate task complexity and predict iteration requirements for CFN v3

## Overview

Analyzes task description to estimate:
- Complexity level (low, medium, high)
- Estimated iterations (2-7 range)
- Confidence in estimate

## Complexity Factors

### Factor 1: Step Count
- Count distinct action verbs
- Count deliverable files mentioned
- Count integration points

### Factor 2: Security/Compliance
- Security keywords → +1 complexity
- Compliance requirements → +1 complexity
- Authentication/authorization → +1 complexity

### Factor 3: Scope
- Single file → low
- Multiple files (2-5) → medium
- System-wide (>5 files) → high

### Factor 4: Dependencies
- External APIs → +1 complexity
- Database changes → +1 complexity
- Multiple services → +1 complexity

### Factor 5: Technology Stack
- Familiar tech → -1 complexity
- New/unfamiliar tech → +1 complexity
- Cutting-edge/experimental → +2 complexity

## Estimation Formula

```
Base Iterations = 2

+ Step Count / 3
+ Security factor (0-2)
+ Scope factor (0-3)
+ Dependencies factor (0-3)
+ Tech stack factor (-1 to +2)

Capped at: 7 iterations (high complexity max)
```

## Complexity Mapping

| Total Score | Complexity | Estimated Iterations |
|-------------|------------|---------------------|
| 0-2 | Low | 2 |
| 3-4 | Medium | 3-4 |
| 5+ | High | 5-7 |

## Usage

```bash
ESTIMATE=$(./.claude/skills/complexity-estimator/estimate-complexity.sh \
  --task-type "software-development" \
  --description "Implement JWT authentication with refresh tokens and RBAC")

echo "$ESTIMATE" | jq '.complexity'           # "high"
echo "$ESTIMATE" | jq '.estimated_iterations' # 5
echo "$ESTIMATE" | jq '.confidence'           # 0.75
```

## Output Format

```json
{
  "complexity": "low|medium|high",
  "estimated_iterations": 2-7,
  "confidence": 0.0-1.0,
  "factors": {
    "step_count": 2,
    "security": 1,
    "scope": 2,
    "dependencies": 1,
    "tech_stack": 0
  },
  "reasoning": "High complexity due to security requirements (JWT, RBAC), multiple integration points, and estimated 6+ file changes."
}
```

## Integration

Used by:
- `.claude/agents/cfn-v3-coordinator.md` - Set max_iterations, estimated_iterations
- Playbook system - Store complexity patterns