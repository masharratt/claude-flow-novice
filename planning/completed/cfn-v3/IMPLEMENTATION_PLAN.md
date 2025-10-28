# CFN Loop v3 Implementation Plan

## 1. Executive Summary

**Project Overview:**
Redesign Claude Flow Novice (CFN) Loop into a modular, AI-driven, multi-domain continuous improvement system that learns and adapts across different task types.

**Timeline:** 14 weeks (7 phases, 2 weeks per phase)
**Key Deliverables:**
- Dynamic, AI-powered coordinator
- Context injection-first coordination
- Universal loop structure supporting 6 domains
- Playbook-driven learning system
- Performance optimization

**Success Metrics:**
1. Reduce average iterations from 5.2 to 3.5
2. Reduce context size by 88%
3. Cut time to first convergence by 33%
4. Expand task type support from 1 to 6 domains
5. Achieve 90%+ agent selection accuracy
6. Implement real-time intervention with 80%+ effectiveness

## 2. Phase-by-Phase Breakdown

### Phase 1: Foundation (Weeks 1-2)
**Objective:** Establish core coordinator capabilities without breaking existing system

**Tasks:**
- P1-T01: Create coordinator agent template
  - Skill: `/skills/coordinator/`
  - Deliverables: `coordinator.md`
  - Dependencies: None

- P1-T02: Implement task type detection
  - Skill: `/skills/task-classifier/`
  - Deliverables: `task-type-classifier.sh`
  - Dependencies: P1-T01

- P1-T03: Build validation criteria templates
  - Skill: `/skills/validation-templates/`
  - Deliverables: `validation-templates/` directory
    - `software.json`
    - `content.json`
  - Dependencies: P1-T02

- P1-T04: Implement context pruning logic
  - Skill: `/skills/context-pruner/`
  - Deliverables: `context-pruner.sh`
  - Dependencies: P1-T01, P1-T02

- P1-T05: Create coordinator agent template (Task tool compatible)
  - Skill: `.claude/agents/`
  - Deliverables: `cfn-v3-coordinator.md`
  - Dependencies: P1-T01, P1-T02
  - Reusable: None (new agent)
  - Learning: STRAT-007 (background execution for long-running tasks)
  - Details:
    - Agent spawnable via Task() tool from Main Chat
    - Implements BLPOP waiting loop for orchestrator events
    - Handles intervention triggers (plateau, recurring feedback)
    - Returns structured result to Main Chat

- P1-T06: Implement Redis event publishing in orchestrator
  - Skill: `.claude/skills/orchestrator-events/`
  - Deliverables:
    - `publish-event.sh` (reusable event publisher)
    - Updated `orchestrate-cfn-loop.sh` with event publishing
  - Dependencies: P1-T05
  - Reusable: Existing `orchestrate-cfn-loop.sh` (modify)
  - Learning: PATTERN-008 (Product Owner decision flow)
  - Details:
    - Publish events: iteration_complete, confidence_plateau, recurring_feedback, orchestrator_complete
    - JSON event format with type, iteration, confidence, consensus, timestamp
    - Uses LPUSH to coordinator event queue

- P1-T07: Implement BLPOP waiting loop in coordinator
  - Skill: `.claude/skills/coordinator-waiting/`
  - Deliverables:
    - `wait-for-events.sh` (BLPOP loop logic)
    - Coordinator agent uses this skill
  - Dependencies: P1-T06
  - Reusable: Existing `invoke-waiting-mode.sh` patterns
  - Learning: STRAT-002 (zero-token blocking with BLPOP)
  - Details:
    - BLPOP with timeout=0 (infinite wait, zero tokens)
    - Event handler switch statement
    - Intervention trigger detection
    - Exit on orchestrator_complete event

- P1-T08: Update orchestrator to support context injection
  - Skill: `/skills/cfn-loop-validation/`
  - Deliverables: Updated `orchestrate-cfn-loop.sh`
  - Dependencies: P1-T05, P1-T06, P1-T07

