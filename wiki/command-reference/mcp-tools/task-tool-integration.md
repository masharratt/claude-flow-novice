# Task Tool Integration Guide

Complete guide for using Claude Code's Task tool with claude-flow agents for maximum productivity and coordination.

## 🎯 Overview

Claude Code's Task tool is the primary execution engine for claude-flow agents, providing:
- **Real agent spawning** that creates working implementations
- **Parallel execution** of multiple specialized agents
- **Integration with MCP coordination** for team-based development
- **Persistent context** through the claude-flow memory system

## 🚀 Quick Start

### Basic Task Agent Spawning

```javascript
// Simple agent spawning
Task("Backend Developer", "Build a REST API with authentication", "backend-dev")

// With detailed instructions
Task("Full-Stack Developer", `
  Build a complete e-commerce platform:
  - User authentication with JWT
  - Product catalog with search
  - Shopping cart functionality
  - Payment integration with Stripe
  - Admin dashboard for management

  Technical stack:
  - Frontend: React + TypeScript + Tailwind
  - Backend: Node.js + Express + PostgreSQL
  - Authentication: JWT with refresh tokens
  - Payment: Stripe Elements
`, "fullstack-dev")
```

### Task Tool + MCP Coordination

```javascript
// 1. Setup coordination with MCP
mcp__claude-flow__swarm_init({
  topology: "mesh",
  maxAgents: 4,
  strategy: "collaborative"
})

// 2. Spawn coordinated agents with Task tool
Task("Backend Developer", `
  Build backend API with team coordination:

  COORDINATION PROTOCOL:
  - Run: npx claude-flow@alpha hooks pre-task --description "Backend API development"
  - Store progress: npx claude-flow@alpha memory store backend/progress
  - Notify team: npx claude-flow@alpha hooks notify --message "API milestone reached"

  IMPLEMENTATION:
  - Create Express.js server with TypeScript
  - Implement user authentication (JWT)
  - Build product management APIs
  - Create database migrations
  - Write comprehensive tests (90% coverage)
`, "backend-dev")

Task("Frontend Developer", `
  Build React frontend with backend coordination:

  COORDINATION PROTOCOL:
  - Wait for backend APIs: npx claude-flow@alpha memory get backend/progress
  - Store UI progress: npx claude-flow@alpha memory store frontend/progress
  - Share components: npx claude-flow@alpha memory store frontend/components

  IMPLEMENTATION:
  - Create React app with TypeScript
  - Implement authentication flows
  - Build product browsing interface
  - Create shopping cart functionality
  - Ensure mobile responsiveness
`, "frontend-dev")
```

---

## 🏗️ Agent Specializations

### Backend Development Agents

```javascript
// API Development Specialist
Task("API Developer", `
  Develop RESTful APIs with best practices:

  CORE RESPONSIBILITIES:
  - Design and implement REST endpoints
  - Create OpenAPI documentation
  - Implement proper error handling
  - Add input validation and sanitization
  - Write integration tests for all endpoints

  TECHNICAL REQUIREMENTS:
  - Use Express.js with TypeScript
  - Implement JWT authentication middleware
  - Add rate limiting and security headers
  - Create proper HTTP status code responses
  - Implement pagination for list endpoints

  COORDINATION:
  - Store API contracts: memory store api/contracts
  - Share authentication patterns: memory store auth/patterns
  - Coordinate with frontend team via hooks
`, "api-developer")

// Database Specialist
Task("Database Architect", `
  Design and implement database architecture:

  CORE RESPONSIBILITIES:
  - Design normalized database schema
  - Create and manage migrations
  - Implement data access layer
  - Optimize queries and indexing
  - Setup backup and recovery procedures

  TECHNICAL REQUIREMENTS:
  - PostgreSQL with proper indexing
  - Sequelize ORM with TypeScript
  - Database connection pooling
  - Migration scripts for schema changes
  - Seed scripts for development data

  COORDINATION:
  - Share schema: memory store database/schema
  - Document relationships: memory store database/relationships
  - Coordinate with API team for data requirements
