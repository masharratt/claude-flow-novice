#!/usr/bin/env bash
#
# AISP Contract Validator
# Validates AISP blocks in epic JSON files
#
# Usage: ./validate-aisp.sh <epic.json> [-v|--verbose]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[AISP]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }

usage() {
    cat <<EOF
AISP Contract Validator

Usage: $(basename "$0") <epic.json> [options]

Options:
    -v, --verbose    Show detailed validation output
    -h, --help       Show this help message

Validates:
    1. AISP blocks exist (⟦Σ⟧, ⟦Γ⟧, ⟦Λ⟧, ⟦Ε⟧)
    2. Required symbols present
    3. Binding states defined
    4. Evidence block complete

Exit codes:
    0 - Valid AISP contracts
    1 - Missing or invalid AISP
    2 - Usage error
EOF
}

validate_epic() {
    local epic_file="$1"
    local errors=0
    local warnings=0

    if [[ ! -f "$epic_file" ]]; then
        error "File not found: $epic_file"
        exit 2
    fi

    log "Validating: $epic_file"

    # Check if contracts section exists
    if ! jq -e '.epic.contracts // .contracts' "$epic_file" > /dev/null 2>&1; then
        warn "No contracts section found - v1 epic format"
        echo ""
        echo "To upgrade to v2, add:"
        echo '  "contracts": {'
        echo '    "aisp_version": "5.1",'
        echo '    "types": "⟦Σ:Types⟧{...}",'
        echo '    "rules": "⟦Γ:Rules⟧{...}",'
        echo '    "functions": "⟦Λ:Funcs⟧{...}",'
        echo '    "evidence": "⟦Ε⟧⟨...⟩"'
        echo '  }'
        exit 1
    fi

    # Validate AISP version
    local version
    version=$(jq -r '.epic.contracts.aisp_version // .contracts.aisp_version // ""' "$epic_file")
    if [[ -z "$version" ]]; then
        warn "Missing aisp_version"
        ((warnings++))
    elif [[ "$version" != "5.1" ]]; then
        warn "AISP version $version (expected 5.1)"
        ((warnings++))
    else
        [[ "$VERBOSE" == "true" ]] && success "AISP version: $version"
    fi

    # Check for required blocks
    local types rules functions evidence
    types=$(jq -r '.epic.contracts.types // .contracts.types // ""' "$epic_file")
    rules=$(jq -r '.epic.contracts.rules // .contracts.rules // ""' "$epic_file")
    functions=$(jq -r '.epic.contracts.functions // .contracts.functions // ""' "$epic_file")
    evidence=$(jq -r '.epic.contracts.evidence // .contracts.evidence // ""' "$epic_file")

    # Validate ⟦Σ:Types⟧
    if [[ -z "$types" ]]; then
        error "Missing ⟦Σ:Types⟧ block"
        ((errors++))
    elif [[ "$types" != *"⟦Σ"* ]]; then
        error "Types block missing ⟦Σ⟧ delimiter"
        ((errors++))
    else
        [[ "$VERBOSE" == "true" ]] && success "⟦Σ:Types⟧ present"

        # Check for type definitions (≜ symbol)
        if [[ "$types" != *"≜"* ]]; then
            warn "No type definitions (≜) found in types block"
            ((warnings++))
        fi
    fi

    # Validate ⟦Γ:Rules⟧
    if [[ -z "$rules" ]]; then
        error "Missing ⟦Γ:Rules⟧ block"
        ((errors++))
    elif [[ "$rules" != *"⟦Γ"* ]]; then
        error "Rules block missing ⟦Γ⟧ delimiter"
        ((errors++))
    else
        [[ "$VERBOSE" == "true" ]] && success "⟦Γ:Rules⟧ present"

        # Check for quantifiers (∀ or ∃)
        if [[ "$rules" != *"∀"* ]] && [[ "$rules" != *"∃"* ]]; then
            warn "No quantifiers (∀/∃) found in rules block"
            ((warnings++))
        fi
    fi

    # Validate ⟦Λ:Funcs⟧
    if [[ -z "$functions" ]]; then
        error "Missing ⟦Λ:Funcs⟧ block"
        ((errors++))
    elif [[ "$functions" != *"⟦Λ"* ]]; then
        error "Functions block missing ⟦Λ⟧ delimiter"
        ((errors++))
    else
        [[ "$VERBOSE" == "true" ]] && success "⟦Λ:Funcs⟧ present"

        # Check for function arrows (→)
        if [[ "$functions" != *"→"* ]]; then
            warn "No function signatures (→) found in functions block"
            ((warnings++))
        fi
    fi

    # Validate ⟦Ε⟧ evidence block
    if [[ -z "$evidence" ]]; then
        error "Missing ⟦Ε⟧ evidence block"
        ((errors++))
    elif [[ "$evidence" != *"⟦Ε⟧"* ]]; then
        error "Evidence block missing ⟦Ε⟧ delimiter"
        ((errors++))
    else
        [[ "$VERBOSE" == "true" ]] && success "⟦Ε⟧ present"

        # Check for density score (δ)
        if [[ "$evidence" != *"δ≜"* ]]; then
            warn "Missing density score (δ≜) in evidence"
            ((warnings++))
        fi

        # Check for quality tier (τ)
        if [[ "$evidence" != *"τ≜"* ]]; then
            warn "Missing quality tier (τ≜) in evidence"
            ((warnings++))
        fi

        # Check for ambiguity invariant
        if [[ "$evidence" != *"Ambig"* ]]; then
            warn "Missing ambiguity invariant in evidence"
            ((warnings++))
        fi
    fi

    # Validate bindings section
    if jq -e '.epic.bindings // .bindings' "$epic_file" > /dev/null 2>&1; then
        [[ "$VERBOSE" == "true" ]] && success "Bindings section present"

        # Check for critical handoffs
        local arch_back back_front
        arch_back=$(jq -r '.epic.bindings.architect_to_backend.state // .bindings.architect_to_backend.state // -1' "$epic_file")
        back_front=$(jq -r '.epic.bindings.backend_to_frontend.state // .bindings.backend_to_frontend.state // -1' "$epic_file")

        if [[ "$arch_back" == "-1" ]]; then
            warn "Missing architect_to_backend binding"
            ((warnings++))
        elif [[ "$arch_back" -lt 3 ]]; then
            error "architect_to_backend binding state $arch_back (must be 3/⊤)"
            ((errors++))
        fi

        if [[ "$back_front" == "-1" ]]; then
            warn "Missing backend_to_frontend binding"
            ((warnings++))
        elif [[ "$back_front" -lt 3 ]]; then
            error "backend_to_frontend binding state $back_front (must be 3/⊤)"
            ((errors++))
        fi
    else
        warn "No bindings section - agent handoffs not validated"
        ((warnings++))
    fi

    echo ""
    echo "═══════════════════════════════════════════"
    if [[ $errors -gt 0 ]]; then
        error "Validation FAILED: $errors errors, $warnings warnings"
        exit 1
    elif [[ $warnings -gt 0 ]]; then
        warn "Validation PASSED with $warnings warnings"
        exit 0
    else
        success "Validation PASSED: All AISP contracts valid"
        exit 0
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            EPIC_FILE="$1"
            shift
            ;;
    esac
done

if [[ -z "${EPIC_FILE:-}" ]]; then
    usage
    exit 2
fi

validate_epic "$EPIC_FILE"
