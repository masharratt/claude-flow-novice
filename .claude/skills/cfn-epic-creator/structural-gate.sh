#!/usr/bin/env bash
set -euo pipefail

# CFN Epic Creator - Structural Validation Gate
# Runs structural validation and gates implementation based on results
#
# Usage: ./structural-gate.sh <epic-json> [--strict] [--auto-review]
#
# Exit codes:
#   0 - Validation passed, proceed to implementation
#   1 - Validation failed, architect review required
#   2 - File error
#   3 - Usage error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="${SCRIPT_DIR}/validate-epic.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[GATE]${NC} $*"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[FAIL]${NC} $*" >&2; }
log_action() { echo -e "${CYAN}[ACTION]${NC} $*"; }

show_help() {
    cat << 'EOF'
CFN Epic Creator - Structural Validation Gate

USAGE:
    ./structural-gate.sh <epic-json> [OPTIONS]

DESCRIPTION:
    Runs structural validation as a gate between epic creation and implementation.
    This ensures epics have sufficient architectural detail before agents begin work.

ARGUMENTS:
    <epic-json>     Path to the epic JSON file to validate

OPTIONS:
    --strict        Require 100% structural completeness (7/7 checks)
    --auto-review   If validation fails, output architect review prompt
    -h, --help      Show this help message

WORKFLOW PLACEMENT:
    This gate runs AFTER all persona reviews complete:

    1. Simplifier (initial) → 9 Personas → Simplifier (final)
    2. User approves final simplifications
    3. >>> structural-gate.sh epic.json <<<
    4. Implementation begins (only if gate passes)

EXIT CODES:
    0 - PASS: Proceed to implementation
    1 - FAIL: Architect review required (structural gaps)
    2 - ERROR: File not found or invalid
    3 - ERROR: Missing arguments

EXAMPLES:
    # Standard validation (71% threshold)
    ./structural-gate.sh docs/epics/my-epic.json

    # Strict validation (100% threshold)
    ./structural-gate.sh docs/epics/my-epic.json --strict

    # With architect review prompt on failure
    ./structural-gate.sh docs/epics/my-epic.json --auto-review

EOF
}

# Parse arguments
EPIC_FILE=""
STRICT_MODE=false
AUTO_REVIEW=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --strict)
            STRICT_MODE=true
            shift
            ;;
        --auto-review)
            AUTO_REVIEW=true
            shift
            ;;
        -*)
            log_error "Unknown option: $1"
            exit 3
            ;;
        *)
            if [[ -z "$EPIC_FILE" ]]; then
                EPIC_FILE="$1"
            else
                log_error "Too many arguments"
                exit 3
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [[ -z "$EPIC_FILE" ]]; then
    log_error "Missing epic JSON file"
    echo "Usage: ./structural-gate.sh <epic-json> [--strict] [--auto-review]"
    exit 3
fi

if [[ ! -f "$EPIC_FILE" ]]; then
    log_error "File not found: $EPIC_FILE"
    exit 2
fi

# Check validator exists
if [[ ! -x "$VALIDATOR" ]]; then
    log_error "Validator not found or not executable: $VALIDATOR"
    exit 2
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           STRUCTURAL VALIDATION GATE                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
log_info "Epic: $EPIC_FILE"
log_info "Mode: $(if $STRICT_MODE; then echo "STRICT (100% required)"; else echo "STANDARD (71% required)"; fi)"
echo ""

# Run validation and capture output
VALIDATION_OUTPUT=$(mktemp)
VALIDATION_ARGS="-v"
if $STRICT_MODE; then
    VALIDATION_ARGS="-v -s"
fi

# Run validator
set +e
"$VALIDATOR" "$EPIC_FILE" $VALIDATION_ARGS > "$VALIDATION_OUTPUT" 2>&1
VALIDATION_EXIT=$?
set -e

# Extract score from output
SCORE_LINE=$(grep -E "Score: [0-9]+\.[0-9]+%" "$VALIDATION_OUTPUT" || echo "Score: 0.00%")
SCORE=$(echo "$SCORE_LINE" | grep -oE "[0-9]+\.[0-9]+" | head -1 || echo "0")
CHECKS_PASSED=$(echo "$SCORE_LINE" | sed -n 's/.*(\([0-9]\+\)\/7.*/\1/p' || echo "0")

# Show validation output
cat "$VALIDATION_OUTPUT"
rm -f "$VALIDATION_OUTPUT"

echo ""
echo "════════════════════════════════════════════════════════════════"

# Determine gate result
if [[ "$VALIDATION_EXIT" -eq 0 ]]; then
    # Check score threshold
    SCORE_INT=$(echo "$SCORE" | cut -d. -f1)

    if $STRICT_MODE && [[ "$SCORE_INT" -lt 100 ]]; then
        log_error "STRICT MODE: Score ${SCORE}% < 100% required"
        GATE_RESULT="FAIL"
    elif [[ "$SCORE_INT" -ge 71 ]]; then
        log_success "GATE PASSED: Score ${SCORE}% ≥ 71% threshold"
        GATE_RESULT="PASS"
    else
        log_error "GATE FAILED: Score ${SCORE}% < 71% threshold"
        GATE_RESULT="FAIL"
    fi
else
    log_error "GATE FAILED: Validation returned error"
    GATE_RESULT="FAIL"
fi

echo ""

# Handle results
if [[ "$GATE_RESULT" == "PASS" ]]; then
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  ✅ STRUCTURAL GATE: PASSED                                   ║"
    echo "║     Epic is ready for implementation                          ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    log_action "Next: Proceed to implementation via cfn-loop or manual execution"
    exit 0
else
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  ❌ STRUCTURAL GATE: FAILED                                   ║"
    echo "║     Epic requires architect review before implementation      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    if $AUTO_REVIEW; then
        echo "════════════════════════════════════════════════════════════════"
        echo "ARCHITECT REVIEW PROMPT (copy and use):"
        echo "════════════════════════════════════════════════════════════════"
        echo ""
        cat << EOF
Task(system-architect, "
Review and enhance the structural completeness of this epic.

Epic file: $EPIC_FILE
Current score: ${SCORE}% (${CHECKS_PASSED}/7 checks passed)

REQUIRED ADDITIONS to technicalRequirements:
1. components or modules - List modules with responsibilities
2. interfaces or api - Define contracts and signatures
3. dependencies - Map internal and external dependencies
4. architecture - Specify pattern (monolith, microservices, etc.)

Also ensure:
- implementationRoadmap has ordered phases
- riskAssessment documents identified risks

Read the epic, add missing structural elements, then re-run validation:
./.claude/skills/cfn-epic-creator/structural-gate.sh $EPIC_FILE
")
EOF
        echo ""
    else
        log_action "Next steps:"
        echo "  1. Review structural validation warnings above"
        echo "  2. Have Architect add missing structural elements"
        echo "  3. Re-run: ./structural-gate.sh $EPIC_FILE"
        echo ""
        echo "  Or use --auto-review flag to get architect prompt"
    fi

    exit 1
fi
