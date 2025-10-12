# Sprint 1.1 Execution Roadmap

## Quick Reference

**Sprint:** 1.1 - Monorepo Setup & Workspace Configuration
**Epic:** Unified Web Portal Consolidation
**Duration:** 3-4 days
**Agent Count:** 2-3 (Architect, DevOps Engineer, Backend Developer)

## Visual Task Flow

```
Day 1               Day 2               Day 3               Day 4
│                   │                   │                   │
├─ Task 1.1.1 ─────┤                   │                   │
│  (Structure)      │                   │                   │
│                   │                   │                   │
│                   ├─ Task 1.1.2 ──────┤                   │
│                   │  (Dependencies)   │                   │
│                   │                   │                   │
│                   │                   ├─ Task 1.1.3 ──────┤
│                   │                   │  (Build)          │
│                   │                   │                   │
│                   │                   │                   ├─ Buffer/Testing
```

## Task Execution Matrix

| Task | Agent | Duration | Parallel | Critical Path |
|------|-------|----------|----------|---------------|
| 1.1.1 | Architect | 1 day | ❌ | ✅ Blocks all |
| 1.1.2 | DevOps | 1.5 days | ✅ Partial | ✅ Blocks 1.1.3 |
| 1.1.3 | DevOps | 1 day | ✅ Partial | ❌ Final task |
| Buffer | All | 0.5 day | ❌ | ❌ Contingency |

## Task 1.1.1: Create Workspace Structure

### Agent: System Architect
### Duration: 1 day
### Dependencies: None

#### Execution Steps

**Step 1: Create Directory Tree (30 min)**
```bash
# Create main workspace structure
mkdir -p packages/{web-portal,web-components}

# Web Portal structure
mkdir -p packages/web-portal/src/{client,server,shared,integrations}
mkdir -p packages/web-portal/src/client/{app,views,layouts,hooks,utils,styles,assets}
mkdir -p packages/web-portal/src/server/{api,middleware,services,websocket,config}
mkdir -p packages/web-portal/src/shared/{types,constants,validators,utils}
mkdir -p packages/web-portal/src/integrations/{transparency,swarm,eventbus,redis}
mkdir -p packages/web-portal/{public,config,tests}
mkdir -p packages/web-portal/tests/{unit,integration,e2e}

# Web Components structure
mkdir -p packages/web-components/src/{components,hooks,utils,types,styles}
mkdir -p packages/web-components/dist
```

**Step 2: Initialize Package Files (1 hour)**
```bash
# Initialize workspace packages
npm init -w packages/web-portal
npm init -w packages/web-components

# Create basic package.json structure
# (Agent will populate with proper configs)
```

**Step 3: Create Documentation (1 hour)**
```bash
# Create README files
touch packages/web-portal/README.md
touch packages/web-components/README.md

# Create .gitkeep for empty dirs
find packages -type d -empty -exec touch {}/.gitkeep \;
```

**Step 4: Update Root Workspace (30 min)**
```json
// Add to root package.json
{
  "workspaces": ["packages/*"]
}
```

**Step 5: Validate Structure (1 hour)**
```bash
# Verify structure
tree packages/ -L 3

# Verify npm workspace detection
npm ls --workspaces

# Verify package.json files
test -f packages/web-portal/package.json && echo "✅ Portal package.json"
test -f packages/web-components/package.json && echo "✅ Components package.json"
```

#### Success Criteria
- [ ] All directories created per specification
- [ ] package.json exists in both packages
- [ ] README.md files created
- [ ] npm recognizes workspaces
- [ ] No files in src/ directories (structure only)

---

## Task 1.1.2: Extract and Deduplicate Dependencies

### Agent: DevOps Engineer
### Duration: 1.5 days
### Dependencies: Task 1.1.1 complete

#### Execution Steps

**Step 1: Audit Existing Dependencies (3 hours)**
```bash
# Read all portal package.json files
cat src/web/frontend/package.json > /tmp/portal1-deps.json
cat src/dashboard/package.json > /tmp/portal2-deps.json
cat package.json > /tmp/root-deps.json

# Analyze Socket.IO versions
npm ls socket.io-client --all | grep socket.io-client

# Analyze React versions
npm ls react --all | grep react

# Identify duplicates
npm dedupe --dry-run
```

