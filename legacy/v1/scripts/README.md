# Scripts Organization - Phase 13 Advanced Categorization

This document describes the advanced script organization structure after Phase 13 clean categorization.

## Directory Structure

```
scripts/
├── build/          # Build operations & TypeScript fixes
├── test/           # Testing, validation & performance testing
├── dev/            # Development utilities & SPARC framework
├── utils/          # Code fixes, cleanup & maintenance utilities
├── security/       # Security validation & audit tools
├── migration/      # Installation, upgrades & data migration
├── legacy/         # Superseded scripts (kept for reference)
└── README.md       # This documentation
```

## Script Categories

### Build Operations (`scripts/build/`)
**Purpose:** Production builds, TypeScript fixes, and performance monitoring

**Key Scripts:**
- **`unified-builder.sh`** - Universal build script with multiple modes (safe, workaround, filter, force, migration, clean, monitor)
- **`typescript-fixer.js`** - Comprehensive TypeScript error resolution with strategies (basic, advanced, targeted, quick, batch, all)
- **`performance-monitor.js`** - Build performance testing and monitoring (test, monitor, report, metrics)
- **`build-config.js`** - Build configuration and environment setup
- **`prepare-publish.js`** - NPM package publishing preparation
- **`update-bin-version.js`** - Binary version management

**Quick Usage:**
```bash
npm run build                    # Safe build with backup
npm run build:workaround         # Build with workarounds
npm run fix:typescript          # Fix TypeScript errors
npm run test:performance:basic  # Run basic performance tests
```

### Testing & Validation (`scripts/test/`)
**Purpose:** Comprehensive testing, validation, and quality assurance

**Key Scripts:**
- **`test-runner.ts`** - Universal test orchestration
- **`test-comprehensive.js`** - Full system testing suite
- **`load-test-swarm.js`** - High-load swarm testing
- **`coverage-report.ts`** - Test coverage analysis
- **`validation-summary.ts`** - Comprehensive validation reports
- **`check-performance-regression.ts`** - Performance regression detection

**Quick Usage:**
```bash
npm test                        # Run all tests
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests
npm run test:coverage          # Generate coverage reports
```

### Development Utilities (`scripts/dev/`)
**Purpose:** Development tools, SPARC framework, and portal management

**Key Scripts:**
- **`claude-sparc.sh`** - SPARC development framework (spec-pseudocode, architect, tdd, integration)
- **`start-portal.sh`** / **`stop-portal.sh`** - Development portal management
- **`claude-monitor.py`** - Real-time development monitoring
- **`validate-examples.ts`** - Example code validation
- **`deployment-validator.js`** - Deployment readiness validation

**Quick Usage:**
```bash
scripts/dev/claude-sparc.sh spec-pseudocode "Feature specification"
scripts/dev/start-portal.sh    # Start development portal
npm run dev                    # Start development mode
```

### Utility Scripts (`scripts/utils/`)
**Purpose:** Code fixes, cleanup, and maintenance utilities

**Key Scripts:**
- **`fix-import-paths.js`** - Import path corrections
- **`fix-typescript-comprehensive.py`** - Comprehensive TypeScript fixes
- **`clean-build-artifacts.sh`** - Build artifact cleanup
- **`fix-duplicate-imports.js`** - Remove duplicate imports
- **`simple-test-fixer.js`** - Simple test corrections

**Quick Usage:**
```bash
node scripts/utils/fix-import-paths.js    # Fix import issues
bash scripts/utils/clean-build-artifacts.sh    # Clean artifacts
npm run clean                             # Full cleanup
```

### Security (`scripts/security/`)
**Purpose:** Security validation, audit tools, and safety mechanisms

**Key Scripts:**
- **`ruv-swarm-safe.js`** - Swarm safety validator with audit capabilities

**Quick Usage:**
```bash
node scripts/security/ruv-swarm-safe.js --audit    # Security audit
npm run security:validate                         # Security validation
```

### Migration (`scripts/migration/`)
**Purpose:** Installation, upgrades, and data migration

