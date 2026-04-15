#!/bin/bash
# Tests for cfn-smart-search-hook.sh and cfn-bash-search-hook.sh
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "$0")/../../.claude/hooks" && pwd)"
SMART_HOOK="$HOOK_DIR/cfn-smart-search-hook.sh"
BASH_HOOK="$HOOK_DIR/cfn-bash-search-hook.sh"

PASS=0
FAIL=0

assert_output() {
    local desc="$1" expected="$2" actual="$3"
    if [[ "$expected" == "empty" ]]; then
        if [[ -z "$actual" ]]; then
            echo "  PASS: $desc"
            ((PASS++))
        else
            echo "  FAIL: $desc (expected empty, got: '$actual')"
            ((FAIL++))
        fi
    elif [[ "$expected" == "notempty" ]]; then
        if [[ -n "$actual" ]]; then
            echo "  PASS: $desc"
            ((PASS++))
        else
            echo "  FAIL: $desc (expected output, got empty)"
            ((FAIL++))
        fi
    elif echo "$actual" | grep -q "$expected"; then
        echo "  PASS: $desc"
        ((PASS++))
    else
        echo "  FAIL: $desc (expected to contain '$expected', got: '$actual')"
        ((FAIL++))
    fi
}

assert_exit() {
    local desc="$1" expected="$2" actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        echo "  PASS: $desc"
        ((PASS++))
    else
        echo "  FAIL: $desc (expected exit $expected, got $actual)"
        ((FAIL++))
    fi
}

run_smart_hook() {
    local json="$1"
    echo "$json" | timeout 5 bash "$SMART_HOOK" 2>/dev/null
}

run_bash_hook() {
    local json="$1"
    echo "$json" | timeout 5 bash "$BASH_HOOK" 2>/dev/null
}

echo "=== Smart Search Hook Tests ==="

echo ""
echo "--- Filtering Tests ---"

# Test: 1-char pattern rejected
OUT=$(run_smart_hook '{"tool_name":"Grep","tool_input":{"pattern":"x"}}')
assert_output "1-char pattern rejected" "empty" "$OUT"

# Test: 2-char pattern accepted (should reach SQL query, may return empty if no DB)
OUT=$(run_smart_hook '{"tool_name":"Grep","tool_input":{"pattern":"DB"}}'; echo $?)
# Just check it doesn't exit before the query stage - check the log
LAST_LOG=$(tail -1 /tmp/codesearch-search-hook.log 2>/dev/null || echo "")
assert_output "2-char pattern 'DB' not rejected as too short" "notempty" "$LAST_LOG"

# Test: Glob tool skipped entirely
OUT=$(run_smart_hook '{"tool_name":"Glob","tool_input":{"pattern":"**/*.ts"}}')
assert_output "Glob tool skipped" "empty" "$OUT"

# Test: Grep with regex metacharacters NOT skipped
# (previously these were rejected because * was in pattern)
run_smart_hook '{"tool_name":"Grep","tool_input":{"pattern":"log.*Error"}}' >/dev/null 2>&1
LAST_LOG=$(grep "log.*Error" /tmp/codesearch-search-hook.log 2>/dev/null | tail -1 || echo "")
assert_output "Grep regex pattern 'log.*Error' not rejected" "notempty" "$LAST_LOG"

# Test: Grep with \s+ regex NOT skipped
run_smart_hook '{"tool_name":"Grep","tool_input":{"pattern":"function\\s+\\w+"}}' >/dev/null 2>&1
LAST_LOG=$(grep "function" /tmp/codesearch-search-hook.log 2>/dev/null | tail -1 || echo "")
assert_output "Grep regex 'function\\s+\\w+' not rejected" "function" "$LAST_LOG"

# Test: Missing pattern exits cleanly
OUT=$(run_smart_hook '{"tool_name":"Grep","tool_input":{}}')
assert_output "Missing pattern exits cleanly" "empty" "$OUT"

# Test: Missing tool_name exits cleanly
OUT=$(run_smart_hook '{"tool_input":{"pattern":"test"}}')
assert_output "Missing tool_name exits cleanly" "empty" "$OUT"

# Test: Absolute path to existing file skipped
OUT=$(run_smart_hook '{"tool_name":"Grep","tool_input":{"pattern":"/etc/hosts"}}')
assert_output "Existing absolute path skipped" "empty" "$OUT"

