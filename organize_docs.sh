#!/bin/bash

# Documentation Organization Script
# Moves loose markdown files from docs/ root to appropriate subdirectories
# Execution: bash organize_docs.sh

set -euo pipefail

DOCS_ROOT="/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/docs"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Documentation Organization Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to create directories
create_directory() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo -e "${GREEN}Created directory:${NC} $dir"
    fi
}

# Function to move file
move_file() {
    local source="$1"
    local destination="$2"
    
    if [ -f "$source" ]; then
        mv "$source" "$destination"
        echo -e "${GREEN}Moved:${NC} $(basename $source) → $(basename $(dirname $destination))/$(basename $destination)"
    else
        echo -e "${RED}Warning:${NC} File not found: $source"
    fi
}

# Step 1: Create new subdirectories
echo -e "${YELLOW}Step 1: Creating new subdirectories...${NC}"
echo ""
create_directory "$DOCS_ROOT/docker/coordinator"
create_directory "$DOCS_ROOT/docker/security"
create_directory "$DOCS_ROOT/operations/coordinator"
create_directory "$DOCS_ROOT/operations/cost-analysis"

echo ""
echo -e "${YELLOW}Step 2: Moving bug report files to bugs/...${NC}"
echo ""
move_file "$DOCS_ROOT/BUG_6_VALIDATION_RESULTS.md" "$DOCS_ROOT/bugs/BUG_6_VALIDATION_RESULTS.md"
move_file "$DOCS_ROOT/BUG_9_AGENT_SPAWN_COMMAND_MISSING.md" "$DOCS_ROOT/bugs/BUG_9_AGENT_SPAWN_COMMAND_MISSING.md"
move_file "$DOCS_ROOT/BUG_FIX_COORDINATOR_ENTRYPOINT.md" "$DOCS_ROOT/bugs/BUG_FIX_COORDINATOR_ENTRYPOINT.md"
move_file "$DOCS_ROOT/AGENT_SPAWNING_ROOT_CAUSE_ANALYSIS.md" "$DOCS_ROOT/bugs/AGENT_SPAWNING_ROOT_CAUSE_ANALYSIS.md"

echo ""
echo -e "${YELLOW}Step 3: Moving security files to security/...${NC}"
echo ""
move_file "$DOCS_ROOT/P1_SECURITY_FINDINGS_SUMMARY.md" "$DOCS_ROOT/security/P1_SECURITY_FINDINGS_SUMMARY.md"
move_file "$DOCS_ROOT/P1_SECURITY_REMEDIATION_PLAN.md" "$DOCS_ROOT/security/P1_SECURITY_REMEDIATION_PLAN.md"
move_file "$DOCS_ROOT/P1_VULNERABILITY_MATRIX.md" "$DOCS_ROOT/security/P1_VULNERABILITY_MATRIX.md"
move_file "$DOCS_ROOT/CLEANUP_SECURITY_FINDINGS.md" "$DOCS_ROOT/security/CLEANUP_SECURITY_FINDINGS.md"
move_file "$DOCS_ROOT/CLEANUP_SECURITY_HARDENING.md" "$DOCS_ROOT/security/CLEANUP_SECURITY_HARDENING.md"
move_file "$DOCS_ROOT/SECURITY_ANALYSIS_BUG6_FIX.md" "$DOCS_ROOT/security/SECURITY_ANALYSIS_BUG6_FIX.md"
move_file "$DOCS_ROOT/SECURITY_ANALYSIS_BUG6_VALIDATOR_REPORT.md" "$DOCS_ROOT/security/SECURITY_ANALYSIS_BUG6_VALIDATOR_REPORT.md"
move_file "$DOCS_ROOT/SECURITY_ANALYSIS_EXECUTIVE_SUMMARY.md" "$DOCS_ROOT/security/SECURITY_ANALYSIS_EXECUTIVE_SUMMARY.md"
move_file "$DOCS_ROOT/SECURITY_AUDIT_EXECUTIVE_SUMMARY.md" "$DOCS_ROOT/security/SECURITY_AUDIT_EXECUTIVE_SUMMARY.md"
move_file "$DOCS_ROOT/SECURITY_FIXES_IMPLEMENTATION_REPORT.md" "$DOCS_ROOT/security/SECURITY_FIXES_IMPLEMENTATION_REPORT.md"
move_file "$DOCS_ROOT/SECURITY_HARDENING_ITERATION_2.md" "$DOCS_ROOT/security/SECURITY_HARDENING_ITERATION_2.md"
move_file "$DOCS_ROOT/SECURITY_HARDENING_SUMMARY.md" "$DOCS_ROOT/security/SECURITY_HARDENING_SUMMARY.md"
move_file "$DOCS_ROOT/SECURITY_P1_ARCHITECTURE_REVIEW.md" "$DOCS_ROOT/security/SECURITY_P1_ARCHITECTURE_REVIEW.md"
move_file "$DOCS_ROOT/SECURITY_REMEDIATION_GUIDE.md" "$DOCS_ROOT/security/SECURITY_REMEDIATION_GUIDE.md"
move_file "$DOCS_ROOT/SECURITY_REMEDIATION_P0_QUICK_REF.md" "$DOCS_ROOT/security/SECURITY_REMEDIATION_P0_QUICK_REF.md"
move_file "$DOCS_ROOT/SECURITY_REVIEW_CLEANUP_SCRIPT.md" "$DOCS_ROOT/security/SECURITY_REVIEW_CLEANUP_SCRIPT.md"
move_file "$DOCS_ROOT/SECURITY_REVIEW_DOCKER_COORDINATOR.md" "$DOCS_ROOT/security/SECURITY_REVIEW_DOCKER_COORDINATOR.md"
move_file "$DOCS_ROOT/SECURITY_REVIEW_DOCKER_WAVE_EXECUTION.md" "$DOCS_ROOT/security/SECURITY_REVIEW_DOCKER_WAVE_EXECUTION.md"
move_file "$DOCS_ROOT/SECURITY_REVIEW_INDEX.md" "$DOCS_ROOT/security/SECURITY_REVIEW_INDEX.md"
move_file "$DOCS_ROOT/SECURITY_REVIEW_PHASE_3_TESTS.md" "$DOCS_ROOT/security/SECURITY_REVIEW_PHASE_3_TESTS.md"
move_file "$DOCS_ROOT/SECURITY_VALIDATION_CHECKLIST.md" "$DOCS_ROOT/security/SECURITY_VALIDATION_CHECKLIST.md"
move_file "$DOCS_ROOT/SECURITY_VALIDATION_REPORT_ITERATION_2.md" "$DOCS_ROOT/security/SECURITY_VALIDATION_REPORT_ITERATION_2.md"

