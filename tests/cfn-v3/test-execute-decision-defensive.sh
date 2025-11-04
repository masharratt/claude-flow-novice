#!/usr/bin/env bash
set -euo pipefail

# Test execute-decision.sh defensive programming for TEST 5 fix
# Tests the file validation logic directly by simulating different agent output scenarios

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper: Print test header
print_test_header() {
    echo ""
    echo "=========================================="
    echo "TEST: $1"
    echo "=========================================="
}

# Helper: Assert condition
assert_test() {
    local condition="$1"
    local test_name="$2"

    TESTS_RUN=$((TESTS_RUN + 1))

    if eval "$condition"; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Helper: Test defensive parsing logic (extracted from execute-decision.sh)
test_defensive_parsing() {
    local po_output_file="$1"
    local test_scenario="$2"

    echo "" >&2
    echo "Scenario: $test_scenario" >&2
    echo "File: $po_output_file" >&2
    echo "File exists: $([ -f "$po_output_file" ] && echo 'YES' || echo 'NO')" >&2
    if [ -f "$po_output_file" ]; then
        echo "File size: $(stat -c%s "$po_output_file" 2>/dev/null || stat -f%z "$po_output_file" 2>/dev/null || echo 'UNKNOWN') bytes" >&2
    fi

    # Defensive logic from execute-decision.sh (lines 128-154)
    local DECISION_TYPE=""
    local REASONING=""
    local CONFIDENCE=""
    local PO_OUTPUT=""

    if [ -f "$po_output_file" ] && [ -s "$po_output_file" ]; then
        PO_OUTPUT=$(cat "$po_output_file")

        # Try multiple parsing patterns
        DECISION_TYPE=$(echo "$PO_OUTPUT" | grep -oiE "Decision:\s*(PROCEED|ITERATE|ABORT)" | grep -oiE "(PROCEED|ITERATE|ABORT)" | head -1 | tr '[:lower:]' '[:upper:]' || echo "")

        if [ -z "$DECISION_TYPE" ]; then
            DECISION_TYPE=$(echo "$PO_OUTPUT" | grep -oE "(PROCEED|ITERATE|ABORT)" | head -1 || echo "")
        fi

        if [ -z "$DECISION_TYPE" ]; then
            DECISION_TYPE=$(echo "$PO_OUTPUT" | grep -oiE "(proceed|iterate|abort)" | head -1 | tr '[:lower:]' '[:upper:]' || echo "")
        fi

        # Parse reasoning
        REASONING=$(echo "$PO_OUTPUT" | grep -oiE "Reasoning:\s*.*" | sed 's/Reasoning:\s*//' || echo "No reasoning provided")

        # Parse confidence
        CONFIDENCE=$(echo "$PO_OUTPUT" | grep -oE "Confidence:\s*[0-9]+\.?[0-9]*" | grep -oE "[0-9]+\.?[0-9]*" || echo "0.85")
    else
        echo -e "${YELLOW}⚠ File missing or empty - applying defensive defaults${NC}" >&2
        PO_OUTPUT=""
        DECISION_TYPE="ABORT"
        REASONING="Product Owner output file missing or empty: $po_output_file"
        CONFIDENCE=0.0
    fi

    # Validate decision parsing
    if [ -z "$DECISION_TYPE" ]; then
        echo -e "${YELLOW}⚠ Could not parse decision - applying defensive default${NC}" >&2
        DECISION_TYPE="ABORT"
        REASONING="Failed to parse Product Owner decision"
        CONFIDENCE=0.0
    fi

    echo "" >&2
    echo "Parsed Results:" >&2
    echo "  Decision: ${DECISION_TYPE:-NONE}" >&2
    echo "  Reasoning: ${REASONING:-NONE}" >&2
    echo "  Confidence: ${CONFIDENCE:-NONE}" >&2
    echo "" >&2

    # Return values for testing (only this to stdout)
    echo "$DECISION_TYPE|$REASONING|$CONFIDENCE"
}

# ==========================================
# TEST 1: Missing File
# ==========================================
print_test_header "TEST 1: Missing PO Output File"

TEST_FILE="/tmp/test-po-missing-$$.log"
rm -f "$TEST_FILE"  # Ensure it doesn't exist

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent spawn failed, no file created")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)
REASONING=$(echo "$RESULT" | cut -d'|' -f2)
CONFIDENCE=$(echo "$RESULT" | cut -d'|' -f3)

assert_test "[[ \"$DECISION\" == \"ABORT\" ]]" "Missing file: Decision = ABORT"
assert_test "[[ \"$CONFIDENCE\" == \"0.0\" ]]" "Missing file: Confidence = 0.0"
assert_test "[[ \"$REASONING\" =~ \"missing or empty\" ]]" "Missing file: Reasoning indicates missing file"

# ==========================================
# TEST 2: Empty File
# ==========================================
print_test_header "TEST 2: Empty PO Output File"

TEST_FILE="/tmp/test-po-empty-$$.log"
touch "$TEST_FILE"  # Create empty file

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent produced empty output")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)
REASONING=$(echo "$RESULT" | cut -d'|' -f2)
CONFIDENCE=$(echo "$RESULT" | cut -d'|' -f3)

assert_test "[[ \"$DECISION\" == \"ABORT\" ]]" "Empty file: Decision = ABORT"
assert_test "[[ \"$CONFIDENCE\" == \"0.0\" ]]" "Empty file: Confidence = 0.0"
assert_test "[[ \"$REASONING\" =~ \"missing or empty\" ]]" "Empty file: Reasoning indicates empty file"

rm -f "$TEST_FILE"

# ==========================================
# TEST 3: Valid PROCEED Decision
# ==========================================
print_test_header "TEST 3: Valid PROCEED Decision"

TEST_FILE="/tmp/test-po-proceed-$$.log"
cat > "$TEST_FILE" <<'EOF'
DECISION: PROCEED

REASONING:
All acceptance criteria met:
- Tests passing with 100% coverage
- Documentation complete
- Security review passed

The implementation is production-ready.

Confidence: 0.95
EOF

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent returned valid PROCEED decision")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)
CONFIDENCE=$(echo "$RESULT" | cut -d'|' -f3)

assert_test "[[ \"$DECISION\" == \"PROCEED\" ]]" "Valid PROCEED: Decision parsed correctly"
assert_test "[[ \"$CONFIDENCE\" == \"0.95\" ]]" "Valid PROCEED: Confidence parsed correctly"

rm -f "$TEST_FILE"

# ==========================================
# TEST 4: Valid ITERATE Decision
# ==========================================
print_test_header "TEST 4: Valid ITERATE Decision"

TEST_FILE="/tmp/test-po-iterate-$$.log"
cat > "$TEST_FILE" <<'EOF'
DECISION: ITERATE

REASONING:
Implementation needs improvements:
- Test coverage only 70% (target: 90%)
- Missing error handling for edge cases

Required changes for next iteration:
1. Add tests for edge cases
2. Implement error recovery

Confidence: 0.75
EOF

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent returned valid ITERATE decision")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)
CONFIDENCE=$(echo "$RESULT" | cut -d'|' -f3)

assert_test "[[ \"$DECISION\" == \"ITERATE\" ]]" "Valid ITERATE: Decision parsed correctly"
assert_test "[[ \"$CONFIDENCE\" == \"0.75\" ]]" "Valid ITERATE: Confidence parsed correctly"

rm -f "$TEST_FILE"

# ==========================================
# TEST 5: Valid ABORT Decision
# ==========================================
print_test_header "TEST 5: Valid ABORT Decision"

TEST_FILE="/tmp/test-po-abort-$$.log"
cat > "$TEST_FILE" <<'EOF'
DECISION: ABORT

REASONING:
Critical blockers identified:
- Fundamental architectural issues require redesign
- Security vulnerabilities cannot be mitigated

Recommendation: Restart with revised specification.

Confidence: 0.90
EOF

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent returned valid ABORT decision")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)
CONFIDENCE=$(echo "$RESULT" | cut -d'|' -f3)

assert_test "[[ \"$DECISION\" == \"ABORT\" ]]" "Valid ABORT: Decision parsed correctly"
assert_test "[[ \"$CONFIDENCE\" == \"0.90\" ]]" "Valid ABORT: Confidence parsed correctly"

rm -f "$TEST_FILE"

# ==========================================
# TEST 6: Malformed Decision (No Keywords)
# ==========================================
print_test_header "TEST 6: Malformed Decision (No Keywords)"

TEST_FILE="/tmp/test-po-malformed-$$.log"
cat > "$TEST_FILE" <<'EOF'
The product owner has reviewed the implementation.

Everything looks satisfactory and the team can continue.

No specific decision keyword found in this output.
EOF

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent output lacks decision keywords")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)
REASONING=$(echo "$RESULT" | cut -d'|' -f2)
CONFIDENCE=$(echo "$RESULT" | cut -d'|' -f3)

assert_test "[[ \"$DECISION\" == \"ABORT\" ]]" "Malformed: Decision defaults to ABORT"
assert_test "[[ \"$CONFIDENCE\" == \"0.0\" ]]" "Malformed: Confidence = 0.0"
assert_test "[[ \"$REASONING\" =~ \"Failed to parse\" ]]" "Malformed: Reasoning indicates parse failure"

rm -f "$TEST_FILE"

# ==========================================
# TEST 7: Case Insensitive Decision Parsing
# ==========================================
print_test_header "TEST 7: Case Insensitive Decision Parsing"

TEST_FILE="/tmp/test-po-lowercase-$$.log"
cat > "$TEST_FILE" <<'EOF'
decision: proceed

reasoning: All tests pass.

Confidence: 0.88
EOF

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent used lowercase keywords")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)
CONFIDENCE=$(echo "$RESULT" | cut -d'|' -f3)

assert_test "[[ \"$DECISION\" == \"PROCEED\" ]]" "Lowercase decision: Normalized to uppercase"
assert_test "[[ \"$CONFIDENCE\" == \"0.88\" ]]" "Standard Confidence: Parsed correctly"

rm -f "$TEST_FILE"

# ==========================================
# TEST 8: Decision Without "Decision:" Prefix
# ==========================================
print_test_header "TEST 8: Decision Without Prefix"

TEST_FILE="/tmp/test-po-no-prefix-$$.log"
cat > "$TEST_FILE" <<'EOF'
After careful review of the implementation:

ITERATE

The following improvements are needed:
- Add more comprehensive tests
- Improve error messages
EOF

RESULT=$(test_defensive_parsing "$TEST_FILE" "Agent output has decision keyword without prefix")
DECISION=$(echo "$RESULT" | cut -d'|' -f1)

assert_test "[[ \"$DECISION\" == \"ITERATE\" ]]" "No prefix: Decision still parsed correctly"

rm -f "$TEST_FILE"

# ==========================================
# TEST SUMMARY
# ==========================================
echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo "Total tests run: $TESTS_RUN"
echo -e "${GREEN}Tests passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo "Defensive Programming Validation:"
    echo "  ✓ Missing file handling"
    echo "  ✓ Empty file handling"
    echo "  ✓ Valid PROCEED parsing"
    echo "  ✓ Valid ITERATE parsing"
    echo "  ✓ Valid ABORT parsing"
    echo "  ✓ Malformed decision handling"
    echo "  ✓ Case insensitive parsing"
    echo "  ✓ Format variation tolerance"
    echo ""
    echo "TEST 5 Fix Validation: COMPLETE"
    CONFIDENCE=$(echo "scale=2; 1.0" | bc)
    echo "Consensus Score: ${CONFIDENCE}"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Review failures above for details."
    CONFIDENCE=$(echo "scale=2; $TESTS_PASSED / $TESTS_RUN" | bc)
    echo "Consensus Score: ${CONFIDENCE}"
    exit 1
fi
