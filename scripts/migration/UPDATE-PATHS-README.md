# Path Update Automation Script

Automated search/replace path updates with comprehensive validation and safety features.

## Features

- **Regex pattern-based path updates** - Support for both string literals and regular expressions
- **Multi-file type support** - JSON, YAML, JavaScript, Markdown with syntax validation
- **Safety features** - Automatic backups, dry-run mode, validation checks
- **Flexible configuration** - CLI arguments or JSON configuration file
- **Detailed reporting** - Comprehensive change reports with statistics
- **File type filtering** - Process only specific file types

## Quick Start

### Simple String Replacement

```bash
node scripts/migration/update-paths.js \
  --pattern "node tests/manual/test-" \
  --replacement "node tests/manual/test-" \
  --types yml,json,js
```

### Regex Pattern Replacement

```bash
node scripts/migration/update-paths.js \
  --pattern "\.claude-flow-novice/dist" \
  --replacement "dist/" \
  --regex
```

### Using Configuration File

```bash
node scripts/migration/update-paths.js \
  --config scripts/migration/example-patterns.json \
  --dry-run
```

## Command Line Options

| Option | Short | Description |
|--------|-------|-------------|
| `--pattern <pattern>` | `-p` | Search pattern (string or regex) |
| `--replacement <replacement>` | `-r` | Replacement string |
| `--config <file>` | `-c` | Load patterns from JSON config file |
| `--types <types>` | `-t` | Comma-separated file types (default: yml,yaml,json,js,mjs,cjs,md) |
| `--dry-run` | `-d` | Preview changes without modifying files |
| `--regex` | | Treat pattern as regex |
| `--verbose` | `-v` | Verbose output |
| `--no-backup` | | Skip backup creation |
| `--help` | `-h` | Show help message |

## Configuration File Format

Create a JSON file with pattern definitions:

```json
{
  "patterns": [
    {
      "pattern": "node tests/manual/test-",
      "replacement": "node tests/manual/test-",
      "description": "Move manual test scripts to tests/manual directory"
    },
    {
      "pattern": "\\.claude-flow-novice/dist",
      "replacement": "dist/",
      "description": "Update build directory references"
    },
    {
      "pattern": "test-results/",
      "replacement": ".artifacts/test-results/",
      "description": "Move test results to artifacts directory"
    }
  ]
}
```

## Supported File Types

### JSON Files (`.json`)
- **Validation**: `JSON.parse()` syntax validation
- **Use cases**: package.json, config files, data files
- **Example patterns**:
  - Update dependencies: `"^1.0.0"` → `"^2.0.0"`
  - Change paths: `".claude-flow-novice/dist"` → `"dist/"`

### YAML Files (`.yml`, `.yaml`)
- **Validation**: YAML parser syntax validation
- **Use cases**: GitHub workflows, CI/CD configs, Kubernetes manifests
- **Example patterns**:
  - Update workflow paths: `run: node tests/manual/test-` → `run: node tests/manual/test-`
  - Change directories: `working-directory: ./dist` → `working-directory: ./build`

### JavaScript Files (`.js`, `.mjs`, `.cjs`)
- **Validation**: Balanced braces/brackets/parentheses, Function constructor check
- **Use cases**: Scripts, modules, configuration files
- **Example patterns**:
  - Update imports: `from './dist/` → `from './build/`
  - Change paths: `require('./test-` → `require('./tests/`

### Markdown Files (`.md`)
- **Validation**: Balanced code fences and inline code
- **Use cases**: Documentation, README files, guides
- **Example patterns**:
  - Update code examples: `` `node tests/manual/test-` `` → `` `node tests/` ``
  - Change links: `[link](./docs/` → `[link](./documentation/`

## Safety Features

### 1. Automatic Backups
Before modifying any file, a backup is created with timestamp:
```
original-file.js → original-file.js.backup-1728567890123
```

Disable with `--no-backup` flag.

### 2. Syntax Validation
After applying patterns, files are validated:
- **JSON**: Parse validation
- **YAML**: YAML parser validation
- **JavaScript**: Balance and syntax checks
- **Markdown**: Code fence and inline code balance

