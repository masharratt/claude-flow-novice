#!/usr/bin/env bash
##############################################################################
# Claude API Switcher - Main Chat & Task Tool Provider Routing
#
# Usage: scripts/switch-api.sh [zai|max|status]
#
# What it does:
#   - zai:    Main Chat + Task tool use Z.ai (add env vars to settings.json)
#   - max:    Main Chat + Task tool use Anthropic (remove env vars, requires re-login)
#   - CLI:    Always uses Z.ai (controlled by .env CLAUDE_API_PROVIDER=zai)
#
# Settings file: .claude/settings.json (project local)
##############################################################################

set -euo pipefail

SETTINGS_FILE=".claude/settings.json"
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

    if [ ! -f "$SETTINGS_FILE" ]; then
        echo -e "${YELLOW}⚠️  Settings file not found${NC}"
        echo "   File: $SETTINGS_FILE"
        echo ""
        return
    fi

    # Check for Z.ai env vars in settings
    if grep -q "ANTHROPIC_BASE_URL" "$SETTINGS_FILE" 2>/dev/null; then
        BASE_URL=$(jq -r '.env.ANTHROPIC_BASE_URL // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")

        if [[ "$BASE_URL" == *"z.ai"* ]]; then
            echo -e "${GREEN}✓ Main Chat/Task Tool:${NC} Z.ai"
            echo "  Base URL: $BASE_URL"
            echo "  Cost: \$0.50/1M tokens"
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

    # Add Z.ai env vars to settings
    NEW_SETTINGS=$(echo "$CURRENT_SETTINGS" | jq '. + {
      "env": (.env // {}) + {
        "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "cca13d09dcd6407183efe9e24c804cca.QO8R0JxF4fucsoWL"
      }
    }')

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
        echo "  status    Show current API configuration (default)"
        echo "  zai       Switch Main Chat/Task tool to Z.ai"
        echo "  max       Switch Main Chat/Task tool to Anthropic"
        echo ""
        echo "Examples:"
        echo "  $0              # Show current status"
        echo "  $0 zai          # Use Z.ai for Main Chat"
        echo "  $0 max          # Use Anthropic for Main Chat (requires re-login)"
        echo ""
        echo "Notes:"
        echo "  • CLI agents always use Z.ai (from .env CLAUDE_API_PROVIDER=zai)"
        echo "  • Main Chat routing affects Task() spawned agents"
        echo "  • Settings file: .claude/settings.json"
        echo "  • Backups saved to: .claude/backups/"
        echo ""
        ;;

    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
