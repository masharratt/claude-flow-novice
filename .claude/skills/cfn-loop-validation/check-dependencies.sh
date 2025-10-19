#!/bin/bash
# Dependency checker for CFN Loop Validation

check_command() {
  if command -v "$1" &> /dev/null; then
    VERSION=$($1 --version 2>&1 | head -n1)
    echo "✅ $1: $VERSION"
    return 0
  else
    echo "❌ $1: NOT FOUND"
    return 1
  fi
}

echo "Checking dependencies for CFN Loop Validation..."
MISSING=0

# Required dependencies
check_command "bash" || MISSING=$((MISSING+1))
check_command "jq" || MISSING=$((MISSING+1))
check_command "bc" || MISSING=$((MISSING+1))

if [ $MISSING -eq 0 ]; then
  echo ""
  echo "✅ All required dependencies installed"
  exit 0
else
  echo ""
  echo "❌ Missing $MISSING required dependencies"
  exit 1
fi