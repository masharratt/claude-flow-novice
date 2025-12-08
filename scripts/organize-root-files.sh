#!/bin/bash
# Root Directory File Organization Script
# This script organizes files in the root directory according to the plan in ROOT_FILE_ORGANIZATION_PLAN.md

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DRY_RUN=false
ROOT_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show help
show_help() {
    cat << EOF
Root Directory File Organization Script

Usage: $0 [OPTIONS]

Options:
    --dry-run    Show what would be done without actually doing it
    --help       Show this help message

Description:
    This script organizes files in the root directory according to the categories
    defined in ROOT_FILE_ORGANIZATION_PLAN.md:
    - DELETE: Phase/Sprint/Loop related files and duplicates
    - KEEP: Essential project files (no action)
    - MOVE: Move files to appropriate subdirectories

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Change to root directory
cd "$ROOT_DIR" || {
    log_error "Failed to change to root directory: $ROOT_DIR"
    exit 1
}

# Create necessary directories
create_directories() {
    local dirs=(
        "docs/security/audits"
        "docs/security/gnn"
        "docs/reports"
        "docs/ruvector"
        "docs/testing"
        "docs/reviews"
        "docs/guides"
        "scripts/utils"
        "scripts/testing"
    )

    log_info "Creating necessary directories..."

    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            if [ "$DRY_RUN" = true ]; then
                log_info "Would create directory: $dir"
            else
                mkdir -p "$dir"
                log_success "Created directory: $dir"
            fi
        else
            log_info "Directory already exists: $dir"
        fi
    done
}

# Delete files marked for deletion
delete_files() {
    log_info "Deleting files marked for deletion..."

    # LOOP2 files
    local loop2_files=(
        "DEVOPS_VALIDATION_LOOP2.md"
        "LOOP2_CODE_QUALITY_FEEDBACK.json"
        "LOOP2_CODE_QUALITY_SUMMARY.txt"
        "LOOP2_CODE_REVIEW_FEEDBACK.json"
        "LOOP2_CODE_REVIEW_FEEDBACK_ITERATION2.json"
        "LOOP2_CODE_REVIEW_SUMMARY.txt"
        "LOOP2_VALIDATION_FINDINGS.json"
        "LOOP2_VALIDATION_RESULTS.txt"
        "LOOP2_VALIDATION_SUMMARY.json"
        "SECURITY_VALIDATION_LOOP2_FINAL.json"
    )

    # PHASE files
    local phase_files=(
        "PHASE3_SPRINT31_FEEDBACK.json"
        "SECURITY_AUDIT_PHASE3_SPRINT3.1_EXECUTIVE_SUMMARY.txt"
        "SECURITY_AUDIT_PHASE3_SPRINT3.1_SUMMARY.json"
        "VALIDATION_COMPLETE_ITERATION2.md"
        "SECURITY_VALIDATION_FINAL_ITERATION2.json"
    )

    # Temporary and duplicate files
    local temp_files=(
        "claude-copy.md"
        "ITERATION_2_RE_AUDIT_SUMMARY.txt"
        "FINAL_TEST_SUCCESS.txt"
        "full-test-output.txt"
        "test-results.txt"
        "VALIDATION_COMPLETION_REPORT.txt"
        "ARCHITECTURE_REVIEW_COMPLETION.txt"
        "IMPLEMENTATION_SUMMARY_THINKING_DECOMPOSER.md"
        "TEST_FIX_SUMMARY.md"
        "TYPE_SAFETY_REMEDIATION_PLAN.md"
    )

    # Combine all files to delete
    local all_files=("${loop2_files[@]}" "${phase_files[@]}" "${temp_files[@]}")

    for file in "${all_files[@]}"; do
        if [ -f "$file" ]; then
            if [ "$DRY_RUN" = true ]; then
                log_info "Would delete: $file"
            else
                rm -f "$file"
                log_success "Deleted: $file"
            fi
        else
            log_warning "File not found, skipping: $file"
        fi
    done
}

# Move files to appropriate directories
move_files() {
    log_info "Moving files to appropriate directories..."

    # Architecture files → docs/architecture/
    local architecture_moves=(
        "ARCHITECTURE_CONFORMANCE_SUMMARY.txt:docs/architecture/"
        "ARCHITECTURE_CONFORMANCE_VALIDATION.md:docs/architecture/"
        "ARCHITECTURE_FOUNDATION_EXECUTIVE_SUMMARY.md:docs/architecture/"
        "COORDINATOR_INTEGRATION_SUMMARY.md:docs/architecture/"
        "MONITORING_AND_ALERTING_IMPLEMENTATION.md:docs/architecture/"
        "OPERATIONS_QUICK_REFERENCE.md:docs/architecture/"
        "TYPESCRIPT_VERIFICATION_INDEX.md:docs/architecture/"
    )

    # Security audit files → docs/security/audits/
    local security_moves=(
        "SECURITY_AUDIT_EXECUTIVE_SUMMARY.txt:docs/security/audits/"
        "SECURITY_AUDIT_SUMMARY.json:docs/security/audits/"
        "SECURITY_FINDINGS.json:docs/security/audits/"
        "SECURITY_FINDINGS_STRUCTURED.json:docs/security/audits/"
        "SECURITY_FIX_DELIVERY_SUMMARY.txt:docs/security/audits/"
        "SECURITY_FIX_SEC-1.6_SUMMARY.txt:docs/security/audits/"
        "SECURITY_FIX_sec-1.2_SUMMARY.txt:docs/security/audits/"
        "SECURITY_ITERATION2_EXECUTIVE_SUMMARY.txt:docs/security/audits/"
        "SECURITY_REVIEW_VALIDATION.txt:docs/security/audits/"
        "SECURITY_VALIDATION_SUMMARY.json:docs/security/audits/"
        "SECURITY_VALIDATION_SUMMARY.txt:docs/security/audits/"
        "SEC_1_3_DELIVERABLES.md:docs/security/audits/"
        "SEC_1_4_REMEDIATION_SUMMARY.md:docs/security/audits/"
        "SEC_1_4_VULNERABILITY_ANALYSIS.md:docs/security/audits/"
        "SEC_1_5_IMPLEMENTATION_GUIDE.md:docs/security/audits/"
        "GNN_SECURITY_AUDIT_REPORT.md:docs/security/audits/"
        "GNN_SECURITY_AUDIT_SUMMARY.json:docs/security/audits/"
        "RUVECTOR_SECURITY_REMEDIATIONS.md:docs/security/audits/"
        "TECHNICAL_DEBT_ASSESSMENT.json:docs/security/audits/"
    )

    # GNN files → docs/security/gnn/
    local gnn_moves=(
        "GNN_IMPLEMENTATION_SUMMARY.md:docs/security/gnn/"
        "GNN_SECURITY_REMEDIATION_GUIDE.md:docs/security/gnn/"
        "GNN_AUDIT_DELIVERY_INDEX.md:docs/security/gnn/"
    )

    # Implementation summaries → docs/reports/
    local reports_moves=(
        "DOCUMENTATION_DELIVERY_SUMMARY.md:docs/reports/"
        "REDIS_KEY_FIX_REPORT.md:docs/reports/"
        "RESEARCH_FINDINGS_EXECUTIVE_SUMMARY.md:docs/reports/"
        "REVIEW_SUMMARY.md:docs/reports/"
        "VALIDATION_REPORT_INDEX.md:docs/reports/"
        "DEVOPS_VALIDATION_INDEX.md:docs/reports/"
        "DRIVENDATA_COMPETITION_ANALYSIS.md:docs/reports/"
        "SEO_MIGRATION_ANALYSIS.md:docs/reports/"
    )

    # RuVector files → docs/ or docs/ruvector/
    local ruvector_moves=(
        "RUVECTOR_DOCUMENTATION_COMPLETION_REPORT.md:docs/ruvector/"
        "IMPLEMENTATION_SUMMARY_RUVECTOR_TESTS.md:docs/testing/"
    )

    # Testing files → docs/testing/
    local testing_moves=(
        "TESTING_GUIDE.md:docs/testing/"
        "README-Rust-Fixer.md:docs/testing/"
    )

    # Code review feedback → docs/reviews/
    local reviews_moves=(
        "CODE_REVIEW_ITERATION_2_FEEDBACK.json:docs/reviews/"
        "CODE_REVIEW_PHASE_5_FEEDBACK.json:docs/reviews/"
        "REVIEW_FEEDBACK.json:docs/reviews/"
        "CODE_REVIEW_SANITIZE_INPUT_FEEDBACK.json:docs/reviews/"
    )

    # Documentation and guides → docs/guides/
    local guides_moves=(
        "README_TRIGGER_DEV_V4_DOCUMENTATION.md:docs/guides/"
    )

    # Shell scripts → scripts/
    local script_moves=(
        "dump_current_files.sh:scripts/utils/"
        "examine-implementation.sh:scripts/utils/"
        "get-docs.sh:scripts/utils/"
        "get_git_content.sh:scripts/utils/"
        "read-files.sh:scripts/utils/"
        "search-ruvector.sh:scripts/utils/"
        "test-read.sh:scripts/utils/"
        "validate-docs.sh:scripts/utils/"
        "verify_files.sh:scripts/utils/"
        "test-rust-fixer-integration.sh:scripts/testing/"
        "test-rust-fixer-validation.sh:scripts/testing/"
    )

    # Combine all move arrays
    local all_moves=(
        "${architecture_moves[@]}"
        "${security_moves[@]}"
        "${gnn_moves[@]}"
        "${reports_moves[@]}"
        "${ruvector_moves[@]}"
        "${testing_moves[@]}"
        "${reviews_moves[@]}"
        "${guides_moves[@]}"
        "${script_moves[@]}"
    )

    # Process moves
    for move in "${all_moves[@]}"; do
        local file="${move%%:*}"
        local dest="${move##*:}"

        if [ -f "$file" ]; then
            if [ "$DRY_RUN" = true ]; then
                log_info "Would move: $file → $dest"
            else
                # Check if destination file already exists
                if [ -f "$dest/$file" ]; then
                    log_warning "Destination file exists, skipping: $dest/$file"
                    continue
                fi

                mv "$file" "$dest"
                log_success "Moved: $file → $dest"
            fi
        else
            log_warning "File not found, skipping: $file"
        fi
    done
}

# Main execution
main() {
    log_info "Starting root directory file organization..."
    log_info "Mode: $([ "$DRY_RUN" = true ] && echo "DRY RUN" || echo "EXECUTE")"

    # Step 1: Create directories
    create_directories

    # Step 2: Delete files
    if [ "$DRY_RUN" = false ]; then
        read -p "Continue with deleting files? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping file deletion"
        else
            delete_files
        fi
    else
        delete_files
    fi

    # Step 3: Move files
    if [ "$DRY_RUN" = false ]; then
        read -p "Continue with moving files? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping file moves"
        else
            move_files
        fi
    else
        move_files
    fi

    log_success "File organization complete!"
}

# Run main function
main "$@"