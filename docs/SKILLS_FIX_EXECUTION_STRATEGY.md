# Skills Audit Fix - Execution Strategy

## Overview
This document outlines the execution strategy for fixing all 38 CFN skills based on the comprehensive audit. The epic is structured into 5 phases with careful consideration of dependencies and parallelization opportunities.

## Parallel Execution Summary

### Phase 1: Critical Infrastructure (LOW Parallelism - 7 days)
**Must run sequentially** - This phase fixes foundational issues that block other work.

```
Day 1-2: Sprint 1.1 - Common Infrastructure
├── TASK_BOOTSTRAP_UTILITIES (4h)
├── TASK_PATH_STANDARDIZATION (6h)
└── TASK_ENTRY_POINT_TEMPLATE (3h, depends on path standardization)

Day 3-5: Sprint 1.2 - Dependency Resolution
├── TASK_TYPESCRIPT_SETUP (1 day)
└── TASK_NODE_DEPS (4h)

Day 6-7: Sprint 1.3 - Documentation Baseline
└── TASK_DOC_AUDIT (2 days, parallel within)
```

**Critical Path Dependencies:**
- Bootstrap utilities needed by 10+ skills
- Path standardization needed by 15+ skills
- TypeScript config needed by all TS skills

### Phase 2: Fix Working Skills (HIGH Parallelism - 3 days)
Can execute in parallel since skills have independent issues.

```
5 teams working simultaneously:
Team A: cfn-utilities (1h)
Team B: cfn-conversation-sync (2h)
Team C: cfn-node-heap-sizer (2h)
Team D: cfn-error-management (2h)
Team E: cfn-test-framework (4h)
```

### Phase 3: Non-Implemented Skills (MEDIUM Parallelism - 1.5 weeks)

```
Day 1: Sprint 3.1 - Decision Point (SEQUENTIAL)
└── TASK_DECIDE_DOC_ONLY (1 day)

Day 2: Sprint 3.2 - Removal (PARALLEL)
└── TASK_REMOVE_SKILLS (4h, can split among team)

Day 3-7: Sprint 3.3 - Implementation (MOSTLY SEQUENTIAL)
├── TASK_IMPLEMENT_EPIC_PARSER (2 days)
└── TASK_IMPLEMENT_SESSION_HANDOFF (3 days)
```

### Phase 4: Complex Skills (HIGH Parallelism - 1 week)
Can be split by category:

```
Security Team:
├── cfn-parameterized-queries (2 days)
└── cfn-transparency-middleware (1 day)

Mega-Skills Team:
├── cfn-validation-framework (1 day)
├── cfn-docker-runtime (1 day)
└── cfn-agent-lifecycle (1 day)

Other Skills (Individual):
├── cfn-routing-config (1 day)
├── cfn-vision-analysis (1 day)
└── equation-solver (1 day)
```

### Phase 5: Testing (MEDIUM Parallelism - 3 days)

```
Day 1-2: Individual Tests (PARALLEL)
└── Test each skill independently

Day 3: Integration Tests (SEQUENTIAL)
└── CFN Loop integration testing
```

## Skill-Specific Execution Plan

### Skills That MUST Be Fixed Individually (No Parallelism):

1. **cfn-parameterized-queries**
   - Critical security vulnerabilities
   - SQL injection risks
   - MUST be fixed before any use

2. **cfn-transparency-middleware**
   - Missing main entry point
   - Documentation mismatch
   - Core CFN component

3. **cfn-docker-runtime**
   - Docker ecosystem integration
   - Complex orchestration
   - Platform-specific issues

4. **cfn-validation-framework**
   - Used by other skills
   - Syntax errors block compilation
   - Foundation component

### Skills That CAN Be Fixed in Parallel:

#### Group A: Independent Shell Scripts (5 teams)
```
Team 1: cfn-utilities
Team 2: cfn-conversation-sync
Team 3: cfn-node-heap-sizer
Team 4: cfn-error-management
Team 5: cfn-test-framework
```

#### Group B: TypeScript Compilation (3 teams)
```
Team 1: cfn-compilation-error-fixer
Team 2: cfn-skill-management
Team 3: cfn-dependency-management
```

#### Group C: Documentation-Only Skills (2 teams)
```
Team 1: Decision and planning for all 5 doc-only skills
Team 2: Implement decided skills
```

#### Group D: Path-Related Fixes (3 teams)
```
Team 1: cfn-config
Team 2: cfn-mdap-context-injection
Team 3: cfn-project-management
```

#### Group E: Mega-Skills (4 teams)
```
Team 1: cfn-validation-framework
Team 2: cfn-docker-runtime
Team 3: cfn-agent-lifecycle
Team 4: cfn-operations/process-management
```

## Resource Requirements

### Optimal Team Structure:
- **Phase 1**: 2-3 developers (sequential work)
- **Phase 2**: 3-5 developers (parallel fixes)
- **Phase 3**: 2-3 developers (decision + implementation)
- **Phase 4**: 4-6 developers (max parallelization)
- **Phase 5**: 3-4 developers (testing)

### Specialized Skills Needed:
1. **Security Expert** - For SQL injection and vulnerability fixes
2. **TypeScript Specialist** - For compilation issues
3. **Shell Script Expert** - For bash script fixes
4. **Docker Expert** - For container-related skills
5. **Documentation Specialist** - For audit and updates

## Critical Path

The critical path through the epic is:
```
PHASE_1 → PHASE_3_DECISION → SELECTED_IMPLEMENTATIONS → PHASE_4 → PHASE_5
```

Estimated critical path duration: **19-22 days**

## Risk Mitigation

### Parallel Execution Risks:
1. **Shared File Conflicts**
   - Mitigation: Use feature branches per skill
   - Git workflow clearly defined

2. **Dependency Races**
   - Mitigation: Clear dependency graph in epic JSON
   - Phase gates prevent premature parallel work

3. **Resource Contention**
   - Mitigation: Stagger skill assignments
   - Avoid multiple skills touching same files

4. **Integration Issues**
   - Mitigation: Comprehensive integration testing in Phase 5
   - Daily sync meetings to identify conflicts

## Success Metrics Per Phase

### Phase 1 Success:
- [ ] All bootstrap utilities created
- [ ] Path standardization works for all platforms
- [ ] TypeScript compiles without errors
- [ ] Node dependencies installed successfully

### Phase 2 Success:
- [ ] All working skills pass tests
- [ ] Minor bugs resolved
- [ ] Documentation updated

### Phase 3 Success:
- [ ] Decision made on all doc-only skills
- [ ] Unnecessary skills removed
- [ ] Critical skills implemented

### Phase 4 Success:
- [ ] All complex skills functional
- [ ] Mega-skills have proper entry points
- [ ] Security issues resolved

### Phase 5 Success:
- [ ] 100% skills pass individual tests
- [ ] 95% pass integration tests
- [ ] Documentation matches implementation

## Rollback Strategy

Each skill fix is an independent commit:
```bash
# Rollback specific skill
git revert <commit_hash_for_skill>

# Rollback entire phase
git revert PHASE_X_START..PHASE_X_END

# Full rollback
git revert EPIC_START..EPIC_END
```

Backups created at:
- `.backups/skills_audit_fix_epic/pre_phase_<N>`
- Individual skill backups in `.backups/skills/<skill_name>/`

## Communication Plan

### Daily Standups:
- Phase 1: All-hands (dependency tracking)
- Phase 2-4: Team-based (parallel progress)
- Phase 5: All-hands (integration issues)

### Milestone Reviews:
- End of each phase
- Go/No-go decisions for next phase
- Risk assessment updates