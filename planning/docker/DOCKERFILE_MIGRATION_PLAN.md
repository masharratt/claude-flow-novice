# Dockerfile Migration Plan - Agent + Trigger.dev Focus

**Status:** Ready for execution
**Scope:** Minimal migration based on current usage patterns
**Risk:** Low (only 2 active Dockerfiles)

---

## Current State Analysis

### Active Dockerfiles
1. **Dockerfile.agent** (root) - Used by:
   - `scripts/build-agent-image.sh`
   - `scripts/docker-rebuild-all-agents.sh`
   - `.claude/skills/docker-build/build.sh`

2. **docker/trigger-dev/Dockerfile.worker** (already organized) ✅
   - Used by: `docker/trigger-dev/docker-compose.yml`
   - **No changes needed**

### Legacy/Unused Dockerfiles (Root)
Can be deprecated or archived:
- Dockerfile.agent-backend
- Dockerfile.agent-frontend
- Dockerfile.agent.stabilized
- Dockerfile.orchestrator
- Dockerfile.cfn-coordinator
- Dockerfile.production
- Dockerfile.telemetry
- Dockerfile.minimal
- Dockerfile.minimal-test

---

## Migration Strategy - Option 1: Minimal (Recommended)

**Goal:** Move only the active agent Dockerfile, keep build scripts working

### Step 1: Create Target Directory
```bash
mkdir -p docker/agent
```

### Step 2: Move Active Dockerfile
```bash
git mv Dockerfile.agent docker/agent/Dockerfile
```

### Step 3: Update Build Scripts (3 files)

**File:** `scripts/build-agent-image.sh`
```bash
# OLD:
DOCKERFILE="$PROJECT_ROOT/Dockerfile.agent"

# NEW:
DOCKERFILE="$PROJECT_ROOT/docker/agent/Dockerfile"
```

**File:** `scripts/docker-rebuild-all-agents.sh`
```bash
# OLD:
docker build -f Dockerfile.agent -t cfn-agent:latest .

# NEW:
docker build -f docker/agent/Dockerfile -t cfn-agent:latest .
```

**File:** `.claude/skills/docker-build/build.sh`
```bash
# OLD:
DOCKERFILE="${DOCKERFILE:-Dockerfile.agent}"

# NEW:
DOCKERFILE="${DOCKERFILE:-docker/agent/Dockerfile}"
```

### Step 4: Update Documentation References

**CLAUDE.md:** Update example from:
```bash
docker build -f Dockerfile.agent
```
to:
```bash
docker build -f docker/agent/Dockerfile
```

**docker/CLAUDE.md:** Update all references to agent Dockerfile path

### Step 5: Archive Legacy Dockerfiles
```bash
mkdir -p docker/archive
git mv Dockerfile.agent-* docker/archive/
git mv Dockerfile.orchestrator docker/archive/
git mv Dockerfile.cfn-coordinator docker/archive/
git mv Dockerfile.production docker/archive/
git mv Dockerfile.telemetry docker/archive/
git mv Dockerfile.minimal* docker/archive/
```

### Step 6: Verify Build Works
```bash
# Test agent build
.claude/skills/docker-build/build.sh

# Test trigger.dev build (should still work)
cd docker/trigger-dev && docker-compose build
```

---

## Migration Strategy - Option 2: Keep Root (Alternative)

**If you want zero changes:**

### Action: Archive Only
```bash
mkdir -p docker/archive
git mv Dockerfile.agent-* docker/archive/
git mv Dockerfile.orchestrator docker/archive/
git mv Dockerfile.cfn-coordinator docker/archive/
git mv Dockerfile.production docker/archive/
git mv Dockerfile.telemetry docker/archive/
git mv Dockerfile.minimal* docker/archive/
```

**Keep in root:**
- `Dockerfile.agent` (active)

**Result:** Clean root, zero script changes

---

## Execution Checklist

