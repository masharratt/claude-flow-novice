#!/usr/bin/env bash
# Regression tests for the 2026-07-25 hook audit.
#
# Every case below reproduces a hook that reported success while doing nothing.
# The shared failure shape: a guard that cannot match, a scanner that cannot
# see, or a helper that cannot execute -- each one silent.
#
# Run: bash tests/test-hook-security.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS="${HOME}/.claude/settings.local.json"
SCRATCH=$(mktemp -d /tmp/hook-sec-test-XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0
FAIL=0

ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
head_() { printf '\n%s\n' "$1"; }

# --- T1: sensitive-file blocker vs absolute paths -------------------------
# Write/Edit/MultiEdit always receive an ABSOLUTE file_path. A pattern anchored
# ^\.env$ can therefore never match, so the blocker passed .env through.
head_ "T1  sensitive-file blocker (absolute paths)"

SENSITIVE_CMD=$(jq -r '.hooks.PreToolUse[]?
    | select(.matcher == "Write|Edit|MultiEdit")
    | .hooks[].command' "$SETTINGS" 2>/dev/null | grep -m1 "sensitive file")

if [ -z "$SENSITIVE_CMD" ]; then
    bad "T1 could not locate the sensitive-file hook in $SETTINGS"
else
    for path in "$HOME/projects/x/.env" \
                "$HOME/projects/x/credentials.json" \
                "$HOME/projects/x/secrets.json" \
                "$HOME/projects/x/secrets.yaml" \
                "/srv/app/private.pem" \
                "/home/u/.ssh/id_rsa"; do  # portability-ok: synthetic fixture paths fed to the hook matcher
        printf '{"tool_input":{"file_path":"%s"}}' "$path" \
            | bash -c "$SENSITIVE_CMD" >/dev/null 2>&1
        [ $? -eq 2 ] && ok "blocks $path" || bad "ALLOWS $path (should block)"
    done

    # Must not block ordinary source files.
    printf '{"tool_input":{"file_path":"$HOME/projects/x/src/app.ts"}}' \
        | bash -c "$SENSITIVE_CMD" >/dev/null 2>&1
    [ $? -eq 0 ] && ok "allows $HOME/projects/x/src/app.ts" \
                 || bad "blocks a normal source file (false positive)"
fi

# --- T2/T3: credential scanner --------------------------------------------
# T2: the secret regex was case-sensitive, so uppercase env vars -- which is
#     how real secrets are written -- scanned clean.
# T3: detect_pattern wrote a FILE:|TYPE:|MATCHES: line to the same stdout the
#     pipeline JSON.parses, so every real detection crashed the parse and fell
#     back to a weaker regex that reported "passed".
head_ "T2/T3  credential scanner"

SCANNER="$REPO_ROOT/.claude/skills/cfn-edit-safety/lib/hooks/security-scanner.sh"

if [ ! -f "$SCANNER" ]; then
    bad "T2/T3 scanner not found at $SCANNER"
else
    if [ -L "$SCANNER" ]; then
        bad "scanner is a symlink to $(readlink "$SCANNER") (untracked, off-repo)"
    else
        ok "scanner is a real file in the repo (not a symlink)"
    fi

    cat > "$SCRATCH/leak.sh" <<'LEAK'
OPENAI_API_KEY="sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
DATABASE_PASSWORD="hunter2hunter2"
LEAK
    OUT=$(bash "$SCANNER" "$SCRATCH/leak.sh" 2>/dev/null)

    if echo "$OUT" | jq -e . >/dev/null 2>&1; then
        ok "stdout is parseable JSON (no FILE:|TYPE: prefix)"
    else
        bad "stdout is NOT valid JSON -- pipeline JSON.parse will throw"
    fi

    if echo "$OUT" | jq -e '.passed == false' >/dev/null 2>&1; then
        ok "detects uppercase env secrets (OPENAI_API_KEY, DATABASE_PASSWORD)"
    else
        bad "MISSES uppercase env secrets -- reported passed:true"
    fi

    # A clean file must still pass, or the scanner is useless noise.
    printf 'const sum = (a, b) => a + b;\n' > "$SCRATCH/clean.js"
    CLEAN=$(bash "$SCANNER" "$SCRATCH/clean.js" 2>/dev/null)
    if echo "$CLEAN" | jq -e '.passed == true' >/dev/null 2>&1; then
        ok "clean file passes (no false positive)"
    else
        bad "flags a clean file (false positive)"
    fi
fi

# --- T4: destructive-command guard ----------------------------------------
# The guard existed, worked, and was registered nowhere. Its own SKILL.md said
# "always active". It also never implemented the git checkout rule it promised.
head_ "T4  destructive-command guard"

GUARD="$REPO_ROOT/.claude/hooks/cfn-careful-guard.sh"

if grep -q "cfn-careful-guard" "$SETTINGS" 2>/dev/null; then
    ok "cfn-careful-guard.sh is registered in settings"
else
    bad "cfn-careful-guard.sh is NOT registered -- guard never runs"
fi

for cmd in "rm -rf $HOME/projects/x/src" \
           "psql -c 'DROP TABLE users'" \
           "psql -c 'TRUNCATE cos_tasks'" \
           "git push --force origin main" \
           "git reset --hard HEAD~3" \
           "git clean -fd" \
           "git checkout -- ." \
           "kubectl delete pod api" \
           "dd if=/dev/zero of=/dev/sda"; do
    printf '{"tool_input":{"command":"%s"}}' "$cmd" | bash "$GUARD" >/dev/null 2>&1
    [ $? -eq 2 ] && ok "blocks: $cmd" || bad "ALLOWS: $cmd (should block)"
done

# Whitelisted deletions and ordinary commands must survive.
for cmd in "rm -rf node_modules" "rm -rf /tmp/scratch" "git status" "ls -la"; do
    printf '{"tool_input":{"command":"%s"}}' "$cmd" | bash "$GUARD" >/dev/null 2>&1
    [ $? -eq 0 ] && ok "allows: $cmd" || bad "BLOCKS: $cmd (false positive)"
done

# --- T5: helpers the hooks exec ------------------------------------------
# Registered hooks guarded these with [ -f ] (passes) then exec'd them
# (Permission denied) and swallowed it with || true. Telemetry read as healthy
# while recording nothing.
head_ "T5  hook helper scripts are executable"

for helper in \
    ".claude/skills/cfn-error-management/cli/capture-error.sh" \
    ".claude/skills/cfn-error-management/lib/capture/capture-agent-error.sh" \
    ".claude/skills/cfn-agent-lifecycle/cli/lifecycle-hook.sh" \
    ".claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh"; do
    if [ -x "$REPO_ROOT/$helper" ]; then
        ok "executable: $helper"
    else
        bad "NOT executable: $helper (hook will hit Permission denied)"
    fi
done

# --- T6: no [ -f ] guard before an exec ----------------------------------
# The idiom that made all of this invisible. [ -x ] is the correct test.
head_ "T6  registered hooks use [ -x ] before exec, not [ -f ]"

if jq -r '.hooks | to_entries[] | .value[]? | .hooks[]?.command' "$SETTINGS" 2>/dev/null \
        | grep -q '\[ -f "\?\.\?/\?\.claude/skills.*\.sh'; then
    bad "a registered hook still guards an exec target with [ -f ]"
else
    ok "no [ -f ]-guarded exec targets in registered hooks"
fi

# --- T7: the check that catches the next one -----------------------------
head_ "T7  hook self-test exists and passes"

SELFTEST="$REPO_ROOT/.claude/hooks/cfn-hook-selftest.sh"
if [ -x "$SELFTEST" ]; then
    ok "self-test present and executable"
    if bash "$SELFTEST" --quiet >/dev/null 2>&1; then
        ok "self-test reports all registered hook paths resolve"
    else
        bad "self-test reports unresolvable hook references (run it for detail)"
    fi
else
    bad "no hook self-test at .claude/hooks/cfn-hook-selftest.sh"
fi

# --- shared helper for T8-T12: throwaway git repos -----------------------
# Every hook invocation below runs inside a fresh, disposable repo under
# $SCRATCH -- never the real repo, never a real `git commit`.
mk_repo() {
    local dir="$1"
    mkdir -p "$dir"
    git -C "$dir" init -q
    git -C "$dir" config user.email "test@example.com"
    git -C "$dir" config user.name "Test"
}

HOOK="$REPO_ROOT/.claude/hooks/pre-commit"

# --- T8: infinite loop in scan_staged_file --------------------------------
# scan_staged_file wrote grep matches to $TEMP_RESULTS and then read it with
# `done < "$TEMP_RESULTS"` while appending each finding to that SAME file
# with `>>` -- so every appended line was re-read as further input and the
# loop never terminated. A commit containing a real credential hung forever
# instead of being rejected. Every invocation below is wrapped in
# `timeout 15` so a regression cannot hang this suite.
head_ "T8  scan_staged_file terminates (no self-feeding read/append loop)"

T8_REPO="$SCRATCH/t8-repo"
mk_repo "$T8_REPO"

GOOGLE_KEY="AIzaSy$(printf 'X%.0s' {1..33})"
printf 'GOOGLE_API_KEY="%s"\n' "$GOOGLE_KEY" > "$T8_REPO/secret.env"
git -C "$T8_REPO" add secret.env

OUT=$( (cd "$T8_REPO" && timeout 15 bash "$HOOK") 2>&1 )
RC=$?

if [ "$RC" -eq 124 ]; then
    bad "hook timed out (infinite loop reproduced)"
else
    ok "hook terminated within 15s (exit $RC)"
fi

# --- T9: fail-open via `if ! fn; then findings=$?` ------------------------
# main() did `if ! scan_staged_file "$file"; then findings=$?`, where `$?` is
# the exit status of the `!` negation itself -- always 0 -- never the
# function's finding count. total_credentials therefore never left 0 and the
# hook printed "No credentials detected" on every commit, including ones
# containing real secrets.
head_ "T9  main() captures the real finding count (no fail-open)"

GHP_KEY="ghp_$(printf 'C%.0s' {1..36})"

T9_SECRET="$SCRATCH/t9-secret"
mk_repo "$T9_SECRET"
printf 'GITHUB_TOKEN="%s"\n' "$GHP_KEY" > "$T9_SECRET/leak.env"
git -C "$T9_SECRET" add leak.env
OUT=$( (cd "$T9_SECRET" && timeout 15 bash "$HOOK") 2>&1 )
RC=$?
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q "COMMIT BLOCKED"; then
    ok "staged secret blocks commit (exit $RC, COMMIT BLOCKED present)"
else
    bad "staged secret did NOT block commit (exit $RC) -- fail-open reproduced"
fi

T9_CLEAN="$SCRATCH/t9-clean"
mk_repo "$T9_CLEAN"
printf 'const x = 1;\n' > "$T9_CLEAN/clean.js"
git -C "$T9_CLEAN" add clean.js
OUT=$( (cd "$T9_CLEAN" && timeout 15 bash "$HOOK") 2>&1 )
RC=$?
[ "$RC" -eq 0 ] && ok "clean file allows commit (exit 0)" \
                || bad "clean file blocked commit (exit $RC, false positive)"

T9_WHITELIST="$SCRATCH/t9-whitelist"
mk_repo "$T9_WHITELIST"
NPM_WL="npm_MockTestKey$(printf 'D%.0s' {1..25})"
{
    printf 'ANTHROPIC_API_KEY="[REDACTED]"\n'
    printf 'NPM_API_KEY="%s"\n' "$NPM_WL"
} > "$T9_WHITELIST/placeholders.env"
git -C "$T9_WHITELIST" add placeholders.env
OUT=$( (cd "$T9_WHITELIST" && timeout 15 bash "$HOOK") 2>&1 )
RC=$?
[ "$RC" -eq 0 ] && ok "whitelisted placeholders allow commit (exit 0)" \
                || bad "whitelisted placeholders blocked commit (exit $RC, false positive)"

# --- T10: credential leak via unshadowed $pattern in is_whitelisted -------
# is_whitelisted() looped `for pattern in "${WHITELIST[@]}"` without `local`,
# clobbering scan_staged_file's own $pattern. The redaction sed there then
# ran with a WHITELIST pattern instead of the matched credential pattern, so
# it printed the REAL credential unredacted to stdout and appended it
# verbatim to .artifacts/logs/git-hooks.log.
head_ "T10  redaction uses the credential pattern, never leaks to stdout or log"

T10_REPO="$SCRATCH/t10-repo"
mk_repo "$T10_REPO"
mkdir -p "$T10_REPO/.artifacts/logs"

printf 'GITHUB_TOKEN="%s"\n' "$GHP_KEY" > "$T10_REPO/leak.env"
git -C "$T10_REPO" add leak.env

OUT=$( (cd "$T10_REPO" && timeout 15 bash "$HOOK") 2>&1 )
RC=$?

if [ "$RC" -eq 0 ]; then
    bad "T10 setup did not trigger a detection (exit 0) -- cannot validate redaction"
else
    echo "$OUT" | grep -qF "$GHP_KEY" \
        && bad "RAW SECRET leaked to stdout/stderr" \
        || ok "raw secret does not appear in stdout/stderr"

    echo "$OUT" | grep -q '\[CREDENTIAL_REDACTED\]' \
        && ok "[CREDENTIAL_REDACTED] marker present" \
        || bad "no [CREDENTIAL_REDACTED] marker in output"

    echo "$OUT" | grep "Pattern:" | grep -q "ghp_" \
        && ok "reported Pattern: line is the matching credential pattern (ghp_...)" \
        || bad "reported Pattern: line is NOT the credential pattern (whitelist pattern leaked through)"

    LOGFILE="$T10_REPO/.artifacts/logs/git-hooks.log"
    if [ -f "$LOGFILE" ]; then
        grep -qF "$GHP_KEY" "$LOGFILE" \
            && bad "RAW SECRET leaked into git-hooks.log" \
            || ok "raw secret does not appear in git-hooks.log"
    else
        bad "T10 expected .artifacts/logs/git-hooks.log to be written but it was not"
    fi
fi

# --- T11: pattern coverage -------------------------------------------------
# One regression test per credential family the scanner claims to catch.
head_ "T11  scanner detects each credential family"

declare -A T11_SECRETS=(
    [google]="AIzaSy$(printf 'X%.0s' {1..33})"
    [npm]="npm_$(printf 'A%.0s' {1..36})"
    [openai-proj]="sk-proj-$(printf 'B%.0s' {1..30})"
    [github-pat]="ghp_$(printf 'C%.0s' {1..36})"
)

for name in google npm openai-proj github-pat; do
    secret="${T11_SECRETS[$name]}"
    dir="$SCRATCH/t11-$name"
    mk_repo "$dir"
    printf 'SECRET="%s"\n' "$secret" > "$dir/secret.txt"
    git -C "$dir" add secret.txt

    OUT=$( (cd "$dir" && timeout 15 bash "$HOOK") 2>&1 )
    RC=$?
    if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q "COMMIT BLOCKED"; then
        ok "detects $name credential"
    else
        bad "MISSES $name credential (exit $RC)"
    fi
done

# --- T12: installer honours core.hooksPath --------------------------------
# install_hook always wrote to "$PROJECT_ROOT/.git/hooks/$name", hardcoding
# the classic location. A repo that repoints core.hooksPath (any
# husky-managed repo) never got the hook installed anywhere git actually
# reads -- the file existed and was executable, just in a directory git
# never consults.
head_ "T12  install-git-hooks.sh honours core.hooksPath"

INSTALLER="$REPO_ROOT/.claude/hooks/install-git-hooks.sh"
T12_REPO="$SCRATCH/t12-repo"
mk_repo "$T12_REPO"
mkdir -p "$T12_REPO/.husky"
git -C "$T12_REPO" config core.hooksPath .husky

OUT=$( (cd "$T12_REPO" && timeout 15 bash "$INSTALLER" --force) 2>&1 )
RC=$?

if [ -f "$T12_REPO/.husky/pre-commit" ]; then
    ok "pre-commit installed into .husky/ (core.hooksPath honoured)"
else
    bad "pre-commit NOT found in .husky/ (installer ignored core.hooksPath)"
fi

if [ -f "$T12_REPO/.git/hooks/pre-commit" ]; then
    bad "installer ALSO wrote to .git/hooks/pre-commit (wrong destination still used)"
else
    ok "installer did not write to the default .git/hooks/ location"
fi

RESOLVED=$(cd "$T12_REPO" && git rev-parse --git-path hooks/pre-commit 2>/dev/null)
case "$RESOLVED" in
    *.husky/pre-commit) ok "git rev-parse --git-path hooks/pre-commit resolves into .husky/ ($RESOLVED)" ;;
    *) bad "git rev-parse --git-path hooks/pre-commit resolved to '$RESOLVED', not .husky/" ;;
esac

# --- summary --------------------------------------------------------------
printf '\n----------------------------------------\n'
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
