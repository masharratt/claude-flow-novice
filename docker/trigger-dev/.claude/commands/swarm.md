---
description: "AI swarm management and coordination"
argument-hint: "<action> [parameters]"
allowed-tools: ["mcp__claude-flow-novice__swarm_init", "mcp__claude-flow-novice__agent_spawn", "mcp__claude-flow-novice__task_orchestrate"]
---

# AI Swarm Management

Execute AI swarm coordination and management tasks.

**Command**: $ARGUMENTS

**Available Actions**:
- `init <topology> <count>` - Initialize swarm (mesh, hierarchical, ring, star)
- `status` - Show swarm status and health
- `spawn <type>` - Create specialized agent (researcher, coder, analyst, etc.)
- `orchestrate "<task>"` - Coordinate task across swarm
- `scale <count>` - Scale swarm to specified agent count
- `destroy` - Gracefully shutdown swarm

**Swarm Coordination**:
Use the claude-flow-novice MCP tools to coordinate AI agent swarms for complex task execution. The swarm system supports multiple topologies and can auto-scale based on workload.

Execute the requested swarm action and provide status updates on coordination progress.