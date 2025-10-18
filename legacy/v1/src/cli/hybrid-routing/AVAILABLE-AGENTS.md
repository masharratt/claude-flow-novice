# Available Specialized Agents

**Hybrid Routing System - Use Case-Based Agent Selection**

**Generated**: 2025-10-15
**Source**: `.claude/agents/` folder (live discovery)
**Purpose**: Agent capability reference for intelligent coordinator selection

## Coordinator Selection Guide

**Coordinators should select agents based on task requirements, not keyword matching.**

### Selection Principles:
1. **Understand the task domain** (security, performance, architecture, etc.)
2. **Identify required capabilities** (analysis, implementation, validation, etc.)
3. **Choose agents with matching expertise** from the sections below
4. **Consider task complexity** for appropriate agent seniority/specialization

---

## Discovery Statistics

```
🔍 Discovered 85 agent files in .claude/agents/
✅ Loaded 85 agents across 12 use case domains
📋 Agent capabilities organized by coordinator needs
```

---

## 1. CORE DEVELOPMENT AGENTS

### General Purpose Implementers
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **architect** | System design, component architecture, API design | High-level system design, component boundaries, technical decisions |
| **coder** | General implementation, feature development, bug fixes | Code implementation across languages, problem-solving, feature completion |
| **backend-dev** | Server-side development, APIs, database work | REST/GraphQL APIs, business logic, database integration, authentication |
| **react-frontend-engineer** | React applications, UI components, state management | React components, hooks, state management, frontend architecture |
| **mobile-dev** | React Native, iOS/Android development | Cross-platform mobile features, native modules, mobile UI/UX |

### Specialized Implementers
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **rust-mvp-developer** | Rust prototyping, MVP development | Rust basics, rapid prototyping, simple implementations |
| **rust-enterprise-developer** | Production Rust, enterprise features | Advanced Rust, performance optimization, production patterns |
| **rust-developer** | General Rust development | Rust implementation, memory safety, performance |

---

## 2. VALIDATION & QUALITY ASSURANCE

### Testing & Validation
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **tester** | Test creation, TDD, quality assurance | Unit tests, integration tests, TDD practices, test strategy |
| **interaction-tester** | UI testing, user flows, accessibility | User interaction testing, accessibility validation, E2E flows |
| **playwright-tester** | Browser automation, end-to-end testing | Playwright automation, browser testing, web application testing |
| **production-validator** | Production readiness, real integration testing | Production validation, real system testing, deployment readiness |

### Code Quality & Analysis
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **code-analyzer** | Code review, quality assessment, technical debt | Comprehensive code analysis, quality metrics, technical debt assessment |
| **code-quality-validator** | Deep quality analysis, architecture compliance | Advanced quality validation, architecture compliance, code standards |
| **code-booster** | Performance optimization, refactoring | Code optimization, performance improvements, refactoring strategies |
| **perf-analyzer** | Performance analysis, bottleneck identification | Performance profiling, bottleneck detection, optimization recommendations |

---

## 3. SECURITY SPECIALISTS

### Security Assessment & Implementation
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **security-specialist** | Security audits, vulnerability assessment, security implementation | Security audits, vulnerability scanning, secure coding practices |
| **security-architect-persona** | Security architecture design, Zero Trust planning | Security architecture, Zero Trust design, threat modeling |
| **security-manager** | Distributed systems security, cryptography | Blockchain security, cryptographic protocols, distributed system security |

---

## 4. ARCHITECTURE & SYSTEM DESIGN

### System Architecture
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **system-architect** | Enterprise architecture, distributed systems | Large-scale system design, distributed systems, scalability planning |
| **system-architect-persona** | Technical leadership, architecture decisions | Architecture decision making, technical leadership, system evolution |
| **architect** | Component design, API design, database schema | Component architecture, API design, database design |

### State & Data Management
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **state-architect** | State management, data flow design | State management patterns, data flow architecture, state synchronization |

---

## 5. DEVOPS & INFRASTRUCTURE

### Infrastructure & Deployment
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **devops-engineer** | CI/CD, Docker, Kubernetes, cloud infrastructure | Pipeline design, containerization, orchestration, infrastructure as code |

