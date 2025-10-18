# CLI Commands Visual Reference

> **Interactive visual guide to Claude Flow CLI commands with hierarchy trees, flow diagrams, and relationship maps**

## 🌳 Command Hierarchy Tree

```
claude-flow
├── 🌱 NOVICE TIER (5 Commands)
│   ├── init [project-type] [options]
│   │   ├── --template <name>
│   │   ├── --interactive (-i)
│   │   ├── --skip-git
│   │   └── --dry-run
│   │
│   ├── build [feature-description] [options]
│   │   ├── --agent <type>
│   │   ├── --parallel
│   │   ├── --dry-run
│   │   ├── --fix
│   │   └── --optimize
│   │
│   ├── status [options]
│   │   ├── --detailed (-d)
│   │   ├── --watch (-w)
│   │   ├── --format <type>
│   │   └── --filter <category>
│   │
│   ├── help [command] [options]
│   │   ├── --interactive (-i)
│   │   ├── --examples
│   │   ├── --search <term>
│   │   └── --new-features
│   │
│   └── learn [topic] [options]
│       ├── --level <level>
│       ├── --interactive (-i)
│       ├── --exercises
│       └── --challenges
│
├── ⚡ INTERMEDIATE TIER (15 Commands)
│   ├── agents <action> [target] [options]
│   │   ├── list
│   │   ├── spawn <type>
│   │   ├── status [id]
│   │   ├── metrics [id]
│   │   ├── stop <id>
│   │   ├── restart <id>
│   │   └── optimize
│   │
│   ├── test [test-type] [options]
│   │   ├── unit | integration | e2e
│   │   ├── performance | security | api
│   │   ├── --generate
│   │   ├── --run
│   │   ├── --coverage
│   │   └── --fix
│   │
│   ├── deploy [environment] [options]
│   │   ├── development | staging | production
│   │   ├── --auto-setup
│   │   ├── --rollback [version]
│   │   ├── --zero-downtime
│   │   └── --monitor
│   │
│   ├── optimize [target] [options]
│   │   ├── code | bundle | database
│   │   ├── images | api | memory
│   │   ├── --analyze
│   │   ├── --apply
│   │   └── --benchmark
│   │
│   └── review [scope] [options]
│       ├── all | changes | security
│       ├── performance | style | architecture
│       ├── --fix
│       ├── --severity <level>
│       └── --interactive (-i)
│
└── 🚀 EXPERT TIER (112+ Commands)
    ├── mcp <server> <tool> [options]
    │   ├── claude-flow-novice (Main MCP)
    │   │   ├── swarm_init
    │   │   ├── agent_spawn
    │   │   ├── task_orchestrate
    │   │   ├── neural_train
    │   │   └── memory_usage
    │   │
    │   ├── ruv-swarm (Enhanced)
    │   │   ├── swarm_monitor
    │   │   ├── benchmark_run
    │   │   ├── features_detect
    │   │   └── daa_init
    │   │
    │   └── flow-nexus (Cloud)
    │       ├── sandbox_create
    │       ├── template_deploy
    │       ├── storage_upload
    │       └── realtime_subscribe
    │
    ├── workflow <action> [name] [options]
    │   ├── create <name>
    │   ├── execute <name>
    │   ├── list
    │   ├── export <name>
    │   └── import <file>
    │
    └── enterprise <action> [options]
        ├── setup
        ├── team-create
        ├── role-assign
        ├── audit-log
        └── compliance-report
```

## 🔄 Command Flow Diagrams

### 1. Project Initialization Flow

```
START
  │
  ├─ claude-flow-novice init
  │    │
  │    ├─ Detect Project Type
  │    │    ├─ web → React/Vue/Angular template
  │    │    ├─ api → Express/FastAPI/Spring template
  │    │    ├─ mobile → React Native/Flutter template
  │    │    └─ custom → Interactive wizard
  │    │
  │    ├─ Setup Dependencies
  │    │    ├─ Package manager detection
  │    │    ├─ Install core dependencies
  │    │    └─ Configure build tools
  │    │
  │    ├─ Initialize Git Repository
  │    │    ├─ git init
  │    │    ├─ Create .gitignore
  │    │    └─ Initial commit
  │    │
  │    └─ Setup Configuration
  │         ├─ .claude-flow.yml
  │         ├─ Environment variables
  │         └─ CI/CD templates
  │
  └─ PROJECT READY
```

