# RTK - Rust Token Killer

A PreToolUse hook (`rtk-rewrite.sh`) rewrites shell commands through rtk automatically. Meta commands, install check, name collision: load `~/.claude/references/rtk.md` when checking savings or rtk misbehaves.

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
