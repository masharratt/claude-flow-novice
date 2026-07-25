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
    for path in "/home/masha/projects/x/.env" \
                "/home/masha/projects/x/credentials.json" \
                "/home/masha/projects/x/secrets.json" \
                "/home/masha/projects/x/secrets.yaml" \
                "/srv/app/private.pem" \
                "/home/u/.ssh/id_rsa"; do
        printf '{"tool_input":{"file_path":"%s"}}' "$path" \
            | bash -c "$SENSITIVE_CMD" >/dev/null 2>&1
        [ $? -eq 2 ] && ok "blocks $path" || bad "ALLOWS $path (should block)"
    done

    # Must not block ordinary source files.
    printf '{"tool_input":{"file_path":"/home/masha/projects/x/src/app.ts"}}' \
        | bash -c "$SENSITIVE_CMD" >/dev/null 2>&1
    [ $? -eq 0 ] && ok "allows /home/masha/projects/x/src/app.ts" \
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

for cmd in "rm -rf /home/masha/projects/x/src" \
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

# --- summary --------------------------------------------------------------
printf '\n----------------------------------------\n'
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
