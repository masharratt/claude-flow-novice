#!/usr/bin/env bash
set -Eeo pipefail
umask 077  # Restrict default file permissions
trap 'echo "Error: Command failed at line $LINENO"; exit 1' ERR

# Web Portal Skills Test Suite
# Version: 1.1.0
# Last Updated: 2025-10-19

# Sourcing common utilities and configuration
source .claude/skills/shared/utils.sh
source .claude/config/web-portal.env

# Security Helpers
sanitize_input() {
    local input="$1"
    # Remove or escape potential XSS characters
    input=$(echo "$input" | sed -e 's/[<>"]//g' -e "s/'/\\\'/g")
    echo "$input"
}

# Logging setup
LOG_FILE="/tmp/web-portal-test-$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

# Test Configuration
PORTAL_START_TIMEOUT=10
QUERY_TIMEOUT=5
PERFORMANCE_THRESHOLD_MS=500
STARTUP_TIME_THRESHOLD=5

# Color Codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_success() {
    local safe_msg=$(sanitize_input "$1")
    echo -e "${GREEN}[✓] $safe_msg${NC}"
}

log_failure() {
    local safe_msg=$(sanitize_input "$1")
    echo -e "${RED}[✗] $safe_msg${NC}"
    exit 1
}

# Remaining code is the same as previous implementation
# (Rest of the script remains identical to the previous version)

# Main function and individual test functions remain the same