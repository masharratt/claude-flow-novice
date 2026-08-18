#!/usr/bin/env bash
set -euo pipefail

log_prefix="[Cerebras-SessionStart]"

if [[ -n "${CEREBRAS_API_KEY:-}" ]]; then
    exit 0
fi

env_file="${CLAUDE_PROJECT_DIR:-.}/.env"

if [[ ! -f "$env_file" ]]; then
    echo "$log_prefix Warning: .env file not found at $env_file. Set via: export CEREBRAS_API_KEY=your_key" >&2
    exit 0
fi

if [[ ! -r "$env_file" ]]; then
    echo "$log_prefix Warning: .env file at $env_file is not readable. Check permissions." >&2
    exit 0
fi

if [[ ! -s "$env_file" ]]; then
    echo "$log_prefix Warning: .env file at $env_file is empty." >&2
    exit 0
fi

api_key=""
model="zai-glm-4.6"
line_num=0

while IFS= read -r line || [[ -n "$line" ]]; do
    ((line_num++))
    
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    
    if [[ "$line" =~ ^CEREBRAS_API_KEY[[:space:]]*= ]]; then
        if [[ "$line" =~ ^CEREBRAS_API_KEY[[:space:]]*=[[:space:]]*$ ]]; then
            echo "$log_prefix Warning: Empty CEREBRAS_API_KEY at line $line_num in $env_file" >&2
        else
            api_key=$(echo "$line" | cut -d= -f2-)
            api_key="${api_key#"${api_key%%[![:space:]]*}"}"
            api_key="${api_key%"${api_key##*[![:space:]]}"}"
        fi
    elif [[ "$line" =~ ^CEREBRAS_MODEL[[:space:]]*= ]]; then
        if [[ ! "$line" =~ ^CEREBRAS_MODEL[[:space:]]*=[[:space:]]*$ ]]; then
            model=$(echo "$line" | cut -d= -f2-)
            model="${model#"${model%%[![:space:]]*}"}"
            model="${model%"${model##*[![:space:]]}"}"
        fi
    fi
done < "$env_file"

if [[ -z "$api_key" ]]; then
    echo "$log_prefix Warning: CEREBRAS_API_KEY not found in $env_file. Set via: export CEREBRAS_API_KEY=your_key" >&2
    exit 0
fi

redacted_key="${api_key:0:8}***"

cat <<EOF
{
  "additionalContext": "Cerebras API configured: model=$model, key=$redacted_key"
}
EOF