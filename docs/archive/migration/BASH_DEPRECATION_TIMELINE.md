# Bash Script Deprecation Timeline

**Start Date:** 2025-11-20
**End Date:** 2026-02-20
**Duration:** 13 weeks (91 days)
**Status:** Week 1 - Soft Launch

## Timeline Overview

| Week | Date Range | Phase | Activity | Status |
|------|------------|-------|----------|--------|
| 1-2 | Nov 20 - Dec 3 | Soft Launch | TypeScript default, bash fallback | In Progress |
| 3-4 | Dec 4 - Dec 17 | Validation | Monitoring, testing, feedback | Planned |
| 5-6 | Dec 18 - Dec 31 | Hard Cutover Prep | Remove USE_TYPESCRIPT flag | Planned |
| 7-8 | Jan 1 - Jan 14 | Remove Fallback | Delete bash wrappers | Planned |
| 9-10 | Jan 15 - Jan 28 | Archive | Move bash to .archive/ | Planned |
| 11-12 | Jan 29 - Feb 11 | Final Cleanup | Remove archives, update docs | Planned |
| 13 | Feb 12 - Feb 20 | Completion | Delete bash scripts | Planned |

---

## Detailed Activities

### Week 1-2: Soft Launch (Nov 20 - Dec 3, 2025)

**Objective:** Enable TypeScript by default while maintaining bash fallback for safety.

#### Activities
- ✅ **Deploy TypeScript implementations**
  - Agent spawning: `src/agent-spawner/`
  - Coordination: `src/coordination/`
  - Validation: `src/validation/`
  - File hooks: `src/hooks/`
  - Agent selection: `src/agents/`

- ✅ **Set USE_TYPESCRIPT=true as default**
  - Environment: `.env.example`
  - Docker: `docker-compose.yml`
  - Coordinators: All CFN v3 profiles
  - Documentation: Updated guides

- ✅ **Add deprecation warnings to bash scripts**
  ```bash
  echo "⚠️  WARNING: Bash scripts deprecated. Use TypeScript (USE_TYPESCRIPT=true)" >&2
  echo "⚠️  Bash support ends: 2026-01-14" >&2
  ```

- ⏳ **Monitor error rates**
  - Real-time monitoring dashboard
  - Error logging: `.artifacts/logs/typescript-errors.log`
  - Alerting: Critical errors page on-call
  - Target: < 2% error rate

- ⏳ **Collect performance metrics**
  - Spawn time comparison
  - Memory usage tracking
  - CPU utilization
  - Target: Within 10% of bash

- ⏳ **Gather team feedback**
  - Daily standup discussions
  - Slack channel: #typescript-migration
  - Weekly survey (5 questions)
  - Target: ≥4/5 satisfaction score

#### Success Criteria
- [ ] TypeScript executing by default
- [ ] Error rate < 2%
- [ ] Performance within 10% of bash
- [ ] No critical issues reported
- [ ] Team can debug TypeScript code
- [ ] Rollback plan tested and ready

#### Files Modified
```
.env.example
docker-compose.yml
.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md
docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md
```

---

### Week 3-4: Validation (Dec 4 - Dec 17, 2025)

**Objective:** Validate TypeScript stability and performance before hard cutover.

#### Activities
- **Performance comparison report**
  - Spawn time: TypeScript vs bash
  - Memory usage: TypeScript vs bash
  - CPU utilization: TypeScript vs bash
  - Generate graphs and tables
  - Document findings in `docs/TYPESCRIPT_PERFORMANCE_REPORT.md`

- **Error rate analysis**
  - Total errors: TypeScript vs bash
  - Error categories (spawn, coordination, validation)
  - Root cause analysis
  - Bug fixes deployed
  - Target: < 1% error rate

- **Team survey results**
  - Satisfaction score (1-5 scale)
  - Pain points identified
  - Feature requests
  - Training needs
  - Document in `docs/TYPESCRIPT_TEAM_FEEDBACK.md`

- **Documentation updates**
  - Fix any inaccuracies
  - Add troubleshooting tips
  - Update examples
  - Review FAQ

- **Bug fixes (if any)**
  - Address critical issues
  - Patch non-critical issues
  - Regression testing
  - Update CHANGELOG

