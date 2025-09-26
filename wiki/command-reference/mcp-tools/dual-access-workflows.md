# Dual Access Workflows

Seamless integration between CLI and MCP access methods for claude-flow projects, enabling flexible development workflows.

## 🔄 Overview

Claude Flow supports dual access patterns where CLI users and MCP users can work on the same projects seamlessly:

- **CLI Access**: Terminal-based commands for direct control
- **MCP Access**: Claude Code integration for AI-assisted development
- **Shared State**: Both access methods share memory, configuration, and project state
- **Real-time Sync**: Changes from either access method are immediately available to the other

## 🎯 Common Workflow Scenarios

### [CLI Setup → MCP Development](#cli-setup-mcp-development)
Project initialized via CLI, developed with Claude Code MCP

### [MCP Setup → CLI Monitoring](#mcp-setup-cli-monitoring)
Project created with Claude Code, monitored via CLI

### [Hybrid Collaboration](#hybrid-collaboration)
Teams using both CLI and MCP simultaneously

### [Context Switching](#context-switching)
Switching between access methods on the same project

---

## 🚀 CLI Setup → MCP Development

### Scenario: Team Lead Uses CLI, Developers Use Claude Code

**Step 1: CLI Project Initialization**

```bash
# Team lead sets up project structure
npx claude-flow@alpha init --template enterprise-web
cd my-enterprise-app

# Configure project settings
npx claude-flow@alpha config set project.name "enterprise-web-app"
npx claude-flow@alpha config set project.type "full-stack"
npx claude-flow@alpha config set topology "hierarchical"

# Set up initial swarm topology
npx claude-flow@alpha swarm init --topology hierarchical --max-agents 8
npx claude-flow@alpha swarm spawn --agents "system-architect,tech-lead"

# Store project requirements
npx claude-flow@alpha memory store project/requirements --data '{
  "type": "enterprise-web-application",
  "features": ["user-management", "dashboard", "reporting", "admin-panel"],
  "tech_stack": {
    "frontend": "React + TypeScript",
    "backend": "Node.js + Express",
    "database": "PostgreSQL",
    "deployment": "Kubernetes"
  },
  "timeline": "12 weeks",
  "team_size": "6 developers"
}'

# Set up team structure
npx claude-flow@alpha memory store team/structure --data '{
  "roles": {
    "system-architect": "overall design and coordination",
    "backend-lead": "API and database development",
    "frontend-lead": "UI and user experience",
    "devops-lead": "infrastructure and deployment",
    "qa-lead": "testing and quality assurance"
  },
  "communication": {
    "daily_standup": "09:00 UTC",
    "sprint_planning": "Mondays 10:00 UTC",
    "retrospective": "Fridays 16:00 UTC"
  }
}'

# Configure development standards
npx claude-flow@alpha memory store standards/coding --data '{
  "linting": "ESLint + Prettier",
  "testing": "Jest (90% coverage minimum)",
  "documentation": "JSDoc for functions, README for modules",
  "git": "Conventional commits, feature branch workflow",
  "review": "All changes require code review"
}'

# Export project state for MCP users
npx claude-flow@alpha session export --output ./project-state.json
echo "Project initialized! Developers can now connect via Claude Code MCP."
```

**Step 2: Developer Joins via Claude Code MCP**

```javascript
// Developer opens Claude Code and uses MCP tools

// 1. Check project status
mcp__claude-flow__swarm_status({ verbose: true })

// 2. Retrieve project context
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "project/requirements",
  namespace: "default"
})

mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "team/structure",
  namespace: "default"
})

mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "standards/coding",
  namespace: "default"
})

// 3. Spawn development agents via Task tool
Task("Backend Developer", `
  Join the enterprise web application project as backend developer:

  PROJECT CONTEXT:
  - Retrieve requirements: memory get project/requirements
  - Follow team structure: memory get team/structure
  - Apply coding standards: memory get standards/coding

  DEVELOPMENT TASKS:
  - Design and implement REST API architecture
  - Set up PostgreSQL database with proper migrations
  - Create authentication and authorization system
  - Build user management endpoints
  - Implement reporting data aggregation

  COORDINATION:
  - Report progress: memory store team/backend/progress
  - Share API contracts: memory store api/contracts
  - Coordinate with frontend team via hooks
  - Participate in daily standups via memory updates

  TECHNICAL REQUIREMENTS:
  - Node.js + Express + TypeScript
  - PostgreSQL with Sequelize ORM
  - JWT authentication with refresh tokens
  - Input validation with Joi
  - Comprehensive error handling
  - 90% test coverage with Jest
