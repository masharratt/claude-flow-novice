# CFN Error Batching Strategy - Core Library Functions
# Shared utility functions for all modules

# Parse memory string to bytes
parse_memory_bytes() {
  local mem_str="$1"
  local num=$(echo "$mem_str" | sed 's/[^0-9]//g')
  local unit=$(echo "$mem_str" | sed 's/[0-9]//g' | tr '[:upper:]' '[:lower:]')

  case "$unit" in
    g) echo "$((num * 1024 * 1024 * 1024))" ;;
    m) echo "$((num * 1024 * 1024))" ;;
    k) echo "$((num * 1024))" ;;
    *) echo "$num" ;;
  esac
}

# Format bytes to human-readable
format_memory() {
  local bytes="$1"

  if [ "$bytes" -ge $((1024 * 1024 * 1024)) ]; then
    echo "$((bytes / (1024 * 1024 * 1024)))GB"
  elif [ "$bytes" -ge $((1024 * 1024)) ]; then
    echo "$((bytes / (1024 * 1024)))MB"
  else
    echo "$((bytes / 1024))KB"
  fi
}

# Safe JSON encoding
encode_json_string() {
  local str="$1"
  echo "$str" | jq -Rs .
}

# Extract JSON field safely
jq_safe() {
  local filter="$1"
  local json="$2"
  echo "$json" | jq -r "$filter" 2>/dev/null || echo ""
}

# Merge JSON objects
jq_merge() {
  jq -s 'reduce .[] as $item ({}; . * $item)'
}
