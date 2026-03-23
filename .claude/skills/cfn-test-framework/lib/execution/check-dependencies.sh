#!/bin/bash
# Dependency checker for Test Execution

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

echo "Checking dependencies for Test Execution..."
MISSING=0

# Required dependencies
check_command "node" || MISSING=$((MISSING+1))
check_command "npm" || MISSING=$((MISSING+1))
check_command "jq" || MISSING=$((MISSING+1))

# Optional dependencies
if ! command -v "redis-cli" &> /dev/null; then
  echo "⚠️  redis-cli: NOT FOUND (optional - for result caching)"
fi

if [ $MISSING -eq 0 ]; then
  echo ""
  echo "✅ All required dependencies installed"
  exit 0
else
  echo ""
  echo "❌ Missing $MISSING required dependencies"
  exit 1
fi