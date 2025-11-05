#!/bin/bash
# CLI Environment Validation Script
# Ensures required tools are available before agent deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Required tools for CFN Loop CLI agents
REQUIRED_TOOLS=(
    "rg:ripgrep"
    "git"
    "node"
    "npm"
    "jq"
    "redis-cli"
    "find"
    "grep"
    "sed"
    "awk"
    "sort"
    "uniq"
    "head"
    "tail"
    "wc"
    "xargs"
)

echo -e "${GREEN}🔧 CFN Loop CLI Environment Validation${NC}"

# Function to check if a tool is available
check_tool() {
    local tool_name="$1"
    local tool_description="$2"

    if command -v "$tool_name" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $tool_name ($tool_description)"
        return 0
    else
        echo -e "  ${RED}✗${NC} $tool_name ($tool_description) - ${YELLOW}MISSING${NC}"
        return 1
    fi
}

# Function to validate Node.js version
validate_node_version() {
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version 2>/dev/null | sed 's/v//')
        local major_version=$(echo "$node_version" | cut -d. -f1)

        if [ "$major_version" -ge 18 ]; then
            echo -e "  ${GREEN}✓${NC} Node.js v$node_version (>= 18 required)"
            return 0
        else
            echo -e "  ${RED}✗${NC} Node.js v$node_version (>= 18 required) - ${YELLOW}VERSION TOO OLD${NC}"
            return 1
        fi
    else
        echo -e "  ${RED}✗${NC} Node.js - ${YELLOW}NOT FOUND${NC}"
        return 1
    fi
}

# Function to check PATH for common development directories
validate_path() {
    echo -e "${YELLOW}Validating PATH...${NC}"

    # Check for common development tool paths
    local paths_to_check=(
        "/usr/local/bin"
        "/usr/bin"
        "/bin"
        "$HOME/.local/bin"
        "$HOME/.cargo/bin"
        "$HOME/.npm-global/bin"
        "./node_modules/.bin"
    )

    local found_paths=0
    for path in "${paths_to_check[@]}"; do
        if [ -d "$path" ] && echo "$PATH" | grep -q "$path"; then
            echo -e "  ${GREEN}✓${NC} $path in PATH"
            ((found_paths++))
        fi
    done

    if [ "$found_paths" -eq 0 ]; then
        echo -e "  ${YELLOW}⚠${NC} Limited development directories in PATH"
        return 1
    fi

    return 0
}

# Function to validate Redis connection
validate_redis() {
    echo -e "${YELLOW}Validating Redis connection...${NC}"

    if redis-cli ping >/dev/null 2>&1; then
        local redis_info=$(redis-cli info server 2>/dev/null | grep "redis_version" | cut -d: -f2 | tr -d '\r')
        echo -e "  ${GREEN}✓${NC} Redis v$redis_info - Connected"
        return 0
    else
        echo -e "  ${RED}✗${NC} Redis - ${YELLOW}NOT CONNECTED${NC}"
        return 1
    fi
}

# Function to validate working directory
validate_working_directory() {
    echo -e "${YELLOW}Validating working directory...${NC}"

    # Check if we're in a git repository
    if git rev-parse --git-dir >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Git repository detected"
    else
        echo -e "  ${YELLOW}⚠${NC} Not in a git repository"
    fi

    # Check for claude-flow-novice installation
    if [ -f "package.json" ] && grep -q "claude-flow-novice" package.json; then
        echo -e "  ${GREEN}✓${NC} claude-flow-novice dependency found"
    else
        echo -e "  ${YELLOW}⚠${NC} claude-flow-novice not found in package.json"
    fi

    # Check for .claude directory
    if [ -d ".claude" ]; then
        echo -e "  ${GREEN}✓${NC} .claude directory found"
    else
        echo -e "  ${YELLOW}⚠${NC} .claude directory not found"
    fi
}

# Function to install missing tools (suggestions)
suggest_installations() {
    echo -e "\n${YELLOW}Installation Suggestions:${NC}"
    echo -e "  ${YELLOW}ripgrep:${NC} sudo apt-get install ripgrep  # Debian/Ubuntu"
    echo -e "  ${YELLOW}ripgrep:${NC} brew install ripgrep              # macOS"
    echo -e "  ${YELLOW}jq:${NC}      sudo apt-get install jq        # Debian/Ubuntu"
    echo -e "  ${YELLOW}jq:${NC}      brew install jq                 # macOS"
    echo -e "  ${YELLOW}Redis:${NC}   sudo systemctl start redis     # Linux"
    echo -e "  ${YELLOW}Redis:${NC}   brew services start redis       # macOS"
}

# Main validation
main() {
    local failed=0

    echo -e "${YELLOW}Checking required tools...${NC}"
    for tool in "${REQUIRED_TOOLS[@]}"; do
        local tool_name=$(echo "$tool" | cut -d: -f1)
        local tool_description=$(echo "$tool" | cut -d: -f2)

        if ! check_tool "$tool_name" "$tool_description"; then
            ((failed++))
        fi
    done

    echo -e "\n${YELLOW}Checking Node.js version...${NC}"
    if ! validate_node_version; then
        ((failed++))
    fi

    echo -e "\n${YELLOW}Checking environment configuration...${NC}"
    if ! validate_path; then
        ((failed++))
    fi

    if ! validate_redis; then
        ((failed++))
    fi

    validate_working_directory

    echo -e "\n${GREEN}=== Validation Summary ===${NC}"
    if [ "$failed" -eq 0 ]; then
        echo -e "${GREEN}✅ All validations passed! CLI environment is ready.${NC}"
        return 0
    else
        echo -e "${RED}❌ $failed validation(s) failed. CLI environment needs setup.${NC}"
        suggest_installations
        return 1
    fi
}

# Run validation
main "$@"