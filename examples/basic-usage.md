# Basic Usage Examples

## Example 1: Research Project

```bash
# Initialize project
claude-flow-novice init research-project
cd research-project

# Create a research agent
claude-flow-novice agent create researcher "Research the latest trends in renewable energy"

# Check status
claude-flow-novice status

# Run the agent
claude-flow-novice run

# List all agents to see results
claude-flow-novice agent list
```

## Example 2: Code Development

```bash
# Initialize project
claude-flow-novice init my-app
cd my-app

# Create agents for different tasks
claude-flow-novice agent create planner "Plan a simple to-do app architecture"
claude-flow-novice agent create coder "Implement a basic to-do app in JavaScript"
claude-flow-novice agent create reviewer "Review the to-do app code for best practices"

# Run all agents
claude-flow-novice run
```

## Example 3: Content Creation

```bash
# Initialize project
claude-flow-novice init content-project
cd content-project

# Create research agent
claude-flow-novice agent create researcher "Research popular blog topics in tech"

# Run researcher first
claude-flow-novice run

# Create planner based on research
claude-flow-novice agent create planner "Create content calendar based on research findings"

# Run the planner
claude-flow-novice run
```

## Tips for Beginners

1. **Start Small**: Begin with one agent and simple tasks
2. **Be Specific**: Clear task descriptions lead to better results
3. **Check Progress**: Use `status` and `agent list` frequently
4. **Iterate**: Run agents one at a time to build on results
5. **Clean Up**: Remove agents you no longer need

## Common Workflows

### Planning → Implementation → Review
```bash
claude-flow-novice agent create planner "Plan X"
claude-flow-novice run

claude-flow-novice agent create coder "Implement X based on plan"
claude-flow-novice run

claude-flow-novice agent create reviewer "Review X implementation"
claude-flow-novice run
```

### Research → Analysis → Action
```bash
claude-flow-novice agent create researcher "Research Y topic"
claude-flow-novice run

claude-flow-novice agent create planner "Analyze research and create action plan"
claude-flow-novice run
```