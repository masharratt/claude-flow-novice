# Migration Plan: claude-flow-novice v2.0 Clean Break

**⚠️ OBSOLETE:** This migration plan was superseded by Skills-First Architecture (Phase 8 - 2025-10-18)

**Actual Strategy Used:** Skills-based modular architecture instead of monolithic file migration

**For Current Status:** See `MIGRATION_PROGRESS.md` and `SKILLS_AUDIT.md`

---

## ORIGINAL PLAN (NOT EXECUTED)

**Strategy:** Archive current codebase as v1, start fresh v2 in same repo, selectively migrate needed files.

**Goal:** Clean architecture with zero TypeScript errors, while preserving git history and npm continuity.

---

## Phase 1: Archive Current Codebase (30 minutes)

### 1.1 Create Archive Branch
```bash
# Create permanent archive branch for v1
git checkout -b archive/v1-legacy
git push origin archive/v1-legacy

# Tag current state
git tag v1.9.9-final
git push origin v1.9.9-final
```

### 1.2 Move Files to Legacy Directory
```bash
# Back to main
git checkout main

# Create legacy archive directory
mkdir -p legacy/v1

# Move everything except .git and new structure
mv src legacy/v1/src
mv dist legacy/v1/dist
mv tests legacy/v1/tests
mv examples legacy/v1/examples
mv scripts legacy/v1/scripts
mv config legacy/v1/config

# Move docs (keep some for reference)
mv docs legacy/v1/docs
mv readme legacy/v1/readme

# Move config files
cp package.json legacy/v1/package.json.backup
cp tsconfig.json legacy/v1/
cp .swcrc legacy/v1/
cp jest.config.js legacy/v1/

# Commit archive
git add legacy/
git commit -m "chore: Archive v1 codebase to legacy/v1/"
```

### 1.3 Keep `.claude/` Assets (Migrate Later)
```bash
# Don't move .claude/ yet - we'll cherry-pick from it
# Keep: .claude/agents, .claude/commands, .claude/skills
```

---

## Phase 2: Create Clean v2 Structure (1-2 hours)

### 2.1 New Directory Structure
```
claude-flow-novice/
├── src/
│   ├── core/              # Core engine (clean slate)
│   ├── cli/               # CLI interface
│   ├── agents/            # Agent system
│   ├── coordination/      # Redis coordination
│   ├── memory/            # SQLite memory
│   ├── cfn-loop/          # CFN loop orchestration
│   └── types/             # Shared TypeScript types
├── dist/                  # Built files
├── tests/                 # New test suite
├── examples/              # Clean examples only
├── scripts/               # Build/utility scripts
├── .claude/               # Migrated agent configs
└── legacy/
    └── v1/                # Archived v1 code (reference only)
```

### 2.2 Create Minimal v2 Foundation
```bash
# Create new source structure
mkdir -p src/{core,cli,agents,coordination,memory,cfn-loop,types}
mkdir -p tests examples scripts

# Create index files
cat > src/index.ts << 'EOF'
/**
 * Claude Flow Novice v2.0
 * Clean architecture rebuild
 */

export * from './core/index.js';
export * from './agents/index.js';
export * from './coordination/index.js';
export * from './memory/index.js';
export * from './cfn-loop/index.js';
EOF

cat > src/core/index.ts << 'EOF'
/**
 * Core Engine - v2.0
 */

export const VERSION = '2.0.0';

console.log('Claude Flow Novice v2.0 - Clean Architecture');
EOF

cat > src/cli/index.ts << 'EOF'
#!/usr/bin/env node
/**
 * CLI Entry Point - v2.0
 */

import { VERSION } from '../core/index.js';

console.log(`Claude Flow Novice CLI v${VERSION}`);
EOF
```

### 2.3 Create New package.json
```bash
cat > package.json << 'EOF'
{
  "name": "claude-flow-novice",
  "version": "2.0.0",
  "description": "AI agent orchestration - Clean v2 architecture",
  "main": "dist/src/index.js",
  "type": "module",
  "bin": {
    "claude-flow-novice": "dist/src/cli/index.js"
  },
  "scripts": {
    "dev": "tsx src/cli/index.ts",
    "build": "npm run clean && npm run build:swc",
    "build:swc": "swc src -d dist --config-file .swcrc",
    "clean": "rm -rf dist",
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "redis": "^5.8.3",
    "better-sqlite3": "^12.4.1",
    "commander": "^11.1.0",
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "@swc/cli": "^0.1.62",
    "@swc/core": "^1.3.0",
    "typescript": "^5.6.3",
    "tsx": "^4.7.0",
    "jest": "^29.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
```

### 2.4 Create Minimal TypeScript Config
```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "legacy"]
}
EOF
```

### 2.5 Verify Clean Build
```bash
npm install
npm run build
node dist/src/cli/index.js

# Should output: "Claude Flow Novice CLI v2.0.0"
# Zero TypeScript errors!
```

