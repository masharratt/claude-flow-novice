# Root Directory Migration Implementation Plan

## Overview

This plan provides a step-by-step implementation for organizing the root directory from 110 files to a clean, maintainable structure with minimal breaking changes.

## Pre-Migration Preparation

### 1. Backup Strategy
```bash
# Create migration branch
git checkout -b feature/root-directory-cleanup

# Create backup of current state
cp -r . ../claude-flow-novice-backup-$(date +%Y%m%d)

# Document current state
find . -maxdepth 1 -type f > current-root-files.txt
```

### 2. Directory Structure Creation
```bash
# Create organized directory structure
mkdir -p docs/{architecture,api,guides,analysis}
mkdir -p tests/{unit,integration,e2e,root}
mkdir -p examples/{cli,api,fullstack}
mkdir -p scripts/{build,test,deployment,utilities}
mkdir -p data/{databases,cache,temp}
mkdir -p logs/{development,production,test}
mkdir -p config/{development,production,testing}
```

## Phase 1: Safe Moves (Low Risk)

### 1.1 Documentation Organization
**Target**: Move 38 documentation files to `docs/`

```bash
# Architecture documentation
mv ARCHITECTURE_DESIGN.md docs/architecture/
mv CLEANUP_ARCHITECTURE_PLAN.md docs/architecture/

# API documentation  
mv api-documentation.md docs/api/
mv api-structure.md docs/api/

# Guides and tutorials
mv WEB_PORTAL_INSTALL.md docs/guides/
mv config_update_instructions.md docs/guides/

# Analysis and reports
mv ROOT_CLEANUP_ANALYSIS.md docs/analysis/
mv ROOT_CLEANUP_ANALYSIS_REPORT.md docs/analysis/
mv BREAKING_CHANGES_ANALYSIS.md docs/analysis/
```

**Files to move to `docs/`:**
- All `.md` files except: `README.md`, `LICENSE`
- Move to appropriate subdirectories based on content

### 1.2 Test Files Organization
**Target**: Move 3 test files to `tests/root/`

```bash
mv advanced.test.js tests/root/
mv math.test.js tests/root/
mv test_quick_tool.test.js tests/root/
```

### 1.3 Example Scripts Organization
**Target**: Move example files to `examples/`

```bash
mv example-usage.js examples/
mv middleware-examples.js examples/
mv route-examples.js examples/
```

## Phase 2: Configuration Updates (Medium Risk)

### 2.1 Update Package.json References
```json
{
  "scripts": {
    "test:root": "NODE_OPTIONS='--experimental-vm-modules' jest tests/root/ --bail --maxWorkers=1",
    "docs:serve": "serve docs/",
    "docs:build": "markdown-cli docs/"
  }
}
```

### 2.2 Update Import Statements
**Search and replace patterns:**
```bash
# Update documentation links
find . -name "*.md" -not -path "./docs/*" -exec sed -i 's|./ARCHITECTURE_DESIGN.md|./docs/architecture/ARCHITECTURE_DESIGN.md|g' {} \;

# Update script references in package.json
sed -i 's|advanced.test.js|tests/root/advanced.test.js|g' package.json
```

### 2.3 Update TypeScript Configuration
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@docs/*": ["docs/*"],
      "@tests/*": ["tests/*"],
      "@examples/*": ["examples/*"]
    }
  }
}
```

## Phase 3: Application Scripts (High Risk)

### 3.1 Utility Scripts Organization
**Target**: Move utility scripts to `scripts/`

```bash
# Build scripts
mv cleanup-verification-script.js scripts/build/

# Test scripts  
mv test-runner.js scripts/test/
mv test-runner.cjs scripts/test/
mv test-agent-compliance.js scripts/test/

# Deployment scripts
mv spawn-workers.cjs scripts/deployment/
mv spawn-workers-enterprise.js scripts/deployment/

# Utility scripts
mv quick-test.js scripts/utilities/
```

### 3.2 Update Script References
**Files requiring updates:**
- `package.json` scripts section
- CLI entry points
- Docker files
- CI/CD configurations

### 3.3 Update CLI Scripts
```bash
# Update shebang lines and file references
sed -i 's|#!/usr/bin/env node|#!/usr/bin/env node\n\n// Updated for root directory cleanup\n|g' scripts/**/*.js
```

## Phase 4: Data and Runtime Files

### 4.1 Database Files Organization
```bash
# Move database files to data/
mv claude-flow.db data/databases/
mv coordinator-registry.db data/databases/
mv test-memory-acl.db data/databases/

# Move related WAL/SHM files
mv test-memory-acl.db-wal data/databases/
mv test-memory-acl.db-shm data/databases/
```

### 4.2 Log Files Organization
```bash
# Move log files to logs/
mv post-edit-pipeline.log logs/development/

# Move test results
mv test-results*.json logs/test/
mv test-fifo-results.txt logs/test/
```

### 4.3 Temporary Files Cleanup
```bash
# Remove temporary files
rm -f dev-server.pid
rm -f output.txt
rm -f test.txt
rm -f *.db-shm
rm -f *.db-wal
```

## Phase 5: Configuration and CI/CD Updates

### 5.1 Docker Configuration Updates
```dockerfile
# Update Dockerfile COPY commands
COPY docs/ ./docs/
COPY scripts/ ./scripts/
COPY tests/ ./tests/
```

### 5.2 GitHub Actions Updates
```yaml
# Update paths in workflow files
- name: Run tests
  run: npm run test:root
  
