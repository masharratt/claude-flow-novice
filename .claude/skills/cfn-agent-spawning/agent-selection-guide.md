# Agent Selection Guide

## Overview

This guide provides a systematic decision-making framework for selecting the correct agent types when spawning multi-agent swarms. Agent selection directly impacts task quality, cost efficiency, and completion time.

**Key Principles:**
1. **Domain-First Selection** - Match task domain to agent expertise
2. **Role-Based Composition** - Include all required workflow roles
3. **Minimum Viable Team** - Start with 3-5 agents, scale as needed
4. **Specialist Addition** - Add specialists for cross-cutting concerns

---

## 1. Decision Tree

### Step 1: Identify Task Domain

```
┌─────────────────────────────────────────────────────────┐
│          What is the primary task domain?               │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼───┐         ┌────▼────┐       ┌────▼────┐
    │ CODE  │         │ INFRA   │       │ DESIGN  │
    └───┬───┘         └────┬────┘       └────┬────┘
        │                  │                  │
  [Development]      [Infrastructure]   [Architecture]
        │                  │                  │
        ▼                  ▼                  ▼
   Go to 2.1          Go to 2.2          Go to 2.3
```

### Step 2: Select Core Team

**2.1 Development Domain**
```
Implementation Type:
├─ Frontend → react-frontend-engineer + ui-designer
├─ Backend → backend-dev + architect
├─ Mobile → mobile-dev + react-frontend-engineer
├─ API → backend-dev + api-designer-persona
├─ Rust/Systems → rust-developer + perf-analyzer
└─ General → coder + architect
```

**2.2 Infrastructure Domain**
```
Infrastructure Type:
├─ Cloud/K8s → devops-engineer + system-architect
├─ CI/CD → devops-engineer + tester
├─ Deployment → devops-engineer + security-specialist
└─ Performance → devops-engineer + perf-analyzer
```

**2.3 Design/Architecture Domain**
```
Design Scope:
├─ System Architecture → system-architect + architect
├─ Component Design → architect + coder
├─ API Design → api-designer-persona + architect
├─ Database Schema → architect + backend-dev
└─ State Management → state-architect + react-frontend-engineer
```

### Step 3: Add Validation Roles

**Always Include (Minimum):**
- `tester` - For all implementation work
- `reviewer` - For code quality validation

**Add Based on Criticality:**
```
Security-Critical → + security-specialist
Performance-Critical → + perf-analyzer
Production System → + production-validator
Code Quality Focus → + code-analyzer
```

### Step 4: Consider Cross-Cutting Concerns

**Documentation:**
- Public API → + api-docs
- Complex system → + researcher

**Compliance:**
- WCAG required → + accessibility-advocate-persona
- Enterprise standards → + code-quality-validator

**Coordination:**
- 8+ agents → + coordinator-hybrid
- Complex workflows → + task-coordinator

---

## 2. Agent Selection Matrix

### 2.1 By Task Type

| Task Type | Core Agents | Supporting Agents | Total |
|-----------|-------------|-------------------|-------|
| **Feature Development** | architect, coder | tester, reviewer | 4 |
| **Bug Fix** | coder | tester | 2 |
| **Refactoring** | code-analyzer, code-booster | tester, reviewer | 4 |
| **Security Audit** | security-specialist, code-analyzer | tester, production-validator | 4 |
| **Performance Optimization** | perf-analyzer, code-booster | backend-dev, tester | 4 |
| **System Design** | system-architect, architect | devops-engineer, security-architect-persona | 4 |
| **API Development** | api-designer-persona, backend-dev | api-docs, security-specialist, tester | 5 |
| **Mobile App** | mobile-dev, react-frontend-engineer | ui-designer, tester | 4 |
| **Infrastructure Setup** | devops-engineer, system-architect | security-specialist, tester | 4 |
| **Production Deployment** | devops-engineer, security-specialist | production-validator, tester | 4 |
| **Code Review** | code-analyzer, code-quality-validator | perf-analyzer | 3 |
| **Research** | researcher, analyst | - | 2 |

### 2.2 By Complexity Level

**Simple (2-3 agents):**
```bash
# Quick fixes, minor features, research
--agents=coder,tester
--agents=researcher,analyst
--agents=backend-dev,tester
```

**Medium (4-5 agents):**
```bash
# Standard features, moderate complexity
--agents=architect,coder,tester,reviewer
--agents=architect,backend-dev,security-specialist,tester
--agents=analyst,architect,coder,tester,reviewer
```

