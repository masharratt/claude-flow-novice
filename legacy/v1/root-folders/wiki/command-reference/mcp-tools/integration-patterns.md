# MCP Integration Patterns

Advanced patterns for integrating Claude Flow with Claude Code using MCP tools and Task spawning.

## 🎯 Pattern Categories

### [Sequential Coordination](#sequential-coordination)
Step-by-step workflows with handoffs between agents.

### [Parallel Execution](#parallel-execution)
Concurrent agent work with synchronization points.

### [Hierarchical Coordination](#hierarchical-coordination)
Leader-follower patterns with centralized coordination.

### [Adaptive Workflows](#adaptive-workflows)
Self-organizing patterns that adjust based on context.

---

## 🔄 Sequential Coordination

### Pattern 1: Development Pipeline

```javascript
// Setup sequential pipeline
mcp__claude-flow__swarm_init({
  topology: "ring",
  maxAgents: 5,
  strategy: "sequential"
})

// Store pipeline configuration
mcp__claude-flow__memory_usage({
  action: "store",
  key: "pipeline/config",
  value: JSON.stringify({
    stages: ["analysis", "design", "implementation", "testing", "deployment"],
    handoff_requirements: {
      "analysis": ["requirements_doc", "technical_spec"],
      "design": ["architecture_doc", "api_contracts"],
      "implementation": ["working_code", "unit_tests"],
      "testing": ["test_results", "coverage_report"],
      "deployment": ["deployment_config", "monitoring_setup"]
    }
  }),
  namespace: "pipeline"
})

// Stage 1: Requirements Analysis
Task("Business Analyst", `
  Analyze project requirements:
  - Gather functional requirements
  - Identify non-functional requirements
  - Create user stories and acceptance criteria
  - Document technical constraints

  Deliverables (store in memory):
  - requirements_doc: Detailed requirements specification
  - technical_spec: Technical feasibility analysis

  Handoff protocol:
  - Store deliverables with key 'pipeline/stage1/output'
  - Notify next stage: npx claude-flow@alpha hooks notify --message "Analysis complete"
`, "analyst")

// Stage 2: System Design (waits for Stage 1)
Task("System Architect", `
  Wait for analysis completion, then design system:

  Pre-task:
  - Retrieve requirements: memory get pipeline/stage1/output
  - Validate all requirements are documented

  Design tasks:
  - Create system architecture
  - Design database schema
  - Define API contracts
  - Plan deployment architecture

  Deliverables:
  - architecture_doc: System design documentation
  - api_contracts: OpenAPI specifications

  Handoff:
  - Store deliverables with key 'pipeline/stage2/output'
  - Validate completeness before handoff
`, "system-architect")

// Stage 3: Implementation (waits for Stage 2)
Task("Development Team", `
  Wait for design completion, then implement:

  Pre-task:
  - Retrieve design: memory get pipeline/stage2/output
  - Review API contracts and architecture

  Implementation:
  - Build backend services per architecture
  - Implement database schema and migrations
  - Create API endpoints per contracts
  - Write unit tests for all components

  Deliverables:
  - working_code: Functional implementation
  - unit_tests: Comprehensive test suite (90% coverage)

  Handoff:
  - Store code and tests with key 'pipeline/stage3/output'
  - Ensure all tests pass before handoff
`, "backend-dev")

// Stage 4: Quality Assurance (waits for Stage 3)
Task("QA Engineer", `
  Wait for implementation completion, then test:

  Pre-task:
  - Retrieve code: memory get pipeline/stage3/output
  - Set up testing environment

  Testing:
  - Execute integration testing
  - Perform end-to-end testing
  - Conduct performance testing
  - Generate coverage reports

  Deliverables:
  - test_results: Comprehensive test report
  - coverage_report: Code coverage analysis

  Handoff:
  - Store results with key 'pipeline/stage4/output'
  - Ensure all tests pass before handoff
`, "tester")

// Stage 5: Deployment (waits for Stage 4)
Task("DevOps Engineer", `
  Wait for testing completion, then deploy:

  Pre-task:
  - Retrieve test results: memory get pipeline/stage4/output
  - Validate all quality gates passed

  Deployment:
  - Create deployment configurations
  - Set up monitoring and alerting
  - Deploy to staging environment
  - Validate deployment health

  Deliverables:
  - deployment_config: Production-ready configs
  - monitoring_setup: Comprehensive monitoring

  Final handoff:
  - Store final deliverables with key 'pipeline/stage5/output'
  - Generate deployment report
