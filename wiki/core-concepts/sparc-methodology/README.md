# SPARC Methodology: Systematic Development

Master the SPARC methodology for systematic, test-driven AI-assisted development that reduces bugs and improves code quality.

## 🎯 SPARC Overview

**SPARC** is a systematic development methodology that breaks complex development tasks into manageable, systematic phases:

- **S**pecification - Requirements analysis and planning
- **P**seudocode - Algorithm design and logic flow
- **A**rchitecture - System design and component structure
- **R**efinement - Test-driven development implementation
- **C**ompletion - Integration testing and deployment

## 🔄 The SPARC Process

### 📊 SPARC Workflow Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPARC Development Lifecycle                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📋 SPECIFICATION  →  💭 PSEUDOCODE  →  🏗️ ARCHITECTURE         │
│      ↓                    ↓                  ↓                  │
│  Requirements         Algorithm           System Design          │
│  User Stories         Logic Flow         Component Design       │
│  Constraints          Interfaces         Database Schema        │
│  Metrics              Error Handling     API Specification      │
│                                                                 │
│            ↓                                     ↓              │
│                                                                 │
│        ⚡ REFINEMENT  ←←←←←←←←←←←←←  ✅ COMPLETION              │
│            ↓                                     ↑              │
│        TDD Cycles                         Integration Tests     │
│        Code Review                        Deployment Prep       │
│        Performance                        Documentation         │
│        Security                           Monitoring Setup      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 🎯 Phase Success Criteria

| Phase | Entry Criteria | Success Metrics | Exit Criteria |
|-------|---------------|-----------------|---------------|
| **Specification** | Project initiation | Clear requirements | 100% acceptance criteria defined |
| **Pseudocode** | Requirements approved | Algorithm clarity | Logic flow validated |
| **Architecture** | Pseudocode complete | Design coherence | All components specified |
| **Refinement** | Architecture approved | Code quality | 90%+ test coverage |
| **Completion** | Implementation done | Integration success | Production ready |

### Phase 1: Specification (S)
**Goal**: Crystal-clear requirements and acceptance criteria

**Key Activities**:
- 📊 **Requirements Analysis**: Stakeholder interviews, user research
- 📝 **User Story Creation**: As-a, I-want, So-that format
- ✅ **Acceptance Criteria**: Given-When-Then scenarios
- 🚧 **Constraint Identification**: Technical, business, regulatory limits
- 📈 **Success Metrics**: KPIs, performance targets, quality gates

**Deliverables**:
- Requirements specification document
- User stories with detailed acceptance criteria
- Non-functional requirements (NFRs)
- Success metrics and measurement plan
- Risk assessment and mitigation strategies

```bash
# CLI execution
npx claude-flow@alpha sparc run specification "user authentication system"

# Expected output:
# - Requirements analysis
# - User stories
# - Acceptance criteria
# - Security requirements
# - Performance constraints
```

### Phase 2: Pseudocode (P)
**Goal**: Algorithm design without implementation details

**Activities**:
- Algorithm design
- Logic flow mapping
- Data structure planning
- Interface definition
- Error handling strategy

**Outputs**:
- Pseudocode algorithms
- Data flow diagrams
- Interface specifications
- Error handling plans

```bash
# CLI execution
npx claude-flow@alpha sparc run pseudocode "JWT authentication flow"

# Expected output:
# - Authentication algorithm
# - Token generation logic
# - Validation procedures
# - Error handling flows
```

### Phase 3: Architecture (A)
**Goal**: System design and component organization

**Activities**:
- System architecture design
- Component identification
- Interface design
- Database schema design
- Technology stack selection

**Outputs**:
- Architecture diagrams
- Component specifications
- Database schema
- API design
- Technology decisions

```bash
# CLI execution
npx claude-flow@alpha sparc run architecture "microservices authentication"

# Expected output:
# - Service architecture
# - Database design
# - API specifications
# - Security architecture
```

### Phase 4: Refinement (R)
**Goal**: Test-driven implementation

**Activities**:
- Test case creation
- Implementation with TDD
- Code review and refactoring
- Performance optimization
- Security hardening

**Outputs**:
- Comprehensive test suite
- Production-ready code
- Performance benchmarks
- Security assessment
- Documentation

