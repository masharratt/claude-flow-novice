#!/usr/bin/env bash
set -euo pipefail

# Contract Alignment Validation Test
# Purpose: Verify consistency between environment contract YAML and coordinator entrypoint script
# Reference: docker/ENVIRONMENT_CONTRACT_ALIGNMENT_REPORT.md

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Files to validate
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTRACT_FILE="$PROJECT_ROOT/docker/runtime/cfn-runtime.contract.yml"
ENTRYPOINT_FILE="$PROJECT_ROOT/docker/coordinator-entrypoint.sh"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Arrays for tracking issues
declare -a MISSING_VARS=()
declare -a UNVALIDATED_REQUIRED=()
declare -a NETWORK_MISMATCHES=()
declare -a DEFAULT_MISMATCHES=()

# Helper functions
print_header() {
    echo ""
    echo "========================================"
    echo "$1"
    echo "========================================"
}

print_step() {
    echo -e "${BLUE}[$1/$2]${NC} $3..."
}

print_pass() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

print_fail() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

print_warn() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

# Check files exist
check_files_exist() {
    if [[ ! -f "$CONTRACT_FILE" ]]; then
        echo -e "${RED}❌ ERROR:${NC} Contract file not found: $CONTRACT_FILE"
        exit 1
    fi

    if [[ ! -f "$ENTRYPOINT_FILE" ]]; then
        echo -e "${RED}❌ ERROR:${NC} Entrypoint file not found: $ENTRYPOINT_FILE"
        exit 1
    fi

    print_info "Contract file: $CONTRACT_FILE"
    print_info "Entrypoint file: $ENTRYPOINT_FILE"
}

# Extract all CFN_* variables and their legacy aliases from contract YAML
# Uses grep and awk since yq is not available
extract_contract_variables() {
    local contract_vars_file="$1"
    local legacy_aliases_file="$2"

    # Extract CFN_* variable names (lines that start with spaces + CFN_)
    grep -E '^\s+CFN_[A-Z_]+:' "$CONTRACT_FILE" | \
        awk '{print $1}' | \
        sed 's/:$//' | \
        sort -u > "$contract_vars_file"

    # Extract legacy aliases
    # Format: legacy_aliases: ["VAR1", "VAR2"]
    grep 'legacy_aliases:' "$CONTRACT_FILE" | \
        sed 's/.*legacy_aliases: *\[//; s/\].*//; s/"//g; s/,/\n/g; s/ //g' | \
        grep -v '^$' | \
        sort -u > "$legacy_aliases_file"
}

# Extract all ${VAR} and ${VAR:-default} references from entrypoint
extract_entrypoint_variables() {
    local entrypoint_vars_file="$1"

    # Extract variable references: ${VAR} and ${VAR:-default}
    grep -oE '\$\{[A-Z_]+[:-]?' "$ENTRYPOINT_FILE" | \
        sed 's/\${//g; s/[:-].*//g' | \
        sort -u > "$entrypoint_vars_file"
}

# Check if a variable exists in contract (either as CFN_VAR or legacy alias)
variable_exists_in_contract() {
    local var="$1"
    local contract_vars_file="$2"
    local legacy_aliases_file="$3"

    # Check if variable itself is in contract (CFN_ prefixed)
    if grep -q "^CFN_${var}$" "$contract_vars_file" 2>/dev/null; then
        return 0
    fi

    # Check if variable is a legacy alias
    if grep -q "^${var}$" "$legacy_aliases_file" 2>/dev/null; then
        return 0
    fi

    # Check if variable already has CFN_ prefix and is in contract
    if [[ "$var" =~ ^CFN_ ]] && grep -q "^${var}$" "$contract_vars_file" 2>/dev/null; then
        return 0
    fi

    return 1
}

# Check if variable is validated as required in entrypoint
is_validated_in_entrypoint() {
    local var="$1"

    # Look for validation pattern: if [ -z "${VAR:-}" ]
    if grep -q "if \[ -z \"\${${var}:-}\"\s*\]" "$ENTRYPOINT_FILE"; then
        return 0
    fi

    return 1
}