# Test: Relative path fragment NOT skipped (was broken before)
run_smart_hook '{"tool_name":"Grep","tool_input":{"pattern":"hooks/cfn"}}' >/dev/null 2>&1
LAST_LOG=$(grep "hooks/cfn" /tmp/codesearch-search-hook.log 2>/dev/null | tail -1 || echo "")
assert_output "Relative path 'hooks/cfn' not rejected" "notempty" "$LAST_LOG"

echo ""
echo "--- Regex Sanitization Tests ---"

# Test regex stripping for SQL safety
test_sanitize() {
    local input="$1" expected="$2" desc="$3"
    local result
    result=$(echo "$input" | sed 's/\\[swdSWDbBnrt+]//g' | sed 's/[.*+?^${}()|\\]//g; s/\[//g; s/\]//g; s/  */ /g; s/^ *//; s/ *$//')
    if [[ "$result" == "$expected" ]]; then
        echo "  PASS: sanitize '$input' -> '$expected'"
        ((PASS++))
    else
        echo "  FAIL: sanitize '$input' expected '$expected', got '$result'"
        ((FAIL++))
    fi
}

test_sanitize 'loadApiKey' 'loadApiKey' 'plain identifier unchanged'
test_sanitize 'function\s+\w+' 'function' 'regex classes stripped'
test_sanitize 'log.*Error' 'logError' 'dot-star stripped'
test_sanitize 'DB' 'DB' 'short identifier unchanged'
test_sanitize 'src/hooks' 'src/hooks' 'path separators preserved'

echo ""
echo "--- Block Mode Tests ---"

# Test: Pattern with >=3 results should block (exit 2)
# "entities" will match many things in the index
# Block message goes to stdout (stderr is redirected to log by exec 2>)
OUT=$(echo '{"tool_name":"Grep","tool_input":{"pattern":"entities"}}' | timeout 5 bash "$SMART_HOOK" 2>/dev/null)
RC=$?
BLOCK_MSG="$OUT"

if [[ $RC -eq 2 ]]; then
    echo "  PASS: Block mode triggers on >=3 results (exit 2)"
    ((PASS++))
else
    echo "  FAIL: Block mode should exit 2 on >=3 results (got exit $RC)"
    ((FAIL++))
fi

# Test: Block output contains BLOCKED message
if echo "$BLOCK_MSG" | grep -q "BLOCKED"; then
    echo "  PASS: Block output contains BLOCKED message"
    ((PASS++))
else
    echo "  FAIL: Block output should contain BLOCKED (got: '$BLOCK_MSG')"
    ((FAIL++))
fi

# Test: Block output includes escape hatch instructions
if echo "$BLOCK_MSG" | grep -q '!'; then
    echo "  PASS: Block output includes bypass instructions"
    ((PASS++))
else
    echo "  FAIL: Block output should mention ! bypass"
    ((FAIL++))
fi

# Test: Bypass flag (!) skips CodeSearch entirely
OUT=$(run_smart_hook '{"tool_name":"Grep","tool_input":{"pattern":"!entities"}}')
RC=$?
assert_exit "Bypass flag (!) exits 0 (lets grep through)" "0" "$RC"
assert_output "Bypass flag produces no output" "empty" "$OUT"

# Test: search:block logged
BLOCK_LOG=$(grep "search:block" "$HOME/.local/share/codesearch/logs/codesearch-$(date '+%Y-%m').tsv" 2>/dev/null | tail -1 || echo "")
assert_output "Block event logged in structured log" "notempty" "$BLOCK_LOG"

echo ""
echo "=== Bash Search Hook Tests ==="

# Test: Non-search command exits immediately
OUT=$(run_bash_hook '{"tool_input":{"command":"ls -la"}}')
assert_output "Non-search command exits" "empty" "$OUT"

# Test: grep command triggers hook
run_bash_hook '{"tool_input":{"command":"grep -r \"loadApiKey\" ."}}' >/dev/null 2>&1
LAST_LOG=$(grep "loadApiKey" /tmp/codesearch-bash-hook.log 2>/dev/null | tail -1 || echo "")
assert_output "grep command triggers hook" "notempty" "$LAST_LOG"

# Test: find on /mnt/c blocked
OUT=$(run_bash_hook '{"tool_input":{"command":"find /mnt/c -name test"}}' 2>&1)
RC=$?
assert_exit "find /mnt/c blocked with exit 2" "2" "$RC"

# Test: 1-char pattern in grep rejected
OUT=$(run_bash_hook '{"tool_input":{"command":"grep x file.txt"}}')
assert_output "1-char grep pattern rejected" "empty" "$OUT"

echo ""
echo "=== Results ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"

if [[ $FAIL -gt 0 ]]; then
    exit 1
fi
exit 0
