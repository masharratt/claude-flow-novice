# Claude Flow Novice Cleanup Architecture Plan

## 🎯 Mission Statement
Design optimal directory structure for 102+ root files, minimizing breaking changes while maximizing maintainability.

## 📊 Current State Analysis

### Root Directory Composition (102 files)
- **Essential Files**: 12 (must remain in root)
- **Test Files**: 15+ (*.test.js, test-*.js, test results)
- **Database Files**: 7 (*.db, *.db-shm, *.db-wal)
- **Documentation**: 20+ (*.md analysis files)
- **Scripts**: 10+ (spawn-*.js, utilities, runners)
- **Configuration**: 8+ (config files, templates)
- **Build/Temp**: 15+ (logs, cache, artifacts)
- **Symlinks**: 3 (database links)

## 🏗️ Proposed Architecture

### New Directory Structure
```
claude-flow-novice/
├── 📁 docs/
│   ├── architecture/          # Architecture & design docs
│   ├── api/                   # API documentation
│   ├── guides/                # User guides & tutorials
│   ├── reports/               # Analysis & status reports
│   └── research/              # Research findings
├── 📁 tests/
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   ├── e2e/                   # End-to-end tests
│   ├── fixtures/              # Test data & fixtures
│   ├── results/               # Test outputs & reports
│   └── temp/                  # Temporary test files
├── 📁 scripts/
│   ├── utilities/             # Utility scripts
│   ├── build/                 # Build automation
│   ├── deployment/            # Deployment scripts
│   ├── testing/               # Test runners & utilities
│   └── migration/             # Migration tools
├── 📁 config/
│   ├── development/           # Development configs
│   ├── production/            # Production configs
│   ├── templates/             # Configuration templates
│   └── ci/                    # CI/CD configurations
├── 📁 database/
│   ├── production/            # Production databases
│   ├── development/           # Development databases
│   ├── test/                  # Test databases
│   └── temp/                  # Temporary databases
├── 📁 temp/
│   ├── logs/                  # Log files
│   ├── cache/                 # Cache files
│   ├── build/                 # Build artifacts
│   └── runtime/               # Runtime temporary files
├── 📁 analysis/               # Existing analysis directory
├── 📁 examples/               # Existing examples
├── 📁 src/                    # Existing source
├── 📁 dist/                   # Existing distribution
└── 📄 [12 Essential Root Files]
```

### Files to Keep in Root (Justified)
1. **package.json** - NPM project definition (required)
2. **package-lock.json** - Dependency lock file (required)
3. **README.md** - Project overview (convention)
4. **CLAUDE.md** - Primary documentation (project-specific)
5. **LICENSE** - Legal information (required)
6. **.gitignore** - Git exclusions (required)
7. **.env** - Environment variables (common practice)
8. **tsconfig.json** - TypeScript config (project root convention)
9. **vitest.config.ts** - Test config (project root convention)
10. **jest.config.cjs** - Test config (project root convention)
11. **Dockerfile** - Container definition (root convention)
12. **docker-compose.yml** - Orchestration (root convention)

## 📋 File Migration Plan

### Phase 1: Documentation Migration (Low Risk)
**Files to Move:**
- `*.md` files (except README.md, CLAUDE.md) → `docs/` subdirs
- `api-documentation.md` → `docs/api/`
- `api-structure.md` → `docs/api/`
- `coordination.md` → `docs/guides/`
- `memory-bank.md` → `docs/guides/`

**Organization Rules:**
- Analysis reports → `docs/reports/`
- Architecture docs → `docs/architecture/`
- API docs → `docs/api/`
- Guides → `docs/guides/`

### Phase 2: Test File Migration (Medium Risk)
**Files to Move:**
- `*.test.js` → `tests/unit/` or `tests/integration/`
- `test-*.js` files → `scripts/testing/`
- Test result files → `tests/results/`
- Test databases → `database/test/`

**Breaking Changes:**
- Update import paths in test files
- Modify test runner configurations
- Update package.json test script paths

### Phase 3: Script Migration (Medium Risk)
**Files to Move:**
- `spawn-*.js` → `scripts/utilities/`
- `coordinator-runner.cjs` → `scripts/deployment/`
- `test-runner.cjs` → `scripts/testing/`
- `validate-*.mjs` → `scripts/testing/`
- Utility scripts → `scripts/utilities/`

**Breaking Changes:**
- Update script import paths
- Modify executable permissions
- Update package.json script references

