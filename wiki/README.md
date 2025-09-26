# Claude Flow Novice Wiki

Welcome to the Claude Flow Novice comprehensive documentation wiki. This wiki provides complete coverage of both CLI and Claude Code MCP access methods for the claude-flow-novice platform.

## 🚀 Quick Navigation

### Getting Started
- **[CLI Access](getting-started/cli-access/README.md)** - Traditional command-line interface
- **[Claude Code MCP](getting-started/claude-code-mcp/README.md)** - Integrated Claude Code experience
- **[Quick Start Guide](getting-started/quick-start/README.md)** - 5-minute setup
- **[Installation](getting-started/installation/README.md)** - Complete installation guide

### Core Concepts
- **[Agents](core-concepts/agents/README.md)** - 54+ specialized AI agents
- **[SPARC Methodology](core-concepts/sparc-methodology/README.md)** - Systematic development approach
- **[Swarm Coordination](core-concepts/swarm-coordination/README.md)** - Multi-agent orchestration
- **[Memory System](core-concepts/memory-system/README.md)** - Cross-session persistence
- **[Hooks Lifecycle](core-concepts/hooks-lifecycle/README.md)** - Automation and coordination

### Progressive Learning
- **[Beginner Tutorials](tutorials/beginner/README.md)** - Start here if new to claude-flow
- **[Intermediate Tutorials](tutorials/intermediate/README.md)** - Multi-agent workflows
- **[Advanced Tutorials](tutorials/advanced/README.md)** - Complex orchestration patterns

### Language Guides
- **[JavaScript](languages/javascript/README.md)** - Node.js integration patterns
- **[TypeScript](languages/typescript/README.md)** - Type-safe development
- **[Python](languages/python/README.md)** - Python ecosystem integration
- **[Rust](languages/rust/README.md)** - High-performance applications
- **[Go](languages/go/README.md)** - Microservices and APIs
- **[Java](languages/java/README.md)** - Enterprise applications

### Command Reference
- **[Novice Commands](command-reference/novice/README.md)** - Essential commands for beginners
- **[Intermediate Commands](command-reference/intermediate/README.md)** - Multi-agent workflows
- **[Expert Commands](command-reference/expert/README.md)** - Advanced orchestration
- **[MCP Tools](command-reference/mcp-tools/README.md)** - Claude Code integration

### Support & Resources
- **[Troubleshooting](troubleshooting/README.md)** - Common issues and solutions
- **[Examples](examples/README.md)** - Real-world project examples
- **[API Reference](api-reference/README.md)** - Complete API documentation
- **[Community](community/README.md)** - Contributing and discussions

## 🎯 Dual Access Architecture

Claude Flow Novice supports two primary access methods:

### 1. CLI Access
Traditional command-line interface for direct terminal usage:
```bash
npx claude-flow sparc tdd "user authentication"
npx claude-flow agents spawn coder "build REST API"
```

### 2. Claude Code MCP Integration
Seamless integration with Claude Code for enhanced development experience:
```javascript
// Via Claude Code's Task tool with MCP coordination
Task("Backend Developer", "Build REST API with authentication", "coder")
mcp__claude-flow__swarm_init({ topology: "mesh" })
```

## 📊 Performance Benefits

- **84.8% SWE-Bench solve rate**
- **32.3% token reduction**
- **2.8-4.4x speed improvement**
- **27+ neural models**
- **54+ specialized agents**

## 🛠️ Key Features

- **SPARC Methodology**: Specification → Pseudocode → Architecture → Refinement → Completion
- **Multi-Agent Coordination**: Hierarchical, mesh, ring, and star topologies
- **Cross-Session Memory**: Persistent context and learning
- **Hooks Automation**: Pre/post operation automation
- **GitHub Integration**: Repository management and CI/CD
- **Neural Training**: Adaptive agent improvement

## 📚 Documentation Structure

This wiki is organized for progressive learning:

1. **Start** with [Getting Started](getting-started/README.md) for initial setup
2. **Learn** core concepts in [Core Concepts](core-concepts/README.md)
3. **Practice** with [Tutorials](tutorials/README.md) at your skill level
4. **Specialize** with [Language Guides](languages/README.md)
5. **Reference** commands in [Command Reference](command-reference/README.md)
6. **Solve** issues with [Troubleshooting](troubleshooting/README.md)

## 🤝 Contributing

See our [Contributing Guide](community/contributing/README.md) for information on how to contribute to this documentation.

---

**Next Steps:**
- New users: Start with [Quick Start Guide](getting-started/quick-start/README.md)
- Experienced developers: Jump to [Advanced Tutorials](tutorials/advanced/README.md)
- Claude Code users: Check [MCP Integration](getting-started/claude-code-mcp/README.md)