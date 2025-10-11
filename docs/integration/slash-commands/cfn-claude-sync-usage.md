# CFN Claude Sync - Usage Guide

**Command**: `/cfn-claude-sync`
**Purpose**: Synchronize CFN Loop configuration from CLAUDE.md to all slash command files (DRY principle enforcement)

---

## Overview

The `/cfn-claude-sync` command ensures single source of truth for CFN Loop rules by automatically synchronizing configuration from `CLAUDE.md` to:

- **Markdown templates**: `.claude/commands/cfn-loop*.md` (4 files)
- **JavaScript generators**: `src/slash-commands/cfn-loop*.js` (4 files)

This eliminates manual duplication and ensures consistency across all CFN Loop documentation and code.

---

## Usage

```bash
# Basic sync (applies changes immediately)
/cfn-claude-sync

# Preview changes without applying (dry-run)
/cfn-claude-sync --dry-run

# Show detailed extraction and replacement process
/cfn-claude-sync --verbose

# Combine flags
/cfn-claude-sync --dry-run --verbose
```

---

## What Gets Synchronized

### Configuration Values

| Parameter | CLAUDE.md Source | Target Files |
|-----------|------------------|--------------|
| **Consensus threshold** | `≥90%` | Markdown templates, JS generators |
| **Confidence gate** | `≥75%` | Markdown templates |
| **Loop 2 max iterations** | `10` | Markdown templates, JS generators |
| **Loop 3 max iterations** | `10` | Markdown templates, JS generators |

### Complexity Tiers

| Tier | Agent Count | Topology |
|------|-------------|----------|
| Simple | 2-3 | mesh |
| Medium | 4-6 | mesh |
| Complex | 8-12 | hierarchical |
| Enterprise | 15-20 | hierarchical |

### Autonomous Rules

- "NO approval needed for retries"
- "IMMEDIATE relaunch on consensus failure"
- "AUTO-TRANSITION on phase completion"

---

## When to Use

### Mandatory Use Cases

1. **After editing CLAUDE.md CFN Loop section**
   ```bash
   # Edit CLAUDE.md (change consensus threshold to ≥85%)
   /cfn-claude-sync --dry-run  # Preview changes
   /cfn-claude-sync            # Apply changes
   ```

2. **Before publishing new package version**
   ```bash
   /cfn-claude-sync --verbose  # Ensure all files in sync
   npm run test                # Validate changes
   npm version patch           # Bump version
   ```

3. **When adding new CFN Loop slash commands**
   ```bash
   # Create new command file
   touch .claude/commands/cfn-loop-custom.md

   # Sync configuration to new file
   /cfn-claude-sync
   ```

4. **During CFN Loop architecture refactoring**
   ```bash
   # Make architectural changes to CLAUDE.md
   /cfn-claude-sync --dry-run  # Verify propagation
   /cfn-claude-sync            # Apply everywhere
   ```

---

## Example Workflows

### Workflow 1: Changing Consensus Threshold

**Scenario**: You want to change consensus threshold from ≥90% to ≥85%

```bash
# Step 1: Edit CLAUDE.md
# Change: "≥90% consensus" → "≥85% consensus"

# Step 2: Preview changes
/cfn-claude-sync --dry-run

# Output:
# 🔍 CFN Claude Sync (DRY RUN)
#
# Extracted from CLAUDE.md:
#   Consensus threshold: ≥85%
#   Confidence gate: ≥75%
#   Loop 2 max iterations: 10
#   Loop 3 max iterations: 10
#
# Changes to be made:
#   .claude/commands/cfn-loop.md:
#     Line 20: 90% → 85% (consensus_threshold)
#   .claude/commands/cfn-loop-epic.md:
#     Line 23: 90% → 85% (consensus_threshold)
#   ...
#
# Total files to update: 8
# Total changes: 12

# Step 3: Apply changes
/cfn-claude-sync

# Output:
# ✅ CFN Claude Sync Complete
#
# Updated files:
#   ✅ cfn-loop.md (3 changes)
#   ✅ cfn-loop-epic.md (3 changes)
#   ✅ cfn-loop-sprints.md (3 changes)
#   ✅ cfn-loop-single.md (3 changes)
#   ✅ cfn-loop.js (0 changes)
#   ...
#
# Configuration now synchronized:
# - Consensus threshold: ≥85%
# - Confidence gate: ≥75%
# - Loop 2 max: 10 iterations
# - Loop 3 max: 10 iterations

# Step 4: Validate and commit
git diff                     # Review changes
npm test                     # Run tests
git commit -m "chore: update consensus threshold to 85%"
```