- **Integration testing**
  - Full CFN Loop end-to-end tests
  - Docker mode validation
  - CLI mode validation
  - Performance benchmarks

#### Success Criteria
- [ ] Performance equal or better than bash
- [ ] Error rate < 1%
- [ ] Team satisfaction score ≥ 4/5
- [ ] All tests passing (100%)
- [ ] Documentation complete and accurate

#### Deliverables
- `docs/TYPESCRIPT_PERFORMANCE_REPORT.md`
- `docs/TYPESCRIPT_TEAM_FEEDBACK.md`
- Bug fix list (GitHub Issues)
- Updated documentation

---

### Week 5-6: Hard Cutover Preparation (Dec 18 - Dec 31, 2025)

**Objective:** Prepare for TypeScript-only execution (remove fallback option).

#### Activities
- **Remove USE_TYPESCRIPT flag**
  - Delete environment variable checks
  - Remove conditional logic from spawners
  - Update all wrapper scripts
  - Update documentation

- **Update coordinator profiles**
  - Remove USE_TYPESCRIPT references
  - Update skill references (bash → TypeScript)
  - Test coordinator spawning
  - Validate coordination flows

- **Update orchestrator scripts**
  - Remove bash fallback paths
  - Hardcode TypeScript execution
  - Update error messages
  - Test orchestration flows

- **Integration testing**
  - Full system end-to-end tests
  - Docker mode (45 tests)
  - CLI mode (8 test suites)
  - Performance benchmarks

- **Rollback plan finalization**
  - Test rollback procedure
  - Document rollback steps
  - Identify rollback triggers
  - Assign rollback decision-makers

- **Documentation updates**
  - Remove USE_TYPESCRIPT mentions
  - Update examples (TypeScript only)
  - Update troubleshooting guides
  - Update FAQ

#### Success Criteria
- [ ] TypeScript-only execution stable
- [ ] All coordinators updated
- [ ] All orchestrators updated
- [ ] Rollback plan tested
- [ ] Documentation complete
- [ ] No USE_TYPESCRIPT references remain

#### Breaking Changes
- **USE_TYPESCRIPT environment variable removed**
  - Impact: Bash fallback no longer available
  - Workaround: Manually execute bash scripts (not supported)
  - Rollback: Revert to v2.15.x

- **Bash wrapper scripts deprecated**
  - Impact: Direct bash script execution no longer supported
  - Workaround: Use TypeScript CLI commands
  - Migration: Update all automation scripts

#### Files Modified
```
src/agent-spawner/agent-spawner.ts
src/coordination/*.ts
.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md
.claude/skills/cfn-loop-orchestration/orchestrate.sh
docs/*.md
```

---

### Week 7-8: Remove Bash Fallback (Jan 1 - Jan 14, 2026)

**Objective:** Remove all bash wrapper scripts and fallback logic.

#### Activities
- **Delete bash wrapper scripts**
  - `.claude/skills/cfn-agent-spawning/spawn-agent.sh`
  - `.claude/skills/cfn-agent-selection/select-agent.sh`
  - `.claude/hooks/cfn-invoke-pre-edit.sh`
  - `.claude/hooks/cfn-invoke-post-edit.sh`
  - All coordination bash scripts
  - All validation bash scripts

- **Remove fallback logic from TypeScript**
  - Delete USE_TYPESCRIPT conditionals
  - Remove bash execution paths
  - Simplify error handling
  - Clean up code structure

- **Update skill documentation**
  - Remove bash examples
  - Update SKILL.md files
  - Update README files
  - Update inline comments

- **Archive original bash scripts**
  - Create `.archive/bash-originals/`
  - Copy bash scripts with metadata
  - Add README explaining archive
  - Commit archive to git

- **Final integration testing**
  - Full system end-to-end tests
  - Docker mode validation
  - CLI mode validation
  - Performance benchmarks
  - Regression testing

#### Success Criteria
- [ ] TypeScript-only codebase
- [ ] All tests passing
- [ ] No bash dependencies
- [ ] Documentation updated
- [ ] Archive created and committed

