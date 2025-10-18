# Phase 5 Production Deployment Guide for Dashboard and Monitoring Infrastructure

## 1. Prerequisites

### System Requirements
- **Node.js**: Version 18.x or higher
- **Redis**: Version 6.2+ with TLS support
- **Operating System**: Linux (Ubuntu 20.04+ recommended)
- **CPU**: Minimum 2 cores
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 20GB minimum for application and logs

### Network & Security Requirements
- Firewall rules allowing:
  - Inbound traffic on ports 3001 (application)
  - Inbound traffic on port 6379 (Redis)
  - HTTPS (443) for web access
- SSL/TLS certificate for secure HTTPS connections
- Configured domain name for monitoring dashboard

### Preparatory Checks
- Verify SSL certificate validity
- Confirm DNS records are correctly configured
- Ensure network security groups are properly set up

## 2. Environment Setup

### Production Environment Variables
```bash
# Server Configuration
NODE_ENV=production
SERVER_PORT=3001
SERVER_HOST=0.0.0.0

# Redis Configuration
REDIS_HOST=redis.production.example.com
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=<secure-password>
REDIS_TLS=true

# Monitoring Configuration
MONITORING_INTERVAL=5000
STALE_KEY_THRESHOLD=300
MAX_HISTORY_SIZE=1000

# Security
ENABLE_CORS=true
CORS_ORIGINS=https://dashboard.example.com,https://app.example.com
ENABLE_COMPRESSION=true
MAX_CONNECTIONS=500
HEARTBEAT_INTERVAL=30000

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/redis-monitoring/server.log
```

### Secure Credential Management
- Use environment-specific `.env` files
- Never commit secrets to version control
- Consider using secret management tools like HashiCorp Vault or AWS Secrets Manager

## 3. Installation Steps

### Step 1: Prepare Environment
```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install required dependencies
sudo apt-get install -y nodejs npm redis-server nginx certbot

# Create application directory
sudo mkdir -p /opt/claude-flow-novice
sudo chown -R $(whoami):$(whoami) /opt/claude-flow-novice
```

### Step 2: Clone and Install Project
```bash
cd /opt/claude-flow-novice
git clone https://github.com/yourorg/claude-flow-novice.git .
git checkout v1.0.0  # Specify production release tag

# Install dependencies
npm ci --production

# Build dashboard and monitoring service
npm run build:dashboard
npm run build:monitoring-service
```

### Step 3: Configure Redis
```bash
# Secure Redis configuration
sudo nano /etc/redis/redis.conf

# Add/modify these settings
requirepass <strong-redis-password>
tls-port 6379
tls-cert-file /path/to/redis.crt
tls-key-file /path/to/redis.key
tls-auth-clients no
```

## 4. Deployment Options

### Option A: PM2 Process Manager
```bash
# Install PM2 globally
sudo npm install -g pm2

# Create ecosystem configuration
cat > ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: 'redis-monitoring-server',
    script: './dist/src/web/dashboard/realtime/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '500M'
  }]
};
EOL

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
```

### Option B: Docker Deployment
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/src/web/dashboard/realtime/server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --port 6379
    volumes:
      - redis-data:/data

  monitoring-server:
    build: .
    ports:
      - "3001:3001"
    environment:
      - REDIS_HOST=redis
      - NODE_ENV=production
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis-data:
```

### Option C: Kubernetes Deployment
```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-monitoring
spec:
  replicas: 3
  selector:
    matchLabels:
      app: redis-monitoring
  template:
    metadata:
      labels:
        app: redis-monitoring
    spec:
      containers:
      - name: monitoring-server
        image: yourorg/redis-monitoring:latest
        ports:
        - containerPort: 3001
        env:
        - name: REDIS_HOST
          value: redis-service
        - name: NODE_ENV
          value: production
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## 5. Nginx Reverse Proxy Configuration

```nginx
# /etc/nginx/sites-available/redis-monitoring
upstream monitoring_backend {
    least_conn;
    server localhost:3001;
    server localhost:3002;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name monitoring.example.com;

    ssl_certificate /etc/letsencrypt/live/monitoring.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitoring.example.com/privkey.pem;

    location /ws {
        proxy_pass http://monitoring_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location /api {
        proxy_pass http://monitoring_backend;
        proxy_set_header Host $host;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_valid 200 5s;
    }

    location / {
        root /var/www/redis-monitoring/dist;
        try_files $uri $uri/ /index.html;
        expires 1y;
    }
}
```

## 6. Monitoring & Health Checks

### System Monitoring
- **Prometheus Integration**
- **Grafana Dashboards**
- **PM2 Process Management**

```bash
# Health check
curl https://monitoring.example.com/health

# PM2 Monitoring
pm2 monit
pm2 logs redis-monitoring-server
```

## 7. Security Hardening

### Security Checklist
- [x] Redis authentication
- [x] TLS for all connections
- [x] Implement rate limiting
- [x] Properly configured CORS
- [x] Enable compression
- [x] Firewall rules
- [x] Regular security updates

### Additional Security Measures
```bash
# Fail2Ban configuration
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
```

## 8. Backup & Recovery

```bash
# Redis backup script
#!/bin/bash
BACKUP_DIR=/var/backups/redis
mkdir -p $BACKUP_DIR
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis-$(date +%Y%m%d).rdb

# Application backup
tar -czf $BACKUP_DIR/redis-monitoring-backup-$(date +%Y%m%d).tar.gz dist/ config/ node_modules/
```

## 9. Troubleshooting

### Common Issues
1. **WebSocket Connection Failures**
   - Check network configuration
   - Verify SSL certificates
   - Confirm firewall settings

2. **Redis Connection Issues**
   - Validate Redis password
   - Check Redis service status
   - Verify network connectivity

3. **Performance Degradation**
   - Monitor CPU and memory usage
   - Check for memory leaks
   - Review application logs

## 10. Rollback Procedure

### Emergency Rollback Steps
1. Stop current deployment
```bash
pm2 stop redis-monitoring-server
```

2. Restore previous version
```bash
git checkout v0.9.0  # Previous stable version
npm ci --production
npm run build
pm2 restart ecosystem.config.js
```

## 11. Post-Deployment Validation

### Verification Checklist
- [ ] Dashboard accessible via HTTPS
- [ ] WebSocket connections stable
- [ ] Monitoring metrics collecting
- [ ] No error logs
- [ ] Performance metrics within expected ranges

### Performance Validation
```bash
# Run performance tests
npm run test:performance
npm run test:load
```

## Conclusion

Congratulations! You have successfully deployed the Redis Monitoring Dashboard. Regular maintenance, monitoring, and periodic security audits are recommended.

**Support Contact**: support@yourcompany.com