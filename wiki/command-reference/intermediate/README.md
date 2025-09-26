# Intermediate Commands Reference

Multi-agent coordination commands for users ready to orchestrate complex workflows with multiple AI agents working together.

## 🎯 Prerequisites

Before using intermediate commands, ensure you've mastered:
- ✅ Basic agent spawning and management
- ✅ Individual SPARC workflows
- ✅ Configuration and troubleshooting
- ✅ Single-agent development patterns

## 📚 Intermediate Command Categories

### Multi-Agent Coordination
Commands for managing teams of agents working together.

### Advanced SPARC Workflows
Sophisticated development workflows with multiple phases and agents.

### Memory Management
Cross-session and cross-agent knowledge management.

### Quality Automation
Advanced quality gates and automated code review systems.

### Performance Monitoring
System performance analysis and optimization.

---

## 🕸️ Multi-Agent Coordination Commands

### `swarm init` - Initialize Agent Swarm
Set up coordinated groups of agents with specific topologies.

```bash
# Initialize basic mesh swarm
npx claude-flow@alpha swarm init --topology mesh

# Initialize hierarchical swarm with coordinator
npx claude-flow@alpha swarm init \
  --topology hierarchical \
  --coordinator system-architect \
  --max-agents 8

# Initialize specialized swarm
npx claude-flow@alpha swarm init \
  --topology ring \
  --strategy sequential \
  --focus quality-assurance
```

**Topology Options:**
- `mesh` - Peer-to-peer coordination for collaborative work
- `hierarchical` - Coordinator-led for structured projects
- `ring` - Sequential processing for pipeline workflows
- `star` - Central hub for complex orchestration

**Parameters:**
- `--topology <type>` - Swarm coordination pattern
- `--coordinator <agent-type>` - Lead coordinator agent
- `--max-agents <number>` - Maximum concurrent agents
- `--strategy <strategy>` - Coordination strategy
- `--focus <domain>` - Specialization focus area

### `agents spawn-team` - Spawn Coordinated Agent Teams
Create multiple agents that work together on related tasks.

```bash
# Spawn full-stack development team
npx claude-flow@alpha agents spawn-team \
  backend-dev:"Build Express.js API with authentication" \
  frontend-dev:"Create React UI with routing" \
  tester:"Comprehensive testing strategy" \
  reviewer:"Security and quality review"

# Spawn quality assurance team
npx claude-flow@alpha agents spawn-team \
  --coordination hierarchical \
  reviewer:"Code quality and style review" \
  security-manager:"Security vulnerability assessment" \
  performance-optimizer:"Performance analysis and optimization" \
  api-docs:"Documentation generation and maintenance"
```

**Team Patterns:**
```bash
# Full-stack web development
npx claude-flow@alpha agents spawn-team \
  backend-dev:"REST API with database" \
  frontend-dev:"React SPA with state management" \
  database-architect:"PostgreSQL schema design" \
  cicd-engineer:"Deployment and CI/CD setup"

# ML/Data science team
npx claude-flow@alpha agents spawn-team \
  data-scientist:"Exploratory data analysis" \
  ml-developer:"Model training and evaluation" \
  data-engineer:"ETL pipeline development" \
  mlops-engineer:"Model deployment and monitoring"

# Code quality team
npx claude-flow@alpha agents spawn-team \
  --topology ring \
  code-analyzer:"Static analysis and metrics" \
  security-manager:"Security audit and hardening" \
  performance-optimizer:"Performance profiling" \
  reviewer:"Final quality review"
```

### `swarm orchestrate` - Coordinate Complex Tasks
Distribute complex tasks across multiple agents with intelligent coordination.

```bash
# Orchestrate full application development
npx claude-flow@alpha swarm orchestrate \
  --strategy adaptive \
  --max-agents 6 \
  "build e-commerce platform with user management, product catalog, and payment processing"

# Orchestrate with specific agent assignments
npx claude-flow@alpha swarm orchestrate \
  --agents backend-dev,frontend-dev,tester,reviewer \
  --parallel-where-possible \
  "implement user authentication system with social login"
```

**Orchestration Strategies:**
- `adaptive` - Dynamic agent assignment based on task complexity
- `parallel` - Maximum parallelization where dependencies allow
- `sequential` - Step-by-step coordination with clear handoffs
- `specialized` - Task routing to most appropriate agent types

### `swarm status` - Monitor Swarm Activity
Check the health and progress of agent swarms.

