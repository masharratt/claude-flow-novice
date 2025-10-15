# Agent Selection by Use Case

**Smart Agent Matching System - Based on Actual Workflows**

**Generated**: 2025-10-15
**Approach**: Use case mapping instead of keyword matching

## Quick Reference: Most Common Workflows

### 🚀 Feature Development
```
Task: "Build user authentication system"
→ architect → backend-dev → security-specialist → tester

Task: "Create REST API for e-commerce"
→ architect → backend-dev → api-docs → tester

Task: "Add React dashboard with charts"
→ react-frontend-engineer → state-architect → ui-designer → tester
```

### 🔒 Security & Compliance
```
Task: "Audit application for vulnerabilities"
→ security-specialist → code-analyzer → tester → production-validator

Task: "Implement Zero Trust architecture"
→ security-architect-persona → architect → devops-engineer → security-specialist
```

### ⚡ Performance & Scalability
```
Task: "Optimize slow database queries"
→ perf-analyzer → code-booster → backend-dev → tester

Task: "Handle 10x traffic increase"
→ system-architect → devops-engineer → performance-benchmarker
```

### 🏗️ Architecture & Design
```
Task: "Design microservices architecture"
→ system-architect → architect → cfn-coordinator-standard

Task: "Plan API integration strategy"
→ architect → api-designer-persona → backend-dev
```

---

## Use Case Categories

### 1. SOFTWARE DEVELOPMENT

#### Full Stack Development
- **react-frontend-engineer**: React components, state management, UI logic
- **backend-dev**: REST APIs, GraphQL, business logic, database integration
- **mobile-dev**: React Native, iOS/Android features, mobile UI
- **fullstack-developer**: End-to-end features across stack

#### API Development
- **api-designer-persona**: API architecture, REST/GraphQL design
- **api-docs**: OpenAPI specs, Swagger documentation
- **backend-dev**: API implementation, endpoints, middleware

#### Database & Data
- **backend-dev**: Database design, queries, migrations
- **data-architect**: Schema design, data modeling (if available)

### 2. QUALITY & TESTING

#### Testing Strategy
- **tester**: Unit tests, integration tests, TDD practices
- **interaction-tester**: UI testing, user flows, accessibility
- **playwright-tester**: End-to-end automation, browser testing
- **production-validator**: Production readiness, real integration testing

#### Code Quality
- **code-analyzer**: Code reviews, quality assessment, technical debt
- **code-quality-validator**: Deep analysis, architecture compliance
- **code-booster**: Performance optimization, refactoring
- **perf-analyzer**: Performance bottlenecks, profiling

### 3. SECURITY

#### Security Assessment
- **security-specialist**: Security audits, vulnerability assessment
- **security-architect-persona**: Security architecture, Zero Trust design
- **security-manager**: Distributed systems security, cryptography

#### Compliance & Governance
- **cto-agent**: Technical standards, engineering quality
- **accessibility-advocate-persona**: WCAG compliance, inclusive design

### 4. ARCHITECTURE & DESIGN

#### System Architecture
- **system-architect**: Enterprise architecture, distributed systems
- **architect**: Component design, API design, database schema
- **system-architect-persona**: Technical leadership, architecture decisions

#### State & Data Management
- **state-architect**: State management patterns, data flow design
- **backend-dev**: Database integration, data persistence

### 5. DEVOPS & INFRASTRUCTURE

#### Infrastructure & Deployment
- **devops-engineer**: CI/CD pipelines, Docker, Kubernetes, Terraform
- **cloud-architect**: Cloud architecture, scalability planning

#### Monitoring & Reliability
- **performance-benchmarker**: Performance monitoring, optimization
- **site-reliability-engineer**: Uptime, monitoring, incident response (if available)

### 6. COORDINATION & PROJECT MANAGEMENT

#### Multi-Agent Coordination
- **coordinator-hybrid**: Primary coordinator for multi-agent work
- **task-coordinator**: Complex workflow orchestration
- **adaptive-coordinator**: Dynamic topology switching (8+ agents)

#### Product & Strategy
- **product-owner**: Feature decisions, scope management
- **planner**: Task breakdown, project organization

### 7. SPECIALIZED DOMAINS

#### Blockchain & Distributed Systems
- **byzantine-coordinator**: Byzantine fault tolerance
- **consensus-builder**: Distributed decision making
- **security-manager**: Blockchain security, cryptography
- **raft-manager**: Raft consensus implementation
- **crdt-synchronizer**: Conflict-free replicated data types
- **gossip-coordinator**: Gossip protocols, epidemic dissemination
- **quorum-manager**: Dynamic quorum management

#### Rust Development
- **rust-mvp-developer**: Rust prototyping, MVP development
- **rust-enterprise-developer**: Production Rust, enterprise features
- **rust-developer**: General Rust development

#### Mobile Development
- **mobile-dev**: React Native, cross-platform features
- **mobile-dev-optimized**: Enhanced mobile development (if available)

### 8. CONTENT & DOCUMENTATION

#### Documentation
- **api-docs**: API documentation, OpenAPI specs
- **docs-engineer**: Technical documentation (if available)

#### Content Strategy
- **technical-writer**: Documentation, tutorials (if available)

### 9. USER EXPERIENCE