echo ""
echo -e "${YELLOW}Step 4: Moving Docker files to docker/...${NC}"
echo ""
move_file "$DOCS_ROOT/DOCKER_CFN_AGENT_SYSTEM.md" "$DOCS_ROOT/docker/DOCKER_CFN_AGENT_SYSTEM.md"
move_file "$DOCS_ROOT/DOCKER_CHMOD_WSL2_MOUNT_ISSUE.md" "$DOCS_ROOT/docker/DOCKER_CHMOD_WSL2_MOUNT_ISSUE.md"
move_file "$DOCS_ROOT/DOCKER_ENV_STANDARDIZATION.md" "$DOCS_ROOT/docker/DOCKER_ENV_STANDARDIZATION.md"
move_file "$DOCS_ROOT/DOCKER_INFRASTRUCTURE_ANALYSIS.md" "$DOCS_ROOT/docker/DOCKER_INFRASTRUCTURE_ANALYSIS.md"
move_file "$DOCS_ROOT/DOCKER_TROUBLESHOOTING_QUICK_REFERENCE.md" "$DOCS_ROOT/docker/DOCKER_TROUBLESHOOTING_QUICK_REFERENCE.md"

echo ""
echo -e "${YELLOW}Step 5: Moving Docker Coordinator files to docker/coordinator/...${NC}"
echo ""
move_file "$DOCS_ROOT/DOCKER_COORDINATOR_ARCHITECTURE.md" "$DOCS_ROOT/docker/coordinator/DOCKER_COORDINATOR_ARCHITECTURE.md"
move_file "$DOCS_ROOT/DOCKER_COORDINATOR_FINAL.md" "$DOCS_ROOT/docker/coordinator/DOCKER_COORDINATOR_FINAL.md"
move_file "$DOCS_ROOT/DOCKER_COORDINATOR_IMPLEMENTATION_COMPLETE.md" "$DOCS_ROOT/docker/coordinator/DOCKER_COORDINATOR_IMPLEMENTATION_COMPLETE.md"
move_file "$DOCS_ROOT/DOCKER_COORDINATOR_MIGRATION.md" "$DOCS_ROOT/docker/coordinator/DOCKER_COORDINATOR_MIGRATION.md"
move_file "$DOCS_ROOT/DOCKER_COORDINATOR_PLANNING.md" "$DOCS_ROOT/docker/coordinator/DOCKER_COORDINATOR_PLANNING.md"

echo ""
echo -e "${YELLOW}Step 6: Moving Docker security files to docker/security/...${NC}"
echo ""
move_file "$DOCS_ROOT/DOCKER_WAVE_SECURITY_REMEDIATION.md" "$DOCS_ROOT/docker/security/DOCKER_WAVE_SECURITY_REMEDIATION.md"

echo ""
echo -e "${YELLOW}Step 7: Moving operations/coordinator files...${NC}"
echo ""
move_file "$DOCS_ROOT/COORDINATOR_PATH_ISSUE_ANALYSIS.md" "$DOCS_ROOT/operations/coordinator/COORDINATOR_PATH_ISSUE_ANALYSIS.md"
move_file "$DOCS_ROOT/COORDINATOR_TRACKING_FIX.md" "$DOCS_ROOT/operations/coordinator/COORDINATOR_TRACKING_FIX.md"
move_file "$DOCS_ROOT/INTELLIGENT_COORDINATOR_ARCHIVAL.md" "$DOCS_ROOT/operations/coordinator/INTELLIGENT_COORDINATOR_ARCHIVAL.md"

