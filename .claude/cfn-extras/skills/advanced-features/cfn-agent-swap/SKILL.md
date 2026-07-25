# Agent Swap Mechanism Skill

## Purpose
Recommend agent replacement strategies when performance issues are detected in CFN Loops.

## Replacement Rules
1. Identify lowest-performing agent
2. Match replacement based on feedback themes
   - Security feedback → security-specialist
   - Performance feedback → performance-engineer
   - Testing feedback → tester
   - Architecture feedback → architect

## Replacement Strategies
- Complete agent replacement
- Adding specialist alongside existing agents
- Prioritize maintaining existing team composition

## Usage
```bash
./recommend-swap.sh \
  --loop3-agents "backend-dev,coder" \
  --loop3-confidences "0.82,0.70" \
  --feedback-themes "security,error-handling"
```

## Output Details
- Agent to remove
- Reasoning for removal
- Recommended replacement agent
- Updated agent configuration

## Implementation Considerations
- Stateless design
- Minimal side effects
- Clear, reproducible recommendations