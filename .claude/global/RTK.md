# RTK - Rust Token Killer

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

⚠️ **Name collision**: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## Hook-Based Usage

All other commands are automatically rewritten by the Claude Code hook.
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

Refer to CLAUDE.md for full command reference.

## Do not grep rtk-shaped diff output

rtk compresses `git diff` into its own line-shifted format (`~ 96 ... → ...`), so the `+`
and `-` line prefixes a grep expects are not reliably present. `git diff -- <file> | grep -E
'^[-+]'` can print nothing for a file that has a real diff.

**A hunk count of zero from a grep is not evidence of no diff.** Read that way on
2026-09-05, it caused a file with a genuine change to be unstaged from a commit, needing two
follow-up commits to recover.

Use instead:

- `git diff --numstat -- <file>` for whether a file changed. Counts survive rtk.
- `git log -1 -- <file>` for who touched it last.
- `diff <(git show HEAD:<file>) <file>` or `rtk proxy git diff -- <file>` to read content.

Never unstage a file on the strength of an empty grep.
