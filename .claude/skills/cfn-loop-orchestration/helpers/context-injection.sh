#!/usr/bin/env bash

# Add these new global variables near the top of the script, with other global declarations
ANTIPATTERN_STATS_KEY="ace:stats:antipatterns"
INJECT_ANTIPATTERNS=true  # Toggle for global anti-pattern injection

# Add this function in the script, after the logging function
##############################################################################
# Track Anti-Pattern Injection Stats
##############################################################################
track_antipattern_stats() {
  local action="$1"  # 'injected' or 'prevented'
  local domain="${2:-general}"

  if ! command -v redis-cli &> /dev/null; then
    log "WARN" "redis-cli not available, skipping anti-pattern stats tracking"
    return 0
  fi

  # Increment domain-specific and global stats
  redis-cli HINCRBY "$ANTIPATTERN_STATS_KEY:$domain" "$action" 1 > /dev/null 2>&1
  redis-cli HINCRBY "$ANTIPATTERN_STATS_KEY:global" "$action" 1 > /dev/null 2>&1

  log "INFO" "Anti-pattern stats tracked: $action for domain $domain"
}

# Modify the extract_insights function to include anti-pattern severity
extract_insights() {
  local filtered_results="$1"
  local insight_type="$2"
  local max_count="$3"

  # Add severity scoring to anti-pattern extraction
  local insights
  insights=$(echo "$filtered_results" | jq -r --arg type "$insight_type" '
    [.[].insights[]? |
     select(.type == $type) |
     {
       text: .text,
       severity: .severity // 0.5,
       confidence: .confidence // 0.75
     }
   ] |
   sort_by(.severity) |
   reverse |
   .[:'"$max_count"'] |
   .[] |
   select(.confidence >= 0.70) |
   .text
  ' 2>/dev/null || echo "")

  echo "$insights"
}

# Modify the format_markdown function to handle anti-pattern severity
format_markdown() {
  local filtered_results="$1"

  # Existing function body, but add severity rendering for anti-patterns
  # Example modification in the anti-patterns section:
  if [ -n "$anti_patterns" ]; then
    markdown+="### Anti-Patterns (Sorted by Severity ⚠️)\n"
    while IFS= read -r line; do
      local severity=$(echo "$filtered_results" | jq -r --arg text "$line" '
        .[].insights[]? |
        select(.type == "anti-pattern" and .text == $text) |
        .severity // 0.5
      ')
      # Render severity with warning symbols
      if (( $(echo "$severity > 0.8" | bc -l) )); then
        markdown+="- 🔴 HIGH RISK: $line\n"
      elif (( $(echo "$severity > 0.5" | bc -l) )); then
        markdown+="- 🟠 MEDIUM RISK: $line\n"
      else
        markdown+="- 🟡 LOW RISK: $line\n"
      fi
    done <<< "$anti_patterns"
    markdown+="\n"
  fi

  echo -e "$markdown"
}

# Modify the main function to track anti-pattern injection
main() {
  # Existing code... but add these lines after formatting markdown

  if [ -n "$anti_patterns" ] && [ "$INJECT_ANTIPATTERNS" = true ]; then
    # Track anti-pattern injection
    local anti_pattern_count=$(echo "$anti_patterns" | wc -l | tr -d ' ')
    track_antipattern_stats "injected" "$domain"
  fi

  # Rest of the existing main function...
}

# The rest of the script remains the same...