#### Files to Delete
```bash
# Agent spawning
.claude/skills/cfn-agent-spawning/spawn-agent.sh

# Agent selection
.claude/skills/cfn-agent-selection/select-agent.sh

# File hooks
.claude/hooks/cfn-invoke-pre-edit.sh
.claude/hooks/cfn-invoke-post-edit.sh

# Coordination (20+ scripts)
.claude/skills/cfn-coordination/coordination-signal.sh
.claude/skills/cfn-coordination/coordination-wait.sh
.claude/skills/cfn-coordination/coordination-collect.sh
# ... (all coordination bash scripts)

# Validation (10+ scripts)
.claude/skills/cfn-loop-validation/validate-gate.sh
.claude/skills/cfn-loop-validation/validate-consensus.sh
# ... (all validation bash scripts)

# Utilities
.claude/skills/cfn-coordination/invoke-waiting-mode.sh
.claude/skills/cfn-coordination/helpers/*.sh
```

#### Archive Structure
```
.archive/bash-originals/
├── README.md                    # Why archived, deprecation date
├── agent-spawning/
│   ├── spawn-agent.sh          # Original bash script
│   ├── DEPRECATION.md          # Deprecation notice
│   └── TYPESCRIPT_EQUIVALENT.md # TypeScript replacement
├── agent-selection/
│   ├── select-agent.sh
│   ├── DEPRECATION.md
│   └── TYPESCRIPT_EQUIVALENT.md
├── coordination/
│   ├── coordination-*.sh       # All coordination scripts
│   ├── DEPRECATION.md
│   └── TYPESCRIPT_EQUIVALENT.md
├── validation/
│   ├── validate-*.sh           # All validation scripts
│   ├── DEPRECATION.md
│   └── TYPESCRIPT_EQUIVALENT.md
└── hooks/
    ├── cfn-invoke-*.sh         # All hook scripts
    ├── DEPRECATION.md
    └── TYPESCRIPT_EQUIVALENT.md
```

---

### Week 9-10: Archive (Jan 15 - Jan 28, 2026)

**Objective:** Move bash scripts to archive directory for historical reference.

#### Activities
- **Create archive structure**
  - Directory: `.archive/bash-originals/`
  - Organize by component (spawning, coordination, etc.)
  - Add README.md to each subdirectory
  - Include deprecation dates

- **Copy bash scripts to archive**
  - Preserve original file structure
  - Include all helper scripts
  - Include test scripts
  - Include documentation

- **Add metadata to archive**
  - DEPRECATION.md: Why deprecated, when
  - TYPESCRIPT_EQUIVALENT.md: Migration guide
  - VERSION_HISTORY.md: Bash version history
  - PERFORMANCE_COMPARISON.md: Bash vs TypeScript

- **Update git history documentation**
  - Document bash script locations (for git blame)
  - Add archive commit message
  - Tag archive commit: `v2.16.0-bash-archive`

- **Cleanup bash-specific dependencies**
  - Remove unused bash utilities
  - Remove bash-only test fixtures
  - Update package.json scripts
  - Update CI/CD pipelines

- **Final testing**
  - Full regression testing
  - Performance benchmarks
  - Memory profiling
  - Load testing

- **Update CHANGELOG**
  - Document bash deprecation
  - List archived scripts
  - Link to migration guide
  - Note breaking changes

#### Success Criteria
- [ ] Archive structure created
- [ ] All bash scripts archived
- [ ] Metadata complete
- [ ] Git history documented
- [ ] Dependencies cleaned up
- [ ] CHANGELOG updated
- [ ] All tests passing

#### Archive Commit Message
```
chore(deprecation): Archive bash scripts - TypeScript migration complete

ARCHIVED COMPONENTS:
- Agent spawning (spawn-agent.sh → src/agent-spawner/)
- Agent selection (select-agent.sh → src/agents/)
- Coordination (20+ scripts → src/coordination/)
- Validation (10+ scripts → src/validation/)
- File hooks (cfn-invoke-*.sh → src/hooks/)

ARCHIVE LOCATION: .archive/bash-originals/

MIGRATION GUIDE: docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md

BREAKING CHANGES:
- Bash scripts no longer supported
- USE_TYPESCRIPT flag removed
- TypeScript-only codebase

ROLLBACK: Revert to v2.15.x if needed (bash still available)

See: docs/BASH_DEPRECATION_TIMELINE.md
```

---

