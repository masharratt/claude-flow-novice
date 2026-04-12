#!/usr/bin/env bash
# CFN Status Line: shows API provider + context window + weekly usage

input=$(cat)

# Debug: log raw input (remove after confirming)
echo "$input" > /tmp/statusline-debug.json

# Model ID: Anthropic direct uses "claude-*", Z.ai routes to "glm-*"
model_id=$(echo "$input" | jq -r '.model.id // empty' 2>/dev/null || true)

if echo "$model_id" | grep -q "^claude-"; then
  provider="Anthropic"
elif [ -n "$model_id" ]; then
  provider="ZAI"
else
  provider=""
fi

# Context window usage
ctx_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null || true)

# Build output
parts="$provider"

if [ -n "$ctx_pct" ]; then
  parts="${parts:+$parts  }ctx:${ctx_pct}%"
fi

printf "%s" "$parts"
