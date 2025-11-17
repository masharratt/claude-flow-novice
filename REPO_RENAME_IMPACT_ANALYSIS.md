# Repository Rename Impact Analysis: "claude-flow-novice"

**Analysis Date:** 2025-11-17
**Total Files Affected:** 941 files (excluding legacy/ and node_modules/)
**Total Scope:** 1,527 files with path/reference dependencies

---

## Executive Summary

Renaming the repository from "claude-flow-novice" to a different name will require updates across **941 active files** in production code, documentation, configuration, and deployment infrastructure. The "cfn" abbreviation is deeply embedded in 60+ critical infrastructure files. The "claude-flow-novice" name appears in npm package definitions, Docker image tags, GitHub workflows, CLI commands, and hundreds of documentation files.

**Estimated Migration Effort:** 80-120 developer hours
**Risk Level:** HIGH (User-facing CLI breakage, npm registry impact, Docker builds, CI/CD failures)
**Rollback Complexity:** MODERATE (git history contains hundreds of references)

---

## CRITICAL INFRASTRUCTURE (Impact: CRITICAL)

### 1. NPM Package Definition
**Impact Level:** CRITICAL - Breaks npm installation, published packages

**Files:**
- `/home/user/claude-flow-novice/package.json:2` - Name field
- `/home/user/claude-flow-novice/package-lock.json:2,8` - Lock file entries

**Content Examples:**
```json
"name": "claude-flow-novice",
"bin": {
  "claude-flow-novice": "dist/cli/index.js",
  "cfn-init": "scripts/init-project.js",
  "cfn-spawn": "dist/cli/spawn.js",
  "cfn-loop": "dist/cli/cfn-loop.js",
  "cfn-swarm": "dist/cli/cfn-swarm.js"
}
```

**Breaking Changes:**
- npm install becomes `npm install <NEW_NAME>` (requires republishing)
- All existing installations break (users must reinstall)
- Lock files contain old name references (requires rebuild)
- Existing deployments using old name will fail

**Migration Path:**
1. Change package.json name field
2. Rebuild package-lock.json: `npm install --package-lock-only`
3. Republish to npm registry
4. Create migration guide for users
5. Maintain old package as deprecated with redirect message

---

### 2. CLI Binary Commands (User-Facing)
**Impact Level:** CRITICAL - Breaks all existing user workflows

**Files:**
- `package.json` - bin field (5 commands)
- `src/cli/index.ts:6,113,122,125,128` - Help documentation
- 40+ documentation files with usage examples

**Current Commands:**
```bash
npx claude-flow-novice agent <type> [options]
npx claude-flow-novice swarm "Task Description"
npx claude-flow-novice cfn-loop ...
npx claude-flow-novice orchestrator ...
npx claude-flow-novice agent-spawn <agent-type>
```

**Locations with Command Usage:**
- `CLAUDE.md:135,462` - Main documentation (2 references)
- `Dockerfile.orchestrator:57` - Entrypoint command
- `.claude/commands/cfn-loop-cli.md:45,129,409,420,456` - Command examples (5 references)
- `docs/guides/ENABLE_CLI_SPAWNING.md` - 7 usage examples
- `docs/guides/CLI_AGENT_SPAWNING_IMPLEMENTATION.md` - 6 examples
- 50+ additional documentation files

**Breaking Changes:**
- All existing shell scripts break
- User CI/CD pipelines fail
- Container entrypoints fail
- Bash aliases stop working

---

### 3. Docker Image Tags & References
**Impact Level:** HIGH - Breaks Docker builds and deployments

**Files with Docker Image Names:**
- `Dockerfile.agent:69` - LABEL org.opencontainers.image.source
- `Dockerfile.agent-frontend:76`
- `Dockerfile.agent-backend:83`
- `Dockerfile.production:15,17,19` - Multiple LABEL fields
- `Dockerfile.minimal:14` - name="claude-flow-novice-minimal"
- `docker/docker-compose.yml` - image: claude-flow-novice:latest
- 20+ Dockerfiles with references

