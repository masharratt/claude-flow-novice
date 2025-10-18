# SPARC Workflow Architecture

## Overview
SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) is a systematic methodology for Test-Driven Development that structures complex development tasks into manageable, iterative phases.

## 1. SPARC Phase Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SPARC METHODOLOGY                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │ SPECIFICATION   │───►│   PSEUDOCODE    │───►│  ARCHITECTURE   │     │
│  │      (S)        │    │      (P)        │    │       (A)       │     │
│  │                 │    │                 │    │                 │     │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │     │
│  │ │Requirements │ │    │ │ Algorithm   │ │    │ │System Design│ │     │
│  │ │   Analysis  │ │    │ │   Design    │ │    │ │             │ │     │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │     │
│  │                 │    │                 │    │                 │     │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │     │
│  │ │User Stories │ │    │ │  Logic      │ │    │ │Component    │ │     │
│  │ │             │ │    │ │  Flow       │ │    │ │Interaction  │ │     │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │     │
│  │                 │    │                 │    │                 │     │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │     │
│  │ │Acceptance   │ │    │ │Test Cases   │ │    │ │Data Models  │ │     │
│  │ │  Criteria   │ │    │ │  Outline    │ │    │ │             │ │     │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│           │                       │                       │            │
│           └───────────────────────┼───────────────────────┘            │
│                                   │                                    │
│                                   ▼                                    │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │   REFINEMENT    │◄───┤   COMPLETION    │◄───┤  TDD ITERATION  │     │
│  │      (R)        │    │      (C)        │    │                 │     │
│  │                 │    │                 │    │                 │     │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │     │
│  │ │Code Review  │ │    │ │Integration  │ │    │ │Test First   │ │     │
│  │ │             │ │    │ │   Testing   │ │    │ │             │ │     │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │     │
│  │                 │    │                 │    │                 │     │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │     │
│  │ │Performance  │ │    │ │Documentation│ │    │ │Code         │ │     │
│  │ │Optimization │ │    │ │             │ │    │ │Implementation│ │     │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │     │
│  │                 │    │                 │    │                 │     │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │     │
│  │ │Refactoring  │ │    │ │Deployment   │ │    │ │Refactor     │ │     │
│  │ │             │ │    │ │   Ready     │ │    │ │             │ │     │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Agent Assignment by SPARC Phase

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SPARC AGENT SPECIALIZATION                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SPECIFICATION PHASE                 PSEUDOCODE PHASE                   │
│  ┌─────────────────┐                ┌─────────────────┐                 │
│  │   RESEARCHER    │                │    PLANNER      │                 │
│  │                 │                │                 │                 │
│  │ • Requirements  │                │ • Algorithm     │                 │
│  │   gathering     │                │   design        │                 │
│  │ • Domain        │                │ • Logic flow    │                 │
│  │   analysis      │                │ • Test planning │                 │
│  │ • Stakeholder   │                │ • Complexity    │                 │
│  │   interviews    │                │   assessment    │                 │
│  └─────────────────┘                └─────────────────┘                 │
│                                                                         │
│  ARCHITECTURE PHASE                  REFINEMENT PHASE                   │
│  ┌─────────────────┐                ┌─────────────────┐                 │
│  │SYSTEM ARCHITECT │                │    REVIEWER     │                 │
│  │                 │                │                 │                 │
│  │ • System design │                │ • Code review   │                 │
│  │ • Component     │                │ • Quality       │                 │
│  │   architecture │                │   assurance     │                 │
│  │ • Data modeling │                │ • Performance   │                 │
│  │ • API design    │                │   optimization  │                 │
│  └─────────────────┘                └─────────────────┘                 │
│                                                                         │
│  COMPLETION PHASE                    TDD ITERATION                      │
│  ┌─────────────────┐                ┌─────────────────┐                 │
│  │DEVOPS ENGINEER  │                │     CODER       │                 │
│  │                 │                │                 │                 │
│  │ • Integration   │                │ • Test writing  │                 │
│  │ • Deployment    │                │ • Implementation│                 │
│  │ • CI/CD setup   │                │ • Refactoring   │                 │
│  │ • Monitoring    │                │ • Bug fixing    │                 │
│  └─────────────────┘                └─────────────────┘                 │
│                                                                         │
│                     CROSS-CUTTING AGENTS                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │     TESTER      │  │   PERFORMANCE   │  │    SECURITY     │         │
│  │                 │  │    ANALYST      │  │    MANAGER      │         │
│  │ • Test design   │  │                 │  │                 │         │
│  │ • Test          │  │ • Benchmarking  │  │ • Security      │         │
│  │   automation    │  │ • Optimization  │  │   assessment    │         │
│  │ • Quality gates │  │ • Load testing  │  │ • Vulnerability │         │
│  │                 │  │                 │  │   scanning      │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. SPARC Command Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SPARC CLI COMMANDS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    USER INTERFACE                               │   │
│  │                                                                 │   │
│  │   npx claude-flow-novice sparc modes        ──► List available modes  │   │
│  │   npx claude-flow-novice sparc run <mode>   ──► Execute specific mode │   │
│  │   npx claude-flow-novice sparc tdd          ──► Complete TDD workflow │   │
│  │   npx claude-flow-novice sparc batch        ──► Parallel execution   │   │
│  │   npx claude-flow-novice sparc pipeline     ──► Full pipeline        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   COMMAND ROUTER                                │   │
│  │                                                                 │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │   │
│  │   │  Mode   │    │  Task   │    │ Agent   │    │Workflow │     │   │
│  │   │Detection│    │Analysis │    │Selection│    │  Setup  │     │   │
│  │   │         │    │         │    │         │    │         │     │   │
│  │   │• sparc  │    │• Parse  │    │• Match  │    │• Init   │     │   │
│  │   │  modes  │    │• Split  │    │• Spawn  │    │• Memory │     │   │
│  │   │• Mode   │    │• Context│    │• Config │    │• Hooks  │     │   │
│  │   │  params │    │• Scope  │    │• Assign │    │• Start  │     │   │
│  │   └─────────┘    └─────────┘    └─────────┘    └─────────┘     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EXECUTION ENGINE                             │   │
│  │                                                                 │   │
│  │   Single Mode:           │  Pipeline Mode:      │  TDD Mode:    │   │
│  │                         │                      │               │   │
│  │   User Input            │  User Input          │  User Input   │   │
│  │        │                │       │              │       │       │   │
│  │        ▼                │       ▼              │       ▼       │   │
│  │   [S] Researcher ───────┼──► [S] Researcher ───┼──► [S] Spec   │   │
│  │        │                │       │              │       │       │   │
│  │        ▼                │       ▼              │       ▼       │   │
│  │   Output Result         │  [P] Planner         │  [P] Pseudo   │   │
│  │                         │       │              │       │       │   │
│  │                         │       ▼              │       ▼       │   │
│  │                         │  [A] Architect       │  [A] Arch     │   │
│  │                         │       │              │       │       │   │
│  │                         │       ▼              │       ▼       │   │
│  │                         │  [R] Reviewer        │  [R] TDD Loop │   │
│  │                         │       │              │       │       │   │
│  │                         │       ▼              │       ▼       │   │
│  │                         │  [C] Integration     │  [C] Complete │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4. TDD Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TEST-DRIVEN DEVELOPMENT FLOW                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      TDD CYCLE                                  │   │
│  │                                                                 │   │
│  │                    ┌─────────────┐                             │   │
│  │                    │    RED      │                             │   │
│  │                    │             │                             │   │
│  │                    │ Write Test  │                             │   │
│  │                    │ (Failing)   │                             │   │
│  │                    └──────┬──────┘                             │   │
│  │                           │                                    │   │
│  │                           ▼                                    │   │
│  │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │   │
│  │    │   GREEN     │◄───┤   AGENT     │───►│   REFACTOR  │      │   │
│  │    │             │    │COORDINATION │    │             │      │   │
│  │    │Implement    │    │             │    │ Clean Code  │      │   │
│  │    │ Code        │    │ • Memory    │    │ Optimize    │      │   │
│  │    │(Passing)    │    │ • Hooks     │    │ Improve     │      │   │
│  │    └──────┬──────┘    │ • Sync      │    └──────┬──────┘      │   │
│  │           │           └─────────────┘           │             │   │
│  │           └───────────────────┬─────────────────┘             │   │
│  │                               │                               │   │
│  │                               ▼                               │   │
│  │                    ┌─────────────┐                            │   │
│  │                    │   NEXT      │                            │   │
│  │                    │ ITERATION   │                            │   │
│  │                    │             │                            │   │
│  │                    │• New feature│                            │   │
│  │                    │• Edge case  │                            │   │
│  │                    │• Enhancement│                            │   │
│  │                    └─────────────┘                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    AGENT ROLES IN TDD                          │   │
│  │                                                                 │   │
│  │   RED Phase:                GREEN Phase:             REFACTOR: │   │
│  │   ┌─────────┐               ┌─────────┐              ┌─────────┐│   │
│  │   │ TESTER  │               │ CODER   │              │REVIEWER ││   │
│  │   │         │               │         │              │         ││   │
│  │   │• Design │               │• Minimal│              │• Clean  ││   │
│  │   │  tests  │               │  impl   │              │  code   ││   │
│  │   │• Edge   │               │• Make   │              │• Perf   ││   │
│  │   │  cases  │               │  tests  │              │  opt    ││   │
│  │   │• Assert │               │  pass   │              │• Best   ││   │
│  │   │  behav  │               │• Quick  │              │  pract  ││   │
│  │   └─────────┘               │  fix    │              └─────────┘│   │
│  │                             └─────────┘                        │   │
│  │                                                                 │   │
│  │   Continuous Integration:                                       │   │
│  │   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐        │   │
│  │   │ Build   │──►│  Test   │──►│ Deploy  │──►│Monitor  │        │   │
│  │   │ Agent   │   │ Agent   │   │ Agent   │   │ Agent   │        │   │
│  │   └─────────┘   └─────────┘   └─────────┘   └─────────┘        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 5. Memory Integration in SPARC

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SPARC MEMORY ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  PHASE MEMORY STORAGE                           │   │
│  │                                                                 │   │
│  │   Key Pattern: sparc/{phase}/{project_id}/{artifact}           │   │
│  │                                                                 │   │
│  │   Specification Phase:                                          │   │
│  │   • sparc/spec/project_123/requirements                        │   │
│  │   • sparc/spec/project_123/user_stories                        │   │
│  │   • sparc/spec/project_123/acceptance_criteria                 │   │
│  │                                                                 │   │
│  │   Pseudocode Phase:                                            │   │
│  │   • sparc/pseudo/project_123/algorithms                        │   │
│  │   • sparc/pseudo/project_123/logic_flow                        │   │
│  │   • sparc/pseudo/project_123/test_cases                        │   │
│  │                                                                 │   │
│  │   Architecture Phase:                                          │   │
│  │   • sparc/arch/project_123/system_design                       │   │
│  │   • sparc/arch/project_123/component_diagram                   │   │
│  │   • sparc/arch/project_123/data_models                         │   │
│  │                                                                 │   │
│  │   Refinement Phase:                                            │   │
│  │   • sparc/refine/project_123/code_review                       │   │
│  │   • sparc/refine/project_123/optimizations                     │   │
│  │   • sparc/refine/project_123/quality_metrics                   │   │
│  │                                                                 │   │
│  │   Completion Phase:                                            │   │
│  │   • sparc/complete/project_123/integration_tests               │   │
│  │   • sparc/complete/project_123/deployment_config               │   │
│  │   • sparc/complete/project_123/documentation                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   CROSS-PHASE COORDINATION                      │   │
│  │                                                                 │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │   │
│  │   │ SPEC    │───►│ PSEUDO  │───►│  ARCH   │───►│ REFINE  │     │   │
│  │   │         │    │         │    │         │    │         │     │   │
│  │   │Memory:  │    │Reads:   │    │Reads:   │    │Reads:   │     │   │
│  │   │• Store  │    │• Spec   │    │• Spec   │    │• Arch   │     │   │
│  │   │  req    │    │• Extend │    │• Pseudo │    │• Code   │     │   │
│  │   │• Store  │    │  logic  │    │• Design │    │• Tests  │     │   │
│  │   │  user   │    │Memory:  │    │  system │    │Memory:  │     │   │
│  │   │  story  │    │• Store  │    │Memory:  │    │• Store  │     │   │
│  │   │• Store  │    │  algo   │    │• Store  │    │  review │     │   │
│  │   │  accept │    │• Store  │    │  design │    │• Store  │     │   │
│  │   │  crit   │    │  test   │    │• Store  │    │  metrics│     │   │
│  │   └─────────┘    │  cases  │    │  models │    └─────────┘     │   │
│  │                  └─────────┘    └─────────┘                    │   │
│  │                                                                 │   │
│  │   ┌─────────┐                                                   │   │
│  │   │COMPLETE │◄──────────────────────────────────────────────── │   │
│  │   │         │                                                   │   │
│  │   │Reads:   │                                                   │   │
│  │   │• All    │                                                   │   │
│  │   │  phases │                                                   │   │
│  │   │• Compile│                                                   │   │
│  │   │• Deploy │                                                   │   │
│  │   │Memory:  │                                                   │   │
│  │   │• Store  │                                                   │   │
│  │   │  final  │                                                   │   │
│  │   │  result │                                                   │   │
│  │   └─────────┘                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 6. SPARC Quality Gates

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         QUALITY GATES                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   PHASE VALIDATION                              │   │
│  │                                                                 │   │
│  │   SPECIFICATION ──► Validation ──► PSEUDOCODE                  │   │
│  │   ┌─────────────┐   ┌─────────┐   ┌─────────────┐               │   │
│  │   │• Clear req  │──►│✓ Check  │──►│• Algorithm  │               │   │
│  │   │• Testable   │   │✓ Verify │   │• Logic flow │               │   │
│  │   │• Complete   │   │✓ Approve│   │• Test cases │               │   │
│  │   └─────────────┘   └─────────┘   └─────────────┘               │   │
│  │                                                                 │   │
│  │   PSEUDOCODE ────► Validation ──► ARCHITECTURE                 │   │
│  │   ┌─────────────┐   ┌─────────┐   ┌─────────────┐               │   │
│  │   │• Logic flow │──►│✓ Review │──►│• System     │               │   │
│  │   │• Algorithm  │   │✓ Test   │   │  design     │               │   │
│  │   │• Edge cases │   │✓ Refine │   │• Components │               │   │
│  │   └─────────────┘   └─────────┘   └─────────────┘               │   │
│  │                                                                 │   │
│  │   ARCHITECTURE ──► Validation ──► REFINEMENT                   │   │
│  │   ┌─────────────┐   ┌─────────┐   ┌─────────────┐               │   │
│  │   │• Design     │──►│✓ Arch   │──►│• Code review│               │   │
│  │   │• Scalable   │   │✓ Scale  │   │• Performance│               │   │
│  │   │• Testable   │   │✓ Test   │   │• Quality    │               │   │
│  │   └─────────────┘   └─────────┘   └─────────────┘               │   │
│  │                                                                 │   │
│  │   REFINEMENT ────► Validation ──► COMPLETION                   │   │
│  │   ┌─────────────┐   ┌─────────┐   ┌─────────────┐               │   │
│  │   │• Optimized  │──►│✓ Perf   │──►│• Integration│               │   │
│  │   │• Clean code │   │✓ Quality│   │• Deployment │               │   │
│  │   │• Tested     │   │✓ Ready  │   │• Production │               │   │
│  │   └─────────────┘   └─────────┘   └─────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      QUALITY METRICS                            │   │
│  │                                                                 │   │
│  │   Code Coverage:     ████████████████████████ 95%              │   │
│  │   Test Pass Rate:    █████████████████████ 98%                 │   │
│  │   Performance:       ████████████████ 85%                      │   │
│  │   Documentation:     ███████████████████ 90%                   │   │
│  │   Security:          ████████████████████ 92%                  │   │
│  │   Maintainability:   ███████████████████████ 96%               │   │
│  │                                                                 │   │
│  │   Quality Gates:                                                │   │
│  │   • Minimum 90% code coverage required                         │   │
│  │   • All tests must pass                                        │   │
│  │   • Performance benchmarks must meet targets                   │   │
│  │   • Security scan must show no critical issues                 │   │
│  │   • Code review approval required                              │   │
│  │   • Documentation completeness > 85%                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key SPARC Principles

### 1. Systematic Approach
- Each phase builds on the previous one
- Clear deliverables and acceptance criteria
- Quality gates between phases

### 2. Test-Driven Development
- Tests written before implementation
- Continuous validation and feedback
- Red-Green-Refactor cycle integration

### 3. Collaborative Intelligence
- Specialized agents for each phase
- Shared memory for context preservation
- Cross-phase coordination and validation

### 4. Iterative Refinement
- Continuous improvement through phases
- Performance optimization focus
- Quality metrics tracking

### 5. Production Readiness
- Complete integration testing
- Deployment automation
- Monitoring and observability

## SPARC Best Practices

1. **Start with Clear Requirements**: Invest time in thorough specification
2. **Think Before Coding**: Design algorithms and architecture first
3. **Test Early and Often**: Integrate TDD from the beginning
4. **Review and Refine**: Don't skip the refinement phase
5. **Document Everything**: Maintain comprehensive documentation
6. **Monitor Quality**: Use metrics to guide decisions
7. **Automate Pipeline**: Use SPARC commands for consistency