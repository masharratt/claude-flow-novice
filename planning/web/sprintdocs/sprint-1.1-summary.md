# Sprint 1.1: Monorepo Setup & Workspace Configuration

**Epic:** Unified Web Portal Consolidation
**Duration:** 3-4 days
**Status:** Planning Complete

## Overview

Establish monorepo foundation using npm workspaces to consolidate 8 fragmented web portals (714MB) into a unified structure targeting 300MB.

## Current State

### 8 Existing Portals
1. **src/web/frontend (671MB)** - Transparency Portal (React, Material-UI)
2. **src/web/dashboard** - Web dashboard components
3. **src/dashboard (204KB)** - Fleet Dashboard components
4. **src/ui/console** - Console UI
5. **src/ui/web-ui** - Web UI components
6. **monitor/dashboard (9.3MB)** - Premium monitoring dashboard
7. **.claude-flow/dashboard** - Analytics dashboard
8. **Phase 4 dashboard** - CFN Loop dashboard

### Key Issues
- 5 different Socket.IO implementations
- 3 separate Express servers
- 45% code duplication
- Version conflicts (React 18.2, Socket.IO 4.7.4-4.8.1, Express 4.18-5.1)

## Target Architecture

```
packages/
├── web-portal/           # Main unified SPA
│   ├── src/
│   │   ├── client/      # React frontend
│   │   ├── server/      # Express backend
│   │   ├── shared/      # Shared code
│   │   └── integrations/ # System integrations
│   ├── public/
│   ├── config/
│   └── tests/
└── web-components/       # Shared component library
    ├── src/
    │   ├── components/  # 8 unified components
    │   ├── hooks/
    │   └── utils/
    └── dist/
```

## Tasks

### Task 1.1.1: Create Workspace Structure (1 day)
**Priority:** Critical
**Output:** Complete directory structure with package.json files

**Key Deliverables:**
- packages/ directory with 2 packages
- All subdirectories created per specification
- README.md files for documentation
- Naming conventions established

**Commands:**
```bash
mkdir -p packages/{web-portal,web-components}/src
mkdir -p packages/web-portal/src/{client,server,shared,integrations}
npm init -w packages/web-portal
npm init -w packages/web-components
```

### Task 1.1.2: Extract and Deduplicate Dependencies (1.5 days)
**Priority:** Critical
**Dependencies:** Task 1.1.1

**Key Actions:**
1. Audit all 8 portal dependencies
2. Resolve version conflicts
3. Remove deprecated packages
4. Create unified package.json files

**Major Consolidations:**
- **React:** 18.2.0 → 18.3.1 (unified)
- **Socket.IO Client:** 4.7.4/4.7.5/4.8.1 → 4.8.1 (latest)
- **Express:** 4.18.2/5.1.0 → 4.21.1 (stable v4)
- **TypeScript:** 4.9.5/5.3.3/5.9.3 → 5.6.3 (latest)
- **Material-UI:** 5.15.0 → 6.1.7 (v6)

**Packages to Remove:**
- react-scripts (replaced by Vite)
- react-query v3 (replaced by Zustand + axios)
- react-split-pane (replaced by CSS Grid)
- prismjs, react-syntax-highlighter (replaced by Monaco Editor)

### Task 1.1.3: Setup Build Pipeline (1 day)
**Priority:** High
**Dependencies:** Tasks 1.1.1, 1.1.2

**Build Stack:**
- **TypeScript:** Type checking and declarations
- **SWC:** Fast TypeScript/JSX compilation
- **Vite:** React SPA bundling with HMR
- **Turbo:** Monorepo build orchestration

**Configurations:**
1. `tsconfig.base.json` - Shared TypeScript config
2. `packages/*/tsconfig.json` - Package-specific configs
3. `packages/*/.swcrc` - SWC compilation settings
4. `packages/web-portal/vite.config.ts` - Vite bundler config
5. `turbo.json` - Build orchestration

**Build Scripts:**
```bash
npm run dev          # Start development (both packages)
npm run build        # Build all packages with Turbo
npm run type-check   # TypeScript validation
npm run lint         # ESLint all packages
```

## Acceptance Criteria

### Sprint-Level Success Metrics
- ✅ Monorepo structure with 2 packages created
- ✅ Dependencies consolidated (40%+ reduction)
- ✅ No duplicate dependencies in tree
- ✅ Build pipeline functional (<30s build time)
- ✅ Development workflow operational (HMR working)
- ✅ TypeScript type checking passes (0 errors)
- ✅ Bundle size <2MB gzipped
- ✅ No files migrated yet (structure only)

### Validation Commands
```bash
# Structure
tree packages/ -L 3
npm ls --workspaces

# Dependencies
npm ls react --all
npm ls socket.io-client --all
npm dedupe --dry-run

# Build
npm run type-check
npm run build
time npm run build

# Size
du -sh packages/web-portal/dist/client
```

## Risk Assessment

### Medium-High Risks
1. **Dependency version conflicts** - Use npm-check-updates, test with npm ls
2. **Build pipeline complexity** - Start simple, add incrementally
3. **TypeScript path mapping** - Use project references

### Mitigation Strategies
- Keep separate package.json temporarily if conflicts arise
- Fall back to simpler build tools if needed
- Use relative imports as fallback

## Success Metrics

**Quantitative:**
- 2 packages created
- ≥40% dependency reduction
- <30s build time
- <2MB bundle size
- 0 type errors

**Qualitative:**
- Fast dev server with hot reload
- Clear structure with documentation
- Easy to extend with new packages

## Next Sprint Handoff

### Sprint 1.2 Prerequisites
- ✅ Workspace structure validated
- ✅ Dependencies installed and deduplicated
- ✅ Build pipeline tested
- ✅ Package scripts working
- ✅ TypeScript compilation successful

### Handoff Artifacts
1. Empty but complete packages/ structure
2. Unified package.json with dependencies
3. TypeScript and SWC configurations
4. Build scripts and Turbo config
5. Migration checklist for component extraction

## Team Composition

**Recommended Agents:** 2-3
- System Architect (planning, design decisions)
- DevOps Engineer (build pipeline, dependencies)
- Backend Developer (optional, for validation)

## Timeline

**Day 1:** Task 1.1.1 (Structure)
**Day 2-2.5:** Task 1.1.2 (Dependencies)
**Day 3:** Task 1.1.3 (Build Pipeline)
**Day 3.5-4:** Buffer (testing, docs, fixes)

## Related Documents

- **Implementation Plan:** `sprint-1.1-implementation-plan.json`
- **Epic Scope:** `epic-scope-boundaries.json`
- **Phase 1 Overview:** TBD in `phase-1-foundation-plan.json`