`, "cicd-engineer")
```

### Pattern 2: Code Review Chain

```javascript
// Sequential review pattern
mcp__claude-flow__swarm_init({
  topology: "ring",
  maxAgents: 4,
  strategy: "quality-first"
})

Task("Primary Developer", `
  Implement feature with multiple review stages:
  - Write initial implementation
  - Create comprehensive tests
  - Document code and APIs

  Handoff preparation:
  - Store code with key 'review/implementation'
  - Include self-review checklist completion
`, "coder")

Task("Code Reviewer", `
  Review implementation quality:
  - Retrieve code: memory get review/implementation
  - Check code quality and standards
  - Verify test coverage and quality
  - Review documentation completeness

  Output:
  - Store review feedback with key 'review/code-review'
  - Flag any blocking issues
`, "reviewer")

Task("Security Reviewer", `
  Security-focused review:
  - Retrieve code and initial review: memory get review/*
  - Perform security analysis
  - Check for vulnerabilities
  - Validate security best practices

  Output:
  - Store security assessment with key 'review/security'
  - Provide security recommendations
`, "security-manager")

Task("Final Approver", `
  Final review and approval:
  - Retrieve all review data: memory search review/*
  - Validate all concerns addressed
  - Make final approval decision
  - Merge if approved or request changes

  Output:
  - Store final decision with key 'review/final-decision'
  - Update project status
`, "tech-lead")
```

---

## ⚡ Parallel Execution

### Pattern 3: Multi-Service Development

```javascript
// Parallel development with synchronization
mcp__claude-flow__swarm_init({
  topology: "mesh",
  maxAgents: 8,
  strategy: "parallel"
})

// Store shared contracts
mcp__claude-flow__memory_usage({
  action: "store",
  key: "contracts/api-interfaces",
  value: JSON.stringify({
    user_service: {
      endpoints: ["/users", "/auth", "/profile"],
      events: ["user.created", "user.updated"]
    },
    product_service: {
      endpoints: ["/products", "/categories", "/search"],
      events: ["product.created", "product.updated"]
    },
    order_service: {
      endpoints: ["/orders", "/checkout", "/payments"],
      events: ["order.created", "order.completed"]
    }
  }),
  namespace: "shared-contracts"
})

// Parallel service development
Task("User Service Team", `
  Develop user management service:
  - Implement authentication and authorization
  - Build user profile management
  - Create admin user management

  Coordination:
  - Follow API contracts from memory: shared-contracts/api-interfaces
  - Publish service updates: hooks notify --message "User service milestone"
  - Share database schemas: memory store user-service/schema
`, "backend-dev")

Task("Product Service Team", `
  Develop product catalog service:
  - Build product CRUD operations
  - Implement category management
  - Create search and filtering

  Coordination:
  - Follow API contracts from memory: shared-contracts/api-interfaces
  - Coordinate with order service for product data
  - Share product models: memory store product-service/models
`, "backend-dev")

Task("Order Service Team", `
  Develop order processing service:
  - Build shopping cart functionality
  - Implement checkout process
  - Create payment integration

  Coordination:
  - Follow API contracts from memory: shared-contracts/api-interfaces
  - Integrate with user service for authentication
  - Share order workflows: memory store order-service/workflows
`, "backend-dev")

Task("Frontend Team", `
  Build unified frontend consuming all services:
  - Create user interface components
  - Implement state management
  - Build responsive design

  Coordination:
  - Monitor all service development: memory search *-service/*
  - Adapt to API changes from backend teams
  - Share UI components: memory store frontend/components
`, "frontend-dev")

// Infrastructure team works in parallel
Task("DevOps Team", `
  Setup infrastructure for all services:
  - Create Kubernetes manifests for each service
  - Set up service mesh and communication
  - Configure monitoring and logging

  Coordination:
  - Monitor service development progress
  - Adapt infrastructure to service requirements
  - Share deployment configs: memory store devops/configs
`, "cicd-engineer")

// QA team works in parallel
Task("QA Team", `
  Develop testing strategy for microservices:
  - Create contract testing between services
  - Build end-to-end test scenarios
  - Set up performance testing

  Coordination:
  - Monitor API contract changes
  - Test service interactions as they develop
  - Share test utilities: memory store qa/test-utils
`, "tester")
```

### Pattern 4: Feature Team Coordination

```javascript
// Parallel feature teams with sync points
mcp__claude-flow__swarm_init({
  topology: "star",
  coordinator: "tech-lead",
  maxAgents: 10
})

// Coordinator manages all teams
Task("Technical Lead", `
  Coordinate multiple feature teams:
  - Monitor progress of all teams
  - Resolve conflicts and dependencies
  - Make architectural decisions
  - Conduct daily sync meetings

  Coordination responsibilities:
  - Review memory updates from all teams
  - Identify and resolve blockers
  - Maintain project timeline
  - Facilitate cross-team communication
`, "tech-lead")

// Feature Team A
Task("Auth Feature Team", `
  Implement authentication system:
  - OAuth2 implementation
  - JWT token management
  - User session handling

  Daily sync with coordinator:
  - Report progress via memory store auth-team/daily-status
  - Escalate blockers to coordinator
`, "backend-dev")

// Feature Team B
Task("Payment Feature Team", `
  Implement payment processing:
  - Stripe integration
  - Payment method management
  - Subscription handling

  Daily sync with coordinator:
  - Report progress via memory store payment-team/daily-status
  - Coordinate with auth team for user context
`, "backend-dev")

// Feature Team C
Task("Analytics Feature Team", `
  Implement analytics and reporting:
  - Event tracking system
  - Dashboard creation
  - Report generation

  Daily sync with coordinator:
  - Report progress via memory store analytics-team/daily-status
  - Coordinate with other teams for data requirements
`, "backend-dev")
```

---

## 🏗️ Hierarchical Coordination

### Pattern 5: Enterprise Development Structure

```javascript
// Enterprise hierarchical coordination
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "engineering-manager",
  maxAgents: 15,
  strategy: "enterprise"
})

// Top-level coordination
Task("Engineering Manager", `
  Manage entire engineering organization:
  - Oversee all development teams
  - Make strategic technical decisions
  - Coordinate with product management
  - Manage resource allocation

  Management responsibilities:
  - Review team lead reports: memory search teams/*/status
  - Make architecture decisions: memory store decisions/architecture
  - Resolve cross-team conflicts
  - Plan sprint and release cycles
