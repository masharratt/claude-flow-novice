#!/bin/bash
# query-local.sh - Query local RuVector for patterns

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STORAGE_PATH="${HOME}/.local-ruvector"

# Parse arguments
PATTERN=""
FILE_TYPE=""
LIMIT=10
MIN_SIMILARITY=0.7
SHOW_CONTENT=false
JSON_OUTPUT=false
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
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        --min-similarity)
            MIN_SIMILARITY="$2"
            shift 2
            ;;
        --show-content)
            SHOW_CONTENT=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
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

Query local RuVector for similar code patterns

Arguments:
  PATTERN               Search pattern or description

Options:
  --pattern PATTERN     Search pattern or description
  --file-type TYPE      Filter by file type (rs, py, js, etc.)
  --limit NUMBER        Maximum results (default: 10)
  --min-similarity NUM  Minimum similarity threshold (default: 0.7)
  --show-content        Show full content of matching patterns
  --json                Output results in JSON format
  --help, -h           Show this help

Examples:
  query-local "authentication middleware"
  query-local --file-type rs "error handling"
  query-local --limit 5 --show-content "database connection"
  query-local --json "API endpoint"

EOF
    exit 0
fi

# Check if storage exists
if [[ ! -d "$STORAGE_PATH" ]]; then
    echo "❌ Error: Local RuVector not initialized"
    echo "   Run: init-local-ruvector"
    exit 1
fi

# Run query
cd "$SCRIPT_DIR"
python3 -c "
import sys
import json
from search_engine_v2 import SearchEngine

# Initialize engine
engine = SearchEngine('${STORAGE_PATH}/storage')

# Perform search
results = engine.search(
    query_pattern='${PATTERN}',
    file_type='${FILE_TYPE}' if '${FILE_TYPE}' else None,
    limit=${LIMIT},
    min_similarity=${MIN_SIMILARITY}
)

if not results:
    print('😔 No matching patterns found')
    print(f'💡 Try adjusting the similarity threshold (current: ${MIN_SIMILARITY})')
    sys.exit(0)

# Format output
if ${JSON_OUTPUT}:
    output = []
    for result in results:
        output.append({
            'id': result['id'],
            'file_path': result['file_path'],
            'file_type': result['file_type'],
            'similarity': round(result['similarity'], 3),
            'composite_score': round(result['composite_score'], 3),
            'success_rate': result['success_rate'],
            'usage_count': result['usage_count'],
            'metadata': result['metadata'],
            'content': result['content'] if ${SHOW_CONTENT} else None
        })
    print(json.dumps(output, indent=2))
else:
    print(f'🔍 Found {len(results)} patterns matching \"${PATTERN}\"')
    print()
    
    for i, result in enumerate(results, 1):
        print(f'{i}. {result[\"file_path\"]}')
        print(f'   📄 Type: {result[\"file_type\"]}')
        print(f'   🎯 Similarity: {result[\"similarity\"]:.3f}')
        print(f'   ⭐ Score: {result[\"composite_score\"]:.3f}')
        print(f'   ✅ Success Rate: {result[\"success_rate\"]:.2f}')
        print(f'   📊 Usage: {result[\"usage_count\"]} times')
        
        # Show patterns from metadata
        if result['metadata'] and 'patterns' in result['metadata']:
            patterns = result['metadata']['patterns']
            if patterns:
                print(f'   🔧 Contains: {len(patterns)} items')
                for pattern in patterns[:3]:  # Show first 3
                    print(f'      - {pattern[\"type\"]}: {pattern[\"name\"]}')
                if len(patterns) > 3:
                    print(f'      ... and {len(patterns) - 3} more')
        
        # Show content if requested
        if ${SHOW_CONTENT}:
            print()
            print('   📝 Content:')
            # Show first 20 lines
            lines = result['content'].split('\\n')
            for line in lines[:20]:
                print(f'      {line}')
            if len(lines) > 20:
                print(f'      ... ({len(lines) - 20} more lines)')
        
        print()
"

# Make script executable
chmod +x "${BASH_SOURCE[0]}"