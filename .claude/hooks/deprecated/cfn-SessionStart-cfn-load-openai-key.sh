#!/usr/bin/env bash

# SessionStart hook: Load OpenAI API key from root .env file
# This ensures OPENAI_API_KEY is available for embedding generation
#
# IMPORTANT: SessionStart hooks must write to CLAUDE_ENV_FILE to set env vars.
# JSON output and 'export' do NOT work - only CLAUDE_ENV_FILE persists.

set -e

# Path to root .env file
ROOT_ENV="${PROJECT_ROOT:-.}/.env"

# Check if CLAUDE_ENV_FILE is available (only in SessionStart hooks)
if [[ -z "$CLAUDE_ENV_FILE" ]]; then
    echo "⚠️  CLAUDE_ENV_FILE not set - not running as SessionStart hook" >&2
    exit 0
fi

# Check if .env exists
if [[ ! -f "$ROOT_ENV" ]]; then
    echo "⚠️  Warning: $ROOT_ENV not found. OpenAI embeddings will not work." >&2
    exit 0
fi

# Extract OPENAI_API_KEY from .env
if grep -q "^OPENAI_API_KEY=" "$ROOT_ENV"; then
    OPENAI_KEY=$(grep "^OPENAI_API_KEY=" "$ROOT_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'")

    # Validate key format
    if [[ -z "$OPENAI_KEY" ]]; then
        echo "⚠️  Warning: OPENAI_API_KEY found but empty in $ROOT_ENV" >&2
        exit 0
    fi

    if [[ ! "$OPENAI_KEY" =~ ^sk- ]]; then
        echo "⚠️  Warning: OPENAI_API_KEY invalid format (must start with 'sk-')" >&2
        exit 0
    fi

    # Write to CLAUDE_ENV_FILE - this is how SessionStart hooks set env vars
    echo "export OPENAI_API_KEY=\"$OPENAI_KEY\"" >> "$CLAUDE_ENV_FILE"
    echo "✅ Loaded OPENAI_API_KEY from .env (${OPENAI_KEY:0:10}...)" >&2
else
    echo "⚠️  Warning: OPENAI_API_KEY not found in $ROOT_ENV. OpenAI embeddings will not work." >&2
fi

exit 0
