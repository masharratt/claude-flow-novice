# RTK (Rust Token Killer) Commands

Load when: checking rtk savings, debugging rtk output, or `rtk` misbehaves. The always-loaded diff-grep warning is in `~/.claude/RTK.md`.

**Usage**: Token-optimized CLI proxy (60-90% savings on dev operations)

## Meta Commands (always use rtk directly)

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
```

## Installation Verification

```bash
rtk --version         # Should show: rtk X.Y.Z
rtk gain              # Should work (not "command not found")
which rtk             # Verify correct binary
```

**Name collision**: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## Hook-Based Usage

All other commands are automatically rewritten by the Claude Code hook (`rtk-rewrite.sh`, PreToolUse).
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)
