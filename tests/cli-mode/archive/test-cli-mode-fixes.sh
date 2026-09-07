#!/bin/bash

##############################################################################
# Test: CLI Mode Critical Fixes Validation
# Version: 1.0.0
#
# Tests the 4 critical CLI mode fixes:
# 1. orchestrate.sh - path resolution (line 923)
# 2. spawn-agent.sh - task mode detection (lines 22-34)
# 3. orchestrate.sh - gate thresholds (lines 84-88)
# 4. cfn-loop-cli.md - Redis validation
##############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=4
PASSED_TESTS=0
FAILED_TESTS=0

# Project root - use git if available, fallback to relative path
if command -v git >/dev/null 2>&1 && git rev-parse --show-toplevel >/dev/null 2>&1; then
    PROJECT_ROOT="$(git rev-parse --show-toplevel)"
else
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." && pwd)"
fi

echo "=============================================="
echo "CLI Mode Critical Fixes Validation"
echo "=============================================="
echo ""

##############################################################################
# Test 1: Path Resolution in orchestrate.sh
##############################################################################
echo "Test 1: Path Resolution (orchestrate.sh line 923)"
echo "------------------------------------------------"

ORCHESTRATE_SH="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

if [[ ! -f "$ORCHESTRATE_SH" ]]; then
    echo -e "${RED}FAIL${NC}: orchestrate.sh not found at $ORCHESTRATE_SH"
    FAILED_TESTS=$((FAILED_TESTS + 1))
else
    # Check PROJECT_ROOT is defined early (lines 24-27)
    if grep -q 'PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"' "$ORCHESTRATE_SH"; then
        echo "✓ PROJECT_ROOT correctly defined"

        # Check execute-decision.sh path uses PROJECT_ROOT (line 923)
        if grep -q '\$PROJECT_ROOT/\.claude/skills/cfn-product-owner-decision/execute-decision\.sh' "$ORCHESTRATE_SH"; then
            echo "✓ execute-decision.sh path uses \$PROJECT_ROOT"

            # Verify the actual path exists
            DECISION_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-product-owner-decision/execute-decision.sh"
            if [[ -f "$DECISION_SCRIPT" ]]; then
                echo "✓ execute-decision.sh exists at resolved path"
                echo -e "${GREEN}PASS${NC}: Path resolution correct"
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                echo -e "${RED}FAIL${NC}: execute-decision.sh not found at $DECISION_SCRIPT"
                FAILED_TESTS=$((FAILED_TESTS + 1))
            fi
        else
            echo -e "${RED}FAIL${NC}: execute-decision.sh path does not use \$PROJECT_ROOT"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        echo -e "${RED}FAIL${NC}: PROJECT_ROOT not correctly defined"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
fi
echo ""

##############################################################################
# Test 2: Task Mode Detection in spawn-agent.sh
##############################################################################
echo "Test 2: Task Mode Detection (spawn-agent.sh lines 22-34)"
echo "---------------------------------------------------------"

SPAWN_AGENT_SH="$PROJECT_ROOT/claude-assets/skills/cfn-agent-spawning/spawn-agent.sh"

if [[ ! -f "$SPAWN_AGENT_SH" ]]; then
    echo -e "${RED}FAIL${NC}: spawn-agent.sh not found at $SPAWN_AGENT_SH"
    FAILED_TESTS=$((FAILED_TESTS + 1))
else
    # Check for task mode detection block (lines 20-28)
    if grep -q "ANTI-023 MEMORY LEAK PROTECTION: Block Task Mode agents" "$SPAWN_AGENT_SH"; then
        echo "✓ Task mode detection comment found"

        # Check for TASK_ID and argument validation
        if grep -q 'if \[\[ -z "${1:-}" || -z "${TASK_ID:-}" \]\]; then' "$SPAWN_AGENT_SH"; then
            echo "✓ Task mode validation logic present"

            # Check for proper error messages
            if grep -q "TASK MODE DETECTED - Agent spawning CLI forbidden" "$SPAWN_AGENT_SH"; then
                echo "✓ Error message for Task mode detected"

                # Verify exit on detection
                if grep -A 5 "TASK MODE DETECTED" "$SPAWN_AGENT_SH" | grep -q "exit 1"; then
                    echo "✓ Script exits when Task mode detected"
                    echo -e "${GREEN}PASS${NC}: Task mode detection implemented"
                    PASSED_TESTS=$((PASSED_TESTS + 1))
                else
                    echo -e "${RED}FAIL${NC}: Script does not exit on Task mode detection"
                    FAILED_TESTS=$((FAILED_TESTS + 1))
                fi
            else
                echo -e "${RED}FAIL${NC}: Task mode error message missing"
                FAILED_TESTS=$((FAILED_TESTS + 1))
            fi
        else
            echo -e "${RED}FAIL${NC}: Task mode validation logic missing"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        echo -e "${RED}FAIL${NC}: Task mode detection block not found"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
