#!/bin/bash
# Install pre-commit hook for database secret scanning
# Part of claude-flow-novice security infrastructure

set -e

HOOK_SOURCE="config/hooks/pre-commit-db-scan"
HOOK_TARGET=".git/hooks/pre-commit"

echo "🔧 Installing pre-commit hook for database secret scanning..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if source exists
if [ ! -f "$HOOK_SOURCE" ]; then
  echo "❌ Error: Hook source not found: $HOOK_SOURCE"
  echo "   Please run this script from the project root directory"
  exit 1
fi

# Check if .git exists
if [ ! -d ".git" ]; then
  echo "❌ Error: Not a git repository"
  echo "   This script must be run from a git repository root"
  exit 1
fi

# Check for required dependencies
echo ""
echo "📋 Checking dependencies..."

if ! command -v sqlite3 &> /dev/null; then
  echo "❌ Error: sqlite3 command not found"
  echo "   Install with: sudo apt-get install sqlite3 (Ubuntu/Debian)"
  echo "             or: brew install sqlite (macOS)"
  exit 1
fi
echo "  ✅ sqlite3 found"

if ! command -v git &> /dev/null; then
  echo "❌ Error: git command not found"
  exit 1
fi
echo "  ✅ git found"

# Backup existing hook if present
if [ -f "$HOOK_TARGET" ]; then
  BACKUP_FILE="$HOOK_TARGET.backup-$(date +%s)"
  echo ""
  echo "⚠️  Existing pre-commit hook found"
  echo "   Backing up to: $BACKUP_FILE"
  cp "$HOOK_TARGET" "$BACKUP_FILE"
  echo "   ✅ Backup created"
fi

# Copy and install hook
echo ""
echo "📦 Installing hook..."
cp "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"
echo "   ✅ Hook copied to: $HOOK_TARGET"
echo "   ✅ Hook made executable"

# Verify installation
if [ ! -x "$HOOK_TARGET" ]; then
  echo "❌ Error: Hook is not executable"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Pre-commit hook installed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Show what the hook does
echo ""
echo "🔒 Security Protection Enabled:"
echo "   • Scans SQLite/database files for secrets before commits"
echo "   • Detects API keys, passwords, tokens, credentials"
echo "   • Prevents accidental secret leakage in version control"
echo ""
echo "📋 Secret Patterns Detected:"
echo "   • api_key, api-key variations"
echo "   • password, secret, token"
echo "   • ZAI_API_KEY, ANTHROPIC_API_KEY"
echo "   • Bearer tokens, private keys"
echo "   • Anthropic API keys (sk-ant-*)"
echo "   • Session tokens (sess-*)"
echo ""

# Test hook
echo "🧪 Testing hook installation..."
echo ""

# Create a temporary test database with clean data
TEST_DB=".test-hook-validation.db"
sqlite3 "$TEST_DB" "CREATE TABLE test (id INTEGER, data TEXT); INSERT INTO test VALUES (1, 'clean test data');" 2>/dev/null || true

if [ -f "$TEST_DB" ]; then
  # Stage the test file
  git add "$TEST_DB" 2>/dev/null || true

  # Run the hook
  if bash "$HOOK_TARGET" > /dev/null 2>&1; then
    echo "✅ Hook test passed - clean database accepted"
  else
    echo "⚠️  Hook test had issues - but installation is complete"
  fi

  # Clean up
  git reset HEAD "$TEST_DB" 2>/dev/null || true
  rm -f "$TEST_DB"
else
  echo "⚠️  Could not create test database - skipping test"
  echo "   Hook is installed but not tested"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📖 Usage:"
echo "   • Hook runs automatically on: git commit"
echo "   • To bypass (NOT RECOMMENDED): git commit --no-verify"
echo "   • To uninstall: rm .git/hooks/pre-commit"
echo ""
echo "📚 Documentation: docs/PRE_COMMIT_HOOK.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Ready to protect your repository from secret leaks!"
