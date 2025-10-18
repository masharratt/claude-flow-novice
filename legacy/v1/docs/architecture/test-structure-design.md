# Test Directory Structure Design

## Target Architecture

```
tests/
├── results/           # Test execution results and reports
│   ├── cross-platform/
│   │   └── [194 files distributed across subdirs]
│   └── hello-world/
│       └── [additional result files]
├── temp/              # Temporary test files and artifacts
│   ├── example.js     # Temporary test file
│   └── example.test.js # Temporary test file
├── data/              # Test databases and data files
│   ├── test-debug.db-shm      # SQLite shared memory file
│   ├── test-debug.db-wal      # SQLite write-ahead log
│   ├── test-fifo-results.txt  # Test results output
│   ├── test-memory-acl.db     # SQLite database
│   ├── test-memory-acl.db-shm # SQLite shared memory
│   └── test-memory-acl.db-wal # SQLite write-ahead log
├── scripts/           # Test execution and utility scripts
│   └── test-runner.cjs        # Test runner script (9,078 bytes)
└── README.md          # Documentation for test structure
```

## File Classification Logic

### Results Directory (`tests/results/`)
**Purpose**: Persistent test execution outputs and reports
**Contents**:
- Test result files (JSON, XML, HTML reports)
- Coverage reports
- Performance metrics
- Cross-platform test results
- Integration test outputs

**Characteristics**:
- 194 files currently
- Organized by test category/platform
- Preserved between test runs
- Used for analysis and reporting

### Temporary Directory (`tests/temp/`)
**Purpose**: Ephemeral test files and build artifacts
**Contents**:
- Temporary test files
- Build artifacts
- Cache files
- Generated test data

**Characteristics**:
- 2 files currently (example.js, example.test.js)
- Safe to delete
- Generated during test execution
- Not tracked in version control (should be in .gitignore)

### Data Directory (`tests/data/`)
**Purpose**: Test databases, fixtures, and reference data
**Contents**:
- SQLite database files
- Test fixtures
- Sample data files
- Configuration files for testing

**Characteristics**:
- 6 files currently (SQLite files and results)
- Version controlled
- Essential for test execution
- Database file relationships preserved

### Scripts Directory (`tests/scripts/`)
**Purpose**: Test execution utilities and automation scripts
**Contents**:
- Test runner scripts
- Build scripts
- Utility functions
- Automation tools

**Characteristics**:
- 1 file currently (test-runner.cjs)
- Executable permissions preserved
- Core testing infrastructure
- Maintained in version control

## Migration Strategy

### Phase 1: Preparation
1. Verify git status is clean
2. Create target directory structure
3. Backup current state if needed

### Phase 2: Directory Creation
```bash
mkdir -p tests/{results,temp,data,scripts}
```

### Phase 3: Content Migration
Execute git mv operations in dependency order:

1. **Results Migration** (194 files)
   ```bash
   git mv test-results/* tests/results/
   ```

2. **Temporary Files Migration** (2 files)
   ```bash
   git mv test-temp/* tests/temp/
   ```

3. **Database Files Migration** (6 files)
   ```bash
   git mv test-debug.db-shm tests/data/
   git mv test-debug.db-wal tests/data/
   git mv test-fifo-results.txt tests/data/
   git mv test-memory-acl.db tests/data/
   git mv test-memory-acl.db-shm tests/data/
   git mv test-memory-acl.db-wal tests/data/
   ```

4. **Script Migration** (1 file)
   ```bash
   git mv test-runner.cjs tests/scripts/
   ```

### Phase 4: Cleanup
```bash
rmdir test-results test-temp
```

## Design Principles

### 1. Separation of Concerns
- Clear categorization by file type and lifecycle
- Logical grouping for maintainability
- Distinct purposes for each subdirectory

### 2. Git History Preservation
- Use `git mv` for all file movements
- Maintain complete file history
- Preserve commit attribution

### 3. Permission Management
- Maintain executable permissions on scripts
- Preserve file access modes
- Ensure database file relationships intact

### 4. Scalability
- Structure supports future growth
- Clear patterns for new test types
- Extensible organization scheme

## Implementation Considerations

### File Relationships
- SQLite database files moved as complete sets
- Maintain db/wal/shm file relationships
- Preserve relative file dependencies

### Path Updates
- Update any configuration files referencing old paths
- Modify CI/CD pipeline configurations
- Update documentation references

### Validation
- Verify file counts match original inventory
- Confirm git history preserved
- Test execution functionality maintained
- Check file permissions intact

## Success Criteria

- [ ] 203 total files moved to appropriate target directories
- [ ] Git history preserved for all moved files
- [ ] Directory structure matches design specification
- [ ] Test suite executes successfully post-migration
- [ ] No broken file references in configuration
- [ ] Empty source directories removed

## Future Considerations

### .gitignore Updates
Consider adding to .gitignore:
```
tests/temp/
tests/results/*.tmp
tests/logs/
```

### Documentation
- Update project README with new test structure
- Document test directory usage patterns
- Provide examples for adding new tests

### Tooling Integration
- Update test runner configurations
- Modify IDE test configurations
- Adjust CI/CD pipeline paths