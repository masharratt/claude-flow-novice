# Test Consolidation Migration Plan

## Detailed Migration Commands

### Directory Creation
```bash
# Create the unified tests directory structure
mkdir -p tests/results
mkdir -p tests/temp  
mkdir -p tests/data
mkdir -p tests/scripts
```

### Git Migration Operations

#### 1. Test Results Migration
```bash
# Move test-results directory contents to tests/results/
git mv test-results/* tests/results/
# This will move:
# - test-results/cross-platform/ -> tests/results/cross-platform/
# - test-results/hello-world/ -> tests/results/hello-world/
# - All 194 files within these directories
```

#### 2. Temporary Files Migration
```bash
# Move test-temp directory contents to tests/temp/
git mv test-temp/* tests/temp/
# This will move:
# - test-temp/example.js -> tests/temp/example.js
# - test-temp/example.test.js -> tests/temp/example.test.js
```

#### 3. Database Files Migration
```bash
# Move SQLite database files to tests/data/
git mv test-debug.db-shm tests/data/
git mv test-debug.db-wal tests/data/
git mv test-fifo-results.txt tests/data/
git mv test-memory-acl.db tests/data/
git mv test-memory-acl.db-shm tests/data/
git mv test-memory-acl.db-wal tests/data/
```

#### 4. Test Script Migration
```bash
# Move test runner script to tests/scripts/
git mv test-runner.cjs tests/scripts/
```

#### 5. Cleanup Empty Directories
```bash
# Remove empty source directories
rmdir test-results
rmdir test-temp
```

## Execution Sequence

1. **Preparation**: Verify git status is clean
2. **Directory Creation**: Create target directory structure
3. **Content Migration**: Execute git mv operations in sequence
4. **Cleanup**: Remove empty source directories
5. **Verification**: Confirm all files moved correctly
6. **Testing**: Validate test suite functionality

## Verification Steps

After migration, verify:

```bash
# Check target directories contain expected files
ls -la tests/results/
ls -la tests/temp/
ls -la tests/data/
ls -la tests/scripts/

# Verify file counts match original
find tests/results/ -type f | wc -l  # Should be 194
find tests/temp/ -type f | wc -l     # Should be 2
ls tests/data/ | wc -l               # Should be 6
ls tests/scripts/ | wc -l            # Should be 1

# Check git status shows moved files
git status --porcelain | grep "^R"
```

## Rollback Plan

If migration fails, rollback with:

```bash
# Reverse all moves
git mv tests/results/* test-results/
git mv tests/temp/* test-temp/
git mv tests/data/test-debug.db-shm test-debug.db-shm
git mv tests/data/test-debug.db-wal test-debug.db-wal
git mv tests/data/test-fifo-results.txt test-fifo-results.txt
git mv tests/data/test-memory-acl.db test-memory-acl.db
git mv tests/data/test-memory-acl.db-shm test-memory-acl.db-shm
git mv tests/data/test-memory-acl.db-wal test-memory-acl.db-wal
git mv tests/scripts/test-runner.cjs test-runner.cjs

# Remove target directories
rmdir tests/results tests/temp tests/data tests/scripts tests
```