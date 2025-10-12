# Multi-stage Docker build for Claude Flow Novice Web Portal
# Optimized for production deployment with security hardening

# =============================================================================
# Stage 1: Builder - Build client and server
# =============================================================================
FROM node:20-alpine AS builder

# Set build arguments
ARG NODE_ENV=production
ARG APP_VERSION=3.0.0
ARG BUILD_DATE
ARG VCS_REF

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    ca-certificates

# Copy root package files for workspace setup
COPY ../../package*.json ../../
COPY ../../tsconfig*.json ../../

# Copy web-portal package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --workspace=@claude-flow-novice/web-portal --include-workspace-root

# Copy source code
COPY . .

# Build client (Vite)
ENV NODE_ENV=production
RUN npm run build:client

# Build server (SWC)
RUN npm run build:server

# Generate TypeScript types
RUN npm run build:types || echo "Type generation skipped"

# Prune development dependencies
RUN npm prune --production

# Security audit (non-blocking)
RUN npm audit --audit-level moderate || true

# =============================================================================
# Stage 2: Runtime - Nginx for client, Node for server
# =============================================================================
FROM node:20-alpine AS runtime

# Set runtime arguments
ARG NODE_ENV=production
ARG APP_VERSION=3.0.0
ARG BUILD_DATE
ARG VCS_REF
ARG APP_USER=webportal
ARG APP_UID=1001
ARG APP_GID=1001

# Security labels
LABEL maintainer="Claude Flow Novice Team" \
      version="${APP_VERSION}" \
      build.date="${BUILD_DATE}" \
      vcs.ref="${VCS_REF}" \
      description="Claude Flow Novice Web Portal - React SPA with Express backend" \
      security.scan="completed" \
      base.image="node:20-alpine"

# Set environment variables
ENV NODE_ENV=${NODE_ENV} \
    APP_VERSION=${APP_VERSION} \
    PATH="/app/node_modules/.bin:${PATH}" \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_PROGRESS=false

# Install runtime dependencies and nginx
RUN apk add --no-cache \
    dumb-init \
    curl \
    nginx \
    ca-certificates \
    tzdata \
    && apk upgrade --no-cache

# Create non-root user
RUN addgroup -g ${APP_GID} ${APP_USER} && \
    adduser -u ${APP_UID} -G ${APP_USER} -s /bin/sh -D ${APP_USER}

# Set working directory
WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/dist ./dist
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/node_modules ./node_modules
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/data /var/cache/nginx /var/log/nginx /run/nginx && \
    chown -R ${APP_USER}:${APP_USER} /app /var/cache/nginx /var/log/nginx /run/nginx

# Copy nginx configuration
COPY --chown=${APP_USER}:${APP_USER} nginx.conf /etc/nginx/nginx.conf

# Switch to non-root user
USER ${APP_USER}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose ports
EXPOSE 80 3000

# Set entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Start both nginx and node server
CMD ["sh", "-c", "nginx && node dist/server/index.js"]
