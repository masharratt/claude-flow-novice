#!/bin/bash

# SessionStart hook: Load OpenAI API key from root .env file
# This ensures OPENAI_API_KEY is available for embedding generation

set -e

# Path to root .env file
ROOT_ENV="${PROJECT_ROOT:-.}/.env"

# Check if .env exists
if [[ ! -f "$ROOT_ENV" ]]; then
    echo "⚠️  Warning: $ROOT_ENV not found. OpenAI embeddings will not work." >&2
    exit 0
fi

# Extract OPENAI_API_KEY from .env
if grep -q "^OPENAI_API_KEY=" "$ROOT_ENV"; then
    # Export the key for this session
    export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" "$ROOT_ENV" | cut -d'=' -f2- | tr -d '"')

    # Verify key is set
    if [[ -n "$OPENAI_API_KEY" ]]; then
        echo "✅ Loaded OPENAI_API_KEY from root .env" >&2
    else
        echo "⚠️  Warning: OPENAI_API_KEY found but empty in $ROOT_ENV" >&2
    fi
else
    echo "⚠️  Warning: OPENAI_API_KEY not found in $ROOT_ENV. OpenAI embeddings will not work." >&2
fi

# Make it available to subprocesses
export OPENAI_API_KEY

exit 0