`, "engineering-manager")

// Team leads coordinate their teams
Task("Backend Team Lead", `
  Lead backend development team:
  - Coordinate backend developers
  - Review code and architecture
  - Plan backend sprints
  - Report to engineering manager

  Team coordination:
  - Assign tasks to backend developers
  - Review memory updates from team: backend-team/*
  - Report team status: memory store teams/backend/status
`, "tech-lead")

Task("Frontend Team Lead", `
  Lead frontend development team:
  - Coordinate frontend developers
  - Manage UI/UX implementation
  - Plan frontend sprints
  - Report to engineering manager

  Team coordination:
  - Assign tasks to frontend developers
  - Review memory updates from team: frontend-team/*
  - Report team status: memory store teams/frontend/status
`, "tech-lead")

Task("DevOps Team Lead", `
  Lead infrastructure and DevOps team:
  - Coordinate infrastructure development
  - Manage CI/CD pipelines
  - Plan infrastructure sprints
  - Report to engineering manager

  Team coordination:
  - Assign tasks to DevOps engineers
  - Review memory updates from team: devops-team/*
  - Report team status: memory store teams/devops/status
`, "tech-lead")

// Individual contributors
Task("Senior Backend Developer", `
  Senior backend development work:
  - Implement complex backend features
  - Mentor junior developers
  - Review code from team members

  Reporting:
  - Report to backend team lead
  - Store progress: memory store backend-team/senior-dev/progress
  - Mentor others based on memory shared knowledge
`, "backend-dev")

Task("Backend Developer 1", `
  Backend development work:
  - Implement assigned features
  - Write comprehensive tests
  - Participate in code reviews

  Reporting:
  - Report to backend team lead
  - Store progress: memory store backend-team/dev1/progress
`, "backend-dev")

Task("Backend Developer 2", `
  Backend development work:
  - Implement assigned features
  - Write comprehensive tests
  - Participate in code reviews

  Reporting:
  - Report to backend team lead
  - Store progress: memory store backend-team/dev2/progress
`, "backend-dev")
```

### Pattern 6: Quality Gate Hierarchy

```javascript
// Hierarchical quality assurance
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "qa-manager",
  maxAgents: 8,
  strategy: "quality-gates"
})

Task("QA Manager", `
  Manage overall quality assurance:
  - Define quality standards and gates
  - Coordinate testing teams
  - Report quality metrics to stakeholders

  Quality oversight:
  - Review all quality reports: memory search qa/*/reports
  - Make release decisions based on quality gates
  - Escalate quality issues to engineering
