# Skills Database - Implementation Documentation

## Overview

This directory contains the complete implementation plan for the **Dynamic Skills Database** system, which provides database-driven skill management with approval workflows and Phase 4 Workflow Codification integration.

---

## Key Benefits

- **40% prompt size reduction** through contextual skill loading
- **80% maintenance reduction** (1 UPDATE vs 23 file edits)
- **60-80% AI cost reduction** when combined with Phase 4 codified skills
- **Complete lifecycle automation** (generate → approve → deploy → analyze → improve)
- **Cross-team collaboration** via foundation skills sharing

---

## Document Index

### Core Planning Documents

| Document | Purpose | Status |
|----------|---------|--------|
| **COMPREHENSIVE_IMPLEMENTATION_PLAN.md** | 7-week implementation plan with approval workflow | ✅ Ready |
| **SPECIFICATION.md** | Functional and non-functional requirements | ✅ Complete |
| **ARCHITECTURE.md** | System architecture and component design | ✅ Complete |
| **IMPLEMENTATION_PLAN.md** | Original 6-week plan (pre-approval workflow) | 📋 Superseded |
| **PSEUDOCODE.md** | Implementation pseudocode | ✅ Complete |

### Integration Documentation

| Document | Purpose | Status |
|----------|---------|--------|
| **PHASE4_INTEGRATION.md** | Phase 4 Workflow Codification integration guide | ✅ Ready |
| **STANDARDIZATION_OVERLAP_ANALYSIS.md** | Overlap with standardization branch | ✅ Complete |
| **DEPLOYMENT_CHECKLIST.md** | Step-by-step deployment and validation | ✅ Ready |

---

## Quick Start

### For Developers

**Read First:**
1. COMPREHENSIVE_IMPLEMENTATION_PLAN.md - Get the full picture
2. DEPLOYMENT_CHECKLIST.md - Understand deployment steps
3. PHASE4_INTEGRATION.md - Understand Phase 4 integration

**Implementation Phases:**
- Phase 1 (Days 1-4): Foundation with approval workflow
- Phase 2 (Days 5-9): Database infrastructure
- Phase 3 (Days 10-14): Skill loader
- Phase 4 (Days 15-20): CLI tooling
- Phase 5 (Days 21-27): Integration & testing
- Phase 6 (Days 28-32): Analytics & optimization
- Phase 7 (Days 33-35): Phase 4 integration

### For Architects

**Read First:**
1. ARCHITECTURE.md - System design
2. SPECIFICATION.md - Requirements
3. STANDARDIZATION_OVERLAP_ANALYSIS.md - Coordination needs

**Key Architectural Decisions:**
- Hybrid storage (SQLite metadata + git-versioned content)
- Three-tier approval system (auto, escalate, human)
- Dual logging (SQLite + PostgreSQL for Phase 4 skills)
- Correlation keys following standardization branch

### For Project Managers

**Read First:**
1. COMPREHENSIVE_IMPLEMENTATION_PLAN.md (Timeline section)
2. STANDARDIZATION_OVERLAP_ANALYSIS.md (Coordination strategy)
3. DEPLOYMENT_CHECKLIST.md (Milestones)

**Timeline:** 7 weeks (35 business days)
**Team Size:** 5.5 FTEs (Architect, 2× Backend Dev, Integration Engineer, QA, 0.5× DevOps)
**Critical Dependencies:** Standardization Sprint 3 (Weeks 6-7)

---

## Implementation Phases

### Phase 1: Foundation with Approval (Days 1-4)
- Create bootstrap skills (5 skills)
- Design enhanced database schema with approval tables
- Define approval criteria templates (auto, escalate, human)
- Document approval workflow process

**Deliverables:**
- `.claude/skills/bootstrap/*.md` (5 files)
- `.claude/skills-database/schema-v2.sql`
- `.claude/skills-database/APPROVAL_CRITERIA.md`
- `.claude/skills-database/APPROVAL_WORKFLOW.md`

