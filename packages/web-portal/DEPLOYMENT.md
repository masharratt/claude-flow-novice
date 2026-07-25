# Web Portal Deployment Guide

## Overview

This guide covers the production deployment of the Claude Flow Novice Web Portal using Docker and CI/CD pipelines.

## Prerequisites

- Docker 24.0+
- Docker Compose 2.0+ (optional)
- Node.js 20+ (for local builds)
- Kubernetes cluster (optional, for orchestration)
- GitHub Actions (for CI/CD)

---

## Environment Configuration

### Required Environment Variables

Copy `.env.example` to `.env.production` and configure:

```bash
# Critical - Replace these in production
JWT_SECRET=your-super-secret-jwt-key-64-chars-min
SESSION_SECRET=your-super-secret-session-key-64-chars-min
REDIS_PASSWORD=your-redis-password

# API Keys
ANTHROPIC_API_KEY=your-anthropic-api-key
ZAI_API_KEY=your-zai-api-key

# Production URLs
VITE_API_URL=https://your-domain.com/api
VITE_WS_URL=wss://your-domain.com
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

### Security Checklist

- [ ] Change all default secrets
- [ ] Use strong passwords (64+ characters)
- [ ] Enable HTTPS/TLS
- [ ] Configure secure CORS origins
- [ ] Set `BCRYPT_ROUNDS=12` for production
- [ ] Enable rate limiting
- [ ] Configure security headers

---

## Local Production Build

### Build Client and Server

```bash
cd packages/web-portal

# Install dependencies
npm ci

# Build client (Vite)
npm run build:client

# Build server (SWC)
npm run build:server

# Build types (optional)
npm run build:types
```

### Build Output

- Client: `dist/client/` - Static assets for Nginx
- Server: `dist/server/` - Compiled Express server

---

## Docker Deployment

### Build Docker Image

```bash
cd packages/web-portal

# Build image
docker build -t web-portal:latest .

# Build with build args
docker build \
  --build-arg NODE_ENV=production \
  --build-arg APP_VERSION=3.0.0 \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -t web-portal:3.0.0 .
```

### Run Docker Container

```bash
# Run with environment file
docker run -d \
  --name web-portal \
  -p 80:80 \
  -p 3000:3000 \
  --env-file .env.production \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  web-portal:latest

# Health check
curl http://localhost:3000/health
```

### Docker Compose

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    networks:
      - web-portal-net

  web-portal:
    build: .
    ports:
      - "80:80"
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    depends_on:
      - redis
    networks:
      - web-portal-net
    restart: unless-stopped

volumes:
  redis-data:

networks:
  web-portal-net:
    driver: bridge
```

Run with Docker Compose:

```bash
docker-compose up -d
docker-compose logs -f web-portal
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

The automated deployment pipeline (`.github/workflows/web-portal-deploy.yml`) includes:

1. **Build and Test** - Lint, type check, unit tests
2. **Security Scan** - npm audit, Snyk scan
3. **Build Docker Image** - Multi-stage build, push to registry
4. **Deploy to Staging** - Automatic on `develop` branch
5. **Deploy to Production** - Automatic on `main` branch
6. **Post-Deployment** - E2E tests, performance audit

### Triggering Deployments

```bash
# Automatic deployment on push
git push origin main  # → Production
git push origin develop  # → Staging

# Manual deployment
gh workflow run web-portal-deploy.yml \
  -f environment=production
```

### Required GitHub Secrets

Configure in GitHub Settings → Secrets:

- `SNYK_TOKEN` - Snyk security scanning
- `DOCKER_USERNAME` - Docker registry username
- `DOCKER_PASSWORD` - Docker registry password
- `PRODUCTION_SSH_KEY` - SSH key for production server (if using SSH deployment)

---

## Kubernetes Deployment

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-portal
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-portal
  template:
    metadata:
      labels:
        app: web-portal
    spec:
      containers:
      - name: web-portal
        image: ghcr.io/your-org/web-portal:latest
        ports:
        - containerPort: 80
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        envFrom:
        - secretRef:
            name: web-portal-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 40
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: web-portal-service
  namespace: production
spec:
  selector:
    app: web-portal
  ports:
  - name: http
    port: 80
    targetPort: 80
  - name: api
    port: 3000
    targetPort: 3000
  type: LoadBalancer
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace production

# Create secrets
kubectl create secret generic web-portal-secrets \
  --from-env-file=.env.production \
  -n production

# Deploy
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/web-portal -n production

# Check pods
kubectl get pods -n production
kubectl logs -f deployment/web-portal -n production
```

