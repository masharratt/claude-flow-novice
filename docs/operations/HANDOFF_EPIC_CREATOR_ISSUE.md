# Handoff: Epic Creator Agent Deletion Issue

**Date:** 2025-11-03
**Status:** Root Cause Identified - Solution Pending
**Priority:** Medium

---

## Problem Summary

The `epic-creator.md` agent keeps getting deleted from `.claude/agents/cfn-dev-team/coordinators/` after being created and committed.

---

## Root Cause

**`npx cfn-init` overwrites the entire `.claude/agents/cfn-dev-team/` directory** during initialization or npm package updates.

### Evidence

1. **File History:**
   - Created: 2025-11-02 (commit a794f9ad)
   - Recreated: 2025-11-03 (commit 31eb6c8d)
   - Deleted again during testing

2. **Init Script Behavior:**
   ```javascript
   // scripts/init-project.js:42-43
   agents: {
     src: path.join(cfnRoot, 'claude-assets/agents/cfn-dev-team'),
     dest: '.claude/agents/cfn-dev-team'  // ← OVERWRITES ENTIRE DIR
   }
   ```

3. **Trigger:** Running `npx cfn-init` or npm package updates triggers `copyFiles()` which removes and replaces the entire `cfn-dev-team` directory.

---

## What Epic Creator Does

**Purpose:** Creates epic configuration JSON files from natural language descriptions.

**Personas:**
- **CTO:** Technical architecture, dependencies, risk assessment
- **Product Owner:** Value prioritization, scope boundaries
- **Project Manager:** Phase decomposition, deliverables, estimates

**Key Features:**
- Transforms natural language → structured JSON
- Decomposes epics into 3-7 phases
- Selects appropriate Loop 3/Loop 2 agents
- Defines concrete deliverables with file paths
- Sets mode-appropriate thresholds (MVP/Standard/Enterprise)

**File Location (Current - UNSTABLE):**
`.claude/agents/cfn-dev-team/coordinators/epic-creator.md`

**Remote Commit:** 31eb6c8d (exists on GitHub)

---

## Solution Options

### Option 1: Move to Custom Directory ✅ RECOMMENDED

**Action:**
```bash
mkdir -p .claude/agents/custom/coordinators/
git mv .claude/agents/cfn-dev-team/coordinators/epic-creator.md \
       .claude/agents/custom/coordinators/epic-creator.md
git commit -m "fix: Move epic-creator to custom agents (protected from cfn-init)"
git push
```

**Pros:**
- Immediate solution
- No package changes needed
- Protected from cfn-init overwrites
- Standard pattern for custom agents

**Cons:**
- Not included in package distribution
- Team members must create manually or pull from repo

---

### Option 2: Add to NPM Package

**Action:**
1. Add `epic-creator.md` to `claude-assets/agents/cfn-dev-team/coordinators/` in package source
2. Publish new version (v2.14.5 or v2.15.0)
3. Users get it automatically via `npx cfn-init`

**Pros:**
- Available to all users
- Part of official distribution
- Survives cfn-init

**Cons:**
- Requires package publish
- Needs version bump
- Takes longer to implement

---

### Option 3: Modify Init Script Protection

**Action:**
Modify `scripts/init-project.js` to preserve certain files during copy:

```javascript
const PROTECTED_FILES = [
  'coordinators/epic-creator.md'
];

// In copyFiles(), add protection logic
if (PROTECTED_FILES.some(file => itemDest.includes(file)) && fs.existsSync(itemDest)) {
  console.log(chalk.yellow(`⚠️ Skipping protected file: ${itemDest}`));
  continue;
}
```

**Pros:**
- Protects specific files
- Allows local customization

**Cons:**
- Complex maintenance
- Could miss files
- Fragile pattern

---

## Recommended Action

**Use Option 1** (Move to custom directory) immediately to unblock work.

**Consider Option 2** (Add to package) if epic-creator should be standard for all users.

---

## File Recovery (If Deleted Again)

```bash
# Restore from git
git restore .claude/agents/cfn-dev-team/coordinators/epic-creator.md

# Or restore from remote
git checkout origin/main -- .claude/agents/cfn-dev-team/coordinators/epic-creator.md
```

**Current file exists on remote:** commit `31eb6c8d`

---

## Related Files

- **Agent File:** `.claude/agents/cfn-dev-team/coordinators/epic-creator.md` (3.7KB)
- **Init Script:** `scripts/init-project.js` (handles cfn-init logic)
- **Package Assets:** `claude-assets/agents/cfn-dev-team/` (npm distribution source)

---

## Additional Context

### Other Deleted Files (Same Root Cause)

```
D planning/epics/auth-system-v1.json
D planning/epics/redis-coordination-enhancements/COMPLETION_REPORT.md
D planning/epics/redis-coordination-enhancements/README.md
D planning/epics/redis-coordination-enhancements/epic.json
D planning/security/SECRET_MANAGEMENT_GUIDELINES.md
```

These are **NOT** affected by cfn-init (different directories). Likely manual deletions or git operations.

### WSL2 Filesystem Behavior

- **Permissions:** Files created with 0777 (overly permissive, normal for WSL2)
- **No symlinks detected**
- **No gitignore conflicts**
- File system timing issues not the cause (confirmed via testing)

---

## Next Steps

1. **Decide:** Which solution option to implement
2. **Execute:** Move file to custom directory OR publish to package
3. **Document:** Update agent discovery patterns if using custom directory
4. **Test:** Verify epic-creator survives `npx cfn-init` after changes
5. **Communicate:** Update team on new agent location

---

## Questions to Answer

- Should epic-creator be part of core package? (Yes → Option 2)
- Should epic-creator be project-specific? (Yes → Option 1)
- Do other coordinators need similar protection?
- Should we establish a pattern for "user-customizable" agents?

---

**Handoff Complete**
**Next Engineer:** Choose solution option and implement protection mechanism.