### Phase 4: Configuration Migration (Low Risk)
**Files to Move:**
- `.env.keys` → `config/templates/`
- `.env.secure.template` → `config/templates/`
- `claude-flow.config.json` → `config/development/`
- Build configs → `config/build/`

**Breaking Changes:**
- Update config loading paths
- Modify environment variable references

### Phase 5: Database Migration (High Risk)
**Files to Move:**
- `*.db` files → `database/development/`
- `*.db-shm`, `*.db-wal` → `database/development/`
- `coordinator-registry.db` → `database/production/`

**Breaking Changes:**
- Update database connection strings
- Modify application database paths
- Handle symlink references

### Phase 6: Temporary File Migration (Low Risk)
**Files to Move:**
- Log files → `temp/logs/`
- Cache files → `temp/cache/`
- Build artifacts → `temp/build/`
- Runtime temp files → `temp/runtime/`

## 🔧 Required Code Updates

### Import Path Updates
```javascript
// Before
import { spawnWorkers } from './spawn-workers.cjs';
import { testRunner } from './test-runner.cjs';

// After
import { spawnWorkers } from './scripts/utilities/spawn-workers.cjs';
import { testRunner } from './scripts/testing/test-runner.cjs';
```

### Database Path Updates
```javascript
// Before
const db = new Database('./coordinator-registry.db');

// After
const db = new Database('./database/production/coordinator-registry.db');
```

### Configuration Updates
```javascript
// Before
const config = loadConfig('./claude-flow.config.json');

// After
const config = loadConfig('./config/development/claude-flow.config.json');
```

### Package.json Script Updates
```json
{
  "scripts": {
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest tests/ --bail --maxWorkers=1",
    "spawn:workers": "node scripts/utilities/spawn-workers.cjs",
    "validate": "node scripts/testing/validate-section4.mjs"
  }
}
```

## ⚠️ Risk Assessment

### High Risk Items
1. **Database file relocation** - May break running applications
2. **Symlink dependencies** - `swarm-memory.db` symlinks need careful handling
3. **Hardcoded paths in scripts** - Multiple scripts with absolute/relative paths
4. **Test import dependencies** - Complex test file relationships

### Medium Risk Items
1. **Script interdependencies** - Scripts importing other scripts
2. **Configuration loading** - Apps expecting specific config locations
3. **Build tool paths** - Tools with hardcoded file locations

### Low Risk Items
1. **Documentation files** - No code dependencies
2. **Example files** - Self-contained
3. **Temporary files** - No production impact

## 🚀 Migration Implementation Strategy

### Pre-Migration Preparation
1. **Create backup** of entire project
2. **Generate file dependency map** using static analysis
3. **Create automated migration script** with rollback capability
4. **Set up validation testing** for each phase

### Migration Execution
1. **Phase-based approach** with validation after each phase
2. **Automated testing** to ensure no regressions
3. **Rollback capability** for each phase
4. **Documentation updates** throughout process

### Post-Migration Validation
1. **Comprehensive test suite** execution
2. **Build process validation**
3. **Application functionality testing**
4. **Performance benchmarking**

## 📈 Success Metrics

### Quantitative Goals
- **Root file count**: Reduce from 102 to < 20 files
- **Test pass rate**: 100% after migration
- **Build success**: Zero build errors
- **Import resolution**: 100% of imports resolve correctly

### Qualitative Goals
- **Developer experience**: Improved project navigation
- **Maintainability**: Clear separation of concerns
- **Onboarding**: Easier for new developers
- **Standards compliance**: Follow Node.js conventions

## 🔄 Rollback Plan

### Phase-level Rollback
1. **Automated restore** from backup for each phase
2. **Git revert** commits if needed
3. **Configuration restoration** to original state
4. **Database restoration** from backups

### Complete Rollback
1. **Full Git reset** to pre-migration state
2. **Database restoration** from complete backup
3. **Configuration verification** and restoration
4. **Testing validation** of rollback success

## 📝 Next Steps

1. **Detailed file inventory** with dependency mapping
2. **Automated migration script** development
3. **Comprehensive test suite** for validation
4. **Stakeholder approval** of migration plan
5. **Scheduled migration execution** with minimal downtime

---

**Architecture designed by Claude Flow Novice Architect Agent**  
**Impact Score: High** - Significant improvement in project organization  
**Risk Level: Medium** - Managed through phased approach with rollback capability