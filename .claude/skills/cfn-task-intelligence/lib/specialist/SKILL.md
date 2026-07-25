# Specialist Injection Skill

## Purpose
Dynamically add specialist agents to existing Loop 3 team based on recurring feedback themes.

## Injection Strategies
- Preserve existing team composition
- Add specialists without removing current agents
- Match specialist to specific feedback themes

## Specialist Types
- Security Specialist
- Performance Engineer
- Testing Expert
- Architecture Consultant
- Domain-Specific Experts

## Usage
```bash
./recommend-specialist.sh \
  --current-loop3 "backend-dev,coder" \
  --feedback-themes "security,authentication,jwt" \
  --recurring-count 3
```

## Decision Criteria
1. Recurring feedback theme
2. Keyword matching
3. Iteration context
4. Existing team composition

## Output Components
- Specialist to add
- Reasoning for injection
- Updated agent list
- Context modification recommendations

## Best Practices
- Non-destructive team modification
- Transparent decision process
- Actionable recommendations