`, "qa-manager")

Task("Test Lead", `
  Lead testing team coordination:
  - Plan testing strategies
  - Coordinate test execution
  - Report to QA manager

  Testing coordination:
  - Assign testing tasks to QA engineers
  - Review test results: memory search qa/testing/*
  - Report testing status: memory store qa/testing/status
`, "test-lead")

Task("QA Engineer 1", `
  Execute functional testing:
  - Perform manual testing
  - Create automated test scripts
  - Report bugs and issues

  Testing execution:
  - Follow test plans from test lead
  - Store test results: memory store qa/testing/functional-results
`, "tester")

Task("QA Engineer 2", `
  Execute performance testing:
  - Conduct load testing
  - Analyze performance metrics
  - Create performance reports

  Performance testing:
  - Follow performance test plans
  - Store results: memory store qa/testing/performance-results
`, "performance-tester")

Task("Security Tester", `
  Execute security testing:
  - Perform penetration testing
  - Conduct vulnerability assessments
  - Create security reports

  Security testing:
  - Follow security test plans
  - Store results: memory store qa/testing/security-results
`, "security-tester")
```

---

## 🔄 Adaptive Workflows

### Pattern 7: Self-Organizing Development

```javascript
// Adaptive self-organizing workflow
mcp__claude-flow__daa_init({
  enableCoordination: true,
  enableLearning: true,
  persistenceMode: "auto"
})

// Create adaptive workflow
mcp__claude-flow__daa_workflow_create({
  id: "adaptive-development",
  name: "Self-Organizing Development Process",
  strategy: "adaptive",
  steps: [
    "autonomous-analysis",
    "adaptive-planning",
    "parallel-implementation",
    "continuous-optimization",
    "self-validation"
  ],
  dependencies: {
    "adaptive-planning": ["autonomous-analysis"],
    "parallel-implementation": ["adaptive-planning"],
    "self-validation": ["parallel-implementation"]
  }
})

// Create autonomous agents
mcp__claude-flow__daa_agent_create({
  id: "adaptive-architect",
  cognitivePattern: "systems",
  enableMemory: true,
  learningRate: 0.4,
  capabilities: ["architecture", "planning", "optimization"]
})

mcp__claude-flow__daa_agent_create({
  id: "adaptive-developer",
  cognitivePattern: "convergent",
  enableMemory: true,
  learningRate: 0.3,
  capabilities: ["coding", "testing", "debugging"]
})

// Execute adaptive workflow
mcp__claude-flow__daa_workflow_execute({
  workflow_id: "adaptive-development",
  agentIds: ["adaptive-architect", "adaptive-developer"],
  parallelExecution: true
})

// Spawn Task agents that work with adaptive system
Task("Adaptive Coordinator", `
  Coordinate with autonomous agents:
  - Monitor autonomous workflow progress
  - Adapt coordination strategy based on results
  - Learn from successful patterns

  Adaptive coordination:
  - Analyze agent performance: memory search daa/agents/*/metrics
  - Adjust workflows based on effectiveness
  - Share learnings across project