`, "backend-dev")

Task("Frontend Developer", `
  Join the enterprise web application project as frontend developer:

  PROJECT CONTEXT:
  - Retrieve requirements: memory get project/requirements
  - Get backend APIs: memory get api/contracts (when available)
  - Follow coding standards: memory get standards/coding

  DEVELOPMENT TASKS:
  - Create React application with TypeScript
  - Implement user authentication flows
  - Build dashboard and reporting interfaces
  - Create admin panel for user management
  - Ensure responsive design and accessibility

  COORDINATION:
  - Monitor backend progress: memory search team/backend/*
  - Share UI components: memory store team/frontend/components
  - Report progress: memory store team/frontend/progress
  - Coordinate with backend for API integration

  TECHNICAL REQUIREMENTS:
  - React 18 + TypeScript + Vite
  - Material-UI or Tailwind CSS
  - Redux Toolkit for state management
  - React Query for API state
  - Testing with Jest and React Testing Library
`, "frontend-dev")
```

**Step 3: CLI Monitoring and Coordination**

```bash
# Team lead monitors progress via CLI
npx claude-flow@alpha swarm status --verbose
npx claude-flow@alpha agents list --filter active

# Check team progress
npx claude-flow@alpha memory search "team/*/progress"
npx claude-flow@alpha memory get api/contracts

# Monitor coordination efficiency
npx claude-flow@alpha monitor --real-time --duration 300

# Generate progress reports
npx claude-flow@alpha report generate --type progress --output ./reports/
npx claude-flow@alpha metrics export --format json --output ./metrics/

# Manage team coordination
npx claude-flow@alpha hooks list --active
npx claude-flow@alpha session status --detailed

# Make project adjustments if needed
npx claude-flow@alpha config set topology adaptive  # Adjust based on team dynamics
npx claude-flow@alpha swarm scale --target-agents 6  # Scale based on workload
```

---

## 🎯 MCP Setup → CLI Monitoring

### Scenario: Developer Starts with Claude Code, Team Monitors via CLI

**Step 1: MCP Project Creation**

```javascript
// Developer creates project using Claude Code MCP

// 1. Initialize advanced swarm
mcp__claude-flow__swarm_init({
  topology: "adaptive",
  maxAgents: 10,
  strategy: "ai-first"
})

// 2. Store comprehensive project context
mcp__claude-flow__memory_usage({
  action: "store",
  key: "project/context",
  value: JSON.stringify({
    name: "ai-powered-analytics-platform",
    description: "Real-time analytics dashboard with ML predictions",
    architecture: "microservices",
    deployment: "cloud-native",
    features: {
      "data-ingestion": "Real-time data streaming",
      "ml-predictions": "Machine learning models for forecasting",
      "dashboard": "Interactive analytics dashboard",
      "api": "RESTful and GraphQL APIs",
      "admin": "Admin panel for system management"
    },
    tech_stack: {
      "frontend": "Next.js + TypeScript + D3.js",
      "backend": "Python FastAPI + Node.js",
      "ml": "Python scikit-learn + TensorFlow",
      "database": "PostgreSQL + Redis + MongoDB",
      "streaming": "Apache Kafka",
      "deployment": "Docker + Kubernetes + AWS"
    }
  }),
  namespace: "project-context"
})