```bash
# Basic swarm status
npx claude-flow@alpha swarm status

# Detailed status with agent breakdown
npx claude-flow@alpha swarm status --detailed

# Real-time monitoring view
npx claude-flow@alpha swarm status --monitor

# Performance metrics
npx claude-flow@alpha swarm status --metrics
```

**Output Example:**
```
Swarm Status: ACTIVE
Topology: Mesh (5 agents)
Coordination Efficiency: 94%

Agent Coordination Map:
┌─────────────────┬──────────────┬────────────────┬──────────────┐
│ Agent           │ Status       │ Current Task   │ Coordination │
├─────────────────┼──────────────┼────────────────┼──────────────┤
│ backend-dev-001 │ Working      │ API endpoints  │ 3 peers      │
│ frontend-dev-001│ Working      │ React comp.    │ 2 peers      │
│ tester-001      │ Waiting      │ Test planning  │ 4 peers      │
│ reviewer-001    │ Working      │ Security audit │ 2 peers      │
│ cicd-eng-001    │ Planning     │ Deploy setup   │ 1 peer       │
└─────────────────┴──────────────┴────────────────┴──────────────┘

Communication Flow: 12 messages/min
Resource Utilization: 78%
```

---

## 🔄 Advanced SPARC Workflows

### `sparc orchestrate` - Multi-Agent SPARC
Execute SPARC workflows with specialized agents for each phase.

```bash
# SPARC with specialized agents
npx claude-flow@alpha sparc orchestrate \
  --specification researcher \
  --architecture system-architect \
  --refinement coder,tester \
  --completion reviewer,cicd-engineer \
  "enterprise user management system"

# Parallel SPARC for complex features
npx claude-flow@alpha sparc orchestrate \
  --parallel-features \
  --coordination mesh \
  "multi-tenant SaaS platform with authentication, billing, and analytics"
```

**Phase-Specific Agent Assignment:**
- `--specification <agent>` - Requirements analysis agent
- `--pseudocode <agent>` - Algorithm design agent
- `--architecture <agent>` - System design agent
- `--refinement <agents>` - Implementation team
- `--completion <agents>` - Integration and testing team

### `sparc batch` - Batch SPARC Processing
Run multiple SPARC workflows in coordinated batches.

```bash
# Batch process related features
npx claude-flow@alpha sparc batch \
  --features "user-auth,user-profile,password-reset" \
  --coordination-mode sequential \
  --shared-memory true

# Parallel feature development
npx claude-flow@alpha sparc batch \
  --features "frontend-ui,backend-api,database-schema" \
  --coordination-mode parallel \
  --cross-team-communication true
```

### `sparc pipeline` - Custom SPARC Pipelines
Create custom development pipelines with specific phase sequences.

```bash
# Custom pipeline with additional phases
npx claude-flow@alpha sparc pipeline \
  "analysis → design → prototype → implement → test → security-audit → deploy" \
  "payment processing system"

# Iterative pipeline with feedback loops
npx claude-flow@alpha sparc pipeline \
  --iterative \
  --feedback-agents reviewer,security-manager \
  "spec → arch → impl → review → refine" \
  "real-time chat system"
```

---

## 🧠 Memory Management Commands

### `memory store` - Store Knowledge
Store information for cross-agent and cross-session access.

```bash
# Store project-level information
npx claude-flow@alpha memory store \
  --key "project/architecture" \
  --scope project \
  --data "microservices with event-driven communication"

# Store agent-specific learning
npx claude-flow@alpha memory store \
  --key "agent/coder-001/patterns" \
  --scope agent \
  --tags "successful,javascript,react" \
  --data "component composition patterns that worked well"

# Store shared team knowledge
npx claude-flow@alpha memory store \
  --key "team/api-standards" \
  --scope shared \
  --tags "standards,api-design,rest" \
  --data "REST API design standards and best practices"
```

**Scope Options:**
- `session` - Current development session only
- `project` - Current project lifetime
- `agent` - Specific agent learning
- `shared` - Cross-project shared knowledge

### `memory get` - Retrieve Stored Information
Access previously stored knowledge and context.

```bash
# Retrieve specific information
npx claude-flow@alpha memory get "project/architecture"

# Search by tags
npx claude-flow@alpha memory search --tags "authentication,security"

# Get agent-specific memories
npx claude-flow@alpha memory get --agent coder-001 --category patterns

# Retrieve with context
npx claude-flow@alpha memory get "project/api-design" --include-context
```

### `memory transfer` - Cross-Project Knowledge Transfer
Transfer successful patterns between projects.

