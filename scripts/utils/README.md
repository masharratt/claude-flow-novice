# Utility Scripts

This directory contains general utility scripts for maintenance, fixes, and system operations.

## Scripts

### Code Fixing Utilities

#### Import & Module Fixes
- **`fix-import-paths.js`** - Fixes import path issues across the codebase
- **`fix-imports.js`** - General import statement fixes and optimizations
- **`fix-duplicate-imports.js`** - Removes duplicate import statements
- **`fix-cliffy-imports.js`** - Fixes specific Cliffy CLI library import issues

#### TypeScript Fixes
- **`fix-ts-comprehensive.py`** - Comprehensive TypeScript error resolution
- **`fix-ts-targeted-batch.js`** - Targeted TypeScript fixes in batches
- **`fix-test-modules.js`** - Fixes test module imports and configurations

#### General Code Fixes
- **`fix-shebang.js`** - Fixes shebang lines in script files
- **`fix-error-handling.cjs`** - Improves error handling patterns
- **`fix-timezone-issue-246.js`** - Fixes specific timezone handling issue
- **`simple-test-fixer.js`** - Simple test file fixes and corrections

### Cleanup & Maintenance

#### Build Cleanup
- **`clean-build-artifacts.sh`** - Removes build artifacts and temporary files
- **`cleanup-root.sh`** - Cleans up root directory of unnecessary files
- **`remove-benchmark-conflicts.sh`** - Resolves benchmark file conflicts

## Usage

### Import Fixes
```bash
# Fix import paths
node scripts/utils/fix-import-paths.js

# Remove duplicate imports
node scripts/utils/fix-duplicate-imports.js

# Fix Cliffy imports specifically
node scripts/utils/fix-cliffy-imports.js

# General import optimization
node scripts/utils/fix-imports.js
```

### TypeScript Fixes
```bash
# Comprehensive TypeScript fixes
python scripts/utils/fix-ts-comprehensive.py

# Targeted batch fixes
node scripts/utils/fix-ts-targeted-batch.js

# Test module fixes
node scripts/utils/fix-test-modules.js
```

### System Maintenance
```bash
# Clean build artifacts
bash scripts/utils/clean-build-artifacts.sh

# Clean root directory
bash scripts/utils/cleanup-root.sh

# Remove benchmark conflicts
bash scripts/utils/remove-benchmark-conflicts.sh
```

### Code Quality
```bash
# Fix shebang lines
node scripts/utils/fix-shebang.js

# Improve error handling
node scripts/utils/fix-error-handling.cjs

# Fix timezone issues
node scripts/utils/fix-timezone-issue-246.js

# Simple test fixes
node scripts/utils/simple-test-fixer.js
```

## Script Categories

### 1. Import & Module Management
Scripts that handle import statements, module resolution, and dependency management.

**Common Use Cases:**
- Fixing broken import paths after file moves
- Removing duplicate imports
- Updating import statements for library changes
- Resolving module resolution issues

### 2. TypeScript Error Resolution
Scripts specifically designed to fix TypeScript compilation errors.

**Common Use Cases:**
- Type annotation fixes
- Interface compliance fixes
- Generic type resolution
- Module declaration fixes

### 3. Test Infrastructure Fixes
Scripts that maintain and fix test-related code.

**Common Use Cases:**
- Test import fixes
- Test configuration updates
- Mock and fixture repairs
- Test runner compatibility

### 4. Build System Maintenance
Scripts that clean up and maintain the build system.

**Common Use Cases:**
- Artifact cleanup
- Temporary file removal
- Build cache management
- Dependency cleanup

### 5. Code Quality & Standards
Scripts that enforce and fix code quality issues.

**Common Use Cases:**
- Shebang line standardization
- Error handling improvements
- Code style fixes
- Lint error resolution

## Integration with Build Process

Many utility scripts are integrated into the build process:

```json
{
  "scripts": {
    "prebuild": "scripts/utils/clean-build-artifacts.sh",
    "postbuild": "scripts/utils/fix-imports.js",
    "fix:imports": "node scripts/utils/fix-import-paths.js",
    "fix:duplicates": "node scripts/utils/fix-duplicate-imports.js",
    "clean": "rm -rf dist .crdt-data .demo-crdt-data && scripts/utils/cleanup-root.sh"
  }
}
```

## Automation Features

### Batch Processing
Most scripts support batch processing for efficiency:
```bash
# Process multiple files
node scripts/utils/fix-import-paths.js --batch src/**/*.ts

# Dry run mode
node scripts/utils/fix-ts-targeted-batch.js --dry-run

# Verbose output
python scripts/utils/fix-ts-comprehensive.py --verbose
```

### Safety Features
- **Dry run mode** - Preview changes before applying
- **Backup creation** - Automatic backups before modifications
- **Rollback capability** - Ability to revert changes
- **Validation checks** - Verify fixes don't break functionality

### Integration with Version Control
```bash
# Check for uncommitted changes before running
if git diff-index --quiet HEAD --; then
    node scripts/utils/fix-import-paths.js
else
    echo "Uncommitted changes detected. Commit first."
fi
```

## Best Practices

### Before Running Utilities
1. **Commit current changes** to version control
2. **Run tests** to establish baseline
3. **Create backup** if not automated
4. **Use dry-run mode** to preview changes

### After Running Utilities
1. **Verify fixes** don't break functionality
2. **Run tests** to ensure no regressions
3. **Review changes** in version control
4. **Commit fixes** with descriptive messages

### Safe Usage Patterns
```bash
# Safe fix pattern
git add -A && git commit -m "Pre-fix checkpoint"
node scripts/utils/fix-import-paths.js --dry-run
node scripts/utils/fix-import-paths.js
npm test
git add -A && git commit -m "Fix: Import path corrections"
```

## Troubleshooting

### Script Execution Issues
```bash
# Check Node.js version
node --version

# Install dependencies
npm install

# Check file permissions
chmod +x scripts/utils/*.sh
```

### Fix Script Failures
```bash
# Run with verbose logging
node scripts/utils/fix-import-paths.js --verbose

# Check for syntax errors
node --check scripts/utils/fix-import-paths.js

# Use alternative Python version
python3 scripts/utils/fix-ts-comprehensive.py
```

### Recovery from Bad Fixes
```bash
# Revert to last commit
git reset --hard HEAD

# Revert specific files
git checkout HEAD -- path/to/file.ts

# Use backup files (if created)
cp file.ts.backup file.ts
```

## Contributing New Utilities

When adding new utility scripts:

1. **Follow naming convention** - `fix-[issue-type]-[specific-name].js`
2. **Include safety features** - dry-run, backup, validation
3. **Add comprehensive logging** - progress, errors, results
4. **Write documentation** - usage, examples, troubleshooting
5. **Test thoroughly** - various file types, edge cases
6. **Update this README** - add script description and usage

## Related Directories

- `../build/` - Build-specific utilities
- `../test/` - Test-specific utilities
- `../dev/` - Development utilities
- `../legacy/` - Superseded utility scripts