Files with validation errors are NOT modified.

### 3. Dry-Run Mode
Preview all changes without modifying files:
```bash
node scripts/migration/update-paths.js \
  --pattern "old-path" \
  --replacement "new-path" \
  --dry-run
```

### 4. Detailed Reporting
See exactly what will change:
```
=== Path Update Report ===

Summary:
  Total files processed: 150
  Files with changes: 45
  Files with errors: 0
  Validation failures: 0

Changed Files:
  /path/to/file.json
    Total matches: 3
    - "node tests/manual/test-" → "node tests/manual/test-" (3 matches)
```

## Common Use Cases

### 1. Migrate Test Scripts to New Directory

**Problem**: Test scripts scattered in root, need consolidation
**Solution**:
```bash
node scripts/migration/update-paths.js \
  --pattern "node tests/manual/test-" \
  --replacement "node tests/manual/test-" \
  --types yml,json,js,md \
  --verbose
```

### 2. Update Build Output Directory

**Problem**: Build directory renamed from `.claude-flow-novice/dist` to `dist/`
**Solution**:
```bash
node scripts/migration/update-paths.js \
  --pattern "\.claude-flow-novice/dist" \
  --replacement "dist/" \
  --regex \
  --types json,yml,js
```

### 3. Move Test Results to Artifacts Directory

**Problem**: Test results need to be in `.artifacts/` directory
**Solution**:
```bash
node scripts/migration/update-paths.js \
  --pattern "test-results/" \
  --replacement ".artifacts/test-results/" \
  --types yml,md
```

### 4. Batch Multiple Path Updates

**Problem**: Multiple path updates needed across entire codebase
**Solution**:

Create `patterns.json`:
```json
{
  "patterns": [
    {"pattern": "node tests/manual/test-", "replacement": "node tests/manual/test-"},
    {"pattern": "test-results/", "replacement": ".artifacts/test-results/"},
    {"pattern": "\.claude-flow-novice/dist", "replacement": "dist/"}
  ]
}
```

Run with config:
```bash
node scripts/migration/update-paths.js \
  --config patterns.json \
  --dry-run
```

Review output, then apply:
```bash
node scripts/migration/update-paths.js \
  --config patterns.json
```

### 5. Update Documentation Only

**Problem**: Update code examples in documentation
**Solution**:
```bash
node scripts/migration/update-paths.js \
  --pattern "npm run test:" \
  --replacement "npm test -- " \
  --types md \
  --verbose
```

### 6. CI/CD Workflow Path Updates

**Problem**: GitHub Actions workflows reference old paths
**Solution**:
```bash
node scripts/migration/update-paths.js \
  --pattern "working-directory: ./src" \
  --replacement "working-directory: ./packages/core" \
  --types yml \
  --dry-run
```

## Regex Pattern Examples

### Escape Special Characters
Regex special characters need escaping:
```bash
# Dots, slashes, etc.
--pattern "\.claude-flow-novice/dist" --regex

# Parentheses
--pattern "test\(.*\)" --regex
```

### Pattern Matching
```bash
# Match version numbers
--pattern "\"version\":\s*\"1\\..*?\"" --replacement "\"version\": \"2.0.0\"" --regex

# Match import paths
--pattern "from ['\"]\.\/dist\/" --replacement "from './build/" --regex

# Match directory paths
--pattern "test-results?/[^/]*/" --replacement ".artifacts/test-results/" --regex
```

## Error Handling

### Validation Failures
If validation fails after applying patterns, the file is NOT modified:
```
Validation Failures:
  /path/to/file.json
    Validation failed: Unexpected token } in JSON at position 123
```

**Resolution**:
1. Check pattern doesn't break syntax
2. Review replacement string
3. Test on single file first
4. Use `--dry-run` to preview

### Processing Errors
If file can't be read/written:
```
Errors:
  /path/to/file.json
    EACCES: permission denied
```

