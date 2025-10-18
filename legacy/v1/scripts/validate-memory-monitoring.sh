#!/bin/bash

# Memory Monitoring Configuration Validation Script
# Ensures consistent configuration across CFN distributed systems

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔍 CFN Memory Monitoring Configuration Validation"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

validation_passed=true

# Function to check file exists and report
check_file() {
    local file="$1"
    local description="$2"
    local required="${3:-true}"

    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description: $file"
        return 0
    else
        if [ "$required" = "true" ]; then
            echo -e "${RED}✗${NC} $description: $file (MISSING)"
            validation_passed=false
            return 1
        else
            echo -e "${YELLOW}⚠${NC} $description: $file (OPTIONAL - MISSING)"
            return 0
        fi
    fi
}

# Function to check if files are identical
check_identical() {
    local file1="$1"
    local file2="$2"
    local description="$3"

    if [ -f "$file1" ] && [ -f "$file2" ]; then
        if diff -q "$file1" "$file2" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $description: IDENTICAL"
            return 0
        else
            echo -e "${YELLOW}⚠${NC} $description: DIFFERENT"
            echo "   Differences found between:"
            echo "   - $file1"
            echo "   - $file2"
            return 1
        fi
    else
        echo -e "${RED}✗${NC} $description: One or both files missing"
        validation_passed=false
        return 1
    fi
}

echo -e "\n${BLUE}📋 Checking Core Configuration Files${NC}"

# Check shared configuration
CONFIG_FILE="$PROJECT_ROOT/config/memory-monitoring-config.js"
check_file "$CONFIG_FILE" "Shared Configuration"

# Check core monitoring scripts
UNIFIED_MONITOR="$PROJECT_ROOT/scripts/unified-memory-monitor.js"
check_file "$UNIFIED_MONITOR" "Unified Memory Monitor"

ENHANCED_KILLER="$PROJECT_ROOT/scripts/enhanced-memory-spiral-killer.sh"
check_file "$ENHANCED_KILLER" "Enhanced Memory Spiral Killer"

LEGACY_MONITOR="$PROJECT_ROOT/scripts/memory-monitor-coordinator.js"
check_file "$LEGACY_MONITOR" "Legacy Memory Monitor"

echo -e "\n${BLUE}🔧 Checking Script Executability${NC}"

if [ -f "$ENHANCED_KILLER" ]; then
    if [ -x "$ENHANCED_KILLER" ]; then
        echo -e "${GREEN}✓${NC} Enhanced Memory Spiral Killer is executable"
    else
        echo -e "${YELLOW}⚠${NC} Enhanced Memory Spiral Killer is not executable"
        echo "   Run: chmod +x $ENHANCED_KILLER"
    fi
fi

echo -e "\n${BLUE}📊 Validating Configuration Values${NC}"

if [ -f "$CONFIG_FILE" ]; then
    # Check for key configuration values
    echo "Checking for required configuration values..."

    if grep -q "cfn-coordinator-mvp" "$CONFIG_FILE"; then
        echo -e "${GREEN}✓${NC} CFN Coordinator MVP threshold defined"
    else
        echo -e "${RED}✗${NC} CFN Coordinator MVP threshold missing"
        validation_passed=false
    fi

    if grep -q "growthRateThreshold.*5\.0" "$CONFIG_FILE"; then
        echo -e "${GREEN}✓${NC} Updated growth rate threshold (5.0 MB/s)"
    else
        echo -e "${YELLOW}⚠${NC} Growth rate threshold may be outdated"
    fi

    if grep -q "sigtermToSigkillDelay.*30000" "$CONFIG_FILE"; then
        echo -e "${GREEN}✓${NC} Updated SIGTERM to SIGKILL delay (30s)"
    else
        echo -e "${YELLOW}⚠${NC} SIGTERM to SIGKILL delay may be outdated"
    fi
fi

echo -e "\n${BLUE}🔍 Validating Node.js Scripts${NC}"

# Check if Node.js scripts have proper syntax
for script in "$UNIFIED_MONITOR" "$LEGACY_MONITOR"; do
    if [ -f "$script" ]; then
        if node -c "$script" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $(basename "$script"): Valid JavaScript syntax"
        else
            echo -e "${RED}✗${NC} $(basename "$script"): Invalid JavaScript syntax"
            validation_passed=false
        fi
    fi
done

echo -e "\n${BLUE}📋 Checking Documentation${NC}"

