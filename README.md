# Claude Flow Novice 🚀

**AI Agent Orchestration Made Simple for Beginners**

A beginner-friendly version of Claude Flow that makes AI agent coordination easy to learn and use.

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/masharratt/claude-flow-novice?style=for-the-badge&logo=github&color=gold)](https://github.com/masharratt/claude-flow-novice)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&logo=opensourceinitiative)](https://opensource.org/licenses/MIT)
[![Beginner Friendly](https://img.shields.io/badge/Beginner-Friendly-green?style=for-the-badge&logo=education)](https://github.com/masharratt/claude-flow-novice)

</div>

---

## 🎯 What is Claude Flow Novice?

Claude Flow Novice is a simplified version of the powerful Claude Flow framework, designed specifically for developers who are new to AI agent orchestration.

### Why Choose Novice?
- ✅ **Simple Setup** - Get started in minutes, not hours
- ✅ **4 Essential Agents** - Just what you need to learn: researcher, coder, reviewer, planner
- ✅ **Easy Commands** - Intuitive CLI that makes sense
- ✅ **Clear Examples** - Learn by doing with real examples
- ✅ **Great Documentation** - Step-by-step guides written for beginners
- ✅ **No Overwhelm** - Focus on learning without 50+ agent types

## 🚀 Quick Start

### Installation

```bash
npm install -g claude-flow-novice
```

### Your First AI Agent in 3 Steps

```bash
# 1. Create a new project
claude-flow-novice init my-first-project
cd my-first-project

# 2. Create your first agent
claude-flow-novice agent create researcher "Research the latest trends in renewable energy"

# 3. Run it and see the magic!
claude-flow-novice run
```

That's it! Your AI agent will research renewable energy trends and provide you with a detailed report.

## 📚 Core Concepts

### 🤖 The 4 Essential Agents

Think of agents as specialized AI workers, each with their own expertise:

| Agent | What It Does | Example Use |
|-------|--------------|-------------|
| **🔍 Researcher** | Gathers information and analyzes data | "Research mobile app trends for 2024" |
| **💻 Coder** | Writes and implements code | "Create a simple to-do app in JavaScript" |
| **👀 Reviewer** | Checks quality and provides feedback | "Review my React code for best practices" |
| **📋 Planner** | Organizes tasks and creates strategies | "Plan the architecture for an e-commerce site" |

### 🎯 Simple Workflow

1. **Initialize** a project (once per project)
2. **Create** agents for your specific tasks
3. **Run** them and get results
4. **Build** on the results with more agents

## 🛠️ All Commands

```bash
# Project Management
claude-flow-novice init <project-name>    # Create new project
claude-flow-novice status                 # Check project status

# Agent Management
claude-flow-novice agent create <type> "<task>"    # Create agent
claude-flow-novice agent list                      # List all agents
claude-flow-novice agent remove <id>               # Remove agent

# Running Agents
claude-flow-novice run                    # Run all pending agents
claude-flow-novice run <agent-id>         # Run specific agent

# Help & Learning
claude-flow-novice help-guide            # Show beginner guide
claude-flow-novice --help               # Show all commands
```

## 📖 Learning Examples

### Example 1: Research Project
```bash
claude-flow-novice init research-project
cd research-project
claude-flow-novice agent create researcher "Research the benefits of TypeScript over JavaScript"
claude-flow-novice run
```

### Example 2: Code Development Workflow
```bash
claude-flow-novice init todo-app
cd todo-app

# Plan the project
claude-flow-novice agent create planner "Plan a simple to-do app with React"
claude-flow-novice run

# Implement the code
claude-flow-novice agent create coder "Build the to-do app based on the plan"
claude-flow-novice run

# Review the implementation
claude-flow-novice agent create reviewer "Review the to-do app code for improvements"
claude-flow-novice run
```

### Example 3: Learning New Technology
```bash
claude-flow-novice init learning-docker
cd learning-docker

claude-flow-novice agent create researcher "Research Docker basics and use cases"
claude-flow-novice agent create planner "Create a learning path for Docker"
claude-flow-novice run
```

## 🎓 Learning Path

### Level 1: Beginner (Start Here!)
1. **Complete the Quick Start** above
2. **Try each agent type** with simple tasks
3. **Read agent results** and understand what they do

### Level 2: Getting Comfortable
1. **Combine agents** in workflows (plan → code → review)
2. **Experiment** with different task descriptions
3. **Build small projects** using multiple agents

### Level 3: Building Confidence
1. **Create complex workflows** with multiple steps
2. **Use agents iteratively** to refine results
3. **Start real projects** with agent assistance

### Level 4: Ready for More
1. **Graduate to full Claude Flow** for advanced features
2. **Explore enterprise features** like swarms and neural networks
3. **Contribute** to the novice version to help other learners

## 🆚 Novice vs Full Claude Flow

| Feature | Claude Flow Novice | Full Claude Flow |
|---------|-------------------|------------------|
| **Agent Types** | 4 essential agents | 54+ specialized agents |
| **Complexity** | Simple, linear workflows | Complex swarm coordination |
| **Learning Curve** | Gentle, beginner-friendly | Steep, enterprise-focused |
| **Use Cases** | Learning, small projects | Enterprise, complex systems |
| **Documentation** | Tutorial-focused | Technical reference |
| **Setup Time** | 2 minutes | 10-30 minutes |

## 🎯 Perfect For

- **New developers** learning AI automation
- **Students** working on projects
- **Hobbyists** exploring AI capabilities
- **Small teams** needing simple automation
- **Anyone** who finds full Claude Flow overwhelming

## 🤝 Getting Help

- **Questions?** [Open an issue](https://github.com/masharratt/claude-flow-novice/issues) with the "question" label
- **Bug reports?** [Report them here](https://github.com/masharratt/claude-flow-novice/issues)
- **Want to contribute?** Check out [CONTRIBUTING.md](./CONTRIBUTING.md)

## 🔗 Next Steps

Ready for more advanced features?
- [Full Claude Flow](https://github.com/ruvnet/claude-flow) - Enterprise-grade features
- [Examples Repository](./examples) - More complex usage patterns
- [API Documentation](./docs/api) - Detailed technical reference

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

<div align="center">

**Made with ❤️ for AI beginners**

*Start simple. Dream big. Build with AI.*

</div>