```bash
# Transfer patterns from successful project
npx claude-flow@alpha memory transfer \
  --from-project "ecommerce-success" \
  --to-project "current" \
  --domains "authentication,payment,security"

# Transfer with adaptation
npx claude-flow@alpha memory transfer \
  --from-project "react-app" \
  --to-project "vue-app" \
  --adapt-for-technology vue \
  --confidence-threshold 0.8
```

### `memory analytics` - Memory System Analytics
Analyze memory usage and effectiveness.

```bash
# Memory usage statistics
npx claude-flow@alpha memory analytics usage

# Knowledge effectiveness metrics
npx claude-flow@alpha memory analytics effectiveness

# Agent learning progress
npx claude-flow@alpha memory analytics learning --agent coder-001
```

---

## 🔍 Quality Automation Commands

### `hooks enable` - Enable Automated Quality Gates
Set up automated quality checks throughout the development workflow.

```bash
# Enable comprehensive quality hooks
npx claude-flow@alpha hooks enable \
  --language javascript \
  --framework react \
  --quality-level strict

# Enable security-focused hooks
npx claude-flow@alpha hooks enable \
  --focus security \
  --agents security-manager,reviewer \
  --automated-fixes true

# Custom hook configuration
npx claude-flow@alpha hooks enable \
  --pre-commit "lint,test,security-scan" \
  --post-edit "format,type-check" \
  --pre-deploy "integration-test,performance-check"
```

**Quality Levels:**
- `basic` - Essential linting and testing
- `standard` - Code style, testing, basic security
- `strict` - Comprehensive quality gates
- `enterprise` - Full compliance and audit trails

### `quality-gate` - Configure Quality Gates
Set up specific quality requirements that must be met.

```bash
# Configure comprehensive quality gates
npx claude-flow@alpha hooks quality-gate \
  --requirements "tests-pass,coverage-90,lint-clean,security-scan-pass" \
  --blocking true \
  --notifications true

# Performance-focused quality gates
npx claude-flow@alpha hooks quality-gate \
  --requirements "performance-benchmark,memory-usage-low,bundle-size-limit" \
  --thresholds "response-time:200ms,memory:100MB,bundle:500KB"

# Security-focused quality gates
npx claude-flow@alpha hooks quality-gate \
  --requirements "security-audit,dependency-scan,secret-scan" \
  --security-level high \
  --compliance-frameworks "OWASP,GDPR"
```

### `review orchestrate` - Automated Code Review
Set up multi-agent code review processes.

```bash
# Multi-perspective code review
npx claude-flow@alpha review orchestrate \
  --reviewers security-manager,performance-optimizer,reviewer \
  --review-criteria "security,performance,maintainability,testing" \
  --files "src/**/*.js"

# Specialized review for critical components
npx claude-flow@alpha review orchestrate \
  --reviewers security-manager \
  --focus security \
  --critical-path true \
  --files "src/auth/**/*"
```

---

## 📊 Performance Monitoring Commands

### `monitor` - Advanced Monitoring
Monitor system performance, agent efficiency, and workflow metrics.

```bash
# Comprehensive monitoring
npx claude-flow@alpha monitor \
  --metrics "agent-performance,coordination-efficiency,resource-usage" \
  --interval 30s \
  --dashboard true

# Agent-specific monitoring
npx claude-flow@alpha monitor \
  --agents coder-001,reviewer-001 \
  --focus performance \
  --alert-thresholds high

# Workflow monitoring
npx claude-flow@alpha monitor \
  --workflow sparc \
  --phases all \
  --bottleneck-detection true
```

### `metrics` - Detailed Metrics Analysis
Analyze detailed performance and efficiency metrics.

```bash
# Agent performance metrics
npx claude-flow@alpha metrics agents \
  --period "24h" \
  --breakdown by-type \
  --export metrics-report.json

# Coordination efficiency metrics
npx claude-flow@alpha metrics coordination \
  --swarm-id current \
  --analyze communication-patterns \
  --optimization-suggestions true

# SPARC workflow metrics
npx claude-flow@alpha metrics sparc \
  --phase-breakdown true \
  --efficiency-analysis true \
  --compare-with-baseline true
```

### `optimize` - Performance Optimization
Optimize system performance based on metrics analysis.

```bash
# Auto-optimize based on current metrics
npx claude-flow@alpha optimize \
  --auto-tune true \
  --focus "coordination,resource-usage" \
  --preserve-quality-gates true

# Optimize specific components
npx claude-flow@alpha optimize agents \
  --target-efficiency 95% \
  --adjust-timeouts true \
  --rebalance-workload true

# Optimize coordination patterns
npx claude-flow@alpha optimize coordination \
  --topology auto-select \
  --communication-patterns optimize \
  --reduce-overhead true
```

