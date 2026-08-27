#!/usr/bin/env bash
# Codex hook wrapper: CFN edit-safety pre/post backups + doc-lint advisory on readme contract files.
# Wired from .codex/hooks.json (PreToolUse/PostToolUse on Edit|Write|apply_patch).
# Reads one JSON object on stdin (codex hook payload), extracts file paths, calls the CFN scripts.
# Always exits 0: advisory layer, never blocks the edit.
set -u
MODE="${1:-}"
INPUT=$(cat)

PATHS=$(printf '%s' "$INPUT" | python3 -c '
import json, re, sys

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

ti = d.get("tool_input") or d.get("input") or {}
if not isinstance(ti, dict):
    ti = {}
paths = set()
for k in ("file_path", "filePath", "path"):
    v = ti.get(k)
    if isinstance(v, str) and v:
        paths.add(v)
cmd = ti.get("command")
if isinstance(cmd, str):
    for m in re.finditer(r"\*\*\* (?:Update|Add|Delete) File: (.+)", cmd):
        paths.add(m.group(1).strip())
for line in sorted(paths):
    print(line)
')

[ -z "$PATHS" ] && exit 0

while IFS= read -r FILE; do
    [ -z "$FILE" ] && continue
    case "$MODE" in
        pre)
            "$HOME/.claude/hooks/cfn-invoke-pre-edit.sh" "$FILE" --agent-id codex >/dev/null 2>&1
            ;;
        post)
            "$HOME/.claude/hooks/cfn-invoke-post-edit.sh" "$FILE" --agent-id codex >/dev/null 2>&1
            case "$FILE" in
                readme/feature-status.md|readme/state-machines.md)
                    # advisory: doc-lint contract check, non-blocking
                    "$HOME/.claude/skills/cfn-doc-lint/execute.sh" --check-all "$PWD" >/dev/null 2>&1 \
                        || echo "doc-lint: contract violation near $FILE — fix before commit" >&2
                    ;;
            esac
            ;;
    esac
done <<< "$PATHS"

exit 0