// 3. Set up advanced coordination
mcp__claude-flow__daa_init({
  enableCoordination: true,
  enableLearning: true,
  persistenceMode: "auto"
})

// 4. Create autonomous agents
mcp__claude-flow__daa_agent_create({
  id: "ai-architect",
  cognitivePattern: "systems",
  enableMemory: true,
  learningRate: 0.4,
  capabilities: ["ai-architecture", "ml-systems", "data-engineering"]
})

// 5. Orchestrate AI-powered development
mcp__claude-flow__task_orchestrate({
  task: "Build AI-powered analytics platform with autonomous development",
  strategy: "adaptive",
  maxAgents: 8,
  priority: "high"
})

// 6. Spawn specialized AI development teams
Task("AI/ML Team", `
  Build AI and machine learning components:

  CORE RESPONSIBILITIES:
  - Design ML pipeline architecture
  - Implement real-time prediction models
  - Create data preprocessing and feature engineering
  - Build model training and deployment automation
  - Implement A/B testing for models

  TECHNICAL IMPLEMENTATION:
  - Python FastAPI for ML service APIs
  - TensorFlow/PyTorch for deep learning models
  - scikit-learn for classical ML algorithms
  - MLflow for experiment tracking
  - Apache Kafka for real-time data streaming
  - Redis for model caching and feature store

  COORDINATION:
  - Store ML models: memory store ml/models
  - Share prediction APIs: memory store ml/apis
  - Document data requirements: memory store ml/data-requirements
`, "ml-developer")

Task("Data Engineering Team", `
  Build data infrastructure and pipelines:

  CORE RESPONSIBILITIES:
  - Design data architecture and streaming pipelines
  - Implement real-time data ingestion
  - Create data transformation and validation
  - Build data warehousing and analytics
  - Implement data governance and quality monitoring

  TECHNICAL IMPLEMENTATION:
  - Apache Kafka for data streaming
  - Apache Spark for data processing
  - PostgreSQL for transactional data
  - MongoDB for document storage
  - Redis for caching and session storage
  - Elasticsearch for search and analytics

  COORDINATION:
  - Store data schemas: memory store data/schemas
  - Share pipeline configs: memory store data/pipelines
  - Document data flows: memory store data/flows
`, "data-engineer")

Task("Full-Stack Team", `
  Build frontend and backend application:

  CORE RESPONSIBILITIES:
  - Create interactive analytics dashboard
  - Build real-time data visualization
  - Implement user authentication and management
  - Create admin panel for system configuration
  - Build responsive and accessible UI

  TECHNICAL IMPLEMENTATION:
  - Next.js + TypeScript for frontend
  - D3.js and Chart.js for visualizations
  - Node.js + Express for backend APIs
  - GraphQL for flexible data queries
  - WebSockets for real-time updates
  - Progressive Web App (PWA) features

  COORDINATION:
  - Monitor ML APIs: memory get ml/apis
  - Use data schemas: memory get data/schemas
  - Share UI components: memory store frontend/components
`, "fullstack-dev")
```

**Step 2: CLI Team Joins for Monitoring**

```bash
# Team lead connects via CLI to monitor MCP-created project
npx claude-flow@alpha session restore --auto-detect

# Check project status created by MCP
npx claude-flow@alpha swarm status --verbose
npx claude-flow@alpha memory search "project/*"

# View MCP-created project context
npx claude-flow@alpha memory get project/context --format json | jq .

# Monitor AI agents and autonomous development
npx claude-flow@alpha agents list --filter autonomous
npx claude-flow@alpha daa status --detailed

# Set up CLI-based monitoring
npx claude-flow@alpha monitor start --real-time \
  --metrics coordination,performance,ml-accuracy \
  --alerts high-priority \
  --dashboard terminal

# Monitor ML model performance
npx claude-flow@alpha memory search "ml/models" | jq '.[] | .accuracy'
npx claude-flow@alpha memory get ml/apis --format table

# Track data pipeline health
npx claude-flow@alpha memory get data/pipelines --format json | \
  jq '.[] | select(.status == "error")'

