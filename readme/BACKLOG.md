# Claude Flow Novice - Backlog

Last Updated: 2025-11-23

## Completed Items (Phase 1.2a - 2025-11-23)

**[COMPLETED] - Phase 1.2: Environment Variable Whitelisting**
- **Sprint**: Phase 1.2a
- **Category**: Security
- **Description**: Environment variable whitelisting to prevent container variable leakage
- **Solution Implemented**: 27-variable whitelist in docker/trigger-dev/entrypoint.sh with injection detection
- **Test Results**: 8/8 tests pass (100%)
- **Date Completed**: 2025-11-23
- **Related Files**:
  - docker/trigger-dev/entrypoint.sh (filter_environment_variables function)
  - tests/trigger-dev/test-security-hardening.sh (comprehensive tests)
  - docker/trigger-dev/SECURITY.md (documentation)

**[COMPLETED] - Phase 1.2: Docker Socket Isolation with Rootless Mode**
- **Sprint**: Phase 1.2a
- **Category**: Security
- **Description**: Docker socket isolation preventing privilege escalation
- **Solution Implemented**: socket-proxy service with restrictive policies
- **Test Results**: Socket proxy blocks privileged ops, allows spawning (2/2 tests)
- **Date Completed**: 2025-11-23
- **Related Files**:
  - docker/trigger-dev/socket-proxy/docker-compose.yml
  - tests/trigger-dev/test-security-hardening.sh

**[COMPLETED] - Phase 1.2: Docker Secrets Integration for API Keys**
- **Sprint**: Phase 1.2a
- **Category**: Security
- **Description**: Docker secrets integration for API key management
- **Solution Implemented**: Docker Compose secrets with fallback env var support
- **Test Results**: Secrets loading, environment fallback (2/2 tests)
- **Date Completed**: 2025-11-23
- **Related Files**:
  - docker/trigger-dev/docker-compose.secrets.yml
  - docker/trigger-dev/entrypoint.sh (secret loading logic)
  - tests/trigger-dev/test-security-hardening.sh

---

## Active Items

### P0 - Critical

**[P0] - Process: Implement verification requirements for claimed com...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Process: Implement verification requirements for claimed completions
- **Rationale**: CRITICAL: Developer claimed security fixes without verification, creating credibility issues and security risks
- **Proposed Solution**: Require automated testing, security scanning, and peer review for all claimed completions. Implement 'trust but verify' process.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-06

### P1 - High Priority

