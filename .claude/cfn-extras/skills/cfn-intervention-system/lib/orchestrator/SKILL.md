# Intervention Orchestrator Skill

## Purpose
Coordinate and execute intervention strategies during CFN Loop execution.

## Intervention Types
1. Agent Swap
2. Specialist Injection
3. Scope Simplification

## Workflow
1. Receive intervention trigger
2. Analyze current loop context
3. Select appropriate intervention strategy
4. Generate actionable recommendations
5. Prepare configuration for next iteration

## Usage
```bash
./execute-intervention.sh \
  --trigger "confidence_plateau" \
  --iteration 3 \
  --loop3-agents "backend-dev,coder" \
  --feedback-themes "security"
```

## Output Components
- Intervention type
- Updated agent configuration
- Context injection guidance
- Expected improvement projection

## Decision Flow
- Validate intervention trigger
- Consult specialized skills (swap, injection, simplifier)
- Generate holistic intervention strategy
- Minimize disruptive changes

## Best Practices
- Transparent decision process
- Minimal side effects
- Continuous improvement focus
- Preserve team cohesion