### Option 1: Full Migration (Recommended)
- [ ] Create `docker/agent/` directory
- [ ] Move `Dockerfile.agent` → `docker/agent/Dockerfile`
- [ ] Update `scripts/build-agent-image.sh` (1 line)
- [ ] Update `scripts/docker-rebuild-all-agents.sh` (1 line)
- [ ] Update `.claude/skills/docker-build/build.sh` (1 line)
- [ ] Update root `CLAUDE.md` examples
- [ ] Update `docker/CLAUDE.md` references
- [ ] Archive legacy Dockerfiles to `docker/archive/`
- [ ] Test agent build: `.claude/skills/docker-build/build.sh`
- [ ] Test trigger.dev build: `cd docker/trigger-dev && docker-compose build`
- [ ] Commit changes with git

### Option 2: Archive Only (Zero Script Changes)
- [ ] Create `docker/archive/` directory
- [ ] Move all unused Dockerfiles to archive
- [ ] Add archive README explaining purpose
- [ ] Keep `Dockerfile.agent` in root
- [ ] Commit changes with git

---

## Files Requiring Updates

### Build Scripts (3 files)
1. `scripts/build-agent-image.sh` - Line 15
2. `scripts/docker-rebuild-all-agents.sh` - Lines 45, 50, 55
3. `.claude/skills/docker-build/build.sh` - Line 22

### Documentation (2 files)
1. `CLAUDE.md` - Docker build examples section
2. `docker/CLAUDE.md` - Image building section

### No Changes Required
- `docker/trigger-dev/docker-compose.yml` (already correct)
- `.github/workflows/` (no Dockerfile monitoring currently active)
- All trigger.dev documentation (already references correct path)

---

## Risk Assessment

### Option 1: Full Migration
**Risk Level:** LOW
- Only 3 build scripts to update
- Simple path changes (find/replace)
- Easy to test (run build scripts)
- Easy to revert (git revert)

### Option 2: Archive Only
**Risk Level:** MINIMAL
- No script changes
- Only moving unused files
- Zero production impact

---

## Estimated Time

### Option 1: Full Migration
- Script updates: 10 minutes
- Documentation updates: 5 minutes
- Testing: 5 minutes
- **Total: 20 minutes**

### Option 2: Archive Only
- Move files: 3 minutes
- Add README: 2 minutes
- **Total: 5 minutes**

---

## Recommendation

**Execute Option 1 (Full Migration)** because:
1. Only 20 minutes of work
2. Consolidates all Docker assets in one directory
3. Cleaner root directory (removes 9 files)
4. Low risk (only 3 scripts, easy path changes)
5. Better long-term organization

**Fallback to Option 2** only if:
- Time constraints
- Concerns about breaking builds
- Want to defer migration

---

## Post-Migration Verification

### Build Verification
```bash
# 1. Agent build (primary use case)
./.claude/skills/docker-build/build.sh
# Expected: Success, image: cfn-agent:latest

# 2. Trigger.dev build
cd docker/trigger-dev
docker-compose build
# Expected: Success, image: trigger-dev-worker-cfn:latest

# 3. Verify images exist
docker images | grep -E "cfn-agent|trigger-dev"
# Expected: Both images listed
```

### Directory Structure Verification
```bash
# Expected structure after Option 1:
docker/
├── agent/
│   └── Dockerfile          (moved from root)
├── trigger-dev/
│   ├── Dockerfile.worker   (already here)
│   └── docker-compose.yml
└── archive/
    ├── Dockerfile.agent-backend
    ├── Dockerfile.agent-frontend
    └── ...other legacy files

# Root should have zero Dockerfile.* files
ls -1 Dockerfile.* 2>/dev/null
# Expected: No output
```

---

## Success Criteria

- ✅ Agent builds successfully with new path
- ✅ Trigger.dev builds unchanged
- ✅ Root directory has zero Dockerfile.* files (Option 1) or 1 file (Option 2)
- ✅ All build scripts execute without errors
- ✅ Documentation updated with new paths
- ✅ Git history shows clean rename (not delete + add)

---

**Next Steps:**
1. Review this plan
2. Choose Option 1 or Option 2
3. Execute checklist items
4. Verify builds work
5. Commit changes

**Rollback Plan:**
```bash
# If Option 1 fails, revert with:
git revert HEAD
# This restores all files to original locations
```