# Generate automated reports
npx claude-flow@alpha report schedule \
  --type comprehensive \
  --frequency daily \
  --recipients team-leads@company.com \
  --format markdown

# Set up alerting for critical issues
npx claude-flow@alpha alerts configure \
  --ml-accuracy-threshold 0.85 \
  --coordination-efficiency-threshold 0.80 \
  --error-rate-threshold 0.05 \
  --notification-channels slack,email
```

**Step 3: Hybrid Management**

```bash
# CLI: Manage project configuration
npx claude-flow@alpha config set ml.retrain_threshold 0.1
npx claude-flow@alpha config set data.retention_days 90
npx claude-flow@alpha config set alerts.escalation_time 30m

# CLI: Scale based on workload
npx claude-flow@alpha swarm scale --target-agents 12  # Scale up for high load
npx claude-flow@alpha agents spawn --type performance-optimizer --count 2

# CLI: Manage deployments
npx claude-flow@alpha deploy status --environment production
npx claude-flow@alpha deploy rollback --version previous --environment staging
```

```javascript
// MCP: Adapt development based on CLI insights
// Developer receives CLI insights and adapts MCP coordination

mcp__claude-flow__agent_metrics({ metric: "performance" })
mcp__claude-flow__swarm_status({ verbose: true })

// Spawn additional agents based on CLI monitoring data
Task("Performance Optimization Team", `
  Address performance issues identified by CLI monitoring:

  PERFORMANCE FOCUS:
  - Optimize ML model inference times
  - Improve data pipeline throughput
  - Reduce dashboard loading times
  - Optimize database query performance

  MONITORING INTEGRATION:
  - Review CLI performance reports: memory get monitoring/reports
  - Address bottlenecks identified by team leads
  - Implement caching and optimization strategies
`, "performance-optimizer")
```

---

## 🤝 Hybrid Collaboration

### Scenario: Mixed Team with CLI and MCP Users

**Project Setup (Team Lead - CLI)**

```bash
# Initialize collaborative environment
npx claude-flow@alpha init --template hybrid-collaboration
npx claude-flow@alpha config set collaboration.mode "hybrid"
npx claude-flow@alpha config set access.cli_users "team-lead,devops,qa-lead"
npx claude-flow@alpha config set access.mcp_users "developers,designers,ml-engineers"

# Set up shared coordination
npx claude-flow@alpha swarm init --topology mesh --max-agents 15
npx claude-flow@alpha coordination enable --methods "cli,mcp,hooks,memory"

# Create shared workspace
npx claude-flow@alpha workspace create --name "collaborative-development" \
  --access-methods "cli,mcp" \
  --sync-strategy "real-time"

# Store collaboration protocols
npx claude-flow@alpha memory store collaboration/protocols --data '{
  "communication": {
    "daily_standup": "via CLI status + MCP progress reports",
    "sprint_planning": "CLI planning + MCP task orchestration",
    "code_review": "CLI approval + MCP automated review"
  },
  "tools": {
    "project_management": "CLI commands + MCP orchestration",
    "monitoring": "CLI real-time + MCP metrics",
    "deployment": "CLI pipelines + MCP coordination"
  },
  "handoffs": {
    "requirements": "CLI → MCP memory store",
    "implementation": "MCP Task agents → CLI review",
    "deployment": "MCP preparation → CLI execution"
  }
}'
```

**Development Phase (Mixed Team)**

```bash
# CLI: DevOps Engineer sets up infrastructure
npx claude-flow@alpha infra init --provider aws --region us-west-2
npx claude-flow@alpha infra create --template microservices-k8s

# Store infrastructure configs for MCP teams
npx claude-flow@alpha memory store infra/configs --file ./k8s-configs.yaml
npx claude-flow@alpha memory store infra/secrets --file ./secrets-template.yaml

# CLI: QA Lead sets up testing strategy
npx claude-flow@alpha testing strategy create --type comprehensive
npx claude-flow@alpha testing environments setup --stages "dev,staging,prod"