**Image Tags Found:**
```
claude-flow-novice:agent
claude-flow-novice:latest
claude-flow-novice-agent:latest
claude-flow-novice:mcp-playwright
claude-flow-novice:mcp-redis
claude-flow-novice-minimal
```

**Deployment Files:**
- `.github/workflows/cd.yml:90,206,208,209,245,258,319,331,332,333` - 10 references
- `docker/docker-compose.yml` - Multiple service definitions
- `deployment/` scripts (5+ files)

**Breaking Changes:**
- Existing images with old tags won't be found
- Docker registry tags need migration
- Cached images with old tags become invalid
- Kubernetes deployments fail (image pull failures)

---

### 4. GitHub Repository URLs & Actions
**Impact Level:** HIGH - Breaks CI/CD and documentation links

**Files:**
- `README.md:3,6,464,465,491,492,493` - Badge URLs and clone command (7 references)
- `package.json:87,90,92` - Repository metadata (3 references)
- `Dockerfile.agent:69` - Source label
- `Dockerfile.production:15,17,19` - Multiple labels
- `.github/workflows/cd.yml:90,206,245` - Deployment paths (3 references)
- 30+ documentation files with GitHub URLs

**Current URLs:**
```
https://github.com/yourusername/claude-flow-novice
https://github.com/masharratt/claude-flow-novice.git
https://github.com/yourusername/claude-flow-novice/actions/workflows/ci.yml
https://badge.fury.io/js/claude-flow-novice.svg
```

**Breaking Changes:**
- GitHub Actions workflow links break
- npm badge URLs become 404
- README badge links fail
- Documentation links in GitHub pages fail
- External references to the repo link to wrong location

---

### 5. Environment Variables & Configuration
**Impact Level:** HIGH - Affects runtime configuration in 60+ files

**Files:**
- `docker/runtime/cfn-runtime.env` - Runtime configuration
- `.env.example` - Development setup
- `.env.hybrid.example` - Hybrid deployment setup
- `.env.database-example` - Database configuration
- `.github/workflows/cd.yml` - Environment setup
- 60+ files with COMPOSE_PROJECT_NAME references

**Key Variables:**
```bash
COMPOSE_PROJECT_NAME="cfn-${BRANCH}"  # 60 references
CFN_REDIS_PORT
CFN_POSTGRES_PORT
CFN_DOCKER_IMAGE="claude-flow-novice:agent"
CFN_DOCKER_IMAGE_SAFE="claude-flow-novice-agent:latest"
```

**Breaking Changes:**
- Docker Compose namespacing breaks (container names no longer resolve)
- Multi-worktree development fails (port/service conflicts)
- Environment variable references in code break
- Database migration scripts fail

---

## HIGH-IMPACT CODE REFERENCES

### 6. CLI Implementation & Handlers
**Impact Level:** HIGH - Core functionality affected

**Files:**
- `src/cli/index.ts` - Version command and help text (4 locations)
- `src/cli/agent-executor.ts` - Agent execution logic
- `src/cli/agent-spawning.ts` - CLI spawning
- `.claude/skills/cfn-agent-spawning/SKILL.md` - Agent spawning documentation
- Multiple agent executor files

**CLI Output Examples:**
```typescript
npx claude-flow-novice agent <type> [options]
npx claude-flow-novice <command> [options]
npx claude-flow-novice agent coder --context "Implement feature"
npx claude-flow-novice agent --list
npx claude-flow-novice --version
```

**Breaking Changes:**
- Agent execution via CLI fails
- Coordinator spawning fails
- Task mode and CLI mode both affected
- Help text and version output misleading

---

### 7. CFN Loop Infrastructure
**Impact Level:** HIGH - Core orchestration system