### Performance & Monitoring
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **performance-benchmarker** | Performance testing, benchmarking, monitoring | Performance measurement, load testing, benchmarking, monitoring setup |

---

## 6. COORDINATION & PROJECT MANAGEMENT

### Multi-Agent Coordination
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **coordinator-hybrid** | Primary multi-agent coordination, task orchestration | Intelligent task decomposition, agent selection, progress monitoring |
| **task-coordinator** | Complex workflow management, task breakdown | Workflow orchestration, dependency management, complex task coordination |
| **adaptive-coordinator** | Dynamic team formation, topology switching | Adaptive agent selection, dynamic team configuration |
| **adaptive-coordinator-enhanced** | Advanced adaptive coordination with enhanced capabilities | Enhanced adaptive coordination, intelligent team optimization |

### Hierarchical & Specialized Coordination
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **hierarchical-coordinator** | Large team coordination, hierarchical structures | Hierarchical team management, multi-level coordination |
| **mesh-coordinator** | Flat team coordination, mesh communication | Mesh-based coordination, peer-to-peer agent communication |

### Product & Strategy
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **product-owner** | Feature decisions, scope management, prioritization | Product decisions, scope management, feature prioritization |
| **planner** | Task planning, project organization, milestone planning | Task breakdown, project planning, milestone management |

---

## 7. SPECIALIZED DOMAINS

### Blockchain & Distributed Systems
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **byzantine-coordinator** | Byzantine fault tolerance, malicious actor handling | Byzantine consensus, fault tolerance, security in adversarial environments |
| **consensus-builder** | Distributed consensus, team agreement | Consensus algorithms, distributed decision making, team coordination |
| **raft-manager** | Raft consensus implementation | Raft protocol, leader election, log replication |
| **crdt-synchronizer** | Conflict-free replicated data types | CRDT implementation, state synchronization, conflict resolution |
| **gossip-coordinator** | Gossip protocols, epidemic dissemination | Gossip protocols, peer-to-peer communication, data dissemination |
| **quorum-manager** | Dynamic quorum management, voting systems | Quorum calculation, voting mechanisms, distributed decisions |

### API Development & Documentation
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **api-docs** | API documentation, OpenAPI specifications | OpenAPI/Swagger docs, API specification, documentation generation |
| **api-designer-persona** | API architecture, REST/GraphQL design | API design principles, REST/GraphQL architecture, interface design |

### User Experience & Accessibility
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **ui-designer** | User interface design, component design | UI design, component architecture, user experience design |
| **accessibility-advocate-persona** | Accessibility compliance, inclusive design | WCAG compliance, accessibility testing, inclusive design practices |
| **power-user-persona** | Advanced user workflows, efficiency optimization | Power user features, workflow optimization, advanced functionality |

---

## 8. CFN LOOP SPECIALISTS

### CFN Coordinators (Mode-Based)
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **cfn-coordinator-mvp** | Fast iteration, prototyping, cost optimization | Rapid development, cost-effective solutions, quick iteration |
| **cfn-coordinator-standard** | Balanced development, standard quality gates | Balanced approach, standard quality practices, reliable delivery |
| **cfn-coordinator-enterprise** | Enterprise-grade development, full compliance | Enterprise standards, compliance, comprehensive quality gates |

### Advanced Planning & Decision Making
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **goal-planner** | Complex planning, A* search optimization | Goal-oriented planning, A* search algorithms, adaptive replanning |
| **product-owner-agent** | Product decisions, backlog management | Product strategy, backlog prioritization, stakeholder management |

---

## 9. ANALYSIS & RESEARCH

### Analysis & Investigation
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **analyst** | General analysis, investigation, assessment | Problem analysis, investigative work, comprehensive assessment |
| **researcher** | Research, discovery, competitive analysis | Research methodologies, information gathering, analysis |
| **architecture** | Architecture analysis, assessment | Architecture evaluation, design pattern analysis |

### Code Analysis & Optimization
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **analyze-code-quality** | Code quality analysis, improvement recommendations | Code quality assessment, improvement strategies, best practices |