fi
echo ""

##############################################################################
# Test 3: Gate Thresholds in orchestrate.sh
##############################################################################
echo "Test 3: Gate Thresholds (orchestrate.sh lines 84-88)"
echo "-----------------------------------------------------"

if [[ ! -f "$ORCHESTRATE_SH" ]]; then
    echo -e "${RED}FAIL${NC}: orchestrate.sh not found"
    FAILED_TESTS=$((FAILED_TESTS + 1))
else
    # Extract threshold declarations
    GATE_MVP=$(grep -A 3 'declare -A GATE_THRESHOLD' "$ORCHESTRATE_SH" | grep '\[mvp\]' | grep -oP '0\.\d+')
    GATE_STD=$(grep -A 3 'declare -A GATE_THRESHOLD' "$ORCHESTRATE_SH" | grep '\[standard\]' | grep -oP '0\.\d+')
    GATE_ENT=$(grep -A 3 'declare -A GATE_THRESHOLD' "$ORCHESTRATE_SH" | grep '\[enterprise\]' | grep -oP '0\.\d+')

    CONS_MVP=$(grep -A 3 'declare -A CONSENSUS_THRESHOLD' "$ORCHESTRATE_SH" | grep '\[mvp\]' | grep -oP '0\.\d+')
    CONS_STD=$(grep -A 3 'declare -A CONSENSUS_THRESHOLD' "$ORCHESTRATE_SH" | grep '\[standard\]' | grep -oP '0\.\d+')
    CONS_ENT=$(grep -A 3 'declare -A CONSENSUS_THRESHOLD' "$ORCHESTRATE_SH" | grep '\[enterprise\]' | grep -oP '0\.\d+')

    # Validate thresholds
    THRESHOLD_PASS=true

    # Check MVP thresholds
    if [[ "$GATE_MVP" == "0.70" ]]; then
        echo "✓ MVP gate threshold: $GATE_MVP (expected: 0.70)"
    else
        echo -e "${RED}✗${NC} MVP gate threshold: $GATE_MVP (expected: 0.70)"
        THRESHOLD_PASS=false
    fi

    if [[ "$CONS_MVP" == "0.80" ]]; then
        echo "✓ MVP consensus threshold: $CONS_MVP (expected: 0.80)"
    else
        echo -e "${RED}✗${NC} MVP consensus threshold: $CONS_MVP (expected: 0.80)"
        THRESHOLD_PASS=false
    fi

    # Check Standard thresholds
    if [[ "$GATE_STD" == "0.95" ]]; then
        echo "✓ Standard gate threshold: $GATE_STD (expected: 0.95)"
    else
        echo -e "${RED}✗${NC} Standard gate threshold: $GATE_STD (expected: 0.95)"
        THRESHOLD_PASS=false
    fi

    if [[ "$CONS_STD" == "0.90" ]]; then
        echo "✓ Standard consensus threshold: $CONS_STD (expected: 0.90)"
    else
        echo -e "${RED}✗${NC} Standard consensus threshold: $CONS_STD (expected: 0.90)"
        THRESHOLD_PASS=false
    fi

    # Check Enterprise thresholds
    if [[ "$GATE_ENT" == "0.98" ]]; then
        echo "✓ Enterprise gate threshold: $GATE_ENT (expected: 0.98)"
    else
        echo -e "${RED}✗${NC} Enterprise gate threshold: $GATE_ENT (expected: 0.98)"
        THRESHOLD_PASS=false
    fi

    if [[ "$CONS_ENT" == "0.95" ]]; then
        echo "✓ Enterprise consensus threshold: $CONS_ENT (expected: 0.95)"
    else
        echo -e "${RED}✗${NC} Enterprise consensus threshold: $CONS_ENT (expected: 0.95)"
        THRESHOLD_PASS=false
    fi

    # Cross-check with CLAUDE.md
    CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
    if [[ -f "$CLAUDE_MD" ]]; then
        if grep -q "MVP.*≥0.70.*≥0.80" "$CLAUDE_MD" && \
           grep -q "Standard.*≥0.95.*≥0.90" "$CLAUDE_MD" && \
           grep -q "Enterprise.*≥0.98.*≥0.95" "$CLAUDE_MD"; then
            echo "✓ Thresholds match CLAUDE.md documentation"
        else
            echo -e "${YELLOW}⚠${NC} Warning: CLAUDE.md thresholds may not match"
        fi
    fi

    if [[ "$THRESHOLD_PASS" == "true" ]]; then
        echo -e "${GREEN}PASS${NC}: Gate thresholds correct"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}FAIL${NC}: Gate thresholds incorrect"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