**Complex (6-7 agents):**
```bash
# Enterprise features, multi-component systems
--agents=analyst,system-architect,backend-dev,react-frontend-engineer,security-specialist,tester,reviewer
--agents=system-architect,architect,backend-dev,security-specialist,devops-engineer,production-validator
```

**Enterprise (8+ agents):**
```bash
# Large-scale systems requiring hierarchical coordination
# Use coordinator-hybrid to manage sub-teams
--agents=coordinator-hybrid  # Spawns sub-teams dynamically
```

### 2.3 By Quality Requirements

**MVP Quality (2-3 agents):**
```bash
--agents=coder,tester
# Gate: ≥0.65 confidence
```

**Standard Quality (4-5 agents):**
```bash
--agents=architect,backend-dev,security-specialist,tester,reviewer
# Gate: ≥0.75 confidence
```

**Enterprise Quality (6+ agents):**
```bash
--agents=system-architect,architect,backend-dev,security-specialist,devops-engineer,production-validator
# Gate: ≥0.85 confidence
```

---

## 3. Agent Role Reference

### 3.1 Core Development Agents

**architect**
- **When to use:** Component design, API design, database schema
- **Pairs well with:** coder, backend-dev, system-architect
- **Typical role:** Design → Implementation handoff

**coder**
- **When to use:** General implementation, feature development
- **Pairs well with:** architect, tester, reviewer
- **Typical role:** Primary implementer

**backend-dev**
- **When to use:** Server-side development, APIs, databases
- **Pairs well with:** architect, security-specialist, tester
- **Typical role:** Backend implementation

**react-frontend-engineer**
- **When to use:** React applications, UI components
- **Pairs well with:** ui-designer, state-architect, tester
- **Typical role:** Frontend implementation

**mobile-dev**
- **When to use:** React Native, cross-platform mobile
- **Pairs well with:** react-frontend-engineer, ui-designer, tester
- **Typical role:** Mobile implementation

### 3.2 Validation & Quality Agents

**tester**
- **When to use:** ALWAYS for implementation work
- **Pairs well with:** All implementation agents
- **Typical role:** Test creation, validation

**reviewer**
- **When to use:** Code quality validation
- **Pairs well with:** All implementation agents
- **Typical role:** Final review before completion

**code-analyzer**
- **When to use:** Code review, technical debt assessment
- **Pairs well with:** code-quality-validator, perf-analyzer
- **Typical role:** Quality analysis

**production-validator**
- **When to use:** Production readiness, real integration testing
- **Pairs well with:** devops-engineer, security-specialist
- **Typical role:** Pre-production validation

### 3.3 Security Specialists

**security-specialist**
- **When to use:** Security audits, security-critical features
- **Pairs well with:** backend-dev, code-analyzer, tester
- **Typical role:** Security implementation and review

**security-architect-persona**
- **When to use:** Security architecture, Zero Trust design
- **Pairs well with:** system-architect, devops-engineer
- **Typical role:** Security planning

### 3.4 Performance Specialists

**perf-analyzer**
- **When to use:** Performance analysis, bottleneck identification
- **Pairs well with:** code-booster, backend-dev
- **Typical role:** Performance assessment

**code-booster**
- **When to use:** Performance optimization, refactoring
- **Pairs well with:** perf-analyzer, tester
- **Typical role:** Optimization implementation

### 3.5 Architecture Specialists

**system-architect**
- **When to use:** Enterprise architecture, distributed systems
- **Pairs well with:** architect, devops-engineer, security-architect-persona
- **Typical role:** System-level design

**state-architect**
- **When to use:** State management, data flow design
- **Pairs well with:** react-frontend-engineer, backend-dev
- **Typical role:** State architecture

### 3.6 DevOps & Infrastructure

**devops-engineer**
- **When to use:** CI/CD, Docker, Kubernetes, cloud infrastructure
- **Pairs well with:** system-architect, security-specialist
- **Typical role:** Infrastructure implementation

**performance-benchmarker**
- **When to use:** Performance testing, benchmarking
- **Pairs well with:** devops-engineer, perf-analyzer
- **Typical role:** Performance measurement

### 3.7 Coordination Agents

**coordinator-hybrid**
- **When to use:** PRIMARY multi-agent coordination (8+ agents)
- **Pairs well with:** All specialists
- **Typical role:** Swarm orchestration

**task-coordinator**
- **When to use:** Complex workflow management
- **Pairs well with:** coordinator-hybrid
- **Typical role:** Task breakdown and tracking

### 3.8 Analysis & Research

**analyst**
- **When to use:** Problem analysis, investigation
- **Pairs well with:** researcher, architect
- **Typical role:** Upfront analysis

