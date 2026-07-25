#!/bin/bash
# Git Hooks Installation Script
# Installs security-focused git hooks to prevent credential exposure
# Usage: bash .claude/hooks/install-git-hooks.sh [--force]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
# Honour core.hooksPath. Hardcoding .git/hooks meant husky repos (which repoint
# it at .husky) silently ignored everything installed here -- the hook file was
# present, executable, and never once invoked. Resolve via git so worktrees and
# absolute hooksPath values both land correctly.
GIT_HOOKS_DIR=$(git -C "$PROJECT_ROOT" config --get core.hooksPath 2>/dev/null || true)
if [ -n "$GIT_HOOKS_DIR" ]; then
    case "$GIT_HOOKS_DIR" in
        /*) ;;
        *) GIT_HOOKS_DIR="$PROJECT_ROOT/$GIT_HOOKS_DIR" ;;
    esac
else
    GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
fi
mkdir -p "$GIT_HOOKS_DIR"
# Prefer a repo-local .claude/hooks, else fall back to the global one (a
# reverse symlink into claude-flow-novice). Only claude-flow-novice has a
# local .claude/hooks, so requiring it meant this installer could not run in
# any other repo -- the second reason credential scanning reached 3 of 41.
HOOKS_SOURCE_DIR="$PROJECT_ROOT/.claude/hooks"
[ -d "$HOOKS_SOURCE_DIR" ] || HOOKS_SOURCE_DIR="$HOME/.claude/hooks"
GLOBAL_HOOKS_DIR="$HOME/.claude/hooks"

# Resolve one hook source, preferring the repo-local copy and falling back to
# the global one. The fallback must be per-FILE, not per-directory: several
# repos have a .claude/hooks/ that exists but contains no pre-commit, so a
# directory-level check picks the local dir and then finds nothing in it.
resolve_hook_source() {
    local name="$1"
    if [ -f "$HOOKS_SOURCE_DIR/$name" ]; then
        printf '%s' "$HOOKS_SOURCE_DIR/$name"
    else
        printf '%s' "$GLOBAL_HOOKS_DIR/$name"
    fi
}
FORCE_INSTALL=false

# Exit codes
EXIT_SUCCESS=0
EXIT_ERROR=1

# Parse arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force)
                FORCE_INSTALL=true
                shift
                ;;
            --help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            *)
                echo "Unknown argument: $1"
                show_help
                exit $EXIT_ERROR
                ;;
        esac
    done
}

# Show help message
show_help() {
    cat << 'EOF'
Usage: bash .claude/hooks/install-git-hooks.sh [OPTIONS]

Install git hooks to prevent credential exposure and ensure code quality.

Options:
  --force         Overwrite existing hooks without confirmation
  --help          Show this help message

Installed Hooks:
  .git/hooks/pre-commit - Scans staged files for credentials before commit

Exit Codes:
  0 - Installation successful
  1 - Installation failed

Examples:
  # Install with confirmation prompts
  bash .claude/hooks/install-git-hooks.sh

  # Install with force overwrite (CI/CD)
  bash .claude/hooks/install-git-hooks.sh --force

For more information, see .claude/hooks/README-GIT-HOOKS.md
EOF
}

# Validate project structure
validate_project() {
    if [ ! -d "$PROJECT_ROOT/.git" ]; then
        echo -e "${RED}ERROR: Not a git repository${NC}"
        echo "Run this script from the root of a git repository"
        return $EXIT_ERROR
    fi

    if [ ! -d "$HOOKS_SOURCE_DIR" ]; then
        echo -e "${RED}ERROR: .claude/hooks directory not found${NC}"
        echo "Expected location: $HOOKS_SOURCE_DIR"
        return $EXIT_ERROR
    fi

    return $EXIT_SUCCESS
}

# Check if .artifacts/logs directory exists, create if needed
ensure_logs_directory() {
    local logs_dir="$PROJECT_ROOT/.artifacts/logs"
    if [ ! -d "$logs_dir" ]; then
        mkdir -p "$logs_dir"
        echo -e "${BLUE}Created logs directory: $logs_dir${NC}"
    fi
}

# Install a single git hook
install_hook() {
    local hook_source="$1"
    local hook_name=$(basename "$hook_source")
    local hook_dest="$GIT_HOOKS_DIR/$hook_name"

    # Check if hook source exists
    if [ ! -f "$hook_source" ]; then
        echo -e "${YELLOW}WARNING: Hook source not found: $hook_source${NC}"
        return 1
    fi

    # Check if destination hook already exists
    if [ -f "$hook_dest" ]; then
        if [ "$FORCE_INSTALL" = false ]; then
            echo -e "${YELLOW}Hook already exists: $hook_name${NC}"
            read -p "Overwrite? (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${BLUE}Skipped: $hook_name${NC}"
                return 0
            fi
        else
            echo -e "${BLUE}Overwriting: $hook_name${NC}"
        fi
    fi

    # Copy hook file
    cp "$hook_source" "$hook_dest"
    chmod +x "$hook_dest"

    # Validate installation
    if [ ! -f "$hook_dest" ] || [ ! -x "$hook_dest" ]; then
        echo -e "${RED}FAILED to install: $hook_name${NC}"
        return $EXIT_ERROR
    fi

    echo -e "${GREEN}Installed: $hook_name${NC}"
    return $EXIT_SUCCESS
}

# Validate hook is functional
validate_hook() {
    local hook_name="$1"
    local hook_path="$GIT_HOOKS_DIR/$hook_name"

    if [ ! -f "$hook_path" ]; then
        echo -e "${RED}VALIDATION FAILED: Hook file not found${NC}"
        return $EXIT_ERROR
    fi

    if [ ! -x "$hook_path" ]; then
        echo -e "${RED}VALIDATION FAILED: Hook is not executable${NC}"
        return $EXIT_ERROR
    fi

    # Check for bash shebang
    if ! head -1 "$hook_path" | grep -q "^#!/bin/bash"; then
        echo -e "${RED}VALIDATION FAILED: Hook missing bash shebang${NC}"
        return $EXIT_ERROR
    fi

    echo -e "${GREEN}VALIDATION PASSED: $hook_name${NC}"
    return $EXIT_SUCCESS
}

# Main installation logic
main() {
    echo -e "${BOLD}Git Hooks Installation${NC}"
    echo "========================================"
    echo ""

    # Parse arguments
    parse_arguments "$@"

    # Validate project structure
    if ! validate_project; then
        exit $EXIT_ERROR
    fi

    # Ensure logs directory exists
    ensure_logs_directory

    echo -e "${BLUE}Installing git hooks to: $GIT_HOOKS_DIR${NC}"
    echo ""

    local install_count=0
    local fail_count=0

    # Install pre-commit hook from the tracked source in .claude/hooks/.
    # This previously passed "$PROJECT_ROOT/.git/hooks/pre-commit" -- the
    # DESTINATION -- as the source, so it copied the file onto itself where one
    # already existed and warned-and-failed on a fresh clone. Net effect: the
    # installer could never actually deploy anything, which is why credential
    # scanning reached only the 3 repos where it had been placed by hand.
    if install_hook "$(resolve_hook_source pre-commit)"; then
        install_count=$((install_count + 1))
    else
        fail_count=$((fail_count + 1))
    fi

    echo ""

    # Validate installations
    echo -e "${BOLD}Validating installations...${NC}"
    echo ""

    if ! validate_hook "pre-commit"; then
        fail_count=$((fail_count + 1))
    fi

    echo ""
    echo -e "${BOLD}Installation Summary${NC}"
    echo "========================================"
    echo "Installed hooks: $install_count"
    echo "Failed hooks: $fail_count"
    echo ""

    if [ $fail_count -eq 0 ]; then
        echo -e "${GREEN}✅ All hooks installed successfully${NC}"
        echo ""
        echo -e "${BOLD}Next steps:${NC}"
        echo "  1. Try committing a file with a mock credential:"
        echo "     git add test.txt"
        echo "     echo 'API_KEY=sk-ant-test123456789' >> test.txt"
        echo "     git commit -m 'Test credential detection'"
        echo ""
        echo "  2. The pre-commit hook will block the commit"
        echo ""
        echo "  3. For test files, use whitelisted patterns:"
        echo "     - sk-ant-mock"
        echo "     - npm_MockTestKey"
        echo "     - test_key / mock_key"
        echo "     - [REDACTED]"
        echo ""
        echo -e "${BOLD}Documentation:${NC}"
        echo "  .claude/hooks/README-GIT-HOOKS.md"
        echo ""
        return $EXIT_SUCCESS
    else
        echo -e "${RED}❌ Installation failed${NC}"
        return $EXIT_ERROR
    fi
}

# Execute main function
main "$@"
