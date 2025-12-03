#!/bin/bash
set -euo pipefail

# Install Git Hook for Auto-Indexing
#
# Creates a symlink in .git/hooks to enable automatic codebase indexing on commits

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
HOOK_SOURCE="$PROJECT_ROOT/.claude/hooks/post-commit-codebase-index"
HOOK_TARGET="$PROJECT_ROOT/.git/hooks/post-commit"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "Installing RuVector auto-indexing git hook..."

# Check if .git exists
if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
  echo -e "${RED}Error:${NC} Not a git repository"
  exit 1
fi

# Check if hook already exists
if [[ -e "$HOOK_TARGET" ]]; then
  echo -e "${YELLOW}Warning:${NC} post-commit hook already exists at $HOOK_TARGET"
  read -p "Overwrite? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled"
    exit 0
  fi
  rm "$HOOK_TARGET"
fi

# Create symlink
ln -s "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"

echo -e "${GREEN}✓${NC} Git hook installed successfully"
echo ""
echo "The codebase index will now update automatically on every commit."
echo ""
echo "Configuration:"
echo "  - Enable/disable: export RUVECTOR_AUTO_INDEX=true|false"
echo "  - Logs: /tmp/ruvector-index.log"
echo ""
echo "To uninstall: rm $HOOK_TARGET"
