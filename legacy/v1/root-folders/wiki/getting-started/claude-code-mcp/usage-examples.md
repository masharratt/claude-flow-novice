# MCP Usage Examples

**Practical examples** demonstrating how to use Claude Flow Novice MCP tools with Claude Code for real-world development scenarios.

## 🎯 Understanding MCP Integration

Claude Flow Novice provides **dual-mode orchestration**:
- **MCP Tools**: Strategic coordination, monitoring, and planning
- **Claude Code Task Tool**: Actual agent execution and work

This guide shows how to combine both effectively.

## 🚀 Example 1: Single Agent Development

### Scenario: Create a Simple REST API

**In Claude Code, request:**

```
Use claude-flow-novice MCP tools to coordinate the development of a simple REST API with authentication. Set up the coordination strategy first, then spawn agents to do the actual work.
```

**What happens behind the scenes:**

```javascript
// Phase 1: MCP Coordination Setup
mcp__claude-flow__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "adaptive"
})

// Phase 2: Task Orchestration Planning
mcp__claude-flow__task_orchestrate({
  task: "Build REST API with authentication",
  strategy: "sequential",
  priority: "high"
})

// Phase 3: Actual Agent Execution via Task Tool
Task("Backend Developer", "Create Express.js REST API with JWT authentication, CRUD endpoints, and proper error handling", "backend-dev")

Task("Test Engineer", "Write comprehensive test suite with unit and integration tests for the API", "tester")

Task("Documentation Specialist", "Generate API documentation with OpenAPI spec and usage examples", "api-docs")
```

**Expected output:**
- Coordinated development workflow
- Express.js API with authentication
- Complete test suite
- API documentation
- Real-time progress monitoring

## 🔄 Example 2: Multi-Agent Coordination

### Scenario: Full-Stack Web Application

**In Claude Code, request:**

```
Coordinate a full-stack web application development using MCP orchestration. I need a React frontend, Node.js backend, MongoDB database, and comprehensive testing. Set up hierarchical coordination with a lead coordinator.
```

**Coordination workflow:**

```javascript
// Strategic Setup via MCP
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 6,
  coordinator: "fullstack-lead",
  strategy: "adaptive"
})

mcp__claude-flow__task_orchestrate({
  task: "Full-stack web application development",
  strategy: "parallel",
  dependencies: {
    "frontend": ["backend"],
    "testing": ["frontend", "backend"],
    "deployment": ["all"]
  }
})

// Parallel Agent Execution
Task("Tech Lead", "Coordinate full-stack development, define architecture, manage dependencies", "architect")

Task("Backend Developer", "Build Node.js/Express API with MongoDB, authentication, and business logic", "backend-dev")

Task("Frontend Developer", "Create React SPA with modern UI, state management, and API integration", "coder")

Task("Database Expert", "Design MongoDB schema, indexes, and data migration scripts", "code-analyzer")

Task("QA Engineer", "Develop comprehensive testing strategy with unit, integration, and e2e tests", "tester")

Task("DevOps Engineer", "Set up CI/CD pipeline, Docker configuration, and deployment scripts", "cicd-engineer")
```

## 🧪 Example 3: SPARC Methodology Integration

### Scenario: E-commerce Checkout System

**In Claude Code, request:**

```
Use SPARC methodology with MCP coordination to build an e-commerce checkout system. Run all phases systematically with proper agent coordination.
```

**SPARC workflow with MCP:**

```javascript
// Specification Phase
mcp__claude-flow__sparc_mode({
  mode: "specification",
  task_description: "E-commerce checkout system with payment processing",
  options: { include_user_stories: true, define_acceptance_criteria: true }
})

Task("Business Analyst", "Analyze checkout requirements, define user stories, create acceptance criteria", "researcher")

// Pseudocode Phase
Task("Technical Architect", "Design checkout algorithms, payment flows, and error handling logic", "architect")

// Architecture Phase
Task("System Architect", "Create system architecture, API design, database schema, security model", "system-architect")

// Refinement Phase (TDD)
Task("Lead Developer", "Implement checkout system using TDD methodology with 90% test coverage", "coder")

Task("Payment Specialist", "Integrate Stripe/PayPal payment processing with webhook handling", "coder")

// Completion Phase
Task("Integration Tester", "Perform end-to-end testing, integration testing, performance testing", "tester")
```

## 🔍 Example 4: Real-time Monitoring

### Scenario: Monitor Development Progress

**In Claude Code, request:**

```
Set up real-time monitoring of the development team's progress using MCP monitoring tools. Show agent status, performance metrics, and quality indicators.
```

**Monitoring setup:**

```javascript
// Initialize comprehensive monitoring
mcp__claude-flow__swarm_monitor({
  duration: 1800, // 30 minutes
  interval: 30,   // Update every 30 seconds
  detailed: true
})

// Performance metrics tracking
mcp__claude-flow__agent_metrics({
  metric: "all",
  detailed: true
})

// Quality assessment
mcp__claude-flow__task_status({
  detailed: true,
  include_metrics: true
})
```