**Step 2: Resolve Version Conflicts (4 hours)**

| Package | Versions Found | Resolution | Rationale |
|---------|---------------|------------|-----------|
| react | 18.2.0 | → 18.3.1 | Latest stable |
| socket.io-client | 4.7.4, 4.7.5, 4.8.1 | → 4.8.1 | Latest from root |
| express | 4.18.2, 5.1.0 | → 4.21.1 | Stable v4, v5 breaking |
| typescript | 4.9.5, 5.3.3, 5.9.3 | → 5.6.3 | Latest compatible |
| @mui/material | 5.15.0 | → 6.1.7 | Latest v6 |

**Step 3: Create Web Portal package.json (2 hours)**
```json
{
  "name": "@claude-flow/web-portal",
  "version": "3.0.0",
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "@mui/material": "^6.1.7",
    "@mui/icons-material": "^6.1.7",
    "socket.io-client": "^4.8.1",
    "axios": "^1.7.9",
    "zustand": "^5.0.1",
    "recharts": "^2.14.1",
    "express": "^4.21.1",
    "socket.io": "^4.8.1",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@types/react": "^18.3.12",
    "@swc/cli": "^0.7.8",
    "@swc/core": "^1.13.20",
    "vite": "^6.0.1",
    "@vitejs/plugin-react-swc": "^3.7.1",
    "vitest": "^2.1.5",
    "playwright": "^1.49.0"
  }
}
```

**Step 4: Create Web Components package.json (1 hour)**
```json
{
  "name": "@claude-flow/web-components",
  "version": "3.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "dependencies": {
    "@mui/material": "^6.1.7",
    "recharts": "^2.14.1",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@swc/cli": "^0.7.8",
    "@storybook/react": "^8.4.5"
  }
}
```

**Step 5: Update Root package.json (1 hour)**
```json
{
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "npm run dev --workspace=web-portal",
    "build": "turbo run build",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.3.3",
    "concurrently": "^9.1.0"
  }
}
```

**Step 6: Install and Deduplicate (2 hours)**
```bash
# Install all dependencies
npm install --workspaces

# Deduplicate
npm dedupe

# Verify no duplicates
npm ls react --all
npm ls socket.io-client --all

# Check total size
du -sh node_modules/
```

#### Success Criteria
- [ ] Single version of react (18.3.1) across all packages
- [ ] Single version of socket.io-client (4.8.1)
- [ ] No deprecated packages
- [ ] All peer dependencies declared
- [ ] npm install completes without errors
- [ ] Dependency size reduced 40%+

---

## Task 1.1.3: Setup Build Pipeline

### Agent: DevOps Engineer
### Duration: 1 day
### Dependencies: Tasks 1.1.1, 1.1.2 complete

#### Execution Steps

**Step 1: Create Base TypeScript Config (1 hour)**
```typescript
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@web-portal/*": ["packages/web-portal/src/*"],
      "@web-components/*": ["packages/web-components/src/*"]
    }
  }
}
```

**Step 2: Create Package TypeScript Configs (1 hour)**
```bash
# Web Portal tsconfig
cat > packages/web-portal/tsconfig.json <<EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [{"path": "../web-components"}]
}
EOF

# Web Components tsconfig
cat > packages/web-components/tsconfig.json <<EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true
  }
}
EOF
```

**Step 3: Create SWC Configurations (1 hour)**
```json
// packages/web-portal/.swcrc
{
  "jsc": {
    "target": "es2022",
    "parser": {"syntax": "typescript", "tsx": true},
    "transform": {"react": {"runtime": "automatic"}}
  },
  "module": {"type": "es6"},
  "sourceMaps": true
}
```

**Step 4: Create Vite Config (1 hour)**
```typescript
// packages/web-portal/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: { port: 3001 },
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mui: ['@mui/material'],
          charts: ['recharts']
        }
      }
    }
  }
})
```

**Step 5: Create Turbo Config (30 min)**
```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {"cache": false, "persistent": true}
  }
}
```

