#!/usr/bin/env bash
##############################################################################
# Claude API Switcher - Main Chat & Task Tool Provider Routing
#
# Usage: scripts/switch-api.sh [zai|kimi|gemini|openrouter|max|status]
#
# What it does:
#   - zai:        Main Chat + Task tool use Z.ai
#   - kimi:       Main Chat + Task tool use Moonshot Kimi
#   - gemini:     Main Chat + Task tool use Google Gemini (via OpenRouter)
#   - openrouter: Main Chat + Task tool use OpenRouter
#   - max:        Main Chat + Task tool use Anthropic (requires re-login)
#   - CLI:        Respects custom routing when enabled (see agent profiles)
#
# Settings file: .claude/settings.local.json (preferred) or .claude/settings.json
##############################################################################

set -euo pipefail

# Detect which settings file to use (prefer settings.local.json)
if [ -f ".claude/settings.local.json" ]; then
    SETTINGS_FILE=".claude/settings.local.json"
else
    SETTINGS_FILE=".claude/settings.json"
fi
BACKUP_DIR=".claude/backups"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

##############################################################################
# Display current configuration
##############################################################################
show_status() {
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${BLUE}   Claude API Provider Status${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Settings File:${NC} $SETTINGS_FILE"
    echo ""

    if [ ! -f "$SETTINGS_FILE" ]; then
        echo -e "${YELLOW}⚠️  Settings file not found${NC}"
        echo "   Will be created on first switch"
        echo ""
        return
    fi

    # Check for custom provider env vars in settings
    if grep -q "ANTHROPIC_BASE_URL" "$SETTINGS_FILE" 2>/dev/null; then
        BASE_URL=$(jq -r '.env.ANTHROPIC_BASE_URL // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")
        MODEL=$(jq -r '.env.ANTHROPIC_MODEL // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")

        if [[ "$BASE_URL" == *"z.ai"* ]]; then
            echo -e "${GREEN}✓ Main Chat/Task Tool:${NC} Z.ai"
            echo "  Base URL: $BASE_URL"
            echo "  Cost: \$0.50/1M tokens"
        elif [[ "$BASE_URL" == *"moonshot.ai"* ]]; then
            echo -e "${GREEN}✓ Main Chat/Task Tool:${NC} Moonshot Kimi"
            echo "  Base URL: $BASE_URL"
            echo "  Model: $MODEL"
            echo "  Cost: ~\$2/1M tokens"
        elif [[ "$BASE_URL" == *"openrouter.ai"* ]]; then
            if [[ "$MODEL" == google/gemini* ]]; then
                echo -e "${GREEN}✓ Main Chat/Task Tool:${NC} Google Gemini (via OpenRouter)"
                echo "  Model: $MODEL"
                echo "  Cost: ~\$0.30/1M tokens (input), ~\$1.20/1M tokens (output)"
            else
                echo -e "${GREEN}✓ Main Chat/Task Tool:${NC} OpenRouter"
                echo "  Base URL: $BASE_URL"
                echo "  Model: $MODEL"
                echo "  Cost: Varies by model"
            fi
        else
            echo -e "${GREEN}✓ Main Chat/Task Tool:${NC} Custom"
            echo "  Base URL: $BASE_URL"
        fi
    else
        echo -e "${GREEN}✓ Main Chat/Task Tool:${NC} Anthropic (default)"
        echo "  Cost: \$15/1M tokens (Claude Max subscription)"
        echo "  Status: Requires 'claude login'"
    fi

    # Check CLI routing (.env)
    if grep -q "CLAUDE_API_PROVIDER=zai" .env 2>/dev/null; then
        echo -e "${GREEN}✓ CLI Agents:${NC} Z.ai (from .env)"
        echo "  Cost: \$0.50/1M tokens"
    else
        echo -e "${YELLOW}⚠️  CLI Agents:${NC} Anthropic (default)"
        echo "  Set CLAUDE_API_PROVIDER=zai in .env for cost savings"
    fi

    echo ""
    echo -e "${BLUE}Combined Architecture:${NC}"
    echo "  Main Chat → Task tool → Coordinator (uses Main Chat provider)"
    echo "  Coordinator → CLI spawn → Workers (uses CLI .env provider)"
    echo ""
}

##############################################################################
# Switch to Z.ai for Main Chat and Task Tool
##############################################################################
switch_to_zai() {
    echo -e "${BLUE}Switching Main Chat/Task Tool to Z.ai...${NC}"
    echo ""

    # Backup current settings
    if [ -f "$SETTINGS_FILE" ]; then
        BACKUP_NAME="settings-$(date +%Y%m%d-%H%M%S)-before-zai.json"
        cp "$SETTINGS_FILE" "$BACKUP_DIR/$BACKUP_NAME"
        echo -e "${GREEN}✓${NC} Backed up: $BACKUP_DIR/$BACKUP_NAME"
    fi

    # Read current settings or create empty object
    if [ -f "$SETTINGS_FILE" ]; then
        CURRENT_SETTINGS=$(cat "$SETTINGS_FILE")
    else
        CURRENT_SETTINGS='{}'
    fi

    # Add Z.ai env vars to settings (read from .env)
    ZAI_KEY=$(grep -E "^(ZAI_API_KEY|Z_AI_API_KEY)=" .env | head -1 | cut -d'=' -f2 | sed 's/#.*//' | xargs)
    if [ -z "$ZAI_KEY" ]; then
        echo -e "${RED}Error: ZAI_API_KEY not found in .env${NC}"
        exit 1
    fi
    NEW_SETTINGS=$(echo "$CURRENT_SETTINGS" | jq --arg key "$ZAI_KEY" '. + {"env": ((.env // {}) + {"ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic", "ANTHROPIC_AUTH_TOKEN": $key})}')

    echo "$NEW_SETTINGS" > "$SETTINGS_FILE"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Switched to Z.ai${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}Main Chat + Task Tool:${NC} Z.ai"
    echo "  • All Task() spawned agents use Z.ai"
    echo "  • Cost: \$0.50/1M tokens (97% savings)"
    echo "  • No login required"
    echo ""
    echo -e "${BLUE}CLI Agents:${NC} Z.ai (from .env)"
    echo "  • CLAUDE_API_PROVIDER=zai in .env"
    echo "  • Independent from Main Chat routing"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Restart Claude desktop (if running)"
    echo "  2. Test: /cfn-loop \"Test task\""
    echo "  3. Verify logs show: Provider: zai"
    echo ""
}

##############################################################################
# Switch to Kimi for Main Chat and Task Tool
##############################################################################
switch_to_kimi() {
    echo -e "${BLUE}Switching Main Chat/Task Tool to Moonshot Kimi...${NC}"
    echo ""

    # Backup current settings
    if [ -f "$SETTINGS_FILE" ]; then
        BACKUP_NAME="settings-$(date +%Y%m%d-%H%M%S)-before-kimi.json"
        cp "$SETTINGS_FILE" "$BACKUP_DIR/$BACKUP_NAME"
        echo -e "${GREEN}✓${NC} Backed up: $BACKUP_DIR/$BACKUP_NAME"
    fi

    # Read current settings or create empty object
    if [ -f "$SETTINGS_FILE" ]; then
        CURRENT_SETTINGS=$(cat "$SETTINGS_FILE")
    else
        CURRENT_SETTINGS='{}'
    fi

    # Add Kimi env vars to settings (read from .env)
    KIMI_KEY=$(grep -E "^KIMI_API_KEY=" .env | head -1 | cut -d'=' -f2 | sed 's/#.*//' | xargs)
    if [ -z "$KIMI_KEY" ]; then
        echo -e "${RED}Error: KIMI_API_KEY not found in .env${NC}"
        exit 1
    fi
    NEW_SETTINGS=$(echo "$CURRENT_SETTINGS" | jq --arg key "$KIMI_KEY" '. + {"env": ((.env // {}) + {"ANTHROPIC_BASE_URL": "https://api.moonshot.ai/anthropic", "ANTHROPIC_AUTH_TOKEN": $key, "ANTHROPIC_MODEL": "kimi-k2-turbo-preview", "ANTHROPIC_SMALL_FAST_MODEL": "kimi-k2-turbo-preview"})}')

    echo "$NEW_SETTINGS" > "$SETTINGS_FILE"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Switched to Moonshot Kimi${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}Main Chat + Task Tool:${NC} Kimi"
    echo "  • All Task() spawned agents use Kimi"
    echo "  • Cost: ~\$2/1M tokens"
    echo "  • No login required"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Restart Claude desktop (if running)"
    echo "  2. Test: Main Chat should use Kimi"
    echo ""
}

##############################################################################
# Switch to Gemini (via OpenRouter) for Main Chat and Task Tool
##############################################################################
switch_to_gemini() {
    echo -e "${BLUE}Switching Main Chat/Task Tool to Google Gemini...${NC}"
    echo ""

    # Backup current settings
    if [ -f "$SETTINGS_FILE" ]; then
        BACKUP_NAME="settings-$(date +%Y%m%d-%H%M%S)-before-gemini.json"
        cp "$SETTINGS_FILE" "$BACKUP_DIR/$BACKUP_NAME"
        echo -e "${GREEN}✓${NC} Backed up: $BACKUP_DIR/$BACKUP_NAME"
    fi

    # Read current settings or create empty object
    if [ -f "$SETTINGS_FILE" ]; then
        CURRENT_SETTINGS=$(cat "$SETTINGS_FILE")
    else
        CURRENT_SETTINGS='{}'
    fi

    # Add Gemini env vars to settings (via OpenRouter with Gemini model)
    OPENROUTER_KEY=$(grep -E "^OPENROUTER_API_KEY=" .env | head -1 | cut -d'=' -f2 | sed 's/#.*//' | xargs)
    if [ -z "$OPENROUTER_KEY" ]; then
        echo -e "${RED}Error: OPENROUTER_API_KEY not found in .env${NC}"
        exit 1
    fi
    # Use Gemini 2.0 Flash as default (fast, cost-effective)
    NEW_SETTINGS=$(echo "$CURRENT_SETTINGS" | jq --arg key "$OPENROUTER_KEY" '. + {"env": ((.env // {}) + {"ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1", "ANTHROPIC_AUTH_TOKEN": $key, "ANTHROPIC_MODEL": "google/gemini-2.0-flash-001", "ANTHROPIC_SMALL_FAST_MODEL": "google/gemini-2.0-flash-001"})}')

    echo "$NEW_SETTINGS" > "$SETTINGS_FILE"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Switched to Google Gemini${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}Main Chat + Task Tool:${NC} Gemini (via OpenRouter)"
    echo "  • All Task() spawned agents use Gemini"
    echo "  • Model: google/gemini-2.0-flash-001"
    echo "  • Cost: ~\$0.30/1M tokens (input), ~\$1.20/1M tokens (output)"
    echo "  • No login required"
    echo ""
    echo -e "${BLUE}Available Gemini Models:${NC}"
    echo "  • google/gemini-2.0-flash-001 (default, fast)"
    echo "  • google/gemini-pro"
    echo "  • google/gemini-pro-vision"
    echo "  • Edit model in .claude/settings.json"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Restart Claude desktop (if running)"
    echo "  2. Test: Main Chat should use Gemini"
    echo "  3. Visit: https://openrouter.ai/models for model pricing"
    echo ""
}

##############################################################################
# Switch to OpenRouter for Main Chat and Task Tool
##############################################################################
switch_to_openrouter() {
    echo -e "${BLUE}Switching Main Chat/Task Tool to OpenRouter...${NC}"
    echo ""

    # Backup current settings
    if [ -f "$SETTINGS_FILE" ]; then
        BACKUP_NAME="settings-$(date +%Y%m%d-%H%M%S)-before-openrouter.json"
        cp "$SETTINGS_FILE" "$BACKUP_DIR/$BACKUP_NAME"
        echo -e "${GREEN}✓${NC} Backed up: $BACKUP_DIR/$BACKUP_NAME"
    fi

    # Read current settings or create empty object
    if [ -f "$SETTINGS_FILE" ]; then
        CURRENT_SETTINGS=$(cat "$SETTINGS_FILE")
    else
        CURRENT_SETTINGS='{}'
    fi

    # Add OpenRouter env vars to settings (read from .env)
    OPENROUTER_KEY=$(grep -E "^OPENROUTER_API_KEY=" .env | head -1 | cut -d'=' -f2 | sed 's/#.*//' | xargs)
    if [ -z "$OPENROUTER_KEY" ]; then
        echo -e "${RED}Error: OPENROUTER_API_KEY not found in .env${NC}"
        exit 1
    fi
    # Default to Claude Sonnet 4.5 on OpenRouter
    NEW_SETTINGS=$(echo "$CURRENT_SETTINGS" | jq --arg key "$OPENROUTER_KEY" '. + {"env": ((.env // {}) + {"ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1", "ANTHROPIC_AUTH_TOKEN": $key, "ANTHROPIC_MODEL": "anthropic/claude-sonnet-4.5", "ANTHROPIC_SMALL_FAST_MODEL": "anthropic/claude-sonnet-4.5"})}')

    echo "$NEW_SETTINGS" > "$SETTINGS_FILE"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Switched to OpenRouter${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}Main Chat + Task Tool:${NC} OpenRouter"
    echo "  • All Task() spawned agents use OpenRouter"
    echo "  • Default Model: anthropic/claude-sonnet-4.5"
    echo "  • Cost: Varies by model"
    echo "  • No login required"
    echo ""
    echo -e "${BLUE}Available Models:${NC}"
    echo "  • 400+ models from 60+ providers"
    echo "  • Change model in .claude/settings.json"
    echo "  • Visit: https://openrouter.ai/models"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Restart Claude desktop (if running)"
    echo "  2. Test: Main Chat should use OpenRouter"
    echo ""
}

##############################################################################
# Switch to Anthropic Max for Main Chat and Task Tool
##############################################################################
switch_to_max() {
    echo -e "${BLUE}Switching Main Chat/Task Tool to Anthropic...${NC}"
    echo ""

    # Backup current settings
    if [ -f "$SETTINGS_FILE" ]; then
        BACKUP_NAME="settings-$(date +%Y%m%d-%H%M%S)-before-max.json"
        cp "$SETTINGS_FILE" "$BACKUP_DIR/$BACKUP_NAME"
        echo -e "${GREEN}✓${NC} Backed up: $BACKUP_DIR/$BACKUP_NAME"
    fi

    # Read current settings
    if [ -f "$SETTINGS_FILE" ]; then
        CURRENT_SETTINGS=$(cat "$SETTINGS_FILE")
    else
        echo -e "${YELLOW}⚠️  No settings file found, nothing to change${NC}"
        echo ""
        return
    fi

    # Remove Z.ai env vars
    NEW_SETTINGS=$(echo "$CURRENT_SETTINGS" | jq 'del(.env.ANTHROPIC_BASE_URL, .env.ANTHROPIC_AUTH_TOKEN)')

    echo "$NEW_SETTINGS" > "$SETTINGS_FILE"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Switched to Anthropic${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}Main Chat + Task Tool:${NC} Anthropic (official)"
    echo "  • Uses Claude Max subscription"
    echo "  • Cost: \$15/1M tokens (or \$0 with unlimited plan)"
    echo "  • ${RED}Requires re-login${NC}: Run 'claude login'"
    echo ""
    echo -e "${BLUE}CLI Agents:${NC} Z.ai (from .env)"
    echo "  • CLAUDE_API_PROVIDER=zai in .env"
    echo "  • ${GREEN}Unchanged${NC} - CLI still uses Z.ai for cost savings"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Run: ${BLUE}claude login${NC}"
    echo "  2. Authenticate with Anthropic"
    echo "  3. Restart Claude desktop"
    echo "  4. Test: Main Chat should work"
    echo ""
    echo -e "${YELLOW}Combined Savings:${NC}"
    echo "  • Main Chat: \$15/1M (high quality)"
    echo "  • CLI Workers: \$0.50/1M (cost optimized)"
    echo "  • Overall: 88% savings vs all-Anthropic"
    echo ""
}

##############################################################################
# Main command handler
##############################################################################
case "${1:-status}" in
    status|current|"")
        show_status
        ;;

    zai|z.ai)
        switch_to_zai
        show_status
        ;;

    kimi|moonshot)
        switch_to_kimi
        show_status
        ;;

    gemini|google)
        switch_to_gemini
        show_status
        ;;

    openrouter|or)
        switch_to_openrouter
        show_status
        ;;

    max|claude|anthropic)
        switch_to_max
        show_status
        ;;

    help|--help|-h)
        echo "Claude API Switcher"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  status      Show current API configuration (default)"
        echo "  zai         Switch Main Chat/Task tool to Z.ai"
        echo "  kimi        Switch Main Chat/Task tool to Moonshot Kimi"
        echo "  gemini      Switch Main Chat/Task tool to Google Gemini"
        echo "  openrouter  Switch Main Chat/Task tool to OpenRouter"
        echo "  max         Switch Main Chat/Task tool to Anthropic"
        echo ""
        echo "Examples:"
        echo "  $0                # Show current status"
        echo "  $0 zai            # Use Z.ai for Main Chat (\$0.50/1M tokens)"
        echo "  $0 kimi           # Use Moonshot Kimi (~\$2/1M tokens)"
        echo "  $0 gemini         # Use Google Gemini (~\$0.30/1M input tokens)"
        echo "  $0 openrouter     # Use OpenRouter (varies by model)"
        echo "  $0 max            # Use Anthropic (\$15/1M tokens, requires re-login)"
        echo ""
        echo "Notes:"
        echo "  • CLI agents respect custom routing when enabled"
        echo "  • Main Chat routing affects Task() spawned agents"
        echo "  • Settings file: .claude/settings.local.json (preferred) or .claude/settings.json"
        echo "  • Backups saved to: .claude/backups/"
        echo ""
        ;;

    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
