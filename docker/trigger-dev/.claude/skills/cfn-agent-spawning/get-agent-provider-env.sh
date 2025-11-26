#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: agent-definition-parser.ts
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################


# Get Agent Provider Environment Variables
# Determines which provider environment variables to use for CLI/Docker agent spawning
#
# Logic:
# 1. If custom routing is disabled, use Main Chat settings (from .claude/settings.json)
# 2. If custom routing is enabled:
#    a. Check agent profile for PROVIDER_PARAMETERS
#    b. If found, use agent-specific provider/model
#    c. If not found, use Main Chat settings
#
# Usage: source get-agent-provider-env.sh AGENT_TYPE
# Exports: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL, ANTHROPIC_SMALL_FAST_MODEL

set -euo pipefail

AGENT_TYPE="${1:-}"
CUSTOM_ROUTING_ENABLED="${CFN_CUSTOM_ROUTING:-false}"
SETTINGS_FILE=".claude/settings.json"

if [[ -z "$AGENT_TYPE" ]]; then
    echo "Usage: source $0 AGENT_TYPE" >&2
    return 1 2>/dev/null || exit 1
fi

# Function to get provider config (zai, kimi, openrouter, gemini, xai, anthropic)
get_provider_config() {
    local provider="$1"
    local model="${2:-}"

    case "$provider" in
        zai)
            export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
            export ANTHROPIC_AUTH_TOKEN="${ZAI_API_KEY:-}"
            export ANTHROPIC_MODEL="${model:-glm-4.6}"
            export ANTHROPIC_SMALL_FAST_MODEL="${model:-glm-4.6}"
            ;;
        kimi)
            export ANTHROPIC_BASE_URL="https://api.moonshot.ai/anthropic"
            export ANTHROPIC_AUTH_TOKEN="${KIMI_API_KEY:-}"
            export ANTHROPIC_MODEL="${model:-kimi-k2-turbo-preview}"
            export ANTHROPIC_SMALL_FAST_MODEL="${model:-kimi-k2-turbo-preview}"
            ;;
        openrouter)
            export ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1"
            export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
            export ANTHROPIC_MODEL="${model:-anthropic/claude-sonnet-4.5}"
            export ANTHROPIC_SMALL_FAST_MODEL="${model:-anthropic/claude-sonnet-4.5}"
            ;;
        gemini)
            export ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1"
            export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
            export ANTHROPIC_MODEL="${model:-google/gemini-2.0-flash-001}"
            export ANTHROPIC_SMALL_FAST_MODEL="${model:-google/gemini-2.0-flash-001}"
            ;;
        xai)
            export ANTHROPIC_BASE_URL="https://api.x.ai/v1"
            export ANTHROPIC_AUTH_TOKEN="${XAI_API_KEY:-}"
            export ANTHROPIC_MODEL="${model:-grok-beta}"
            export ANTHROPIC_SMALL_FAST_MODEL="${model:-grok-beta}"
            ;;
        anthropic|*)
            # Use default Anthropic settings (remove custom env vars)
            unset ANTHROPIC_BASE_URL
            unset ANTHROPIC_AUTH_TOKEN
            unset ANTHROPIC_MODEL
            unset ANTHROPIC_SMALL_FAST_MODEL
            ;;
    esac
}

# Function to detect provider from base URL
detect_provider_from_url() {
    local base_url="$1"
    local model="${2:-}"

    if [[ "$base_url" == *"z.ai"* ]]; then
        echo "zai"
    elif [[ "$base_url" == *"moonshot.ai"* ]]; then
        echo "kimi"
    elif [[ "$base_url" == *"x.ai"* ]]; then
        echo "xai"
    elif [[ "$base_url" == *"openrouter.ai"* ]]; then
        # Check if model is Gemini
        if [[ "$model" == google/gemini* ]]; then
            echo "gemini"
        else
            echo "openrouter"
        fi
    else
        echo "anthropic"
    fi
}

# Step 1: Check if custom routing is enabled
if [[ "$CUSTOM_ROUTING_ENABLED" != "true" ]]; then
    # Custom routing disabled - use Main Chat settings from .claude/settings.json
    if [[ -f "$SETTINGS_FILE" ]]; then
        BASE_URL=$(jq -r '.env.ANTHROPIC_BASE_URL // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")

        if [[ -n "$BASE_URL" ]]; then
            # Main Chat has custom provider configured
            export ANTHROPIC_BASE_URL="$BASE_URL"
            export ANTHROPIC_AUTH_TOKEN=$(jq -r '.env.ANTHROPIC_AUTH_TOKEN // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")
            export ANTHROPIC_MODEL=$(jq -r '.env.ANTHROPIC_MODEL // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")
            export ANTHROPIC_SMALL_FAST_MODEL=$(jq -r '.env.ANTHROPIC_SMALL_FAST_MODEL // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")
        fi
        # else: No custom provider, use default Anthropic
    fi
    return 0 2>/dev/null || exit 0
fi

# Step 2: Custom routing enabled - check agent profile for PROVIDER_PARAMETERS
AGENT_PROVIDER=$(bash .claude/skills/cfn-agent-spawning/parse-agent-provider.sh "$AGENT_TYPE" --field provider)
AGENT_MODEL=$(bash .claude/skills/cfn-agent-spawning/parse-agent-provider.sh "$AGENT_TYPE" --field model)

if [[ -n "$AGENT_PROVIDER" ]]; then
    # Agent has provider parameters - use them
    get_provider_config "$AGENT_PROVIDER" "$AGENT_MODEL"
else
    # No agent-specific provider - default to Z.ai with glm-4.6
    export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
    export ANTHROPIC_AUTH_TOKEN="${ZAI_API_KEY:-}"
    export ANTHROPIC_MODEL="glm-4.6"
    export ANTHROPIC_SMALL_FAST_MODEL="glm-4.6"
fi
