#!/usr/bin/env bash
# query-local.sh - Query local CodeSearch for patterns using Rust binary
# This is a wrapper around the Rust binary for convenience

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="$HOME/.local/share/codesearch/index_v2.db"

# Parse arguments
PATTERN=""
FILE_TYPE=""
LIMIT=10
KIND=""
HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --pattern)
            PATTERN="$2"
            shift 2
            ;;
        --file-type)
            FILE_TYPE="$2"
            shift 2
            ;;
        --kind)
            KIND="$2"
            shift 2
            ;;
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        --help|-h)
            HELP=true
            shift
            ;;
        *)
            if [[ -z "$PATTERN" ]]; then
                PATTERN="$1"
            fi
            shift
            ;;
    esac
done

# Show help
if [[ "$HELP" == true ]] || [[ -z "$PATTERN" ]]; then
    cat << EOF
Usage: query-local [OPTIONS] PATTERN

Query local CodeSearch database for code patterns

Arguments:
  PATTERN               Search pattern (entity name or partial match)

Options:
  --pattern PATTERN     Search pattern
  --file-type TYPE      Filter by file extension (rs, py, js, etc.)
  --kind KIND           Filter by entity kind (function, struct, class, etc.)
  --limit NUMBER        Maximum results (default: 10)
  --help, -h           Show this help

Database Location:
  $DB_PATH

Examples:
  query-local "MyFunction"
  query-local --kind function "auth"
  query-local --file-type rs --limit 20 "handler"

Advanced SQL queries:
  # Find all functions
  sqlite3 $DB_PATH "SELECT file_path, name, line_number FROM entities WHERE kind = 'function' LIMIT 10;"

  # Find by file path pattern
  sqlite3 $DB_PATH "SELECT name, line_number FROM entities WHERE file_path LIKE '%auth%';"

  # Count entities per project
  sqlite3 $DB_PATH "SELECT project_root, COUNT(*) FROM entities GROUP BY project_root;"

EOF
    exit 0
fi

# Check if database exists
if [[ ! -f "$DB_PATH" ]]; then
    echo "❌ Error: CodeSearch database not found at $DB_PATH"
    echo "   Run: local-codesearch index --path /your/project"
    exit 1
fi

# Build SQL query
SQL="SELECT file_path, name, kind, line_number FROM entities WHERE name LIKE '%${PATTERN}%'"

if [[ -n "$FILE_TYPE" ]]; then
    SQL="$SQL AND file_path LIKE '%.${FILE_TYPE}'"
fi

if [[ -n "$KIND" ]]; then
    SQL="$SQL AND kind = '${KIND}'"
fi

SQL="$SQL LIMIT ${LIMIT};"

echo "🔍 Searching for: $PATTERN"
[[ -n "$FILE_TYPE" ]] && echo "📄 File type filter: $FILE_TYPE"
[[ -n "$KIND" ]] && echo "🏷️  Kind filter: $KIND"
echo ""

# Run query
RESULTS=$(sqlite3 -header -column "$DB_PATH" "$SQL" 2>/dev/null)

if [[ -z "$RESULTS" ]]; then
    echo "😔 No matching patterns found for '$PATTERN'"
    echo ""
    echo "💡 Tips:"
    echo "   - Try a broader search term"
    echo "   - Check if your project is indexed: sqlite3 $DB_PATH 'SELECT COUNT(*) FROM entities;'"
    echo "   - Reindex if needed: local-codesearch index --path /your/project"
else
    echo "$RESULTS"
    echo ""
    COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entities WHERE name LIKE '%${PATTERN}%';")
    echo "📊 Total matches: $COUNT (showing up to $LIMIT)"
fi
