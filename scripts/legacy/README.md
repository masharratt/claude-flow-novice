# Legacy Scripts

This directory contains scripts that have been superseded by consolidated versions in Phase 12 cleanup. These scripts are kept for reference, fallback purposes, and historical documentation.

## Purpose

Legacy scripts serve several important functions:

1. **Reference Documentation** - Historical implementation patterns
2. **Fallback Options** - Emergency alternatives if consolidated scripts fail
3. **Migration Assistance** - Understanding changes between versions
4. **Educational Value** - Learning from previous implementations
5. **Debugging Support** - Comparing old vs new behavior

## ⚠️ Important Notice

**These scripts are considered DEPRECATED** and should not be used in normal operations. They are maintained for:
- Emergency fallback scenarios
- Development reference
- Migration troubleshooting
- Historical documentation

For current operations, use the consolidated scripts in the appropriate directories:
- `../build/` - Modern build scripts
- `../test/` - Current testing scripts
- `../dev/` - Active development tools
- `../utils/` - Current utility scripts

## Legacy Script Categories

### Build Scripts (Superseded by `../build/unified-builder.sh`)

#### Build Workarounds
- **`build-workaround.sh`** - Basic build with workarounds
- **`build-with-filter.sh`** - Filtered build output
- **`build-migration.sh`** - Migration-compatible builds
- **`force-build.sh`** - Force build ignoring errors
- **`safe-build.sh`** - Safe build with backups

#### Build Monitoring
- **`build-monitor.js`** - Build process monitoring

**Replacement:** Use `scripts/build/unified-builder.sh [mode]` where mode is one of: workaround, filter, migration, force, safe, monitor

### TypeScript Fix Scripts (Superseded by `../build/typescript-fixer.js`)

#### TypeScript Error Fixes
- **`fix-typescript-errors.js`** - Basic TypeScript error fixes
- **`fix-ts-advanced.js`** - Advanced TypeScript error resolution
- **`fix-ts-final.sh`** - Final TypeScript fix pass
- **`fix-ts-targeted.sh`** - Targeted TypeScript fixes
- **`quick-fix-ts.js`** - Quick TypeScript error fixes
- **`batch-fix-ts.sh`** - Batch TypeScript error processing

**Replacement:** Use `node scripts/build/typescript-fixer.js [strategy]` where strategy is one of: basic, advanced, targeted, quick, batch, all

### Performance Scripts (Superseded by `../build/performance-monitor.js`)

#### Performance Testing
- **`performance-test-runner.js`** - Basic performance test runner
- **`performance-monitor.js`** - Performance monitoring
- **`performance-monitoring.js`** - Extended performance monitoring
- **`optimize-performance.js`** - Performance optimization

**Replacement:** Use `node scripts/build/performance-monitor.js [command]` where command is one of: test, monitor, report, metrics

## Migration Mapping

### Old Script → New Script Mapping

```bash
# Build Scripts
scripts/build-workaround.sh → scripts/build/unified-builder.sh workaround
scripts/build-with-filter.sh → scripts/build/unified-builder.sh filter
scripts/safe-build.sh → scripts/build/unified-builder.sh safe
scripts/force-build.sh → scripts/build/unified-builder.sh force
scripts/build-migration.sh → scripts/build/unified-builder.sh migration
scripts/build-monitor.js → scripts/build/unified-builder.sh monitor

# TypeScript Fixes
scripts/fix-typescript-errors.js → node scripts/build/typescript-fixer.js basic
scripts/fix-ts-advanced.js → node scripts/build/typescript-fixer.js advanced
scripts/quick-fix-ts.js → node scripts/build/typescript-fixer.js quick
scripts/batch-fix-ts.sh → node scripts/build/typescript-fixer.js batch
scripts/fix-ts-targeted.sh → node scripts/build/typescript-fixer.js targeted

# Performance Scripts
scripts/performance-test-runner.js → node scripts/build/performance-monitor.js test
scripts/performance-monitor.js → node scripts/build/performance-monitor.js monitor
scripts/optimize-performance.js → node scripts/build/performance-monitor.js optimize
```

### NPM Script Migration