**[P1] - Migrate to production secrets management (Docker Secrets or ...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Migrate to production secrets management (Docker Secrets or AWS Secrets Manager)
- **Rationale**: WSL2 777 permissions acceptable for dev but critical security issue in multi-tenant cloud deployment. Container isolation requires proper secret permissions (600) to prevent cross-container access.
- **Proposed Solution**: Option 1: Docker Secrets (in-memory mount at /run/secrets/ with 600 permissions). Option 2: AWS Secrets Manager (runtime API fetch, no filesystem). Option 3: HashiCorp Vault. Required before cloud deployment.
- **Tags**: `production`, `cloud`, `secrets`, `docker`, `security`
- **Status**: Backlogged
- **Date Added**: 2025-11-23

**[P1] - Create memory Redis dashboard for real-time monitoring**
- **Sprint Backlogged**: Unknown
- **Category**: Feature
- **Description**: Create memory Redis dashboard for real-time monitoring
- **Rationale**: Need a web dashboard to monitor agent memory usage, container status, and performance metrics from Redis data in production
- **Proposed Solution**: Build a web dashboard (React/Node) that connects to Redis to display:
- Real-time memory usage per agent
- Container status (running/stopped/exited)
- Memory alerts and thresholds
- Historical performance charts
- Agent spawn/destroy events
- System resource utilization

Implementation:
1. Redis subscriber for real-time updates
2. REST API for historical data
3. React dashboard with charts
4. WebSocket for live updates
5. Docker containerization
- **Tags**: `redis`, `dashboard`, `monitoring`, `memory`, `production`
- **Status**: Backlogged
- **Date Added**: 2025-11-04

### P2 - Medium Priority

**[P2] - Phase 1.3b: Secret Population and Validation**
- **Sprint Backlogged**: Phase 1.3b
- **Category**: Security
- **Description**: Populate 10 production secrets and validate security gate (Loop 3 security-specialist work)
- **Rationale**: Phase 1.2a infrastructure complete. Phase 1.3b requires actual secret values to complete security hardening cycle.
- **Proposed Solution**:
  1. Populate docker/trigger-dev/secrets/ with 10 required secrets
  2. Update docker-compose.secrets.yml with 5 missing secret references
  3. Run validation script to confirm 100% pass rate
  4. Run pre-deployment security gate (target ≥95%)
  5. Verify Phase 1.2a regression tests remain at 100%
- **Estimated Effort**: 4-6 hours
- **Tags**: `security`, `secrets`, `production`, `phase-1-3b`
- **Status**: In Progress (infrastructure validated)
- **Date Added**: 2025-11-23
- **Related Files**:
  - docker/trigger-dev/secrets/ (10 files to populate)
  - docker/trigger-dev/docker-compose.secrets.yml (5 refs to add)
  - scripts/security/validate-secrets.sh (validation script)
  - scripts/security/pre-deployment-security-check.sh (gate)
- **Documentation**: docker/trigger-dev/PHASE_1.3b_INFRASTRUCTURE_VALIDATION.md

**[P2] - Phase 1.3c: Encrypted Credential Storage**
- **Sprint Backlogged**: Phase 1.3c
- **Category**: Security
- **Description**: Implement Age encryption for at-rest secret storage
- **Rationale**: Phase 1.3b secrets populated. Phase 1.3c adds encryption layer for sensitive data at rest.
- **Proposed Solution**:
  1. Generate Age key pair if not exists
  2. Implement encrypted secret storage in docker/trigger-dev/secrets/
  3. Update validation script to test decryption
  4. Document key rotation procedures
- **Estimated Effort**: 3-4 hours
- **Tags**: `security`, `encryption`, `age`, `phase-1-3c`
- **Status**: Backlogged
- **Date Added**: 2025-11-23

**[P2] - Phase 1.3d: Git History Secret Remediation**
- **Sprint Backlogged**: Phase 1.3d
- **Category**: Security
- **Description**: Remediate secrets found in git history
- **Rationale**: Pre-deployment security gate detected potential secrets in git history. Need remediation before production deployment.
- **Proposed Solution**:
  1. Review and audit git history for actual secrets
  2. Rotate any exposed credentials
  3. Use git-filter-repo or BFG Repo-Cleaner to remove secrets
  4. Document remediation and coordinate with team
- **Estimated Effort**: 2-3 hours
- **Tags**: `security`, `git`, `secrets`, `remediation`, `phase-1-3d`
- **Status**: Backlogged
- **Date Added**: 2025-11-23

**[P2] - Sync agent-use-case-registry with dynamic agent discovery sy...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Sync agent-use-case-registry with dynamic agent discovery system
- **Rationale**: Currently agent-use-case-registry.cjs is manually maintained and can drift out of sync with actual agents in .claude/agents/, causing confusion when deprecated agents appear in selection but don't exist. This creates maintenance overhead and potential runtime errors.
- **Proposed Solution**: Move agent-use-case-registry to database-backed system (similar to skills migration). Auto-populate keywords/domains from agent YAML frontmatter + allow manual overrides. Benefits: (1) Single source of truth (.claude/agents/ files), (2) Auto-sync on agent creation/deletion, (3) Keyword enrichment via DB, (4) Eliminates manual registry maintenance, (5) Prevents stale agent references. Implementation: Create SQLite table with agent_name, keywords[], domains[], priority, auto_discovered (bool), last_synced timestamp. Add sync script that scans .claude/agents/ and updates DB. Migrate existing registry entries with manual_override flag.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-17

**[P2] - ✅ TECH-DEBT-001: Standardize coordination-utils.sh import paths [COMPLETE]**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: TECH-DEBT-001: Standardize coordination-utils.sh import paths across CFN skills
- **Rationale**: System-architect identified inconsistent import patterns for coordination-utils.sh during SEC-003 validation. Three different patterns used across scripts.
- **Proposed Solution**: Audit all skills using coordination-utils.sh, establish canonical import pattern (SCRIPT_DIR relative), update all references. Estimated effort: 30 minutes.
- **Tags**:
- **Status**: ✅ Complete (commit: 04860889b)
- **Date Added**: 2025-11-17
- **Date Completed**: 2025-11-17
- **Resolution**: Standardized all 10 scripts to canonical Pattern 1 (${SCRIPT_DIR}/../bootstrap/sqlite-params.sh). 100% consistency achieved, zero breaking changes.

**[P2] - SEC-003: Complete SQL injection migration (8 remaining scrip...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: SEC-003: Complete SQL injection migration (8 remaining scripts)
- **Rationale**: Framework operational and prevents new vulnerabilities. Remaining migrations ensure legacy script safety.
- **Proposed Solution**: Migrate 8 scripts using parameterized queries pattern from sqlite-params.sh library. Priority: track-cost-savings.sh (14+ patterns), then 7 additional scripts. Estimated 15-20 hours. Target: 2 weeks.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-17

**[P2] - Fix SQL injection test suite execution hang**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Fix SQL injection test suite execution hang
- **Rationale**: Test suite (test-sql-injection-final-validation.sh) hangs during execution preventing automated OWASP test coverage verification. Manual code review confirms all 13 scripts are secure, but automated gate compliance (≥0.95 pass rate) cannot be verified.
- **Proposed Solution**: Debug test suite execution: (1) Identify why test hangs on first OWASP vector, (2) Fix sqlite_select() function usage in test context, (3) Run full 28-vector suite to completion, (4) Verify ≥95% pass rate. Estimated 2-4 hours.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-17

**[P2] - Fix SQL injection test suite execution infrastructure**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Fix SQL injection test suite execution infrastructure
- **Rationale**: Test suite hangs during OWASP vector execution. Manual validation confirms security fixes are correct, but automated test verification incomplete.
- **Proposed Solution**: Debug sqlite_select() test execution, resolve test suite hang, validate 28 OWASP attack vectors complete successfully. Estimated effort: 2-4 hours.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-17

**[P2] - Quote all 21 variables in docker/coordinator-entrypoint.sh**
- **Sprint Backlogged**: Phase 4
- **Category**: Technical-Debt
- **Description**: Quote all 21 unquoted variable expansions to prevent word splitting and globbing
- **Rationale**: Phase 4 security audit (M-1 MEDIUM) - unquoted variables can cause unexpected behavior with spaces/wildcards
- **Proposed Solution**: Quote all variable expansions except in [[ ]] conditionals (e.g., echo "$VAR" instead of echo $VAR)
- **Tags**: `security`, `docker`, `shell-scripting`, `phase4`
- **Status**: Backlogged
- **Date Added**: 2025-11-16

**[P2] - Add strict mode to orchestrate.sh**
- **Sprint Backlogged**: Phase 4
- **Category**: Technical-Debt
- **Description**: Add set -euo pipefail to .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh
- **Rationale**: Phase 4 security audit (M-2 MEDIUM) - missing strict mode allows errors to be silently ignored, unset variables not caught
- **Proposed Solution**: Add "set -euo pipefail" in first 5 lines after shebang for exit on error, unset variable detection, pipeline error catching
- **Tags**: `security`, `docker`, `shell-scripting`, `phase4`
- **Status**: Backlogged
- **Date Added**: 2025-11-16

**[P2] - Use mktemp for secure temp file creation**
- **Sprint Backlogged**: Phase 4
- **Category**: Technical-Debt
- **Description**: Replace hardcoded /tmp paths with mktemp in docker/coordinator-entrypoint.sh
- **Rationale**: Phase 4 security audit (M-3 MEDIUM) - predictable filenames create race condition and temp file hijacking risks
- **Proposed Solution**: Use mktemp for unpredictable filenames with trap for cleanup (e.g., CONTEXT_FILE=$(mktemp /tmp/task-context.XXXXXX.json))
- **Tags**: `security`, `docker`, `temp-files`, `phase4`
- **Status**: Backlogged
- **Date Added**: 2025-11-16

### P3 - Low Priority / Nice-to-Have

**[P3] - Fix test suite hardcoded paths causing 94% test failure rate**
- **Sprint Backlogged**: Phase 4
- **Category**: Technical-Debt
- **Description**: Fix test suite hardcoded paths causing 94% test failure rate
- **Rationale**: test-gate-check-security.sh uses hardcoded /home/user/ paths causing tests to fail despite production-ready code. Distinct from shell security implementation which is verified complete.
- **Proposed Solution**: Replace hardcoded /home/user/claude-flow-novice/ paths with PROJECT_ROOT pattern: PROJECT_ROOT=$(git rev-parse --show-toplevel). Apply to tests/cfn-v3/helpers/test-gate-check-security.sh and related test files.
- **Tags**: `test-infrastructure`, `technical-debt`, `shell-security`, `testing`
- **Status**: Backlogged
- **Date Added**: 2025-11-17

**[P3] - Security hardening for code quality fixes (ReDoS, query dete...**
- **Sprint Backlogged**: Phase 4
- **Category**: Optimization
- **Description**: Security hardening for code quality fixes (ReDoS, query detection, UUID collision detection)
- **Rationale**: Deferred from Code Quality CFN Loop Iteration 2 - security specialist identified optimization opportunities (consensus 0.78) but no production blockers. Issues #12/#14/#15 are functionally complete with 57/57 tests passing.
- **Proposed Solution**: 1. Update ANSI regex from /[[0-9;]*m/g to /[[0-9;]{0,5}m/g (bounded quantifier), 2. Add comprehensive query detection tests for edge cases (nested comments, string literals), 3. Implement UUID collision detection with explicit while-loop check
- **Tags**: `security`, `optimization`, `code-quality`, `redos`, `query-detection`, `uuid`
- **Status**: Backlogged
- **Date Added**: 2025-11-17

**[P3] - Verify coordinator memory limit in docker-compose.yml**
- **Sprint Backlogged**: Phase 4
- **Category**: Optimization
- **Description**: Ensure cfn-coordinator service has mem_limit: 2g in docker/docker-compose.yml
- **Rationale**: Phase 4 security audit (L-1 LOW) - missing or incorrect memory limit can cause host memory exhaustion
- **Proposed Solution**: Add or verify mem_limit: 2g in cfn-coordinator service configuration
- **Tags**: `docker`, `resource-limits`, `phase4`
- **Status**: Backlogged
- **Date Added**: 2025-11-16

**[P3] - Ensure agent containers have AutoRemove: true**
- **Sprint Backlogged**: Phase 4
- **Category**: Optimization
- **Description**: Verify all agent spawning code sets AutoRemove: true in HostConfig
- **Rationale**: Phase 4 security audit (L-2 LOW) - missing auto-remove causes disk space exhaustion from orphaned containers
- **Proposed Solution**: Review .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh agent spawning and ensure HostConfig.AutoRemove is set
- **Tags**: `docker`, `resource-cleanup`, `phase4`
- **Status**: Backlogged
- **Date Added**: 2025-11-16

## Completed Items

---

## Item Template

**[PRIORITY] - [Item Title]**
- **Sprint Backlogged**: Sprint X
- **Category**: Feature/Bug/Technical-Debt/Optimization
- **Description**: What needs to be done
- **Rationale**: Why it was deferred
- **Proposed Solution**: How to implement
- **Tags**: `tag1`, `tag2`, `tag3`
- **Status**: Backlogged
- **Date Added**: YYYY-MM-DD