**Testing Requirements:**
- Verify task type detection accuracy (≥90%)
- Confirm context pruning reduces size by 50%
- Validate existing CFN loops work with context injection mode
- **NEW:** Test coordinator spawn via Task() tool from Main Chat
- **NEW:** Test BLPOP waiting loop (coordinator wakes on events)
- **NEW:** Test orchestrator event publishing (all event types)
- **NEW:** Verify zero-token waiting (no API calls during BLPOP)
- **NEW:** Test intervention triggers (plateau, recurring feedback)

**Success Criteria:**
- Foundation scripts complete
- Task type classifier operational
- Context pruning implemented
- Initial validation templates created
- **NEW:** Coordinator spawnable via Task() tool
- **NEW:** BLPOP waiting loop functional (zero-token)
- **NEW:** Orchestrator publishes events correctly
- **NEW:** Intervention logic operational

**Anti-Patterns to Avoid (from EXISTING_LEARNINGS.md):**
- ❌ **ANTI-020:** Context storage without injection
  - Mitigation: Always retrieve context and inject into agent prompts
- ❌ **ANTI-021:** Generic context when specifics exist
  - Mitigation: Pass complete deliverables, not iteration numbers
- ❌ Sleep loops for waiting
  - Mitigation: Use Redis BLPOP (zero-token, event-driven)
- ❌ CLI-spawned coordinator
  - Mitigation: Coordinator is Task() tool agent only

### Phase 2: Dynamic Agent Selection (Weeks 3-4)
**Objective:** Enable AI-driven agent selection based on task characteristics

**Tasks:**
- P2-T01: Create agent selection skill
  - Skill: `/skills/agent-selector/`
  - Deliverables: `select-agents.sh`
  - Dependencies: Phase 1 completion

- P2-T02: Implement task complexity estimation
  - Skill: `/skills/complexity-estimator/`
  - Deliverables: `estimate-complexity.sh`
  - Dependencies: P2-T01

- P2-T03: Build playbook storage system
  - Skill: `/skills/playbook/`
  - Deliverables:
    - `playbook.db` (SQLite schema)
    - `query-playbook.sh`
    - `update-playbook.sh`
  - Dependencies: P2-T01

- P2-T04: Develop agent performance tracking
  - Skill: `/skills/analytics/`
  - Deliverables: Enhanced `skill-invocations.sql`
  - Dependencies: P2-T03

**Testing Requirements:**
- Validate agent selection accuracy (≥85%)
- Confirm playbook stores execution patterns
- Verify complexity estimation matches human assessment

**Success Criteria:**
- Dynamic agent selection working
- Playbook storage operational
- Performance tracking implemented

### Phase 3: Task Breakdown (Weeks 5-6)
**Objective:** Enable AI-driven epic decomposition into logical sprints

**Tasks:**
- P3-T01: Implement epic analysis skill
  - Skill: `/skills/epic-decomposer/`
  - Deliverables: `decompose-epic.sh`
  - Dependencies: Phase 2 completion

- P3-T02: Build dependency extraction mechanism
  - Skill: `/skills/dependency-extractor/`
  - Deliverables: `extract-dependencies.sh`
  - Dependencies: P3-T01

- P3-T03: Create sprint planner
  - Skill: `/skills/sprint-planner/`
  - Deliverables:
    - `plan-sprints.sh`
    - Sprint dependency graph visualization
  - Dependencies: P3-T01, P3-T02

- P3-T04: Build sprint execution coordinator
  - Skill: `/skills/sprint-executor/`
  - Deliverables: `execute-sprint.sh`
  - Dependencies: All previous tasks in phase

**Testing Requirements:**
- Validate epic decomposition accuracy
- Verify sprint dependencies are respected
- Confirm sprint estimates within 15% of actual time