```bash
# CLI execution
npx claude-flow@alpha sparc run refinement "auth service implementation"

# Expected output:
# - Unit tests
# - Integration tests
# - Implementation code
# - Performance tests
# - Security tests
```

### Phase 5: Completion (C)
**Goal**: Integration and deployment readiness

**Activities**:
- End-to-end testing
- Integration verification
- Deployment preparation
- Monitoring setup
- Documentation completion

**Outputs**:
- E2E test suite
- Deployment scripts
- Monitoring configuration
- Complete documentation
- Performance baselines

```bash
# CLI execution
npx claude-flow@alpha sparc run completion "auth system deployment"

# Expected output:
# - E2E tests
# - Deployment configuration
# - Monitoring setup
# - Documentation
# - Performance metrics
```

## 🚀 SPARC Execution Methods

### Complete TDD Workflow
```bash
# Run complete SPARC TDD cycle
npx claude-flow@alpha sparc tdd "e-commerce checkout system"

# This executes all phases:
# 1. Specification analysis
# 2. Pseudocode design
# 3. Architecture planning
# 4. TDD implementation
# 5. Integration completion
```

### Individual Phase Execution
```bash
# Run specific phases
npx claude-flow@alpha sparc run specification "payment processing"
npx claude-flow@alpha sparc run architecture "payment gateway integration"
npx claude-flow@alpha sparc run refinement "payment service"
```

### Batch Processing
```bash
# Run multiple phases in sequence
npx claude-flow@alpha sparc batch spec,pseudocode,arch "user management system"

# Custom pipeline
npx claude-flow@alpha sparc pipeline "spec → arch → refinement" "API gateway"
```

## 🎭 SPARC with Agents

### Agent Assignment by Phase
Different agents excel at different SPARC phases:

```bash
# Specification phase agents
npx claude-flow@alpha sparc run specification \
  --agents researcher,planner \
  "inventory management system"

# Architecture phase agents
npx claude-flow@alpha sparc run architecture \
  --agents system-architect,backend-dev \
  "microservices design"

# Refinement phase agents
npx claude-flow@alpha sparc run refinement \
  --agents coder,tester,reviewer \
  "service implementation"
```

### Multi-Agent SPARC Coordination
```javascript
// Claude Code MCP coordination
mcp__claude-flow__sparc_orchestrate({
  task: "user authentication system",
  phases: ["specification", "pseudocode", "architecture", "refinement", "completion"],
  agents: {
    specification: "researcher",
    pseudocode: "architect",
    architecture: "system-architect",
    refinement: "coder",
    completion: "tester"
  },
  coordination: "parallel-where-possible"
})

// Then execute with Claude Code Task tool
Task("Requirements Analyst", "Analyze auth requirements and constraints", "researcher")
Task("System Architect", "Design authentication architecture", "system-architect")
Task("Implementation Lead", "TDD implementation of auth service", "coder")
Task("QA Engineer", "Comprehensive testing and validation", "tester")
```

## 📊 SPARC Benefits

### Quality Improvements
- **65% reduction in bugs** through systematic approach
- **90%+ test coverage** with TDD refinement phase
- **Consistent architecture** through planning phases
- **Clear documentation** from specification phase

### Development Efficiency
- **30% faster development** with clear specifications
- **Reduced rework** through upfront planning
- **Better estimates** with detailed architecture
- **Faster debugging** with comprehensive tests

### Team Coordination
- **Clear handoffs** between phases
- **Shared understanding** through documentation
- **Quality gates** at each phase
- **Measurable progress** through phase completion

## 🎯 SPARC Best Practices

### Phase Guidelines

#### Specification Phase
- **Be specific**: Clear, measurable acceptance criteria
- **Include constraints**: Performance, security, usability requirements
- **Define success**: Measurable success criteria
- **Consider edge cases**: Error conditions and boundary cases

#### Pseudocode Phase
- **Stay high-level**: Focus on logic, not syntax
- **Include error handling**: Plan for failure scenarios
- **Define interfaces**: Clear input/output specifications
- **Consider performance**: Algorithm complexity considerations

#### Architecture Phase
- **Design for scale**: Consider growth and load
- **Plan for change**: Flexible, maintainable architecture
- **Security by design**: Built-in security considerations
- **Document decisions**: Rationale for technology choices

