# Conversation Sync Skill

Automatically sync Claude Code conversation sessions from `.codex/sessions` to `.claude.json` for context preservation and backup.

## Quick Start

```bash
# Sync conversations from last 7 days
./.claude/skills/conversation-sync/sync-conversations.sh

# Sync for this specific project
./.claude/skills/conversation-sync/sync-conversations.sh --project claude-flow-novice

# See what would be synced (dry run)
./.claude/skills/conversation-sync/sync-conversations.sh --dry-run
```

## Use Cases

### After System Crash
When WSL, Docker, or VS Code crashes, conversation history in `.codex/sessions` can be referenced in `.claude.json` to restore context:

```bash
./.claude/skills/conversation-sync/sync-conversations.sh --days 1
```

### Project Handoff
Before handing off a project, sync recent conversations for context:

```bash
./.claude/skills/conversation-sync/sync-conversations.sh --project myproject --days 14
```

### Backup Before Major Changes
Create a conversation backup before major refactors:

```bash
./.claude/skills/conversation-sync/sync-conversations.sh --from 2025-11-01 --to 2025-11-26
```

## How It Works

1. **Locates** `.codex/sessions` directory (supports Windows and Linux paths)
2. **Filters** conversation JSONL files by:
   - Date range (last N days or specific dates)
   - Project working directory
3. **Extracts** session metadata (ID, date, file path)
4. **Updates** `.claude.json` with conversation references
5. **Preserves** existing conversations (idempotent)

## Options

| Option | Description | Example |
|--------|-------------|---------|
| `--days N` | Sync last N days | `--days 14` |
| `--project NAME` | Filter by project | `--project claude-flow-novice` |
| `--from DATE` | Start date (YYYY-MM-DD) | `--from 2025-11-20` |
| `--to DATE` | End date (YYYY-MM-DD) | `--to 2025-11-26` |
| `--dry-run` | Preview without changes | `--dry-run` |
| `-h, --help` | Show help | `-h` |

## Output Format

The skill updates `.claude.json`:

```json
{
  "conversations": [
    {
      "session_id": "rollout-2025-11-24T10-24-43-019ab71c-699f-7052-8ce1-892b6208ba94",
      "date": "2025/11/24",
      "file": "/mnt/c/Users/masha/.codex/sessions/2025/11/24/rollout-2025-11-24T10-24-43-019ab71c-699f-7052-8ce1-892b6208ba94.jsonl"
    }
  ]
}
```

## Conversation File Locations

The skill searches these locations:

1. `/mnt/c/Users/{username}/.codex/sessions/` (Windows/WSL)
2. `~/.codex/sessions/` (Linux)
3. `/mnt/c/Users/masha/.codex/sessions/` (fallback)

## Requirements

- `bash` 4.0+
- `jq` (JSON processor)
  ```bash
  sudo apt-get install jq
  ```
- Read access to `.codex/sessions`

## Safety Features

- **Idempotent**: Safe to run multiple times
- **Non-destructive**: Preserves existing conversations
- **Dry-run mode**: Preview before changes
- **Validation**: Checks file existence and JSON structure
- **Sorted output**: Newest conversations first

## Troubleshooting

### "Could not find .codex/sessions directory"
The `.codex` directory is created by Claude Code. Ensure you've used Claude Code at least once.

### "jq is required but not installed"
Install jq:
```bash
sudo apt-get install jq
```

### No conversations found
Check date range and project filter. Use `--dry-run` to debug:
```bash
./.claude/skills/conversation-sync/sync-conversations.sh --dry-run --days 30
```

## Integration with Other Skills

This skill can be called from other scripts:

```bash
# In your automation script
./.claude/skills/conversation-sync/sync-conversations.sh --project "$PROJECT_NAME" --days 7
```

## Related

- `.claude.json` - Conversation reference storage
- `.codex/sessions/` - Source conversation data
- `CLAUDE.md` - Project instructions (can reference conversations)
