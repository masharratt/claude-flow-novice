#!/bin/bash
set -eu

# google-sheets-validation/validate.sh
# Validates dependencies and configuration
# Version: 1.0.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Validation helpers
validate_command() {
  local cmd="$1"
  local message="${2:-Command '$cmd' not found}"

  if command -v "$cmd" &>/dev/null; then
    echo -e "${GREEN}✓${NC} $cmd available"
    return 0
  else
    echo -e "${RED}✗${NC} $message"
    ((VALIDATION_ERRORS++))
    return 1
  fi
}

validate_file() {
  local file="$1"
  local message="${2:-File '$file' not found}"

  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file exists"
    return 0
  else
    echo -e "${RED}✗${NC} $message"
    ((VALIDATION_ERRORS++))
    return 1
  fi
}

validate_executable() {
  local file="$1"
  local message="${2:-File '$file' is not executable}"

  if [ -x "$file" ]; then
    echo -e "${GREEN}✓${NC} $file is executable"
    return 0
  else
    echo -e "${RED}✗${NC} $message"
    ((VALIDATION_ERRORS++))
    return 1
  fi
}

# Main validation
main() {
  echo "========================================"
  echo "Validating google-sheets-validation"
  echo "========================================"
  echo ""

  echo "Checking dependencies..."
  validate_command "bash" "Bash shell required"
  validate_command "jq" "jq (JSON processor) required for JSON handling"
  validate_command "date" "date command required for timestamps"
  validate_command "curl" "curl required for Google Sheets API calls (optional)"

  echo ""
  echo "Checking skill files..."
  validate_file "$SCRIPT_DIR/SKILL.md" "SKILL.md documentation file required"
  validate_executable "$SCRIPT_DIR/validate-state.sh" "validate-state.sh must be executable"
  validate_executable "$SCRIPT_DIR/test.sh" "test.sh must be executable"

  echo ""
  echo "Checking directory structure..."
  if [ -d "$SCRIPT_DIR" ]; then
    echo -e "${GREEN}✓${NC} Skill directory exists"
  else
    echo -e "${RED}✗${NC} Skill directory missing"
    ((VALIDATION_ERRORS++))
  fi

  echo ""
  echo "Testing basic functionality..."
  if "$SCRIPT_DIR/validate-state.sh" --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} validate-state.sh responds to --help"
  else
    echo -e "${RED}✗${NC} validate-state.sh help command failed"
    ((VALIDATION_ERRORS++))
  fi

  echo ""
  echo "Checking environment..."
  if [ -z "${GOOGLE_API_KEY:-}" ]; then
    echo -e "${YELLOW}!${NC} GOOGLE_API_KEY not set (optional for testing)"
    ((VALIDATION_WARNINGS++))
  else
    echo -e "${GREEN}✓${NC} GOOGLE_API_KEY is set"
  fi

  echo ""
  echo "========================================"
  echo "Validation Results"
  echo "========================================"

  if [ $VALIDATION_ERRORS -eq 0 ] && [ $VALIDATION_WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All validations passed${NC}"
    exit 0
  elif [ $VALIDATION_ERRORS -eq 0 ]; then
    echo -e "${YELLOW}! ${VALIDATION_WARNINGS} warnings found${NC}"
    echo "Skill may have configuration issues"
    exit 0
  else
    echo -e "${RED}✗ ${VALIDATION_ERRORS} validation errors found${NC}"
    if [ $VALIDATION_WARNINGS -gt 0 ]; then
      echo -e "${YELLOW}! ${VALIDATION_WARNINGS} warnings found${NC}"
    fi
    exit 1
  fi
}

main "$@"