`, "coordinator")

Task("Human Supervisor", `
  Provide oversight for autonomous development:
  - Monitor autonomous agent decisions
  - Intervene when necessary
  - Validate critical design decisions

  Supervision responsibilities:
  - Review autonomous decisions: memory search daa/decisions/*
  - Provide feedback for learning: daa_agent_adapt with performance scores
  - Escalate issues requiring human judgment
`, "tech-lead")
```

### Pattern 8: Dynamic Team Formation

```javascript
// Dynamic agent spawning based on project needs
mcp__claude-flow__swarm_init({
  topology: "adaptive",
  strategy: "dynamic",
  autoScale: true,
  learningEnabled: true
})

Task("Project Analyzer", `
  Analyze project requirements and dynamically form teams:

  Analysis tasks:
  - Assess project complexity and scope
  - Identify required skills and specializations
  - Determine optimal team size and structure
  - Plan dynamic agent spawning strategy

  Dynamic team formation:
  - Spawn backend team if API development needed
  - Spawn frontend team if UI development needed
  - Spawn DevOps team if infrastructure needed
  - Spawn security team if security requirements high
  - Spawn performance team if performance critical

  Adaptive logic:
  - Monitor project progress and adjust team composition
  - Spawn additional specialists as needs emerge
  - Scale down teams when work is complete
`, "system-architect")

Task("Team Formation Coordinator", `
  Execute dynamic team formation based on analysis:

  Coordination responsibilities:
  - Monitor project analysis results: memory get project/analysis
  - Spawn additional Task agents as needed
  - Coordinate between dynamically formed teams
  - Manage team lifecycle (spawn/scale/dissolve)

  Example dynamic spawning:
  if (project.hasAPIRequirements) {
    // Spawn backend team
    Task("Backend Team", "Implement API requirements", "backend-dev");
  }

  if (project.hasUIRequirements) {
    // Spawn frontend team
    Task("Frontend Team", "Implement UI requirements", "frontend-dev");
  }

  if (project.hasSecurityRequirements) {
    // Spawn security team
    Task("Security Team", "Implement security requirements", "security-manager");
  }
`, "coordinator")
```

---

## 🔧 Integration Best Practices

### Memory Management Patterns

```javascript
// Structured memory organization
const memoryPatterns = {
  // Project-level memory
  project: {
    namespace: "project-context",
    keys: ["requirements", "architecture", "decisions"],
    ttl: 604800 // 7 days
  },

  // Team-level memory
  teams: {
    namespace: "team-coordination",
    keys: ["status", "progress", "blockers"],
    ttl: 86400 // 1 day
  },

  // Session-level memory
  session: {
    namespace: "session-state",
    keys: ["active-tasks", "current-context"],
    ttl: 3600 // 1 hour
  },

  // Shared artifacts
  artifacts: {
    namespace: "shared-artifacts",
    keys: ["contracts", "schemas", "configs"],
    ttl: 259200 // 3 days
  }
}

// Store with consistent patterns
mcp__claude-flow__memory_usage({
  action: "store",
  key: "project/requirements",
  value: JSON.stringify(requirements),
  namespace: "project-context",
  ttl: 604800
})
```

### Coordination Protocols

```javascript
// Standard coordination protocol for all agents
const coordinationProtocol = {
  preTask: [
    "npx claude-flow@alpha hooks pre-task --description '{task}'",
    "npx claude-flow@alpha hooks session-restore --session-id '{session}'"
  ],

  duringTask: [
    "npx claude-flow@alpha hooks post-edit --file '{file}' --memory-key '{key}'",
    "npx claude-flow@alpha hooks notify --message '{progress}'"
  ],

  postTask: [
    "npx claude-flow@alpha hooks post-task --task-id '{task}'",
    "npx claude-flow@alpha hooks session-end --export-metrics true"
  ]
}

// Apply to all Task agent instructions
Task("Example Agent", `
  Your task instructions here...

  COORDINATION PROTOCOL:
  Before starting:
  ${coordinationProtocol.preTask.join('\n  ')}

  During work:
  ${coordinationProtocol.duringTask.join('\n  ')}

  After completion:
  ${coordinationProtocol.postTask.join('\n  ')}
`, "agent-type")
```

### Error Handling and Recovery

```javascript
// Robust error handling pattern
Task("Resilient Agent", `
  Your task with error handling:

  Error handling protocol:
  1. Catch and log all errors
  2. Store error context in memory
  3. Attempt automatic recovery
  4. Escalate if recovery fails

  Implementation:
  try {
    // Your task implementation
  } catch (error) {
    // Store error context
    npx claude-flow@alpha memory store error/context --data "{error details}"

    // Attempt recovery
    npx claude-flow@alpha hooks error-recovery --error-type "{type}"

    // Escalate if needed
    npx claude-flow@alpha hooks escalate --severity "high" --message "{error}"
  }
`, "agent-type")
```

---

**Next Steps:**
- Choose the appropriate pattern for your project
- Start with simple coordination and add complexity gradually
- Monitor coordination efficiency and adjust as needed
- Use memory patterns consistently across all agents
- Implement proper error handling and recovery