**Real-time output example:**
```
📊 Development Team Status (Live Updates)

Active Agents: 5
┌─────────────────┬─────────────┬─────────────┬──────────────────┬─────────────┐
│ Agent ID        │ Type        │ Status      │ Current Task     │ Progress    │
├─────────────────┼─────────────┼─────────────┼──────────────────┼─────────────┤
│ backend-001     │ backend-dev │ Working     │ Payment API      │ 78%         │
│ frontend-002    │ coder       │ Working     │ Checkout UI      │ 65%         │
│ database-003    │ analyzer    │ Completed   │ Schema design    │ 100%        │
│ test-004        │ tester      │ Working     │ Integration tests│ 45%         │
│ devops-005      │ cicd        │ Waiting     │ CI/CD setup      │ 0%          │
└─────────────────┴─────────────┴─────────────┴──────────────────┴─────────────┘

Quality Metrics:
├── Code Coverage: 87.3% (Target: 90%)
├── Security Score: 9.2/10
├── Performance Score: 8.8/10
├── Documentation: 92% complete
└── Test Pass Rate: 96.8%

Estimated Completion: 12 minutes
```

## 🔧 Example 5: GitHub Integration

### Scenario: Repository Analysis and Enhancement

**In Claude Code, request:**

```
Use MCP GitHub tools to analyze my repository and coordinate improvements. Analyze code quality, security, performance, and create enhancement plan.
```

**GitHub integration workflow:**

```javascript
// Repository analysis via MCP
mcp__claude-flow__github_analyze({
  repo: "username/my-project",
  analysis_type: ["code_quality", "security", "performance"],
  detailed: true
})

// Coordinate improvement team
Task("Code Quality Analyst", "Analyze codebase for quality issues, technical debt, refactoring opportunities", "reviewer")

Task("Security Auditor", "Perform comprehensive security audit, identify vulnerabilities, suggest fixes", "security-manager")

Task("Performance Expert", "Analyze performance bottlenecks, optimize queries, improve response times", "perf-analyzer")

Task("Documentation Reviewer", "Audit documentation completeness, update README, create missing docs", "api-docs")

// Enhancement coordination
mcp__claude-flow__task_orchestrate({
  task: "Repository enhancement based on analysis",
  strategy: "adaptive",
  priority: "high"
})
```

## 🎨 Example 6: UI/UX Development

### Scenario: Modern React Dashboard

**In Claude Code, request:**

```
Coordinate the development of a modern React dashboard with data visualization, real-time updates, and responsive design. Use MCP tools for component coordination.
```

**UI/UX coordination:**

```javascript
// Frontend-focused swarm
mcp__claude-flow__swarm_init({
  topology: "star",
  coordinator: "ui-lead",
  maxAgents: 4,
  specialty: "frontend"
})

// UI development coordination
Task("UI/UX Lead", "Design component architecture, establish design system, coordinate UI development", "coder")

Task("React Developer", "Build dashboard components, implement routing, state management", "coder")

Task("Data Visualization Expert", "Create charts, graphs, and interactive data displays using D3/Chart.js", "coder")

Task("Responsive Design Specialist", "Ensure mobile-first responsive design, optimize for all screen sizes", "coder")

// Real-time feature coordination
mcp__claude-flow__task_orchestrate({
  task: "Implement real-time dashboard updates",
  strategy: "parallel"
})
```

## 🔒 Example 7: Security-First Development

### Scenario: Secure API Development

**In Claude Code, request:**

```
Coordinate secure API development with security-first approach. Use MCP tools to ensure security is integrated throughout the development process.
```

**Security-focused workflow:**

```javascript
// Security-focused coordination
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "security-lead",
  security_focus: true
})

// Security integration throughout development
Task("Security Architect", "Design security architecture, threat modeling, security requirements", "security-manager")

Task("Secure Backend Developer", "Implement API with security best practices, input validation, encryption", "backend-dev")

Task("Auth Specialist", "Implement robust authentication, authorization, session management", "coder")

Task("Security Tester", "Perform penetration testing, vulnerability assessment, security testing", "security-manager")

Task("Compliance Auditor", "Ensure GDPR, HIPAA compliance, generate security documentation", "reviewer")
```

## 📊 Example 8: Performance Optimization

### Scenario: Application Performance Tuning

**In Claude Code, request:**

```
Use MCP performance tools to analyze and optimize application performance. Coordinate performance improvements across frontend, backend, and database.
```

**Performance optimization workflow:**

```javascript
// Performance-focused analysis
mcp__claude-flow__bottleneck_analyze({
  component: "full-stack",
  metrics: ["response_time", "memory_usage", "cpu_utilization", "database_queries"]
})

// Performance improvement coordination
Task("Performance Analyst", "Analyze performance bottlenecks, identify optimization opportunities", "perf-analyzer")

Task("Backend Optimizer", "Optimize API endpoints, database queries, caching strategies", "coder")

Task("Frontend Optimizer", "Optimize React components, bundle size, lazy loading, code splitting", "coder")

Task("Database Tuner", "Optimize database schemas, indexes, query performance", "code-analyzer")

// Monitor improvements
mcp__claude-flow__performance_monitor({
  metrics: ["response_time", "throughput", "error_rate"],
  alerts: { response_threshold: 200, error_threshold: 1 }
})
```

