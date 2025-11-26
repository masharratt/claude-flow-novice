#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/spawn-agent-cli.js
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

set -eu

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load team providers configuration
PROVIDERS_CONFIG="${PROJECT_ROOT}/.claude/cfn-config/team-providers.json"

# Validate configuration file exists
if [[ ! -f "$PROVIDERS_CONFIG" ]]; then
    echo "Error: Team providers configuration not found at $PROVIDERS_CONFIG"
    exit 1
fi

# Function to validate provider configuration
validate_provider_config() {
    local team="$1"
    local role="$2"  # coordinator or workers

    # Use jq to validate JSON structure and extract provider details
    if ! jq -e ".teams.${team}.${role}" "$PROVIDERS_CONFIG" &>/dev/null; then
        echo "Error: Invalid or missing provider configuration for team=${team}, role=${role}"
        exit 1
    fi
}

# Function to select appropriate model based on complexity
select_model() {
    local team="$1"
    local complexity="$2"  # simple or complex

    # Retrieve model based on complexity and team configuration
    local model=$(jq -r ".teams.${team}.workers.models.${complexity}" "$PROVIDERS_CONFIG")

    if [[ "$model" == "null" ]]; then
        # Fallback to default complexity from global config
        local default_complexity=$(jq -r ".global_config.default_complexity // \"simple\"" "$PROVIDERS_CONFIG")
        model=$(jq -r ".teams.${team}.workers.models.${default_complexity}" "$PROVIDERS_CONFIG")
    fi

    echo "$model"
}

# Function to get API key from environment
get_api_key() {
    local team="$1"
    local role="$2"  # coordinator or workers

    # Extract apiKeyEnvVar from config
    local api_key_env_var=$(jq -r ".teams.${team}.${role}.apiKeyEnvVar" "$PROVIDERS_CONFIG")

    if [[ "$api_key_env_var" == "null" ]]; then
        echo "Error: apiKeyEnvVar not found for team=${team}, role=${role}"
        exit 1
    fi

    # Get actual API key value from environment
    local api_key_value="${!api_key_env_var:-}"

    if [[ -z "$api_key_value" ]]; then
        echo "Error: API key not found in environment variable: $api_key_env_var"
        exit 1
    fi

    echo "$api_key_value"
}

# Main worker spawning logic
spawn_worker() {
    local team="$1"
    local complexity="${2:-simple}"
    local provider_mode="${3:-auto}"
    local agent_type="${4:-}"
    local task_context="${5:-}"

    # Validate input parameters
    validate_provider_config "$team" "workers"

    # Retrieve provider details from config
    local provider=$(jq -r ".teams.${team}.workers.provider" "$PROVIDERS_CONFIG")
    local api_key_env_var=$(jq -r ".teams.${team}.workers.apiKeyEnvVar" "$PROVIDERS_CONFIG")
    local base_url=$(jq -r ".teams.${team}.workers.baseUrl" "$PROVIDERS_CONFIG")

    # Select model dynamically based on complexity
    local model=$(select_model "$team" "$complexity")

    # Get API key from environment
    local api_key=$(get_api_key "$team" "workers")

    # Provider routing logic
    case "$provider_mode" in
        auto)
            # Use provider routing rules from config
            case "$provider" in
                zai)
                    echo "Spawning Z.ai worker for team ${team} (Model: ${model}, Complexity: ${complexity})"

                    # Set environment variables for Z.ai spawning
                    export ZAI_API_KEY="$api_key"
                    export ZAI_BASE_URL="$base_url"
                    export ZAI_MODEL="$model"

                    # Call actual spawning logic (to be implemented)
                    # npx claude-flow-novice spawn "$agent_type" \
                    #   --provider zai \
                    #   --model "$model" \
                    #   --context "$task_context"
                    ;;
                anthropic)
                    echo "Spawning Anthropic worker for team ${team} (Model: ${model}, Complexity: ${complexity})"

                    # Set environment variables for Anthropic spawning
                    export ANTHROPIC_API_KEY="$api_key"
                    export ANTHROPIC_BASE_URL="$base_url"
                    export ANTHROPIC_MODEL="$model"

                    # Call actual spawning logic (to be implemented)
                    # npx claude-flow-novice spawn "$agent_type" \
                    #   --provider anthropic \
                    #   --model "$model" \
                    #   --context "$task_context"
                    ;;
                *)
                    echo "Error: Unsupported provider: ${provider}"
                    exit 1
                    ;;
            esac
            ;;
        zai)
            echo "Force spawning Z.ai worker for team ${team} (Model: ${model})"
            local api_key=$(get_api_key "$team" "workers")
            export ZAI_API_KEY="$api_key"
            export ZAI_BASE_URL="$base_url"
            export ZAI_MODEL="$model"
            ;;
        anthropic)
            echo "Force spawning Anthropic worker for team ${team} (Model: ${model})"
            local api_key=$(get_api_key "$team" "workers")
            export ANTHROPIC_API_KEY="$api_key"
            export ANTHROPIC_BASE_URL="$base_url"
            export ANTHROPIC_MODEL="$model"
            ;;
        *)
            echo "Error: Invalid provider mode: ${provider_mode}"
            exit 1
            ;;
    esac

    # Log successful configuration
    echo "Worker configuration complete:"
    echo "  Team: $team"
    echo "  Provider: $provider"
    echo "  Model: $model"
    echo "  Base URL: $base_url"
    echo "  Complexity: $complexity"
}

# Allow script to be used as a function or executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being run directly
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <team> [complexity] [provider_mode] [agent_type] [task_context]"
        echo ""
        echo "Arguments:"
        echo "  team           - Team name (marketing, engineering, sales, support, finance)"
        echo "  complexity     - simple|complex (default: simple)"
        echo "  provider_mode  - auto|zai|anthropic (default: auto)"
        echo "  agent_type     - Agent type to spawn (optional)"
        echo "  task_context   - Task context for agent (optional)"
        exit 1
    fi

    spawn_worker "$@"
fi