```json
{
  "scripts": {
    "// OLD SCRIPTS (deprecated)": "//",
    "build:old-workaround": "scripts/legacy/build-workaround.sh",
    "fix:old-typescript": "scripts/legacy/fix-typescript-errors.js",

    "// NEW SCRIPTS (recommended)": "//",
    "build": "scripts/build/unified-builder.sh safe",
    "build:workaround": "scripts/build/unified-builder.sh workaround",
    "fix:typescript": "node scripts/build/typescript-fixer.js"
  }
}
```

## Emergency Usage

### When to Use Legacy Scripts

**Only use legacy scripts in these scenarios:**

1. **Consolidated script failure** - New script has a critical bug
2. **Emergency debugging** - Need to compare old vs new behavior
3. **Rollback scenario** - Need to revert to previous functionality
4. **Development reference** - Understanding how features were implemented

### Safe Usage Pattern

```bash
# 1. Backup current state
git add -A && git commit -m "Pre-legacy-script checkpoint"

# 2. Use legacy script with caution
bash scripts/legacy/build-workaround.sh

# 3. Test results thoroughly
npm test

# 4. Consider migrating to new script
scripts/build/unified-builder.sh workaround
```

## Differences from Modern Scripts

### Functionality Gaps

Legacy scripts may lack:
- **Coordination hooks integration**
- **Enhanced error handling**
- **Comprehensive logging**
- **Parameter validation**
- **Help systems**
- **Dry-run capabilities**
- **Performance optimizations**
- **Security improvements**

### Known Issues

Legacy scripts may have:
- **Deprecated dependencies**
- **Security vulnerabilities**
- **Performance limitations**
- **Limited error recovery**
- **Inconsistent interfaces**
- **Missing documentation**

## Development Value

### Learning Opportunities

Legacy scripts provide insights into:
- **Evolution of build processes**
- **TypeScript error handling approaches**
- **Performance optimization techniques**
- **Script organization patterns**
- **Error handling strategies**

### Code Archaeology

Use legacy scripts to understand:
- **Why certain decisions were made**
- **How problems were solved historically**
- **Evolution of project requirements**
- **Performance optimization history**
- **Testing strategy development**

## Maintenance Policy

### Retention Guidelines

Legacy scripts are retained for:
- **6 months minimum** after replacement
- **Until next major version** release
- **Historical reference** indefinitely
- **Emergency fallback** scenarios

### Update Policy

Legacy scripts are **NOT UPDATED** except for:
- **Critical security vulnerabilities**
- **Emergency compatibility fixes**
- **Documentation corrections**

### Removal Schedule

Legacy scripts may be removed when:
- Consolidated scripts prove stable (6+ months)
- No emergency usage in 1+ year
- Storage optimization required
- Major version upgrade

## Troubleshooting Legacy Scripts

### Common Issues

#### Permission Problems
```bash
# Fix execute permissions
chmod +x scripts/legacy/*.sh
```

#### Dependency Issues
```bash
# Install legacy dependencies
npm install --legacy-peer-deps
```

#### Path Issues
```bash
# Run from project root
cd /path/to/project-root
bash scripts/legacy/script-name.sh
```

#### Environment Issues
```bash
# Set legacy environment
export LEGACY_MODE=true
export NODE_OPTIONS='--legacy-openssl-provider'
```

### Getting Help

If you must use legacy scripts:

1. **Check the modern equivalent first**
2. **Review the migration mapping**
3. **Test in safe environment**
4. **Document the usage reason**
5. **Plan migration to modern scripts**

## Contributing to Legacy

### New Additions

**DO NOT add new scripts to legacy** unless:
- Moving deprecated script from main directories
- Adding emergency fallback for critical functionality
- Documenting historical implementation

### Documentation Updates

When updating legacy documentation:
- Keep historical accuracy
- Note deprecation status clearly
- Provide modern alternatives
- Explain migration path

## Related Documentation

- **Phase 12 Cleanup Report** - Details of consolidation process
- **Migration Guide** - How to migrate from legacy to modern scripts
- **Troubleshooting Guide** - Common issues and solutions
- **Development History** - Evolution of the script ecosystem

---

**Remember: Legacy scripts are for reference and emergency use only. Always prefer the modern consolidated scripts in the appropriate category directories.**