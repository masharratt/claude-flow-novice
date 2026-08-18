#!/usr/bin/env bash
# Shared test helper for cfn-decisions tests.
# Source from each test file: `source "$(dirname "$0")/_test_helper.sh"`.
# Matches the bless-verify / cfn-workbench plain-bash style (no bats).
#
# Conventions (CLAUDE.md test-db safety):
#   - Slugs match ^test-dec-[a-z0-9]{6}$ (per-test randomization).
#   - Decision ids match ^test-D<NN>$.
#   - Every test overrides --root to a mktemp -d (NEVER the real planning/).
#   - SQLite teardown is marker-scoped:
#       DELETE FROM decisions WHERE slug LIKE 'test-dec-%'
#   - No unscoped DELETE/TRUNCATE. No FK-check disable.

set -uo pipefail

# Color output (optional; auto-disables if not a TTY).
if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  C_GREEN="$(tput setaf 2)"
  C_RED="$(tput setaf 1)"
  C_RESET="$(tput sgr0)"
else
  C_GREEN=""; C_RED=""; C_RESET=""
fi

# Counters (reset per file).
RUN=0
PASS=0
FAIL=0
FAILED_TESTS=()

# ok <name> - record a passing sub-assertion.
ok() {
  RUN=$((RUN+1)); PASS=$((PASS+1));
  printf '%sPASS%s: %s\n' "$C_GREEN" "$C_RESET" "$1"
}

# fail <name> [detail] - record a failing sub-assertion.
fail() {
  RUN=$((RUN+1)); FAIL=$((FAIL+1));
  FAILED_TESTS+=("$1")
  printf '%sFAIL%s: %s' "$C_RED" "$C_RESET" "$1"
  [ $# -gt 1 ] && printf ' (%s)' "$2"
  printf '\n'
}

# assert_eq <actual> <expected> <name>
assert_eq() {
  local actual="$1" expected="$2" name="$3"
  if [ "$actual" = "$expected" ]; then
    ok "$name"
  else
    fail "$name" "actual=[$actual] expected=[$expected]"
  fi
}

# assert_contains <haystack> <needle> <name>
assert_contains() {
  local haystack="$1" needle="$2" name="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    ok "$name"
  else
    fail "$name" "missing substring [$needle]"
  fi
}

# assert_not_contains <haystack> <needle> <name>
assert_not_contains() {
  local haystack="$1" needle="$2" name="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    fail "$name" "unexpected substring [$needle] present"
  else
    ok "$name"
  fi
}

# assert_match <pattern> <haystack> <name> (grep -E)
assert_match() {
  local pattern="$1" haystack="$2" name="$3"
  if printf '%s' "$haystack" | grep -qE -- "$pattern"; then
    ok "$name"
  else
    fail "$name" "no match for /$pattern/"
  fi
}

# assert_exit <exit_code> <expected> <name>
assert_exit() {
  if [ "$1" -eq "$2" ]; then
    ok "$3"
  else
    fail "$3" "exit=$1 wanted=$2"
  fi
}

# make_test_root - echo a fresh mktemp -d. Caller owns cleanup via EXIT trap.
make_test_root() {
  mktemp -d
}

# make_test_slug - echo a randomized slug matching ^test-dec-[a-z0-9]{6}$.
# Tr to lowercase: Linux mktemp -u emits mixed-case, slug regex is lowercase.
make_test_slug() {
  local hex
  hex="$(mktemp -u test-dec-XXXXXX | sed 's/^test-dec-//' | tr 'A-Z' 'a-z')"
  printf 'test-dec-%s' "$hex"
}

# with_real_sink - echo the dir containing the real decision-log/record.sh.
# Tests prepend this to PATH for happy-path dual-write integration tests.
# Returns the sink dir if it exists and is executable; empty otherwise.
with_real_sink() {
  local sink="$REPO_ROOT/.claude/skills/decision-log"
  [ -x "$sink/record.sh" ] && printf '%s' "$sink" || true
}

# make_stub_sink <exit_code> <sleep_seconds> - creates a stub record.sh in a
# temp BIN_DIR, prints BIN_DIR path. Caller prepends to PATH. Records argv
# to a file named $BIN_DIR/last-argv for SQL-injection / field-forwarding
# asserts. Stub exits with the given code after optional sleep (Q1 hang).
# Caller owns BIN_DIR cleanup via EXIT trap.
make_stub_sink() {
  local exit_code="${1:-0}"
  local sleep_secs="${2:-0}"
  local bin_dir
  bin_dir="$(mktemp -d)"
  # Heredoc with $bin_dir expanded at write time; \$@ kept literal for stub.
  # Record argv on a single space-separated line so substring asserts work.
  cat > "$bin_dir/record.sh" <<STUB
#!/usr/bin/env bash
# Stub record.sh for cfn-decisions tests. Records argv to a file and exits
# with the configured code after an optional sleep (Q1 hang simulation).
printf '%s ' "\$@" > "$bin_dir/last-argv"
sleep "$sleep_secs"
exit "$exit_code"
STUB
  chmod +x "$bin_dir/record.sh"
  printf '%s' "$bin_dir"
}

# writer_cmd <args...> - invoke the writer with --root omitted (test adds it).
# Echoes the absolute path to record.sh. Caller prepends PATH stubs as needed.
writer_path() {
  printf '%s' "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
}

# scrub_decisions_db - marker-scoped SQLite cleanup. WHERE clause mandatory.
# Per CLAUDE.md test-db safety: never unscoped DELETE, never disable FK checks.
# Silently skips if sqlite3 / the DB is not present (tests that need it assert).
scrub_decisions_db() {
  local db="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"
  command -v sqlite3 >/dev/null 2>&1 || return 0
  [ -f "$db" ] || return 0
  # Marker-targeted WHERE: only test-fixture rows. Production slugs do not
  # match the test-dec-% marker, so this deletes zero production rows even if
  # the DB is shared.
  sqlite3 "$db" "DELETE FROM decisions WHERE slug LIKE 'test-dec-%';" 2>/dev/null || true
}

# print_summary <name> - emit the per-file pass/fail summary; exit non-zero on fail.
print_summary() {
  local name="$1"
  echo "----"
  printf '%s: %s/%s passed, %s failed\n' "$name" "$PASS" "$RUN" "$FAIL"
  # Cargo-style summary line for verify-run.sh's parse-test-summary.sh
  # (recognizes `^[[:space:]]*test result:` with `N passed; N failed;`).
  # Additive only: file exit code (0 pass / 1 fail below) stays authoritative.
  if [ "$FAIL" -ne 0 ]; then
    printf 'test result: FAILED. %d passed; %d failed;\n' "$PASS" "$FAIL"
    printf 'Failing sub-assertions:\n'
    for t in "${FAILED_TESTS[@]}"; do printf '  - %s\n' "$t"; done
    exit 1
  fi
  printf 'test result: ok. %d passed; %d failed;\n' "$PASS" "$FAIL"
  exit 0
}

# Resolve repo root (walks up from this file's location).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
export REPO_ROOT
