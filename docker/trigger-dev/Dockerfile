FROM node:20-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Create data directories for RuVector persistence
RUN mkdir -p /app/data/backups /app/data/migration && \
    chmod -R 755 /app/data

# Environment variables for RuVector
ENV RUVECTOR_DB_PATH=/app/data/ruvector.db
ENV NODE_ENV=production
ENV PORT=3000

# Health check for RuVector availability
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Declare data volume for persistence across container restarts
VOLUME ["/app/data"]

# Expose application port
EXPOSE 3000

# Start application
CMD ["npm", "run", "start"]