#### UI/UX Design
- **ui-designer**: User interface design, component design
- **accessibility-advocate-persona**: Accessibility compliance

#### User Research
- **power-user-persona**: Advanced user workflows, efficiency
- **ux-researcher**: User research, usability testing (if available)

### 10. ANALYSIS & RESEARCH

#### Code Analysis
- **code-analyzer**: Comprehensive code analysis
- **analyst**: General analysis, investigation

#### Research & Discovery
- **researcher**: Technology research, competitive analysis
- **domain-researcher**: Deep domain expertise (if available)

### 11. AI & MACHINE LEARNING

#### ML Engineering
- **ml-engineer**: ML model deployment, pipelines (if available)
- **data-scientist**: Data analysis, ML modeling (if available)

### 12. CFN LOOP COORDINATION

#### Sprint & Epic Management
- **cfn-coordinator-mvp**: Fast iteration, cost optimization
- **cfn-coordinator-standard**: Balanced quality and speed
- **cfn-coordinator-enterprise**: Full quality gates, compliance

#### Decision Making
- **product-owner**: GOAP planning, scope decisions
- **goal-planner**: A* search planning, adaptive replanning

---

## Workflow Templates

### Template 1: New Feature Development
```
1. architect - Design system and components
2. coder/backend-dev - Implement core functionality
3. security-specialist - Add security measures
4. tester - Create and run tests
5. code-analyzer - Review code quality
```

### Template 2: API Development
```
1. api-designer-persona - Design API specification
2. backend-dev - Implement endpoints
3. api-docs - Generate documentation
4. security-specialist - Add authentication/authorization
5. tester - Test API functionality
```

### Template 3: Performance Optimization
```
1. perf-analyzer - Identify bottlenecks
2. code-booster - Implement optimizations
3. tester - Validate performance improvements
4. production-validator - Test under load
```

### Template 4: Security Audit
```
1. security-specialist - Conduct security assessment
2. code-analyzer - Analyze code for vulnerabilities
3. tester - Run security tests
4. production-validator - Validate in production-like environment
```

### Template 5: System Architecture
```
1. system-architect - Design overall architecture
2. architect - Detail component designs
3. devops-engineer - Plan infrastructure deployment
4. security-architect-persona - Design security architecture
```

---

## Agent Selection Algorithm

Instead of keyword matching, use this decision tree:

```
Is this a SECURITY task?
  → security-specialist, security-architect-persona

Is this about PERFORMANCE?
  → perf-analyzer, code-booster

Is this about ARCHITECTURE?
  → system-architect, architect

Is this about APIs?
  → api-designer-persona, backend-dev, api-docs

Is this about TESTING?
  → tester, interaction-tester, playwright-tester

Is this about UI/FRONTEND?
  → react-frontend-engineer, ui-designer, state-architect

Is this about INFRASTRUCTURE?
  → devops-engineer, system-architect

Is this about MOBILE?
  → mobile-dev

Is this about RUST?
  → rust-developer, rust-mvp-developer, rust-enterprise-developer

Is this a COMPLEX MULTI-AGENT task?
  → coordinator-hybrid, task-coordinator

Is this about COORDINATION?
  → coordinator-hybrid

Otherwise:
  → coder, analyst, researcher
```

---

## Usage Examples

### CLI Commands with Use Cases

```bash
# Feature Development
node src/cli/hybrid-routing/spawn-workers.js \
  "Build user authentication with JWT tokens" \
  --use-case "feature-development"

# Security Audit
node src/cli/hybrid-routing/spawn-workers.js \
  "Audit application for OWASP vulnerabilities" \
  --use-case "security-audit"

# Performance Optimization
node src/cli/hybrid-routing/spawn-workers.js \
  "Optimize database query performance" \
  --use-case "performance-optimization"

# API Development
node src/cli/hybrid-routing/spawn-workers.js \
  "Create REST API for product catalog" \
  --use-case "api-development"

# System Architecture
node src/cli/hybrid-routing/spawn-workers.js \
  "Design microservices for e-commerce platform" \
  --use-case "system-architecture"
```

### Coordinator Override for Custom Workflows

```bash
# Custom agent selection
node src/cli/hybrid-routing/spawn-workers.js \
  "Implement complex feature" \
  --agents=architect,coder,security-specialist,tester

# Custom workflow with subtasks
node src/cli/hybrid-routing/spawn-workers.js \
  "Build complete system" \
  --agents=system-architect,backend-dev,frontend-dev,devops-engineer \
  --subtasks="Design architecture|Implement backend|Build frontend|Setup deployment"
```

---

## Integration with Spawn System

The spawn-workers.js should be updated to:

1. **Use Case Detection**: Add `--use-case` parameter for template-based selection
2. **Workflow Templates**: Predefined agent combinations for common scenarios
3. **Smart Fallback**: Use keyword matching as fallback only
4. **Context-Aware Selection**: Consider task complexity, domain, and scope

### Priority Order:
1. **Explicit Coordinator Override** (`--agents` flag)
2. **Use Case Template** (`--use-case` flag)
3. **Smart Decision Tree** (based on task analysis)
4. **Keyword Matching** (fallback only)
5. **Generic Agents** (final fallback)

This approach provides more predictable and useful agent selection than the current keyword-only system.