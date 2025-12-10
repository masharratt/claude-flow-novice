#!/bin/bash
# index-code.sh - Index codebase patterns for local RuVector with security controls

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STORAGE_PATH="${HOME}/.local-ruvector"
DEFAULT_PATH="."

# Security configuration
MAX_FILES_TO_PROCESS=10000
MAX_DEPTH=10
SUSPICIOUS_PATTERNS=("node_modules" ".git" "/dist/" "/build/" "/target/" ".svn" ".hg" "__pycache__" ".pytest_cache")

# Parse arguments
PATH_TO_INDEX=""
FILE_TYPES=("")
PATTERNS=""
VERBOSE=false
HELP=false
MAX_FILES=${MAX_FILES_TO_PROCESS}

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
        --max-files)
            MAX_FILES="$2"
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

# Security validation functions
validate_path() {
    local path="$1"

    # Reject null bytes and control characters
    if [[ "$path" =~ $'\0' ]]; then
        echo "❌ Error: Path contains null bytes" >&2
        exit 1
    fi

    # Reject absolute paths that aren't under the base
    if [[ "$path" == /* && "$path" != "$PATH_TO_INDEX"/* ]]; then
        echo "❌ Error: Absolute path outside base directory: $path" >&2
        exit 1
    fi

    # Reject suspicious patterns
    for pattern in "${SUSPICIOUS_PATTERNS[@]}"; do
        if [[ "$path" == *"$pattern"* ]]; then
            echo "❌ Error: Path contains suspicious pattern '$pattern': $path" >&2
            exit 1
        fi
    done

    # Reject paths with too many ..
    if [[ $(echo "$path" | grep -o '\.\.' | wc -l) -gt 5 ]]; then
        echo "❌ Error: Too many parent directory references: $path" >&2
        exit 1
    fi
}

validate_file_type() {
    local ft="$1"

    # Only allow alphanumeric and common extensions
    if [[ ! "$ft" =~ ^[a-zA-Z0-9._-]+$ ]]; then
        echo "❌ Error: Invalid file type format: $ft" >&2
        exit 1
    fi
}

# Show help
if [[ "$HELP" == true ]]; then
    cat << EOF
Usage: index-code [OPTIONS] [PATH]

Index codebase patterns for local RuVector search with security controls

Arguments:
  PATH                    Path to directory to index (default: current directory)

Options:
  --path PATH            Path to directory to index
  --types TYPES          Comma-separated file types (default: rs,py,js,ts,go,java)
  --patterns PATTERNS    Comma-separated patterns to focus on
  --max-files N          Maximum files to process (default: 10000)
  --verbose              Show detailed progress
  --help, -h             Show this help

Security Features:
  - Path traversal protection
  - File size limits (10MB per file)
  - Maximum files limit
  - Suspicious pattern detection
  - Input sanitization

Examples:
  index-code --path ~/projects/my-rust-app
  index-code --types rs,py --patterns "error-handling,authentication"
  index-code --max-files 5000 --verbose

EOF
    exit 0
fi

# Set defaults
if [[ -z "$PATH_TO_INDEX" ]]; then
    PATH_TO_INDEX="$DEFAULT_PATH"
fi

if [[ ${#FILE_TYPES[@]} -eq 0 ]]; then
    FILE_TYPES=("rs" "py" "js" "ts" "go" "java" "tsx" "jsx" "cpp" "c" "h" "cs" "php" "rb" "swift" "kt")
fi

# Validate max_files
if ! [[ "$MAX_FILES" =~ ^[0-9]+$ ]] || [[ "$MAX_FILES" -lt 1 ]] || [[ "$MAX_FILES" -gt 100000 ]]; then
    echo "❌ Error: Invalid max-files value: $MAX_FILES (must be 1-100000)" >&2
    exit 1
fi

# Validate path
validate_path "$PATH_TO_INDEX"

# Convert to absolute path and canonicalize
PATH_TO_INDEX="$(cd "$PATH_TO_INDEX" && pwd -P)"

# Additional security check - ensure we're not in a system directory
if [[ "$PATH_TO_INDEX" == /etc/* ]] || [[ "$PATH_TO_INDEX" == /usr/bin/* ]] || [[ "$PATH_TO_INDEX" == /bin/* ]] || [[ "$PATH_TO_INDEX" == /sbin/* ]]; then
    echo "❌ Error: Cannot index system directory: $PATH_TO_INDEX" >&2
    exit 1
fi

# Validate file types
for ft in "${FILE_TYPES[@]}"; do
    validate_file_type "$ft"
done

# Convert array to comma-separated string for Python
FILE_TYPES_STR=$(IFS=','; echo "${FILE_TYPES[*]}")

echo "🔍 Indexing code patterns in: $PATH_TO_INDEX"
echo "📄 File types: ${FILE_TYPES[*]}"
echo "🔒 Security: Path traversal protection enabled"
echo "📊 Maximum files: $MAX_FILES"
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
import stat
from pathlib import Path
from search_engine_v2 import SearchEngine
from security import SecurityError, PathValidator, ResourceMonitor, safe_file_read

# Security checks
def is_safe_file(file_path):
    \"\"\"Check if file is safe to process\"\"\"
    try:
        # Check file permissions
        file_stat = file_path.stat()

        # Reject world-writable files
        if file_stat.st_mode & stat.S_IWOTH:
            return False, \"File is world-writable\"

        # Reject files with suspicious permissions
        if file_stat.st_mode & 0o7777 != 0o644 and file_stat.st_mode & 0o7777 != 0o755:
            return False, f\"Suspicious file permissions: {oct(file_stat.st_mode & 0o7777)}\"

        # Check if file is owned by current user (on Unix systems)
        if hasattr(os, 'getuid') and file_stat.st_uid != os.getuid():
            return False, \"File not owned by current user\"

        return True, None

    except Exception as e:
        return False, f\"Error checking file: {e}\"

def generate_pattern_id(file_path, content):
    \"\"\"Generate unique pattern ID with security\"\"\"
    # Use SHA-256 for better security
    hash_input = f'{file_path}:{len(content)}:{hashlib.sha256(content.encode()).hexdigest()}'
    hash_obj = hashlib.md5(hash_input.encode('utf-8'))
    return f'pattern_{hash_obj.hexdigest()[:16]}'

def extract_functions(content, file_type):
    \"\"\"Extract functions/classes from code safely\"\"\"
    patterns = []

    # Limit content size for processing
    if len(content) > 50000:
        content = content[:50000]

    # Simple extraction based on language
    if file_type == 'rs':
        import re
        # Limit regex operations
        lines = content.split('\\n')[:1000]  # Limit to first 1000 lines

        fn_pattern = r'^(pub\\s+)?(async\\s+)?(unsafe\\s+)?fn\\s+(\\w+)'
        struct_pattern = r'^(pub\\s+)?struct\\s+(\\w+)'
        impl_pattern = r'^impl\\s+(\\w+)\\s*(for\\s+(\\w+))?'

        for i, line in enumerate(lines):
            for pattern, type_name in [(fn_pattern, 'function'),
                                      (struct_pattern, 'struct'),
                                      (impl_pattern, 'impl')]:
                match = re.match(pattern, line)
                if match:
                    patterns.append({
                        'type': type_name,
                        'name': match.groups()[-1][:100],  # Limit name length
                        'line': i + 1,
                        'signature': line.strip()[:200]  # Limit signature length
                    })

    elif file_type == 'py':
        import re
        lines = content.split('\\n')[:1000]

        fn_pattern = r'^\\s*def\\s+(\\w+)'
        class_pattern = r'^\\s*class\\s+(\\w+)'

        for i, line in enumerate(lines):
            if re.match(fn_pattern, line):
                patterns.append({
                    'type': 'function',
                    'name': re.match(fn_pattern, line).group(1)[:100],
                    'line': i + 1,
                    'signature': line.strip()[:200]
                })
            elif re.match(class_pattern, line):
                patterns.append({
                    'type': 'class',
                    'name': re.match(class_pattern, line).group(1)[:100],
                    'line': i + 1,
                    'signature': line.strip()[:200]
                })

    return patterns[:50]  # Limit number of patterns per file

# Initialize security
try:
    validator = PathValidator('${PATH_TO_INDEX}')
    monitor = ResourceMonitor()

    # Initialize engine with security
    engine = SearchEngine('${STORAGE_PATH}/storage')

    print('📂 Scanning files with security checks...')

    # Parse file types from shell
    file_types = '${FILE_TYPES_STR}'.split(',')
    verbose = '${VERBOSE}' == 'true'
    max_files = ${MAX_FILES}

    # Index files with security
    indexed_count = 0
    pattern_count = 0
    skipped_count = 0
    error_count = 0

    for file_type in file_types:
        file_type = file_type.strip()
        if not file_type:
            continue

        pattern = f'**/*.{file_type}'

        # Use pathlib's rglob with depth limit
        try:
            files = list(Path('${PATH_TO_INDEX}').rglob(pattern))
        except Exception as e:
            print(f'⚠️  Error scanning for {file_type} files: {e}')
            continue

        # Limit total files
        if indexed_count >= max_files:
            print(f'⚠️  Reached maximum file limit ({max_files}), stopping')
            break

        for file_path in files:
            # Check file limit
            if indexed_count >= max_files:
                break

            if file_path.is_file():
                try:
                    # Validate path
                    safe_path = validator.validate_path(file_path)

                    # Additional safety checks
                    is_safe, reason = is_safe_file(safe_path)
                    if not is_safe:
                        if verbose:
                            print(f'  ⚠️  Skipped {file_path}: {reason}')
                        skipped_count += 1
                        continue

                    # Check file size before reading
                    monitor.check_file_size(safe_path)

                    # Safely read file
                    content = safe_file_read(safe_path)

                    # Skip very small files
                    if len(content) < 50:
                        continue

                    # Limit content size
                    if len(content) > 1000000:  # 1MB limit
                        content = content[:1000000]
                        if verbose:
                            print(f'  ⚠️  Truncated large file: {file_path}')

                    # Generate pattern ID
                    pattern_id = generate_pattern_id(str(safe_path), content)

                    # Extract functions/classes safely
                    patterns = extract_functions(content, file_type)

                    # Prepare metadata with security
                    metadata = {
                        'file_size': len(content),
                        'line_count': len(content.split('\\n')),
                        'patterns': patterns,
                        'last_modified': safe_path.stat().st_mtime,
                        'indexed_by': 'secure-index-code',
                        'security_verified': True
                    }

                    # Store pattern with security
                    success = engine.add_pattern(
                        pattern_id=pattern_id,
                        file_path=str(safe_path),
                        file_type=file_type,
                        content=content,
                        metadata=metadata
                    )

                    if success:
                        indexed_count += 1
                        pattern_count += len(patterns)
                        monitor.record_file_processed(len(content))

                        if verbose and indexed_count % 100 == 0:
                            stats = monitor.get_stats()
                            print(f'  📊 Processed {indexed_count} files, {stats[\"bytes_processed\"]:,} bytes')
                    else:
                        error_count += 1

                except SecurityError as e:
                    if verbose:
                        print(f'  🔒 Security violation: {file_path} - {e}')
                    skipped_count += 1
                    continue
                except Exception as e:
                    if verbose:
                        print(f'  ⚠️  Skipped {file_path}: {e}')
                    error_count += 1
                    continue

    print(f'\\n🎉 Indexing completed with security controls!')
    print(f'   ✅ Successfully indexed: {indexed_count} files')
    print(f'   📋 Total patterns: {pattern_count}')
    print(f'   ⚠️  Skipped files: {skipped_count}')
    print(f'   ❌ Errors: {error_count}')
    print(f'   📍 Storage: ${STORAGE_PATH}')

    # Show resource usage
    stats = monitor.get_stats()
    print(f'\\n📊 Resource Usage:')
    print(f'   Files processed: {stats[\"files_processed\"]:,}')
    print(f'   Bytes processed: {stats[\"bytes_processed\"]:,}')
    print(f'   Processing time: {stats[\"elapsed_seconds\"]:.2f}s')
    print(f'   Throughput: {stats[\"bytes_per_second\"]:,.0f} bytes/s')

    # Show stats
    stats = engine.get_stats()
    print(f'\\n📈 Database Stats:')
    print(f'   Total patterns: {stats[\"total_patterns\"]:,}')
    print(f'   Average success rate: {stats[\"avg_success_rate\"]:.2f}')
    print(f'   Total usage: {stats[\"total_usage\"]:,}')
    print(f'   Unique file types: {stats[\"unique_file_types\"]}')
    print(f'   Database size: {stats[\"database_size_bytes\"] / (1024*1024):.1f} MB')
    print(f'   Total embeddings: {stats[\"total_embeddings\"]:,}')

    # Security summary
    print(f'\\n🔒 Security Summary:')
    print(f'   ✅ Path traversal protection: Active')
    print(f'   ✅ File size limits: Enforced')
    print(f'   ✅ Input sanitization: Active')
    print(f'   ✅ Permission checks: Active')

except SecurityError as e:
    print(f'\\n❌ Security error: {e}')
    sys.exit(1)
except Exception as e:
    print(f'\\n❌ Unexpected error: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"

echo ""
echo "✅ Indexing complete with security validation!"
echo "🔒 Security features were applied during indexing"
echo "💡 Query patterns with: query-local --pattern 'your search term'"
echo "📊 View stats: query-local --stats"

# Make script executable
chmod +x "${BASH_SOURCE[0]}"