# Store testing requirements for MCP teams
npx claude-flow@alpha memory store testing/strategy --data '{
  "unit_tests": "90% coverage minimum",
  "integration_tests": "All API endpoints",
  "e2e_tests": "Critical user journeys",
  "performance_tests": "Load testing with 1000 concurrent users",
  "security_tests": "OWASP compliance"
}'
```

```javascript
// MCP: Development teams implement features

// Get infrastructure and testing requirements from CLI team
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "infra/configs",
  namespace: "default"
})

mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "testing/strategy",
  namespace: "default"
})

// Coordinate development with CLI-managed infrastructure
Task("Microservices Development Team", `
  Develop microservices with CLI-managed infrastructure:

  INFRASTRUCTURE INTEGRATION:
  - Use infrastructure configs: memory get infra/configs
  - Follow deployment patterns: memory get infra/secrets
  - Coordinate with DevOps team via hooks

  TESTING INTEGRATION:
  - Follow testing strategy: memory get testing/strategy
  - Implement required test coverage
  - Coordinate with QA team for test execution

  DEVELOPMENT TASKS:
  - Build user service with authentication
  - Create product catalog service
  - Implement order processing service
  - Build notification service
  - Create API gateway for routing

  COORDINATION:
  - Report progress to CLI monitoring
  - Share service contracts in memory
  - Use hooks for milestone notifications
`, "microservices-dev")

Task("Frontend Development Team", `
  Build user interfaces with backend coordination:

  BACKEND INTEGRATION:
  - Monitor microservices progress: memory search services/*/status
  - Use service contracts: memory get services/contracts
  - Coordinate deployment with CLI pipeline

  UI DEVELOPMENT:
  - Create responsive web application
  - Build mobile-friendly interfaces
  - Implement real-time features
  - Ensure accessibility compliance

  TESTING COORDINATION:
  - Follow testing strategy from CLI team
  - Coordinate with QA for E2E testing
  - Share UI components and patterns
`, "frontend-dev")
```

**Monitoring and Coordination (Mixed Access)**

```bash
# CLI: Real-time monitoring by team leads
npx claude-flow@alpha monitor dashboard --hybrid-mode \
  --show-cli-users --show-mcp-agents --show-coordination

# CLI: Generate comprehensive reports
npx claude-flow@alpha report generate --type hybrid-collaboration \
  --include cli-metrics,mcp-progress,coordination-efficiency \
  --output ./reports/hybrid-$(date +%Y%m%d).md

# CLI: Manage conflicts and blockers
npx claude-flow@alpha conflicts detect --between cli,mcp
npx claude-flow@alpha blockers resolve --priority high --assign team-lead
```

```javascript
// MCP: Adaptive coordination based on CLI insights
mcp__claude-flow__swarm_monitor({
  duration: 600,  // 10 minutes
  interval: 30    // 30 seconds
})

// Adjust coordination based on CLI feedback
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "monitoring/cli-insights",
  namespace: "coordination"
})

// Spawn additional coordination agents if needed
Task("Hybrid Coordinator", `
  Coordinate between CLI and MCP teams:

  COORDINATION RESPONSIBILITIES:
  - Bridge communication between CLI and MCP users
  - Resolve conflicts between access methods
  - Ensure consistent project state across tools
  - Facilitate hybrid team collaboration

  MONITORING:
  - Track CLI team progress: memory search cli-team/*
  - Monitor MCP agent efficiency: memory search mcp-agents/*
  - Identify coordination bottlenecks
  - Report hybrid collaboration metrics
`, "hybrid-coordinator")
```

---

## 🔄 Context Switching

### Seamless Switching Between CLI and MCP

**From CLI to MCP**

```bash
# CLI: Export current session for MCP access
npx claude-flow@alpha session export --format mcp --output ./mcp-session.json