### Week 11-12: Final Cleanup (Jan 29 - Feb 11, 2026)

**Objective:** Remove archive directory and complete documentation updates.

#### Activities
- **Remove .archive/ directory**
  - Verify no longer needed
  - Create final backup (external storage)
  - Delete from repository
  - Update .gitignore

- **Update main README**
  - Remove bash references
  - Highlight TypeScript architecture
  - Update quick start guide
  - Update contribution guidelines

- **Update CONTRIBUTING.md**
  - TypeScript-only guidelines
  - Code style requirements
  - Testing requirements
  - Review process

- **Update CLAUDE.md**
  - Remove bash coordination protocols
  - Update TypeScript coordination examples
  - Update agent spawning examples
  - Update skill references

- **Update agent profiles**
  - Remove bash skill references
  - Add TypeScript skill references
  - Update example commands
  - Update error messages

- **Team training sessions**
  - TypeScript fundamentals
  - CFN Loop architecture
  - Debugging techniques
  - Best practices

- **Knowledge transfer documentation**
  - TypeScript module overview
  - Common patterns
  - Troubleshooting guide
  - FAQ updates

- **Celebrate migration success** 🎉
  - Team retrospective
  - Lessons learned document
  - Success metrics review
  - Team celebration

#### Success Criteria
- [ ] Archive removed
- [ ] README updated
- [ ] CONTRIBUTING.md updated
- [ ] CLAUDE.md updated
- [ ] Agent profiles updated
- [ ] Training complete
- [ ] Documentation complete
- [ ] Team celebrates success

#### Documentation Updates

**README.md:**
- Remove: Bash script examples
- Add: TypeScript module overview
- Update: Architecture diagram
- Highlight: Type safety benefits

**CONTRIBUTING.md:**
- Remove: Bash coding standards
- Add: TypeScript coding standards
- Update: Testing guidelines
- Add: Type safety requirements

**CLAUDE.md:**
- Remove: Bash coordination examples
- Add: TypeScript coordination examples
- Update: Agent spawning patterns
- Update: Skill references

**Agent Profiles:**
- Remove: `<!-- SKILLS: bash -->`
- Add: `<!-- SKILLS: typescript -->`
- Update: Example commands
- Update: Error handling

---

### Week 13: Completion (Feb 12 - Feb 20, 2026)

**Objective:** Final verification and project completion.

#### Activities
- **Final verification testing**
  - Full regression suite
  - Performance benchmarks
  - Load testing
  - Security scanning
  - Documentation review

- **Close deprecation tickets**
  - Verify all tasks complete
  - Close GitHub issues
  - Archive Slack channels
  - Update project board

- **Document lessons learned**
  - Migration challenges
  - Solutions implemented
  - Best practices discovered
  - Recommendations for future migrations

- **Begin Phase 2-4 planning**
  - Identify remaining bash scripts
  - Prioritize conversion order
  - Estimate effort
  - Create roadmap

- **Team retrospective**
  - What went well
  - What could be improved
  - Action items
  - Future recommendations

#### Success Criteria
- [ ] All tests passing (100%)
- [ ] Performance metrics meet targets
- [ ] Documentation complete
- [ ] Tickets closed
- [ ] Lessons learned documented
- [ ] Phase 2-4 roadmap created
- [ ] Team retrospective complete

#### Final Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Test Coverage | ≥90% | TBD | ⏳ |
| Error Rate | <1% | TBD | ⏳ |
| Performance | Within 10% | TBD | ⏳ |
| Team Satisfaction | ≥4/5 | TBD | ⏳ |
| Documentation | Complete | TBD | ⏳ |
| Migration Time | 13 weeks | TBD | ⏳ |

---

## Risk Management

### High Risk Items

1. **Performance Regression**
   - Risk: TypeScript slower than bash
   - Mitigation: Continuous monitoring, optimization
   - Rollback: Revert to v2.15.x

2. **Team Unfamiliarity**
   - Risk: Developers struggle with TypeScript
   - Mitigation: Training sessions, documentation
   - Rollback: Extended soft launch period

3. **Debugging Difficulty**
   - Risk: Stack traces unclear, hard to debug
   - Mitigation: Source maps, debug tools, training
   - Rollback: Bash fallback (Weeks 1-6 only)

