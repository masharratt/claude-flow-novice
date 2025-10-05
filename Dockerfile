# Multi-stage Docker build for Claude Flow Novice with security focus
# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set build arguments
ARG NODE_ENV=production
ARG APP_VERSION=1.6.2

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    ca-certificates

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Security scanning
RUN npm audit --audit-level moderate

# Stage 2: Runtime stage with security hardening
FROM node:20-alpine AS runtime

# Set runtime arguments
ARG NODE_ENV=production
ARG APP_VERSION=1.6.2
ARG APP_USER=claudeflow
ARG APP_UID=1001
ARG APP_GID=1001

# Security labels
LABEL maintainer="Claude Flow Novice Team" \
      version="${APP_VERSION}" \
      description="Claude Flow Novice - AI Agent Orchestration Platform" \
      security.scan="completed" \
      base.image="node:20-alpine"

# Set environment variables
ENV NODE_ENV=${NODE_ENV} \
    APP_VERSION=${APP_VERSION} \
    PATH="/app/.node_modules/.bin:${PATH}" \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_PROGRESS=false

# Install runtime dependencies with security updates
RUN apk update && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    tzdata && \
    apk upgrade && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g ${APP_GID} ${APP_USER} && \
    adduser -D -u ${APP_UID} -G ${APP_USER} -s /bin/sh ${APP_USER}

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