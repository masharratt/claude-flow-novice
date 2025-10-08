#!/bin/bash
# Claude API Switcher - Switch between Claude Max and z.ai
# Usage: scripts/switch-api.sh [zai|max|status|save|restore|list]

SETTINGS_FILE="$HOME/.claude/settings.json"
BACKUP_DIR="$HOME/.claude-api-configs"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to display current API
show_current() {
    if grep -q "ANTHROPIC_BASE_URL" "$SETTINGS_FILE" 2>/dev/null; then
        BASE_URL=$(grep "ANTHROPIC_BASE_URL" "$SETTINGS_FILE" | cut -d'"' -f4)
        if [[ "$BASE_URL" == *"z.ai"* ]]; then
            echo "✓ Current API: z.ai (GLM-4.6 models)"
        else
            echo "✓ Current API: $BASE_URL"
        fi
    else
        echo "✓ Current API: Claude Max (api.anthropic.com)"
    fi
}

# Function to save current config
save_current() {
    local name=$1
    cp "$SETTINGS_FILE" "$BACKUP_DIR/settings-$name.json"
    echo "✓ Saved current settings as '$name'"
}

# Function to switch to z.ai
switch_to_zai() {
    cat > "$SETTINGS_FILE" << 'SETTINGS'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "sonnet",
  "feedbackSurveyState": {
    "lastShownTime": 1754086518944
  },
  "terminal": {
    "disableRawMode": true
  },
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "cca13d09dcd6407183efe9e24c804cca.QO8R0JxF4fucsoWL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "GLM-4.6",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "GLM-4.6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "GLM-4.5-Air"
  }
}
SETTINGS
    echo "✓ Switched to z.ai API"
    echo "  Using GLM-4.6 (Sonnet), GLM-4.5-Air (Haiku)"
}

# Function to switch to Claude Max
switch_to_claude_max() {
    cat > "$SETTINGS_FILE" << 'SETTINGS'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "sonnet",
  "feedbackSurveyState": {
    "lastShownTime": 1754086518944
  },
  "terminal": {
    "disableRawMode": true
  }
}
SETTINGS
    echo "✓ Switched to Claude Max (Official Anthropic API)"
    echo "  Run 'claude login' if authentication is needed"
}

# Main menu
case "$1" in
    status|current|"")
        show_current
        ;;
    zai|z.ai)
        echo "Switching to z.ai..."
        switch_to_zai
        show_current
        ;;
    max|claude|official|anthropic)
        echo "Switching to Claude Max..."
        switch_to_claude_max
        show_current
        ;;
    save)
        if [ -z "$2" ]; then
            echo "Usage: $0 save <config-name>"
            exit 1
        fi
        save_current "$2"
        ;;
    restore)
        if [ -z "$2" ]; then
            echo "Available configs:"
            ls -1 "$BACKUP_DIR" 2>/dev/null | sed 's/settings-//g' | sed 's/.json//g' | sed 's/^/  • /'
            exit 1
        fi
        if [ -f "$BACKUP_DIR/settings-$2.json" ]; then
            cp "$BACKUP_DIR/settings-$2.json" "$SETTINGS_FILE"
            echo "✓ Restored config '$2'"
            show_current
        else
            echo "✗ Config '$2' not found"
            exit 1
        fi
        ;;
    list)
        echo "Saved configurations:"
        if ls "$BACKUP_DIR"/settings-*.json 1> /dev/null 2>&1; then
            ls -1 "$BACKUP_DIR" 2>/dev/null | sed 's/settings-//g' | sed 's/.json//g' | sed 's/^/  • /'
        else
            echo "  (none)"
        fi
        ;;
    help|--help|-h)
        echo "Claude API Switcher"
        echo ""
        echo "Usage: $0 [command] [args]"
        echo ""
        echo "Commands:"
        echo "  status             Show current API configuration"
        echo "  zai                Switch to z.ai API (GLM models)"
        echo "  max                Switch to Claude Max (Official API)"
        echo "  save <name>        Save current config with a name"
        echo "  restore <name>     Restore a saved config"
        echo "  list               List all saved configurations"
        echo ""
        ;;
    *)
        echo "Unknown command: $1"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
