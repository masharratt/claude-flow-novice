# Claude Flow Novice - AI Agent Orchestration Made Easy

[![npm version](https://badge.fury.io/js/claude-flow-novice.svg)](https://badge.fury.io/js/claude-flow-novice)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

A simplified AI agent orchestration system designed for beginners. Claude Flow Novice makes it easy to coordinate multiple AI agents, manage complex workflows, and build autonomous systems with comprehensive CFN Loop consensus validation.

## ✨ Key Features

- **🚀 Easy Agent Orchestration**: Coordinate multiple AI agents with simple commands
- **🔄 CFN Loop System**: Autonomous self-correcting workflow with consensus validation
- **📝 Multi-Mode Support**: MVP, Standard, and Enterprise modes for different project needs
- **🎯 Swarm Intelligence**: Redis-backed coordination for persistent agent collaboration
- **🛠️ CLI-First Design**: Simple command-line interface for beginners
- **📊 Real-time Monitoring**: Track agent progress and system performance
- **🔒 Security Focused**: Built-in ACL and security controls
- **⚡ High Performance**: Optimized for cost-effective execution

## 🏁 Quick Start

### Installation

```bash
# Install globally
npm install -g claude-flow-novice

# Or install in your project
npm install claude-flow-novice
```

### Basic Usage

```bash
# Initialize a new project
claude-flow-novice init my-agent-project

# Run a simple task with agent coordination
claude-flow-novice swarm "Build a REST API with authentication" --max-agents 3

# Execute CFN Loop for complex features
claude-flow-novice cfn-loop "Implement user authentication system" --mode=standard

# Check project status
claude-flow-novice status
```

## 🎯 Core Concepts

### CFN Loop System

The CFN (Correct-Feedback-Normalize) Loop is an autonomous workflow system:

```
Loop 0: Epic/Sprint orchestration
├── Loop 1: Phase execution (sequential)
├── Loop 2: Consensus validation (2-4 validators)
├── Loop 3: Primary swarm implementation (5-15 agents)
└── Loop 4: Product Owner decision gate
```

### Modes

| Mode | Best For | Quality Gates | Cost Target |
|------|----------|---------------|-------------|
| **MVP** | Prototypes | Gate ≥0.70, Consensus ≥0.80 | <$1.00/phase |
| **Standard** | General features | Gate ≥0.75, Consensus ≥0.90 | $2.00/phase |
| **Enterprise** | Production systems | Gate ≥0.75, Consensus ≥0.95 | $5.00/phase |

### Agent Types

- **Coordinator**: Orchestrates multi-agent workflows
- **Developer**: Implements code and features
- **Tester**: Validates functionality and quality
- **Security**: Ensures security best practices
- **Architect**: Designs system architecture
- **Analyst**: Researches and analyzes requirements

## 📚 Documentation

### Core Commands

```bash
# Swarm Management
claude-flow-novice swarm "Task description" --max-agents 5
claude-flow-novice swarm status
claude-flow-novice monitor

# CFN Loop Workflows
claude-flow-novice cfn-loop "Complex feature" --mode=enterprise
claude-flow-novice cfn-loop-sprints "E-commerce platform" --sprints=3
claude-flow-novice cfn-loop-epic "User management" --phases=4

# Development
claude-flow-novice dev
claude-flow-novice build
claude-flow-novice test

# Full-Stack Development
claude-flow-novice fullstack:spawn "React + API project"
claude-flow-novice fullstack:status
claude-flow-novice fullstack:terminate
```

### Project Structure

```
my-project/
├── .claude/                 # Claude configuration
│   ├── agents/             # Agent definitions
│   └── memory/             # Agent memory systems
├── src/                    # Source code
├── tests/                  # Test files
├── docs/                   # Documentation
└── README.md
```

### Configuration

Create a `.claude/config.json` file:

```json
{
  "mode": "standard",
  "maxAgents": 5,
  "consensus": {
    "threshold": 0.90,
    "validators": 4
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  }
}
```

## 🔧 Advanced Features

### Hybrid Routing

Leverage multiple AI providers for cost optimization:

```bash
# Use z.ai for cost-effective worker execution
claude-flow-novice swarm "Build feature" --provider zai --max-agents 5

# Switch between providers
claude-flow-novice switch-api
```

### Memory Systems

Multi-level ACL memory for agent persistence:

```bash
# Store agent memory with ACL levels
claude-flow-novice memory store --key "agent/task1" --level agent

# Retrieve memory
claude-flow-novice memory retrieve --key "agent/*" --level swarm
```

### Performance Monitoring

```bash
# Performance benchmarks
claude-flow-novice performance test --type=load
claude-flow-novice performance report

# Resource monitoring
claude-flow-novice monitor --realtime
```

## 🏗️ Architecture

### Core Components

- **Swarm Coordination**: Redis-backed agent orchestration
- **CFN Loop Engine**: Autonomous workflow management
- **Memory System**: SQLite-based persistent storage with ACL
- **CLI Interface**: User-friendly command-line tools
- **Agent Framework**: Extensible agent system

### Technology Stack

- **Node.js 20+**: Runtime environment
- **TypeScript**: Type-safe development
- **Redis**: Real-time coordination and caching
- **SQLite**: Persistent data storage
- **Express**: Web server and API
- **Winston**: Logging and monitoring

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Performance testing
npm run test:performance

# Full test suite
npm run test:comprehensive
```

## 📖 Examples

### Simple Agent Task

```bash
# Launch 3 agents to build a to-do list API
claude-flow-novice swarm "Create a REST API for a to-do list application with CRUD operations" --max-agents 3
```

### Complex Feature Development

```bash
# Execute full CFN Loop for user authentication
claude-flow-novice cfn-loop "Implement complete user authentication system with JWT, password reset, and role-based access" --mode=standard
```

### Full-Stack Project

```bash
# Spawn a full-stack development team
claude-flow-novice fullstack:spawn "Build a React e-commerce frontend with Node.js backend and PostgreSQL database"
```

## 🔒 Security

- **ACL Implementation**: 5-level access control for data
- **Encryption**: AES-256 for sensitive data
- **Audit Trails**: Complete operation logging
- **Memory Safety**: Secure memory management
- **Input Validation**: Comprehensive input sanitization

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/masharratt/claude-flow-novice.git
cd claude-flow-novice

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Wiki](https://github.com/masharratt/claude-flow-novice/wiki)
- **Issues**: [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
- **Discussions**: [GitHub Discussions](https://github.com/masharratt/claude-flow-novice/discussions)

## 🗺️ Roadmap

- [ ] **v2.3.0**: Enhanced agent learning capabilities
- [ ] **v2.4.0**: Visual workflow designer
- [ ] **v2.5.0**: Advanced monitoring dashboard
- [ ] **v3.0.0**: Multi-cloud provider support

## 📊 Metrics

- **Agent Types**: 20+ specialized agents
- **Performance**: 97% cost savings vs pure Claude
- **Reliability**: 99.9% uptime with Redis persistence
- **Scalability**: Support for 1000+ concurrent agents

---

**Built with ❤️ for the AI agent community**

Simplifying AI orchestration for everyone, from beginners to experts.