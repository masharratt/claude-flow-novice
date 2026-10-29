#!/usr/bin/env bash
# Tests for cfn-post-edit-check-hook.sh (PostToolUse Edit|Write|MultiEdit).
#
# Harness audit 2026-10-28: the post-edit checker only ran when an agent
# remembered to call cfn-invoke-post-edit.sh, and its per-file TypeScript
# warnings were mostly false. The hook runs it on every edit, skips the
# tsc/eslint/prettier phase, and reports only real findings as one compact
# additionalContext message. Silent when clean; never blocks.
#
# Run: bash tests/test-post-edit-check-hook.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$REPO_ROOT/.claude/hooks/cfn-post-edit-check-hook.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-post-edit-check.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
PROJ="$WORK/proj"
mkdir -p "$PROJ/src" "$PROJ/node_modules/pkg"
export CFN_POST_EDIT_STATE_DIR="$WORK/state"

fire() { # tool path -> stdout of hook; rc in $RC
  local payload
  payload=$(python3 -c 'import json,sys; print(json.dumps({"session_id":"s1","tool_name":sys.argv[1],"tool_input":{"file_path":sys.argv[2]},"cwd":sys.argv[3]}))' "$1" "$2" "$PROJ")
  OUT=$(printf '%s' "$payload" | (cd "$PROJ" && timeout 60 bash "$HOOK" 2>/dev/null))
  RC=$?
}

# 1. Real shellcheck finding is reported, naming the file and the code.
printf '#!/usr/bin/env bash\nrm -rf $1/*\n' > "$PROJ/src/bad.sh"
fire Edit "$PROJ/src/bad.sh"
[ "$RC" = 0 ] && ok "bad shell: exit 0" || bad "bad shell: rc=$RC"
[[ "$OUT" == *additionalContext* && "$OUT" == *bad.sh* && "$OUT" == *SC2* ]] \
  && ok "bad shell: finding reported" || bad "bad shell: no finding in '$OUT'"

# 2. Clean shell file: no output at all.
printf '#!/usr/bin/env bash\nset -euo pipefail\necho "hello"\n' > "$PROJ/src/clean.sh"
fire Write "$PROJ/src/clean.sh"
[ "$RC" = 0 ] && [ -z "$OUT" ] && ok "clean shell: silent" || bad "clean shell: rc=$RC out='$OUT'"

# 3. Files under node_modules are skipped even when they would warn.
cp "$PROJ/src/bad.sh" "$PROJ/node_modules/pkg/bad.sh"
fire Edit "$PROJ/node_modules/pkg/bad.sh"
[ "$RC" = 0 ] && [ -z "$OUT" ] && ok "node_modules: skipped" || bad "node_modules: out='$OUT'"

# 4. Missing file and non-edit tool: silent exit 0.
fire Edit "$PROJ/src/nope.sh"
[ "$RC" = 0 ] && [ -z "$OUT" ] && ok "missing file: silent" || bad "missing file: rc=$RC out='$OUT'"
OUT=$(printf '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | bash "$HOOK" 2>/dev/null); RC=$?
[ "$RC" = 0 ] && [ -z "$OUT" ] && ok "non-edit tool: silent" || bad "non-edit tool: out='$OUT'"

# 5. Hardcoded credential is reported. Built at runtime so this test file
#    itself never carries a credential-shaped literal.
#    (security-scanner.sh knows Google/npm/JWT/sk-proj/`key: "..."` shapes
#    only; AWS keys and `key = "..."` are not detected as of 2026-10-29.)
KEY="npm_""$(printf 'a%.0s' $(seq 1 36))"
printf 'const t = "%s";\n' "$KEY" > "$PROJ/src/leak.js"
fire Write "$PROJ/src/leak.js"
[[ "$OUT" == *additionalContext* && "$OUT" == *leak.js* ]] \
  && ok "credential: reported" || bad "credential: not reported, out='$OUT'"

# 6. TypeScript: tsc/eslint/prettier phases skipped (no TYPE/LINT noise) and fast.
mkdir -p "$PROJ/node_modules/.bin"
printf '#!/usr/bin/env bash\nsleep 5\necho "src/x.ts(1,1): error TS2307: Cannot find module"\nexit 2\n' > "$PROJ/node_modules/.bin/tsc"
chmod +x "$PROJ/node_modules/.bin/tsc"
echo '{"name":"p"}' > "$PROJ/package.json"
printf 'import { a } from "@ws/missing";\nexport const b = a;\n' > "$PROJ/src/x.ts"
START=$(date +%s)
fire Edit "$PROJ/src/x.ts"
ELAPSED=$(( $(date +%s) - START ))
[ "$ELAPSED" -lt 5 ] && ok "typescript: tsc not run (${ELAPSED}s)" || bad "typescript: took ${ELAPSED}s, tsc ran"
[[ "$OUT" != *TS2307* && "$OUT" != *TYPE_WARNING* && "$OUT" != *LINT_ISSUES* ]] \
  && ok "typescript: no type/lint noise" || bad "typescript: noise in '$OUT'"

# 8. Widened secret formats (2026-10-29): AWS access key, GitHub token,
#    private key block. Built at runtime: no credential-shaped literal here.
printf 'aws_access = "%s"\n' "AKIA""IOSFODNN7""EXAMPLE" > "$PROJ/src/aws.py"
fire Write "$PROJ/src/aws.py"
[[ "$OUT" == *AWS_ACCESS_KEY* ]] && ok "aws key: reported" || bad "aws key: out='$OUT'"
printf 'GH="%s"\n' "ghp_""$(printf 'b%.0s' $(seq 1 36))" > "$PROJ/src/gh.sh"
fire Write "$PROJ/src/gh.sh"
[[ "$OUT" == *GITHUB_TOKEN* ]] && ok "github token: reported" || bad "github token: out='$OUT'"
printf 'K="%s"\n' "-----BEGIN RSA ""PRIVATE KEY-----" > "$PROJ/src/pk.sh"
fire Write "$PROJ/src/pk.sh"
[[ "$OUT" == *PRIVATE_KEY* ]] && ok "private key: reported" || bad "private key: out='$OUT'"

# 9. Scanner findings that are not secrets stay silent: a package.json with
#    versions (INSECURE_DEPENDENCIES) and a SQL string (SQL_INJECTION) were
#    reported as "possible secret" by the first version of this hook.
printf '{"name":"p","version":"1.2.3"}\n' > "$PROJ/src/package.json"
fire Edit "$PROJ/src/package.json"
[ -z "$OUT" ] && ok "package.json: silent" || bad "package.json: out='$OUT'"
printf 'q = "SELECT * FROM t WHERE a = %s"\n' "'x'" > "$PROJ/src/q.py"
fire Edit "$PROJ/src/q.py"
[ -z "$OUT" ] && ok "sql string: silent" || bad "sql string: out='$OUT'"

# 7. The checker's log never lands in the edited project.
[ ! -d "$PROJ/.artifacts" ] && ok "no .artifacts in project" || bad ".artifacts created in project"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