**researcher**
- **When to use:** Research, discovery, competitive analysis
- **Pairs well with:** analyst, architect
- **Typical role:** Research and recommendations

---

## 4. Common Patterns

### 4.1 Standard Feature Pattern

```bash
# 4 agents: Design → Implement → Validate → Review
--agents=architect,coder,tester,reviewer

# Why this works:
# 1. architect - Designs component structure
# 2. coder - Implements based on design
# 3. tester - Creates and runs tests
# 4. reviewer - Final quality check
```

**Use for:**
- New features
- Moderate complexity
- Standard quality requirements

**Cost:** ~$0.40 (4 agents × 200K tokens × $0.50/1M)

### 4.2 Security-Critical Pattern

```bash
# 5 agents: Design → Implement → Secure → Test → Validate
--agents=architect,backend-dev,security-specialist,tester,production-validator

# Why this works:
# 1. architect - Designs security boundaries
# 2. backend-dev - Implements with security in mind
# 3. security-specialist - Security audit and hardening
# 4. tester - Security-focused testing
# 5. production-validator - Real-world validation
```

**Use for:**
- Authentication/authorization
- Payment processing
- Data handling
- API security

**Cost:** ~$0.50 (5 agents × 200K tokens × $0.50/1M)

### 4.3 Performance-Critical Pattern

```bash
# 5 agents: Design → Implement → Analyze → Optimize → Test
--agents=architect,coder,perf-analyzer,code-booster,tester

# Why this works:
# 1. architect - Designs for performance
# 2. coder - Initial implementation
# 3. perf-analyzer - Identifies bottlenecks
# 4. code-booster - Optimizes hot paths
# 5. tester - Validates performance improvements
```

**Use for:**
- High-throughput systems
- Real-time processing
- Resource-constrained environments
- Database query optimization

**Cost:** ~$0.50 (5 agents × 200K tokens × $0.50/1M)

### 4.4 System Architecture Pattern

```bash
# 4 agents: System Design → Component Design → Infrastructure → Security
--agents=system-architect,architect,devops-engineer,security-architect-persona

# Use collaborative topology for cross-functional design work
--topology collaborative --timeout 360000

# Why this works:
# 1. system-architect - Overall system design
# 2. architect - Component-level design
# 3. devops-engineer - Infrastructure planning
# 4. security-architect-persona - Security architecture
```

**Use for:**
- Microservices architecture
- Distributed systems
- Cloud migrations
- Large-scale refactoring

**Cost:** ~$0.40 (4 agents × 200K tokens × $0.50/1M)

### 4.5 API Development Pattern

```bash
# 5 agents: Design → Implement → Document → Secure → Test
--agents=api-designer-persona,backend-dev,api-docs,security-specialist,tester

# Why this works:
# 1. api-designer-persona - API contract design
# 2. backend-dev - Implementation
# 3. api-docs - OpenAPI/Swagger documentation
# 4. security-specialist - API security (auth, rate limiting, etc.)
# 5. tester - API testing
```

**Use for:**
- REST APIs
- GraphQL APIs
- Internal service APIs
- Public APIs

**Cost:** ~$0.50 (5 agents × 200K tokens × $0.50/1M)

---

## 5. Anti-Patterns to Avoid

### 5.1 Over-Staffing

**❌ WRONG:**
```bash
# 10 agents for a simple CRUD endpoint
--agents=analyst,researcher,system-architect,architect,backend-dev,security-specialist,tester,reviewer,production-validator,devops-engineer
```

**✅ CORRECT:**
```bash
# 3 agents for a simple CRUD endpoint
--agents=backend-dev,security-specialist,tester
```

**Why:** Diminishing returns, increased cost, coordination overhead

### 5.2 Under-Staffing

**❌ WRONG:**
```bash
# Single agent for enterprise authentication system
--agents=coder
```

**✅ CORRECT:**
```bash
# 5 agents for enterprise authentication
--agents=architect,backend-dev,security-specialist,tester,production-validator
```

**Why:** Missing critical perspectives (security, testing, validation)

### 5.3 Missing Validation

**❌ WRONG:**
```bash
# No tester for implementation work
--agents=architect,coder,reviewer
```

**✅ CORRECT:**
```bash
# Always include tester for implementation
--agents=architect,coder,tester,reviewer
```

**Why:** Testing is not optional for quality delivery

### 5.4 Wrong Domain Experts

**❌ WRONG:**
```bash
# Frontend agents for backend API work
--agents=react-frontend-engineer,ui-designer,tester
```