## 🤖 Example 9: AI-Powered Features

### Scenario: Add Machine Learning Capabilities

**In Claude Code, request:**

```
Coordinate the addition of AI-powered features to an existing application. Use MCP tools to manage the ML development lifecycle.
```

**AI feature development:**

```javascript
// AI/ML focused coordination
mcp__claude-flow__swarm_init({
  topology: "mesh",
  specialty: "ml",
  maxAgents: 5
})

// ML development workflow
Task("ML Engineer", "Design ML models, data pipelines, training infrastructure", "ml-developer")

Task("Data Scientist", "Analyze data, feature engineering, model experimentation", "researcher")

Task("Backend Developer", "Integrate ML models into API, model serving, inference endpoints", "backend-dev")

Task("Frontend Developer", "Create AI-powered UI components, real-time predictions display", "coder")

Task("MLOps Engineer", "Set up model deployment, monitoring, A/B testing, model versioning", "cicd-engineer")

// Neural network coordination
mcp__claude-flow__neural_train({
  pattern_type: "prediction",
  training_data: "user_behavior_patterns",
  epochs: 100
})
```

## 🌐 Example 10: Microservices Architecture

### Scenario: Microservices Deployment

**In Claude Code, request:**

```
Coordinate the development of a microservices architecture with service discovery, API gateway, and container orchestration using MCP tools.
```

**Microservices coordination:**

```javascript
// Microservices architecture setup
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  architecture: "microservices"
})

// Service development coordination
Task("Solutions Architect", "Design microservices architecture, service boundaries, communication patterns", "system-architect")

Task("API Gateway Developer", "Implement API gateway, routing, authentication, rate limiting", "backend-dev")

Task("User Service Developer", "Build user management microservice with authentication", "backend-dev")

Task("Product Service Developer", "Build product catalog microservice with search capabilities", "backend-dev")

Task("Order Service Developer", "Build order processing microservice with event sourcing", "backend-dev")

Task("DevOps Engineer", "Set up Kubernetes, service discovery, monitoring, logging", "cicd-engineer")

Task("Integration Tester", "Test inter-service communication, end-to-end workflows", "tester")

// Service coordination
mcp__claude-flow__task_orchestrate({
  task: "Microservices deployment",
  strategy: "adaptive",
  dependencies: {
    "api_gateway": ["user_service", "product_service"],
    "integration_tests": ["all_services"],
    "deployment": ["all_services", "api_gateway"]
  }
})
```

## 🎯 Best Practices for MCP Usage

### 1. Always Start with Coordination
```javascript
// Good: Set up coordination first
mcp__claude-flow__swarm_init({ topology: "mesh" })
Task("Developer", "Build feature", "coder")

// Avoid: Spawning agents without coordination
Task("Developer", "Build feature", "coder") // Less effective
```

### 2. Use Appropriate Topology
```javascript
// Simple tasks: mesh topology
mcp__claude-flow__swarm_init({ topology: "mesh" })

// Complex projects: hierarchical with coordinator
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "project-lead"
})
```

### 3. Monitor Progress Actively
```javascript
// Set up monitoring for long-running tasks
mcp__claude-flow__swarm_monitor({ duration: 1800, interval: 30 })
```

### 4. Use Memory for Context Sharing
```javascript
// Store important context for agents to share
mcp__claude-flow__memory_store({
  key: "project/requirements",
  data: { framework: "React", database: "MongoDB" }
})
```

## 🚨 Common Pitfalls to Avoid

### 1. Don't Over-Coordinate
```javascript
// Avoid: Too much coordination overhead for simple tasks
// Good: Direct task execution for simple operations
Task("Coder", "Fix typo in README", "coder")

// Avoid: Complex coordination for simple fixes
mcp__claude-flow__swarm_init({ topology: "hierarchical" })
mcp__claude-flow__task_orchestrate({ task: "Fix typo" })
Task("Coder", "Fix typo", "coder")
```

### 2. Don't Forget to Monitor
```javascript
// Always include monitoring for multi-agent tasks
mcp__claude-flow__swarm_monitor({ duration: 300 })
```

### 3. Match Agent Types to Tasks
```javascript
// Good: Use specialized agents
Task("Security Expert", "Security audit", "security-manager")

// Avoid: Generic agents for specialized work
Task("Generic Coder", "Security audit", "coder")
```

## 📚 Next Steps

Now that you understand MCP usage patterns:

1. **[Practice with tutorials](../quick-start/mcp-tutorial.md)** - Hands-on experience
2. **[Learn advanced patterns](../../tutorials/advanced/README.md)** - Complex orchestration
3. **[Explore core concepts](../../core-concepts/README.md)** - Deeper understanding
4. **[Join the community](../../community/discussions/README.md)** - Share experiences

---

**Master tip:** The key to effective MCP usage is combining strategic coordination (MCP tools) with practical execution (Task tool) for optimal results! 🚀