**Key Scripts:**
- **`install.js`** - Primary installation script
- **`install-arm64.js`** - ARM64 architecture installation
- **`migrate-hooks.js`** - Hooks and coordination data migration
- **`migration-examples.ts`** - Migration templates and examples

**Quick Usage:**
```bash
node scripts/migration/install.js --production    # Production installation
node scripts/migration/migrate-hooks.js          # Migrate hooks data
npm run migrate                                   # Run migrations
```

## Package.json Integration

The consolidated scripts are integrated into package.json:

```json
{
  "scripts": {
    // Build operations
    "build": "scripts/build/unified-builder.sh safe",
    "build:workaround": "scripts/build/unified-builder.sh workaround",
    "build:force": "scripts/build/unified-builder.sh force",
    "build:monitor": "scripts/build/unified-builder.sh monitor",

    // TypeScript fixes
    "fix:typescript": "node scripts/build/typescript-fixer.js",
    "fix:typescript:basic": "node scripts/build/typescript-fixer.js basic",
    "fix:typescript:advanced": "node scripts/build/typescript-fixer.js advanced",
    "fix:typescript:quick": "node scripts/build/typescript-fixer.js quick",

    // Performance testing
    "test:performance:basic": "node scripts/build/performance-monitor.js test basic",
    "test:performance:load": "node scripts/build/performance-monitor.js test load",
    "test:performance:stress": "node scripts/build/performance-monitor.js test stress",
    "performance:monitor": "node scripts/build/performance-monitor.js monitor",
    "performance:report": "node scripts/build/performance-monitor.js report"
  }
}
```

## Directory Details

### `scripts/build/` - Production Build Scripts
**Purpose:** Mission-critical build operations
**Contents:** 3 consolidated scripts replacing 15+ originals
- All scripts are production-ready with error handling
- Comprehensive logging and reporting
- Coordination hooks integration
- Parameter validation and help systems

### `scripts/test/` - Test Scripts
**Purpose:** Test automation and validation
**Contents:** Test runners, validators, and automation scripts
- Moved from root to organized location
- Maintains existing functionality

### `scripts/dev/` - Development Scripts
**Purpose:** Development utilities and tools
**Contents:** Validation scripts, demo runners, deployment tools
- Developer productivity tools
- Non-production utilities

### `scripts/utils/` - General Utilities
**Purpose:** Cleanup and maintenance utilities
**Contents:** Cleanup scripts, maintenance tools
- Repository maintenance
- General utility functions

### `scripts/legacy/` - Superseded Scripts
**Purpose:** Reference and fallback scripts
**Contents:** Original scripts replaced by consolidation
**Note:** These scripts are kept for:
- Reference during transition period
- Fallback if consolidated versions have issues
- Historical documentation
- Emergency recovery scenarios

## Phase 13 Advanced Categorization Benefits

### 1. Logical Organization
- **67+ scripts** organized into 7 logical categories
- **Clear separation** of concerns by functionality
- **Easy navigation** with category-specific directories
- **Reduced cognitive load** for developers

### 2. Enhanced Discoverability
- **Category-specific README files** with detailed documentation
- **Clear usage patterns** for each script category
- **Quick reference guides** for common operations
- **Integrated help systems** across all categories

### 3. Improved Maintainability
- **Centralized scripts** by functional area
- **Consistent interfaces** within each category
- **Standardized documentation** across all categories
- **Clear migration paths** from legacy scripts

### 4. Security & Safety
- **Dedicated security category** for audit and validation
- **Migration tools** for safe upgrades and installations
- **Legacy preservation** for emergency fallback
- **Comprehensive testing** infrastructure

### 5. Developer Experience
- **SPARC development framework** integration
- **Development portal** for interactive workflows
- **Performance monitoring** and optimization tools
- **Automated validation** and compliance checking

## Migration Guide

### Script Location Changes (Phase 13)

#### Root → Build Category
```bash
# Build and publishing scripts moved to scripts/build/
scripts/build-config.js → scripts/build/build-config.js
scripts/build-prompt-copier.sh → scripts/build/build-prompt-copier.sh
scripts/prepare-publish.js → scripts/build/prepare-publish.js
scripts/update-bin-version.js → scripts/build/update-bin-version.js
```