#### Refinement Phase
- **Test first**: Write tests before implementation
- **Refactor continuously**: Improve code quality iteratively
- **Review frequently**: Regular code review cycles
- **Measure performance**: Benchmark critical paths

#### Completion Phase
- **Test integration**: Verify component interactions
- **Validate requirements**: Ensure specifications are met
- **Prepare deployment**: Production-ready configuration
- **Document operation**: Monitoring and maintenance guides

## 🔄 SPARC Iteration Patterns

### Incremental SPARC
```bash
# For large projects, iterate through SPARC for each feature
npx claude-flow@alpha sparc tdd "user registration"
npx claude-flow@alpha sparc tdd "user authentication"
npx claude-flow@alpha sparc tdd "password reset"
npx claude-flow@alpha sparc tdd "user profile management"
```

### Parallel SPARC
```javascript
// Multiple teams working on different components
Task("Auth Team", "SPARC authentication service", "sparc-coord")
Task("User Team", "SPARC user management service", "sparc-coord")
Task("Profile Team", "SPARC profile service", "sparc-coord")
```

### Adaptive SPARC
```bash
# Adjust process based on project complexity
npx claude-flow@alpha sparc adaptive \
  --complexity high \
  --team-size 6 \
  --timeline 4-weeks \
  "enterprise authorization system"
```

## 🛠️ SPARC Configuration

### Default Configuration
```json
{
  "sparc": {
    "mode": "tdd",
    "coverage": 90,
    "phases": {
      "specification": {
        "agent": "researcher",
        "timeout": 300,
        "deliverables": ["requirements", "acceptance-criteria"]
      },
      "refinement": {
        "agent": "coder",
        "testFirst": true,
        "coverageThreshold": 90
      }
    }
  }
}
```

### Custom SPARC Workflows
```bash
# Configure custom SPARC workflow
npx claude-flow@alpha config set sparc.customPhases \
  "analysis,design,prototype,implement,validate"

# Set phase-specific agents
npx claude-flow@alpha config set sparc.agents.analysis researcher
npx claude-flow@alpha config set sparc.agents.design system-architect
```

## 📈 SPARC Metrics and Monitoring

### Progress Tracking
```bash
# Monitor SPARC progress
npx claude-flow@alpha sparc status

# Export metrics
npx claude-flow@alpha sparc metrics --export json
```

### Quality Metrics
```javascript
// Track SPARC quality metrics via MCP
mcp__claude-flow__sparc_metrics({
  project: "auth-service",
  metrics: ["coverage", "complexity", "documentation", "performance"]
})
```

## 🎮 Interactive SPARC

### SPARC Wizard
```bash
# Interactive SPARC workflow
npx claude-flow@alpha sparc wizard

# Guided prompts:
# 1. Project description
# 2. Complexity level
# 3. Team composition
# 4. Timeline constraints
# 5. Quality requirements
```

### Real-time Collaboration
```javascript
// Real-time SPARC collaboration via Claude Code
mcp__claude-flow__sparc_collaborate({
  session: "auth-system-sparc",
  participants: ["architect", "coder", "tester"],
  phase: "architecture",
  realTime: true
})
```

## 🚨 SPARC Troubleshooting

### Common Issues
- **Incomplete specifications**: Use `researcher` agent for thorough analysis
- **Poor architecture**: Leverage `system-architect` for better design
- **Low test coverage**: Enable TDD mode in refinement phase
- **Integration failures**: Use `completion` phase for thorough testing

### Recovery Strategies
```bash
# Resume from specific phase
npx claude-flow@alpha sparc resume --from architecture "payment-system"

# Redo specific phase
npx claude-flow@alpha sparc redo --phase specification "user-auth"
```

## 📚 Further Reading

- **[Agents](../agents/README.md)** - Understanding specialized agent roles
- **[Swarm Coordination](../swarm-coordination/README.md)** - Multi-agent SPARC workflows
- **[Memory System](../memory-system/README.md)** - Context preservation across phases
- **[Beginner Tutorials](../../tutorials/beginner/README.md)** - Hands-on SPARC practice

---

**Ready to start with SPARC?**
- **CLI users**: Try `npx claude-flow@alpha sparc tdd "todo app"`
- **Claude Code users**: Use SPARC orchestration with Task tool coordination
- **Want to learn more**: Explore [hands-on tutorials](../../tutorials/beginner/README.md)