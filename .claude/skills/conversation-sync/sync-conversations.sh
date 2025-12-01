#!/usr/bin/env bash
set -eu

# Conversation Sync Script
# Syncs Claude Code conversation sessions to .claude.json

# Default values
DAYS=7
PROJECT=""
FROM_DATE=""
TO_DATE=""
DRY_RUN=false
CODEX_PATHS=(
  "/mnt/c/Users/${USER}/.codex/sessions"
  "${HOME}/.codex/sessions"
  "/mnt/c/Users/masha/.codex/sessions"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
  cat << EOF
Usage: $0 [OPTIONS]

Sync Claude Code conversation sessions to .claude.json

OPTIONS:
  --days N            Sync conversations from last N days (default: 7)
  --project NAME      Filter by project name (e.g., claude-flow-novice)
  --from DATE         Start date (YYYY-MM-DD format)
  --to DATE           End date (YYYY-MM-DD format)
  --dry-run           Show what would be synced without making changes
  -h, --help          Show this help message

EXAMPLES:
  # Sync last 7 days
  $0

  # Sync last 14 days for specific project
  $0 --days 14 --project claude-flow-novice

  # Sync specific date range
  $0 --from 2025-11-20 --to 2025-11-26

  # Dry run
  $0 --dry-run

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --days)
      DAYS="$2"
      shift 2
      ;;
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --from)
      FROM_DATE="$2"
      shift 2
      ;;
    --to)
      TO_DATE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      show_usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      show_usage
      exit 1
      ;;
  esac
done

# Find .codex/sessions directory
CODEX_DIR=""
for path in "${CODEX_PATHS[@]}"; do
  if [ -d "$path" ]; then
    CODEX_DIR="$path"
    log_info "Found .codex/sessions at: $CODEX_DIR"
    break
  fi
done

if [ -z "$CODEX_DIR" ]; then
  log_error "Could not find .codex/sessions directory"
  log_error "Searched paths:"
  printf '  %s\n' "${CODEX_PATHS[@]}"
  exit 1
fi

# Check for jq
if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  log_error "Install with: sudo apt-get install jq"
  exit 1
fi

# Calculate date range
if [ -n "$FROM_DATE" ] && [ -n "$TO_DATE" ]; then
  DATE_FILTER="-newermt '$FROM_DATE' ! -newermt '$TO_DATE 23:59:59'"
elif [ -n "$DAYS" ]; then
  DATE_FILTER="-mtime -$DAYS"
else
  DATE_FILTER=""
fi

# Find session files
log_info "Searching for conversation files..."
TEMP_LIST=$(mktemp)

if [ -n "$DATE_FILTER" ]; then
  eval "find '$CODEX_DIR' -name '*.jsonl' $DATE_FILTER" > "$TEMP_LIST" 2>/dev/null || true
else
  find "$CODEX_DIR" -name "*.jsonl" > "$TEMP_LIST" 2>/dev/null || true
fi

# Filter by project if specified
if [ -n "$PROJECT" ]; then
  log_info "Filtering by project: $PROJECT"
  FILTERED_LIST=$(mktemp)

  while IFS= read -r file; do
    if [ -f "$file" ]; then
      cwd=$(head -1 "$file" 2>/dev/null | jq -r '.payload.cwd // empty' 2>/dev/null || echo "")
      if [[ "$cwd" == *"$PROJECT"* ]]; then
        echo "$file" >> "$FILTERED_LIST"
      fi
    fi
  done < "$TEMP_LIST"

  mv "$FILTERED_LIST" "$TEMP_LIST"
fi

# Count sessions found
SESSION_COUNT=$(wc -l < "$TEMP_LIST")
log_info "Found $SESSION_COUNT conversation sessions"

if [ "$SESSION_COUNT" -eq 0 ]; then
  log_warn "No conversations found matching criteria"
  rm "$TEMP_LIST"
  exit 0
fi

# Display found sessions
if [ "$DRY_RUN" = true ]; then
  log_info "Dry run - sessions that would be synced:"
  while IFS= read -r file; do
    session_id=$(basename "$file" .jsonl)
    date=$(echo "$file" | grep -oP '\d{4}/\d{2}/\d{2}')
    echo "  - $session_id ($date)"
  done < "$TEMP_LIST"
  rm "$TEMP_LIST"
  exit 0
fi

# Read existing .claude.json or create new
CLAUDE_JSON=".claude.json"
if [ ! -f "$CLAUDE_JSON" ]; then
  log_info "Creating new .claude.json"
  echo '{"conversations":[]}' > "$CLAUDE_JSON"
fi

# Build new conversations array
log_info "Building conversation list..."
NEW_CONVERSATIONS="[]"

# Add existing conversations (to preserve them)
EXISTING_CONVERSATIONS=$(jq -c '.conversations // []' "$CLAUDE_JSON")

# Add new conversations
while IFS= read -r file; do
  session_id=$(basename "$file" .jsonl)
  date=$(echo "$file" | grep -oP '\d{4}/\d{2}/\d{2}')

  # Check if session already exists
  EXISTS=$(echo "$EXISTING_CONVERSATIONS" | jq --arg sid "$session_id" 'any(.[]; .session_id == $sid)')

  if [ "$EXISTS" = "false" ]; then
    NEW_ENTRY=$(jq -n \
      --arg sid "$session_id" \
      --arg date "$date" \
      --arg file "$file" \
      '{session_id: $sid, date: $date, file: $file}')

    EXISTING_CONVERSATIONS=$(echo "$EXISTING_CONVERSATIONS" | jq --argjson entry "$NEW_ENTRY" '. += [$entry]')
  fi
done < "$TEMP_LIST"

# Sort by date (newest first)
SORTED_CONVERSATIONS=$(echo "$EXISTING_CONVERSATIONS" | jq 'sort_by(.date) | reverse')

# Update .claude.json
jq --argjson conversations "$SORTED_CONVERSATIONS" '.conversations = $conversations' "$CLAUDE_JSON" > "${CLAUDE_JSON}.tmp"
mv "${CLAUDE_JSON}.tmp" "$CLAUDE_JSON"

log_info "Successfully synced $SESSION_COUNT conversations to .claude.json"
log_info "Total conversations in .claude.json: $(jq '.conversations | length' "$CLAUDE_JSON")"

# Cleanup
rm "$TEMP_LIST"
