#!/usr/bin/env bash
set -euo pipefail

# Config Management CLI Wrapper with Nested Support

CONFIG_FILE="${HOME}/.claude-flow-config.json"
SCHEMA_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-config-management/config.json"

# Validate JSON against schema
validate_config() {
    if command -v ajv &> /dev/null; then
        ajv validate -s "$SCHEMA_FILE" -d "$1"
    else
        echo "Warning: JSON schema validation skipped. Install 'ajv' for full validation."
        return 0
    fi
}

# Get nested configuration value
get_config() {
    local key="$1"
    jq -r "$key" "$CONFIG_FILE" 2>/dev/null || echo "Key not found: $key"
}

# Set nested configuration value with advanced handling
set_config() {
    local key="$1"
    local value="$2"

    # Temp file for atomic write
    temp_file=$(mktemp)

    # Handle nested key updates
    jq "$key = $value" "$CONFIG_FILE" > "$temp_file"

    # Validate before overwriting
    if validate_config "$temp_file"; then
        mv "$temp_file" "$CONFIG_FILE"
        echo "Configuration updated successfully."
    else
        rm "$temp_file"
        echo "Invalid configuration. Update rejected."
        exit 1
    fi
}

# Merge configurations
merge_config() {
    local config_to_merge="$1"

    # Temp file for atomic write
    temp_file=$(mktemp)

    # Deep merge using jq
    jq -s '.[0] * .[1]' "$CONFIG_FILE" "$config_to_merge" > "$temp_file"

    # Validate before overwriting
    if validate_config "$temp_file"; then
        mv "$temp_file" "$CONFIG_FILE"
        echo "Configuration merged successfully."
    else
        rm "$temp_file"
        echo "Invalid merged configuration. Update rejected."
        exit 1
    fi
}

# List all configurations
list_config() {
    cat "$CONFIG_FILE"
}

# Reset to defaults
reset_config() {
    cp "$SCHEMA_FILE" "$CONFIG_FILE"
    echo "Configuration reset to defaults."
}

# Create config file if it doesn't exist
ensure_config_file() {
    if [ ! -f "$CONFIG_FILE" ]; then
        reset_config
    fi
}

# Main command dispatcher
main() {
    ensure_config_file

    case "$1" in
        get)
            get_config "$2"
            ;;
        set)
            set_config "$2" "$3"
            ;;
        merge)
            merge_config "$2"
            ;;
        list)
            list_config
            ;;
        reset)
            reset_config
            ;;
        *)
            echo "Usage: $0 {get|set|merge|list|reset} [key] [value]"
            exit 1
            ;;
    esac
}

main "$@"