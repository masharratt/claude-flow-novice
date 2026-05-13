# Coordinators

Agent profiles for coordination and orchestration of multi-agent workflows.

## Active Agents (5)

**CFN Loop Coordinators:**
- `cfn-v3-coordinator.md` - CFN v3 dual-mode coordinator with task analysis and configuration
- `multi-sprint-coordinator.md` - Epic and sprint management for multi-phase projects
- `product-owner.md` - Product owner agent for CFN Loop strategic decisions

**Strategic Coordinators:**
- `cto-agent.md` - CTO-level strategic coordination and architecture decisions
- `product-owner-agent.md` - Product owner team member for requirements and validation

## Purpose

Coordinators spawn and manage other agents using CLI spawning patterns:
```bash
npx claude-flow-novice agent-spawn [agent-name] --task-id "$TASK_ID"
```

They handle:
- Multi-agent workflow orchestration
- Redis-based coordination and consensus collection
- CFN Loop iteration management
- Strategic decision-making
- Cross-team communication

## Usage Pattern

Main Chat spawns ONLY the coordinator:
```javascript
Task("cfn-v3-coordinator", "Execute CFN Loop for: [task]")
```

Coordinator handles all agent spawning internally via orchestration scripts.

## Related Skills
- `.claude/skills/cfn-loop-validation/` - CFN Loop mechanics
- `.claude/skills/cfn-agent-spawning/` - CLI spawning patterns
