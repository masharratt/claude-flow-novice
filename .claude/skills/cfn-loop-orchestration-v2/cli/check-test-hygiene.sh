#!/usr/bin/env bash
# check-test-hygiene.sh — detect tests silently disabled to game the gate (W3 / G39).
# Flags focused/skipped/todo test markers. A same-line `// cfn-allow-skip: <reason>`
# (or `# cfn-allow-skip:`) suppresses the finding — that is the recorded-quarantine
# representation (W4). Findings the coordinator treats as a Phase-3 gate FAIL.
#
# Usage:   check-test-hygiene.sh [--all | <file>...]
#            (no args)  -> changed test files via `git diff --name-only HEAD`, filtered to test paths
#            --all      -> every tracked test file in the repo
#            <file>...  -> exactly the named files
# Output:  JSON findings array: [{"file":"...","line":N,"pattern":"...","text":"..."}]
#          Empty array [] when clean.
# Exit:    0 = no findings, 1 = one or more findings, 2 = usage error.
set -uo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# marker patterns (ERE)
# S001 (origin: ROOTCAUSE_mpa_thread_wiring_gap.md, AC-77): `\.skip\(` requires a
# literal `(` immediately after `skip`, so `describe.skipIf(...)` never matched.
# AC-77's wiring guard was written as `describe.skipIf(!THREAD_REFACTOR_ENABLED)`,
# gated on the same flag that disables the feature, self-skipped, and the skip
# counted as green -- shipping a feature 81/81 all-green while unreachable from
# src/index.ts. skipIf/runIf/concurrent.skip/pytest.mark.skipif close that gap.
PATTERNS=(
  '\.only\('
  '\.skip\('
  '\.skipIf\('
  '\.runIf\('
  '\.concurrent\.skip'
  '\.todo\('
  '\bfit\('
  '\bxit\('
  '\bxdescribe\('
  '\bxtest\('
  '@pytest\.mark\.skip'
  'pytest\.mark\.skipif'
  'pytest\.skip\('
)

# a path is a test file if it matches one of these
is_test_path() {
  echo "$1" | grep -qE '(\.(test|spec)\.[jt]sx?$|_test\.(py|go|rb)$|(^|/)test_[^/]*\.py$|(^|/)__tests__/|(^|/)tests?/)'
}

MODE="changed"
FILES=()
if [ "${1:-}" = "--all" ]; then
  MODE="all"
elif [ $# -gt 0 ]; then
  MODE="explicit"; FILES=("$@")
fi

case "$MODE" in
  changed)
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      is_test_path "$f" && [ -f "$PROJECT_ROOT/$f" ] && FILES+=("$PROJECT_ROOT/$f")
    done < <(cd "$PROJECT_ROOT" && git diff --name-only HEAD 2>/dev/null || true)
    ;;
  all)
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      is_test_path "$f" && FILES+=("$PROJECT_ROOT/$f")
    done < <(cd "$PROJECT_ROOT" && git ls-files 2>/dev/null || true)
    ;;
esac

json_escape() {
  local s=$1
  s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

findings=()
for file in "${FILES[@]:-}"; do
  [ -n "$file" ] || continue
  [ -f "$file" ] || continue
  for pat in "${PATTERNS[@]}"; do
    while IFS= read -r match; do
      [ -n "$match" ] || continue
      line_no="${match%%:*}"
      text="${match#*:}"
      # suppression: same-line cfn-allow-skip marker
      echo "$text" | grep -q 'cfn-allow-skip:' && continue
      findings+=("{\"file\":\"$(json_escape "$file")\",\"line\":${line_no},\"pattern\":\"$(json_escape "${pat}")\",\"text\":\"$(json_escape "$(echo "$text" | sed -e 's/^[[:space:]]*//' | cut -c1-120)")\"}")
    done < <(grep -nE "$pat" "$file" 2>/dev/null || true)
  done
done

if [ "${#findings[@]}" -eq 0 ]; then
  echo '[]'
  exit 0
fi
printf '[%s]\n' "$(IFS=,; echo "${findings[*]}")"
exit 1
