# Claude Flow Novice - Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying Claude Flow Novice to production environments, including Docker containerization, Kubernetes orchestration, and cloud infrastructure setup.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Terraform Infrastructure](#terraform-infrastructure)
6. [Monitoring and Observability](#monitoring-and-observability)
7. [Security Configuration](#security-configuration)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)
10. [Maintenance and Operations](#maintenance-and-operations)

## Prerequisites

### System Requirements

- **Node.js**: 20.x or higher
- **Docker**: 20.x or higher
- **Docker Compose**: 2.x or higher
- **Kubernetes**: 1.25 or higher (for K8s deployment)
- **Terraform**: 1.5 or higher (for IaC deployment)
- **Memory**: Minimum 4GB RAM, recommended 8GB+
- **Storage**: Minimum 20GB available disk space

### Required Tools

```bash
# Install Node.js (using nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Install Docker and Docker Compose
# Follow official instructions for your platform

# Install kubectl (for Kubernetes deployment)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install Terraform
wget https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_amd64.zip
unzip terraform_1.5.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/
```

## Quick Start

### 1. Clone and Build

```bash
git clone https://github.com/masharratt/claude-flow-novice.git
cd claude-flow-novice
npm install
npm run build
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

### 3. Quick Deployment

```bash
# Deploy with Docker Compose
docker compose up -d

# Or deploy with Kubernetes
kubectl apply -f k8s/
```

## Docker Deployment

### Basic Docker Deployment

```bash
# Build the image
docker build -t claude-flow-novice:latest .

# Run the container
docker run -d \
  --name claude-flow-novice \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  claude-flow-novice:latest
```

### Docker Compose Production Deployment

```bash
# Deploy all services
docker compose -f docker-compose.yml up -d

# Check status
docker compose ps

# View logs
docker compose logs -f claude-flow-novice
```

### Production Docker Configuration

The `docker-compose.yml` includes:

- **Application Service**: Main Claude Flow Novice application
- **Redis**: Caching and session storage
- **PostgreSQL**: Primary database
- **Nginx**: Reverse proxy and load balancer
- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboard

### Health Checks

All services include health checks:

```bash
# Check service health
docker compose exec claude-flow-novice curl http://localhost:3000/health

# View detailed health status
docker compose exec claude-flow-novice node -e "console.log('Health check passed')"
```

## Kubernetes Deployment

### Namespace Creation

```bash
kubectl create namespace claude-flow-novice
kubectl config set-context --current --namespace=claude-flow-novice
```

### Apply Configuration

```bash
# Deploy all resources
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -w

# View services
kubectl get services
```

### Kubernetes Resources

The Kubernetes deployment includes:

- **Deployment**: Application pods with replica management
- **Service**: Load balancer and internal networking
- **ConfigMap**: Configuration management
- **Secret**: Sensitive data storage
- **PersistentVolumeClaim**: Database storage
- **Ingress**: External access configuration

### Scaling

```bash
# Scale the application
kubectl scale deployment claude-flow-novice --replicas=5

# View scaling status
kubectl get pods -l app=claude-flow-novice
```

## Terraform Infrastructure

### Initialize Terraform

```bash
cd terraform

# Initialize providers
terraform init

# Plan the deployment
terraform plan -var-file=environments/production.tfvars

# Apply the configuration
terraform apply -var-file=environments/production.tfvars
```

### Infrastructure Components

The Terraform configuration provisions:

- **VPC**: Virtual Private Cloud with public/private subnets
- **Security Groups**: Network security rules
- **ECS/EKS**: Container orchestration
- **RDS**: Managed PostgreSQL database
- **ElastiCache**: Redis cache cluster
- **ALB**: Application Load Balancer
- **CloudWatch**: Monitoring and logging
- **S3**: Object storage

### Environment Variables

Create `terraform/terraform.tfvars`:

```hcl
# Environment
environment          = "production"
aws_region           = "us-east-1"

# Networking
vpc_cidr             = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]

# Compute
instance_type        = "t3.large"
instance_count       = 3

# Database
db_instance_class    = "db.t3.medium"
db_allocated_storage = 100

# Domain
domain_name          = "claude-flow-novice.com"
```

## Monitoring and Observability

### Prometheus Metrics

Access Prometheus at `http://your-domain:9090`:

- **Application Metrics**: HTTP requests, response times, error rates
- **System Metrics**: CPU, memory, disk usage
- **Database Metrics**: Query performance, connection counts
- **Business Metrics**: Agent operations, swarm activity

### Grafana Dashboards

Access Grafana at `http://your-domain:3001`:

- **Application Overview**: Key performance indicators
- **System Health**: Infrastructure metrics
- **Business Metrics**: Operational analytics
- **Security Monitoring**: Access patterns and anomalies

### Log Aggregation

```bash
# View application logs
docker compose logs -f claude-flow-novice

# View all service logs
docker compose logs -f

# Filter logs by level
docker compose logs claude-flow-novice | grep ERROR
```

### Alerting Configuration

Configure alerts in `monitoring/alerts/rules.yml`:

- **Application Health**: Downtime, high error rates
- **Performance**: High latency, resource usage
- **Security**: Unusual access patterns
- **Business**: Low user activity, high error rates

## Security Configuration

### SSL/TLS Setup

```bash
# Generate SSL certificates (Let's Encrypt)
certbot certonly --standalone -d claude-flow-novice.com

# Configure Nginx with SSL
# See docker/nginx/nginx.conf for SSL configuration
```

### Security Headers

The Nginx configuration includes:

- **HTTPS Redirect**: Automatic redirect from HTTP
- **Security Headers**: HSTS, CSP, XSS protection
- **Rate Limiting**: DDoS protection
- **Access Control**: IP-based restrictions

### Secrets Management

```bash
# Create secrets for Kubernetes
kubectl create secret generic claude-flow-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=redis-url="redis://..." \
  --from-literal=jwt-secret="your-secret-key"

# Create secrets for Docker Compose
echo "DATABASE_URL=postgresql://..." >> .env
echo "REDIS_URL=redis://..." >> .env
echo "JWT_SECRET=your-secret-key" >> .env
```

### Network Security

- **VPC Isolation**: Private subnets for databases
- **Security Groups**: Restrict access by IP and port
- **WAF Rules**: Web Application Firewall protection
- **DDoS Protection**: AWS Shield integration

## Performance Optimization

### Application Optimization

```bash
# Enable production optimizations
export NODE_ENV=production

# Configure caching
export REDIS_URL=redis://redis:6379

# Enable clustering
export CLUSTER_WORKERS=4
```

### Database Optimization

```sql
-- PostgreSQL performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
SELECT pg_reload_conf();
```

### Caching Strategy

- **Redis Cache**: Session storage and query results
- **CDN**: Static asset delivery
- **Browser Cache**: Client-side caching headers
- **Application Cache**: In-memory data caching

### Load Balancing

```nginx
# Nginx upstream configuration
upstream claude_flow {
    least_conn;
    server app1:3000 max_fails=3 fail_timeout=30s;
    server app2:3000 max_fails=3 fail_timeout=30s;
    server app3:3000 max_fails=3 fail_timeout=30s;
}
```

## Troubleshooting

### Common Issues

#### Application Won't Start

```bash
# Check logs
docker compose logs claude-flow-novice

# Check environment variables
docker compose exec claude-flow-novice env

# Check port conflicts
netstat -tulpn | grep :3000
```

#### Database Connection Issues

```bash
# Test database connectivity
docker compose exec postgres psql -U claudeflow -d claudeflow -c "SELECT 1;"

# Check database logs
docker compose logs postgres

# Verify network connectivity
docker compose exec claude-flow-novice ping postgres
```

#### High Memory Usage

```bash
# Check memory usage
docker stats

# Monitor memory trends
docker compose exec claude-flow-novice node -e "console.log(process.memoryUsage())"

# Restart services if needed
docker compose restart claude-flow-novice
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=claude-flow:*
export LOG_LEVEL=debug

# Run with verbose output
docker compose up --force-recreate --no-deps claude-flow-novice
```

### Health Checks

```bash
# Comprehensive health check
curl -f http://localhost:3000/health || echo "Health check failed"

# Check all services
docker compose exec -T claude-flow-novice node -e "
const http = require('http');
const options = { hostname: 'localhost', port: 3000, path: '/health', method: 'GET' };
const req = http.request(options, (res) => {
  console.log(\`Health check status: \${res.statusCode}\`);
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', (err) => { console.error(err); process.exit(1); });
req.end();
"
```

## Maintenance and Operations

### Backup Procedures

```bash
# Database backup
docker compose exec postgres pg_dump -U claudeflow claudeflow > backup.sql

# Application data backup
docker run --rm -v claude-flow-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/data-backup.tar.gz -C /data .

# Configuration backup
cp .env .env.backup
cp docker-compose.yml docker-compose.yml.backup
```

### Update Procedures

```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm install
npm update

# Rebuild and redeploy
docker compose build
docker compose up -d

# Verify deployment
docker compose ps
curl http://localhost:3000/health
```

### Monitoring Setup

```bash
# Set up monitoring dashboards
kubectl apply -f monitoring/

# Configure alerts
kubectl apply -f monitoring/alerts/

# Verify monitoring
kubectl get pods -n monitoring
```

### Scaling Operations

```bash
# Horizontal scaling
kubectl scale deployment claude-flow-novice --replicas=10

# Vertical scaling (edit resources)
kubectl edit deployment claude-flow-novice

# Auto-scaling
kubectl apply -f k8s/autoscaler/
```

### Disaster Recovery

```bash
# Restore from backup
docker compose exec -T postgres psql -U claudeflow claudeflow < backup.sql

# Failover to backup region
terraform apply -var-file=environments/backup.tfvars

# Verify service restoration
curl http://backup-domain.com/health
```

## Support and Documentation

- **Documentation**: [docs/](../docs/)
- **API Reference**: [docs/API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Troubleshooting Guide**: [docs/troubleshooting.md](troubleshooting.md)
- **Community Support**: [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
- **Security Issues**: [Security Policy](../SECURITY.md)

---

For additional support or questions, please refer to the [main documentation](../README.md) or open an issue on GitHub.