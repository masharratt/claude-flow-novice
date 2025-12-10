# Claude Code Hooks

This directory contains hooks that integrate with Claude Code's lifecycle events.

## cfn-precompact-enhanced.sh

Enhanced PreCompact hook that preserves context before conversation compaction (manual or auto).

### Features

**Context Preservation:**
- Captures current git state (branch, status, recent commits)
- Saves uncommitted and staged changes
- Records modified files

**Session Metrics:**
- Counts recently edited files
- Estimates session duration from git history
- Detects test execution and status
- Tracks tool usage (if transcript available)
- Approximates token usage

**CFN-Specific Detection:**
- Active CFN Loop tasks
- Running CFN Docker containers
- Redis coordination state
- Recent pre-edit backups

**Output:**
- Prints structured summary to stdout (injected into Claude's context)
- Saves detailed JSON log to `.artifacts/precompact/session-{timestamp}.json`
- Includes CLAUDE.md reminders for best practices

### Configuration

The hook is configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/bin/bash .claude/hooks/cfn-precompact-enhanced.sh"
          }
        ]
      },
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "/bin/bash .claude/hooks/cfn-precompact-enhanced.sh"
          }
        ]
      }
    ]
  }
}
```

### Performance

- **Timeout Protection**: 9-second overall script timeout
- **Non-Blocking**: Always exits with code 0
- **Optimized for WSL2**: Limits `find` depth and targets specific directories
- **Graceful Degradation**: Continues if git/jq unavailable

### Testing

```bash
# Test without stdin
./.claude/hooks/cfn-precompact-enhanced.sh

# Test with simulated input
echo '{"type": "manual", "compact_type": "manual"}' | \
  CLAUDE_PROJECT_DIR=$(pwd) bash .claude/hooks/cfn-precompact-enhanced.sh
```

### Output Example

```
=== PRE-COMPACT CONTEXT PRESERVATION ===

Compact Type: manual
Timestamp: 2025-12-10 04:46:26

Git State:
  Branch: feature/auth-system
  Uncommitted: 3 files
  Modified: 2 files
  Staged: 1 files
  Last commit: abc123 - "Add JWT validation" (2 hours ago)

Session Summary:
  Recent file edits: 5
  Duration: 45 minutes
  Tests run: true
  Test status: passing
  Tools used: 12 (Bash: 8, Edit: 4)
  Approx tokens: ~800

Key Context:
  - Working directory: /path/to/project
  - Uncommitted changes
  - 2 CFN container(s) running

Full context saved to: .artifacts/precompact/session-1765370786.json

=== CLAUDE.md REMINDERS ===
• Use CFN Loop for multi-step tasks
• Batch operations in single messages
• Pre-edit backup required before edits
• Run tests before commits
• Use service names in Docker networks
```

### Artifacts

Session data is preserved in:
- `.artifacts/precompact/session-{timestamp}.json` - Full JSON context
- `.artifacts/precompact/{timestamp}-git.diff` - Git diff (if changes exist)
- `.artifacts/precompact/{timestamp}-commits.txt` - Recent commit history
- `.artifacts/precompact/backup-{todo-file}-{timestamp}` - Copied todo files

### Environment Variables

- `CLAUDE_PROJECT_DIR` - Project root (defaults to `pwd`)
- `TRANSCRIPT_PATH` - Path to conversation transcript (optional, for tool usage stats)
- `INPUT` - JSON input from Claude Code (compact_type, custom_instructions)

### Troubleshooting

**Hook times out:**
- Check if running on Windows mount (should be Linux filesystem)
- Verify timeout settings in script (default 9 seconds)
- Reduce `find` depth or target fewer directories

**No JSON output:**
- Ensure `.artifacts/precompact/` directory exists
- Check for `jq` availability (gracefully degrades if missing)

**Line ending issues:**
- Convert to Unix line endings: `dos2unix .claude/hooks/cfn-precompact-enhanced.sh`
- Or use: `sed -i 's/\r$//' .claude/hooks/cfn-precompact-enhanced.sh`