### Phase 2: Database Infrastructure (Days 5-9)
- Initialize SQLite database with approval tables
- Migrate 62 existing skills from filesystem
- Implement YAML export/import with approval metadata
- Implement approval workflow engine

**Deliverables:**
- `scripts/skills-db/init-database-v2.sh`
- `scripts/skills-db/seed-from-filesystem.sh`
- `scripts/skills-db/approve-skill.sh`
- `.claude/skills-database/skills.db` (67 skills)

### Phase 3: Skill Loader (Days 10-14)
- Implement SkillLoader class with approval awareness
- Implement skill caching (LRU, TTL)
- Implement hash validation
- Write unit tests (90% coverage)

**Deliverables:**
- `src/cli/skill-loader.ts`
- `src/cli/skill-cache.ts`
- `src/cli/approval-checker.ts`
- `tests/unit/skill-loader.test.ts`

### Phase 4: CLI Tooling with Approval (Days 15-20)
- Implement CLI command framework
- Implement core commands (list, assign, create, update)
- Implement approval commands (approve, escalate, pending)
- Implement analytics commands (effectiveness, velocity)

**Deliverables:**
- `src/cli/skill-cli.ts`
- 15+ CLI commands
- `docs/SKILLS_CLI_GUIDE.md`
- `docs/APPROVAL_WORKFLOW_GUIDE.md`

### Phase 5: Integration & Testing (Days 21-27)
- Integrate SkillLoader into agent-prompt-builder
- Add feature flag (CFN_SKILLS_DATABASE)
- Test approval workflow integration
- Validate backward compatibility
- Performance benchmarking

**Deliverables:**
- Modified `src/cli/agent-prompt-builder.ts`
- E2E tests (7 scenarios)
- Performance benchmarks
- Backward compatibility tests

### Phase 6: Analytics & Optimization (Days 28-32)
- Implement enhanced usage logging
- Create analytics dashboards (CLI)
- Optimize skill assignments
- Document best practices

**Deliverables:**
- Enhanced usage logging with approval metadata
- Analytics CLI commands (7 total)
- Optimization recommendations
- Best practices guides

### Phase 7: Phase 4 Integration (Days 33-35)
- Implement auto-deployment from Phase 4
- Implement dual logging (SQLite + PostgreSQL)
- Implement edge case feedback loop
- Test end-to-end integration

**Deliverables:**
- `deploy-approved-skill.sh`
- `skill-execution-logger.ts`
- `propagate-skill-update.sh`
- E2E Phase 4 integration tests

---

## Database Schema Overview

### Skills Table (Enhanced with Approval)
```sql
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  team TEXT,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tags TEXT,  -- JSON array
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',

  -- Approval Workflow
  approval_level TEXT NOT NULL DEFAULT 'human',
  approval_criteria TEXT,  -- JSON

  -- Phase 4 Integration
  source_pattern_id INTEGER,  -- References PostgreSQL workflow_patterns.id
  generated_by TEXT,  -- 'phase4' | 'manual' | 'imported'

  owner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Approval History Table (NEW)
```sql
CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  approval_level TEXT NOT NULL,
  approver TEXT,
  decision TEXT NOT NULL,  -- 'approved' | 'rejected' | 'escalated'
  reasoning TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
