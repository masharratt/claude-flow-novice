# Documentation Structure - Quick Start

**Last Updated:** November 20, 2025
**Structure:** 15 folders, 732 files

---

## Finding What You Need

### By Topic

**Architecture & System Design**
→ `docs/architecture/` - System patterns, agent models, database design

**Orchestration & CFN Loop**
→ `docs/cfn-system/` - Methodology, coordinator/orchestrator patterns

**Deployment & Operations**
→ `docs/operations/` - Runbooks, environment setup, configuration

**Testing & Quality**
→ `docs/testing/` - Test patterns, frameworks, performance benchmarks
→ `docs/quality-assurance/` - QA strategy, coverage targets

**Code & Implementation**
→ `docs/implementation/` - Execution patterns, delivery guides
→ `docs/guides/` - Developer tutorials, quick references

**Bug Tracking & Issues**
→ `docs/bugs/` - Issue database, fixes, investigations

**Security & Compliance**
→ `docs/security/` - Audits, compliance, threat analysis

**Reports & Analytics**
→ `docs/analysis-reports/` - Test coverage, metrics, dashboards
→ `docs/analytics/` - System intelligence, organizational insights

**Code Reviews & Feedback**
→ `docs/reviews/` - Review guidelines, consistency analysis

**Strategic Planning**
→ `docs/roadmap/` - Product roadmap, iteration planning

**Major Migrations**
→ `docs/migration/` - Version upgrades, deprecation notices

---

## By Role

### Product Manager
- **Roadmap:** `docs/roadmap/`
- **Analytics:** `docs/analytics/`
- **Architecture:** `docs/architecture/`

### Developer
- **Setup:** `docs/guides/`
- **Code Patterns:** `docs/implementation/`
- **Testing:** `docs/testing/`
- **Architecture:** `docs/architecture/`

### DevOps
- **Deployment:** `docs/operations/`
- **Docker:** `docs/docker/`
- **Security:** `docs/security/`

### QA/Tester
- **Test Strategy:** `docs/quality-assurance/`
- **Test Patterns:** `docs/testing/`
- **Test Reports:** `docs/analysis-reports/`
- **Issues:** `docs/bugs/`

### Technical Lead
- **System Design:** `docs/architecture/`
- **Orchestration:** `docs/cfn-system/`
- **Security:** `docs/security/`
- **Operations:** `docs/operations/`

---

## Folder Structure (15 folders)

```
docs/
├── analytics/                 (23 files)  System analytics & intelligence
├── analysis-reports/          (53 files)  Reports & metrics
├── architecture/              (134 files) System design & patterns
├── bugs/                      (73 files)  Issue tracking & fixes
├── cfn-system/                (36 files)  Orchestration methodology
├── docker/                    (59 files)  Containers & CI/CD
├── guides/                    (55 files)  Developer guides & tutorials
├── implementation/            (51 files)  Execution patterns
├── migration/                 (53 files)  Version upgrades
├── operations/                (58 files)  Deployment & operations
├── quality-assurance/         (28 files)  QA strategy & validation
├── reviews/                   (43 files)  Code reviews & feedback
├── roadmap/                   (18 files)  Strategic planning
├── security/                  (47 files)  Compliance & security
└── testing/                   (33 files)  All testing disciplines
```

---

## Consolidated from (Old Folders)

If you're looking for content that was previously in:

- **testing-performance/** → Now in `docs/testing/`
- **resources/** → Now in `docs/guides/`
- **analysis/, meta/, handoff/** → Now in `docs/reviews/`
- **fixes/** → Now in `docs/bugs/`
- **environment, environment-config/** → Now in `docs/operations/`
- **features, agent-spawner, database/** → Now in `docs/architecture/`
- **cfn-loop, reports/** → Now in `docs/analysis-reports/`
- **ace-system, organization/** → Now in `docs/analytics/`
- **iteration-reports/** → Now in `docs/roadmap/`

---

## Quick Search

```bash
# Find documentation by keyword
grep -r "search term" docs/

# Find in specific folder
grep -r "term" docs/testing/

# Find markdown files only
grep -r "term" docs/ --include="*.md"
```

---

## Key Documents

### Getting Started
- `docs/guides/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
- `docs/architecture/AGENT_OUTPUT_STANDARDS.md`
- `docs/NAVIGATION_GUIDE.md` (detailed navigation reference)

### Architecture
- `docs/architecture/` - Browse architecture decisions
- `docs/cfn-system/CFN_LOOP_ARCHITECTURE.md`
- `docs/docker/` - Container patterns

### Operations
- `docs/operations/` - Deployment procedures
- `docs/security/` - Security policies
- `docs/bugs/` - Issue tracking

### Quality
- `docs/testing/` - Test frameworks
- `docs/quality-assurance/` - QA strategy
- `docs/analysis-reports/` - Test coverage

---

## Recent Changes

**Consolidation Completed:** November 20, 2025

The documentation structure was consolidated from 29 folders to 15 folders:
- **48% folder reduction** while maintaining all 732 files
- **Improved navigation** with domain-based organization
- **Zero data loss** - all content preserved

See `CONSOLIDATION_REPORT.md` for details.

---

## Documentation Files

For detailed navigation and information:

- **NAVIGATION_GUIDE.md** - How to find documentation
- **CONSOLIDATION_PLAN.md** - Original consolidation strategy
- **CONSOLIDATION_REPORT.md** - Complete execution report
- **CONSOLIDATION_COMMANDS.md** - Technical reference
- **CONSOLIDATION_STATUS.md** - Final status (in root directory)
- **CONSOLIDATION_EXECUTION_SUMMARY.md** - Executive summary (in root directory)

---

## Folder Responsibilities

### Kept Intact (7 folders)
- architecture - System design & patterns
- cfn-system - Orchestration methodology
- docker - Container infrastructure
- implementation - Execution patterns
- migration - Version upgrades
- quality-assurance - QA strategy
- security - Compliance & security

### Expanded (6 folders)
- testing - All testing disciplines (added performance)
- guides - Developer guides (added resources)
- operations - Operations management (added environment)
- bugs - Issue tracking (added fixes)
- reviews - Code reviews (added analysis, meta)
- roadmap - Strategic planning (added iterations)

### New (2 folders)
- analytics - System intelligence & insights
- analysis-reports - Reports & metrics

---

## Next Steps

1. **Bookmark this README** for quick reference
2. **Read NAVIGATION_GUIDE.md** for detailed navigation
3. **Explore folders** for your area of interest
4. **Use grep** to search for specific topics
5. **Report issues** if you find broken links

---

## Support

**Questions?** Check:
- NAVIGATION_GUIDE.md - Detailed folder descriptions
- CONSOLIDATION_PLAN.md - Why folders were consolidated
- CONSOLIDATION_REPORT.md - What changed and how

**Can't find something?**
```bash
grep -r "your search term" docs/
```

---

**Status:** Complete
**Files Preserved:** 732 (100%)
**Data Loss:** 0
**Ready for Use:** Yes

For more details, see CONSOLIDATION_STATUS.md in the root directory.