**Files:**
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` - Main orchestrator
- `.claude/skills/cfn-coordination/` - Coordination protocols (15+ files)
- `.claude/skills/cfn-redis-coordination/` - Redis-based coordination (10+ files)
- `.claude/skills/cfn-loop-validation/SKILL.md` - Loop validation
- `src/cfn-loop/` - TypeScript implementation (8+ files)

**References Found:**
- cfn-spawn commands: 100+ locations
- cfn-loop slash commands: 50+ locations
- cfn-v3-coordinator spawning: 30+ locations
- cfn-docker commands: 25+ locations

**Breaking Changes:**
- Agent spawning fails (cfn-spawn relies on package name)
- Loop orchestration fails
- Coordinator startup fails
- Task validation fails

---

## MEDIUM-IMPACT DOCUMENTATION

### 8. User-Facing Documentation
**Impact Level:** MEDIUM-HIGH - Affects user adoption and support

**Files (150+ total):**

**Critical Docs:**
- `README.md` - Main entry point (7 references)
- `CLAUDE.md` - Project instructions (8+ references)
- `.claude/commands/CFN_LOOP_TASK_MODE.md` - Task mode guide (15+ references)
- `.claude/commands/CFN_COORDINATOR_PARAMETERS.md` - Coordinator params (5+ references)

**Integration Guides (30+ files):**
- `docs/guides/ENABLE_CLI_SPAWNING.md` - 15 CLI examples
- `docs/guides/CLI_AGENT_SPAWNING_IMPLEMENTATION.md` - 10 examples
- `docs/guides/NPM_DISTRIBUTION_GUIDE.md` - 8 npm references
- `docs/guides/ZAI_CONFIGURATION.md` - 10 examples
- `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md` - 15 examples

**Docker Documentation (20+ files):**
- `docker/ARCHITECTURE_ANALYSIS.md` - 2 references
- `docker/DOCKER_PRODUCTION_READY_STATUS.md` - 5 references
- `docker/DOCKER_MULTI_LANGUAGE_IMAGES_COMPLETE.md` - 3 references
- `docs/docker/DOCKER_COORDINATOR_MIGRATION.md` - 3 references

**Quality Assurance (25+ files):**
- `docs/quality-assurance/CODE_QUALITY_REVIEW.md` - 30+ file paths
- `docs/quality-assurance/TEST_COVERAGE_ANALYSIS_*.md` - 50+ references
- `docs/quality-assurance/CODE_QUALITY_VALIDATION_PR12.md` - 10+ references

**Examples & Templates (50+ files):**
- All code examples in docs/ directory
- Template files in examples/
- Bash scripts with hardcoded paths
- Test scripts with directory references

---

### 9. GitHub Actions & CI/CD
**Impact Level:** HIGH - Breaks automated testing and deployment

**Files:**
- `.github/workflows/ci.yml` - Runs on every push
- `.github/workflows/cd.yml` - Deployment workflow (20+ references)
- `.github/workflows/npm-publish.yml` - npm publication
- `.github/workflows/security-enhanced.yml` - Security scanning
- `.github/workflows/integration-tests.yml` - Integration tests
- `.github/workflows/standards-enforcement.yml` - Linting/standards
- `.github/workflows/skill-promotion.yml` - Skill deployment

**Specific Breaking Points:**
- npm publish step fails (package name mismatch)
- Docker build steps fail (image tag mismatch)
- Artifact upload/download fails (path references)
- Badge generation fails (package name in URL)
- Deployment paths hardcoded: `/opt/claude-flow-novice` (5 locations)

---

## FILE PATH & DIRECTORY STRUCTURE

### 10. Hardcoded Paths
**Impact Level:** MEDIUM - Affects shell scripts and deployment

**Files with Path Dependencies:**
- 1,527 total files with path references
- `.claude/` directory structure referenced in 200+ files
- `.backups/` directory structure referenced in 100+ files
- `dist/cli/` referenced in 150+ files
- `src/cfn-loop/` referenced in 80+ files

**Examples:**
```bash
/home/user/claude-flow-novice/src/cfn-loop/cfn-loop-orchestrator.ts
/mnt/c/Users/masha/Documents/claude-flow-novice/tests/
./claude-flow-novice/ (in test scripts)
${GITHUB_WORKSPACE}/claude-flow-novice/
```

**Locations:**
- Bash scripts in `.claude/skills/` - 100+ references
- Docker entrypoints - 15+ references
- CI/CD workflows - 30+ references
- Test scripts - 50+ references
- Documentation with absolute paths - 80+ references

---

## LOW-TO-MEDIUM IMPACT REFERENCES

### 11. Configuration Files
**Impact Level:** MEDIUM - Non-critical but widespread

**Files:**
- `.gitignore:11` - Comment about directory structure
- `package.json:125` - docker:build script
- `.eslintrc.skill.js` - Linting rules
- `.npmignore` - npm distribution
- `.markdownlint-skill.json` - Markdown linting
- `.env.database-example` - Database setup
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Test configuration

---

### 12. Skill & Agent Definitions
**Impact Level:** LOW-MEDIUM - Used in development, not production

**Files (200+ total):**
- `.claude/agents/cfn-dev-team/` - 50+ agent definitions
- `.claude/skills/cfn-*` - 45+ skill definitions
- `.claude/hooks/cfn-*` - 7 hook scripts
- `.claude/commands/cfn/` - 45+ command definitions

**These are NOT production-critical but affect:**
- Local development workflows
- Agent spawning in development
- Skill execution in dev mode
- Sprint configurations

---

## CATEGORY BREAKDOWN TABLE

| Category | Files | Severity | Breaking? | Migration Effort |
|----------|-------|----------|-----------|-----------------|
| NPM Package | 2 | CRITICAL | YES | 2 hours |
| CLI Binary Commands | 50+ | CRITICAL | YES | 8 hours |
| Docker Images | 30+ | HIGH | YES | 6 hours |
| GitHub URLs | 30+ | HIGH | YES | 4 hours |
| Environment Variables | 60+ | HIGH | YES | 4 hours |
| CLI Implementation | 20+ | HIGH | YES | 6 hours |
| CFN Loop Infrastructure | 100+ | HIGH | YES | 12 hours |
| User Documentation | 150+ | MEDIUM | NO | 10 hours |
| CI/CD Workflows | 10+ | HIGH | YES | 8 hours |
| File Paths | 1,527 | MEDIUM | DEPENDS | 5-20 hours |
| Configuration Files | 20+ | MEDIUM | PARTIAL | 3 hours |
| Skills & Agents | 200+ | LOW | NO | 5 hours |

**Total Estimated Effort: 80-120 hours**

---

## EXTERNAL DEPENDENCIES

### npm Registry
**Status:** Package published as "claude-flow-novice"
**Files Affected:**
- npm registry entry
- npm badge service (badge.fury.io)
- npm downloads/stats
- npm documentation

**Migration Required:**
- New package published under new name
- Old package marked deprecated with redirect
- Documentation updated for new package name

### Docker Registries
**Status:** Images likely published to Docker Hub or private registry
**Images Tagged:**
- claude-flow-novice:latest
- claude-flow-novice:agent
- claude-flow-novice-agent:latest
- claude-flow-novice:mcp-*

**Migration Required:**
- Rebuild and tag all images with new name
- Push to registry with new tags
- Maintain old tags for gradual migration

### GitHub Pages / Wiki
**Status:** Wiki and pages reference the repo name
**Files:** Wiki pages, GitHub Pages documentation

---

## USER-FACING IMPACTS

### Breaking Changes for Users
1. **Installation:** `npm install claude-flow-novice` → `npm install <NEW_NAME>`
2. **CLI Usage:** All `npx claude-flow-novice` commands break
3. **Docker:** Pulling images with old tags fails
4. **Documentation:** All embedded URLs become invalid
5. **Automation:** Shell scripts, workflows, CI/CD pipelines fail

### Mitigation Strategies
1. Publish old package as deprecated forwarder
2. Maintain documentation for both old and new names for 6 months
3. Create migration guide with clear before/after instructions
4. Update all badges, links, and URLs
5. Preserve GitHub repo redirect if using GitHub's rename feature

---

## TECHNICAL MIGRATION CHECKLIST

### Phase 1: Preparation (4 hours)
- [ ] Create feature branch: `rename/new-package-name`
- [ ] Backup current documentation
- [ ] Identify all direct references to be changed
- [ ] Plan rollback strategy
- [ ] Notify stakeholders

### Phase 2: Core Changes (30 hours)
- [ ] Update package.json name and bin commands
- [ ] Update all CLI implementations
- [ ] Update Docker image tags and Dockerfiles
- [ ] Update environment variable definitions
- [ ] Update GitHub repository URLs
- [ ] Update CI/CD workflows
- [ ] Rebuild package-lock.json
- [ ] Update tsconfig and build configurations

### Phase 3: Documentation (20 hours)
- [ ] Update README.md
- [ ] Update CLAUDE.md project instructions
- [ ] Update all user guides (30+ files)
- [ ] Update code examples (50+ files)
- [ ] Update API documentation
- [ ] Update deployment guides
- [ ] Update Docker documentation
- [ ] Update wiki pages

### Phase 4: Infrastructure (20 hours)
- [ ] Update GitHub Actions workflows
- [ ] Update deployment scripts
- [ ] Update Docker build and push
- [ ] Update npm publish configuration
- [ ] Update environment files (.env.*)
- [ ] Update test configuration
- [ ] Update linting/standards configurations

### Phase 5: Verification (10 hours)
- [ ] Run full test suite
- [ ] Verify CLI commands work
- [ ] Verify Docker builds work
- [ ] Verify npm package publishing
- [ ] Verify GitHub Actions workflows
- [ ] Test in Docker Compose
- [ ] Test agent spawning
- [ ] Test orchestration workflow

### Phase 6: Deployment (10 hours)
- [ ] Create PR with all changes
- [ ] Code review and approval
- [ ] Merge to main branch
- [ ] Publish new npm package
- [ ] Build and push Docker images
- [ ] Update GitHub Pages
- [ ] Create migration guide
- [ ] Notify users

---

## ROLLBACK PROCEDURE

If issues arise:

1. **Immediate (< 5 mins):**
   - Revert git commits: `git revert <commit>`
   - Unpublish npm package (if published)
   - Delete new Docker image tags

2. **Short-term (< 1 hour):**
   - Restore old package name in npm
   - Point Docker tags back to old names
   - Revert GitHub repository renaming (if done)

3. **Long-term:**
   - Maintain both package names in npm
   - Keep old Docker tags pointing to old images
   - Gradual user migration period

---

## RECOMMENDATIONS

### Do NOT Rename If:
1. Active production users depend on CLI commands
2. Cannot provide migration period (6+ months)
3. Docker images are widely deployed
4. npm package has significant downloads
5. GitHub repository is frequently forked

### Recommended Approach:
1. **Create new package name** under new npm package
2. **Maintain old package** as deprecated forwarder
3. **Dual support period:** 6-12 months of both names
4. **Gradual migration:** Phase out old name slowly
5. **Clear documentation:** Migration guide for all users

### Alternative: Alias/Namespace
Instead of renaming, consider:
- Creating scoped package: `@org/claude-flow`
- Keeping old package for backward compatibility
- Using alias commands: `cfn` as primary, `claude-flow-novice` as alias

---

## COST IMPACT

| Activity | Hours | Cost (at $100/hr) |
|----------|-------|------------------|
| Planning & Preparation | 4 | $400 |
| Core Changes | 30 | $3,000 |
| Documentation Updates | 20 | $2,000 |
| Infrastructure Updates | 20 | $2,000 |
| Verification & Testing | 10 | $1,000 |
| Deployment & Support | 10 | $1,000 |
| **Total** | **94** | **$9,400** |

Plus ongoing costs:
- npm registry maintenance
- Docker registry space
- Support for user questions
- Documentation updates

---

## CONCLUSION

Renaming "claude-flow-novice" is a **significant undertaking** affecting 941 active files. The name is deeply integrated into:

1. **User-facing interfaces** (CLI, npm, Docker)
2. **Infrastructure automation** (CI/CD, Docker Compose)
3. **Documentation** (150+ files)
4. **Configuration** (environment, build, deployment)

**Recommendation:** Unless there's a strong business case, consider maintaining the current name or using scoped package aliases instead. If renaming is essential, allocate 80-120 developer hours and implement a 6-12 month migration window.

