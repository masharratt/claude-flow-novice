#!/usr/bin/env bash
# CFN Status Line: shows API provider + context window + weekly usage (Anthropic only)

input=$(cat)

# Detect provider from ANTHROPIC_BASE_URL (without underscore prefix).
# The underscore-prefixed _ANTHROPIC_BASE_URL is a Z.ai convention but
# doesn't reliably indicate the actual endpoint in use.
base_url="${ANTHROPIC_BASE_URL:-}"

# Determine provider
if [ -n "$base_url" ] && echo "$base_url" | grep -q "api.z.ai"; then
  provider="ZAI"
else
  provider="Anthropic"
fi

# Context window usage
ctx_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null || true)

# 7-day rate limit usage (Anthropic Pro/Max only)
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty' 2>/dev/null || true)

# Build output
parts="$provider"

if [ -n "$ctx_pct" ]; then
  parts="$parts  ctx:${ctx_pct}%"
fi

if [ "$provider" = "Anthropic" ] && [ -n "$week_pct" ]; then
  parts="$parts  week:${week_pct}%"
fi

printf "%s" "$parts"
