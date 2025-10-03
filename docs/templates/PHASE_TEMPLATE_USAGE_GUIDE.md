# Phase Document Template - Usage Guide

**Version**: 1.0
**Date**: 2025-10-02

---

## Overview

This guide explains how to use the `PHASE_DOCUMENT_TEMPLATE.md` to create structured phase documents for your implementation roadmap.

## Quick Start

1. **Copy the template**:
   ```bash
   cp docs/templates/PHASE_DOCUMENT_TEMPLATE.md docs/phases/PHASE_X_NAME.md
   ```

2. **Fill in placeholders** (search for `[` to find all):
   - `[NUMBER]` - Phase number (0, 1, 2, etc.)
   - `[PHASE NAME]` - Descriptive phase name
   - `[YYYY-MM-DD]` - Actual dates
   - `[Description]` - Detailed descriptions

3. **Review Phase 0 example**: See `/docs/phases/PHASE_0_SDK_FOUNDATION.md` for complete reference

4. **Run post-edit hook**:
   ```bash
   node src/hooks/enhanced-post-edit-pipeline.js post-edit "docs/phases/PHASE_X_NAME.md" \
     --memory-key "phase-X/planning" --structured
   ```

---

## Template Sections Explained

### 1. Phase Overview

**Purpose**: Provide context and positioning within the broader roadmap

**Key Components**:
- **Previous Phase**: What was just completed (enables understanding dependencies)
- **Current Phase**: What you're documenting now
- **Next Phase**: What comes after (shows how current phase enables future work)

**Timeline Table**:
```markdown
| Milestone | Target Date | Dependencies | Status |
|-----------|-------------|--------------|--------|
| Phase kickoff | YYYY-MM-DD | Phase X complete | ⏳ |
```

**Scope Boundaries**: Clearly define what IS and ISN'T included to prevent scope creep

---

### 2. Objectives

**Primary Objectives** (3-5 objectives):
```markdown
1. **[Objective Category]**: [Objective Description]
   - **Rationale**: Why this objective matters
   - **Impact**: What this enables downstream
   - **Measurement**: How success is quantified
```

**Guidelines**:
- Focus on **outcomes**, not activities
- Each objective should have measurable criteria
- Link to success criteria section

**Secondary Objectives**: Nice-to-haves if time permits

---

### 3. Success Criteria

**All criteria must be BINARY (yes/no) and measurable**

**Four Categories**:

#### Functional Criteria (F1, F2, F3...)
Features and capabilities that must work:
```markdown
| F1 | Spawn 20 agents in <2 seconds | <2s latency | `npm run benchmark:spawn` | ⏳ |
```

#### Performance Criteria (P1, P2, P3...)
Speed, resource usage, scalability:
```markdown
| P1 | Agent spawn latency | <100ms (p95) | `benchmark.js` suite | ⏳ |
```

#### Quality Criteria (Q1, Q2, Q3...)
Code quality, testing, security:
```markdown
| Q1 | Test coverage | ≥80% | `npm run test:coverage` | ⏳ |
```

#### Validation Criteria (V1, V2, V3...)
Integration, compatibility, consensus:
```markdown
| V1 | Byzantine consensus | ≥90% agreement | Validator swarm | ⏳ |
```

**Best Practices**:
- Always include test coverage (≥80%)
- Always include security audit
- Always include Byzantine consensus for critical phases
- Provide exact measurement commands

---

### 4. Deliverables