# Store current context in memory for MCP access
npx claude-flow@alpha memory store session/cli-context --data '{
  "current_task": "backend-api-development",
  "active_agents": ["backend-dev-001", "database-architect-001"],
  "progress": {
    "authentication": "completed",
    "user-management": "in-progress",
    "api-documentation": "pending"
  },
  "next_steps": ["complete user endpoints", "write integration tests"],
  "blockers": ["database migration pending review"]
}'

# Set up context switch marker
npx claude-flow@alpha hooks notify --message "context-switch.cli-to-mcp" \
  --metadata '{"user": "developer-name", "timestamp": "$(date -Iseconds)"}'

echo "Session exported. MCP user can now access full context."
```

```javascript
// MCP: Import CLI session and continue work
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "session/cli-context",
  namespace: "default"
})

// Get current project state
mcp__claude-flow__swarm_status({ verbose: true })
mcp__claude-flow__agent_list({ filter: "active" })

// Continue work where CLI left off
Task("Backend Developer", `
  Continue backend development from CLI handoff:

  CONTEXT RESTORATION:
  - Current task: backend-api-development (from CLI context)
  - Authentication: completed ✓
  - User management: in-progress (resume here)
  - API documentation: pending

  NEXT STEPS (from CLI context):
  - Complete user endpoints (registration, profile, password reset)
  - Write integration tests for all user endpoints
  - Address blocker: database migration pending review

  CONTINUATION STRATEGY:
  - Review completed authentication code
  - Resume user management endpoint development
  - Coordinate with database team for migration review
  - Maintain progress tracking for potential CLI handback
`, "backend-dev")

// Update progress for potential switch back to CLI
mcp__claude-flow__memory_usage({
  action: "store",
  key: "session/mcp-progress",
  value: JSON.stringify({
    "resumed_from": "cli-context",
    "current_focus": "user-management-endpoints",
    "completed_since_handoff": [],
    "blockers_resolved": [],
    "new_blockers": [],
    "ready_for_cli_handback": false
  }),
  namespace: "session-state"
})
```

**From MCP to CLI**

```javascript
// MCP: Prepare handback to CLI
mcp__claude-flow__memory_usage({
  action: "store",
  key: "session/mcp-handback",
  value: JSON.stringify({
    "completed_work": [
      "user registration endpoint with validation",
      "user profile management endpoint",
      "password reset functionality",
      "integration tests for user endpoints (95% coverage)"
    ],
    "current_state": {
      "user-management": "completed",
      "api-documentation": "in-progress",
      "integration-testing": "completed"
    },
    "next_priorities": [
      "complete API documentation",
      "deploy to staging environment",
      "conduct performance testing"
    ],
    "handback_notes": "All user management functionality complete and tested. Ready for staging deployment.",
    "files_modified": [
      "/src/controllers/userController.js",
      "/src/models/User.js",
      "/src/routes/users.js",
      "/tests/integration/user.test.js"
    ]
  }),
  namespace: "session-handback"
})

// Notify CLI user of readiness for handback
mcp__claude-flow__task_orchestrate({
  task: "Prepare project handback to CLI user",
  strategy: "sequential",
  priority: "high"
})
```

```bash
# CLI: Import MCP session and continue
npx claude-flow@alpha session import --source mcp --auto-restore

# Review MCP progress
npx claude-flow@alpha memory get session/mcp-handback --format json | jq .

# Validate MCP work
npx claude-flow@alpha test run --coverage --integration
npx claude-flow@alpha lint check --fix-violations

# Continue from where MCP left off
npx claude-flow@alpha deploy staging --validate-first
npx claude-flow@alpha performance test --load-profile production-like

# Update project status
npx claude-flow@alpha status update --milestone "user-management-complete"
npx claude-flow@alpha progress report --include mcp-handback-summary
```

---

## 📊 State Synchronization

### Real-Time State Sync

```bash
# CLI: Enable real-time synchronization
npx claude-flow@alpha sync enable --mode real-time \
  --targets "memory,agents,configuration,progress"

