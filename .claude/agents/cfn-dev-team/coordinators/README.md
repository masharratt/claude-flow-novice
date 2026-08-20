# Coordinators

No coordinator agent profiles live in this directory. Coordination is done by the main chat (the orchestrator session), not by spawned coordinator agent profiles.

## Actual Entry Points

- **Orchestrator script (enhanced orchestrator v3.0):** `$HOME/.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh`
- **Task-mode flow:** see `.claude/CLAUDE.md`. Loop 3 executes and tests -> gate check -> Loop 2 validators -> Product Owner decision (PROCEED/ITERATE/ABORT) -> iterate or finish. Task mode agents return output directly; no Redis signaling.
- **Coordination patterns** (chain, broadcast, mesh, consensus collection): `.claude/skills/cfn-coordination/SKILL.md`

## Division of Labor

- Main chat spawns Loop 3 implementers and Loop 2 validators, runs full test suites, and passes captured test output files to validators.
- The product-owner profile (`.claude/agents/cfn-dev-team/product-owners/product-owner.md`) makes the PROCEED/ITERATE/ABORT decision from validator consensus and deliverable evidence.
- Agents never spawn other agents; only the coordinator (main chat) does.