**Success Criteria:**
- Epics decomposed into logical sprints
- Dependency tracking works
- Sprint planning skill operational

### Phase 4: Real-Time Monitoring & Intervention (Weeks 7-8)
**Objective:** Enable coordinator to monitor and intervene during execution

**Tasks:**
- P4-T01: Implement orchestrator event streaming
  - Skill: `/skills/event-streaming/`
  - Deliverables: Enhanced Redis pub/sub mechanisms
  - Dependencies: Previous phases

- P4-T02: Build intervention detection logic
  - Skill: `/skills/intervention-detector/`
  - Deliverables: `detect-intervention-triggers.sh`
  - Dependencies: P4-T01

- P4-T03: Create agent swap mechanism
  - Skill: `/skills/agent-swapper/`
  - Deliverables:
    - `swap-agent.sh`
    - `add-specialist.sh`
  - Dependencies: P4-T02

- P4-T04: Implement scope simplification
  - Skill: `/skills/scope-simplifier/`
  - Deliverables: `simplify-scope.sh`
  - Dependencies: Previous tasks

**Testing Requirements:**
- Verify 90% of stuck patterns are detected
- Confirm interventions reduce iterations
- Test zero false-positive interventions

**Success Criteria:**
- Real-time monitoring operational
- Dynamic agent intervention working
- Scope adjustment mechanism complete

### Phase 5: Loop 5 Retrospective (Weeks 9-10)
**Objective:** Create post-sprint learning and playbook update mechanism

**Tasks:**
- P5-T01: Create Loop 5 retrospective agent
  - Skill: `/skills/retrospective-agent/`
  - Deliverables: `retrospective-analyst.md`
  - Dependencies: Previous phases

- P5-T02: Build analysis framework
  - Skill: `/skills/pattern-extractor/`
  - Deliverables:
    - `analyze-sprint.sh`
    - Retrospective report template
  - Dependencies: P5-T01

- P5-T03: Implement pattern extraction
  - Skill: `/skills/pattern-learner/`
  - Deliverables: `extract-patterns.sh`
  - Dependencies: P5-T02

- P5-T04: Add playbook update logic
  - Skill: `/skills/playbook/`
  - Deliverables: Enhanced `update-playbook.sh`
  - Dependencies: All previous tasks

**Testing Requirements:**
- Verify 100% of sprints get retrospective analysis
- Confirm playbook updates with meaningful insights
- Test pattern extraction accuracy

**Success Criteria:**
- Retrospective agent operational
- Pattern learning mechanism working
- Playbook automatically updated

### Phase 6: Multi-Domain Support (Weeks 11-12)
**Objective:** Expand beyond software to support multiple task domains

**Tasks:**
- P6-T01: Create domain-specific validation templates
  - Skill: `/skills/validation-templates/`
  - Deliverables:
    - `content.json`
    - `research.json`
    - `design.json`
    - `infrastructure.json`
    - `data.json`
  - Dependencies: Previous phases

- P6-T02: Build domain-specific agent rosters
  - Skill: `/skills/agent-selector/`
  - Deliverables: Updated agent selection logic
  - Dependencies: P6-T01

- P6-T03: Add domain-specific success metrics
  - Skill: `/skills/metrics-tracker/`
  - Deliverables: Domain-specific metric definitions
  - Dependencies: P6-T01, P6-T02

- P6-T04: Test with real examples
  - Skill: Various
  - Deliverables: Example workflow documentation per domain
  - Dependencies: All previous tasks

**Testing Requirements:**
- Validate all 6 domains supported
- Confirm domain-specific validation works
- Verify agent rosters match domain needs

**Success Criteria:**
- Multi-domain support complete
- Domain-specific workflows documented
- Validation templates for each domain

### Phase 7: Polish & Documentation (Weeks 13-14)
**Objective:** Finalize v3 system with comprehensive documentation and optimization

**Tasks:**
- P7-T01: Performance optimization
  - Skill: Various
  - Deliverables: Performance benchmarks
  - Dependencies: All previous phases