---

## 🔄 Integration Commands

### `github integrate` - GitHub Integration
Integrate with GitHub repositories for automated workflows.

```bash
# Set up GitHub integration
npx claude-flow@alpha github integrate \
  --repo "owner/repo-name" \
  --webhooks pr,push,issue \
  --auto-review true

# Configure PR automation
npx claude-flow@alpha github pr-automation \
  --reviewers security-manager,reviewer \
  --quality-gates strict \
  --auto-merge-when-ready true
```

### `cicd setup` - CI/CD Integration
Set up continuous integration and deployment pipelines.

```bash
# Configure CI/CD with agent integration
npx claude-flow@alpha cicd setup \
  --platform github-actions \
  --agents tester,security-manager,cicd-engineer \
  --quality-gates "test,security,performance"

# Set up deployment automation
npx claude-flow@alpha cicd deploy-automation \
  --environments "staging,production" \
  --approval-workflow true \
  --rollback-automation true
```

---

## 🎮 Advanced Interactive Commands

### `dashboard` - Real-Time Dashboard
Launch interactive dashboards for monitoring and control.

```bash
# Launch comprehensive dashboard
npx claude-flow@alpha dashboard

# Agent coordination dashboard
npx claude-flow@alpha dashboard agents \
  --real-time true \
  --metrics detailed

# Performance monitoring dashboard
npx claude-flow@alpha dashboard performance \
  --alerts true \
  --historical-data 7d
```

### `workflow designer` - Visual Workflow Design
Design complex workflows with visual interface.

```bash
# Launch workflow designer
npx claude-flow@alpha workflow designer

# Design SPARC workflow
npx claude-flow@alpha workflow designer sparc \
  --template enterprise \
  --customizable-phases true

# Design custom agent coordination
npx claude-flow@alpha workflow designer coordination \
  --topology custom \
  --agent-types all
```

---

## 🚨 Advanced Troubleshooting

### `diagnose` - Advanced Diagnostics
Comprehensive system diagnostics and issue resolution.

```bash
# Full system diagnosis
npx claude-flow@alpha diagnose \
  --comprehensive true \
  --include-performance true \
  --generate-report true

# Diagnose coordination issues
npx claude-flow@alpha diagnose coordination \
  --swarm-id current \
  --analyze-communication true \
  --suggest-fixes true

# Diagnose agent performance
npx claude-flow@alpha diagnose agents \
  --performance-analysis true \
  --bottleneck-detection true \
  --optimization-recommendations true
```

### `recovery` - System Recovery
Advanced recovery procedures for complex issues.

```bash
# Intelligent recovery
npx claude-flow@alpha recovery \
  --auto-detect-issues true \
  --preserve-work true \
  --gradual-restoration true

# Coordination recovery
npx claude-flow@alpha recovery coordination \
  --reset-topology false \
  --preserve-agent-state true \
  --restart-communication true
```

---

## 🎯 Best Practices for Intermediate Users

### Coordination Patterns
1. **Start with mesh topology** for small teams (3-5 agents)
2. **Use hierarchical** for larger teams with clear leadership
3. **Implement quality gates** early in the coordination process
4. **Monitor coordination efficiency** and adjust topology as needed

### Memory Management
1. **Store successful patterns** for reuse across projects
2. **Use appropriate scopes** (session, project, agent, shared)
3. **Tag knowledge effectively** for easy retrieval
4. **Transfer knowledge between similar projects**

### Quality Automation
1. **Enable hooks gradually** - start basic, add complexity
2. **Configure quality gates** based on project requirements
3. **Use multi-agent reviews** for critical components
4. **Monitor quality metrics** to ensure effectiveness

---

## 🚀 Ready for Expert Level?

You're ready for [Expert Commands](../expert/README.md) when you can:

✅ **Coordinate 4-6 agents effectively** in mesh or hierarchical topologies
✅ **Design custom SPARC workflows** with appropriate agent assignments
✅ **Implement automated quality gates** with multiple review agents
✅ **Use memory system effectively** for knowledge transfer
✅ **Monitor and optimize performance** of multi-agent systems
✅ **Troubleshoot coordination issues** independently

**Next:** [Expert Commands Reference](../expert/README.md)

---

**Need help?** Check [Troubleshooting Guide](../../troubleshooting/README.md) or use `npx claude-flow@alpha --help` for command assistance.