#### Root → Test Category
```bash
# Testing and validation scripts moved to scripts/test/
scripts/check-links.ts → scripts/test/check-links.ts
scripts/coverage-report.ts → scripts/test/coverage-report.ts
scripts/generate-swarm-tests.js → scripts/test/generate-swarm-tests.js
scripts/load-test-swarm.js → scripts/test/load-test-swarm.js
scripts/validation-summary.ts → scripts/test/validation-summary.ts
```

#### Root → Development Category
```bash
# Development tools moved to scripts/dev/
scripts/claude-flow-wrapper.sh → scripts/dev/claude-flow-wrapper.sh
scripts/claude-monitor.py → scripts/dev/claude-monitor.py
scripts/claude-sparc.sh → scripts/dev/claude-sparc.sh
scripts/start-portal.sh → scripts/dev/start-portal.sh
scripts/stop-portal.sh → scripts/dev/stop-portal.sh
```

#### Root → Utilities Category
```bash
# Fix and utility scripts moved to scripts/utils/
scripts/fix-import-paths.js → scripts/utils/fix-import-paths.js
scripts/fix-typescript-comprehensive.py → scripts/utils/fix-typescript-comprehensive.py
scripts/simple-test-fixer.js → scripts/utils/simple-test-fixer.js
```

#### Root → Security Category
```bash
# Security scripts moved to scripts/security/
scripts/ruv-swarm-safe.js → scripts/security/ruv-swarm-safe.js
```

#### Root → Migration Category
```bash
# Installation and migration scripts moved to scripts/migration/
scripts/install.js → scripts/migration/install.js
scripts/install-arm64.js → scripts/migration/install-arm64.js
scripts/migrate-hooks.js → scripts/migration/migrate-hooks.js
scripts/migration-examples.ts → scripts/migration/migration-examples.ts
```

### Legacy Script Mappings
For scripts that were consolidated in Phase 12, see the legacy mapping:

```bash
# Consolidated build scripts (now in scripts/legacy/)
scripts/build-workaround.sh → scripts/build/unified-builder.sh workaround
scripts/safe-build.sh → scripts/build/unified-builder.sh safe
scripts/fix-typescript-errors.js → node scripts/build/typescript-fixer.js basic
scripts/performance-test-runner.js → node scripts/build/performance-monitor.js test
```

### Using npm Scripts
Preferred method is to use the integrated npm scripts:

```bash
# Instead of running scripts directly, use npm:
npm run build                    # Safe build with backup
npm run build:workaround         # Build with workarounds
npm run fix:typescript          # Fix TypeScript errors
npm run test:performance:basic  # Run basic performance tests
npm run performance:monitor     # Start performance monitoring
```

## Coordination Integration

All consolidated scripts include coordination hooks:

1. **Pre-task hooks:** Initialize coordination context
2. **Post-edit hooks:** Report file changes to swarm memory
3. **Task completion hooks:** Update coordination status
4. **Session management:** Persist state across operations

This ensures the scripts work seamlessly with the Phase 12 cleanup coordination system.

## Troubleshooting

### Script Not Found
If you get "script not found" errors:
1. Check the script is executable: `chmod +x scripts/build/script-name`
2. Use absolute paths or run from project root
3. For shell scripts, try: `bash scripts/build/script-name.sh`

### Legacy Script Access
If you need to access a legacy script temporarily:
```bash
# Legacy scripts are in scripts/legacy/
bash scripts/legacy/original-script-name.sh
```

### Windows Line Ending Issues
If you encounter line ending errors:
```bash
# Fix line endings manually
tr -d '\r' < script-name.sh > script-name-fixed.sh
mv script-name-fixed.sh script-name.sh
```

---

**Phase 13 Advanced Script Categorization Complete**
**Organization:** 67+ scripts organized into 7 logical categories
**Structure:** 6 functional directories + 1 legacy directory
**Documentation:** Category-specific README files with comprehensive usage guides
**Benefits:** Enhanced discoverability, improved maintainability, logical organization
**Date:** September 26, 2025