---

## Monitoring and Health Checks

### Health Check Endpoints

- **Basic Health**: `GET /health`
  - Returns: `200 OK` if service is running

- **API Health**: `GET /api/health`
  - Returns: JSON with service status

### Monitoring Metrics

Monitor these key metrics:

- **Uptime**: Target 99.9%+
- **Response Time**: < 500ms p95
- **Error Rate**: < 1%
- **Memory Usage**: < 80%
- **CPU Usage**: < 70%

### Log Locations

- **Application Logs**: `/app/logs/server.log`
- **Nginx Access**: `/var/log/nginx/access.log`
- **Nginx Error**: `/var/log/nginx/error.log`

---

## Scaling and Performance

### Horizontal Scaling

```bash
# Docker Swarm
docker service scale web-portal=5

# Kubernetes
kubectl scale deployment/web-portal --replicas=5 -n production
```

### Performance Optimization

- **Caching**: Redis caching enabled by default
- **Compression**: Gzip enabled in Nginx
- **CDN**: Serve static assets via CDN
- **Database**: Connection pooling configured
- **Rate Limiting**: Protects against abuse

---

## Rollback Procedures

### Docker Rollback

```bash
# List image versions
docker images web-portal

# Rollback to previous version
docker stop web-portal
docker rm web-portal
docker run -d --name web-portal web-portal:previous-tag
```

### Kubernetes Rollback

```bash
# View rollout history
kubectl rollout history deployment/web-portal -n production

# Rollback to previous version
kubectl rollout undo deployment/web-portal -n production

# Rollback to specific revision
kubectl rollout undo deployment/web-portal --to-revision=2 -n production
```

### CI/CD Automatic Rollback

The GitHub Actions workflow includes automatic rollback on:
- Failed health checks
- Failed smoke tests
- Error rate spike

---

## Troubleshooting

### Build Failures

```bash
# Check build logs
docker build --progress=plain -t web-portal:debug .

# Test build locally
npm run build:client
npm run build:server
```

### Container Won't Start

```bash
# Check logs
docker logs web-portal

# Interactive debug
docker run -it --entrypoint sh web-portal:latest

# Check environment
docker exec web-portal env
```

### Connection Issues

```bash
# Test Redis connection
redis-cli -h localhost -p 6379 -a ${REDIS_PASSWORD} ping

# Test API endpoint
curl -v http://localhost:3000/api/health

# Test WebSocket
wscat -c ws://localhost:3000/socket.io/
```

### Performance Issues

```bash
# Check resource usage
docker stats web-portal

# Check Kubernetes resources
kubectl top pods -n production

# Review logs for errors
kubectl logs -f deployment/web-portal -n production --tail=100
```

---

## Security Best Practices

1. **Secrets Management**
   - Never commit secrets to version control
   - Use environment variables or secret managers
   - Rotate secrets regularly

2. **Network Security**
   - Use HTTPS/TLS in production
   - Configure firewall rules
   - Enable CORS with specific origins

3. **Container Security**
   - Run as non-root user (webportal:1001)
   - Scan images for vulnerabilities
   - Keep base images updated

4. **Application Security**
   - Enable rate limiting
   - Configure security headers (Helmet.js)
   - Implement CSRF protection
   - Use strong JWT secrets

---

## Support and Maintenance

### Regular Maintenance

- **Daily**: Monitor logs and metrics
- **Weekly**: Review security alerts, update dependencies
- **Monthly**: Rotate secrets, backup data, test disaster recovery

### Backup Procedures

```bash
# Backup Redis data
redis-cli -a ${REDIS_PASSWORD} --rdb /backup/dump.rdb

# Backup SQLite database
cp /app/data/memory.db /backup/memory-$(date +%Y%m%d).db

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz /app/logs/
```

---

## Additional Resources

- [Vite Production Build](https://vitejs.dev/guide/build.html)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes Documentation](https://kubernetes.io/docs/home/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