---

## Phase 3: Selective File Migration (1-2 weeks)

### 3.1 Migration Priority List

#### **Tier 1: Must Migrate (Week 1)**
Files that are core to functionality:

**From `legacy/v1/src/`:**
```
✅ coordination/
  - redis-coordinator.ts         # Redis coordination core
  - coordination-types.ts         # Type definitions

✅ memory/
  - sqlite-memory-system.ts       # SQLite memory core
  - memory-adapter.ts             # ACL system

✅ cli/
  - command-registry.ts           # Command system
  - cli-core.ts                   # Base CLI

✅ agents/
  - agent-loader.ts               # Agent discovery
  - agent-registry.ts             # Agent management

✅ cfn-loop/
  - cfn-loop-orchestrator.ts      # Main CFN engine
  - consensus-validator.ts        # Consensus logic
```

**From `legacy/v1/.claude/`:**
```
✅ agents/cfn-loop/               # CFN coordinators (3 files)
✅ agents/core-agents/            # Core agents (coordinator, coder, etc.)
✅ commands/                      # All slash commands
✅ skills/                        # Skill definitions
✅ cfn-loop-rules.md             # CFN documentation
✅ ace-system-overview.md        # ACE system docs
```

#### **Tier 2: Consider Migrating (Week 2)**
Files that add value but need review:

```
⚠️  verification/                # If you use validation
⚠️  providers/                   # If you use LLM providers
⚠️  communication/               # If you use message bus
⚠️  workflows/                   # If you use workflow orchestration
⚠️  automation/                  # If you use automation hooks
```

#### **Tier 3: Don't Migrate**
Confirmed deprecated/unused:

```
❌ src/mcp/                      # Deprecated MCP
❌ src/swarm/                    # Deprecated swarm
❌ src/neural/                   # Likely unused ML code
❌ src/maestro/                  # Likely unused orchestrator
❌ src/ci-cd/                    # Likely unused CI/CD
❌ src/topology/                 # Likely unused topology
```

### 3.2 Migration Process (Per File)

```bash
# For each file to migrate:

# 1. Copy from legacy
cp legacy/v1/src/coordination/redis-coordinator.ts src/coordination/

# 2. Fix imports (add .js extensions)
# Update: import { foo } from './bar'
# To:     import { foo } from './bar.js'

# 3. Fix TypeScript errors
npm run typecheck
# Fix any errors before committing

# 4. Test
npm run build
npm test

# 5. Commit
git add src/coordination/redis-coordinator.ts
git commit -m "feat(coordination): Migrate redis-coordinator from v1

Migrated from legacy/v1/src/coordination/redis-coordinator.ts
- Fixed import paths for ES modules
- Updated TypeScript types
- Zero errors in strict mode"
```

### 3.3 Migration Tracking

Create `MIGRATION_STATUS.md`:
```markdown
# Migration Status: v1 → v2

## Tier 1 (Must Have)
- [x] coordination/redis-coordinator.ts
- [ ] coordination/coordination-types.ts
- [ ] memory/sqlite-memory-system.ts
- [ ] memory/memory-adapter.ts
- [ ] cli/command-registry.ts
- [ ] cli/cli-core.ts
- [ ] agents/agent-loader.ts
- [ ] agents/agent-registry.ts
- [ ] cfn-loop/cfn-loop-orchestrator.ts
- [ ] cfn-loop/consensus-validator.ts

## .claude Assets
- [ ] agents/cfn-loop/ (3 files)
- [ ] agents/core-agents/ (10 files)
- [ ] commands/ (30 files)
- [ ] skills/ (15 files)
- [ ] cfn-loop-rules.md
- [ ] ace-system-overview.md

## Tier 2 (Optional)
- [ ] verification/
- [ ] providers/
- [ ] communication/
```

---

## Phase 4: Update Documentation (2-3 days)

### 4.1 Update README.md
```markdown
# Claude Flow Novice v2.0

**Complete rebuild with clean architecture and zero TypeScript errors.**

## What's New in v2.0

- ✅ **Clean codebase** - Only essential files, zero legacy bloat
- ✅ **Zero TypeScript errors** - Full type safety in strict mode
- ✅ **Modern ES modules** - Pure ESM, no CommonJS baggage
- ✅ **Improved performance** - Streamlined architecture
- ✅ **Better documentation** - Clear, focused guides

## Migrating from v1.x

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

Legacy v1 code is preserved in `legacy/v1/` and the `archive/v1-legacy` branch.
```

### 4.2 Create MIGRATION_GUIDE.md
```markdown
# Migrating from v1 to v2

## Breaking Changes

### Import Paths
```typescript
// v1 (deprecated)
import { MCPServer } from 'claude-flow-novice/mcp';

// v2 (current)
import { ClaudeFlow } from 'claude-flow-novice';
```

### CLI Commands
```bash
# v1 (deprecated)
claude-flow-novice mcp:start