# Monitor synchronization health
npx claude-flow@alpha sync status --watch
```

```javascript
// MCP: Automatic state synchronization
mcp__claude-flow__memory_usage({
  action: "store",
  key: "sync/mcp-state",
  value: JSON.stringify({
    "last_sync": new Date().toISOString(),
    "active_agents": 4,
    "coordination_efficiency": 0.87,
    "memory_usage": "142MB",
    "task_completion_rate": 0.93
  }),
  namespace: "synchronization"
})

// Real-time progress updates
setInterval(() => {
  mcp__claude-flow__memory_usage({
    action: "store",
    key: "sync/heartbeat",
    value: JSON.stringify({
      "timestamp": new Date().toISOString(),
      "status": "active",
      "agents_running": getActiveAgentCount(),
      "current_task": getCurrentTask()
    }),
    namespace: "real-time-sync",
    ttl: 60  // 1 minute TTL for heartbeat
  })
}, 30000)  // Update every 30 seconds
```

### Conflict Resolution

```bash
# CLI: Detect and resolve conflicts
npx claude-flow@alpha conflicts detect --between cli,mcp --auto-resolve
npx claude-flow@alpha conflicts list --status unresolved

# Manual conflict resolution
npx claude-flow@alpha conflicts resolve \
  --conflict-id "memory-key-collision-001" \
  --strategy "mcp-priority" \
  --backup-cli-state
```

```javascript
// MCP: Conflict avoidance strategies
mcp__claude-flow__memory_usage({
  action: "store",
  key: "mcp/exclusive/development-state",  // Use MCP-specific namespace
  value: developmentState,
  namespace: "mcp-exclusive"
})

// Check for conflicts before critical operations
mcp__claude-flow__memory_search({
  pattern: "cli/exclusive/*",
  namespace: "all"
})

// Coordinate with CLI for shared resources
Task("Conflict Resolver", `
  Prevent and resolve CLI/MCP conflicts:

  CONFLICT PREVENTION:
  - Use namespaced memory keys (mcp/*, cli/*)
  - Check for CLI locks before critical operations
  - Coordinate shared resource access via hooks

  CONFLICT RESOLUTION:
  - Detect conflicts: memory search conflicts/*
  - Implement resolution strategies based on priority
  - Backup conflicting states before resolution
  - Notify both CLI and MCP users of resolutions
`, "conflict-resolver")
```

---

## 🛠️ Best Practices

### Memory Namespace Management

```bash
# CLI: Namespace conventions
npx claude-flow@alpha memory store cli/exclusive/deployment-config --data "$config"
npx claude-flow@alpha memory store shared/project/requirements --data "$requirements"
npx claude-flow@alpha memory store handoff/cli-to-mcp/context --data "$context"
```

```javascript
// MCP: Corresponding namespace usage
mcp__claude-flow__memory_usage({
  action: "store",
  key: "mcp/exclusive/development-progress",
  namespace: "mcp-exclusive"
})

mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "shared/project/requirements",
  namespace: "shared"
})
```

### Coordination Protocols

1. **Access Method Identification**: Always identify which tool is being used
2. **State Persistence**: Maintain comprehensive state for handoffs
3. **Conflict Prevention**: Use namespaced resources and coordination locks
4. **Regular Sync**: Implement regular synchronization checkpoints
5. **Documentation**: Document all handoff procedures and contexts

### Communication Patterns

1. **Memory-Based Communication**: Use memory system for asynchronous communication
2. **Hook-Based Notifications**: Use hooks for real-time event communication
3. **Progress Reporting**: Regular progress updates visible to both access methods
4. **Status Dashboards**: Maintain shared status dashboards
5. **Handoff Documentation**: Document all context switches and handoffs

---

**Next Steps:**
- Choose the appropriate dual access pattern for your team
- Set up proper namespace management for memory and state
- Implement conflict detection and resolution procedures
- Establish communication protocols between CLI and MCP users
- Monitor coordination efficiency and optimize as needed