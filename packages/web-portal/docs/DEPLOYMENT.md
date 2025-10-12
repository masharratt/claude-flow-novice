# Web Portal Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Development Deployment](#development-deployment)
4. [Production Deployment](#production-deployment)
5. [Docker Deployment](#docker-deployment)
6. [Scaling and Performance](#scaling-and-performance)
7. [Monitoring](#monitoring)
8. [Backup and Recovery](#backup-and-recovery)
9. [Security Considerations](#security-considerations)

---

## Prerequisites

### System Requirements

#### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 2 GB
- **Disk**: 5 GB free space
- **OS**: Linux (Ubuntu 20.04+), macOS 11+, Windows 10+ with WSL2

#### Recommended Requirements (Production)
- **CPU**: 4+ cores
- **RAM**: 8 GB
- **Disk**: 20 GB free space (SSD recommended)
- **OS**: Linux (Ubuntu 22.04 LTS)

### Software Dependencies

#### Required
- **Node.js**: 20.0.0 or higher
- **npm**: 9.0.0 or higher

#### Optional (for production)
- **Docker**: 20.10+ (for containerized deployment)
- **Docker Compose**: 2.0+ (for multi-container setup)
- **Nginx**: 1.18+ (for reverse proxy)
- **Redis**: 6.0+ (for WebSocket scaling)
- **PM2**: 5.0+ (for process management)

### Network Requirements

#### Development
- Port 3000 (backend API and WebSocket)
- Port 3001 (frontend dev server)

#### Production
- Port 80 (HTTP)
- Port 443 (HTTPS, recommended)
- Port 3000 (backend, if not behind reverse proxy)

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/claude-flow-novice.git
cd claude-flow-novice/packages/web-portal
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create `.env` file in the `packages/web-portal` directory:

```bash
cp .env.example .env
```

#### Environment Variables Reference

```bash
# Node Environment
NODE_ENV=production  # development | production | test

# Server Configuration
PORT=3000
HOST=0.0.0.0

# Frontend Configuration
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# JWT Authentication
JWT_SECRET=your-secret-key-min-32-chars  # REQUIRED - Generate strong secret
JWT_EXPIRES_IN=15m  # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d  # Refresh token expiration

# API Keys (comma-separated for multiple keys)
API_KEYS=api-key-1,api-key-2

# Redis Configuration (optional, for WebSocket scaling)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Rate Limiting
RATE_LIMIT_WINDOW=60000  # 1 minute in ms
RATE_LIMIT_MAX=100  # Max requests per window
INTERVENTION_RATE_LIMIT_MAX=10

# CORS
CORS_ORIGIN=http://localhost:3001  # Frontend URL, or * for all origins

# Logging
LOG_LEVEL=info  # error | warn | info | debug
LOG_FILE=./logs/web-portal.log

# WebSocket Configuration
WS_PING_TIMEOUT=60000  # 60 seconds
WS_PING_INTERVAL=25000  # 25 seconds
WS_MAX_HTTP_BUFFER_SIZE=1048576  # 1MB
WS_MAX_CONNECTIONS_PER_IP=10

# Security Headers
HELMET_CSP_ENABLED=true
HELMET_HSTS_MAX_AGE=31536000  # 1 year in seconds

# Database (if using persistent storage)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=claude_flow
DB_USER=postgres
DB_PASSWORD=

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

#### Generate JWT Secret

```bash
# Generate secure random string (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Development Deployment

### Start Development Servers

#### Option 1: Start All (Client + Server)

```bash
npm run dev
```

This runs:
- Frontend dev server on port 3001 (Vite)
- Backend server on port 3000 (Express with tsx watch)

#### Option 2: Start Separately

```bash
# Terminal 1: Start backend
npm run dev:server

# Terminal 2: Start frontend
npm run dev:client
```

### Verify Development Setup

1. Backend health check:
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "3.0.0",
  "uptime": 123456,
  "timestamp": "2025-10-12T10:30:00.000Z"
}
```

2. Frontend access:
```
Open browser: http://localhost:3001
```

3. WebSocket connection:
```javascript
// In browser console
const socket = io('http://localhost:3000');
socket.on('connect', () => console.log('Connected'));
```

---

## Production Deployment

### 1. Build Application

```bash
# Build both client and server
npm run build

# Or build separately
npm run build:client  # Builds React app
npm run build:server  # Compiles TypeScript server
npm run build:types   # Generate TypeScript declarations
```

Build outputs:
- **Client**: `dist/client` (static assets)
- **Server**: `dist/server` (compiled JS)

### 2. Environment Configuration

Update `.env` for production:

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Use production URLs
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com

# Strong JWT secret
JWT_SECRET=<generated-64-char-secret>

# Restrict CORS
CORS_ORIGIN=https://your-domain.com

# Production Redis (recommended)
REDIS_HOST=redis.your-domain.com
REDIS_PASSWORD=<redis-password>

# Enable security
HELMET_CSP_ENABLED=true
HELMET_HSTS_MAX_AGE=31536000
```

### 3. Start Production Server

#### Option A: Direct Node

```bash
NODE_ENV=production node dist/server/index.js
```

#### Option B: PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/server/index.js --name web-portal

# Configure auto-restart on system boot
pm2 startup
pm2 save

# Monitor
pm2 monit
pm2 logs web-portal
```

PM2 ecosystem file (`ecosystem.config.js`):

```javascript
module.exports = {
  apps: [{
    name: 'web-portal',
    script: './dist/server/index.js',
    instances: 4,  // Use multiple CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
  }],
};
```

Start with ecosystem:
```bash
pm2 start ecosystem.config.js
```

### 4. Serve Static Files

#### Option A: Node.js Built-in

The Express server serves static files from `dist/client`:

```javascript
// Already configured in server/index.ts
app.use(express.static('dist/client'));
```

#### Option B: Nginx (Recommended)

Nginx configuration (`/etc/nginx/sites-available/web-portal`):

```nginx
upstream backend {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;  # If using PM2 cluster
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Static files
    root /var/www/web-portal/dist/client;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Static assets with long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket proxy
    location /socket.io {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://backend;
        access_log off;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/web-portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Docker Deployment

### Dockerfile

Create `Dockerfile` in `packages/web-portal`:

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"

# Start application
CMD ["node", "dist/server/index.js"]
```

### Build Docker Image

```bash
docker build -t web-portal:latest .
```

### Run Docker Container

```bash
docker run -d \
  --name web-portal \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=<your-secret> \
  -e REDIS_HOST=redis \
  --restart unless-stopped \
  web-portal:latest
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  web-portal:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: web-portal
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - CORS_ORIGIN=${CORS_ORIGIN}
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - web-portal-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    image: redis:7-alpine
    container_name: web-portal-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - web-portal-network
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    container_name: web-portal-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - web-portal
    restart: unless-stopped
    networks:
      - web-portal-network

volumes:
  redis-data:

networks:
  web-portal-network:
    driver: bridge
```

### Start Docker Compose

```bash
# Create .env file with secrets
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
echo "CORS_ORIGIN=https://your-domain.com" >> .env

# Start services
docker-compose up -d

# View logs
docker-compose logs -f web-portal

# Stop services
docker-compose down
```

---

## Scaling and Performance

### Horizontal Scaling

#### PM2 Cluster Mode

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'web-portal',
    script: './dist/server/index.js',
    instances: 'max',  // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
```

#### Load Balancing with Nginx

Nginx upstream configuration with load balancing:

```nginx
upstream backend {
    least_conn;  # or ip_hash, round_robin
    server 127.0.0.1:3000 weight=2;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;

    # Health checks (requires nginx-plus or custom module)
    # check interval=3000 rise=2 fall=3 timeout=1000;
}
```

### WebSocket Scaling with Redis

Enable Redis adapter for Socket.IO to support multiple server instances:

```javascript
// server/websocket/index.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

### Caching Strategy

#### API Response Caching

```nginx
# Nginx cache configuration
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m use_temp_path=off;

location /api/agents/hierarchy {
    proxy_pass http://backend;
    proxy_cache api_cache;
    proxy_cache_valid 200 30s;
    proxy_cache_key "$request_uri";
    add_header X-Cache-Status $upstream_cache_status;
}
```

#### Client-Side Caching

```javascript
// Service Worker caching (in frontend)
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/metrics')) {
    event.respondWith(
      caches.open('api-cache').then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request).then((fetchResponse) => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }
});
```

### Performance Tuning

#### Node.js Configuration

```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=4096" node dist/server/index.js

# Enable V8 optimizations
NODE_OPTIONS="--optimize-for-size --gc-interval=100" node dist/server/index.js
```

#### System Limits

```bash
# Increase file descriptor limit
ulimit -n 65536

# Add to /etc/security/limits.conf
* soft nofile 65536
* hard nofile 65536
```

---

## Monitoring

### Application Monitoring

#### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# List processes
pm2 list

# Detailed process info
pm2 show web-portal

# Memory usage
pm2 describe web-portal | grep memory
```

#### Custom Health Checks

```javascript
// server/routes/api/health.ts
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    version: process.env.npm_package_version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      websocket: checkWebSocket(),
    },
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
  };

  const isHealthy = Object.values(health.services).every(s => s === 'healthy');
  res.status(isHealthy ? 200 : 503).json(health);
});
```

### Logging

#### Winston Logger Configuration

```javascript
// server/config/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

export default logger;
```

#### Log Rotation

Install log rotation:

```bash
sudo apt-get install logrotate
```

Create `/etc/logrotate.d/web-portal`:

```
/var/www/web-portal/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 nodejs nodejs
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Metrics Collection

#### Prometheus Integration

```javascript
// server/middleware/metrics.ts
import { Registry, Counter, Histogram } from 'prom-client';

const register = new Registry();

const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestCounter.inc({ method: req.method, route: req.route?.path, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, route: req.route?.path, status: res.statusCode }, duration);
  });
  next();
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## Backup and Recovery

### Database Backup (if using)

```bash
# PostgreSQL backup
pg_dump -U postgres -d claude_flow -f backup-$(date +%Y%m%d-%H%M%S).sql

# Restore
psql -U postgres -d claude_flow -f backup-20251012-103000.sql
```

### Redis Backup

```bash
# Redis saves automatically with AOF
# Manual backup
redis-cli BGSAVE

# Copy backup file
cp /var/lib/redis/dump.rdb /backup/redis-$(date +%Y%m%d-%H%M%S).rdb
```

### Application Configuration Backup

```bash
# Backup .env and configs
tar -czf config-backup-$(date +%Y%m%d-%H%M%S).tar.gz .env ecosystem.config.js nginx.conf
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/backup/web-portal"

mkdir -p "$BACKUP_DIR"

# Backup database
pg_dump -U postgres -d claude_flow -f "$BACKUP_DIR/db-$DATE.sql"

# Backup Redis
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb "$BACKUP_DIR/redis-$DATE.rdb"

# Backup configs
tar -czf "$BACKUP_DIR/config-$DATE.tar.gz" .env ecosystem.config.js nginx.conf

# Remove backups older than 30 days
find "$BACKUP_DIR" -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

Schedule with cron:

```bash
# Run daily at 2 AM
0 2 * * * /usr/local/bin/backup.sh >> /var/log/web-portal-backup.log 2>&1
```

---

## Security Considerations

### SSL/TLS Configuration

#### Let's Encrypt SSL Certificate

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal (certbot sets up cron automatically)
sudo certbot renew --dry-run
```

### Firewall Configuration

```bash
# UFW firewall rules
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### Security Headers

Already configured via Helmet middleware. Verify with:

```bash
curl -I https://your-domain.com
```

Expected headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
X-XSS-Protection: 1; mode=block
```

### Environment Variable Security

```bash
# Secure .env file permissions
chmod 600 .env

# Never commit .env to git
echo ".env" >> .gitignore
```

### Regular Security Updates

```bash
# Update dependencies
npm audit
npm audit fix

# System updates
sudo apt-get update
sudo apt-get upgrade
```

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-12
**Maintained By**: Claude Flow Novice DevOps Team
