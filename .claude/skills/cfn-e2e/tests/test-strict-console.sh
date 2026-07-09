#!/usr/bin/env bash
# test-strict-console.sh: verifies the --strict-console wiring detection in
# run-e2e-smart.sh (present vs partial vs absent => console_guard value + exit
# code). Uses temp fixtures and a stubbed npx; requires no live browser.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="$SKILL_DIR/run-e2e-smart.sh"

TESTS_RUN=0
PASSED=0
FAILED=0

pass() { echo "PASS: $1"; PASSED=$((PASSED + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
fail() { echo "FAIL: $1"; FAILED=$((FAILED + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# Stub npx so the "run" phase is a browser-free no-op that reports success.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/npx" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$WORK/bin/npx"

# Create a project root with a single spec whose import line is $2.
make_project() {
    local root="$1" import_line="$2"
    mkdir -p "$root/tests/e2e"
    cat > "$root/tests/e2e/foo.spec.ts" <<EOF
$import_line
test('sample', async ({ page }) => {});
EOF
}

# Extract the console_guard value from a results JSON file.
read_guard() {
    sed -n 's/.*"console_guard": *"\([a-z]*\)".*/\1/p' "$1"
}

run_strict() {
    # run_strict <project_root> <results_file>  -> echoes exit code
    local root="$1" res="$2" code=0
    set +e
    PATH="$WORK/bin:$PATH" PROJECT_ROOT="$root" RESULTS_FILE="$res" \
        CFN_E2E_STRICT_CONSOLE=1 bash "$RUNNER" >"$WORK/run.log" 2>&1
    code=$?
    set -e
    echo "$code"
}

# Case 1: absent (spec imports @playwright/test, not the guard)
P1="$WORK/absent"
R1="$WORK/absent.json"
make_project "$P1" "import { test, expect } from '@playwright/test';"
CODE1="$(run_strict "$P1" "$R1")"
[[ "$CODE1" == "1" ]] && pass "absent: exit code 1" || fail "absent: exit code $CODE1 (want 1)"
[[ -f "$R1" ]] && pass "absent: results file written" || fail "absent: no results file"
G1="$(read_guard "$R1" 2>/dev/null || echo "")"
[[ "$G1" == "absent" ]] && pass "absent: console_guard=absent" || fail "absent: console_guard='$G1' (want absent)"

# Case 2: present (spec imports the console-guard fixture)
P2="$WORK/present"
R2="$WORK/present.json"
make_project "$P2" "import { test, expect } from './fixtures/console-guard';"
CODE2="$(run_strict "$P2" "$R2")"
[[ "$CODE2" == "0" ]] && pass "present: exit code 0" || fail "present: exit code $CODE2 (want 0)"
G2="$(read_guard "$R2" 2>/dev/null || echo "")"
[[ "$G2" == "present" ]] && pass "present: console_guard=present" || fail "present: console_guard='$G2' (want present)"
if grep -q '"artifacts"' "$R2" && grep -q '"failed_files"' "$R2"; then
    pass "present: artifacts and failed_files arrays present"
else
    fail "present: missing artifacts/failed_files arrays"
fi

# Case 3: partial (one spec imports the guard, one does not)
P3="$WORK/partial"
R3="$WORK/partial.json"
make_project "$P3" "import { test, expect } from './fixtures/console-guard';"
cat > "$P3/tests/e2e/bar.spec.ts" <<'EOF'
import { test, expect } from '@playwright/test';
test('sample2', async ({ page }) => {});
EOF
CODE3="$(run_strict "$P3" "$R3")"
[[ "$CODE3" == "0" ]] && pass "partial: exit code 0 (strict only fails on absent)" || fail "partial: exit code $CODE3 (want 0)"
G3="$(read_guard "$R3" 2>/dev/null || echo "")"
[[ "$G3" == "partial" ]] && pass "partial: console_guard=partial" || fail "partial: console_guard='$G3' (want partial)"

# Case 4: non-strict mode is unchanged (no console_guard key)
P4="$WORK/nonstrict"
R4="$WORK/nonstrict.json"
make_project "$P4" "import { test, expect } from '@playwright/test';"
CODE4=0
set +e
PATH="$WORK/bin:$PATH" PROJECT_ROOT="$P4" RESULTS_FILE="$R4" \
    bash "$RUNNER" >"$WORK/run4.log" 2>&1
CODE4=$?
set -e
[[ "$CODE4" == "0" ]] && pass "non-strict: exit code 0" || fail "non-strict: exit code $CODE4 (want 0)"
if grep -q '"console_guard"' "$R4"; then
    fail "non-strict: console_guard key leaked into output"
else
    pass "non-strict: no console_guard key (behavior unchanged)"
fi

echo ""
echo "=========================================="
echo "Strict-console wiring tests"
echo "  Run:    $TESTS_RUN"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "=========================================="

[[ $FAILED -eq 0 ]] && exit 0 || exit 1
