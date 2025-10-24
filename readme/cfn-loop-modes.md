# CFN Loop Modes (v2)

## Mode Comparison Overview

| Mode       | Description | Gate Threshold | Consensus Threshold | Max Iterations | Ideal Use Case | Validators |
|------------|-------------|----------------|---------------------|----------------|----------------|------------|
| MVP        | Rapid Prototyping | ≥0.65 | ≥0.85 | 5 | Proof of Concept | 2 |
| Standard   | Production Features | ≥0.75 | ≥0.90 | 10 | General Development | 4 |
| Enterprise | Mission-Critical Systems | ≥0.85 | ≥0.95 | 15 | High-Stakes Projects | 5 |

## Detailed Mode Breakdown

### MVP Mode
- **Purpose**: Fast iteration, rapid prototyping
- **Gate Threshold**: 0.65 (lower confidence acceptance)
- **Consensus Threshold**: 0.85
- **Max Iterations**: 5
- **Recommended For**:
  - Proof of Concept
  - Quick experiments
  - Initial feature validation
- **Trade-offs**: 
  - Speed over thoroughness
  - Acceptable quality, not production-grade

### Standard Mode
- **Purpose**: Balanced development workflow
- **Gate Threshold**: 0.75 (solid confidence)
- **Consensus Threshold**: 0.90
- **Max Iterations**: 10
- **Recommended For**:
  - Most production features
  - Standard enterprise applications
  - Well-defined project scopes
- **Trade-offs**:
  - Good balance of speed and quality
  - Comprehensive validation
  - Suitable for most use cases

### Enterprise Mode
- **Purpose**: Mission-critical, high-stakes systems
- **Gate Threshold**: 0.85 (very high confidence)
- **Consensus Threshold**: 0.95
- **Max Iterations**: 15
- **Recommended For**:
  - Financial systems
  - Healthcare applications
  - Aerospace and defense
  - Regulatory compliance projects
- **Trade-offs**:
  - Highest quality bar
  - Most comprehensive validation
  - Slower iteration
  - Maximum confidence required

## Orchestration Configuration

### Basic Mode Selection

```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "project-task" \
  --mode standard \  # Can be: mvp, standard, enterprise
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --max-iterations 10
```

**Note:** Context injection in v3 does not change thresholds. Modes define gate/consensus requirements; context storage/retrieval is orthogonal.

## Performance Impact

### Resource Usage Comparison
- **MVP**: Lowest computational overhead
  - Minimal agent iterations
  - Quick consensus collection
  - Low validation complexity

- **Standard**: Balanced computational investment
  - Moderate agent iterations
  - Comprehensive validation
  - Reasonable resource allocation

- **Enterprise**: Highest computational investment
  - Maximum agent iterations
  - Most thorough validation
  - Complex consensus mechanisms

## Adaptive Mode Selection

### Recommendation Algorithm
1. Assess project complexity
2. Evaluate risk tolerance
3. Consider regulatory requirements
4. Match mode to project characteristics

**Example Decision Matrix:**
```
Project Complexity → Low   Medium   High
Risk Tolerance     ↓
Low                 MVP    Standard Enterprise
Medium             Standard Enterprise Enterprise
High               Enterprise Enterprise Enterprise
```

## Best Practices

### Mode Selection Guidelines
- Start with Standard mode for most projects
- Use MVP for quick prototypes
- Choose Enterprise for high-stakes systems
- Can switch modes mid-project if needed

### Transition Between Modes
```bash
# Dynamically update mode mid-execution
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --mode-transition \
  --from standard \
  --to enterprise \
  --task-id "project-task"
```

## Monitoring and Metrics

### Mode Performance Tracking
- Track gate and consensus thresholds
- Monitor iteration counts
- Collect confidence scores
- Generate performance reports

## V3 Mode Execution

Modes in v3 operate identically to v2, with updated orchestrator:

```bash
# MVP Mode (v3)
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "mvp-task" \
  --mode mvp

# Standard Mode (v3)
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "standard-task" \
  --mode standard

# Enterprise Mode (v3)
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "enterprise-task" \
  --mode enterprise
```

Context injection (Redis storage/retrieval) is automatic in all modes.

## References
- CFN Loop Orchestration: `.claude/skills/cfn-loop-orchestration/SKILL.md`
- Redis Coordination: `.claude/skills/redis-coordination/SKILL.md`
- CFN Loop Validation: `.claude/skills/cfn-loop-validation/SKILL.md`
