---
description: "Sync CFN Loop rules from CLAUDE.md to slash command files (DRY principle enforcement)"
argument-hint: "[--dry-run] [--verbose]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# CFN Claude Sync - Synchronize CFN Loop Documentation

Automatically synchronize CFN Loop rules from CLAUDE.md to all slash command files, ensuring single source of truth.

**Task**: Sync CFN Loop configuration across codebase

## What This Command Does

1. **Extracts** CFN Loop rules from CLAUDE.md (consensus thresholds, confidence gates, iteration limits, loop structure)
2. **Updates** `.claude/commands/cfn-loop*.md` markdown templates with extracted rules
3. **Updates** `src/slash-commands/cfn-loop*.js` JavaScript generators with extracted configuration
4. **Validates** consistency across all CFN Loop files
5. **Reports** changes made and any conflicts detected

## Command Options

```bash
/cfn-claude-sync                    # Sync all CFN Loop files
/cfn-claude-sync --dry-run          # Preview changes without writing
/cfn-claude-sync --verbose          # Show detailed extraction and replacement
```

**Options:**
- `--dry-run`: Show what would change without modifying files
- `--verbose`: Display detailed sync process and extracted values

## Extracted Configuration

The sync process extracts these values from CLAUDE.md:

```yaml
cfn_loop_config:
  consensus_threshold: "≥90%"        # Loop 2 consensus requirement
  confidence_gate: "≥75%"            # Loop 3 self-assessment gate
  loop2_max_iterations: 10           # Consensus validation max
  loop3_max_iterations: 10           # Primary swarm max

  complexity_tiers:
    simple:     { agents: "2-3",  topology: "mesh" }
    medium:     { agents: "4-6",  topology: "mesh" }
    complex:    { agents: "8-12", topology: "hierarchical" }
    enterprise: { agents: "15-20", topology: "hierarchical" }

  goap_decision_types:
    - "PROCEED"   # In-scope blockers → retry Loop 3
    - "DEFER"     # Out-of-scope → backlog
    - "ESCALATE"  # Critical ambiguity → human

  autonomous_rules:
    - "NO approval needed for retries"
    - "IMMEDIATE relaunch on consensus failure"
    - "AUTO-TRANSITION on phase completion"
```

## Files Updated

### 1. Markdown Templates (4 files)
- `.claude/commands/cfn-loop.md`
- `.claude/commands/cfn-loop-epic.md`
- `.claude/commands/cfn-loop-sprints.md`
- `.claude/commands/cfn-loop-single.md`

### 2. JavaScript Generators (4 files)
- `src/slash-commands/cfn-loop.js`
- `src/slash-commands/cfn-loop-epic.js`
- `src/slash-commands/cfn-loop-sprints.js`
- `src/slash-commands/cfn-loop-single.js`

## Sync Process

### Step 1: Extract from CLAUDE.md

```javascript
// Read CLAUDE.md
const claudeMd = Read("CLAUDE.md");

// Extract CFN Loop section
const cfnSection = extractSection(claudeMd, "## 🔄 MANDATORY CFN LOOP");

// Parse configuration values
const config = {
  consensusThreshold: extractPattern(cfnSection, /≥(\d+)%.*consensus/i),
  confidenceGate: extractPattern(cfnSection, /≥(\d+)%.*confidence/i),
  loop2Max: extractPattern(cfnSection, /Loop 2.*max.*?(\d+)/i),
  loop3Max: extractPattern(cfnSection, /Loop 3.*max.*?(\d+)/i),
  // ... additional extractions
};
```

### Step 2: Update Markdown Templates

```javascript
// For each .claude/commands/cfn-loop*.md file
const mdFiles = Glob(".claude/commands/cfn-loop*.md");

for (const file of mdFiles) {
  const content = Read(file);

  // Replace consensus threshold
  const updated = content.replace(
    /≥\d+%.*Byzantine consensus/g,
    `≥${config.consensusThreshold}% Byzantine consensus`
  );

  // Replace confidence gate
  updated = updated.replace(
    /ALL agents ≥\d+%/g,
    `ALL agents ≥${config.confidenceGate}%`
  );

  // Replace iteration limits
  updated = updated.replace(
    /max.*?(\d+) iterations/g,
    `max ${config.loop2Max} iterations`
  );

  Write(file, updated);
}
```

### Step 3: Update JavaScript Generators