`, "database-architect")

// Microservices Specialist
Task("Microservices Developer", `
  Build microservices architecture:

  CORE RESPONSIBILITIES:
  - Design service boundaries
  - Implement inter-service communication
  - Create service discovery mechanisms
  - Implement circuit breakers and retries
  - Setup distributed logging and monitoring

  TECHNICAL REQUIREMENTS:
  - Docker containerization for each service
  - Message queues for async communication
  - API gateway for external requests
  - Health checks and metrics endpoints
  - Kubernetes deployment manifests

  COORDINATION:
  - Store service contracts: memory store services/contracts
  - Share deployment configs: memory store services/deployments
  - Coordinate with DevOps team for infrastructure
`, "microservices-dev")
```

### Frontend Development Agents

```javascript
// React Specialist
Task("React Developer", `
  Build modern React application:

  CORE RESPONSIBILITIES:
  - Create reusable component library
  - Implement state management with Redux Toolkit
  - Build responsive user interfaces
  - Optimize performance and bundle size
  - Implement accessibility standards (WCAG 2.1)

  TECHNICAL REQUIREMENTS:
  - React 18 with TypeScript and hooks
  - Material-UI or Tailwind CSS for styling
  - React Router for navigation
  - React Query for API state management
  - Jest and React Testing Library for tests

  COORDINATION:
  - Share components: memory store ui/components
  - Document patterns: memory store ui/patterns
  - Coordinate with backend for API integration
`, "react-developer")

// Mobile Developer
Task("Mobile Developer", `
  Build mobile applications:

  CORE RESPONSIBILITIES:
  - Create native mobile apps or React Native
  - Implement mobile-specific UI patterns
  - Handle offline functionality
  - Implement push notifications
  - Optimize for mobile performance

  TECHNICAL REQUIREMENTS:
  - React Native or Flutter for cross-platform
  - Native modules for platform-specific features
  - Async storage for offline data
  - Push notification setup
  - App store deployment preparation

  COORDINATION:
  - Share mobile patterns: memory store mobile/patterns
  - Coordinate with backend for mobile APIs
  - Share platform-specific requirements
`, "mobile-developer")

// UI/UX Specialist
Task("UI/UX Developer", `
  Create exceptional user experiences:

  CORE RESPONSIBILITIES:
  - Design user interface mockups and prototypes
  - Implement responsive design patterns
  - Ensure accessibility compliance
  - Optimize user experience flows
  - Create design system and style guide

  TECHNICAL REQUIREMENTS:
  - Figma or Sketch for design mockups
  - CSS-in-JS or Tailwind for styling
  - Accessibility testing tools
  - Performance optimization techniques
  - Cross-browser compatibility testing

  COORDINATION:
  - Share design system: memory store design/system
  - Document UX patterns: memory store ux/patterns
  - Coordinate with frontend developers for implementation
`, "ux-developer")
```

### DevOps and Infrastructure Agents

```javascript
// Cloud Infrastructure Specialist
Task("Cloud Architect", `
  Design and implement cloud infrastructure:

  CORE RESPONSIBILITIES:
  - Design scalable cloud architecture
  - Implement Infrastructure as Code
  - Setup auto-scaling and load balancing
  - Configure security groups and networking
  - Plan disaster recovery procedures

  TECHNICAL REQUIREMENTS:
  - AWS/Azure/GCP cloud platforms
  - Terraform or CloudFormation for IaC
  - Kubernetes for container orchestration
  - Load balancers and CDN setup
  - Monitoring and alerting systems

  COORDINATION:
  - Store infrastructure configs: memory store infra/configs
  - Share deployment procedures: memory store infra/procedures
  - Coordinate with development teams for requirements
