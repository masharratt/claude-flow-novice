# Epic Creator v2 (AISP Hybrid)

Generates structured epics with formal AISP (AI Symbolic Protocol) API contracts and natural language user content. Runs 11 persona reviews (simplifier, product owner, architect, security, backend, frontend, devops, tester, code standards, strategic alignment, final simplifier) to produce a validated epic with typed contracts, agent binding scores, and an evidence block.

**Modes:**
- Default: full persona review pipeline with non-blocking DevOps recommendations
- `--enforce-devops`: makes DevOps recommendations blocking (for production epics)
- `--mode=mvp`: reduced review pipeline for rapid prototyping

**Output:** JSON epic file containing natural language descriptions, AISP type/rule/function contracts, binding states between personas, and a quality evidence block. Use `--output=<path>` to specify the output location.

**Skill docs:** `.claude/skills/cfn-epic-creator-v2/SKILL.md`

## Examples

```bash
/epic-creator-v2 "Build a real-time collaboration platform with chat and video"

# Default: DevOps recommendations are non-blocking
/epic-creator-v2 "Implement user authentication system"

# Make DevOps mandatory for production
/epic-creator-v2 "Create payment processing system" --enforce-devops

# MVP mode for rapid prototyping
/epic-creator-v2 "Build customer dashboard prototype" --mode=mvp --output=planning/dashboard-epic.json
```