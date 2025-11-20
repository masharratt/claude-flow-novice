# Documentation Navigation Guide

**Quick Reference for 15-Folder Structure**

---

## Finding Documentation by Topic

### System Architecture & Design
**Where to look:** `docs/architecture/`
- Agent models and spawning patterns
- System design decisions
- Database schema and patterns
- Feature architecture specifications
- Approval workflows and schemas

### CFN Loop & Orchestration
**Where to look:** `docs/cfn-system/`
- CFN Loop methodology
- Coordinator and orchestrator patterns
- Multi-layer coordination
- Agent lifecycle management

### Container & Deployment
**Where to look:** `docs/docker/`
- Container architecture
- CI/CD pipelines
- Build optimization (WSL2 performance)
- Docker Compose patterns
- Network configuration

### Implementation & Execution
**Where to look:** `docs/implementation/`
- Implementation patterns and best practices
- Feature delivery summaries
- Integration guides
- Execution checklists

### Development Guides & Tutorials
**Where to look:** `docs/guides/`
- Developer tutorials
- Quick reference guides
- API documentation
- Setup instructions
- Best practices

### Testing & Quality Validation
**Where to look:** `docs/testing/` and `docs/quality-assurance/`
- **testing/** - Test suites, test patterns, performance benchmarks
- **quality-assurance/** - QA strategy, coverage analysis, validation frameworks

### Code Reviews & Feedback
**Where to look:** `docs/reviews/`
- Code review guidelines
- Review feedback templates
- Consistency analysis
- Handoff protocols

### Bug Tracking & Issues
**Where to look:** `docs/bugs/`
- Bug reports and investigations
- Issue resolutions
- Hotfix documentation
- Root cause analysis

### Operational Procedures
**Where to look:** `docs/operations/`
- Deployment runbooks
- Environment setup
- Configuration management
- Infrastructure management

### Security & Compliance
**Where to look:** `docs/security/`
- Security audits
- Compliance documentation
- Threat analysis
- Vulnerability reports

### Major Migrations & Deprecations
**Where to look:** `docs/migration/`
- TypeScript migration guides
- Deprecation notices
- Version upgrade documentation
- Breaking change guides

### Reports & Analytics Output
**Where to look:** `docs/analysis-reports/`
- CFN test coverage reports
- Test result aggregations
- Implementation summaries
- Analytics dashboards

### Strategic Planning
**Where to look:** `docs/roadmap/`
- Product roadmap
- Iteration planning
- Feature prioritization
- Release scheduling

### System Analytics & Insights
**Where to look:** `docs/analytics/`
- ACE system documentation
- Organizational insights
- Performance analytics
- System metrics

---

## Folder Structure at a Glance

```
docs/
├── analytics/                 (23 files)  - System intelligence & ACE
├── analysis-reports/          (53 files)  - Reports & test output
├── architecture/              (134 files) - System design & patterns [LARGEST]
├── bugs/                      (73 files)  - Issue tracking
├── cfn-system/                (36 files)  - Orchestration & methodology
├── docker/                    (59 files)  - Containers & CI/CD
├── guides/                    (55 files)  - Tutorials & references
├── implementation/            (51 files)  - Execution patterns
├── migration/                 (53 files)  - Version upgrades
├── operations/                (58 files)  - Deployment & config
├── quality-assurance/         (28 files)  - QA oversight
├── reviews/                   (43 files)  - Code reviews & analysis
├── roadmap/                   (18 files)  - Strategic planning
├── security/                  (47 files)  - Compliance & security
└── testing/                   (33 files)  - All testing disciplines
```

---

## Common Searches by Role

### Product Manager
- **Roadmap & Planning:** `docs/roadmap/` - Feature prioritization, release scheduling
- **Analytics:** `docs/analytics/` - Performance metrics, adoption tracking
- **Architecture Decisions:** `docs/architecture/` - Design decisions affecting scope/timeline

### Developer
- **Quick Setup:** `docs/guides/` - Setup instructions, quick references
- **Code Patterns:** `docs/implementation/` - Implementation patterns, best practices
- **Architecture:** `docs/architecture/` - System design, agent models
- **Testing:** `docs/testing/` - Test patterns, frameworks
- **Troubleshooting:** `docs/bugs/` - Known issues, solutions

### DevOps/Infrastructure
- **Deployment:** `docs/operations/` - Runbooks, configuration
- **Docker:** `docs/docker/` - Container setup, CI/CD pipeline
- **Security:** `docs/security/` - Compliance, access control
- **Monitoring:** `docs/analytics/` - Metrics, dashboards

### QA/Tester
- **Test Strategy:** `docs/quality-assurance/` - QA plans, coverage targets
- **Test Patterns:** `docs/testing/` - Test frameworks, patterns
- **Test Reports:** `docs/analysis-reports/` - Coverage metrics, results
- **Bug Tracking:** `docs/bugs/` - Issue database, resolutions

### Technical Lead/Architect
- **System Design:** `docs/architecture/` - Design decisions, patterns
- **Orchestration:** `docs/cfn-system/` - CFN methodology, coordination
- **Security:** `docs/security/` - Threat analysis, compliance
- **Migration:** `docs/migration/` - Major transitions, deprecations
- **Operations:** `docs/operations/` - Operational patterns

### Reviewer/Code Quality
- **Review Guidelines:** `docs/reviews/` - Code review standards
- **Quality Metrics:** `docs/quality-assurance/` - Coverage, performance
- **Best Practices:** `docs/guides/` - Coding standards, patterns
- **Consistency:** `docs/reviews/` - Analysis reports, consistency checks

---

## Navigation Tips

### Finding Specific Documents

**Method 1: Use grep**
```bash
grep -r "search term" docs/
grep -r "feature name" docs/ --include="*.md"
```

**Method 2: Search by folder**
```bash
# List all files in a folder
ls docs/architecture/
ls docs/testing/

# Search within a folder
grep "term" docs/testing/*.md
```

**Method 3: Use folder index**
Each major folder has an INDEX.md or README.md:
```bash
cat docs/architecture/AGENT_OUTPUT_STANDARDS.md
cat docs/testing/TEST_COVERAGE_REPORT.md
```

### Folder Size Reference
- **Large (100+ files):** architecture - Extensive system docs
- **Medium (40-60 files):** bugs, docker, guides, implementation, migration, operations, analysis-reports
- **Small (20-40 files):** cfn-system, quality-assurance, reviews, security, testing
- **Compact (<25 files):** analytics, roadmap

### Cross-Folder References
Some topics span multiple folders:

| Topic | Primary | Related |
|-------|---------|---------|
| Testing | testing/ | quality-assurance/, analysis-reports/ |
| Deployment | operations/ | docker/, migration/ |
| Architecture | architecture/ | cfn-system/, docker/ |
| Bug Fixes | bugs/ | reviews/, implementation/ |
| Reports | analysis-reports/ | quality-assurance/, analytics/ |

---

## Quick Links to Key Documents

### Getting Started
- Setup: `docs/guides/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
- Architecture: `docs/architecture/AGENT_OUTPUT_STANDARDS.md`
- Testing: `docs/testing/TEST_COVERAGE_REPORT.md`

### CFN System
- Methodology: `docs/cfn-system/CFN_LOOP_ARCHITECTURE.md`
- Coordinator: `docs/cfn-system/CFN_COORDINATOR_PARAMETERS.md`
- Orchestration: `docs/cfn-system/ORCHESTRATOR_IMPLEMENTATION.md`

### Operations
- Deployment: `docs/operations/DEPLOYMENT_GUIDE.md`
- Configuration: `docs/operations/ENVIRONMENT_SETUP.md`
- Troubleshooting: `docs/operations/OPERATIONAL_RUNBOOK.md`

### Quality & Validation
- Test Coverage: `docs/analysis-reports/TEST_COVERAGE_REPORT.md`
- Quality Gates: `docs/quality-assurance/QUALITY_GATE_STRATEGY.md`
- Test Patterns: `docs/testing/TEST_DRIVEN_CFN_LOOP_GUIDE.md`

### Security
- Audit: `docs/security/SECURITY_AUDIT_*.md`
- Compliance: `docs/security/COMPLIANCE_CHECKLIST.md`
- Threat Analysis: `docs/security/THREAT_ANALYSIS.md`

### Recent Changes & Consolidation
- Consolidation Plan: `docs/CONSOLIDATION_PLAN.md`
- Consolidation Report: `docs/CONSOLIDATION_REPORT.md` (this folder structure)
- Recent Docs: `docs/CONSOLIDATION_REPORT.md`

---

## Consolidated Folders (What Moved Where)

### If You're Looking For...

**Old `docs/testing-performance/`**
→ Now in `docs/testing/` (merged)

**Old `docs/resources/`**
→ Now in `docs/guides/` (merged)

**Old `docs/analysis/` or `docs/meta/` or `docs/handoff/`**
→ Now in `docs/reviews/` (merged)

**Old `docs/fixes/`**
→ Now in `docs/bugs/` (merged)

**Old `docs/environment/` or `docs/environment-config/`**
→ Now in `docs/operations/` (merged)

**Old `docs/features/` or `docs/agent-spawner/` or `docs/database/`**
→ Now in `docs/architecture/` (merged)

**Old `docs/cfn-loop/` or `docs/reports/`**
→ Now in `docs/analysis-reports/` (new consolidated folder)

**Old `docs/ace-system/` or `docs/organization/`**
→ Now in `docs/analytics/` (new consolidated folder)

**Old `docs/iteration-reports/`**
→ Now in `docs/roadmap/` (merged)

---

## Team Communication Checklist

Before searching for documentation, remember:
- [ ] Folder structure was consolidated from 29 to 15 folders
- [ ] All files preserved (732 files, 100% intact)
- [ ] Some folders merged (testing-performance → testing, etc.)
- [ ] Two new folders created (analytics, analysis-reports)
- [ ] Navigation improved - clearer domain organization
- [ ] No breaking changes - all content searchable

---

## Feedback & Improvements

If you have trouble finding documentation:
1. Check this Navigation Guide first
2. Use `grep -r "search term"` in docs/
3. Refer to CONSOLIDATION_REPORT.md for detailed folder mapping
4. Report navigation issues to the team for ongoing improvement

**Last Updated:** November 20, 2025
**Status:** Documentation consolidation complete and verified
