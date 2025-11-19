#!/bin/bash
# Quick static verification of all 4 bug fixes
set -euo pipefail

PASS=0
FAIL=0

echo "========================================"
echo "Bug Fix Quick Verification"
echo "All 4 Bugs from CFN Loop Iteration 2"
echo "========================================"
echo ""

# Bug #1: Control character sanitization
echo "[TEST 1] Bug #1: tr -d usage"
if grep -A 5 "sanitize_env_value()" .claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh | grep -q "tr -d"; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "✗ FAIL"
    ((FAIL++))
fi

# Bug #2: Redis SADD syntax
echo "[TEST 2] Bug #2: SADD without EX"
if ! grep "SADD.*EX" .claude/skills/cfn-wave-checkpoint/save-checkpoint.sh > /dev/null 2>&1; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "✗ FAIL"
    ((FAIL++))
fi

# Bug #3: Container validation
echo "[TEST 3] Bug #3: Container validation"
if grep -q 'if \[\[ -z "$container_ids" \]\]; then' .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "✗ FAIL"
    ((FAIL++))
fi

# Bug #4: Checkpoint timing
echo "[TEST 4] Bug #4: Checkpoint location"
if grep -A 50 "spawn_wave_implementation()" .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh | grep -q "save_wave_checkpoint"; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "✗ FAIL"
    ((FAIL++))
fi

echo ""
echo "========================================"
echo "Results: $PASS/4 passed"
echo "========================================"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
