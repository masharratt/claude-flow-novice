---
name: cfn-expert-update
description: "Update CFN system expert agent with relevant git commits since last scan"
argument-hint: "[--dry-run] [--since=commit_hash] [--force]"
allowed-tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# CFN Expert Update

Scan git commits since last run and update the CFN system expert agent with relevant process changes.

## Purpose

Updates the `.claude/agents/custom/cfn-system-expert.md` agent with:
- New CLI commands and patterns
- Updated CFN Loop processes
- New skills and coordination patterns
- Cost optimization strategies
- Adaptive context lessons

## Execution

```bash
# Standard update (scans since last tracked commit)
/cfn-expert-update

# Dry run (show what would be updated without making changes)
/cfn-expert-update --dry-run

# Force scan from specific commit
/cfn-expert-update --since=abc123

# Force full re-scan (ignore last commit tracking)
/cfn-expert-update --force
```

## Process

### 1. Commit Tracking
- Reads last scanned commit from `.claude/state/cfn-expert-last-commit`
- Scans git log from that point to HEAD
- Updates tracking file after successful scan

### 2. Relevance Detection
Scans commits for CFN-related patterns:
- `CLAUDE.md` changes (system rules)
- `.claude/commands/cfn/` additions/modifications
- `.claude/skills/cfn-*` updates
- Agent coordination patterns
- Cost optimization updates
- CFN Loop methodology changes

### 3. Knowledge Extraction
For relevant commits, extracts:
- New commands and usage patterns
- Updated processes and workflows
- Performance insights
- Bug fixes and solutions
- Cost optimization strategies

### 4. Agent Update
Updates the expert agent with:
- Enhanced command knowledge
- New troubleshooting patterns
- Updated best practices
- Current cost comparison data
- Latest adaptive context lessons

## State Management

**Last Commit Tracking**: `.claude/state/cfn-expert-last-commit`
```
abc123def456789  # Commit hash of last scan
2025-01-15T10:30:00Z  # Timestamp of last update
```

**Backup Strategy**: Creates backup before updates:
```
.claude/backups/cfn-expert/20250115_103000_cfn-system-expert.md
```

## Relevance Patterns

**High Priority** (always updates):
- `CLAUDE.md` modifications
- `/cfn-loop-*` command changes
- CFN Loop methodology updates

**Medium Priority** (contextual updates):
- `.claude/skills/cfn-*` changes
- Agent coordination improvements
- Cost optimization strategies

**Low Priority** (informational):
- Documentation updates
- Test additions
- Performance improvements

## Output Examples

### Dry Run Mode
```
🔍 Scanning commits since abc123def (5 commits found)
📋 Relevant commits: 3/5
🎯 Updates available:
  • New command: /cfn-loop-frontend (P1: 0.95)
  • Updated cost table (P2: 0.87)
  • New coordination pattern (P3: 0.92)

💡 Run without --dry-run to apply updates
```

### Update Mode
```
🔍 Scanning commits since abc123def (5 commits found)
📋 Relevant commits: 3/5
🎯 Applying 3 updates to cfn-system-expert agent:
  ✅ Added /cfn-loop-frontend command knowledge
  ✅ Updated cost optimization strategies
  ✅ Enhanced coordination patterns

📁 Backup created: .claude/backups/cfn-expert/20250115_103000_*
📝 Last commit updated: def456abc789
🔄 Expert agent updated successfully
```

## Error Handling

- **No new commits**: "No new commits to scan"
- **No relevant changes**: "No CFN-relevant changes found"
- **Git errors**: Check repository status and permissions
- **File errors**: Verify agent file exists and is writable

---

## Implementation Notes

- Uses git log with commit hash filtering
- Pattern matching for relevance detection
- Safe updates with backup/restore capability
- Idempotent operations (safe to re-run)
- Timestamp tracking for audit trail