- P7-T02: Error handling improvements
  - Skill: `/skills/error-handler/`
  - Deliverables: Error handling coverage report
  - Dependencies: All previous phases

- P7-T03: Create monitoring dashboard
  - Skill: `/skills/analytics/`
  - Deliverables: Grafana dashboard configuration
  - Dependencies: P7-T01, P7-T02

- P7-T04: Generate documentation
  - Skill: Documentation
  - Deliverables:
    - User guide
    - Migration guide (v2 → v3)
    - API reference
  - Dependencies: All previous phases

**Testing Requirements:**
- Verify 95%+ test coverage
- Confirm performance improvements
- Validate documentation completeness

**Success Criteria:**
- System performance 2x faster than v2
- Comprehensive documentation
- Clear migration path

## 3. Resource Requirements

### Agent Types Needed
- CFN Coordinator Agent
- Task Classifier Agent
- Epic Decomposition Agent
- Retrospective Analyst Agent
- Domain-Specific Agents (6 domains)
- Validation Specialists

### Skills to Create/Modify
1. Coordinator Management
2. Task Classification
3. Validation Templating
4. Context Pruning
5. Agent Selection
6. Complexity Estimation
7. Epic Decomposition
8. Intervention Detection
9. Retrospective Analysis
10. Pattern Extraction

### Database/Configuration Changes
- SQLite Playbook Database
- Redis Pub/Sub Configuration Updates
- Context Injection Configuration

## 4. Testing Strategy

### Unit Tests
- Each skill requires comprehensive unit tests
- Test individual components in isolation
- Verify input/output contracts
- Validate error handling

### Integration Tests
- Test coordination between skills
- Verify context flow across layers
- Validate agent interaction mechanisms
- Test multi-domain support

### End-to-End Scenarios
- Complete workflow tests for each domain
- Simulate various task complexity levels
- Test intervention and adaptation mechanisms
- Validate playbook learning

### Performance Benchmarks
- Measure iteration count reduction
- Track context size over multiple iterations
- Monitor agent selection accuracy
- Assess intervention effectiveness

## 5. Risk Management

### Technical Risks
- Complexity in multi-domain support
- Performance overhead of dynamic agent selection
- Context pruning accuracy
- Playbook learning effectiveness

### Mitigation Strategies
- Incremental implementation
- Extensive testing at each phase
- Fallback mechanisms in agent selection
- Continuous performance monitoring

### Rollback Plans
- Maintain v2 compatibility
- Feature flags for new functionalities
- Preserve existing Redis coordination as backup
- Detailed migration documentation

## 6. Integration Points

### V2 System Integration
- Context injection mode as default
- Backward compatibility for existing CFN loops
- Gradual feature rollout
- Parallel execution possible

### Migration Strategy
- Phases can be adopted independently
- Skills designed for modular adoption
- Explicit feature toggles
- Comprehensive migration guide

## 7. Success Metrics Dashboard

### System Performance
- Average iterations to convergence
- Context size reduction
- Time to first convergence
- Successful task types supported

### Quality Metrics
- False consensus rate
- Deliverable completeness
- Validator agreement
- Agent confidence calibration

### User Experience
- Setup complexity
- Debuggability
- Extensibility
- Transparency of process

## 8. Conclusion

CFN v3 represents a transformative approach to task execution, turning the coordinator from a passive launcher into an intelligent, learning system. By embracing context injection, dynamic agent selection, and continuous improvement, we're setting a new standard for AI-driven workflow management.

**Key Innovations:**
1. Universal loop structure
2. AI-powered coordinator
3. Context-first approach
4. Real-time intervention
5. Multi-domain support
6. Playbook-driven learning

**Next Steps:**
1. Validate implementation plan
2. Prioritize initial tasks
3. Begin Phase 1 implementation

Are you ready to build the future of Claude Flow Novice?