### 2. Feature Development Flow

```
FEATURE REQUEST
  │
  ├─ claude-flow-novice build "feature description"
  │    │
  │    ├─ 🧠 Intelligence Engine
  │    │    ├─ Parse natural language
  │    │    ├─ Analyze project context
  │    │    ├─ Break down into tasks
  │    │    └─ Select optimal agents
  │    │
  │    ├─ 🤖 Agent Orchestration
  │    │    ├─ Spawn researcher → requirements analysis
  │    │    ├─ Spawn architect → system design
  │    │    ├─ Spawn coder → implementation
  │    │    ├─ Spawn tester → test creation
  │    │    └─ Spawn reviewer → quality check
  │    │
  │    ├─ ⚡ Parallel Execution
  │    │    ├─ Real-time coordination
  │    │    ├─ Memory sharing
  │    │    ├─ Progress monitoring
  │    │    └─ Error handling
  │    │
  │    └─ ✅ Integration & Validation
  │         ├─ Merge agent outputs
  │         ├─ Run tests
  │         ├─ Performance check
  │         └─ Documentation update
  │
  └─ FEATURE COMPLETE
```

### 3. Testing & Deployment Flow

```
CODE READY
  │
  ├─ claude-flow-novice test
  │    │
  │    ├─ Test Generation
  │    │    ├─ Unit tests → Function coverage
  │    │    ├─ Integration tests → Component interaction
  │    │    ├─ E2E tests → User workflows
  │    │    └─ Performance tests → Load/stress
  │    │
  │    ├─ Test Execution
  │    │    ├─ Parallel test runs
  │    │    ├─ Coverage analysis
  │    │    ├─ Performance metrics
  │    │    └─ Security scanning
  │    │
  │    └─ Results Processing
  │         ├─ Generate reports
  │         ├─ Identify failures
  │         ├─ Suggest fixes
  │         └─ Update documentation
  │
  ├─ claude-flow-novice deploy [environment]
  │    │
  │    ├─ Environment Setup
  │    │    ├─ Infrastructure provisioning
  │    │    ├─ Configuration management
  │    │    ├─ Security compliance
  │    │    └─ Monitoring setup
  │    │
  │    ├─ Deployment Strategy
  │    │    ├─ Blue-green deployment
  │    │    ├─ Rolling updates
  │    │    ├─ Canary releases
  │    │    └─ Rollback preparation
  │    │
  │    └─ Post-Deployment
  │         ├─ Health checks
  │         ├─ Performance monitoring
  │         ├─ Log aggregation
  │         └─ Alert configuration
  │
  └─ PRODUCTION READY
```

## 🎯 Usage Pattern Charts

### Command Frequency Matrix

| Command | Novice | Intermediate | Expert | Daily Use | Complexity |
|---------|--------|--------------|--------|-----------|------------|
| `init` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Low | Low |
| `build` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | High | Medium |
| `status` | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | High | Low |
| `help` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Medium | Low |
| `learn` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ | Medium | Low |
| `agents` | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Medium | Medium |
| `test` | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | High | Medium |
| `deploy` | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Medium | High |
| `optimize` | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | Low | Medium |
| `review` | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Medium | Medium |
| `mcp` | ⭐ | ⭐ | ⭐⭐⭐⭐⭐ | Medium | High |
| `workflow` | ⭐ | ⭐ | ⭐⭐⭐⭐⭐ | Low | High |
| `enterprise` | ⭐ | ⭐ | ⭐⭐⭐ | Low | High |

### Workflow Progression Patterns

```
📈 User Journey Progression

Week 1-2: EXPLORATION
├─ init (3-5 times)
├─ build (10-20 times)
├─ status (daily)
├─ help (frequent)
└─ learn (regular)

Week 3-4: CONFIDENCE BUILDING
├─ build (advanced features)
├─ agents (basic management)
├─ test (first attempts)
├─ status (monitoring)
└─ help (targeted queries)

Month 2-3: INTERMEDIATE MASTERY
├─ agents (active management)
├─ test (comprehensive)
├─ deploy (staging environments)
├─ review (code quality)
└─ optimize (performance)

Month 4+: EXPERT USAGE
├─ mcp (direct tool access)
├─ workflow (custom automation)
├─ enterprise (team features)
├─ deploy (production)
└─ optimize (advanced tuning)
```

