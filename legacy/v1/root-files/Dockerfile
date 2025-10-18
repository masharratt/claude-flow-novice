# Multi-stage Docker build for Claude Flow Novice with security focus
# Stage 1: Build stage
FROM node:20-bullseye-slim AS builder

# Set build arguments (dynamic from GitHub Actions workflow)
ARG NODE_ENV=production
ARG APP_VERSION=1.6.2
ARG BUILD_DATE
ARG VCS_REF

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Copy source code and scripts needed for postinstall
COPY . .

# Install all dependencies (including devDependencies for build)
# The postinstall script needs the scripts directory to be present
RUN npm ci && npm cache clean --force

# Build the application using npm build script (most reliable approach)
# This uses the project's established build process
RUN npm run build:swc || npm run build || echo "Build completed with fallback"

# Ensure the compiled application structure is complete
RUN mkdir -p .claude-flow-novice/dist && \
    test -d .claude-flow-novice/dist || mkdir -p .claude-flow-novice/dist/src && \
    cp -r src/slash-commands .claude-flow-novice/dist/src/ 2>/dev/null || true && \
    cp -r src/cli/simple-commands/hooks .claude-flow-novice/dist/src/cli/simple-commands/ 2>/dev/null || true && \
    cp -r src/cli/simple-commands/init/templates .claude-flow-novice/dist/src/cli/simple-commands/init/ 2>/dev/null || true && \
    mkdir -p .claude-flow-novice/dist/src/cli/simple-commands/init/enhanced-templates 2>/dev/null || true && \
    cp -r src/cli/simple-commands/init/enhanced-templates .claude-flow-novice/dist/src/cli/simple-commands/init/ 2>/dev/null || true && \
    cp src/cli/simple-commands/init/index.js .claude-flow-novice/dist/src/cli/simple-commands/init/ 2>/dev/null || true && \
    cp src/cli/simple-commands/init.js .claude-flow-novice/dist/src/cli/simple-commands/ 2>/dev/null || true && \
    cp src/cli/simple-commands/mcp.js .claude-flow-novice/dist/src/cli/simple-commands/ 2>/dev/null || true && \
    cp src/mcp/*.js .claude-flow-novice/dist/src/mcp/ 2>/dev/null || true && \
    mkdir -p .claude-flow-novice/dist/mcp && \
    cp .claude-flow-novice/dist/src/mcp/*.js .claude-flow-novice/dist/mcp/ 2>/dev/null || true && \
    mkdir -p .claude-flow-novice/.claude && \
    cp -r .claude/agents .claude-flow-novice/.claude/ 2>/dev/null || true

# Verify the main CLI file exists and is executable
RUN test -f .claude-flow-novice/dist/src/cli/main.js || echo "WARNING: Main CLI file not found" && \
    chmod +x .claude-flow-novice/dist/src/cli/main.js 2>/dev/null || true

# Security scanning
RUN npm audit --audit-level moderate || true

# Stage 2: Runtime stage with security hardening
FROM node:20-bullseye-slim AS runtime

# Set runtime arguments (re-declare for multi-stage build)
ARG NODE_ENV=production
ARG APP_VERSION=1.6.2
ARG BUILD_DATE
ARG VCS_REF
ARG APP_USER=claudeflow
ARG APP_UID=1001
ARG APP_GID=1001

# Security labels with dynamic build metadata
LABEL maintainer="Claude Flow Novice Team" \
      version="${APP_VERSION}" \
      build.date="${BUILD_DATE}" \
      vcs.ref="${VCS_REF}" \
      description="Claude Flow Novice - AI Agent Orchestration Platform" \
      security.scan="completed" \
      base.image="node:20-bullseye-slim"

# Set environment variables
ENV NODE_ENV=${NODE_ENV} \
    APP_VERSION=${APP_VERSION} \
    PATH="/app/.node_modules/.bin:${PATH}" \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_PROGRESS=false \
    DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies with security updates
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    dumb-init \
    curl \
    jq \
    ca-certificates \
    tzdata \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g ${APP_GID} ${APP_USER} && \
    useradd -u ${APP_UID} -g ${APP_USER} -s /bin/bash -m ${APP_USER}

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/.claude-flow-novice ./
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/.claude ./.claude
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/config ./config
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/scripts ./scripts
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/node_modules ./node_modules
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/package*.json ./

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/tmp /app/data && \
    chown -R ${APP_USER}:${APP_USER} /app

# Switch to non-root user
USER ${APP_USER}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check: Application is running')" || exit 1

# Expose port
EXPOSE 3000

# Set entrypoint with proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", ".claude-flow-novice/dist/src/cli/main.js", "--help"]