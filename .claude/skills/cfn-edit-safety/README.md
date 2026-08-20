# Edit Safety - Unified Edit Safety Workflow

A mega-skill that consolidates pre-edit backup and post-edit validation into a unified workflow for safe file modifications.

## Features

- **Pre-edit backup**: Automatic file state capture before any modification
- **Post-edit validation**: Comprehensive validation including security checks and quality metrics
- **Automatic rollback**: Reverts changes if validation fails
- **Backup registry**: Tracks all backups with metadata
- **CLI interface**: User-friendly command-line interface
- **Batch processing**: Support for multiple file edits

## Quick Start

### Direct Usage

```bash
# Simple safe edit
bash $HOME/.claude/skills/cfn-edit-safety/edit-safety.sh edit file.txt "sed 's/old/new/g' file.txt"

# With custom agent ID
bash $HOME/.claude/skills/cfn-edit-safety/edit-safety.sh edit file.py "cp new.py file.py" "agent-123"

# Rollback a file
bash $HOME/.claude/skills/cfn-edit-safety/edit-safety.sh rollback file.txt

# List backups
bash $HOME/.claude/skills/cfn-edit-safety/edit-safety.sh list
```

### CLI Interface

```bash
# Interactive edit mode
bash $HOME/.claude/skills/cfn-edit-safety/cli/edit-safety-cli.sh edit

# Direct edit
bash $HOME/.claude/skills/cfn-edit-safety/cli/edit-safety-cli.sh edit file.txt "command"

# Batch edit from JSON config
bash $HOME/.claude/skills/cfn-edit-safety/cli/edit-safety-cli.sh batch edits.json

# Status and info
bash $HOME/.claude/skills/cfn-edit-safety/cli/edit-safety-cli.sh status

# Generate template
bash $HOME/.claude/skills/cfn-edit-safety/cli/edit-safety-cli.sh template my-edits.json
```

## Workflow

1. **Backup**: Creates timestamped backup with hash verification
2. **Edit**: Executes the provided edit command
3. **Validate**: Runs comprehensive post-edit validation
4. **Decide**:
   - If validation passes → Clean up backup
   - If validation fails → Rollback from backup

## Validation Checks

- Security analysis
- File location validation (root directory warnings)
- Code metrics calculation
- Complexity analysis
- Recommendations generation

## Configuration

### Environment Variables

- `EDIT_SAFETY_WORKSPACE`: Workspace directory (default: `/tmp/edit-safety`)
- `EDITOR`: Default text editor for interactive mode

### Batch Edit JSON Format

```json
[
  {
    "file": "/path/to/file1.txt",
    "command": "sed -i 's/old_text/new_text/g' file1.txt",
    "description": "Replace old_text with new_text"
  },
  {
    "file": "/path/to/file2.py",
    "command": "cp new_version.py file2.py",
    "description": "Update file2.py with new version"
  }
]
```

## File Structure

```
.claude/skills/cfn-edit-safety/
├── README.md                    # This file
├── SKILL.md                     # Skill specification
├── edit-safety.sh              # Main workflow script
├── cli/
│   └── edit-safety-cli.sh      # CLI interface
└── lib/
    ├── backup/
    │   ├── backup.sh           # Backup functionality
    │   └── SKILL.md            # Backup skill docs
    └── hooks/
        ├── post-edit-handler.sh # Validation handler
        ├── feedback-resolver.sh # Issue resolution
        └── ...                 # Other validation tools
```

## Integration

The edit-safety skill integrates with:

- **Hook Pipeline**: For post-edit validation
- **Backup System**: For file state management
- **Security Scanner**: For vulnerability detection
- **Code Quality Tools**: For linting and formatting checks

## Best Practices

1. Always use edit-safety for important file modifications
2. Review validation recommendations even when edit succeeds
3. Use descriptive agent IDs for better tracking
4. Clean up old backups regularly with `cleanup` command
5. Use batch mode for multiple related edits

## Troubleshooting

### Validation Failures

If validation fails but you want to keep changes:

1. Check the validation output for specific issues
2. Manually fix identified problems
3. Re-run validation if needed

### Backup Issues

If backup creation fails:

1. Check file permissions
2. Ensure disk space is available
3. Verify backup directory is writable

### Rollback Problems

If rollback doesn't work:

1. Check if backup still exists: `bash edit-safety.sh list`
2. Manually restore from backup directory if needed
3. Verify file permissions

## Migration Notes

This mega-skill consolidates:
- `pre-edit-backup/` → `edit-safety/lib/backup/`
- `cfn-hook-pipeline/` → `edit-safety/lib/hooks/`

The individual components are still functional but the unified workflow provides better integration and ease of use.