**Each deliverable needs**:
- Description (what's being built)
- Components (files/modules)
- Acceptance tests (how to validate)
- Expected outputs (artifacts)
- Dependencies (prerequisites)
- Status (⏳/🔄/✅)

**Example Structure**:
```markdown
#### Deliverable 1: [Name]

**Description**: [What's being delivered]

**Components**:
- Component 1: `/path/to/file1.ts`
- Component 2: `/path/to/file2.ts`

**Acceptance Tests**:
\`\`\`bash
npm run test:deliverable1:unit
npm run test:deliverable1:integration
\`\`\`

**Expected Outputs**:
- Artifact 1: Working API endpoint
- Artifact 2: Documentation

**Dependencies**: [Prerequisites]

**Status**: ⏳ Not Started
```

**Documentation Deliverables**:
- API Documentation (D1)
- Architecture Documentation (D2)

---

### 5. Developer Assignments

**Team Structure**:
- Phase Lead: Overall coordination
- Core Developers: Implementation

**Per Developer**:
```markdown
### Developer 1: [Name]

**Primary Responsibilities**:
- Deliverable X: [Component]
- Deliverable Y: [Component]

**Workload Estimate**: [X hours]

**Key Tasks**:
1. Task 1: [Description] - [Est. hours]
2. Task 2: [Description] - [Est. hours]

**Files/Components**:
- `/path/to/component1.ts`
- `/path/to/component2.ts`

**Dependencies**:
- Requires Developer 2 to complete [task] first
```

**Guidelines**:
- Assign specific files/components to each developer
- Estimate hours per task
- Document dependencies between developers
- Identify blockers early

---

### 6. Dependencies

**Three Categories**:

#### Phase Dependencies
```markdown
| Dependency | Type | Status | Risk Level | Mitigation |
|-----------|------|--------|------------|------------|
| Phase X complete | Internal | ✅ Complete | Low | N/A |
| Component Y | Internal | 🔄 In Progress | Medium | Parallel work |
| Library Z | External | ⏳ Pending | High | Alternative identified |
```

#### Technical Dependencies
- Required for phase start
- Required for phase completion

#### Blocker Management
- Current blockers
- Blocker resolution process
- Escalation path

---

### 7. Risks & Mitigations

**High-Priority Risks** (detailed):
```markdown
#### Risk 1: [Risk Name]

**Probability**: High | Medium | Low
**Impact**: High | Medium | Low
**Overall Risk Score**: [Probability × Impact]

**Description**: [What could go wrong]

**Indicators** (early warning signs):
- Sign 1
- Sign 2

**Mitigation Strategy**:
1. Proactive action 1
2. Proactive action 2

**Contingency Plan** (if risk occurs):
1. Immediate action
2. Escalation path
3. Alternative approach

**Owner**: [Developer Name]
**Status**: ⏳ Monitoring
```

**Medium-Priority Risks** (table format):
```markdown
| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| [Risk 3] | Medium | Medium | [Brief mitigation] | [Name] |
```

---

### 8. Testing Requirements

**Coverage Targets**:
```markdown
| Test Type | Coverage Target | Current | Status |
|-----------|----------------|---------|--------|
| Unit tests | ≥80% | 0% | ⏳ |
| Integration tests | ≥70% | 0% | ⏳ |
```

**Test Categories**:

#### Unit Tests
- Location: `/tests/unit/phase-[N]/`
- Requirements: All public functions tested, edge cases covered
- Execution: `npm run test:unit:phase-[N]`
- Validation: ≥80% line coverage

#### Integration Tests
- Location: `/tests/integration/phase-[N]/`
- Requirements: Component interaction, API contracts
- Test scenarios (list specific scenarios)
- Execution: `npm run test:integration:phase-[N]`

#### Performance Tests
- Location: `/benchmark/phase-[N]/`
- Benchmarks for critical operations
- Load testing (10x normal usage)
- Execution: `npm run benchmark:phase-[N]`

#### Security Tests
- Dependency scan: `npm audit`
- Security tests: `npm run test:security:phase-[N]`
- Validation: 0 high/critical vulnerabilities

**TDD Compliance**:
- Red-Green-Refactor cycle mandatory
- Post-edit hook validation required

**Consensus Validation**:
- Byzantine consensus required: Yes/No
- Validator count: 3-4 agents
- Threshold: ≥90% agreement
- Execution: `npx claude-flow-novice swarm validate --phase [N]`

---

### 9. Phase Completion Checklist

**Six Categories** (all must be ✅):

#### Functional Completion
- [ ] All deliverables implemented
- [ ] All acceptance tests passing
- [ ] All functional success criteria met
- [ ] API backward compatibility maintained
- [ ] Integration validated

#### Quality Assurance
- [ ] Test coverage ≥80% overall
- [ ] All tests passing
- [ ] No linting errors
- [ ] TypeScript compilation clean
- [ ] Security audit clean
- [ ] Performance benchmarks passing

#### Documentation
- [ ] API documentation complete
- [ ] Architecture documentation updated
- [ ] Migration guide created (if applicable)
- [ ] Code comments added
- [ ] README updated
- [ ] CHANGELOG updated

#### Consensus Validation
- [ ] Byzantine consensus achieved (≥90%)
- [ ] Validator swarm approved
- [ ] Security specialist sign-off
- [ ] Architect approved
- [ ] All critical issues resolved

#### Deployment Readiness
- [ ] Configuration files updated
- [ ] Environment variables documented
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Deployment checklist created

#### Handoff Preparation
- [ ] Next phase dependencies identified
- [ ] Knowledge transfer completed
- [ ] Known issues documented
- [ ] Technical debt logged
- [ ] Phase retrospective completed

---

### 10. Timeline & Milestones

**Week-by-Week Breakdown**:
```markdown
#### Week 1: [Milestone Name]

**Goals**:
- Goal 1
- Goal 2

**Deliverables**:
- Deliverable 1

**Risks**: [Potential issues this week]

**Status**: ⏳ Pending
```

**Critical Path**:
```
Week 1: Foundation
  └─> Week 2: Core Implementation
        └─> Week 3: Integration
              └─> Week 4: Testing
                    └─> Week 5: Consensus
```

**Velocity Tracking**:
```markdown
| Week | Planned Story Points | Actual Story Points | Variance |
|------|---------------------|---------------------|----------|
| 1 | [X] | [Y] | [±Z] |
```

---

## Status Symbols Reference

- ⏳ **Pending**: Not started
- 🔄 **In Progress**: Currently working
- ✅ **Complete**: Finished successfully
- ⚠️ **At Risk**: Potential issues detected
- 🚫 **Blocked**: Cannot proceed without resolution

---

## Best Practices

### 1. Keep Criteria Measurable
**Bad**: "Improve performance"
**Good**: "Agent spawn latency <100ms (p95) measured by benchmark.js"

### 2. Define Clear Test Commands
Every success criterion should have an exact test command:
```bash
npm run test:unit:phase-0         # Runs unit tests
npm run benchmark:spawn           # Tests spawn performance
npm run test:coverage             # Checks coverage threshold
```

### 3. Document Dependencies Early
Identify blockers BEFORE they block:
- Technical dependencies
- Inter-developer dependencies
- External team dependencies

### 4. Risk Management
- Identify risks during planning (not during execution)
- Assign owners to each risk
- Create contingency plans proactively
- Monitor indicators weekly

### 5. Consensus Validation
Always include Byzantine consensus for:
- Architectural changes
- Security-critical features
- Performance-sensitive code
- Major refactors

### 6. Progressive Documentation
Update phase document as work progresses:
- Update status symbols daily
- Track actual vs. planned hours
- Document issues as discovered
- Update completion checklist continuously

---

## Example: Creating Phase 1

```bash
# Step 1: Copy template
cp docs/templates/PHASE_DOCUMENT_TEMPLATE.md docs/phases/PHASE_1_CLI_MODE.md

# Step 2: Fill in placeholders
# Search for [ and replace:
# - [NUMBER] → 1
# - [PHASE NAME] → CLI Mode Implementation
# - Previous Phase → Phase 0: SDK Foundation
# - Next Phase → Phase 2: SDK Mode Implementation

# Step 3: Add specific deliverables
# - Deliverable 1: Process Pool Manager
# - Deliverable 2: File-based State System
# - Deliverable 3: SIGSTOP/SIGCONT Pause/Resume

# Step 4: Define success criteria
# - F1: Spawn 20 agents in <2 seconds via process pool
# - P1: Process pool initialization <50ms
# - Q1: Test coverage ≥80%

# Step 5: Assign developers
# - Developer 1: Process Pool Manager
# - Developer 2: State Management
# - Developer 3: Testing & Documentation

# Step 6: Run validation
node src/hooks/enhanced-post-edit-pipeline.js post-edit \
  "docs/phases/PHASE_1_CLI_MODE.md" \
  --memory-key "phase-1/planning" \
  --structured
```

---

## Common Mistakes to Avoid

### 1. Vague Success Criteria
**Wrong**:
```markdown
| F1 | System works well | Good performance | Manual testing | ⏳ |
```

**Right**:
```markdown
| F1 | Spawn 20 agents | <2s total time | `npm run benchmark:spawn` | ⏳ |
```

### 2. Missing Acceptance Tests
Every deliverable must have executable acceptance tests:
```bash
npm run test:deliverable1:unit
npm run test:deliverable1:integration
npm run validate:deliverable1
```

### 3. Undefined Dependencies
Always document:
- What must be complete before starting
- What must be complete before finishing
- Developer-to-developer dependencies

### 4. No Risk Mitigation
Don't just list risks - include:
- Early warning indicators
- Proactive mitigation strategies
- Contingency plans if risk occurs

### 5. Incomplete Checklist
Phase completion checklist must cover:
- Functional completion
- Quality assurance
- Documentation
- Consensus validation
- Deployment readiness
- Handoff preparation

---

## Integration with Development Workflow

### During Planning
1. Create phase document from template
2. Conduct architecture review
3. Assign developers
4. Identify risks and dependencies
5. Get consensus approval (≥90%)

### During Execution
1. Update status symbols daily
2. Run post-edit hooks after each file change
3. Track progress vs. timeline
4. Monitor risks weekly
5. Update completion checklist continuously

### During Validation
1. Execute all acceptance tests
2. Verify all success criteria met
3. Run Byzantine consensus validation
4. Get security/architect sign-off
5. Complete all checklist items

### During Handoff
1. Document known issues
2. Identify next phase dependencies
3. Conduct knowledge transfer
4. Run phase retrospective
5. Update roadmap

---

## Template Maintenance

### Version Control
- Track template changes in Git
- Document template updates in CHANGELOG
- Notify teams of breaking changes

### Feedback Loop
- Collect developer feedback after each phase
- Iterate template based on lessons learned
- Share improvements across teams

### Consistency Checks
```bash
# Validate all phase documents
for phase in docs/phases/PHASE_*.md; do
  node src/hooks/enhanced-post-edit-pipeline.js post-edit "$phase" \
    --memory-key "validation/$(basename $phase)" \
    --structured
done
```

---

## References

- **Template**: `/docs/templates/PHASE_DOCUMENT_TEMPLATE.md`
- **Example**: `/docs/phases/PHASE_0_SDK_FOUNDATION.md`
- **Implementation Plan**: `/planning/agent-coordination-v2/IMPLEMENTATION_PLAN.md`
- **Enhanced Post-Edit Hook**: `/src/hooks/enhanced-post-edit-pipeline.js`

---

## Support

**Questions?**
- Review Phase 0 example for complete reference
- Check implementation plan for roadmap context
- Run post-edit hook for validation feedback

**Issues?**
- Create GitHub issue with "phase-template" label
- Include phase number and specific section
- Provide example of unclear requirement
