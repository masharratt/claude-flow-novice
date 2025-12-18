# CFN Coordination and Namespace Guide

## Coordination Patterns and Namespace Isolation

- Coordination patterns: see `.claude/skills/cfn-coordination/SKILL.md` (chain, broadcast, mesh, consensus collection).
- Namespace structure: agents `.claude/agents/cfn-dev-team/`; skills `.claude/skills/cfn-*/`; hooks `.claude/hooks/cfn-*`; commands `.claude/commands/cfn/`.
- Enhanced orchestrator v3.0: `./.claude/skills/cfn-loop-orchestration/orchestrate.sh`
- Orchestration flow: Loop 3 executes and tests -> gate check -> Loop 2 validators -> Product Owner decision (PROCEED/ITERATE/ABORT) -> iterate or finish.
- Task mode agents: return output directly; no Redis signaling.

### Coordination Anti-Patterns (avoid)

- Skipping gate check before spawning Loop 2.
- Validators reviewing without tests/logs.
- Product Owner decision without deliverable paths.
- Mixing service and container names inside Docker networks.
- Manual cleanup instead of orchestrator controls.
