#!/bin/bash
# Test for cfn-docs-sync-check.sh
# Feeds staged file lists via stdin (CFN_DOCS_SYNC_STDIN=1) and asserts warn/block behavior.
set -uo pipefail

HOOK="$(git rev-parse --show-toplevel)/.claude/hooks/cfn-docs-sync-check.sh"
pass=0; fail=0

run() { # <stdin-files> <strict> -> echoes exit code
    printf '%s' "$1" | CFN_DOCS_SYNC_STDIN=1 CFN_DOCS_SYNC_STRICT="$2" bash "$HOOK" >/dev/null 2>&1
    echo $?
}
assert() { # <label> <got> <want>
    if [ "$2" = "$3" ]; then echo "  PASS: $1"; pass=$((pass+1));
    else echo "  FAIL: $1 (got $2, want $3)"; fail=$((fail+1)); fi
}

# 1. Code changed, docs missing, non-strict -> warn (exit 0)
assert "code+no-docs non-strict warns" "$(run 'src/app.ts' 0)" 0
# 2. Code changed, docs missing, strict -> block (exit 1)
assert "code+no-docs strict blocks" "$(run 'src/app.ts' 1)" 1
# 3. Code changed, both docs staged, strict -> pass (exit 0)
assert "code+both-docs strict passes" "$(run $'src/app.ts\nreadme/feature-status.md\nreadme/state-machines.md' 1)" 0
# 4. Only one doc staged, strict -> block (exit 1)
assert "code+one-doc strict blocks" "$(run $'src/app.ts\nreadme/feature-status.md' 1)" 1
# 5. Doc-only commit, strict -> pass (no code, exit 0)
assert "docs-only strict passes" "$(run 'README.md' 1)" 0
# 6. Non-source code path (.json), strict -> pass (exit 0)
assert "json-only strict passes" "$(run 'src/config.json' 1)" 0
# 7. Empty stage -> pass
assert "empty stage passes" "$(run '' 1)" 0
# 8. Skill .md edit only, strict -> pass (md not a source ext)
assert "skill-md-only strict passes" "$(run '.claude/skills/foo/SKILL.md' 1)" 0
# 9. Skill .sh edit, no docs, strict -> block
assert "skill-sh strict blocks" "$(run '.claude/skills/foo/execute.sh' 1)" 1

echo "----"
echo "docs-sync: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