### Workflow 2: Adjusting Loop Iteration Limits

**Scenario**: Increase Loop 3 max iterations from 10 to 15

```bash
# Step 1: Edit CLAUDE.md
# Change: "Loop 3: max 10 iterations" → "Loop 3: max 15 iterations"

# Step 2: Sync with verbose output
/cfn-claude-sync --verbose

# Shows detailed extraction process:
# 📋 Extracted Configuration:
# {
#   "consensusThreshold": "90",
#   "confidenceGate": "75",
#   "loop2MaxIterations": "10",
#   "loop3MaxIterations": "15",  ← Changed
#   ...
# }
#
# 📂 Target Files:
#   Markdown templates: 4 files
#   JavaScript generators: 4 files
#
# ✅ Updated cfn-loop.js (1 changes)
# ✅ Updated cfn-loop-epic.js (1 changes)
# ...

# Step 3: Test CFN Loop with new limits
/cfn-loop "test task" --phase=test

# Step 4: Commit
git commit -m "chore: increase Loop 3 max to 15 iterations"
```

---

## Output Formats

### Dry Run Output

```
🔍 CFN Claude Sync (DRY RUN)

Extracted from CLAUDE.md:
  Consensus threshold: ≥90%
  Confidence gate: ≥75%
  Loop 2 max iterations: 10
  Loop 3 max iterations: 10

Changes to be made:
  .claude/commands/cfn-loop.md:
    Line 20: ≥85% → ≥90% (consensus_threshold)
    Line 63: ≥70% → ≥75% (confidence_gate)

  src/slash-commands/cfn-loop.js:
    Line 92: maxLoop2: 5 → maxLoop2: 10
    Line 93: maxLoop3: 15 → maxLoop3: 10

Total files to update: 8
Total changes: 16

Run without --dry-run to apply changes.
```

### Success Output

```
✅ CFN Claude Sync Complete

Updated files:
  ✅ cfn-loop.md (2 changes)
  ✅ cfn-loop-epic.md (3 changes)
  ✅ cfn-loop-sprints.md (2 changes)
  ✅ cfn-loop-single.md (2 changes)
  ✅ cfn-loop.js (2 changes)
  ✅ cfn-loop-epic.js (2 changes)
  ✅ cfn-loop-sprints.js (2 changes)
  ✅ cfn-loop-single.js (2 changes)

Configuration now synchronized:
- Consensus threshold: ≥90%
- Confidence gate: ≥75%
- Loop 2 max: 10 iterations
- Loop 3 max: 10 iterations

Next steps:
1. Review changes: git diff
2. Run tests: npm test
3. Validate: /cfn-loop "test task" --dry-run
4. Commit: git commit -m "chore: sync CFN Loop from CLAUDE.md"
```

### Error Output

```
❌ Error: CLAUDE.md not found in project root
Please ensure CLAUDE.md exists before running sync.

Path checked: /mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md
```

---

## Safety Features

### 1. Backup Creation

Before any changes, original files are backed up:

```
.claude/backups/cfn-sync-{timestamp}/
├── cfn-loop.md
├── cfn-loop-epic.md
├── cfn-loop-sprints.md
├── cfn-loop-single.md
├── cfn-loop.js
├── cfn-loop-epic.js
├── cfn-loop-sprints.js
└── cfn-loop-single.js
```

