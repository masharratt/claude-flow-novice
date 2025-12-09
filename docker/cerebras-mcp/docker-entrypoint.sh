#!/bin/bash
set -euo pipefail

echo "🚀 Starting Cerebras MCP Server in Docker"
echo "========================================="

# Check for required API keys
if [[ -z "${CEREBRAS_API_KEY:-}" && -z "${OPENROUTER_API_KEY:-}" ]]; then
    echo "❌ Error: At least one API key must be provided"
    echo "   Set CEREBRAS_API_KEY or OPENROUTER_API_KEY environment variables"
    exit 1
fi

# Show configuration
echo "📋 Configuration:"
echo "   Server Name: ${MCP_SERVER_NAME:-cerebras-mcp-docker}"
[[ -n "${CEREBRAS_API_KEY:-}" ]] && echo "   Cerebras API: ✅ Configured"
[[ -n "${OPENROUTER_API_KEY:-}" ]] && echo "   OpenRouter API: ✅ Configured"

# Setup config directory
CONFIG_DIR="/home/mcpuser/.config/cerebras-mcp"
mkdir -p "$CONFIG_DIR"

# Create config file
cat > "$CONFIG_DIR/config.json" <<EOF
{
  "cerebrasApiKey": "${CEREBRAS_API_KEY:-}",
  "openRouterApiKey": "${OPENROUTER_API_KEY:-}",
  "server": {
    "name": "${MCP_SERVER_NAME:-cerebras-mcp-docker}",
    "version": "1.0.0"
  },
  "logging": {
    "level": "${LOG_LEVEL:-info}",
    "file": "/tmp/cerebras-mcp.log"
  }
}
EOF

# Run pre-start setup if requested
if [[ "${1:-}" == "--setup" ]]; then
    echo "🔧 Running setup wizard..."
    exec cerebras-mcp --config
fi

# Start MCP server
echo "🔄 Starting MCP server..."
exec "$@" 2>&1 | tee -a /tmp/cerebras-mcp.log