fi
echo ""

##############################################################################
# Test 4: Redis Validation in cfn-loop-cli.md
##############################################################################
echo "Test 4: Redis Validation (cfn-loop-cli.md)"
echo "-------------------------------------------"

CFN_LOOP_CLI_MD="$PROJECT_ROOT/claude-assets/commands/cfn-loop-cli.md"

if [[ ! -f "$CFN_LOOP_CLI_MD" ]]; then
    echo -e "${RED}FAIL${NC}: cfn-loop-cli.md not found at $CFN_LOOP_CLI_MD"
    FAILED_TESTS=$((FAILED_TESTS + 1))
else
    REDIS_CHECK_PASS=true

    # Check for Redis prerequisite mention
    if grep -qi "redis" "$CFN_LOOP_CLI_MD"; then
        echo "✓ Redis mentioned in documentation"

        # Check for Redis connectivity verification
        if grep -q "redis-cli PING" "$CFN_LOOP_CLI_MD"; then
            echo "✓ Redis connectivity check documented"
        else
            echo -e "${YELLOW}⚠${NC} Warning: Redis connectivity check not documented"
        fi

        # Check for monitoring instructions
        if grep -q "redis-cli HGETALL" "$CFN_LOOP_CLI_MD"; then
            echo "✓ Redis monitoring commands documented"
        else
            echo -e "${YELLOW}⚠${NC} Warning: Redis monitoring commands missing"
        fi

        # Check for Task mode fallback suggestion
        if grep -qi "task.*mode\|/cfn-loop-task" "$CFN_LOOP_CLI_MD"; then
            echo "✓ Task mode fallback mentioned"
        else
            echo -e "${YELLOW}⚠${NC} Warning: Task mode fallback not mentioned"
        fi

        # Check for troubleshooting section
        if grep -qi "troubleshooting\|redis.*issue\|redis.*connection" "$CFN_LOOP_CLI_MD"; then
            echo "✓ Troubleshooting section present"
        else
            echo -e "${YELLOW}⚠${NC} Warning: Redis troubleshooting section missing"
        fi

        echo -e "${GREEN}PASS${NC}: Redis validation documented"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}FAIL${NC}: Redis not mentioned in documentation"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
fi
echo ""

##############################################################################
# Summary
##############################################################################
echo "=============================================="
echo "Test Results Summary"
echo "=============================================="
echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

# Calculate pass rate
PASS_RATE=$(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS / $TOTAL_TESTS)}")
echo "Overall pass rate: ${PASS_RATE} ($(awk "BEGIN {printf \"%.0f%%\", ($PASSED_TESTS / $TOTAL_TESTS * 100)}"))"

# Calculate consensus score (0.0-1.0)
# Based on: all tests passed = 1.0, weighted by importance
CONSENSUS_SCORE="0.0"
if [[ $PASSED_TESTS -eq 4 ]]; then
    CONSENSUS_SCORE="1.0"
elif [[ $PASSED_TESTS -eq 3 ]]; then
    CONSENSUS_SCORE="0.85"
elif [[ $PASSED_TESTS -eq 2 ]]; then
    CONSENSUS_SCORE="0.70"
elif [[ $PASSED_TESTS -eq 1 ]]; then
    CONSENSUS_SCORE="0.50"
fi

echo "Consensus score: $CONSENSUS_SCORE"
echo ""

# Exit with appropriate code
if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    exit 1
fi