**Resolution**:
1. Check file permissions
2. Ensure file exists
3. Verify not locked by another process

## Best Practices

### 1. Always Start with Dry-Run
```bash
# Preview changes first
node scripts/migration/update-paths.js \
  --pattern "old" \
  --replacement "new" \
  --dry-run

# Then apply if satisfied
node scripts/migration/update-paths.js \
  --pattern "old" \
  --replacement "new"
```

### 2. Test on Single File Type First
```bash
# Test on JSON files first
node scripts/migration/update-paths.js \
  --pattern "old" \
  --replacement "new" \
  --types json \
  --dry-run
```

### 3. Use Verbose Mode for Debugging
```bash
node scripts/migration/update-paths.js \
  --pattern "old" \
  --replacement "new" \
  --verbose
```

### 4. Keep Backups Enabled
Backups are your safety net - only disable if you have version control:
```bash
# Version controlled? Maybe disable backups
git status  # Ensure clean working tree
node scripts/migration/update-paths.js \
  --pattern "old" \
  --replacement "new" \
  --no-backup
```

### 5. Review Changes Before Committing
```bash
# Apply changes
node scripts/migration/update-paths.js --config patterns.json

# Review with git
git diff

# Commit if satisfied
git add .
git commit -m "chore: Update file paths per migration patterns"
```

## Integration with CFN Loop

The script can be used in CFN Loop workflows for automated path migrations:

```bash
# Phase 1: Preview migration (Loop 3)
node scripts/migration/update-paths.js \
  --config migration-phase1.json \
  --dry-run

# Phase 2: Apply migration (Loop 3)
node scripts/migration/update-paths.js \
  --config migration-phase1.json

# Phase 3: Validate (Loop 2)
npm test
npm run lint

# Phase 4: Product Owner review (Loop 4)
git diff --stat
```

## Troubleshooting

### Pattern Not Matching
**Issue**: No files show changes in dry-run
**Solutions**:
- Check pattern is exact match (case-sensitive)
- For regex, verify escaping: `\.` for literal dots
- Use `--verbose` to see which files are processed
- Check file type filter includes target files

### Validation Failures After Update
**Issue**: Files fail validation after pattern application
**Solutions**:
- Pattern may break syntax (e.g., unmatched quotes)
- Test replacement on single file manually
- Use more specific patterns to avoid false matches
- Consider using regex lookahead/lookbehind

### Too Many Matches
**Issue**: Pattern matches more than intended
**Solutions**:
- Make pattern more specific
- Use regex anchors: `^pattern$` for whole line
- Use negative lookahead: `pattern(?!exception)`
- Test with `--dry-run` first

### Performance Issues
**Issue**: Script slow with many files
**Solutions**:
- Use `--types` to filter file types
- Process in batches (by directory)
- Exclude large directories in glob patterns
- Consider running in parallel on subdirectories

## Examples Repository

See `scripts/migration/example-patterns.json` for common migration patterns:
- Test script relocation
- Build directory updates
- Artifact directory changes

## API Documentation

### Exported Functions

For programmatic use:
```javascript
import {
  validateJSON,
  validateYAML,
  validateJavaScript,
  validateMarkdown,
  processFile,
  findFiles,
  applyPattern
} from './scripts/migration/update-paths.js';

// Process single file
const result = await processFile(
  '/path/to/file.json',
  [{ pattern: 'old', replacement: 'new' }],
  { dryRun: true }
);

// Find files
const files = await findFiles(['js', 'json']);

// Apply pattern
const updated = applyPattern(content, { pattern: 'old', replacement: 'new' });
```

## Related Documentation

- [Migration Guide](./README.md) - Overall migration strategy
- [Sprint 1.3 Backlog](../../planning/wasm-acceleration-epic/sprint-1.3-backlog.md) - Task context
- [CLAUDE.md](../../CLAUDE.md) - Project guidelines

## Support

For issues or questions:
1. Check this documentation
2. Review error messages in output
3. Test with `--dry-run` and `--verbose`
4. Check file permissions and syntax
5. Review pattern escaping for regex mode
