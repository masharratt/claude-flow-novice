#!/bin/bash
set -eu

# Load team providers configuration
PROVIDERS_CONFIG="/mnt/c/Users/masha/Documents/claude-flow-novice/planning/team-providers.json"

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
    echo "$model"
}

# Main worker spawning logic
spawn_worker() {
    local team="$1"
    local complexity="${2:-simple}"
    local provider_mode="${3:-auto}"

    # Validate input parameters
    validate_provider_config "$team" "workers"

    # Retrieve provider details
    local provider=$(jq -r ".teams.${team}.workers.provider" "$PROVIDERS_CONFIG")
    local api_key_env=$(jq -r ".teams.${team}.workers.apiKeyEnv" "$PROVIDERS_CONFIG")

    # Select model dynamically
    local model=$(select_model "$team" "$complexity")

    # Provider routing logic
    case "$provider_mode" in
        auto)
            # Use provider routing rules
            case "$provider" in
                zai)
                    echo "Spawning Z.ai worker for team ${team} (Model: ${model})"
                    # Add Z.ai specific worker spawning logic here
                    ;;
                anthropic)
                    echo "Spawning Anthropic worker for team ${team} (Model: ${model})"
                    # Add Anthropic specific worker spawning logic here
                    ;;
                *)
                    echo "Unsupported provider: ${provider}"
                    exit 1
                    ;;
            esac
            ;;
        zai)
            echo "Force spawning Z.ai worker for team ${team} (Model: ${model})"
            # Add Z.ai specific worker spawning logic here
            ;;
        anthropic)
            echo "Force spawning Anthropic worker for team ${team} (Model: ${model})"
            # Add Anthropic specific worker spawning logic here
            ;;
        *)
            echo "Invalid provider mode: ${provider_mode}"
            exit 1
            ;;
    esac

    # Export API key for use in spawning
    export "${api_key_env}"
}

# Allow script to be used as a function or executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being run directly
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <team> [complexity] [provider_mode]"
        exit 1
    fi

    spawn_worker "$@"
fi