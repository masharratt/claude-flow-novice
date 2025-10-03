# Claude Flow Personal 🚀

**Transparent AI Agent Orchestration with Full Visibility**

A personalized version of Claude Flow that puts you in control of AI agent coordination with complete transparency into every decision and process.

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/masharratt/claude-flow-novice?style=for-the-badge&logo=github&color=gold)](https://github.com/masharratt/claude-flow-novice)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&logo=opensourceinitiative)](https://opensource.org/licenses/MIT)
[![Transparent AI](https://img.shields.io/badge/Transparent-AI-blue?style=for-the-badge&logo=transparency)](https://github.com/masharratt/claude-flow-novice)

</div>

---

## 🎯 What is Claude Flow Personal?

Claude Flow Personal is a transparency-focused version of the Claude Flow framework, designed for developers who want complete visibility and control over their AI agent coordination processes.

### Why Choose Personal?
- ✅ **Full Transparency** - See exactly what each agent is thinking and doing
- ✅ **Personalized Workflows** - Customize coordination patterns to match your work style
- ✅ **Decision Visibility** - Understand why agents make specific choices
- ✅ **Process Control** - Fine-tune every aspect of agent behavior
- ✅ **Explainable AI** - Get detailed explanations for all agent actions
- ✅ **Your Style** - Adapt agents to work exactly how you prefer

## 🎯 Key Features

### CFN Loop: Self-Correcting Development Loop
The Confidence-Feedback-Next (CFN) Loop provides autonomous iteration and quality validation:

- **4-Loop Architecture**: Autonomous retry with intelligent agent selection
  ```
  Loop 0: Epic/Sprint Orchestration → Multi-phase projects
  Loop 1: Phase Execution → Sequential phase progression
  Loop 2: Consensus Validation → 10 iterations max per phase
  Loop 3: Primary Swarm → 10 iterations max per subtask
  ```
  - **Total Capacity**: 10 × 10 = 100 iterations (handles enterprise complexity)
  - **Intelligent Retry**: Replace failing agents (coder → backend-dev for auth issues)
  - **Targeted Fixes**: Add specialists based on validator feedback (security-specialist for SQL injection)

- **Two-Tier Sprint/Phase System** (NEW in v1.6.0):
  - `/cfn-loop-single`: Single-phase execution (original workflow)
  - `/cfn-loop-sprints`: Multi-sprint phase orchestration (NEW)
  - `/cfn-loop-epic`: Multi-phase epic execution (NEW)
  - `/parse-epic`: Convert markdown → structured JSON (NEW)
  - Memory namespace hierarchy: `cfn-loop/epic-{id}/phase-{n}/sprint-{m}/iteration-{i}`
  - Cross-phase sprint dependencies supported

- **Confidence Gating**: Multi-factor quality assessment (≥75% threshold)
  - Test coverage (30%), Code coverage (25%), Syntax (15%)
  - Security (20%), Formatting (10%)

- **Product Owner Decision Gate** (NEW): GOAP-based autonomous scope enforcement
  - A* search algorithm for optimal decision-making
  - Scope boundary enforcement via cost functions (out-of-scope = cost 1000)
  - PROCEED/DEFER/ESCALATE decisions without human approval
  - Prevents scope creep while maintaining velocity

- **Byzantine Consensus**: Distributed validator agreement (≥90% threshold)
  - Quality review, Security audit, Architecture validation
  - Performance testing, Integration verification
  - Validators spawn AFTER implementation (prevents premature validation)

- **Automatic Feedback**: Sanitized validator feedback injection
  - Blocks prompt injection (CVE-CFN-2025-002)
  - Prioritized recommendations (Critical → High → Medium → Low)
  - Deduplication with LRU registry

- **Performance**: 13x faster confidence collection via parallelization
- **Total Iteration Capacity**: 10 × 10 = 100 iterations (handles enterprise complexity)

### Security-First Design
- Input validation (iteration limits 1-100)
- Prompt injection prevention (6 attack vectors blocked)
- Memory leak prevention (LRU eviction, automatic cleanup)
- Circuit breaker (30-min timeout, fault tolerance)

### Quick Start with CFN Loop

```bash
# Initialize swarm for multi-agent coordination
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3
})

# Single-phase CFN Loop (original workflow)
/cfn-loop "Implement JWT authentication" --phase=auth --max-loop2=10 --max-loop3=10

# Multi-sprint phase execution (NEW)
/cfn-loop-sprints "Authentication System" --sprints=3 --max-loop2=10

# Multi-phase epic execution (NEW)
/cfn-loop-epic "Complete User Management System" --phases=4 --max-loop2=10

# Or use orchestrator programmatically
import { CFNLoopIntegrator } from './src/cfn-loop/cfn-loop-integrator.js';

const orchestrator = new CFNLoopIntegrator({
  phaseId: 'auth-impl',
  maxLoop2: 5,
  maxLoop3: 10
});

const result = await orchestrator.executePhase({
  description: 'Implement JWT authentication',
  agents: [/* ... */],
  validators: [/* ... */]
});
```

### CFN Loop Documentation
- 📘 [Complete Guide](planning/CFN_LOOP_COMPLETE_GUIDE.md) - 3000+ line implementation guide with 4-loop structure
- 📊 [Flowcharts](planning/CFN_LOOP_FLOWCHARTS.md) - 8 Mermaid diagrams including Loop 0
- 📋 [Cheatsheet](planning/CFN_LOOP_CHEATSHEET.md) - Quick reference with slash commands
- 📖 [Full Docs](docs/CFN_LOOP.md) - 2780-line comprehensive documentation
- 🚀 [Sprint Orchestration](docs/SPRINT_ORCHESTRATION.md) - Two-tier phase/sprint system guide
- 🎯 [Scope Control](docs/CFN_LOOP_SCOPE_CONTROL.md) - Product Owner GOAP-based scope enforcement (NEW)
- 🎯 [MCP Endpoints](planning/COMPREHENSIVE_MCP_ENDPOINTS_REFERENCE.md) - Complete reference including CFN Loop commands

## 🚀 Quick Start

### Installation

```bash
npm install -g claude-flow-novice
```

### Your First Transparent AI Workflow in 3 Steps

```bash
# 1. Initialize with transparency enabled
claude-flow-novice init my-project --transparency=full
cd my-project

# 2. Create an agent with detailed reasoning
claude-flow-novice agent create researcher "Research the latest trends in renewable energy" --explain-decisions --show-reasoning

# 3. Run with full visibility
claude-flow-novice run --verbose --show-thought-process
```

You'll see every decision, reasoning step, and coordination choice your agents make in real-time.

## 📚 Core Concepts

### 🔍 Transparency-First Agent Design

Every agent in Claude Flow Personal provides complete visibility into their decision-making process:

| Agent | Core Function | Transparency Features |
|-------|---------------|----------------------|
| **🔍 Researcher** | Information gathering & analysis | Shows search strategies, source evaluation, and reasoning chains |
| **💻 Coder** | Implementation & development | Explains design choices, shows alternatives considered, reveals optimization decisions |
| **👀 Reviewer** | Quality assurance & feedback | Details evaluation criteria, shows thought process, explains recommendations |
| **📋 Planner** | Strategy & coordination | Reveals prioritization logic, shows trade-off analysis, explains timeline decisions |

### 🎯 Personalized Coordination Workflow

1. **Configure** your personal preferences and work style
2. **Customize** agent behavior to match your decision-making patterns
3. **Monitor** real-time agent coordination and reasoning
4. **Adjust** processes based on transparency insights
5. **Learn** from agent decisions to improve your own workflows

## 🛠️ Transparency & Personalization Commands

```bash
# Project & Profile Management
claude-flow-novice init <project> --profile=<your-style>     # Create personalized project
claude-flow-novice profile setup                             # Configure your work preferences
claude-flow-novice status --detailed                         # Get comprehensive status

# Transparent Agent Management
claude-flow-novice agent create <type> "<task>" --explain-all    # Create fully transparent agent
claude-flow-novice agent inspect <id>                           # Deep dive into agent reasoning
claude-flow-novice agent customize <id> --style=<your-way>      # Personalize agent behavior

# Coordinated Execution with Full Visibility
claude-flow-novice run --transparency=full                   # Run with complete visibility
claude-flow-novice monitor --real-time                       # Watch coordination in real-time
claude-flow-novice explain <execution-id>                    # Get detailed execution explanation

# Personalization & Learning
claude-flow-novice learn-preferences                         # Analyze your coordination patterns
claude-flow-novice customize-workflow <workflow-id>          # Adapt workflows to your style
claude-flow-novice transparency-report                       # Generate decision transparency report

# Provider Routing Management
/custom-routing-activate                                     # Enable tiered routing (~64% cost reduction)
/custom-routing-deactivate                                   # Disable routing (all agents use sonnet)
```

## 📖 Transparency & Personalization Examples

### Example 1: Transparent Research with Your Style
```bash
claude-flow-novice init research-project --profile=analytical-deep-dive
cd research-project
claude-flow-novice agent create researcher "Research TypeScript vs JavaScript" \
  --explain-search-strategy \
  --show-source-evaluation \
  --reveal-bias-checking
claude-flow-novice run --transparency=full
```

### Example 2: Personalized Development Workflow
```bash
claude-flow-novice init todo-app --coordination-style=iterative
cd todo-app

# Configure agents to match your decision-making style
claude-flow-novice agent create planner "Plan React to-do app" \
  --decision-style=thorough \
  --explain-trade-offs \
  --show-alternatives

claude-flow-novice agent create coder "Implement based on plan" \
  --coding-style=defensive \
  --explain-design-choices \
  --show-refactoring-opportunities

# Watch the coordination happen
claude-flow-novice run --monitor-coordination --explain-handoffs
```

### Example 3: Learning with Full Visibility
```bash
claude-flow-novice init learning-docker --learning-mode=transparent
cd learning-docker

claude-flow-novice agent create researcher "Docker fundamentals" \
  --show-learning-path \
  --explain-complexity-assessment \
  --reveal-knowledge-gaps

claude-flow-novice monitor --real-time --explain-decisions
```

## 🎓 Personalization Journey

### Level 1: Understanding Your AI (Start Here!)
1. **Complete the transparency setup** and explore decision visibility
2. **Configure your profile** to match your work style and preferences
3. **Observe agent reasoning** and identify patterns that align with your thinking

### Level 2: Customizing Coordination
1. **Personalize agent behavior** to complement your decision-making style
2. **Experiment with different transparency levels** to find your comfort zone
3. **Build workflows** that reflect your personal approach to problem-solving

### Level 3: Mastering Transparent AI
1. **Create sophisticated coordination patterns** with full visibility
2. **Use transparency insights** to improve both AI and human decision-making
3. **Develop personal AI workflows** that enhance your unique strengths

### Level 4: AI Partnership Mastery
1. **Design custom coordination patterns** that perfectly match your work style
2. **Share your personalization insights** to help others build better AI partnerships
3. **Contribute** to the transparent AI movement and help define the future of human-AI collaboration

## 🆚 Personal vs Full Claude Flow

| Feature | Claude Flow Personal | Full Claude Flow |
|---------|---------------------|------------------|
| **Transparency** | Complete decision visibility | Limited introspection |
| **Personalization** | Fully customizable to your style | One-size-fits-all approach |
| **Coordination Control** | Fine-grained process control | Automated swarm management |
| **Learning Approach** | Transparent AI partnership | Black-box automation |
| **Decision Insight** | Full reasoning explanations | Result-focused output |
| **Customization** | Personal workflow adaptation | Enterprise configuration |

## 🎯 Perfect For

- **Developers** who want to understand AI decision-making
- **Teams** seeking transparent collaboration with AI
- **Researchers** studying human-AI interaction patterns
- **Professionals** who prefer explainable AI processes
- **Anyone** who values transparency and control in AI systems

## 🤝 Community & Support

- **Transparency Questions?** [Open an issue](https://github.com/masharratt/claude-flow-novice/issues) with the "transparency" label
- **Personalization Ideas?** [Share your insights](https://github.com/masharratt/claude-flow-novice/discussions)
- **Want to contribute?** Check out [CONTRIBUTING.md](./CONTRIBUTING.md) - we especially value transparency improvements

## 🪝 Revolutionary DevOps Hook System

**NEW**: Claude Flow Personal includes a breakthrough **Agent Feedback System** that enables subagents to receive structured dependency analysis and self-execute solutions without spawning new agents.

### 🎯 Key Features
- **🛡️ Security Protection** - Prevents edits to .env files and sensitive data
- **⚡ Fast File Testing** - <5 second feedback for Rust, TypeScript, JavaScript, Python
- **🧠 Smart Dependency Analysis** - Progressive validation based on dependency completeness
- **🤖 Agent Feedback Loop** - Subagents receive structured feedback and self-execute fixes
- **📚 Auto-Documentation** - Maintains docs/COMPONENTS.md, ARCHITECTURE.md, etc.

### 🚀 How It Works
```bash
# 1. Install the hook system
./config/hooks/install.sh

# 2. Configure Claude Code hooks
{
  "hooks": {
    "pre-edit": "node config/hooks/hook-manager.cjs execute pre-edit",
    "post-edit": "node config/hooks/hook-manager.cjs execute post-edit"
  }
}

# 3. Watch the magic happen
# - Security validation prevents dangerous edits
# - Fast testing provides immediate feedback
# - Dependencies are automatically analyzed
# - Subagents receive structured feedback and implement missing dependencies
# - Documentation updates automatically
```

### 🆕 Agent Self-Execution Breakthrough
Instead of spawning new agents, the system provides **structured feedback** to the calling subagent:

```
🤖 AGENT FEEDBACK: DEPENDENCIES TO IMPLEMENT
📊 SUMMARY:
  🔍 Missing dependencies: 3
  ⏱️  Estimated effort: 15 minutes
  💡 Suggested approach: Create stub implementations first

🎯 ACTION ITEMS FOR AGENT:
1. CREATE: missing-user-service.js
   Class: MissingUserService
   Methods needed: validateUser, getOrderHistory
   Constructor args: options
   Hints: async methods required
```

The subagent then **self-executes** based on this feedback, preserving context and eliminating agent spawning overhead.

**Result**: 84% faster dependency resolution with perfect context preservation! 🚀

📖 **Full Documentation**: [`config/hooks/README.md`](./config/hooks/README.md)

## 🧪 Test Reports

Automated validation of agent-human communication portal available at [`playwright-report/`](./playwright-report/README.md).

## 🗺️ Roadmap

### v2.0 - Enterprise Security & Isolation
- **Container Isolation**: Docker/Podman containerization for agent sandboxing
  - Resource limits (memory, CPU, I/O) per agent type
  - Process isolation preventing cross-agent interference
  - Automated cleanup and resource management
- **Enterprise Credential Management**: Secure credential vault integration
  - Encrypted credential storage with key rotation
  - Scoped permissions per agent type
  - Audit logging and compliance tracking
- **Production Security Hardening**: Address identified security vulnerabilities
  - Input validation and sanitization
  - Command injection prevention
  - Resource exhaustion protection

### v2.1 - Advanced Orchestration
- **Multi-node Swarm Scaling**: Distributed agent execution across multiple machines
- **Advanced Consensus Protocols**: Enhanced Byzantine fault tolerance
- **Real-time Resource Monitoring**: Live dashboards and alerting

### v3.0 - AI-Native Platform
- **Natural Language Orchestration**: Plain English swarm coordination
- **Hybrid Cloud Deployment**: On-premises and cloud-native execution

## 🛣️ Future Roadmap

### Phase 4: Advanced Learning & Intelligence (Future Enhancement)
*Moved to future roadmap after core validation system completion*

**Smart Learning Capabilities:**
- **ML Pattern Recognition**: Automatically detect completion quality patterns (target: 85% accuracy)
- **Predictive Failure Detection**: Early warning system for potential issues (target: 70% prevention)
- **Cross-Project Learning**: Share successful patterns between projects (target: 20% improvement)
- **Adaptive Thresholds**: Dynamic quality standards based on project complexity (target: 15% better accuracy)

**Why Future**: Core validation system (Phases 1-3) successfully prevents false completion claims through real test execution. Phase 4 learning features are valuable enhancements but not essential for production deployment.

**Implementation Priority**: After core system adoption and user feedback collection.

## 🗺️ Documentation Navigation

### 📚 **Essential Reading**
- **[📖 Documentation Hub](./docs/INDEX.md)** - Complete guide index with learning paths
- **[🗺️ Site Map](./docs/SITE_MAP.md)** - Comprehensive navigation and cross-references
- **[🎯 User Guide](./docs/USER_GUIDE.md)** - Step-by-step tutorials and examples
- **[🔧 API Reference](./docs/API_DOCUMENTATION.md)** - Complete API documentation

### 🎯 **By User Type**
| Role | Start Here | Next Steps | Advanced |
|------|------------|------------|----------|
| **New Users** | [User Guide](./docs/USER_GUIDE.md) | [Agent Catalog](./docs/AGENTS.md) | [SPARC Methods](./docs/SPARC.md) |
| **Developers** | [Development Workflow](./docs/DEVELOPMENT_WORKFLOW.md) | [API Docs](./docs/API_DOCUMENTATION.md) | [Architecture](./docs/ARCHITECTURE.md) |
| **DevOps** | [Deployment Guide](./docs/DEPLOYMENT.md) | [Security Report](./docs/SECURITY_AUDIT_REPORT.md) | [Performance Analysis](./docs/performance-analysis-report.md) |
| **Architects** | [Architecture Guide](./docs/ARCHITECTURE.md) | [Technical Specs](./docs/technical-implementation-guide.md) | [Validation Reports](./docs/validation/) |

### 🔗 **Quick Links**
- **🤖 [Agent Catalog](./docs/AGENTS.md)** - All 54+ specialized agents
- **🐝 [Swarm Intelligence](./docs/SWARM.md)** - Coordination patterns and topologies
- **⚡ [SPARC Development](./docs/SPARC.md)** - Structured development methodology
- **🔧 [MCP Tools](./docs/MCP_TOOLS.md)** - 112 automation tools reference
- **🚀 [Deployment](./docs/DEPLOYMENT.md)** - Production setup and scaling

### 🆘 **Need Help?**
- **[📋 Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions
- **[🎯 CLI Validation](./docs/cli-validation-report.md)** - Command reference and validation
- **[📊 Performance Tips](./docs/performance-analysis-report.md)** - Optimization strategies
- **[🔍 Site Map](./docs/SITE_MAP.md)** - Find any documentation quickly

### 🌐 **External Resources**
- **[GitHub Repository](https://github.com/ruvnet/claude-flow)** - Source code and issues
- **[Community Discord](https://discord.gg/claude-flow)** - Real-time support and discussions
- **[Stack Overflow](https://stackoverflow.com/questions/tagged/claude-flow)** - Technical Q&A

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

<div align="center">

**Built for transparent human-AI collaboration**

*See everything. Control everything. Personalize everything.*

</div>