# v2 (current)
claude-flow-novice start
```

## Legacy Code Access

If you need v1 functionality:
1. Install v1: `npm install claude-flow-novice@1.9.9`
2. Or access legacy code in `legacy/v1/` directory
```

### 4.3 Update CLAUDE.md
```markdown
# Claude Flow Novice v2.0 - Clean Architecture

**Note:** This is a complete v2 rebuild. Legacy v1 code is in `legacy/v1/`.

## Core Principles (v2)

1. **Zero TypeScript errors** - All code passes strict type checking
2. **Essential files only** - No unused/deprecated code
3. **Modern ES modules** - Pure ESM architecture
4. **Redis coordination** - Distributed agent coordination
5. **SQLite memory** - Persistent agent memory with ACL
6. **CFN Loop** - Self-correcting agent orchestration
```

---

## Phase 5: Testing & Validation (1 week)

### 5.1 Test Checklist
```bash
# Build
npm run build
# ✓ Should succeed with 0 errors

# TypeScript
npm run typecheck
# ✓ Should show 0 errors

# Tests
npm test
# ✓ All tests pass

# CLI
claude-flow-novice --version
# ✓ Should show v2.0.0

# Integration tests
npm run test:integration
# ✓ Core workflows work
```

### 5.2 Size Comparison
```bash
# v1 size
du -sh legacy/v1/
# Expected: ~500MB

# v2 size
du -sh src/
# Expected: ~50-100MB (90% reduction)

# TypeScript errors
echo "v1: 6056 errors"
npm run typecheck 2>&1 | grep error | wc -l
echo "v2: 0 errors (target)"
```

---

## Phase 6: Publishing (1 day)

### 6.1 Prepare for Release
```bash
# Update version
npm version 2.0.0 --no-git-tag-version

# Build
npm run build

# Test one more time
npm test

# Create git tag
git add -A
git commit -m "release: v2.0.0 - Clean architecture rebuild

Breaking Changes:
- Complete codebase restructure
- Legacy v1 archived to legacy/v1/
- Zero TypeScript errors
- Modern ES modules only
- See MIGRATION_GUIDE.md for upgrade path"

git tag v2.0.0
git push origin main
git push origin v2.0.0
```

### 6.2 Publish to npm
```bash
# Dry run first
npm publish --dry-run

# Verify package contents
tar -tzf $(npm pack) | less

# Publish
npm publish

# Verify
npm info claude-flow-novice
# Should show v2.0.0
```

### 6.3 Update GitHub Release
```markdown
# v2.0.0 - Clean Architecture Rebuild

## 🎉 Complete v2 Rewrite

This is a **breaking change** release with a complete codebase rebuild.

### ✨ What's New
- ✅ Zero TypeScript errors (down from 6,056)
- ✅ 90% smaller codebase (essential files only)
- ✅ Modern ES modules architecture
- ✅ Improved performance and maintainability

### 💥 Breaking Changes
- All import paths updated
- CLI command changes
- See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

### 📦 Legacy v1 Access
- Legacy code: `legacy/v1/` directory
- Legacy branch: `archive/v1-legacy`
- Last v1 release: `v1.9.9-final`

### 📚 Documentation
- [README.md](./README.md) - Getting started
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Upgrade guide
- [CLAUDE.md](./CLAUDE.md) - AI agent instructions
```

---

## Timeline Summary

| Phase | Duration | Description |
|-------|----------|-------------|
| **Phase 1** | 30 min | Archive v1 to legacy/ |
| **Phase 2** | 1-2 hours | Create v2 foundation |
| **Phase 3** | 1-2 weeks | Migrate essential files |
| **Phase 4** | 2-3 days | Update documentation |
| **Phase 5** | 1 week | Testing & validation |
| **Phase 6** | 1 day | Publishing |
| **TOTAL** | **2-3 weeks** | Complete migration |

---

## Success Metrics

### Before (v1)
- 1,485 source files
- 618 files with TypeScript errors
- 6,056 total TypeScript errors
- 2.4GB repo size
- 558 distributed but unused files

### After (v2)
- ~100-200 source files (target)
- 0 files with TypeScript errors (target)
- 0 total TypeScript errors (target)
- ~500MB repo size (target)
- 0 unused files (target)

**Improvement:** 90% code reduction, 100% error elimination

---

## Rollback Plan

If v2 launch fails:

```bash
# Revert to v1
git checkout v1.9.9-final

# Or use legacy code
cp -r legacy/v1/src src
cp legacy/v1/package.json.backup package.json
npm install
npm run build

# Publish v1.9.10 hotfix
npm version 1.9.10
npm publish
```

---

## Next Steps

1. **Review this plan** - Discuss any concerns
2. **Start Phase 1** - Archive current codebase (30 min)
3. **Start Phase 2** - Create v2 foundation (1-2 hours)
4. **Begin migration** - Move files incrementally (1-2 weeks)

**Ready to proceed?** Let's start with Phase 1!