**✅ CORRECT:**
```bash
# Backend specialists for API work
--agents=backend-dev,api-designer-persona,security-specialist,tester
```

**Why:** Domain expertise matters for quality and efficiency

### 5.5 Generic Agents for Specialized Work

**❌ WRONG:**
```bash
# Generic coder for Rust systems programming
--agents=coder,tester
```

**✅ CORRECT:**
```bash
# Rust specialist for systems work
--agents=rust-developer,perf-analyzer,tester
```

**Why:** Specialists deliver higher quality for complex domains

---

## 6. Scaling Guidelines

### 6.1 When to Scale Up

**Add analysts (2 → 3 agents):**
```
Trigger: Unclear requirements, complex problem space
Add: analyst or researcher before architect/coder
```

**Add specialists (3 → 4-5 agents):**
```
Trigger: Security-critical, performance-critical, or production system
Add: security-specialist, perf-analyzer, or production-validator
```

**Add coordinators (7 → 8+ agents):**
```
Trigger: Team size exceeds 7 agents
Add: coordinator-hybrid to manage sub-teams
```

### 6.2 When to Scale Down

**Remove duplicates:**
```
If both architect and system-architect, keep system-architect for large systems
If both coder and backend-dev, keep backend-dev for backend work
```

**Merge roles:**
```
Simple tasks: Combine architect + coder → Just coder
Research phases: Combine analyst + researcher → Just researcher
```

**Remove optional agents:**
```
Non-production: Remove production-validator
Non-critical: Remove security-specialist (keep for any data handling!)
Low performance needs: Remove perf-analyzer
```

---

## 7. Test Scenario Validation

### Scenario 1: User Authentication System

**Task:** "Implement user authentication with JWT tokens"

**Analysis:**
- Domain: Backend + Security
- Complexity: Medium-High
- Critical: Yes (security-critical)

**Selected Agents:**
```bash
--agents=architect,backend-dev,security-specialist,tester
```

**Rationale:**
1. architect - Designs auth flow, token structure
2. backend-dev - Implements JWT generation/validation
3. security-specialist - Security review, token security, OWASP compliance
4. tester - Auth testing, security testing

**Expected Cost:** ~$0.40

### Scenario 2: Performance Optimization

**Task:** "Optimize slow database queries"

**Analysis:**
- Domain: Backend + Performance
- Complexity: Medium
- Critical: Yes (performance-critical)

**Selected Agents:**
```bash
--agents=perf-analyzer,code-booster,backend-dev,tester
```

**Rationale:**
1. perf-analyzer - Identifies slow queries, analyzes execution plans
2. code-booster - Optimizes query logic, suggests indexes
3. backend-dev - Implements optimizations
4. tester - Validates performance improvements

**Expected Cost:** ~$0.40

### Scenario 3: React Native Mobile App

**Task:** "Build React Native mobile app for task management"

**Analysis:**
- Domain: Mobile + Frontend
- Complexity: High
- Critical: No (not security/performance-critical)

**Selected Agents:**
```bash
--agents=mobile-dev,react-frontend-engineer,ui-designer,tester
```

**Rationale:**
1. mobile-dev - Mobile-specific implementation
2. react-frontend-engineer - React components, state management
3. ui-designer - UI/UX design
4. tester - Mobile testing

**Expected Cost:** ~$0.40

### Scenario 4: Microservices Architecture

**Task:** "Design microservices architecture for e-commerce platform"

**Analysis:**
- Domain: Architecture + Infrastructure
- Complexity: Very High
- Critical: Yes (enterprise system)

**Selected Agents:**
```bash
--agents=system-architect,architect,devops-engineer,security-architect-persona
--topology collaborative --timeout 360000
```

**Rationale:**
1. system-architect - Overall system design, service boundaries
2. architect - Component-level design, API contracts
3. devops-engineer - Infrastructure, deployment, scalability
4. security-architect-persona - Security architecture, Zero Trust design

**Expected Cost:** ~$0.40

### Scenario 5: Code Quality Review

**Task:** "Review codebase for technical debt and quality issues"

**Analysis:**
- Domain: Analysis + Quality
- Complexity: Medium
- Critical: No

**Selected Agents:**
```bash
--agents=code-analyzer,code-quality-validator,perf-analyzer
```

**Rationale:**
1. code-analyzer - General code review, technical debt identification
2. code-quality-validator - Deep quality analysis, standards compliance
3. perf-analyzer - Performance assessment

**Expected Cost:** ~$0.30

---

## 8. Quick Reference

### 8.1 Common Combinations

