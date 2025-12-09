# Cerebras MCP Server Docker
FROM node:18-alpine

# Install required packages
RUN apk add --no-cache \
    jq \
    sqlite \
    curl \
    bash

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S mcpuser -u 1001 -G mcpuser

# Install cerebras-code-mcp globally
RUN npm install -g @cerebras/cerebras-code-mcp

# Create directories for MCP server
RUN mkdir -p /home/mcpuser/.config/cerebras-mcp && \
    chown -R mcpuser:mcpuser /home/mcpuser

# Copy custom scripts
COPY docker-entrypoint.sh /usr/local/bin/
COPY config-wizard.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Switch to non-root user
USER mcpuser

# Set environment variables
ENV CEREBRAS_API_KEY=""
ENV OPENROUTER_API_KEY=""
ENV MCP_SERVER_NAME="cerebras-mcp-docker"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep -f "cerebras-mcp" > /dev/null || exit 1

# Expose port for TCP transport (optional)
EXPOSE 3000

# Start MCP server
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["cerebras-mcp"]