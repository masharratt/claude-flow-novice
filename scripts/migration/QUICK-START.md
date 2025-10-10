# Path Update Automation - Quick Start Guide

Fast reference for common path update operations.

## TL;DR

```bash
# Preview changes (always do this first!)
node scripts/migration/update-paths.js \
  --pattern "old-path" \
  --replacement "new-path" \
  --dry-run

# Apply changes
node scripts/migration/update-paths.js \
  --pattern "old-path" \
  --replacement "new-path"
```

## Common Operations

### 1. Update Test Script Paths

```bash
# Preview
node scripts/migration/update-paths.js \
  --pattern "node tests/manual/test-" \
  --replacement "node tests/manual/test-" \
  --types yml,json,js,md \
  --dry-run

# Apply
node scripts/migration/update-paths.js \
  --pattern "node tests/manual/test-" \
  --replacement "node tests/manual/test-" \
  --types yml,json,js,md
```

### 2. Update Build Directory References

```bash
# Preview (regex mode)
node scripts/migration/update-paths.js \
  --pattern "\.claude-flow-novice/dist" \
  --replacement "dist/" \
  --regex \
  --dry-run

# Apply
node scripts/migration/update-paths.js \
  --pattern "\.claude-flow-novice/dist" \
  --replacement "dist/" \
  --regex
```

### 3. Batch Multiple Updates

```bash
# Use config file
node scripts/migration/update-paths.js \
  --config scripts/migration/example-patterns.json \
  --dry-run

# Apply if satisfied
node scripts/migration/update-paths.js \
  --config scripts/migration/example-patterns.json
```

### 4. Update Only Documentation

```bash
node scripts/migration/update-paths.js \
  --pattern "old-command" \
  --replacement "new-command" \
  --types md \
  --verbose
```

### 5. Update GitHub Workflows

```bash
node scripts/migration/update-paths.js \
  --pattern "working-directory: ./old" \
  --replacement "working-directory: ./new" \
  --types yml \
  --dry-run
```

## Quick Flags

| Flag | Short | What it does |
|------|-------|-------------|
| `--pattern` | `-p` | What to find |
| `--replacement` | `-r` | What to replace with |
| `--config` | `-c` | Use config file |
| `--types` | `-t` | File types (yml,json,js,md) |
| `--dry-run` | `-d` | Preview only |
| `--regex` | | Treat pattern as regex |
| `--verbose` | `-v` | Show details |
| `--no-backup` | | Skip backups |
| `--help` | `-h` | Show help |

## Config File Template

```json
{
  "patterns": [
    {
      "pattern": "search-string",
      "replacement": "replace-string",
      "description": "What this does"
    }
  ]
}
```

## Safety Checklist

- [ ] Run with `--dry-run` first
- [ ] Review the output carefully
- [ ] Check file count makes sense
- [ ] Verify patterns are correct
- [ ] Test on single file type first
- [ ] Keep backups enabled (default)
- [ ] Commit to git before running

## Common Mistakes

1. **Forgetting to escape regex characters**
   ```bash
   # Wrong
   --pattern ".claude-flow-novice/dist" --regex

   # Right
   --pattern "\.claude-flow-novice/dist" --regex
   ```

2. **Not using dry-run first**
   ```bash
   # Always start with dry-run!
   --dry-run
   ```

3. **Wrong file type filter**
   ```bash
   # Check which file types you need
   --types yml,json,js,md
   ```

## Troubleshooting

### No files found
```bash
# Check file types
--types yml,yaml,json,js,mjs,cjs,md
```

### Pattern not matching
```bash
# Use verbose to see what's happening
--verbose
```

### Validation errors
```bash
# Check pattern doesn't break syntax
--dry-run
```

## Full Documentation

For detailed documentation, see:
- [UPDATE-PATHS-README.md](./UPDATE-PATHS-README.md) - Complete guide
- [example-patterns.json](./example-patterns.json) - Example patterns
- Run `--help` for built-in help

## Testing

```bash
# Run test suite
node scripts/migration/test-update-paths.js
```

## Examples

See `example-patterns.json` for ready-to-use patterns:
- Test script migration
- Build directory updates
- Artifact path changes