**Step 6: Add Build Scripts (1 hour)**
```json
// Root package.json
{
  "scripts": {
    "dev": "npm run dev --workspace=web-portal",
    "build": "turbo run build",
    "type-check": "turbo run type-check"
  }
}

// packages/web-portal/package.json
{
  "scripts": {
    "dev": "vite --port 3001",
    "build": "vite build && swc src/server -d dist/server",
    "type-check": "tsc --noEmit"
  }
}

// packages/web-components/package.json
{
  "scripts": {
    "build": "swc src -d dist && tsc --emitDeclarationOnly",
    "dev": "storybook dev -p 6006"
  }
}
```

**Step 7: Install Build Tools (30 min)**
```bash
npm install -D turbo concurrently --workspace-root
npm install -D vite @vitejs/plugin-react-swc --workspace=web-portal
npm install -D @swc/cli @swc/core --workspaces
```

**Step 8: Test Build Pipeline (2 hours)**
```bash
# Type checking
npm run type-check
# Should pass with 0 errors

# Build components first
npm run build --workspace=web-components
# Should create dist/ with .js and .d.ts files

# Build portal
npm run build --workspace=web-portal
# Should create dist/client and dist/server

# Check bundle size
du -sh packages/web-portal/dist/client
# Should be <2MB

# Verify source maps
ls -lh packages/web-portal/dist/client/**/*.map

# Time the build
time npm run build
# Should complete in <30 seconds

# Test dev mode
npm run dev &
# Should start Vite on port 3001
sleep 5
curl http://localhost:3001
pkill -f vite
```

#### Success Criteria
- [ ] TypeScript compiles without errors
- [ ] SWC compiles server code successfully
- [ ] Vite builds React SPA <2MB gzipped
- [ ] Source maps generated
- [ ] Build completes in <30 seconds
- [ ] Dev mode starts with HMR
- [ ] No circular dependencies

---

## Validation Checklist

### Pre-Sprint 1.2 Checklist

#### Structure Validation
```bash
# Directory structure
tree packages/ -L 3
# Expected: web-portal and web-components with all subdirs

# Workspace detection
npm ls --workspaces
# Expected: 2 packages listed

# Package files
test -f packages/web-portal/package.json && echo "✅"
test -f packages/web-components/package.json && echo "✅"
```

#### Dependency Validation
```bash
# Single versions
npm ls react --all | grep -c "react@"
# Expected: 1

npm ls socket.io-client --all | grep -c "socket.io-client@"
# Expected: 1

# No duplicates
npm dedupe --dry-run
# Expected: "already deduped"

# Size reduction
du -sh node_modules/
# Expected: 40% smaller than current
```

#### Build Pipeline Validation
```bash
# Type check
npm run type-check
# Expected: exit 0

# Build all
npm run build
# Expected: both packages build successfully

# Build time
time npm run build
# Expected: <30 seconds

# Bundle size
du -sh packages/web-portal/dist/client
# Expected: <2MB

# Dev server
npm run dev &
sleep 5
curl -I http://localhost:3001
pkill -f vite
# Expected: 200 OK
```

#### Final Acceptance
- [ ] All directories created
- [ ] All package.json files valid
- [ ] Dependencies consolidated (40%+ reduction)
- [ ] No duplicate dependencies
- [ ] TypeScript compilation passes
- [ ] Build pipeline functional
- [ ] Dev mode works with HMR
- [ ] Bundle size <2MB
- [ ] Build time <30s
- [ ] No files migrated (structure only)

---

## Handoff to Sprint 1.2

### Deliverables
1. ✅ Complete packages/ structure (empty, ready for migration)
2. ✅ Unified package.json with dependencies installed
3. ✅ TypeScript configurations (base + package-specific)
4. ✅ SWC build configurations
5. ✅ Vite bundler configuration
6. ✅ Turbo monorepo orchestration
7. ✅ Build scripts tested and documented
8. ✅ Development workflow validated

### Next Sprint Prerequisites
- Workspace structure stable
- Dependencies deduplicated
- Build pipeline tested
- No blocking issues
- Documentation complete

### Migration Readiness
Sprint 1.2 can begin:
1. Component extraction from 8 portals
2. Consolidating 4 agent hierarchy visualizations
3. Unifying 5 WebSocket implementations
4. Merging 3 Express servers

**Status:** ✅ Ready for component migration
