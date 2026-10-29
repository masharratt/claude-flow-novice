#!/usr/bin/env bash
# cfn-post-edit-check-hook — PostToolUse (Edit|Write|MultiEdit) hook.
#
# Runs post-edit-pipeline.js on the edited file automatically (it used to run
# only when an agent remembered cfn-invoke-post-edit.sh) and reports ONLY real
# findings back to the model as one hookSpecificOutput.additionalContext
# message:
#   - possible secrets (security scanner)
#   - shellcheck warning/error findings (notes and style dropped)
#   - blocking bash-validator errors
#   - cargo check failures
# tsc/eslint/prettier are skipped (CFN_POST_EDIT_SKIP_JS_TOOLS=1): per-file tsc
# lacks the project tsconfig, so its warnings were mostly false and cost ~6s.
#
# Silent when clean. Never blocks: every path exits 0. The pipeline runs with
# cwd in a state dir so its .artifacts/ log never lands in the edited project.
# Env: CFN_POST_EDIT_STATE_DIR (default ~/.claude/cfn-data/post-edit),
#      CFN_POST_EDIT_TIMEOUT seconds (default 20).
# Tests: tests/test-post-edit-check-hook.sh
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0
command -v node >/dev/null 2>&1 || exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PIPELINE="$HOOK_DIR/post-edit-pipeline.js"
[ -f "$PIPELINE" ] || exit 0

INPUT=$(cat 2>/dev/null) || exit 0
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$FILE" ] && [ -f "$FILE" ] || exit 0

case "$FILE" in
  */node_modules/*|*/.git/*|*/dist/*|*/build/*|*/target/*|*/.backups/*|*/.artifacts/*) exit 0 ;;
esac
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.sh|*.bash|*.py|*.rs) ;;
  *) exit 0 ;;
esac

STATE="${CFN_POST_EDIT_STATE_DIR:-$HOME/.claude/cfn-data/post-edit}"
mkdir -p "$STATE" 2>/dev/null || exit 0
OUT_FILE=$(mktemp "$STATE/run.XXXXXX" 2>/dev/null) || exit 0
trap 'rm -f "$OUT_FILE"' EXIT

(cd "$STATE" && CFN_POST_EDIT_SKIP_JS_TOOLS=1 \
  timeout "${CFN_POST_EDIT_TIMEOUT:-20}" node "$PIPELINE" "$FILE" >"$OUT_FILE" 2>/dev/null) || true

python3 -c '
import json, re, sys
path, out_file = sys.argv[1], sys.argv[2]
items = []
try:
    lines = open(out_file, encoding="utf-8", errors="replace").read().splitlines()
except Exception:
    sys.exit(0)
for line in lines:
    try:
        d = json.loads(line)
    except Exception:
        continue
    st = d.get("status")
    if st in ("VALIDATOR_ERROR", "CARGO_CHECK_FAIL"):
        items.append((st + ": " + str(d.get("message") or ""))[:200])
    sec = d.get("security")
    if isinstance(sec, dict) and sec.get("passed") is False:
        kinds = ", ".join(sec.get("issues") or []) or "unknown pattern"
        items.append(f"possible secret ({kinds}): remove it, load from env instead")
    sc = d.get("shellcheck")
    if isinstance(sc, dict):
        for f in sc.get("findings") or []:
            if re.search(r": (warning|error): ", f):
                items.append("shellcheck " + f.split("/")[-1][:200])
seen, uniq = set(), []
for i in items:
    if i not in seen:
        seen.add(i); uniq.append(i)
if not uniq:
    sys.exit(0)
msg = "post-edit check for " + path + ":\n" + "\n".join("- " + i for i in uniq[:10])
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": msg}}))
' "$FILE" "$OUT_FILE" 2>/dev/null || true

exit 0