```bash
# Minimum Viable (2 agents)
coder,tester

# Standard Feature (4 agents)
architect,coder,tester,reviewer

# Security Feature (5 agents)
architect,backend-dev,security-specialist,tester,production-validator

# Performance Feature (5 agents)
architect,coder,perf-analyzer,code-booster,tester

# Mobile Feature (4 agents)
mobile-dev,react-frontend-engineer,ui-designer,tester

# API Development (5 agents)
api-designer-persona,backend-dev,api-docs,security-specialist,tester

# Infrastructure (4 agents)
devops-engineer,system-architect,security-specialist,tester

# System Architecture (4 agents)
system-architect,architect,devops-engineer,security-architect-persona
```

### 8.2 Agent Selection Checklist

**For Every Task:**
- [ ] Identified task domain (development, infrastructure, architecture, etc.)
- [ ] Selected core implementation agents (coder, backend-dev, etc.)
- [ ] Added validation agents (tester REQUIRED, reviewer recommended)
- [ ] Considered security implications (add security-specialist if ANY data handling)
- [ ] Considered performance implications (add perf-analyzer if performance-critical)
- [ ] Right-sized team (3-5 agents optimal, 8+ requires coordinator-hybrid)
- [ ] Selected appropriate topology (sequential for most, collaborative for complex)

**Cost Check:**
- [ ] Estimated cost = (agent_count × avg_tokens × $0.50/1M)
- [ ] Verified cost is reasonable for task complexity
- [ ] Considered scaling down if cost > $2 for simple task

**Quality Check:**
- [ ] All required expertise covered
- [ ] No duplicate roles
- [ ] Validation agents included
- [ ] Topology matches coordination needs

---

## 9. Advanced Topics

### 9.1 Dynamic Agent Adjustment

**Mid-Flight Agent Addition:**
If initial team lacks needed expertise, coordinator can spawn additional agents:

```javascript
// Initial spawn
--agents=architect,coder,tester

// Mid-flight: Security issue discovered
// Coordinator spawns security specialist
--agents=security-specialist
--redis-channel swarm:auth:security-review
```

**Mid-Flight Agent Removal:**
If agent completes early or becomes unnecessary:

```javascript
// Mark agent as complete in Redis
await redis.publish('swarm:auth:coordination', {
  agent: 'architect',
  status: 'complete-early',
  handoff: 'Design complete, coder can proceed'
});
```

### 9.2 Specialist vs Generalist Trade-offs

**When to Use Specialists:**
- Complex domain (Rust, blockchain, performance)
- High criticality (security, production)
- Deep expertise required

**When to Use Generalists:**
- Prototyping, MVPs
- Standard CRUD operations
- Cost optimization priority

**Example:**
```bash
# Specialist approach (higher quality, higher cost)
--agents=rust-enterprise-developer,perf-analyzer,security-specialist,tester

# Generalist approach (lower cost, good quality)
--agents=coder,tester
```

### 9.3 CFN Loop Integration

**MVP Mode (Gate ≥0.65):**
```bash
--agents=cfn-coordinator-mvp,coder,tester
# Minimal agents for rapid iteration
```

**Standard Mode (Gate ≥0.75):**
```bash
--agents=cfn-coordinator-standard,architect,coder,security-specialist,tester
# Balanced team with standard quality gates
```

**Enterprise Mode (Gate ≥0.85):**
```bash
--agents=cfn-coordinator-enterprise,system-architect,backend-dev,security-specialist,devops-engineer,production-validator
# Full team with enterprise quality gates
```

---

## 10. Troubleshooting

### Low Consensus (< 0.70)

**Problem:** Agents report low confidence in results

**Solutions:**
1. Add specialist agents for missing expertise
2. Clarify task description with more context
3. Break down complex task into smaller sub-tasks
4. Add analyst/researcher for upfront investigation

### High Cost (> $2 per task)

**Problem:** Task exceeding cost budget

**Solutions:**
1. Reduce agent count (merge roles)
2. Use more specific task descriptions (reduce token usage)
3. Break into smaller tasks
4. Consider sequential vs collaborative topology (sequential is faster/cheaper)

### Missing Capabilities

**Problem:** Team lacks needed skills

**Solutions:**
1. Consult AVAILABLE-AGENTS.md for specialist agents
2. Add domain-specific specialists (rust-developer, mobile-dev, etc.)
3. Consider using adaptive-coordinator for dynamic team formation

---

**Last Updated:** 2025-10-18
**Version:** 1.0.0
**Related:** SKILL.md, spawn-templates.sh, AVAILABLE-AGENTS.md
