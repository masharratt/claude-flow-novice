# ADR 001: Test Directory Consolidation

## Status
Accepted

## Context
The project root directory contains scattered test-related files and directories that create organizational challenges:

- `test-results/` directory with 194 files
- `test-temp/` directory with 2 temporary files  
- 6 test database files (`test-*.db*`)
- `test-runner.cjs` script file

This scattered structure makes it difficult to:
- Locate test-related resources efficiently
- Clean up old test artifacts
- Maintain organized project structure
- Scale test infrastructure

## Decision
Consolidate all test-related files into a unified `tests/` directory structure with logical subdirectories:

```
tests/
├── results/     # Test execution results and reports
├── temp/        # Temporary test files and artifacts  
├── data/        # Test databases and data files
└── scripts/     # Test execution and utility scripts
```

## Rationale

### Benefits
1. **Organization**: Clear categorization by file type and purpose
2. **Maintainability**: Single location for all test-related resources
3. **Scalability**: Structured approach for future test additions
4. **Cleanup**: Simplified management of temporary files and old results
5. **Standards Compliance**: Follows common project structure conventions

### Trade-offs
1. **Path Changes**: Existing references to test files need updates
2. **Migration Effort**: One-time effort to restructure directories
3. **Tooling Updates**: CI/CD pipelines may need path adjustments

### Alternatives Considered
1. **Keep Current Structure**: Status quo - rejected due to organizational issues
2. **Move to root/tests/**: Alternative location - rejected as `tests/` is standard
3. **Flat Structure**: All files in `tests/` without subdirectories - rejected for lack of organization

## Consequences

### Positive
- Improved project organization and maintainability
- Clear separation of test artifact types
- Easier cleanup and management of test resources
- Better developer experience finding test-related files

### Negative  
- Requires updating any hardcoded paths in configuration
- Migration effort and potential for temporary disruption
- Need to update documentation and tooling configurations

### Neutral
- Git history preserved through `git mv` operations
- No functional changes to test execution
- Maintains all existing file permissions and relationships

## Implementation
Execute migration using `git mv` commands to preserve history, following the detailed migration plan in `docs/architecture/migration-plan.md`.

## Validation
- All files successfully moved to target directories
- Git history preserved
- Test suite functionality maintained
- No broken references in configuration files

## Date
2024-10-13

## Decision Makers
Architect Agent (System Design Lead)