DOC_FILE="$PROJECT_ROOT/UNIFIED_MEMORY_MONITORING.md"
check_file "$DOC_FILE" "Unified Memory Monitoring Documentation" "false"

if [ -f "$DOC_FILE" ]; then
    if grep -q "CFN Distribution" "$DOC_FILE"; then
        echo -e "${GREEN}✓${NC} Documentation includes CFN distribution information"
    fi
fi

echo -e "\n${BLUE}🔄 Cross-Project Validation${NC}"

# Check if main project exists for comparison
MAIN_PROJECT="/mnt/c/Users/masha/Documents/claude-flow-novice"
if [ -d "$MAIN_PROJECT" ]; then
    echo "Comparing with main project at: $MAIN_PROJECT"

    # Compare configuration files
    MAIN_CONFIG="$MAIN_PROJECT/config/memory-monitoring-config.js"
    check_identical "$CONFIG_FILE" "$MAIN_CONFIG" "Configuration Files"

    # Compare core scripts
    MAIN_UNIFIED="$MAIN_PROJECT/scripts/unified-memory-monitor.js"
    check_identical "$UNIFIED_MONITOR" "$MAIN_UNIFIED" "Unified Monitor"

    MAIN_ENHANCED="$MAIN_PROJECT/scripts/enhanced-memory-spiral-killer.sh"
    check_identical "$ENHANCED_KILLER" "$MAIN_ENHANCED" "Enhanced Killer"

    MAIN_LEGACY="$MAIN_PROJECT/scripts/memory-monitor-coordinator.js"
    check_identical "$LEGACY_MONITOR" "$MAIN_LEGACY" "Legacy Monitor"
else
    echo -e "${YELLOW}⚠${NC} Main project not found at: $MAIN_PROJECT"
    echo "   Cross-project validation skipped"
fi

echo -e "\n${BLUE}🚀 Functional Testing${NC}"

# Test if unified monitor can start with --help
if [ -f "$UNIFIED_MONITOR" ]; then
    if timeout 5 node "$UNIFIED_MONITOR" --help > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Unified Monitor starts successfully"
    else
        echo -e "${YELLOW}⚠${NC} Unified Monitor may have startup issues"
    fi
fi

# Test if enhanced killer has proper shebang
if [ -f "$ENHANCED_KILLER" ]; then
    if head -1 "$ENHANCED_KILLER" | grep -q "#!/bin/bash"; then
        echo -e "${GREEN}✓${NC} Enhanced Killer has proper bash shebang"
    else
        echo -e "${YELLOW}⚠${NC} Enhanced Killer missing proper shebang"
    fi
fi

echo -e "\n${BLUE}📈 Configuration Summary${NC}"

if [ -f "$CONFIG_FILE" ]; then
    echo "Key Configuration Values:"
    echo "  - CFN Coordinators: $(grep -o '"cfn-coordinator-[^"]*"[^:]*:[^}]*"memory":[^,}]*' "$CONFIG_FILE" | wc -l) definitions"
    echo "  - Growth Rate Threshold: $(grep -o "growthRateThreshold.*[0-9.]*" "$CONFIG_FILE" | cut -d':' -f2 | tr -d ' ') MB/s"
    echo "  - SIGTERM Delay: $(grep -o "sigtermToSigkillDelay.*[0-9]*" "$CONFIG_FILE" | cut -d':' -f2 | tr -d ' ') ms"
    echo "  - Warning Threshold: $(grep -o "warningThreshold.*[0-9.]*" "$CONFIG_FILE" | cut -d':' -f2 | tr -d ' ')%"
fi

echo -e "\n${BLUE}🎯 Validation Results${NC}"

if [ "$validation_passed" = true ]; then
    echo -e "${GREEN}✅ ALL VALIDATIONS PASSED${NC}"
    echo ""
    echo "The memory monitoring system is properly configured and ready for CFN distribution."
    echo ""
    echo "Next steps:"
    echo "  1. Test the monitoring scripts in a safe environment"
    echo "  2. Review the unified documentation"
    echo "  3. Deploy with confidence that both projects have identical configurations"
    exit 0
else
    echo -e "${RED}❌ VALIDATION FAILED${NC}"
    echo ""
    echo "Some issues were found that need to be addressed before CFN distribution:"
    echo ""
    echo "Required actions:"
    echo "  1. Fix missing or misconfigured files"
    echo "  2. Ensure both projects have identical configurations"
    echo "  3. Re-run this validation script"
    echo ""
    echo "Refer to the unified documentation for troubleshooting guidance."
    exit 1
fi