`, "cloud-architect")

// CI/CD Pipeline Specialist
Task("CI/CD Engineer", `
  Build comprehensive CI/CD pipelines:

  CORE RESPONSIBILITIES:
  - Create automated build and test pipelines
  - Implement deployment automation
  - Setup monitoring and alerting
  - Configure security scanning
  - Create rollback procedures

  TECHNICAL REQUIREMENTS:
  - GitHub Actions, Jenkins, or GitLab CI
  - Docker and container registries
  - Automated testing integration
  - Security scanning tools (Snyk, SonarQube)
  - Blue-green or canary deployment strategies

  COORDINATION:
  - Store pipeline configs: memory store cicd/pipelines
  - Share deployment strategies: memory store cicd/strategies
  - Coordinate with development teams for requirements
`, "cicd-engineer")

// Security Infrastructure Specialist
Task("Security Engineer", `
  Implement comprehensive security measures:

  CORE RESPONSIBILITIES:
  - Design security architecture
  - Implement identity and access management
  - Setup security monitoring and incident response
  - Configure network security
  - Perform security audits and penetration testing

  TECHNICAL REQUIREMENTS:
  - Identity providers (Auth0, Okta, or custom)
  - Security scanning tools and SIEM systems
  - Network security configuration
  - Encryption for data at rest and in transit
  - Compliance frameworks (SOC2, GDPR, HIPAA)

  COORDINATION:
  - Store security policies: memory store security/policies
  - Share security patterns: memory store security/patterns
  - Coordinate with all teams for security requirements
`, "security-engineer")
```

### Testing and Quality Agents

```javascript
// Test Automation Specialist
Task("Test Automation Engineer", `
  Create comprehensive automated testing:

  CORE RESPONSIBILITIES:
  - Build unit test suites with high coverage
  - Create integration test frameworks
  - Implement end-to-end testing
  - Setup performance and load testing
  - Create test data management systems

  TECHNICAL REQUIREMENTS:
  - Jest, Mocha, or similar for unit tests
  - Supertest for API integration tests
  - Cypress or Playwright for E2E tests
  - Artillery or K6 for performance tests
  - Test data factories and fixtures

  COORDINATION:
  - Store test strategies: memory store testing/strategies
  - Share test utilities: memory store testing/utilities
  - Coordinate with development teams for test requirements
`, "test-automation")

// Quality Assurance Specialist
Task("QA Engineer", `
  Ensure comprehensive quality assurance:

  CORE RESPONSIBILITIES:
  - Perform manual testing of critical features
  - Create test plans and test cases
  - Execute exploratory testing
  - Verify accessibility compliance
  - Coordinate user acceptance testing

  TECHNICAL REQUIREMENTS:
  - Test management tools (TestRail, Jira)
  - Browser testing tools (BrowserStack)
  - Accessibility testing tools (axe, WAVE)
  - Mobile testing on multiple devices
  - Performance testing and analysis

  COORDINATION:
  - Store test results: memory store qa/results
  - Share quality metrics: memory store qa/metrics
  - Coordinate with development teams for bug fixes
`, "qa-engineer")

// Performance Testing Specialist
Task("Performance Engineer", `
  Optimize application performance:

  CORE RESPONSIBILITIES:
  - Conduct performance testing and analysis
  - Identify and resolve performance bottlenecks
  - Implement performance monitoring
  - Optimize database queries and caching
  - Create performance budgets and alerts

  TECHNICAL REQUIREMENTS:
  - Load testing tools (Artillery, JMeter, K6)
  - Application Performance Monitoring (APM)
  - Database performance analysis tools
  - Frontend performance optimization
  - Caching strategies (Redis, CDN)

  COORDINATION:
  - Store performance metrics: memory store performance/metrics
  - Share optimization strategies: memory store performance/optimizations
  - Coordinate with all teams for performance requirements
`, "performance-engineer")
```

---

## 🔄 Coordination Patterns

### Memory-Based Coordination

