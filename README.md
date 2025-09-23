# Claude Flow Novice 🚀

**Simplified AI Agent Orchestration for Beginners**

A beginner-friendly version of Claude Flow that makes AI agent coordination easy to learn and use.

## 🎯 What is Claude Flow Novice?

Claude Flow Novice is a simplified version of the powerful Claude Flow framework, designed specifically for developers who are new to AI agent orchestration. It provides:

- **Simple Setup** - Get started in minutes
- **Easy Commands** - Intuitive CLI interface
- **Clear Examples** - Learn by doing
- **Basic Agents** - Essential agent types only
- **Good Documentation** - Step-by-step guides

## 🚀 Quick Start

### Installation

```bash
npm install -g claude-flow-novice
```

### Your First Agent

```bash
# Initialize a new project
claude-flow-novice init my-project

# Create a simple agent
claude-flow-novice agent create researcher "Research the latest AI trends"

# Run the agent
claude-flow-novice run
```

## 📚 Core Concepts

### Agents
Think of agents as specialized AI workers:
- **Researcher** - Gathers information
- **Coder** - Writes code
- **Reviewer** - Checks quality
- **Planner** - Organizes tasks

### Simple Workflow
1. **Create** agents for your task
2. **Configure** what they should do
3. **Run** them and get results

## 🛠️ Available Commands

```bash
# Project management
claude-flow-novice init <project-name>    # Create new project
claude-flow-novice status                 # Check project status

# Agent management
claude-flow-novice agent create <type> <task>     # Create agent
claude-flow-novice agent list                     # List agents
claude-flow-novice agent remove <id>              # Remove agent

# Execution
claude-flow-novice run                    # Run all agents
claude-flow-novice run <agent-id>         # Run specific agent
```

## 📖 Examples

### Example 1: Research Project
```bash
claude-flow-novice init research-project
cd research-project
claude-flow-novice agent create researcher "Research renewable energy trends"
claude-flow-novice run
```

### Example 2: Code Review
```bash
claude-flow-novice agent create reviewer "Review my JavaScript code for best practices"
claude-flow-novice run
```

## 🎓 Learning Path

1. **Start Here**: Run the quick start example
2. **Try Examples**: Experiment with different agent types
3. **Read Guides**: Check out our step-by-step tutorials
4. **Build Projects**: Create your own agent workflows
5. **Level Up**: Graduate to full Claude Flow when ready

## 🔗 Next Steps

Ready for more advanced features? Check out:
- [Full Claude Flow](https://github.com/ruvnet/claude-flow) - Enterprise features
- [Documentation](./docs) - Detailed guides
- [Examples](./examples) - More complex workflows

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Made with ❤️ for AI beginners**