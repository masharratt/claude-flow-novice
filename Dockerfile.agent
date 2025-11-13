# Single-stage Dockerfile for CFN Loop Agent Containers
# Optimized for production use - uses prebuilt dist/ directory

FROM node:18-alpine

WORKDIR /app

# Install runtime dependencies including Redis client
RUN apk add --no-cache \
    bash \
    git \
    curl \
    ca-certificates \
    redis

# Copy package files
COPY package*.json ./

# Install production dependencies only (skip scripts to avoid build issues)
RUN npm ci --production --ignore-scripts

# Copy prebuilt dist/ directory (no TypeScript build needed)
COPY dist/ ./dist/

# Copy essential project files
COPY .claude/ ./.claude/
COPY claude-assets/ ./claude-assets/
COPY scripts/ ./scripts/
COPY docker/runtime/ ./docker/runtime/
COPY CLAUDE.md ./
COPY README.md LICENSE ./

# Make init scripts executable
RUN chmod +x ./scripts/docker-agent-init.sh && \
    chmod +x ./docker/runtime/cfn-runtime.sh

# Create non-root user for security
RUN addgroup -g 1001 -S cfn && \
    adduser -u 1001 -S cfn -G cfn && \
    chown -R cfn:cfn /app

# Create workspace directory for agent execution
RUN mkdir -p /app/workspace && \
    chown -R cfn:cfn /app/workspace

# Switch to non-root user
USER cfn

# Set environment variables
ENV NODE_ENV=production \
    PATH="/app/node_modules/.bin:${PATH}" \
    CFN_CONTAINER_MODE=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Use init script as entrypoint for Redis coordination
# Sources cfn-runtime.sh for environment standardization before agent execution
ENTRYPOINT ["/bin/bash", "-c", "source /app/docker/runtime/cfn-runtime.sh && exec /app/scripts/docker-agent-init.sh \"$@\"", "--"]

# Default CMD (agent execution)
CMD ["node", "dist/cli/index.js", "agent", "--help"]

# Labels for metadata
LABEL maintainer="CFN Loop Team"
LABEL version="2.15.0"
LABEL description="Claude Flow Novice agent container for CFN Loop orchestration"
LABEL org.opencontainers.image.source="https://github.com/masharri/claude-flow-novice"
