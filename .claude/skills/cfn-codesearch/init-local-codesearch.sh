#!/usr/bin/env bash
# init-local-codesearch.sh - Verify and setup local CodeSearch
# Ensures the Rust binary is installed and PATH is configured

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_PATH="$HOME/.local/bin/local-codesearch"
DB_PATH="$HOME/.local/share/codesearch/index_v2.db"

echo "🚀 Checking Local CodeSearch Installation..."
echo ""

# Check if binary exists in PATH
if command -v local-codesearch &>/dev/null; then
    BINARY_LOCATION=$(command -v local-codesearch)
    VERSION=$(local-codesearch --version 2>/dev/null || echo "unknown")
    echo "✅ local-codesearch found in PATH"
    echo "   Location: $BINARY_LOCATION"
    echo "   Version: $VERSION"
elif [[ -x "$BINARY_PATH" ]]; then
    VERSION=$($BINARY_PATH --version 2>/dev/null || echo "unknown")
    echo "✅ local-codesearch found at $BINARY_PATH"
    echo "   Version: $VERSION"
    echo ""
    echo "⚠️  Binary not in PATH. Add to your shell profile:"
    echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
else
    echo "❌ local-codesearch binary not found"
    echo ""
    echo "📦 Installation options:"
    echo ""
    echo "   Option 1 - Use install script (if available):"
    echo "   ./scripts/install-codesearch-global.sh"
    echo ""
    echo "   Option 2 - Build from source (requires Rust):"
    echo "   cd $SCRIPT_DIR"
    echo "   cargo build --release"
    echo "   cp target/release/local-codesearch ~/.local/bin/"
    echo ""
    exit 1
fi

echo ""

# Check database
if [[ -f "$DB_PATH" ]]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    ENTITY_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entities;" 2>/dev/null || echo "0")
    PROJECT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(DISTINCT project_root) FROM entities WHERE project_root != '';" 2>/dev/null || echo "0")

    echo "✅ Database found"
    echo "   Location: $DB_PATH"
    echo "   Size: $DB_SIZE"
    echo "   Entities: $ENTITY_COUNT"
    echo "   Projects: $PROJECT_COUNT"
else
    echo "⚠️  No database found at $DB_PATH"
    echo "   Index a project with: local-codesearch index --path /your/project"
fi

echo ""
echo "📖 Quick Start:"
echo "   # Index a project"
echo "   local-codesearch index --path ~/projects/my-app --types ts,tsx,js,jsx,py"
echo ""
echo "   # Query via SQL"
echo "   sqlite3 $DB_PATH \"SELECT file_path, name FROM entities WHERE name LIKE '%auth%' LIMIT 10;\""
echo ""
echo "   # Semantic search"
echo "   local-codesearch query \"authentication middleware\""
echo ""
echo "🎉 Local CodeSearch is ready!"
