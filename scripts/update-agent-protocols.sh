#!/usr/bin/env bash
set -eu

# Bulk update all agent profiles with shared protocol reference
# Inserts "→ See: .claude/agents/SHARED_PROTOCOL.md" after frontmatter

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$PROJECT_ROOT/.claude/agents"
PROTOCOL_REF="→ **Skills**: Cerebras MCP (blueprint prompts for code gen) | RuVector (semantic codebase search) | Post-edit hook (validation after file changes)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Count files
TOTAL=0
UPDATED=0
SKIPPED=0
ERRORS=0

process_agent() {
    local file="$1"
    local relative_path="${file#$PROJECT_ROOT/}"

    # Skip non-markdown files
    [[ ! "$file" =~ \.md$ ]] && return 0

    # Skip SHARED_PROTOCOL.md itself
    [[ "$file" == *"SHARED_PROTOCOL.md" ]] && return 0

    # Skip README and CLAUDE.md files (not agent profiles)
    local basename=$(basename "$file")
    [[ "$basename" == "README.md" || "$basename" == "CLAUDE.md" ]] && return 0

    ((TOTAL++))

    # Check if already has the protocol reference
    if grep -q "SHARED_PROTOCOL.md" "$file" 2>/dev/null; then
        log_warn "Already has protocol ref: $relative_path"
        ((SKIPPED++))
        return 0
    fi

    # Check if has frontmatter (starts with ---)
    if ! head -1 "$file" | grep -q "^---"; then
        log_warn "No frontmatter found: $relative_path"
        ((SKIPPED++))
        return 0
    fi

    # Find end of frontmatter (second ---)
    local frontmatter_end=$(awk '/^---$/{n++;if(n==2){print NR;exit}}' "$file")

    if [[ -z "$frontmatter_end" ]]; then
        log_warn "Malformed frontmatter: $relative_path"
        ((SKIPPED++))
        return 0
    fi

    # Insert protocol reference after frontmatter
    # Using temp file approach for portability
    local tmp_file=$(mktemp)

    # Write frontmatter
    head -n "$frontmatter_end" "$file" > "$tmp_file"

    # Add blank line and protocol reference
    echo "" >> "$tmp_file"
    echo "$PROTOCOL_REF" >> "$tmp_file"

    # Add rest of file
    tail -n +"$((frontmatter_end + 1))" "$file" >> "$tmp_file"

    # Replace original
    mv "$tmp_file" "$file"

    log_info "Updated: $relative_path"
    ((UPDATED++))
}

# Main execution
echo "=========================================="
echo "Agent Protocol Bulk Update Script"
echo "=========================================="
echo ""
echo "Protocol reference to insert:"
echo "  $PROTOCOL_REF"
echo ""
echo "Scanning: $AGENTS_DIR"
echo ""

# Process all .md files in agents directory recursively
while IFS= read -r -d '' file; do
    process_agent "$file" || ((ERRORS++))
done < <(find "$AGENTS_DIR" -name "*.md" -type f -print0 2>/dev/null)

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Total agent files scanned: $TOTAL"
echo "Updated: $UPDATED"
echo "Skipped (already has ref or no frontmatter): $SKIPPED"
echo "Errors: $ERRORS"
echo ""

if [[ $UPDATED -gt 0 ]]; then
    log_info "Run 'git diff' to review changes"
fi
