# Repository Rename Impact - Quick Summary

## By The Numbers
- **941 files** directly reference "claude-flow-novice"
- **1,527 files** contain path dependencies
- **80-120 hours** estimated migration effort
- **HIGH risk** - Multiple user-facing breaking changes
- **6-12 months** recommended migration window (if proceeding)

---

## Critical Breaking Areas (Will Break Immediately)

1. **NPM Package** (2 files)
   - `package.json` name field
   - `package-lock.json` entries
   - *Impact:* Users cannot install, existing installations break

2. **CLI Commands** (50+ files)
   - `npx claude-flow-novice agent <type>`
   - `npx claude-flow-novice swarm`
   - `npx claude-flow-novice cfn-loop`
   - *Impact:* All user scripts and automation break

3. **Docker Images** (30+ files)
   - `claude-flow-novice:agent`
   - `claude-flow-novice:latest`
   - `claude-flow-novice-minimal`
   - *Impact:* Image pulls fail, deployments fail

4. **CI/CD Workflows** (10+ files)
   - `.github/workflows/cd.yml` (20 references)
   - npm publish steps
   - Docker build/push steps
   - *Impact:* Automated tests and deployments fail

5. **GitHub URLs** (30+ files)
   - Repository URLs
   - npm badges
   - CI/CD workflow links
   - *Impact:* Documentation links become 404, badges stop working

---

## High-Impact Areas (Need Careful Updates)

| Category | Files | Notes |
|----------|-------|-------|
| CLI Implementation | 20+ | Help text, version output, command routing |
| CFN Loop Infrastructure | 100+ | cfn-spawn, cfn-loop, cfn-v3-coordinator |
| Environment Variables | 60+ | COMPOSE_PROJECT_NAME, CFN_* variables |
| Docker Configuration | 20+ | docker-compose.yml, Dockerfiles |
| Documentation | 150+ | README, CLAUDE.md, guides, tutorials |

---

## Medium-Impact Areas (Content Updates)

| Category | Files | Effort |
|----------|-------|--------|
| User Guides | 30+ | Update examples and copy |
| Docker Docs | 20+ | Update deployment instructions |
| Code Examples | 50+ | Fix hardcoded commands |
| Configuration Files | 20+ | Update defaults and comments |
| Skills & Agents | 200+ | Update definitions (non-critical) |

---

## Most Critical Files to Change

**Absolutely Must Change (will break everything):**
1. `/home/user/claude-flow-novice/package.json` - Package name field
2. `/home/user/claude-flow-novice/README.md` - Primary documentation
3. `/home/user/claude-flow-novice/CLAUDE.md` - Project instructions
4. `.github/workflows/cd.yml` - Deployment automation
5. `.github/workflows/npm-publish.yml` - Package publishing
6. `Dockerfile.orchestrator` - Entrypoint commands
7. `Dockerfile.agent` - Agent image
8. `src/cli/index.ts` - CLI help text

**Highly Important (will break workflows):**
9. `.claude/skills/cfn-loop-orchestration/orchestrate.sh` - Main orchestrator
10. `docker/docker-compose.yml` - Service configuration
11. All 8 `.github/workflows/*.yml` files
12. `docs/guides/ENABLE_CLI_SPAWNING.md` - Primary user guide

---

## Cost Breakdown

```
Preparation                    4 hours    ($400)
Core Changes                  30 hours   ($3,000)
Documentation Updates         20 hours   ($2,000)
Infrastructure Updates        20 hours   ($2,000)
Testing & Verification        10 hours   ($1,000)
Deployment & Support          10 hours   ($1,000)
────────────────────────────────────────
TOTAL                        94 hours   ($9,400)
```

---

## External Dependencies to Manage

1. **npm Registry**
   - Package published as "claude-flow-novice"
   - Badge URLs depend on package name
   - Need to mark old package as deprecated

2. **Docker Registry**
   - Images tagged as "claude-flow-novice:*"
   - May be pulled by users with cached references
   - Need to rebuild and push all variants

3. **GitHub Pages**
   - Wiki references repository name
   - Documentation links depend on repo name
   - External sites may link to repo

---

## User-Facing Breakage

### What breaks for users?

