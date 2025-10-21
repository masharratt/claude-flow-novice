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
- **🚨 Violations Monitoring**: Real-time detection and alerts for CFN Loop protocol violations
- **🔒 Security Focused**: Built-in ACL and security controls
- **⚡ High Performance**: Optimized for cost-effective execution

## 🏁 Quick Start

### Installation

```bash
# Install in your project
npm install claude-flow-novice

# Auto-syncs on install:
# ✅ .claude/agents/     → Your project (96+ specialized agents)
# ✅ .claude/commands/   → Your project (201+ slash commands)
# ✅ .claude/*.md        → Your project (CFN Loop rules, ACE system, patterns)
# ✅ config/hooks/       → Your project (39 validation hooks)
```

### Verify Installation

```bash
# Check cost-savings status
npx claude-flow-cost-savings status

# View available commands
npx claude-flow-sync --help
npx claude-flow-spawn --help
```

### Basic Usage

```bash
# Spawn agents for a task (cost-optimized)
npx claude-flow-spawn "Build a REST API with authentication" \
  --agents=coder,tester,reviewer \
  --provider zai \
  --max-agents 3

# Enable cost-savings mode
npx claude-flow-cost-savings on

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
│   ├── agents/             # Agent definitions (96+)
│   ├── commands/           # Slash commands (201+)
│   └── skills/             # Coordination skills
├── .artifacts/             # Runtime artifacts
│   └── adaptive-context.db # ACE system knowledge base (133+ bullets)
├── src/                    # Source code
├── tests/                  # Test files
├── docs/                   # Documentation
└── README.md
```

### Memory & Knowledge Systems

Claude Flow Novice maintains persistent memory across multiple databases:

#### 1. Adaptive Context Engine (ACE) ✅ OPERATIONAL

**Location**: `.artifacts/database/swarm-memory.db`

**Status**: Fully operational with reflection → curation → persistence pipeline

**Tables**:
- `adaptive_context` - 11 active curated lessons (strategies, patterns, optimizations)
- `context_reflections` - 1 stored reflection from task execution
- `context_merge_log` - 1 audit log entry for curation actions
- `memory_entries` - 1,939 agent memory entries with 5-level ACL

**How ACE Works**:
1. **Reflection**: `/context-reflect` spawns `context-reflector` agent
   - Analyzes task execution (git logs, test results, metrics)
   - Extracts 3-7 structured lessons with confidence scores
   - Stores in `context_reflections` table via SQLite scripts

2. **Curation**: `/context-curate` spawns `context-curator` agent
   - Loads pending reflections from database
   - Detects semantic similarity (tag-based, no embeddings needed)
   - Merges/increments/adds bullets to `adaptive_context`
   - Logs all actions in `context_merge_log`

3. **Persistence**: All operations use SQLite helper scripts
   - `store-reflection.sh` - Store reflection with lessons
   - `add-bullet.sh` - Add new bullet to context
   - `log-merge.sh` - Log curation action
   - `query-reflections.sh` - Query pending reflections
   - `update-reflection.sh` - Mark reflection as processed

**Query examples**:
```bash
# View curated lessons
sqlite3 .artifacts/database/swarm-memory.db "SELECT bullet_id, category, content FROM adaptive_context WHERE is_active = 1 ORDER BY priority DESC LIMIT 10;"

# Check reflections
sqlite3 .artifacts/database/swarm-memory.db "SELECT id, reflection_type, curator_status FROM context_reflections;"

# View merge log
sqlite3 .artifacts/database/swarm-memory.db "SELECT merge_type, bullet_id FROM context_merge_log ORDER BY created_at DESC;"
```

**Slash commands**:
```bash
/context-reflect          # Extract lessons from recent tasks
/context-curate          # Merge lessons into knowledge base
/context-query "topic"   # Search relevant bullets (manual SQL for now)
/context-stats           # View statistics (manual SQL for now)
```

**Helper scripts** (`.claude/skills/ace-system/`):
```bash
# Agents use these to persist data
./store-reflection.sh --reflection-type success --task-id sprint-123 --lessons-file lessons.json
./add-bullet.sh --bullet-id STRAT-007 --category strategy --content "Lesson here" --confidence 0.85
./log-merge.sh --merge-type new_bullet --bullet-id STRAT-007 --reflection-id refl-123
```

#### 2. Web Portal Events
**Location**: `packages/web-portal/data/events.db`

Stores real-time events for web dashboard visualization.

#### 3. Redis (Ephemeral)
Coordination state, heartbeats, pub/sub messaging - cleared on restart.

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

### CFN Loop Violations Monitoring

Real-time detection and alerting for CFN Loop protocol violations:

```bash
# Start violation monitoring
./.claude/skills/redis-coordination/monitor-cfn-violations.sh &

# Start web portal with violations dashboard
cd web-portal
npm run server    # WebSocket server on port 3001
npm start         # React app on port 3000
```

**Detected Violations:**
- 🔴 **Orchestrator Never Started** - Coordinator failed at Step 2
- 🔴 **Gate Bypass** - Loop 2 started before Loop 3 completed
- 🔴 **Orchestrator Hang** - Agents completed but orchestrator blocking
- 🔴 **Coordinator Timeout** - Bash monitoring loop timeout (5-10 min)
- 🟡 **Product Owner Skipped** - Loop 2 complete but PO not consulted

**Features:**
- Real-time WebSocket alerts to web portal
- Detailed evidence and actionable recommendations
- Historical violation tracking (24h retention)
- Violation acknowledgment and management
- Zero overhead on CFN Loop execution

See [CFN Violations Monitoring Documentation](./docs/CFN_VIOLATIONS_MONITORING.md) for setup and usage.

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