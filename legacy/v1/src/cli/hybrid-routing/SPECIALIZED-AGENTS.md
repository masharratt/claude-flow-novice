# Specialized Agent Spawning in Hybrid Routing

## Overview

The hybrid routing system now supports **specialized agent spawning** by loading agent definitions from `.claude/agents/` folder and intelligently matching them to tasks based on keywords.

## How It Works

### Phase 1: Agent Definition Loading

The system loads specialized agent profiles from:
- `.claude/agents/core-agents/coder.md`
- `.claude/agents/core-agents/architect.md`
- `.claude/agents/core-agents/tester.md`
- `.claude/agents/core-agents/reviewer.md`
- `.claude/agents/analysis/code-analyzer.md`
- `.claude/agents/security/security-specialist.md`
- `.claude/agents/core-agents/devops-engineer.md`

### Phase 2: Keyword-Based Matching

Each agent profile contains keywords in its `description` field:

```yaml
---
name: coder
description: |
  MUST BE USED when implementing features, writing production code...
  Keywords - implement, code, build, develop, create function...
---
```

The system:
1. Extracts keywords from each agent's description
2. Scores agents based on keyword matches with the task description
3. Selects top N agents with highest scores
4. Falls back to generic workers if no specialized match found

### Phase 3: Specialized System Prompts

When a specialized agent is matched:
- The agent's full profile content (from `.md` file) is used as the base system prompt
- Tool integration instructions are appended for bash execution, file operations
- Agent-specific subtasks are generated based on agent type

## Example Usage

```bash
# Architecture + implementation task
node src/cli/hybrid-routing/spawn-workers.js \
  "Design and implement authentication system" \
  --max-agents=3 \
  --provider=zai

# Output:
# 🎯 Specialized Agent Assignment:
#    Worker 1: architect - Design system architecture for: Design and implement authentication system
#    Worker 2: coder - Implement core functionality for: Design and implement authentication system
#    Worker 3: security-specialist - Perform security analysis for: Design and implement authentication system
```

## Agent-Specific Subtask Generation

| Agent Type | Subtask Template |
|-----------|------------------|
| **coder** | `Implement core functionality for: {task}` |
| **architect** | `Design system architecture for: {task}` |
| **tester** | `Create comprehensive tests for: {task}` |
| **security-specialist** | `Perform security analysis for: {task}` |
| **analyst** | `Analyze code quality and performance for: {task}` |
| **reviewer** | `Review implementation of: {task}` |
| **devops-engineer** | `Setup deployment and infrastructure for: {task}` |

## Fallback Behavior

If no specialized agents match or `.claude/agents/` is not found:
- Falls back to generic task decomposition
- Uses basic system prompts with tool integration
- Continues to work without interruption

## Benefits

✅ **Higher quality results**: Agents use specialized prompts optimized for their role
✅ **Better task distribution**: Tasks automatically routed to appropriate specialists
✅ **SQLite lifecycle compliance**: All specialized agents include proper lifecycle hooks
✅ **ACL enforcement**: Agents follow correct access control levels (ACL 1-5)
✅ **Error handling patterns**: Specialized agents include retry logic and graceful degradation
✅ **Post-edit validation**: Agents trigger appropriate validation hooks

## Cost Optimization

Specialized agents still use the same cost-optimized z.ai provider:
- Input: $0.50/1M tokens
- Output: $0.50/1M tokens
- Same 97% cost savings vs pure Claude

## Future Enhancements

- [ ] Dynamic agent loading from custom directories
- [ ] User-defined agent specializations
- [ ] Multi-round refinement with specialist handoffs
- [ ] Agent capability matrix for complex task routing
