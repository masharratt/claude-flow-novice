#!/usr/bin/env bash
# score-relevance-adapter.sh - Interface adapter for relevance scoring
# Translates test suite API → backend implementation API

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Usage
usage() {
  cat <<EOF
Usage: score-relevance-adapter.sh KEYWORDS_QUERY KEYWORDS_CONTEXT DOMAINS_QUERY DOMAINS_CONTEXT AGENTS_QUERY AGENTS_CONTEXT CREATED_AT SUCCESS_RATE

Adapter layer bridging test suite API and backend implementation API.

Arguments:
  KEYWORDS_QUERY     JSON array of keywords from current task
  KEYWORDS_CONTEXT   JSON array of keywords from historical context
  DOMAINS_QUERY      JSON array of domains from current task
  DOMAINS_CONTEXT    JSON array of domains from historical context
  AGENTS_QUERY       JSON array of agents from current task
  AGENTS_CONTEXT     JSON array of agents from historical context
  CREATED_AT         Historical context timestamp (YYYY-MM-DD)
  SUCCESS_RATE       Historical context confidence score (0.0-1.0)

Example:
  score-relevance-adapter.sh \\
    '["backend","authentication","jwt"]' \\
    '["security","auth","oauth"]' \\
    '["backend","security"]' \\
    '["security"]' \\
    '["backend-dev","security-specialist"]' \\
    '["security-specialist"]' \\
    "2025-10-25" \\
    "0.92"

Output:
  Relevance score (0.0-1.0) written to stdout
EOF
  exit 1
}

# Validate parameters
if [[ $# -ne 8 ]]; then
  echo "Error: Expected 8 parameters, got $#" >&2
  usage
fi

KEYWORDS_QUERY="$1"
KEYWORDS_CONTEXT="$2"
DOMAINS_QUERY="$3"
DOMAINS_CONTEXT="$4"
AGENTS_QUERY="$5"
AGENTS_CONTEXT="$6"
CREATED_AT="$7"
SUCCESS_RATE="$8"

# Validate timestamp format (YYYY-MM-DD)
if ! [[ "$CREATED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Error: Invalid timestamp format. Expected YYYY-MM-DD, got: $CREATED_AT" >&2
  exit 1
fi

# Validate success rate range (0.0-1.0)
if ! awk -v rate="$SUCCESS_RATE" 'BEGIN { exit !(rate >= 0.0 && rate <= 1.0) }'; then
  echo "Error: Invalid success rate. Expected 0.0-1.0, got: $SUCCESS_RATE" >&2
  exit 1
fi

# Validate JSON array format
validate_json_array() {
  local input="$1"
  local name="$2"
  
  if ! echo "$input" | jq empty 2>/dev/null; then
    echo "Error: Invalid JSON format for $name: $input" >&2
    exit 1
  fi
  
  if ! echo "$input" | jq -e 'type == "array"' >/dev/null 2>&1; then
    echo "Error: Expected JSON array for $name, got: $input" >&2
    exit 1
  fi
}

# Validate all JSON array inputs
validate_json_array "$KEYWORDS_QUERY" "KEYWORDS_QUERY"
validate_json_array "$KEYWORDS_CONTEXT" "KEYWORDS_CONTEXT"
validate_json_array "$DOMAINS_QUERY" "DOMAINS_QUERY"
validate_json_array "$DOMAINS_CONTEXT" "DOMAINS_CONTEXT"
validate_json_array "$AGENTS_QUERY" "AGENTS_QUERY"
validate_json_array "$AGENTS_CONTEXT" "AGENTS_CONTEXT"

# Extract first domain from domains array
extract_first_domain() {
  local domains_json="$1"
  echo "$domains_json" | jq -r '.[0] // ""'
}

# Convert JSON array to comma-separated string
json_array_to_csv() {
  local json_array="$1"
  echo "$json_array" | jq -r 'join(",")'
}

# Build current-tags (pass through JSON array)
CURRENT_TAGS="$KEYWORDS_QUERY"

# Extract primary domain from DOMAINS_QUERY
CURRENT_DOMAIN=$(extract_first_domain "$DOMAINS_QUERY")

# Build current-agents comma-separated list from AGENTS_QUERY
CURRENT_AGENTS=$(json_array_to_csv "$AGENTS_QUERY")

# Build historical-record JSON structure
HISTORICAL_RECORD=$(jq -n \
  --argjson tags "$KEYWORDS_CONTEXT" \
  --arg domain "$(extract_first_domain "$DOMAINS_CONTEXT")" \
  --arg agents "$(json_array_to_csv "$AGENTS_CONTEXT")" \
  --arg timestamp "$CREATED_AT" \
  --argjson confidence "$SUCCESS_RATE" \
  '{
    tags: $tags,
    domain: $domain,
    agents: $agents,
    timestamp: $timestamp,
    confidence: $confidence
  }')

# Execute backend implementation with transformed parameters
"$SCRIPT_DIR/score-relevance.sh" \
  --current-tags "$CURRENT_TAGS" \
  --current-domain "$CURRENT_DOMAIN" \
  --current-agents "$CURRENT_AGENTS" \
  --historical-record "$HISTORICAL_RECORD"

# Exit with backend script's exit code
exit $?
