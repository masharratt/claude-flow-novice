#!/usr/bin/env bash
set -e

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# cfn-project-management/lib/backlog/add-backlog-item.sh
# Adds structured backlog items to readme/BACKLOG.md

# Source shared validation utilities. This is SHARED CFN CODE, so it resolves
# from this script's own location, never from a caller-supplied root: the old
# "$PROJECT_ROOT/..." form ran before PROJECT_ROOT was assigned (line ~95) and
# expanded to the absolute path "/.claude/skills/...". The cfn-changelog-management
# skill it pointed at is also gone; the surviving copy is the sibling below.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../changelog/lib/validation.sh"

# Default values
PRIORITY="P2"
CATEGORY="Technical-Debt"
SPRINT="Unknown"
TAGS=""
ITEM=""
WHY=""
SOLUTION=""
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --item)
      ITEM="$2"
      shift 2
      ;;
    --why)
      WHY="$2"
      shift 2
      ;;
    --solution)
      SOLUTION="$2"
      shift 2
      ;;
    --sprint)
      SPRINT="$2"
      shift 2
      ;;
    --priority)
      PRIORITY="$2"
      shift 2
      ;;
    --tags)
      TAGS="$2"
      shift 2
      ;;
    --category)
      CATEGORY="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validation
if [[ -z "$ITEM" ]]; then
  echo "Error: --item is required" >&2
  exit 1
fi

if [[ -z "$WHY" ]]; then
  echo "Error: --why is required" >&2
  exit 1
fi

if [[ -z "$SOLUTION" ]]; then
  echo "Error: --solution is required" >&2
  exit 1
fi

# Validate item length using shared validation
validate_string_length "$ITEM" 10 500 "item" || exit 1

# Validate priority using shared enum validation
validate_enum "$PRIORITY" "priority" "P0|P1|P2|P3" || exit 1

# Validate category using shared enum validation
validate_enum "$CATEGORY" "category" "Feature|Bug|Technical-Debt|Optimization" || exit 1

# Path to backlog file.
# The backlog is PROJECT-LOCAL DATA, so it is anchored on the invoking project,
# not on this script's location. A BASH_SOURCE-derived root resolves into the CFN
# repo (skills reach every project through the reverse symlinks in CLAUDE.md), so
# the old form wrote every project's backlog into the CFN checkout.
# Shared CFN code -> BASH_SOURCE or $HOME. Project data -> $CLAUDE_PROJECT_DIR/cwd.
BACKLOG_FILE="readme/BACKLOG.md"
PROJECT_DATA_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
BACKLOG_PATH="$PROJECT_DATA_ROOT/$BACKLOG_FILE"

# Create backlog file if it doesn't exist
if [[ ! -f "$BACKLOG_PATH" ]]; then
  echo "Creating $BACKLOG_FILE..."
  mkdir -p "$(dirname "$BACKLOG_PATH")"
  cat > "$BACKLOG_PATH" <<'EOF'
# Claude Flow Novice - Backlog

Last Updated: $(date +%Y-%m-%d)

## Active Items

### P0 - Critical

### P1 - High Priority

### P2 - Medium Priority

### P3 - Low Priority / Nice-to-Have

## Completed Items

---

## Item Template

**[PRIORITY] - [Item Title]**
- **Sprint Backlogged**: Sprint X
- **Category**: Feature/Bug/Technical-Debt/Optimization
- **Description**: What needs to be done
- **Rationale**: Why it was deferred
- **Proposed Solution**: How to implement
- **Tags**: `tag1`, `tag2`, `tag3`
- **Status**: Backlogged
- **Date Added**: YYYY-MM-DD
EOF
fi

# Check for duplicates (simple substring match)
if grep -qi "$ITEM" "$BACKLOG_PATH" 2>/dev/null; then
  echo "Warning: Similar item may already exist in backlog" >&2
  echo "Existing matches:" >&2
  grep -i "$ITEM" "$BACKLOG_PATH" | head -3 >&2

  if [[ "$FORCE" != "true" ]]; then
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted" >&2
      exit 1
    fi
  else
    echo "Force mode enabled, proceeding with duplicate item" >&2
  fi
fi

# Format tags
FORMATTED_TAGS=""
if [[ -n "$TAGS" ]]; then
  IFS=',' read -ra TAG_ARRAY <<< "$TAGS"
  for tag in "${TAG_ARRAY[@]}"; do
    FORMATTED_TAGS="${FORMATTED_TAGS}\`${tag}\`, "
  done
  FORMATTED_TAGS="${FORMATTED_TAGS%, }"  # Remove trailing comma
fi

# Generate item title (first 60 chars of description)
ITEM_TITLE="${ITEM:0:60}"
if (( ${#ITEM} > 60 )); then
  ITEM_TITLE="${ITEM_TITLE}..."
fi

# Current date
CURRENT_DATE=$(date +%Y-%m-%d)

# Create backlog entry
BACKLOG_ENTRY=$(cat <<EOF

**[$PRIORITY] - $ITEM_TITLE**
- **Sprint Backlogged**: $SPRINT
- **Category**: $CATEGORY
- **Description**: $ITEM
- **Rationale**: $WHY
- **Proposed Solution**: $SOLUTION
- **Tags**: $FORMATTED_TAGS
- **Status**: Backlogged
- **Date Added**: $CURRENT_DATE

EOF
)

# Insert into appropriate priority section
SECTION_MARKER="### $PRIORITY"

# Use awk to insert after section marker
awk -v section="$SECTION_MARKER" -v entry="$BACKLOG_ENTRY" '
  $0 ~ section {
    print
    print entry
    next
  }
  {print}
' "$BACKLOG_PATH" > "${BACKLOG_PATH}.tmp"

mv "${BACKLOG_PATH}.tmp" "$BACKLOG_PATH"

# Update "Last Updated" timestamp
sed -i "s/Last Updated: .*/Last Updated: $CURRENT_DATE/" "$BACKLOG_PATH"

echo "✅ Backlog item added successfully"
echo "   Priority: $PRIORITY"
echo "   Category: $CATEGORY"
echo "   Sprint: $SPRINT"
echo "   Location: $BACKLOG_FILE"

# Output path for scripting
echo "$BACKLOG_PATH"
