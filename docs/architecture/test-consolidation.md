# Test Directory Consolidation Architecture

## Overview

This document outlines the architectural design for consolidating scattered test-related files and folders from the root directory into a unified `tests/` structure.

## Current State Analysis

Based on the inventory analysis, the following test-related items exist in the root directory:

### Directories
- `test-results/` - Contains 194 files across subdirectories (cross-platform/, hello-world/)
- `test-temp/` - Contains 2 temporary files (example.js, example.test.js)

### Files
- `test-debug.db-shm` - SQLite shared memory file
- `test-debug.db-wal` - SQLite write-ahead log file  
- `test-fifo-results.txt` - Test results output file
- `test-memory-acl.db` - SQLite database file
- `test-memory-acl.db-shm` - SQLite shared memory file
- `test-memory-acl.db-wal` - SQLite write-ahead log file
- `test-runner.cjs` - Test runner script (9,078 bytes)

## Proposed Target Architecture

```
tests/
├── results/           # Test execution results and reports
│   ├── cross-platform/
│   └── hello-world/
├── temp/              # Temporary test files and artifacts
│   ├── example.js
│   └── example.test.js
├── data/              # Test databases and data files
│   ├── test-debug.db-shm
│   ├── test-debug.db-wal
│   ├── test-fifo-results.txt
│   ├── test-memory-acl.db
│   ├── test-memory-acl.db-shm
│   └── test-memory-acl.db-wal
├── scripts/           # Test execution and utility scripts
│   └── test-runner.cjs
└── README.md          # Documentation for test structure
```

## Migration Strategy

### Phase 1: Directory Structure Creation
1. Create target directories: `tests/results/`, `tests/temp/`, `tests/data/`, `tests/scripts/`
2. Ensure proper permissions and ownership

### Phase 2: Content Migration
1. **Results Migration**: Move `test-results/*` to `tests/results/`
   - Preserve directory structure and file permissions
   - Maintain git history using `git mv`
   
2. **Temporary Files Migration**: Move `test-temp/*` to `tests/temp/`
   - Preserve file permissions
   - Maintain git history using `git mv`
   
3. **Database Files Migration**: Move `test-*.db*` files to `tests/data/`
   - Group all SQLite-related files
   - Maintain git history using `git mv`
   - Preserve file relationships (db files with their shm/wal counterparts)
   
4. **Script Migration**: Move `test-runner.cjs` to `tests/scripts/`
   - Preserve executable permissions
   - Maintain git history using `git mv`

### Phase 3: Cleanup
1. Remove empty source directories
2. Update any configuration files that reference old paths
3. Update documentation and README files

## Technical Considerations

### Git History Preservation
- Use `git mv` commands to preserve file history
- Ensure atomic operations to maintain repository integrity
- Verify proper staging of moved files

### File Type Classification
- **Results**: Test execution outputs, coverage reports, performance metrics
- **Temporary**: Build artifacts, temporary test files, cache data
- **Data**: Test databases, fixtures, sample data files
- **Scripts**: Test runners, utilities, build scripts

### Permission Management
- Preserve executable permissions on scripts
- Maintain appropriate read/write permissions for test files
- Ensure database files maintain proper ownership

## Benefits of Consolidation

1. **Organization**: Clear separation of test-related artifacts by type
2. **Maintainability**: Easier to locate and manage test resources
3. **Cleanup**: Simplified cleanup of temporary files and old results
4. **Scalability**: Structured approach for future test additions
5. **CI/CD Integration**: Clear paths for test automation pipelines

## Implementation Commands

The following git commands will be executed:

```bash
# Create target directories
mkdir -p tests/{results,temp,data,scripts}

# Move results preserving history
git mv test-results/* tests/results/

# Move temporary files preserving history  
git mv test-temp/* tests/temp/

# Move database files preserving history
git mv test-debug.db-shm tests/data/
git mv test-debug.db-wal tests/data/
git mv test-fifo-results.txt tests/data/
git mv test-memory-acl.db tests/data/
git mv test-memory-acl.db-shm tests/data/
git mv test-memory-acl.db-wal tests/data/

# Move script preserving history
git mv test-runner.cjs tests/scripts/

# Remove empty directories
rmdir test-results test-temp
```

## Validation Criteria

- [ ] All files moved to correct target directories
- [ ] Git history preserved for all moved files
- [ ] File permissions maintained
- [ ] No broken references in configuration files
- [ ] Empty source directories removed
- [ ] Test execution still functions properly

## Risk Mitigation

1. **Backup**: Create backup before migration
2. **Atomic Operations**: Use git mv for history preservation
3. **Verification**: Validate all files moved correctly
4. **Testing**: Ensure test suite runs post-migration
5. **Rollback**: Plan for rollback if issues arise