## 🗺️ Command Relationship Maps

### 1. Core Dependencies

```
       ┌─────────────┐
       │    init     │ ────┐
       └─────────────┘     │
              │             │
              ▼             │
       ┌─────────────┐     │
   ┌── │    build    │ ◄───┘
   │   └─────────────┘
   │          │
   │          ▼
   │   ┌─────────────┐
   │   │   status    │
   │   └─────────────┘
   │          │
   │          ▼
   │   ┌─────────────┐
   └─► │    help     │ ◄─── learn
       └─────────────┘
```

### 2. Testing Ecosystem

```
       ┌─────────────┐
       │    build    │
       └─────┬───────┘
             │
             ▼
    ┌─────────────┐     ┌─────────────┐
    │    test     │ ◄─► │   review    │
    └─────┬───────┘     └─────────────┘
          │                    │
          ▼                    ▼
   ┌─────────────┐     ┌─────────────┐
   │  optimize   │ ◄─► │   deploy    │
   └─────────────┘     └─────────────┘
```

### 3. Agent Coordination

```
         ┌─────────────┐
         │   agents    │
         └─────┬───────┘
               │
         ┌─────▼───────┐
         │    mcp      │ ────┐
         └─────┬───────┘     │
               │             │
         ┌─────▼───────┐     │
         │  workflow   │ ◄───┘
         └─────┬───────┘
               │
         ┌─────▼───────┐
         │ enterprise  │
         └─────────────┘
```

## 📊 Option Combination Matrices

### Build Command Options Matrix

| Scenario | --agent | --parallel | --dry-run | --fix | --optimize | Example |
|----------|---------|------------|-----------|-------|------------|---------|
| New Feature | coder | ✅ | ❌ | ❌ | ❌ | `build "user auth" --agent coder --parallel` |
| Bug Fix | reviewer | ❌ | ✅ | ✅ | ❌ | `build "fix login" --fix --dry-run` |
| Performance | optimizer | ✅ | ❌ | ❌ | ✅ | `build "speed up API" --optimize --parallel` |
| Exploration | researcher | ❌ | ✅ | ❌ | ❌ | `build "explore ML options" --agent researcher --dry-run` |
| Production | multiple | ✅ | ❌ | ✅ | ✅ | `build "payment gateway" --parallel --fix --optimize` |

### Test Command Combinations

| Test Type | Generate | Run | Coverage | Fix | Watch | Best For |
|-----------|----------|-----|----------|-----|-------|----------|
| unit | ✅ | ✅ | ✅ | ❌ | ❌ | Initial development |
| integration | ✅ | ✅ | ✅ | ✅ | ❌ | Component testing |
| e2e | ✅ | ✅ | ❌ | ✅ | ✅ | User workflow validation |
| performance | ❌ | ✅ | ❌ | ❌ | ✅ | Load testing |
| security | ✅ | ✅ | ❌ | ✅ | ❌ | Vulnerability scanning |

### Deploy Environment Matrix

| Environment | Auto-setup | Monitor | Zero-downtime | Rollback | Best Practice |
|-------------|------------|---------|---------------|----------|---------------|
| development | ✅ | ❌ | ❌ | ❌ | `deploy development --auto-setup` |
| staging | ✅ | ✅ | ❌ | ✅ | `deploy staging --auto-setup --monitor` |
| production | ❌ | ✅ | ✅ | ✅ | `deploy production --zero-downtime --monitor` |
| preview | ✅ | ❌ | ❌ | ❌ | `deploy preview --auto-setup` |

## 🚀 Quick Reference Cards

### Novice Quick Start Card
```
┌─────────────────────────────────────────┐
│               NOVICE ESSENTIALS         │
├─────────────────────────────────────────┤
│ 🚀 Start Project: init                 │
│ 🏗️  Build Feature: build "description" │
│ 📊 Check Status: status                │
│ ❓ Get Help: help                      │
│ 📚 Learn More: learn                   │
│                                         │
│ 💡 Natural Language Works!             │
│    "create a todo app"                  │
│    "add user authentication"           │
│    "fix the login bug"                 │
└─────────────────────────────────────────┘
```