```

---

## Approval Workflow

### Three-Tier Approval System

**Auto-Approved (approval_level='auto'):**
- Simple coordination skills (≤5 commands)
- High test coverage (≥90%)
- No external API calls
- No file system modifications

**Escalated (approval_level='escalate'):**
- Infrastructure changes (Docker, Redis, PostgreSQL)
- External API calls
- Security-sensitive operations
- Cross-team dependencies

**Human-Approved (approval_level='human'):**
- Complex business logic
- High risk score (security impact)
- Low test coverage (<80%)
- New skill categories

### Approval Decision Matrix

| Criteria | Auto | Escalate | Human |
|----------|------|----------|-------|
| Commands | ≤5 | 6-15 | >15 |
| Test Coverage | ≥90% | 70-90% | <70% |
| External Calls | None | Read-only | Write |
| Security Impact | None | Low | High |
| Complexity | Low | Medium | High |

---

## Phase 4 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 4 Workflow Codification                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  Expert Review (Phase 4 CLI)   │
        └────────┬───────────────────────┘
                 │ APPROVED
                 ▼
┌────────────────────────────────────────────────────────────────┐
│ deploy-approved-skill.sh                                        │
│ • Insert into Skills DB with approval metadata                 │
│ • Auto-map to relevant agents                                  │
│ • Update Phase 4 status                                        │
└────────────────┬───────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────┐
│                    Agent Execution                              │
│ • Load skill via SkillLoader                                   │
│ • Execute skill                                                 │
│ • Dual logging (SQLite + PostgreSQL)                           │
└────────────────┬───────────────────────────────────────────────┘
                 │ IF FAILURE
                 ▼
┌────────────────────────────────────────────────────────────────┐
│ Edge Case Feedback Loop                                        │
│ • Capture failure (Phase 4)                                    │
│ • Detect recurring (≥3x)                                       │
│ • Generate update                                               │
│ • Propagate to Skills DB                                       │
└────────────────────────────────────────────────────────────────┘
```

---

## Coordination with Standardization Branch

**Critical Overlap:** 70% overlap in database integration areas

**Key Coordination Points:**
1. **Correlation Keys:** Use standardization branch definitions (task_id, agent_id, skill_id)
2. **Column Naming:** Use `source_pattern_id` (standard) instead of `phase4_pattern_id`
3. **Metadata Schema:** Use standardization JSON schema for correlation metadata
4. **Query Patterns:** Leverage standardization's 30+ cross-database query patterns
5. **Timeline:** Align Skills DB Phase 7 with Standardization Sprint 3 (Weeks 6-7)

**See:** STANDARDIZATION_OVERLAP_ANALYSIS.md for detailed coordination strategy

---

## Success Criteria

### Functional
- [ ] All 67 skills imported (62 existing + 5 bootstrap)
- [ ] Approval workflow operational (auto, escalate, human)
- [ ] Phase 4 skills auto-deploy to Skills DB
- [ ] Dual logging functional (SQLite + PostgreSQL)
- [ ] CLI commands functional (15+ commands)

### Performance
- [ ] Skill loading latency ≤15ms (average)
- [ ] Database query latency ≤3ms (P95)
- [ ] Cache hit rate ≥80%
- [ ] No regression in CFN Loop success rates

### Quality
- [ ] Unit test coverage ≥90%
- [ ] E2E tests cover critical paths (10+ scenarios)
- [ ] Documentation complete
- [ ] Zero breaking changes

### Business
- [ ] Prompt size reduced by ≥40%
- [ ] Skill update time reduced by ≥80%
- [ ] Auto-approval rate ≥60%
- [ ] Expert approval SLA ≥90% compliance

---

## Risk Management

### High Risks
- Schema divergence from standardization branch
- Approval workflow bottleneck (human reviews)
- Phase 4 integration failures

### Mitigations
- Weekly sync with standardization team
- Auto-approve criteria optimization
- Graceful degradation for Phase 4 integration
- Daily YAML snapshots for recovery

---

## Next Steps

1. **Read COMPREHENSIVE_IMPLEMENTATION_PLAN.md** for full details
2. **Review STANDARDIZATION_OVERLAP_ANALYSIS.md** for coordination
3. **Coordinate with standardization team** (weekly sync meetings)
4. **Begin Phase 1 implementation** (Foundation with approval)
5. **Set up development environment** (Node.js, SQLite, PostgreSQL)

---

**Status:** Ready for Implementation
**Timeline:** 7 weeks (35 business days)
**Team:** 5.5 FTEs
**Dependencies:** Standardization Sprint 3 (Weeks 6-7)
**Risk Level:** Medium (with active coordination)