echo ""
echo -e "${YELLOW}Step 8: Moving operational files to operations/...${NC}"
echo ""
move_file "$DOCS_ROOT/CLOUD_DEPLOYMENT_READINESS.md" "$DOCS_ROOT/operations/CLOUD_DEPLOYMENT_READINESS.md"
move_file "$DOCS_ROOT/MODE_A_WAVE_EXECUTION_OPERATIONS.md" "$DOCS_ROOT/operations/MODE_A_WAVE_EXECUTION_OPERATIONS.md"
move_file "$DOCS_ROOT/COORDINATOR_CHANGES_SUMMARY.md" "$DOCS_ROOT/operations/COORDINATOR_CHANGES_SUMMARY.md"
move_file "$DOCS_ROOT/WAVE_CHECKPOINT_IMPLEMENTATION.md" "$DOCS_ROOT/operations/WAVE_CHECKPOINT_IMPLEMENTATION.md"

echo ""
echo -e "${YELLOW}Step 9: Moving cost analysis files to operations/cost-analysis/...${NC}"
echo ""
move_file "$DOCS_ROOT/CFN_CLOUD_DEPLOYMENT_COSTS.md" "$DOCS_ROOT/operations/cost-analysis/CFN_CLOUD_DEPLOYMENT_COSTS.md"
move_file "$DOCS_ROOT/CFN_COST_ANALYSIS_INDEX.md" "$DOCS_ROOT/operations/cost-analysis/CFN_COST_ANALYSIS_INDEX.md"
move_file "$DOCS_ROOT/CFN_COST_QUICK_REFERENCE.md" "$DOCS_ROOT/operations/cost-analysis/CFN_COST_QUICK_REFERENCE.md"
move_file "$DOCS_ROOT/CLOUD_CONTAINER_PRICING_RESEARCH_JANUARY_2025.md" "$DOCS_ROOT/operations/cost-analysis/CLOUD_CONTAINER_PRICING_RESEARCH_JANUARY_2025.md"
move_file "$DOCS_ROOT/CLOUD_PRICING_INDEX.md" "$DOCS_ROOT/operations/cost-analysis/CLOUD_PRICING_INDEX.md"
move_file "$DOCS_ROOT/CLOUD_PRICING_QUICK_REFERENCE.md" "$DOCS_ROOT/operations/cost-analysis/CLOUD_PRICING_QUICK_REFERENCE.md"
move_file "$DOCS_ROOT/PRICING_MODELS_COMPARISON.md" "$DOCS_ROOT/operations/cost-analysis/PRICING_MODELS_COMPARISON.md"

echo ""
echo -e "${YELLOW}Step 10: Moving architecture files...${NC}"
echo ""
move_file "$DOCS_ROOT/INFRASTRUCTURE_ANALYSIS_FINDINGS.md" "$DOCS_ROOT/architecture/INFRASTRUCTURE_ANALYSIS_FINDINGS.md"
move_file "$DOCS_ROOT/INFRASTRUCTURE_ANALYSIS_INDEX.md" "$DOCS_ROOT/architecture/INFRASTRUCTURE_ANALYSIS_INDEX.md"
move_file "$DOCS_ROOT/INFRASTRUCTURE_FIX_VERIFICATION_REPORT.md" "$DOCS_ROOT/architecture/INFRASTRUCTURE_FIX_VERIFICATION_REPORT.md"

echo ""
echo -e "${YELLOW}Step 11: Moving testing files...${NC}"
echo ""
move_file "$DOCS_ROOT/TEST_COVERAGE_GAP_ANALYSIS.md" "$DOCS_ROOT/testing/TEST_COVERAGE_GAP_ANALYSIS.md"

echo ""
echo -e "${YELLOW}Step 12: Moving report files...${NC}"
echo ""
move_file "$DOCS_ROOT/DASHBOARD_BUILD_ERRORS_HANDOFF.md" "$DOCS_ROOT/reports/DASHBOARD_BUILD_ERRORS_HANDOFF.md"
move_file "$DOCS_ROOT/CORPORATE_AI_BUSINESS_USE_CASES.md" "$DOCS_ROOT/reports/CORPORATE_AI_BUSINESS_USE_CASES.md"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Organization Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Display summary statistics
echo -e "${YELLOW}Summary:${NC}"
echo ""
echo "New subdirectories created:"
echo "  - docker/coordinator/"
echo "  - docker/security/"
echo "  - operations/coordinator/"
echo "  - operations/cost-analysis/"
echo ""

# Count remaining files in root
remaining=$(find "$DOCS_ROOT" -maxdepth 1 -type f \( -name "*.md" -o -name "*.csv" -o -name "*.json" \) | wc -l)

if [ "$remaining" -gt 0 ]; then
    echo -e "${YELLOW}Remaining files in root (non-markdown or data files):${NC} $remaining"
    find "$DOCS_ROOT" -maxdepth 1 -type f \( -name "*.md" -o -name "*.csv" -o -name "*.json" \) | sed 's|.*/||' | sort
else
    echo -e "${GREEN}All documentation files organized!${NC}"
fi

echo ""
echo -e "${GREEN}Organization script execution completed.${NC}"