- name: Build documentation
  run: npm run docs:build
```

### 5.3 ESLint and Prettier Updates
```json
{
  "eslintConfig": {
    "ignorePatterns": [
      "docs/",
      "data/",
      "logs/"
    ]
  }
}
```

## Breaking Changes Mitigation

### 1. Backward Compatibility Layer
Create compatibility scripts for common operations:

```javascript
// scripts/compatibility/legacy-paths.js
export const legacyPaths = {
  'advanced.test.js': 'tests/root/advanced.test.js',
  'example-usage.js': 'examples/example-usage.js',
  'ARCHITECTURE_DESIGN.md': 'docs/architecture/ARCHITECTURE_DESIGN.md'
};
```

### 2. Migration Warnings
Add deprecation warnings for moved files:

```javascript
// scripts/utilities/migration-warnings.js
export function checkLegacyPaths(filePath) {
  const legacyMappings = {
    './advanced.test.js': './tests/root/advanced.test.js'
  };
  
  if (legacyMappings[filePath]) {
    console.warn(`⚠️  Warning: ${filePath} has moved to ${legacyMappings[filePath]}`);
    return legacyMappings[filePath];
  }
  return filePath;
}
```

### 3. Automated Path Updates
Create script to update import statements:

```javascript
// scripts/build/update-imports.js
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const pathMappings = {
  './advanced.test.js': './tests/root/advanced.test.js',
  './example-usage.js': './examples/example-usage.js',
  './ARCHITECTURE_DESIGN.md': './docs/architecture/ARCHITECTURE_DESIGN.md'
};

async function updateImports() {
  const files = await glob('src/**/*.{js,ts}', { ignore: 'node_modules/**' });
  
  for (const file of files) {
    let content = readFileSync(file, 'utf8');
    
    for (const [oldPath, newPath] of Object.entries(pathMappings)) {
      content = content.replace(new RegExp(oldPath.replace('.', '\\.'), 'g'), newPath);
    }
    
    writeFileSync(file, content);
  }
}
```

## Validation Strategy

### 1. Pre-Migration Validation
```bash
# Test current functionality
npm run test
npm run build
npm run lint

# Document current state
npm run test:coverage > coverage-before.txt
```

### 2. Post-Migration Validation
```bash
# Test after each phase
npm run test
npm run build
npm run lint

# Compare coverage
npm run test:coverage > coverage-after.txt
diff coverage-before.txt coverage-after.txt
```

### 3. Integration Testing
```bash
# Test CLI commands
npm run dev
npm run build

# Test examples
npm run fullstack:demo

# Test documentation
npm run docs:build
```

## Rollback Plan

### 1. Quick Rollback
```bash
# If critical issues arise
git checkout main
git branch -D feature/root-directory-cleanup
```

### 2. Selective Rollback
```bash
# Rollback specific changes
git checkout HEAD~1 -- package.json
git checkout HEAD~1 -- scripts/
```

## Success Metrics

### Quantitative Metrics
- **Root file count**: 110 → <20 files
- **Documentation organization**: 100% in `docs/`
- **Test organization**: 100% in `tests/`
- **Build time**: No significant increase
- **Test coverage**: No regression

### Qualitative Metrics
- **Developer feedback**: Improved navigation
- **CI/CD stability**: No pipeline failures
- **Documentation accessibility**: Easier to find relevant docs

## Timeline

### Week 1: Safe Moves
- Day 1-2: Directory structure creation
- Day 3-4: Documentation migration
- Day 5: Test files migration

### Week 2: Configuration Updates
- Day 1-2: Import statement updates
- Day 3-4: Configuration file updates
- Day 5: Testing and validation

### Week 3: Application Scripts
- Day 1-3: Utility scripts migration
- Day 4-5: CLI updates and testing

### Week 4: Final Integration
- Day 1-2: Data files organization
- Day 3-4: CI/CD updates
- Day 5: Final validation and cleanup

## Risk Mitigation

### High Risk Items
1. **Import path updates**: Use automated tools and extensive testing
2. **CLI script references**: Thorough manual testing of all commands
3. **CI/CD pipeline updates**: Test in staging environment first

### Medium Risk Items
1. **Documentation links**: Use automated link checking
2. **Configuration references**: Update all config files systematically

### Low Risk Items
1. **File moves**: Use version control for easy rollback
2. **Directory creation**: No impact on existing functionality

## Post-Migration Maintenance

### 1. Governance Policies
- Root directory should only contain essential project files
- New files must be placed in appropriate directories
- Regular cleanup of temporary files

### 2. Automated Checks
```bash
# Pre-commit hook to prevent root clutter
#!/bin/bash
if [ $(find . -maxdepth 1 -type f | wc -l) -gt 20 ]; then
  echo "❌ Too many files in root directory. Please organize files properly."
  exit 1
fi
```

### 3. Documentation Updates
- Update contribution guidelines
- Document new directory structure
- Provide migration guide for contributors

---

**Implementation Start**: Begin with Phase 1 (Safe Moves) to immediately improve organization while minimizing risk.