```javascript
// Shared context pattern
Task("Team Lead", `
  Establish shared project context:

  CONTEXT SETUP:
  - Store project requirements: memory store project/requirements
  - Define technical standards: memory store project/standards
  - Create team communication protocols: memory store project/protocols

  TEAM COORDINATION:
  - Monitor team progress: memory search team/*/progress
  - Resolve blockers and conflicts
  - Make architectural decisions and store them
  - Facilitate cross-team communication
`, "tech-lead")

Task("Backend Developer", `
  Backend development with shared context:

  CONTEXT USAGE:
  - Retrieve requirements: memory get project/requirements
  - Follow standards: memory get project/standards
  - Use protocols: memory get project/protocols

  PROGRESS SHARING:
  - Store progress: memory store team/backend/progress
  - Share APIs: memory store team/backend/apis
  - Report blockers: memory store team/backend/blockers
`, "backend-dev")

Task("Frontend Developer", `
  Frontend development with shared context:

  CONTEXT USAGE:
  - Retrieve requirements: memory get project/requirements
  - Get backend APIs: memory get team/backend/apis
  - Follow standards: memory get project/standards

  PROGRESS SHARING:
  - Store progress: memory store team/frontend/progress
  - Share components: memory store team/frontend/components
  - Report dependencies: memory store team/frontend/dependencies
`, "frontend-dev")
```

### Hook-Based Coordination

```javascript
// Event-driven coordination pattern
Task("Event Coordinator", `
  Manage event-driven team coordination:

  COORDINATION SETUP:
  - Initialize hooks system: npx claude-flow@alpha hooks init
  - Setup event listeners for team milestones
  - Configure notification channels

  EVENT MANAGEMENT:
  - Listen for completion events from all teams
  - Trigger downstream tasks when dependencies complete
  - Escalate blockers and conflicts to leadership
`, "coordinator")

Task("Backend Developer", `
  Backend development with event coordination:

  EVENT INTEGRATION:
  - Pre-task: npx claude-flow@alpha hooks pre-task --description "Backend development"
  - Progress: npx claude-flow@alpha hooks notify --message "API endpoints complete"
  - Completion: npx claude-flow@alpha hooks post-task --task-id "backend-api"

  IMPLEMENTATION:
  - Build backend APIs
  - Emit events at major milestones
  - Listen for frontend requirements
`, "backend-dev")

Task("Frontend Developer", `
  Frontend development with event coordination:

  EVENT INTEGRATION:
  - Listen for backend completion: hooks listen --event "backend-api.complete"
  - Pre-task: npx claude-flow@alpha hooks pre-task --description "Frontend development"
  - Progress: npx claude-flow@alpha hooks notify --message "UI components complete"

  IMPLEMENTATION:
  - Wait for backend APIs to be ready
  - Build frontend interfaces
  - Emit events at major milestones
`, "frontend-dev")
```

### Dependency Management

```javascript
// Dependency-aware task coordination
Task("Dependency Manager", `
  Manage task dependencies and sequencing:

  DEPENDENCY TRACKING:
  - Map task dependencies: memory store dependencies/graph
  - Monitor completion status of prerequisite tasks
  - Trigger dependent tasks when prerequisites complete

  DEPENDENCY GRAPH:
  {
    "database-schema": [],
    "backend-api": ["database-schema"],
    "frontend-ui": ["backend-api"],
    "integration-tests": ["backend-api", "frontend-ui"],
    "deployment": ["integration-tests"]
  }
`, "dependency-manager")

Task("Database Developer", `
  Database development (no dependencies):

  IMPLEMENTATION:
  - Create database schema
  - Write migration scripts
  - Setup seed data

  COMPLETION SIGNALING:
  - Store schema: memory store database/schema
  - Signal completion: hooks notify --message "database-schema.complete"
`, "database-developer")

Task("Backend Developer", `
  Backend development (depends on database):

  DEPENDENCY CHECKING:
  - Wait for: hooks listen --event "database-schema.complete"
  - Verify schema: memory get database/schema

  IMPLEMENTATION:
  - Build backend APIs using database schema
  - Create API documentation
  - Write unit and integration tests

  COMPLETION SIGNALING:
  - Store APIs: memory store backend/apis
  - Signal completion: hooks notify --message "backend-api.complete"
`, "backend-dev")

Task("Frontend Developer", `
  Frontend development (depends on backend):

  DEPENDENCY CHECKING:
  - Wait for: hooks listen --event "backend-api.complete"
  - Verify APIs: memory get backend/apis

  IMPLEMENTATION:
  - Build frontend using backend APIs
  - Create user interfaces
  - Implement client-side validation

  COMPLETION SIGNALING:
  - Store UI: memory store frontend/ui
  - Signal completion: hooks notify --message "frontend-ui.complete"
`, "frontend-dev")
```

---

## 🛠️ Advanced Task Patterns

### Multi-Stage Development

```javascript
// Multi-stage development with checkpoints
Task("Full-Stack Developer", `
  Multi-stage e-commerce development:

  STAGE 1: Foundation (Week 1-2)
  - Setup project structure and tooling
  - Create database schema and migrations
  - Build basic authentication system
  - Checkpoint: Store foundation status

  STAGE 2: Core Features (Week 3-4)
  - Implement product catalog
  - Build shopping cart functionality
  - Create user account management
  - Checkpoint: Store core features status

  STAGE 3: Advanced Features (Week 5-6)
  - Integrate payment processing
  - Build admin dashboard
  - Implement order management
  - Checkpoint: Store advanced features status

  STAGE 4: Polish and Deploy (Week 7-8)
  - Performance optimization
  - Security hardening
  - Production deployment
  - Final checkpoint: Store deployment status

  COORDINATION PROTOCOL:
  - Store stage progress: memory store project/stage-{N}/status
  - Report weekly: hooks notify --message "Stage {N} milestone reached"
  - Escalate blockers: hooks escalate --severity medium
`, "fullstack-dev")
```

### Parallel Feature Development

```javascript
// Parallel feature teams with synchronization
Task("Authentication Team", `
  Develop authentication system in parallel:

  FEATURE SCOPE:
  - User registration and login
  - JWT token management
  - Password reset functionality
  - Social login integration (Google, GitHub)

  PARALLEL DEVELOPMENT:
  - Work independently on auth features
  - Coordinate with other teams via memory and hooks
  - Share authentication utilities and patterns

  INTEGRATION POINTS:
  - Store auth APIs: memory store features/auth/apis
  - Share auth middleware: memory store features/auth/middleware
  - Coordinate with user management team
`, "auth-team")

Task("Payment Team", `
  Develop payment system in parallel:

  FEATURE SCOPE:
  - Stripe payment integration
  - Payment method management
  - Subscription billing
  - Invoice generation

  PARALLEL DEVELOPMENT:
  - Work independently on payment features
  - Coordinate with order management team
  - Share payment utilities and patterns

  INTEGRATION POINTS:
  - Store payment APIs: memory store features/payment/apis
  - Share payment components: memory store features/payment/components
  - Coordinate with order team for checkout flow
`, "payment-team")

Task("Product Team", `
  Develop product system in parallel:

  FEATURE SCOPE:
  - Product catalog management
  - Category and tag systems
  - Search and filtering
  - Product recommendations

  PARALLEL DEVELOPMENT:
  - Work independently on product features
  - Coordinate with search team for integration
  - Share product data models and APIs

  INTEGRATION POINTS:
  - Store product APIs: memory store features/product/apis
  - Share product models: memory store features/product/models
  - Coordinate with cart team for product integration
`, "product-team")

Task("Integration Coordinator", `
  Coordinate integration of parallel features:

  COORDINATION RESPONSIBILITIES:
  - Monitor feature team progress: memory search features/*/status
  - Identify integration points and conflicts
  - Facilitate communication between teams
  - Plan integration testing strategy

  INTEGRATION TASKS:
  - Create integration test suites
  - Resolve API contract conflicts
  - Coordinate deployment sequencing
  - Manage feature flags for gradual rollout
