# Epic Creator Deletion Issue - Complete Summary

**Date:** 2025-11-03
**Status:** RESOLVED
**Versions:** v2.14.5 (epic-creator added), v2.14.6 (init bug fixed)

---

## Problem

The `epic-creator.md` coordinator agent kept getting deleted from `.claude/agents/cfn-dev-team/coordinators/` after being created and committed.

---

## Root Cause

**Every `npx claude-flow-novice` command triggered `cfn-init`**, which overwrote the entire `.claude/agents/cfn-dev-team/` directory from the npm package.

### Why It Happened

1. `package.json` has `"postinstall": "node scripts/init-project.js"`
2. Running `npx claude-flow-novice agent backend-dev` triggers postinstall
3. `init-project.js` ran `cfn-init` unconditionally
4. cfn-init copied package version of cfn-dev-team/, overwriting local files
5. epic-creator.md (and other local customizations) got deleted

### Trigger Pattern

```bash
# Each of these triggered cfn-init:
npx claude-flow-novice agent backend-dev
npx claude-flow-novice agent reviewer
npx claude-flow-novice agent epic-creator

# In test sessions running hundreds of npx commands:
# = hundreds of cfn-init runs = constant file deletion
```

---

## Solution

### Phase 1: Add epic-creator to Package (v2.14.5)

```bash
# Copy epic-creator to package assets
cp .claude/agents/cfn-dev-team/coordinators/epic-creator.md \
   claude-assets/agents/cfn-dev-team/coordinators/

# Publish to npm
npm version patch
npm publish
```

**Result:** Users can now get epic-creator via normal installation.

---

### Phase 2: Fix Init-on-Every-NPX Bug (v2.14.6)

**Changes to `scripts/init-project.js`:**

```javascript
async function initializeCfnProject() {
  // Skip initialization if already initialized
  const markerPath = '.claude/.cfn-initialized';
  if (fs.existsSync(markerPath)) {
    // Silently skip - already initialized
    return;
  }

  // ... existing init logic ...

  // Create marker file after successful init
  fs.writeFileSync('.claude/.cfn-initialized', new Date().toISOString());
}
```

**How It Works:**
1. First `npx claude-flow-novice` command → runs full init → creates marker
2. Subsequent commands → sees marker → skips init → files preserved
3. Force reinit: `rm .claude/.cfn-initialized && npx cfn-init`

---

## Epic Creator Agent

**Purpose:** Transforms natural language epic descriptions into structured JSON configs for CFN Loop execution.

**Three Personas:**
- **CTO:** Technical architecture, dependencies, risk assessment
- **Product Owner:** Value prioritization, scope boundaries
- **Project Manager:** Phase decomposition, deliverables, estimates

**Key Features:**
- Decomposes epics into 3-7 focused phases
- Selects appropriate Loop 3/Loop 2 agents per phase
- Defines concrete deliverables with file paths
- Sets mode-appropriate thresholds (MVP/Standard/Enterprise)
- Validates configuration completeness

**Location:** `.claude/agents/cfn-dev-team/coordinators/epic-creator.md` (3.7KB)

**Usage:**
```bash
npx claude-flow-novice agent epic-creator \
  --prompt "Create epic for user authentication system with JWT and OAuth2"
```

---

## Published Versions

**v2.14.5** (Published 2025-11-03)
- Includes epic-creator in package distribution
- Users get it automatically on install

**v2.14.6** (Published 2025-11-03)
- Fixes init-on-every-npx bug
- Preserves local customizations
- Faster CLI performance

**Install Latest:**
```bash
npm install claude-flow-novice@latest
npx cfn-init  # Only runs once, creates marker
```

---

## Current Status

**RESOLVED:** Both epic-creator availability and init-on-every-npx bug are fixed.

**Users on v2.14.6+ will:**
- Get epic-creator automatically
- Experience fast npx startup
- Keep local customizations safe
- Have stable cfn-dev-team directory

**No further action required.**