```javascript
// For each src/slash-commands/cfn-loop*.js file
const jsFiles = Glob("src/slash-commands/cfn-loop*.js");

for (const file of jsFiles) {
  const content = Read(file);

  // Update default values in parseArgs()
  const updated = content.replace(
    /maxLoop2:\s*\d+/,
    `maxLoop2: ${config.loop2Max}`
  );

  updated = updated.replace(
    /maxLoop3:\s*\d+/,
    `maxLoop3: ${config.loop3Max}`
  );

  // Update complexity tiers in getSwarmConfig()
  updated = updated.replace(
    /simple:\s*\{\s*agentCount:\s*\d+/,
    `simple: { agentCount: ${config.complexity.simple.min}`
  );

  Write(file, updated);
}
```

### Step 4: Validation

```javascript
// Verify all files now match CLAUDE.md
const validationResults = [];

for (const file of [...mdFiles, ...jsFiles]) {
  const content = Read(file);

  const checks = {
    consensusThreshold: content.includes(`≥${config.consensusThreshold}%`),
    confidenceGate: content.includes(`≥${config.confidenceGate}%`),
    loop2Max: content.includes(config.loop2Max.toString()),
    loop3Max: content.includes(config.loop3Max.toString()),
  };

  validationResults.push({ file, checks });
}

// Report any mismatches
const failures = validationResults.filter(r =>
  !Object.values(r.checks).every(Boolean)
);

if (failures.length > 0) {
  console.error("Validation failures:", failures);
}
```

## Output Format

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
    Line 20: ≥85% → ≥90% (consensus)
    Line 63: ≥70% → ≥75% (confidence gate)

  src/slash-commands/cfn-loop.js:
    Line 92: maxLoop2: 5 → maxLoop2: 10
    Line 93: maxLoop3: 15 → maxLoop3: 10

Total files to update: 8
Run without --dry-run to apply changes.
```

### Actual Sync Output
```
✅ CFN Claude Sync Complete

Updated files:
  ✅ .claude/commands/cfn-loop.md (2 changes)
  ✅ .claude/commands/cfn-loop-epic.md (3 changes)
  ✅ .claude/commands/cfn-loop-sprints.md (2 changes)
  ✅ .claude/commands/cfn-loop-single.md (2 changes)
  ✅ src/slash-commands/cfn-loop.js (2 changes)
  ✅ src/slash-commands/cfn-loop-epic.js (2 changes)
  ✅ src/slash-commands/cfn-loop-sprints.js (2 changes)
  ✅ src/slash-commands/cfn-loop-single.js (2 changes)

Validation: ALL PASSED ✅

Configuration now synchronized:
  Consensus threshold: ≥90%
  Confidence gate: ≥75%
  Loop 2 max: 10 iterations
  Loop 3 max: 10 iterations
```

## Error Handling

### Missing CLAUDE.md
```
❌ Error: CLAUDE.md not found in project root
Please ensure CLAUDE.md exists before running sync.
```

### Parse Failures
```
⚠️  Warning: Could not extract consensus threshold from CLAUDE.md
Using fallback value: ≥90%
```

### Validation Failures
```
❌ Validation failed for 2 files:
  src/slash-commands/cfn-loop.js:
    Expected maxLoop2: 10, found: 5
  .claude/commands/cfn-loop-epic.md:
    Expected ≥90% consensus, found: ≥85%

Please review and manually fix inconsistencies.
```

## Safety Features

1. **Backup Creation**: Original files backed up to `.claude/backups/cfn-sync-{timestamp}/`
2. **Atomic Updates**: All files updated in transaction (rollback on any failure)
3. **Git Integration**: Auto-commit with message "chore: sync CFN Loop from CLAUDE.md"
4. **Conflict Detection**: Warns if custom modifications detected in target files

## Integration Example

```bash
# After editing CLAUDE.md CFN Loop section
/cfn-claude-sync --verbose

# Review changes in dry-run mode first
/cfn-claude-sync --dry-run

# Apply changes
/cfn-claude-sync
```

## Next Steps After Sync

After sync completes:
1. ✅ Review git diff to verify changes
2. ✅ Run tests: `npm test`
3. ✅ Validate slash commands: `/cfn-loop "test task" --dry-run`
4. ✅ Commit changes: `git commit -m "chore: sync CFN Loop configuration"`

## Maintenance

**When to run this command:**
- After editing CFN Loop rules in CLAUDE.md
- Before publishing new package version
- When adding new CFN Loop slash commands
- During CFN Loop architecture refactoring

**Automation:**
Add to pre-commit hook:
```bash
# .git/hooks/pre-commit
if git diff --cached --name-only | grep -q "CLAUDE.md"; then
  /cfn-claude-sync --dry-run
  echo "⚠️  CLAUDE.md changed - run /cfn-claude-sync before committing"
fi
```