---

## 10. SPECIALIZED DEVELOPMENT PATTERNS

### Development Methodologies
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **base-template-generator** | Template creation, scaffolding, boilerplate | Template generation, scaffolding, project initialization |
| **specification** | Specification writing, requirements analysis | Technical specifications, requirements documentation |
| **pseudocode** | Algorithm design, logic planning | Algorithm development, pseudocode creation, logic design |

### Quality & Refinement
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **refinement** | Code refinement, optimization, quality improvement | Code refinement, optimization techniques, quality enhancement |
| **specification-optimized** | Optimized specification creation | High-quality specifications, optimized documentation |

---

## 11. TESTING & VALIDATION SPECIALISTS

### Testing Methodologies
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **tdd-london-swarm** | London School TDD, mock-driven development | Mock-driven TDD, outside-in development, behavior verification |

### Validation & Compliance
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **production-validator** | Production validation, deployment readiness | Production testing, deployment validation, real-world testing |

---

## 12. CONTEXT & MEMORY MANAGEMENT

### Context Management
| Agent | When to Use | Core Capabilities |
|--------|-------------|-------------------|
| **context-curator** | Context organization, consolidation | Context management, information consolidation, organization |
| **context-reflector** | Learning extraction, pattern recognition | Lesson extraction, pattern recognition, learning from execution |

---

## Coordinator Selection Workflow

### Step 1: Analyze Task Requirements
- **What is the primary domain?** (security, performance, architecture, etc.)
- **What are the main activities?** (analysis, implementation, validation, etc.)
- **What is the complexity level?** (simple, medium, complex, enterprise)

### Step 2: Select Core Agents
- **Implementation needs:** coder, backend-dev, react-frontend-engineer, etc.
- **Architecture needs:** architect, system-architect, etc.
- **Validation needs:** tester, code-analyzer, security-specialist, etc.
- **Coordination needs:** coordinator-hybrid, task-coordinator, etc.

### Step 3: Add Specialists as Needed
- **Security:** Add security-specialist for any system handling data/auth
- **Performance:** Add perf-analyzer for performance-critical tasks
- **Accessibility:** Add accessibility-advocate-persona for user-facing features
- **Documentation:** Add api-docs for API development

### Step 4: Consider CFN Loop Requirements
- **MVP mode:** cfn-coordinator-mvp for rapid prototyping
- **Standard mode:** cfn-coordinator-standard for balanced development
- **Enterprise mode:** cfn-coordinator-enterprise for production systems

---

## Usage Examples

### Feature Development
```
Task: "Build user authentication system"
→ coordinator-hybrid (orchestration)
→ architect (system design)
→ backend-dev (API implementation)
→ security-specialist (security measures)
→ tester (test creation)
→ code-analyzer (quality review)
```

### Security Audit
```
Task: "Audit application for vulnerabilities"
→ security-specialist (lead security assessment)
→ code-analyzer (code review)
→ tester (security testing)
→ production-validator (production readiness)
```

### Performance Optimization
```
Task: "Optimize slow database queries"
→ perf-analyzer (identify bottlenecks)
→ code-booster (implement optimizations)
→ backend-dev (database changes)
→ tester (validate improvements)
```

### System Architecture
```
Task: "Design microservices architecture"
→ system-architect (overall architecture)
→ architect (component design)
→ devops-engineer (infrastructure planning)
→ security-architect-persona (security architecture)
```

---

## CLI Integration

```bash
# Coordinator intelligent selection (default)
node src/cli/hybrid-routing/spawn-workers.js "Build authentication system"

# Coordinator override (specific agents)
node src/cli/hybrid-routing/spawn-workers.js "Complex feature" \
  --agents=coordinator-hybrid,architect,backend-dev,security-specialist,tester

# CFN Loop mode selection
node src/cli/hybrid-routing/spawn-workers.js "Enterprise API" \
  --mode=enterprise  # Uses cfn-coordinator-enterprise
```

**Note:** This document serves as a reference for coordinators to make intelligent agent selection decisions based on task requirements and agent capabilities, rather than automated keyword matching.