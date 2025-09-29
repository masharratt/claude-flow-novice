# verify check

Run verification checks on code, tasks, or agent outputs.

## Usage

```bash
claude-flow-novice verify check [options]
```

## Options

- `--file <path>` - Verify specific file
- `--task <id>` - Verify task output
- `--directory <path>` - Verify entire directory
- `--threshold <0-1>` - Override default threshold (0.95)
- `--auto-fix` - Attempt automatic fixes
- `--json` - Output results as JSON
- `--verbose` - Show detailed verification steps

## Examples

```bash
# Basic file verification
claude-flow-novice verify check --file src/app.js

# Verify with higher threshold
claude-flow-novice verify check --file src/critical.js --threshold 0.99

# Verify and auto-fix issues
claude-flow-novice verify check --directory src/ --auto-fix

# Get JSON output for CI/CD
claude-flow-novice verify check --json > verification.json
```

## Truth Scoring

The check command evaluates:
- Code correctness
- Best practices adherence
- Security vulnerabilities
- Performance implications
- Documentation completeness

## Exit Codes

- `0` - Verification passed
- `1` - Verification failed
- `2` - Error during verification