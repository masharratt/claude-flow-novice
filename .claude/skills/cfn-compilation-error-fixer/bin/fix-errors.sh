#!/bin/bash
set -eu

# CFN Compilation Error Fixer
# Usage: ./fix-errors.sh [rust|typescript] [options]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default to Rust fixer
FIXER_TYPE="${1:-rust}"
shift

# Show help
if [[ "${FIXER_TYPE}" == "--help" ]] || [[ "${FIXER_TYPE}" == "-h" ]]; then
    echo "CFN Compilation Error Fixer"
    echo ""
    echo "Usage:"
    echo "  fix-errors.sh [rust|typescript] [options]"
    echo ""
    echo "Examples:"
    echo "  fix-errors.sh rust                    # Fix Rust errors"
    echo "  fix-errors.sh rust --dry-run         # Dry run for Rust"
    echo "  fix-errors.sh typescript             # Fix TypeScript errors"
    echo "  fix-errors.sh ts --verbose           # Verbose TypeScript fixing"
    echo ""
    echo "Options:"
    echo "  --dry-run     Show what would be fixed without making changes"
    echo "  --verbose     Show detailed output"
    echo "  --help, -h    Show this help message"
    exit 0
fi

# Map short aliases
case "$FIXER_TYPE" in
    "ts")
        FIXER_TYPE="typescript"
        ;;
    "rust"|"typescript")
        # Valid types
        ;;
    *)
        echo "Error: Invalid fixer type '$FIXER_TYPE'"
        echo "Use 'rust' or 'typescript' (or 'ts')"
        exit 1
        ;;
esac

# Check if tsx is available
if ! command -v tsx &> /dev/null; then
    echo "Error: tsx is not installed"
    echo "Run: npm install -g tsx"
    exit 1
fi

# Determine the fixer file
FIXER_FILE="$PROJECT_ROOT/lib/fixer/${FIXER_TYPE}-gated-fixer-v2.ts"

if [[ ! -f "$FIXER_FILE" ]]; then
    echo "Error: Fixer file not found: $FIXER_FILE"
    exit 1
fi

# Run the fixer
echo "🔧 Running CFN Compilation Error Fixer for $FIXER_TYPE..."
echo "   File: $FIXER_FILE"
echo "   Options: $*"
echo ""

# Set environment for optional SDK
export CFN_ALLOW_FALLBACK=true

# Execute with tsx
cd "$PROJECT_ROOT"
tsx "$FIXER_FILE" "$@"