### 2. Atomic Updates

All files updated in a transaction - rollback on any failure.

### 3. Git Integration

Recommended to commit after sync:

```bash
/cfn-claude-sync
git add .
git commit -m "chore: sync CFN Loop from CLAUDE.md"
```

### 4. Validation

After sync, validate with dry-run:

```bash
/cfn-claude-sync           # Apply changes
/cfn-loop "test" --dry-run # Verify new config works
```

---

## Automation

### Pre-Commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Check if CLAUDE.md was modified
if git diff --cached --name-only | grep -q "CLAUDE.md"; then
  echo "⚠️  CLAUDE.md changed - checking sync status..."

  # Run dry-run to check for differences
  /cfn-claude-sync --dry-run > /tmp/cfn-sync-check.txt

  if grep -q "Total changes: 0" /tmp/cfn-sync-check.txt; then
    echo "✅ CFN Loop files already in sync"
  else
    echo "❌ CFN Loop files out of sync!"
    echo "Run: /cfn-claude-sync"
    exit 1
  fi
fi
```

### CI/CD Integration

Add to GitHub Actions workflow:

```yaml
name: Validate CFN Loop Sync

on:
  pull_request:
    paths:
      - 'CLAUDE.md'

jobs:
  validate-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Check CFN Loop sync
        run: |
          npx claude-flow-novice slash cfn-claude-sync --dry-run

          # Fail if changes detected
          if ! grep -q "Total changes: 0" sync-output.txt; then
            echo "❌ CLAUDE.md changed but slash commands not synced"
            echo "Run: /cfn-claude-sync"
            exit 1
          fi
```

---

## Troubleshooting

### Issue: "CFN Loop section not found"

**Cause**: CLAUDE.md missing `## 🔄 MANDATORY CFN LOOP` section

**Solution**: Ensure CLAUDE.md has the exact header:
```markdown
## 🔄 MANDATORY CFN LOOP (4-LOOP STRUCTURE)
```

### Issue: Files not updating

**Cause**: File permissions or missing target files

**Solution**: Check file existence:
```bash
ls -la .claude/commands/cfn-loop*.md
ls -la src/slash-commands/cfn-loop*.js
```

### Issue: Unexpected changes in dry-run

**Cause**: Manual edits to slash command files diverged from CLAUDE.md

**Solution**: Review CLAUDE.md as source of truth, then sync:
```bash
/cfn-claude-sync --dry-run --verbose  # See what will change
/cfn-claude-sync                      # Apply CLAUDE.md rules
```

---

## Best Practices

1. **Edit CLAUDE.md first**: Always modify CFN Loop rules in CLAUDE.md, not in slash command files
2. **Use dry-run**: Preview changes before applying: `/cfn-claude-sync --dry-run`
3. **Commit separately**: Sync changes separate from feature changes
4. **Run tests**: After sync, run `npm test` to validate
5. **Validate manually**: Test slash commands after sync: `/cfn-loop "test task"`

---

## Related Commands

- `/cfn-loop` - Execute CFN Loop with synced configuration
- `/cfn-loop-epic` - Multi-phase CFN Loop
- `/cfn-loop-sprints` - Sprint-based CFN Loop
- `/cfn-loop-single` - Single-task CFN Loop
- `/parse-epic` - Parse epic to CFN Loop configuration

---

## Summary

The `/cfn-claude-sync` command maintains DRY (Don't Repeat Yourself) principle by ensuring CLAUDE.md is the single source of truth for CFN Loop configuration. Always sync after editing CLAUDE.md CFN Loop rules to keep slash commands consistent.

**Quick reference**:
```bash
# Workflow: Edit CLAUDE.md → Dry-run → Sync → Test → Commit
vim CLAUDE.md
/cfn-claude-sync --dry-run
/cfn-claude-sync
npm test
git commit -m "chore: sync CFN Loop from CLAUDE.md"
```
