# Secure Performance Dashboard Dockerfile
# Multi-stage build with security best practices

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set build arguments
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# Labels for security and metadata
LABEL maintainer="Security Team <security@company.com>" \
      org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.name="secure-dashboard" \
      org.label-schema.description="Secure Performance Monitoring Dashboard" \
      org.label-schema.url="https://github.com/company/secure-dashboard" \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.vcs-url="https://github.com/company/secure-dashboard.git" \
      org.label-schema.vendor="Company Inc." \
      org.label-schema.version=$VERSION \
      org.label-schema.schema-version="1.0"

# Install build dependencies
RUN apk add --no-cache \
    ca-certificates \
    && update-ca-certificates

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with security audit
RUN npm ci --only=production && \
    npm audit fix --audit-level moderate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Runtime stage
FROM node:18-alpine AS runtime

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S dashboard -u 1001

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    dumb-init \
    && update-ca-certificates \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=dashboard:nodejs /app/dist ./dist
COPY --from=builder --chown=dashboard:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=dashboard:nodejs /app/package*.json ./

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/config /app/ssl && \
    chown -R dashboard:nodejs /app

# Set secure file permissions
RUN chmod -R 755 /app && \
    chmod -R 644 /app/dist && \
    chmod -R 600 /app/config && \
    chmod -R 600 /app/ssl

# Switch to non-root user
USER dashboard

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Expose port
EXPOSE 3001

# Set environment variables for security
ENV NODE_ENV=production \
    PORT=3001 \
    NODE_OPTIONS="--max-old-space-size=512 --no-expose-gc" \
    UV_THREADPOOL_SIZE=4

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]

# Start the secure server
CMD ["node", "dist/monitor/dashboard/secure-server.js"]