1. **Installation:** `npm install <OLD_NAME>` → package not found
2. **CLI:** `npx claude-flow-novice agent ...` → command not found
3. **Docker:** Pulling old image tags → image not found
4. **Documentation:** Links to README, guides, etc. → 404
5. **Automation:** Shell scripts, CI/CD pipelines, Dockerfiles → fail

### Mitigation required:

- 6-12 month migration window
- Deprecated package forwarder in npm
- Maintain old Docker tags pointing to old images
- Clear migration guide for all users
- Update all external documentation links

---

## Recommended Decision Path

### Option A: DO NOT RENAME (Recommended)
**Pros:**
- Zero risk, zero cost
- No user impact
- No testing needed
- Current name is functional

**Cons:**
- Name may not align with brand
- Cannot address past naming decisions

**Effort:** 0 hours

---

### Option B: CREATE SCOPED ALIAS (Alternative)
**Pros:**
- New package name available: `@org/claude-flow`
- Keep old package for backward compatibility
- Low user disruption
- Both names can coexist

**Cons:**
- Scoped packages have different usage: `npm install @org/claude-flow`
- Still need to update documentation
- Still need to manage two package names

**Effort:** 30-40 hours

---

### Option C: FULL RENAME (High Risk)
**Pros:**
- Clean break to new name
- Removes legacy naming
- Fresh start for branding

**Cons:**
- HIGH RISK: Breaks 941 files
- Critical user-facing breakage
- 80-120 hour migration
- Requires 6-12 month support window
- Multiple external dependencies
- Complex rollback if issues arise

**Effort:** 80-120 hours

---

## If Rename is Mandatory

### Phase 1: Planning (4 hours)
- [ ] Choose new name
- [ ] Reserve npm package name
- [ ] Plan migration messaging
- [ ] Notify stakeholders

### Phase 2: Core (30 hours)
- [ ] Update package.json
- [ ] Update Docker images
- [ ] Update CLI commands
- [ ] Update environment variables
- [ ] Update GitHub workflows
- [ ] Rebuild package-lock.json

### Phase 3: Documentation (20 hours)
- [ ] Update README
- [ ] Update all user guides
- [ ] Update code examples
- [ ] Update deployment docs
- [ ] Create migration guide

### Phase 4: Infrastructure (20 hours)
- [ ] Update CI/CD
- [ ] Build new Docker images
- [ ] Update deployment scripts
- [ ] Test everything
- [ ] Prepare rollback plan

### Phase 5: Verification (10 hours)
- [ ] Full test suite pass
- [ ] CLI works
- [ ] Docker builds work
- [ ] npm publish works
- [ ] Orchestration works

### Phase 6: Release (10 hours)
- [ ] Merge PR
- [ ] Publish npm package
- [ ] Push Docker images
- [ ] Announce migration
- [ ] Support early adopters

---

## Quick Risk Assessment

**Critical Risks:**
- ❌ npm registry breakage (immediate)
- ❌ CLI command breakage (immediate)
- ❌ Docker image tag mismatch (immediate)
- ❌ User script breakage (immediate)
- ❌ CI/CD pipeline failures (immediate)

**Medium Risks:**
- ⚠️ Documentation complexity
- ⚠️ File path hardcoding (1,527 files)
- ⚠️ External link breakage
- ⚠️ Rollback complexity

**Mitigable Risks:**
- ✓ Maintainable with deprecated package forwarder
- ✓ Manageable with 6-12 month window
- ✓ Preventable with comprehensive migration guide

---

## Conclusion

**Renaming from "claude-flow-novice" is a significant undertaking** affecting:
- 941 active files
- User-facing CLI commands
- Published npm package
- Docker images
- 10+ CI/CD workflows
- 150+ documentation files

**Recommendation:**
Unless there's a **strong business case** (brand change, legal requirement, etc.), consider:
1. Keeping current name
2. Using scoped alias (`@org/claude-flow`)
3. Delaying rename until major version bump

If rename is essential:
- Allocate 80-120 developer hours
- Plan 6-12 month migration window
- Implement deprecated package forwarder
- Maintain old Docker tags
- Create comprehensive migration guide

---

**Full Analysis:** See `REPO_RENAME_IMPACT_ANALYSIS.md` for detailed breakdown by category, file locations, and implementation guidance.