`, "integration-coordinator")
```

### Error Handling and Recovery

```javascript
// Robust error handling pattern
Task("Resilient Developer", `
  Development with comprehensive error handling:

  ERROR HANDLING STRATEGY:
  1. Implement try-catch blocks for all critical operations
  2. Store error context in memory for debugging
  3. Attempt automatic recovery where possible
  4. Escalate unrecoverable errors to team leads

  IMPLEMENTATION PATTERN:
  \`\`\`javascript
  async function resilientOperation() {
    try {
      // Main implementation logic
      const result = await mainOperation();

      // Store success state
      await storeProgress('operation-success', result);

      return result;
    } catch (error) {
      // Store error context
      await storeError('operation-failed', {
        error: error.message,
        stack: error.stack,
        context: getCurrentContext(),
        timestamp: new Date().toISOString()
      });

      // Attempt recovery
      const recovered = await attemptRecovery(error);
      if (recovered) {
        return recovered;
      }

      // Escalate if recovery failed
      await escalateError(error);
      throw error;
    }
  }
  \`\`\`

  COORDINATION FOR ERRORS:
  - Store errors: memory store errors/{timestamp}/context
  - Notify team: hooks notify --message "Error in {operation}"
  - Escalate critical: hooks escalate --severity high
`, "resilient-developer")
```

---

## 📊 Monitoring and Analytics

### Progress Tracking

```javascript
// Progress tracking and reporting
Task("Progress Tracker", `
  Track and report development progress:

  TRACKING RESPONSIBILITIES:
  - Monitor task completion rates: memory search */progress
  - Calculate team velocity and productivity metrics
  - Identify bottlenecks and optimization opportunities
  - Generate progress reports for stakeholders

  METRICS COLLECTION:
  - Task completion times and success rates
  - Code quality metrics (test coverage, complexity)
  - Team coordination efficiency
  - Error rates and resolution times

  REPORTING:
  - Daily progress updates: memory store reports/daily
  - Weekly team summaries: memory store reports/weekly
  - Monthly trend analysis: memory store reports/monthly
`, "progress-tracker")
```

### Performance Monitoring

```javascript
// Real-time performance monitoring
Task("Performance Monitor", `
  Monitor development and application performance:

  MONITORING SCOPE:
  - Development team productivity
  - Application performance metrics
  - Infrastructure resource usage
  - User experience indicators

  PERFORMANCE TRACKING:
  - Task completion efficiency
  - Code review cycle times
  - Build and deployment speeds
  - Application response times

  ALERTING AND OPTIMIZATION:
  - Set up alerts for performance degradation
  - Identify and escalate performance issues
  - Suggest optimization strategies
  - Track performance improvements over time
`, "performance-monitor")
```

---

## 🎯 Best Practices

### Task Agent Instructions

1. **Be Specific**: Provide detailed, actionable instructions
2. **Include Coordination**: Always specify how agents should coordinate
3. **Define Deliverables**: Clearly state what outputs are expected
4. **Set Boundaries**: Define scope to prevent scope creep
5. **Include Error Handling**: Specify how to handle errors and failures

### Memory Usage Patterns

1. **Consistent Naming**: Use standardized key naming conventions
2. **Appropriate TTL**: Set proper time-to-live for different data types
3. **Namespace Organization**: Use logical namespaces for different contexts
4. **Regular Cleanup**: Implement memory cleanup procedures
5. **Documentation**: Document memory schemas and usage patterns

### Hook Integration

1. **Lifecycle Management**: Use hooks for task lifecycle events
2. **Progress Reporting**: Regular progress updates via hooks
3. **Error Escalation**: Use hooks for error reporting and escalation
4. **Team Communication**: Leverage hooks for team notifications
5. **Metrics Collection**: Use hooks for automated metrics gathering

---

**Next Steps:**
- Start with simple Task agent spawning
- Add MCP coordination for complex projects
- Implement memory-based coordination patterns
- Use hooks for event-driven workflows
- Monitor and optimize coordination efficiency