4. **Rollback Complexity**
   - Risk: Difficult to revert if issues arise
   - Mitigation: Tested rollback plan, bash fallback
   - Rollback: Documented procedure, on-call support

### Medium Risk Items

1. **Docker Image Size**
   - Risk: Node.js increases image size
   - Mitigation: Multi-stage builds, Alpine base
   - Impact: Moderate

2. **Memory Usage**
   - Risk: Node.js uses more memory than bash
   - Mitigation: Monitor and optimize
   - Impact: Low (acceptable trade-off for type safety)

3. **Third-Party Dependencies**
   - Risk: npm packages introduce vulnerabilities
   - Mitigation: npm audit, Dependabot, regular updates
   - Impact: Low

### Low Risk Items

1. **Learning Curve**
   - Risk: Team needs time to learn TypeScript
   - Mitigation: Training, documentation, pair programming
   - Impact: Minimal

2. **Build Process**
   - Risk: TypeScript compilation adds build step
   - Mitigation: Fast builds, watch mode, CI/CD integration
   - Impact: Minimal

---

## Communication Plan

### Weekly Updates

**Every Monday:**
- Status email to team
- Progress against timeline
- Blockers and risks
- Next week's activities

**Every Wednesday:**
- Metrics dashboard review
- Performance comparison
- Error rate analysis
- Team feedback review

**Every Friday:**
- Issue triage
- Bug fix prioritization
- Rollback assessment
- Week recap

### Escalation Path

1. **Developer encounters issue**
   - Create GitHub issue with label `typescript-migration`
   - Post in #typescript-migration Slack channel
   - Notify team lead

2. **Issue reviewed within 4 hours**
   - Team lead triages
   - Assigns severity (P0, P1, P2)
   - Assigns developer

3. **Critical issues (P0) escalated to CTO immediately**
   - Assess rollback need
   - Communicate with stakeholders
   - Implement fix or rollback

4. **Rollback decision made within 8 hours**
   - CTO approval required
   - Follow documented rollback procedure
   - Post-mortem scheduled

### Slack Channels

- **#typescript-migration:** General discussion, questions
- **#typescript-alerts:** Automated error alerts
- **#typescript-metrics:** Daily metrics reports

### GitHub Labels

- `typescript-migration`: Migration-related issues
- `typescript-bug`: Bugs in TypeScript code
- `typescript-perf`: Performance issues
- `typescript-docs`: Documentation updates

---

## Success Metrics

### Week 1-2 Targets
- Error rate: < 2%
- Performance: Within 15% of bash
- Team satisfaction: ≥ 3.5/5

### Week 3-4 Targets
- Error rate: < 1%
- Performance: Within 10% of bash
- Team satisfaction: ≥ 4/5

### Week 5-13 Targets
- Error rate: < 0.5%
- Performance: Equal or better than bash
- Team satisfaction: ≥ 4.5/5
- Test coverage: ≥ 90%
- Documentation: 100% complete

---

## Next Steps (Phase 2-4)

After Phase 1 completion, convert remaining bash scripts:

### Phase 2: CLI Tooling (Est. 6 weeks)
- Agent builder scripts
- Backlog management
- Changelog management
- Epic creator

### Phase 3: Testing Infrastructure (Est. 8 weeks)
- Test runners
- Coverage reporting
- Performance benchmarking
- Load testing

### Phase 4: Deployment Scripts (Est. 4 weeks)
- Docker build helpers
- CI/CD integration
- Release automation

**Total Timeline:** Phase 1-4 = 31 weeks (~7 months)

---

## Resources

- **Rollout Overview:** `docs/TYPESCRIPT_ROLLOUT_OVERVIEW.md`
- **Developer Guide:** `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
- **Rollback Plan:** `docs/TYPESCRIPT_ROLLBACK_PLAN.md`
- **FAQ:** `docs/TYPESCRIPT_MIGRATION_FAQ.md`
- **Training:** `docs/TYPESCRIPT_TRAINING_GUIDE.md`
- **Metrics Dashboard:** `docs/TYPESCRIPT_METRICS_DASHBOARD.md`

---

**Last Updated:** 2025-11-20
**Next Review:** 2025-11-27 (End of Week 1)
**Document Owner:** CTO Agent