### Intermediate Power Card
```
┌─────────────────────────────────────────┐
│            INTERMEDIATE POWER           │
├─────────────────────────────────────────┤
│ 🤖 Manage Agents: agents list/spawn    │
│ 🧪 Run Tests: test unit/e2e            │
│ 🚀 Deploy: deploy staging/production   │
│ ⚡ Optimize: optimize code/bundle      │
│ 🔍 Review: review security/performance │
│                                         │
│ 🎯 Pro Tips:                           │
│    --parallel for speed                │
│    --dry-run to preview                │
│    --watch for monitoring              │
└─────────────────────────────────────────┘
```

### Expert Mastery Card
```
┌─────────────────────────────────────────┐
│              EXPERT MASTERY             │
├─────────────────────────────────────────┤
│ 🔧 MCP Tools: mcp <server> <tool>      │
│ 🌊 Workflows: workflow create/execute  │
│ 🏢 Enterprise: enterprise setup        │
│                                         │
│ 🧠 Advanced Patterns:                  │
│    Neural training & patterns          │
│    Custom workflow automation          │
│    Multi-repo coordination             │
│    Enterprise compliance               │
│                                         │
│ 🎯 112+ MCP tools available            │
└─────────────────────────────────────────┘
```

## 🔍 Command Discovery Patterns

### Natural Language → Command Mapping

| What You Want | Say This | Command Generated |
|---------------|----------|-------------------|
| "Start new project" | `init` or `"create new project"` | `claude-flow-novice init --interactive` |
| "Add authentication" | `"add user login"` | `claude-flow-novice build "user authentication" --agent coder` |
| "Fix bugs" | `"fix the issues"` | `claude-flow-novice build --fix --agent reviewer` |
| "Speed up app" | `"optimize performance"` | `claude-flow-novice optimize --analyze --benchmark` |
| "Deploy to staging" | `"deploy for testing"` | `claude-flow-novice deploy staging --monitor` |
| "Run all tests" | `"test everything"` | `claude-flow-novice test --run --coverage` |
| "Check project health" | `"how is my project?"` | `claude-flow-novice status --detailed` |

### Progressive Complexity Unlock

```
Level 1: Natural Language
├─ "create a todo app"
├─ "add user registration"
└─ "fix the login issue"

Level 2: Specific Commands
├─ claude-flow-novice build "todo app" --parallel
├─ claude-flow-novice test unit --coverage
└─ claude-flow-novice deploy staging

Level 3: Agent Management
├─ claude-flow-novice agents spawn researcher
├─ claude-flow-novice agents metrics --detailed
└─ claude-flow-novice workflow create "full-stack"

Level 4: MCP Direct Access
├─ claude-flow-novice mcp claude-flow-novice swarm_init
├─ claude-flow-novice mcp ruv-swarm neural_train
└─ claude-flow-novice mcp flow-nexus sandbox_create
```

## 📱 Interactive Command Explorer

### Command Relationship Visualization

```
        🌱 BEGINNER PATH
         ├─ init → build → status
         ├─ help (anytime)
         └─ learn (weekly)

        ⚡ INTERMEDIATE PATH
         ├─ agents → test → review
         ├─ optimize → deploy
         └─ Advanced build options

        🚀 EXPERT PATH
         ├─ mcp → workflow → enterprise
         ├─ Custom automation
         └─ Multi-project coordination
```

### Context-Aware Suggestions

Based on your current project and skill level, Claude Flow suggests:

```
📊 Current Context: React + Node.js, Intermediate User
┌─────────────────────────────────────────┐
│ 💡 Suggested Next Commands:            │
├─────────────────────────────────────────┤
│ test e2e --generate  (setup testing)   │
│ optimize bundle      (improve speed)   │
│ deploy staging       (test deployment) │
│ review security      (code quality)    │
└─────────────────────────────────────────┘

🎯 Unlock Progress: 3/10 commands to Expert tier
```

---

This visual reference provides immediate clarity on command structure, relationships, and optimal usage patterns for users at every skill level.