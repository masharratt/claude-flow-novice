# Claude Flow Novice 🚀

**AI Agent Orchestration Made Simple for Beginners**

A powerful yet user-friendly AI agent orchestration framework that enables developers to coordinate multiple AI agents working together on complex tasks. Perfect for beginners who want to leverage AI agents without dealing with complex setup.

<div align="center">

[![npm version](https://badge.fury.io/js/claude-flow-novice.svg)](https://badge.fury.io/js/claude-flow-novice)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

[Quick Start](#-quick-start) • [Installation](#-installation) • [Examples](#-basic-examples) • [Support](#-get-help)

</div>

---

## ✨ What Does It Do?

Claude Flow Novice lets you:
- **Coordinate multiple AI agents** to work together on complex tasks
- **Automatically spawn specialized agents** (backend, frontend, testing, etc.)
- **Monitor progress in real-time** with a simple dashboard
- **"It just works" setup** - no complex configuration needed
- **High-performance coordination** - 398,373 events/sec with WASM acceleration

### 🎯 Perfect For Beginners
- Building your first AI-powered applications
- Learning how AI agents work together
- Automating development tasks without deep AI knowledge
- Projects that need coordinated AI workflows

---

## 🚀 Quick Start (5 Minutes)

### 1. Install
```bash
# Install globally or locally
npm install -g claude-flow-novice
```

**✨ Automatic Setup Included!**

During installation, Claude Flow Novice automatically:
- ✅ **SQLite Database**: Creates database directory for persistent memory
- ✅ **53 Agent Profiles**: Syncs production-ready agents to `.claude/agents/`
- ✅ **4 Validators**: Includes agent-template, CFN-loop, test-coverage, blocking-coordination validators
- 🔄 **Redis Detection**: Auto-detects and starts Redis if installed (optional but recommended)

**Note**: Redis is optional but recommended for cross-session state persistence. See [Redis Setup](#redis-setup-optional) below.

### 2. Create Your First Project
```bash
# Initialize a new project
claude-flow-novice init my-first-ai-project
cd my-first-ai-project
```

### 3. Launch Your First Agent Swarm
```bash
# Tell the AI agents what to build
claude-flow-novice swarm "Create a simple todo app with user authentication"
```

That's it! 🎉 Claude Flow Novice will automatically:
- Set up the project structure
- Spawn specialized agents (backend, frontend, testing)
- Coordinate their work in real-time
- Show you a monitoring dashboard
- Persist progress to SQLite (survives restarts)

### 4. Monitor Progress
```bash
# Watch your agents work
claude-flow-novice monitor
```

---

## 📋 Requirements

### Must Have
- **Node.js 20+** - [Download Node.js](https://nodejs.org/)
- **npm 9+** - Comes with Node.js

### Automatic Setup (Included)
✅ **SQLite** - Automatically configured during installation
✅ **Agent Profiles** - 53 production agents synced to `.claude/agents/`
✅ **Validation Hooks** - 4 production-ready validators included

### Redis Setup (Optional)

Redis is **optional** but recommended for:
- Cross-session state persistence (swarm recovery)
- Faster coordination (10K+ events/sec)
- Production deployments

**Auto-Detection**: The installer automatically detects and starts Redis if available.

**Manual Installation**:
```bash
# Install with Docker (easiest)
docker run -d -p 6379:6379 redis

# Or install locally
# macOS: brew install redis && brew services start redis
# Ubuntu: sudo apt install redis-server && sudo systemctl start redis
# Windows: Download from redis.io or use WSL2

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

**Setup Scripts** (if auto-detection fails):
```bash
npm run redis:setup      # Interactive Redis setup wizard
npm run redis:start      # Start Redis server
npm run redis:status     # Check Redis status
```

**Without Redis**: SQLite-only mode still works! Basic swarm coordination functions normally, but:
- ⚠️ No cross-session recovery (state lost on restart)
- ⚠️ Reduced throughput (SQLite only, no Redis pub/sub)
- ✅ Perfect for local development and small projects

---

## 🎮 Basic Examples

### Example 1: Build a Web API
```bash
# Launch a development swarm
claude-flow-novice swarm "Create a REST API for managing user tasks"
```

**What happens automatically:**
1. 🤖 Spawns specialized agents (backend, API designer, tester)
2. 📋 Plans the API endpoints and structure
3. 💻 Builds the API with best practices
4. 🧪 Runs tests and validation
5. 📊 Shows you progress in real-time

### Example 2: Frontend Development
```bash
# Create a React application
claude-flow-novice swarm "Build a React dashboard with user login and charts"
```

**AI agents will coordinate to:**
- Set up React project structure
- Design component architecture
- Implement user authentication
- Add data visualization
- Create responsive design
- Run comprehensive tests

### Example 3: Research & Analysis
```bash
# Market research
claude-flow-novice swarm "Research the best Node.js frameworks for building APIs"
```

**Research agents will:**
- Gather information about popular frameworks
- Compare features and performance
- Analyze pros and cons
- Create a summary report
- Provide recommendations

---

## 🛠️ Common Commands

### Project Management
```bash
# Create new project
claude-flow-novice init project-name

# Start development server
claude-flow-novice start

# Check project status
claude-flow-novice status

# Build for production
claude-flow-novice build
```

### Agent Swarms
```bash
# Launch agents to work on a task
claude-flow-novice swarm "Build a blog with user accounts"

# Full-stack development (all agent types)
/fullstack "Create an e-commerce site with products and checkout"

# Research tasks
claude-flow-novice research "Compare React vs Vue for beginners"
```

### Monitoring
```bash
# Watch agents work in real-time
claude-flow-novice monitor

# View performance metrics
claude-flow-novice metrics

# See detailed logs
claude-flow-novice logs
```

---

## 🎯 How It Works (Simple Explanation)

```
You Tell AI What to Build
          ↓
    Claude Flow Creates
    Specialized AI Agents
          ↓
    Agents Work Together
    (Like a Team of Experts)
          ↓
    You Monitor Progress
    In Real-time Dashboard
          ↓
    Complete Project ✅
```

### The AI Agent Types (53 Production-Ready Agents Included!)

**Core Development Agents:**
- **Backend Developer** - Builds APIs, databases, server logic
- **Frontend Developer** - Creates user interfaces, React/Vue apps
- **Coder** - General-purpose implementation specialist
- **Tester** - Writes tests, finds bugs, ensures quality
- **Reviewer** - Code review and quality assurance

**Specialized Agents:**
- **API Designer** - Plans API endpoints and documentation
- **Security Specialist** - Adds security best practices
- **DevOps Engineer** - CI/CD, deployment, infrastructure
- **Mobile Developer** - React Native mobile apps
- **Architect** - System design and technical decisions
- **Researcher** - Gathers information and analyzes options
- **Performance Analyzer** - Bottleneck identification and optimization

**Coordination Agents:**
- **Task Coordinator** - Multi-agent workflow orchestration
- **Product Owner** - GOAP decision-making (CFN Loop 4)
- **Mesh/Hierarchical Coordinators** - Swarm topology management

**Plus 38 More Specialized Agents!** All automatically synced to your `.claude/agents/` directory during installation.

---

## 📊 Dashboard & Monitoring

Claude Flow Novice includes a real-time dashboard that shows you:

- **What each agent is working on** right now
- **Progress percentage** for your project
- **Agent conversations** and decisions
- **Code being written** in real-time
- **Test results** and quality metrics

### Start the Dashboard
```bash
# Launch monitoring dashboard
claude-flow-novice monitor

# Or view in browser (usually http://localhost:3000)
claude-flow-novice start --dashboard
```

---

## 🔧 Simple Configuration

Most users don't need to configure anything - it works out of the box! But if you want to customize:

### Basic Config File
Create `claude-flow.config.json` in your project:

```json
{
  "name": "my-project",
  "maxAgents": 5,
  "redis": {
    "host": "localhost",
    "port": 6379
  }
}
```

### Environment Variables (Optional)
```bash
# Redis settings
REDIS_URL=redis://localhost:6379

# API keys (if using external services)
ANTHROPIC_API_KEY=your-key-here

# Logging level
LOG_LEVEL=info
```

---

## 🆘 Common Issues & Solutions

### Installation Problems
```bash
# Permission denied
sudo npm install -g claude-flow-novice

# Node.js version too old
nvm install 20
nvm use 20

# Check installation status
cat ~/.claude-flow-novice/config/setup-status.json

# View setup logs
cat ~/.claude-flow-novice/setup.log
```

### Agent Sync Issues
```bash
# Manually sync agents from package
npm run agents:sync

# Preview changes without syncing
npm run agents:sync:dry-run

# Check what agents are installed
ls -la .claude/agents/

# Restore from backup
cp .claude/agents/.backup/{file}.backup .claude/agents/{file}
```

### Redis Connection Issues (Optional)
```bash
# Check if Redis is running
redis-cli ping

# Auto-setup Redis (if installed but not configured)
npm run redis:setup

# Start Redis manually
npm run redis:start

# Check Redis status
npm run redis:status

# Without Redis: SQLite-only mode works fine!
# Just ignore Redis warnings - basic functionality is unaffected
```

### Performance Issues
```bash
# Increase memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Use performance mode
claude-flow-novice start --performance

# Monitor what's happening
claude-flow-novice monitor --detailed
```

---

## 📚 Learn More

### Next Steps
- [📖 Detailed Tutorial](./docs/QUICK_START.md) - Step-by-step guide
- [🔧 Configuration Guide](./docs/CONFIGURATION.md) - Advanced setup
- [💡 Examples Gallery](./docs/EXAMPLES.md) - Real-world projects
- [📚 API Reference](./docs/API.md) - All commands and options

### Video Tutorials (Coming Soon)
- 🎥 Getting Started (5 min)
- 🎥 Building Your First API (10 min)
- 🎥 Creating a React App (15 min)
- 🎥 Advanced Agent Coordination (20 min)

---

## 🤝 Get Help

### Quick Help
```bash
# Get help with any command
claude-flow-novice --help
claude-flow-novice swarm --help
```

### Community Support
- **GitHub Issues**: [Report bugs](https://github.com/masharratt/claude-flow-novice/issues)
- **Discussions**: [Ask questions](https://github.com/masharratt/claude-flow-novice/discussions)
- **Documentation**: [Full docs](https://github.com/masharratt/claude-flow-novice/wiki)

### Common Questions
- **Q: Do I need to know AI/ML to use this?**
  A: No! This is designed for beginners. Just describe what you want to build.

- **Q: Is Redis required?**
  A: No! SQLite-only mode works perfectly for local development. Redis is optional for production features (cross-session recovery, 10K+ events/sec throughput).

- **Q: What happens to my custom agents during updates?**
  A: Custom agents are preserved! Only package agents with the same name are overwritten, and backups are created automatically in `.claude/agents/.backup/`.

- **Q: Can I use this for real projects?**
  A: Yes! Many developers use Claude Flow Novice for production applications. All 53 agents include 4 production-ready validators.

- **Q: How much does it cost?**
  A: The tool is free (MIT license). You only pay for any AI API calls you make.

- **Q: Can I customize the agents?**
  A: Yes! Advanced users can create custom agent types and behaviors. See `.claude/agents/CLAUDE.md` for agent design principles.

---

## 🗺️ What's Next?

### Version 2.0 (Current) - Complete Automation
- ✅ **Automatic Setup** - SQLite, Redis detection, agent sync on install
- ✅ **53 Production Agents** - Auto-synced to `.claude/agents/`
- ✅ **4 Production Validators** - Agent-template, CFN-loop, test-coverage, blocking-coordination
- ✅ **Agent Backup System** - Automatic backups before overwriting
- ✅ **SQLite + Redis Dual Layer** - Persistent memory with 5-level ACL
- ✅ **WASM 40x Performance** - Event Bus: 398,373 events/sec
- ✅ **Circuit Breaker Pattern** - Production-ready resilience
- ✅ **Memory Safety** - Rust Drop trait prevents leaks
- ✅ **Multi-agent coordination** - Mesh + hierarchical topologies
- ✅ **Real-time dashboard** - Monitor 1000+ agents
- ✅ **CFN Loop Orchestration** - Autonomous self-correcting development

### Version 2.1 (Coming Soon)
- 🔄 Enhanced error handling - Better recovery strategies
- 🔄 Visual workflow designer - Drag-and-drop agent coordination
- 🔄 One-click deployment - Cloud deployment automation

---

## 🌐 Unified Web Portal

**New in Phase 4:** All monitoring and management functionality consolidated into a single, modern web portal.

### Access the Portal

```bash
cd packages/web-portal
npm install
npm run dev
# Open http://localhost:3000
```

### Portal Features

- **Dashboard** (`/`) - System overview with real-time metrics
- **Agents** (`/agents`) - Agent management and lifecycle monitoring
- **Hierarchy** (`/hierarchy`) - Agent hierarchy visualization
- **Performance** (`/performance`) - Performance metrics with Chart.js
- **Events** (`/events`) - Real-time event timeline (10K+ events)
- **Fleet** (`/fleet`) - Fleet overview (1000+ agents)
- **CFN Loop** (`/cfn-loop`) - CFN Loop phase tracking
- **Settings** (`/settings`) - Configuration management

**Technology Stack:**
- React 18 + TypeScript
- Vite for fast HMR
- Zustand for state management
- WebSocket for real-time updates
- Chart.js for visualization
- Vitest + Playwright for testing (≥80% coverage)

### Legacy Systems Migration

**Archived:** Legacy portal systems have been archived to `archive/legacy-portals/` (2025-10-12)

**Automatic Redirects:** Legacy URLs automatically redirect to the unified portal:
- `/dashboard` → `/` (main dashboard)
- `/agent-management` → `/agents`
- `/metrics-dashboard` → `/performance`
- `/event-log` → `/events`
- `/swarm-coordinator` → `/fleet`
- `/cfn-monitor` → `/cfn-loop`

**Full Migration Guide:** See `archive/legacy-portals/README.md` for detailed migration documentation.

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

<div align="center">

**Ready to build with AI agents?**

[🚀 Get Started Now](#-quick-start) • [💡 View Examples](#-basic-examples) • [🤝 Get Help](#-get-help)

Made with ❤️ for beginners by [Claude Flow Novice Team](https://github.com/masharratt/claude-flow-novice)

</div>