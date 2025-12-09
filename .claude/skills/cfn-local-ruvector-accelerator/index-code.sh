#!/bin/bash
# index-code.sh - Index codebase patterns for local RuVector

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STORAGE_PATH="${HOME}/.local-ruvector"
DEFAULT_PATH="."

# Parse arguments
PATH_TO_INDEX=""
FILE_TYPES=("")
PATTERNS=""
VERBOSE=false
HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --path)
            PATH_TO_INDEX="$2"
            shift 2
            ;;
        --types)
            IFS=',' read -ra FILE_TYPES <<< "$2"
            shift 2
            ;;
        --patterns)
            PATTERNS="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            HELP=true
            shift
            ;;
        *)
            if [[ -z "$PATH_TO_INDEX" ]]; then
                PATH_TO_INDEX="$1"
            fi
            shift
            ;;
    esac
done

# Show help
if [[ "$HELP" == true ]]; then
    cat << EOF
Usage: index-code [OPTIONS] [PATH]

Index codebase patterns for local RuVector search

Arguments:
  PATH                    Path to directory to index (default: current directory)

Options:
  --path PATH            Path to directory to index
  --types TYPES          Comma-separated file types (default: rs,py,js,ts,go,java)
  --patterns PATTERNS    Comma-separated patterns to focus on
  --verbose              Show detailed progress
  --help, -h             Show this help

Examples:
  index-code --path ~/projects/my-rust-app
  index-code --types rs,py --patterns "error-handling,authentication"
  index-code --verbose

EOF
    exit 0
fi

# Set defaults
if [[ -z "$PATH_TO_INDEX" ]]; then
    PATH_TO_INDEX="$DEFAULT_PATH"
fi

if [[ ${#FILE_TYPES[@]} -eq 0 ]]; then
    FILE_TYPES=("rs" "py" "js" "ts" "go" "java" "tsx" "jsx" "cpp" "c" "h")
fi

# Validate path
if [[ ! -d "$PATH_TO_INDEX" ]]; then
    echo "❌ Error: Directory '$PATH_TO_INDEX' does not exist"
    exit 1
fi

# Convert to absolute path
PATH_TO_INDEX="$(cd "$PATH_TO_INDEX" && pwd)"

# Convert array to comma-separated string for Python
FILE_TYPES_STR=$(IFS=','; echo "${FILE_TYPES[*]}")

echo "🔍 Indexing code patterns in: $PATH_TO_INDEX"
echo "📄 File types: ${FILE_TYPES[*]}"
if [[ -n "$PATTERNS" ]]; then
    echo "🎯 Focusing on patterns: $PATTERNS"
fi

# Initialize search engine
cd "$SCRIPT_DIR"
python3 -c "
import sys
import os
import json
import hashlib
from pathlib import Path
from search_engine_v2 import SearchEngine

def generate_pattern_id(file_path, content):
    \"\"\"Generate unique pattern ID\"\"\"
    hash_obj = hashlib.md5(f'{file_path}:{content}'.encode())
    return f'pattern_{hash_obj.hexdigest()[:16]}'

def extract_functions(content, file_type):
    \"\"\"Extract functions/classes from code\"\"\"
    patterns = []

    # Simple extraction based on language
    if file_type == 'rs':
        # Rust functions, structs, impls
        import re
        fn_pattern = r'^(pub\s+)?(async\s+)?(unsafe\s+)?fn\s+(\w+)'
        struct_pattern = r'^(pub\s+)?struct\s+(\w+)'
        impl_pattern = r'^impl\s+(\w+)\s*(for\s+(\w+))?'

        for i, line in enumerate(content.split('\\n')):
            for pattern, type_name in [(fn_pattern, 'function'),
                                      (struct_pattern, 'struct'),
                                      (impl_pattern, 'impl')]:
                match = re.match(pattern, line)
                if match:
                    patterns.append({
                        'type': type_name,
                        'name': match.groups()[-1],
                        'line': i + 1,
                        'signature': line.strip()
                    })

    elif file_type == 'py':
        # Python functions, classes
        import re
        fn_pattern = r'^\s*def\s+(\w+)'
        class_pattern = r'^\s*class\s+(\w+)'

        for i, line in enumerate(content.split('\\n')):
            if re.match(fn_pattern, line):
                patterns.append({
                    'type': 'function',
                    'name': re.match(fn_pattern, line).group(1),
                    'line': i + 1,
                    'signature': line.strip()
                })
            elif re.match(class_pattern, line):
                patterns.append({
                    'type': 'class',
                    'name': re.match(class_pattern, line).group(1),
                    'line': i + 1,
                    'signature': line.strip()
                })

    return patterns

# Initialize engine
engine = SearchEngine('${STORAGE_PATH}/storage')

# Parse file types from shell
file_types = '${FILE_TYPES_STR}'.split(',')
verbose = '${VERBOSE}' == 'true'

# Index files
indexed_count = 0
pattern_count = 0

print('📂 Scanning files...')
for file_type in file_types:
    file_type = file_type.strip()
    if not file_type:
        continue
    pattern = f'**/*.{file_type}'
    files = list(Path('${PATH_TO_INDEX}').rglob(pattern))

    for file_path in files:
        # Skip node_modules, .git, dist, build directories
        path_str = str(file_path)
        if any(skip in path_str for skip in ['node_modules', '.git', '/dist/', '/build/', '/target/']):
            continue

        if file_path.is_file():
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                if len(content) < 50:  # Skip very small files
                    continue

                # Generate pattern ID
                pattern_id = generate_pattern_id(str(file_path), content)

                # Extract functions/classes
                patterns = extract_functions(content, file_type)

                # Prepare metadata
                metadata = {
                    'file_size': len(content),
                    'line_count': len(content.split('\\n')),
                    'patterns': patterns,
                    'last_modified': os.path.getmtime(file_path)
                }

                # Store pattern
                engine.add_pattern(
                    pattern_id=pattern_id,
                    file_path=str(file_path),
                    file_type=file_type,
                    content=content,
                    metadata=metadata
                )

                indexed_count += 1
                pattern_count += len(patterns)

                if verbose:
                    print(f'  ✅ {file_path} ({len(patterns)} patterns)')

            except Exception as e:
                if verbose:
                    print(f'  ⚠️  Skipped {file_path}: {e}')
                continue

print(f'\\n🎉 Indexed {indexed_count} files with {pattern_count} patterns')
print(f'📍 Storage: ${STORAGE_PATH}')

# Show stats
stats = engine.get_stats()
print(f'\\n📊 Stats:')
print(f'   Total patterns: {stats[\"total_patterns\"]}')
print(f'   Average success rate: {stats[\"avg_success_rate\"]:.2f}')
print(f'   Total usage: {stats[\"total_usage\"]}')
print(f'   File types: {stats[\"unique_file_types\"]}')
"

echo ""
echo "✅ Indexing complete!"
echo "💡 Query patterns with: query-local --pattern 'your search term'"

# Make script executable
chmod +x "${BASH_SOURCE[0]}"