# Extract default value from entrypoint for a variable
get_entrypoint_default() {
    local var="$1"

    # Pattern: ${VAR:-default}
    local default=$(grep -oE "\\\$\{${var}:-[^}]+\}" "$ENTRYPOINT_FILE" | \
        head -1 | \
        sed "s/\${${var}:-//; s/}$//")

    echo "$default"
}

# Extract default value from contract for a variable
get_contract_default() {
    local var="$1"

    # Find the variable section and extract default value
    # Format: default: "value" or default: value
    awk -v var="$var" '
        $0 ~ "^  " var ":" {found=1; next}
        found && /default:/ {
            gsub(/.*default: *"?/, "");
            gsub(/".*/, "");
            print;
            exit
        }
        found && /^  [A-Z_]+:/ {exit}
    ' "$CONTRACT_FILE"
}

# Main test execution
main() {
    print_header "Contract Alignment Validation Test"

    check_files_exist

    # Temporary files for extracted data
    local contract_vars=$(mktemp)
    local legacy_aliases=$(mktemp)
    local entrypoint_vars=$(mktemp)

    trap "rm -f $contract_vars $legacy_aliases $entrypoint_vars" EXIT

    # Step 1: Extract contract variables
    print_step 1 5 "Extracting contract variables"
    extract_contract_variables "$contract_vars" "$legacy_aliases"
    local contract_count=$(wc -l < "$contract_vars")
    local alias_count=$(wc -l < "$legacy_aliases")
    print_info "Found $contract_count CFN_ variables and $alias_count legacy aliases"

    # Step 2: Extract entrypoint variables
    print_step 2 5 "Extracting entrypoint variables"
    extract_entrypoint_variables "$entrypoint_vars"
    local entrypoint_count=$(wc -l < "$entrypoint_vars")
    print_info "Found $entrypoint_count variables referenced in entrypoint"

    # Step 3: Validate alignment
    print_step 3 5 "Validating alignment"
    echo ""

    while IFS= read -r var || [[ -n "$var" ]]; do
        if variable_exists_in_contract "$var" "$contract_vars" "$legacy_aliases"; then
            print_pass "Variable '$var' exists in contract"
        else
            print_fail "Variable '$var' used in entrypoint but NOT in contract"
            MISSING_VARS+=("$var")
        fi
    done < "$entrypoint_vars"

    # Step 4: Check required variable validation
    print_step 4 5 "Checking required variable validation"
    echo ""

    # Known required variables based on report
    local required_vars=("TASK_ID" "TASK_DESCRIPTION")

    for var in "${required_vars[@]}"; do
        if is_validated_in_entrypoint "$var"; then
            print_pass "Required variable '$var' has validation in entrypoint"
        else
            print_fail "Required variable '$var' lacks validation in entrypoint"
            UNVALIDATED_REQUIRED+=("$var")
        fi
    done

    # Step 5: Verify network defaults consistency
    print_step 5 5 "Verifying network defaults"
    echo ""

    local network_var="NETWORK"
    local entrypoint_network_default=$(get_entrypoint_default "$network_var")
    local contract_network_default=$(get_contract_default "CFN_NETWORK_NAME")

    if [[ -n "$entrypoint_network_default" && -n "$contract_network_default" ]]; then
        if [[ "$entrypoint_network_default" == "$contract_network_default" ]]; then
            print_pass "Network default consistent: '$entrypoint_network_default'"
        else
            print_fail "Network default mismatch: entrypoint='$entrypoint_network_default', contract='$contract_network_default'"
            NETWORK_MISMATCHES+=("NETWORK: entrypoint=$entrypoint_network_default vs contract=$contract_network_default")
        fi
    else
        print_warn "Could not extract network defaults for comparison"
    fi

    # Additional default checks for commonly used variables
    local check_defaults=(
        "MAX_ITERATIONS:CFN_ITERATION_LIMIT:10"
        "GATE_THRESHOLD:CFN_GATE_CONFIDENCE_THRESHOLD:0.75"
        "CONSENSUS_THRESHOLD:CFN_CONSENSUS_THRESHOLD:0.90"
    )

    for check in "${check_defaults[@]}"; do
        IFS=':' read -r entrypoint_var contract_var expected_default <<< "$check"
        local entrypoint_default=$(get_entrypoint_default "$entrypoint_var")
        local contract_default=$(get_contract_default "$contract_var")

        if [[ -n "$entrypoint_default" && -n "$contract_default" ]]; then
            if [[ "$entrypoint_default" == "$contract_default" ]]; then
                print_pass "Default consistent for $entrypoint_var: '$entrypoint_default'"
            else
                print_fail "Default mismatch for $entrypoint_var: entrypoint='$entrypoint_default', contract='$contract_default'"
                DEFAULT_MISMATCHES+=("$entrypoint_var: entrypoint=$entrypoint_default vs contract=$contract_default")
            fi
        fi
    done

    # Print summary
    print_header "Test Summary"

    echo "Total Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
    echo ""

    # Report issues
    if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
        echo -e "${RED}❌ CRITICAL: Variables missing from contract:${NC}"
        for var in "${MISSING_VARS[@]}"; do
            echo "   - $var"
        done
        echo ""
    fi

    if [[ ${#UNVALIDATED_REQUIRED[@]} -gt 0 ]]; then
        echo -e "${RED}❌ CRITICAL: Required variables without validation:${NC}"
        for var in "${UNVALIDATED_REQUIRED[@]}"; do
            echo "   - $var"
        done
        echo ""
    fi

    if [[ ${#NETWORK_MISMATCHES[@]} -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  WARNING: Network default mismatches:${NC}"
        for mismatch in "${NETWORK_MISMATCHES[@]}"; do
            echo "   - $mismatch"
        done
        echo ""
    fi

    if [[ ${#DEFAULT_MISMATCHES[@]} -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  WARNING: Default value mismatches:${NC}"
        for mismatch in "${DEFAULT_MISMATCHES[@]}"; do
            echo "   - $mismatch"
        done
        echo ""
    fi

    # Confidence score calculation
    local max_score=100
    local critical_deduction=20  # per missing var or unvalidated required
    local warning_deduction=5    # per mismatch

    local score=$max_score
    score=$((score - ${#MISSING_VARS[@]} * critical_deduction))
    score=$((score - ${#UNVALIDATED_REQUIRED[@]} * critical_deduction))
    score=$((score - ${#NETWORK_MISMATCHES[@]} * warning_deduction))
    score=$((score - ${#DEFAULT_MISMATCHES[@]} * warning_deduction))

    # Ensure score doesn't go negative
    if [[ $score -lt 0 ]]; then
        score=0
    fi

    local confidence=$(awk "BEGIN {printf \"%.2f\", $score/100}")

    echo "Confidence Score: $confidence"
    echo ""

    # Final verdict
    if [[ ${#MISSING_VARS[@]} -eq 0 && ${#UNVALIDATED_REQUIRED[@]} -eq 0 ]]; then
        if [[ ${#NETWORK_MISMATCHES[@]} -eq 0 && ${#DEFAULT_MISMATCHES[@]} -eq 0 ]]; then
            echo -e "${GREEN}✅ PASS: All variables aligned and validated${NC}"
            exit 0
        else
            echo -e "${YELLOW}⚠️  PASS WITH WARNINGS: Variables aligned but defaults inconsistent${NC}"
            exit 0
        fi
    else
        echo -e "${RED}❌ FAIL: Critical alignment issues detected${NC}"
        echo ""
        echo "Recommendations:"

        if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
            echo "1. Add missing variables to contract:"
            for var in "${MISSING_VARS[@]}"; do
                echo "   - Add CFN_$var with legacy_aliases: [\"$var\"]"
            done
        fi

        if [[ ${#UNVALIDATED_REQUIRED[@]} -gt 0 ]]; then
            echo "2. Add validation for required variables in entrypoint"
        fi

        if [[ ${#NETWORK_MISMATCHES[@]} -gt 0 || ${#DEFAULT_MISMATCHES[@]} -gt 0 ]]; then
            echo "3. Align default values between contract and entrypoint"
        fi

        exit 1
    fi
}

# Run main test
main "$@"
