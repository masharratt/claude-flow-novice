# Production Operations Guide

## Overview

This guide provides comprehensive operational procedures for managing Claude Flow Novice in production environments, including monitoring, maintenance, troubleshooting, and incident response.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Monitoring and Alerting](#monitoring-and-alerting)
3. [Backup and Recovery](#backup-and-recovery)
4. [Scaling Operations](#scaling-operations)
5. [Security Operations](#security-operations)
6. [Performance Tuning](#performance-tuning)
7. [Incident Response](#incident-response)
8. [Maintenance Procedures](#maintenance-procedures)
9. [Troubleshooting Guide](#troubleshooting-guide)

## System Architecture

### Production Stack
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │      CDN        │    │      WAF        │
│    (ALB/Nginx)  │    │   (CloudFront)  │    │   (AWS WAF)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────────────────────┼─────────────────────────────────┐
│                         Application Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   App Pod 1 │  │   App Pod 2 │  │   App Pod 3 │  │   App Pod N │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────┼─────────────────────────────────┘
                                 │
┌─────────────────────────────────┼─────────────────────────────────┐
│                        Data Layer                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ PostgreSQL  │  │    Redis    │  │     S3      │  │  CloudWatch │ │
│  │ (Primary)   │  │   (Cache)   │  │  (Storage)  │  │   (Logs)    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Details

#### Application Layer
- **Runtime**: Node.js 20.x
- **Framework**: Express.js with TypeScript
- **Process Management**: PM2 or Kubernetes
- **Health Checks**: `/health` endpoint every 30 seconds

#### Database Layer
- **Primary Database**: PostgreSQL 15.x
- **Cache Layer**: Redis 7.x
- **Backup**: Daily automated backups with 30-day retention
- **Replication**: Read replicas for read-heavy workloads

#### Infrastructure Layer
- **Compute**: AWS ECS/EKS or Docker Swarm
- **Networking**: VPC with private subnets
- **Storage**: EBS volumes with encryption
- **CDN**: CloudFront with DDoS protection

## Monitoring and Alerting

### Key Metrics Dashboard

#### Application Metrics
```yaml
# Response Time
- http_request_duration_seconds: 95th percentile < 1s
- http_request_rate: requests per second
- error_rate: < 1% of total requests

# Business Metrics
- active_agents_count: current active AI agents
- swarm_operations_total: total swarm executions
- agent_success_rate: > 95%

# System Metrics
- memory_usage_percent: < 80%
- cpu_usage_percent: < 70%
- disk_usage_percent: < 85%
```

#### Alerting Rules
```yaml
Critical Alerts:
  - ApplicationDown: app unavailable > 1 minute
  - DatabaseDown: database unavailable > 30 seconds
  - HighErrorRate: error rate > 5% for 5 minutes
  - SecurityIncident: unauthorized access attempts

Warning Alerts:
  - HighLatency: p95 latency > 2 seconds
  - HighMemoryUsage: memory > 80% for 10 minutes
  - HighCPUUsage: CPU > 70% for 10 minutes
  - LowDiskSpace: disk space < 15%

Info Alerts:
  - NewDeployment: new version deployed
  - ScalingEvent: auto-scaling triggered
  - BackupComplete: backup job completed
```

### Monitoring Setup

#### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  - job_name: 'claude-flow-novice'
    static_configs:
      - targets: ['app:3000']
    metrics_path: /metrics
    scrape_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

#### Grafana Dashboards
- **Application Overview**: Key performance indicators
- **System Health**: Infrastructure metrics
- **Business Metrics**: AI agent performance
- **Security Dashboard**: Security events and alerts

### Log Management

#### Log Aggregation
```yaml
# Fluentd configuration
<source>
  @type tail
  path /var/log/claude-flow/*.log
  pos_file /var/log/fluentd/claude-flow.log.pos
  tag claude-flow.*
  format json
</source>

<match claude-flow.**>
  @type cloudwatch_logs
  region us-east-1
  log_group_name /aws/ecs/claude-flow-novice
  log_stream_name_from_tag true
</match>
```

#### Log Analysis
- **Structured Logging**: JSON format with consistent fields
- **Log Levels**: DEBUG, INFO, WARN, ERROR, FATAL
- **Correlation IDs**: Request tracing across services
- **Retention**: 30 days standard, 90 days for audit logs

## Backup and Recovery

### Backup Strategy

#### Database Backups
```bash
# Automated daily backup
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="claude_flow_backup_${DATE}.sql"

# Create backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > $BACKUP_FILE

# Compress and upload to S3
gzip $BACKUP_FILE
aws s3 cp ${BACKUP_FILE}.gz s3://backup-bucket/database/

# Clean up local files
rm ${BACKUP_FILE}.gz
```

#### Application Data Backup
```bash
# Backup application data and configuration
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backup_${DATE}"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup configuration files
cp -r /app/config $BACKUP_DIR/
cp .env $BACKUP_DIR/

# Backup user data
tar -czf $BACKUP_DIR/data.tar.gz /app/data/

# Upload to S3
aws s3 sync $BACKUP_DIR s3://backup-bucket/app-data/$BACKUP_DIR/

# Clean up
rm -rf $BACKUP_DIR
```

#### Backup Schedule
```yaml
Backup Schedule:
  Database:
    - Full backup: Daily at 2:00 AM UTC
    - Incremental backup: Every 4 hours
    - Retention: 30 days (standard), 1 year (archive)

  Application Data:
    - Configuration backup: Daily
    - User data backup: Weekly
    - Retention: 90 days

  Infrastructure:
    - Terraform state backup: Continuous
    - AMI backups: Weekly
    - Retention: 90 days
```

### Recovery Procedures

#### Database Recovery
```bash
# Database restoration procedure
#!/bin/bash
BACKUP_FILE=$1

# Stop application
kubectl scale deployment claude-flow-novice --replicas=0

# Restore database
gunzip -c $BACKUP_FILE | psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Restart application
kubectl scale deployment claude-flow-novice --replicas=3

# Verify restoration
curl -f http://app-url/health
```

#### Disaster Recovery
```bash
# Full disaster recovery procedure
#!/bin/bash

# 1. Provision new infrastructure
cd terraform
terraform apply -var-file=environments/disaster-recovery.tfvars

# 2. Restore data from backups
aws s3 sync s3://backup-bucket/database/ /tmp/db-backups/
aws s3 sync s3://backup-bucket/app-data/ /tmp/app-backups/

# 3. Deploy application
kubectl apply -f k8s/

# 4. Verify services
kubectl get pods
curl -f http://new-app-url/health

# 5. Update DNS
# Update Route53 or DNS provider
```

## Scaling Operations

### Auto-scaling Configuration

#### Horizontal Pod Autoscaler (HPA)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: claude-flow-novice-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claude-flow-novice
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### Cluster Autoscaler
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
spec:
  template:
    spec:
      containers:
      - image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.21.0
        command:
        - ./cluster-autoscaler
        - --balance-similar-node-groups
        - --expander=least-waste
        - --skip-nodes-with-local-storage=false
```

### Scaling Events

#### Manual Scaling
```bash
# Scale up for expected load
kubectl scale deployment claude-flow-novice --replicas=10

# Scale down after peak period
kubectl scale deployment claude-flow-novice --replicas=3

# View scaling events
kubectl get hpa claude-flow-novice-hpa --watch
```

#### Database Scaling
```bash
# Add read replica for read-heavy workloads
aws rds create-db-instance-read-replica \
  --db-instance-identifier claude-flow-read-replica \
  --source-db-instance-identifier claude-flow-primary

# Modify instance class for vertical scaling
aws rds modify-db-instance \
  --db-instance-identifier claude-flow-primary \
  --db-instance-class db.r5.large \
  --apply-immediately
```

## Security Operations

### Security Monitoring

#### Intrusion Detection
```yaml
# Falco rules for security monitoring
- rule: Suspicious Network Activity
  desc: Detect suspicious network connections
  condition: >
    fd.type=ipv4 and
    (fd.sip!=127.0.0.1 and fd.sip!=::1) and
    proc.name in (node, npm)
  output: >
    Suspicious network connection detected
    (command=%proc.cmdline connection=%fd.name)
  priority: WARNING
```

#### Access Control
```bash
# SSH access monitoring
#!/bin/bash
# Monitor failed SSH attempts
journalctl -u sshd | grep "Failed password" | \
  awk '{print $1, $2, $3, $11, $13}' | \
  sort | uniq -c | sort -nr

# Block suspicious IPs
iptables -A INPUT -s SUSPICIOUS_IP -j DROP
```

### Security Maintenance

#### Certificate Management
```bash
# Automated SSL certificate renewal
#!/bin/bash
# Check certificate expiration
if openssl x509 -checkend 2592000 -noout -in /etc/ssl/certs/app.crt; then
    echo "Certificate is valid for at least 30 days"
else
    echo "Certificate expires within 30 days, renewing..."
    certbot renew --quiet
    docker-compose restart nginx
fi
```

#### Vulnerability Management
```bash
# Daily vulnerability scan
#!/bin/bash
# Scan container images
trivy image --severity HIGH,CRITICAL claude-flow-novice:latest

# Scan dependencies
npm audit --audit-level high

# Generate report
npm audit --json > security-report.json
```

## Performance Tuning

### Application Performance

#### Database Optimization
```sql
-- PostgreSQL performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
SELECT pg_reload_conf();
```

#### Caching Strategy
```javascript
// Redis caching configuration
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

// Cache middleware
const cache = (duration = 300) => {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl}`;
    const cached = await client.get(key);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    res.sendResponse = res.json;
    res.json = (body) => {
      client.setex(key, duration, JSON.stringify(body));
      res.sendResponse(body);
    };

    next();
  };
};
```

### Infrastructure Performance

#### Load Balancer Optimization
```nginx
# Nginx performance tuning
worker_processes auto;
worker_connections 1024;

http {
    # Enable gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript;

    # Enable HTTP/2
    listen 443 ssl http2;

    # Connection pooling
    upstream claude_flow {
        least_conn;
        server app1:3000 max_fails=3 fail_timeout=30s;
        server app2:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }
}
```

## Incident Response

### Incident Classification

#### Severity Levels
```yaml
Critical (P1):
  - Complete service outage
  - Data breach or security incident
  - Revenue impact > $10,000/hour
  - Response time: 15 minutes

High (P2):
  - Partial service degradation
  - Performance issues
  - Security vulnerability
  - Response time: 1 hour

Medium (P3):
  - Feature not working
  - Minor performance issues
  - Configuration issues
  - Response time: 4 hours

Low (P4):
  - Documentation issues
  - Minor bugs
  - Enhancement requests
  - Response time: 24 hours
```

### Incident Response Process

#### 1. Detection and Triage
```bash
# Automated incident detection
#!/bin/bash
# Check application health
if ! curl -f http://app-url/health; then
    # Create incident in PagerDuty
    pagerduty-trigger --service "claude-flow-novice" \
        --severity "critical" \
        --message "Application health check failed"

    # Notify on-call engineer
    slack-notify --channel "#incidents" \
        --message "🚨 Critical incident detected: Application health check failed"
fi
```

#### 2. Investigation
```bash
# Incident investigation checklist
echo "=== Incident Investigation Checklist ==="
echo "1. Check application logs: docker-compose logs claude-flow-novice"
echo "2. Check system metrics: kubectl top pods"
echo "3. Check database status: docker-compose exec postgres pg_isready"
echo "4. Check recent deployments: kubectl rollout history deployment/claude-flow-novice"
echo "5. Check recent changes: git log --oneline -10"
```

#### 3. Resolution
```bash
# Common resolution procedures
case $INCIDENT_TYPE in
    "application_crash")
        # Restart application
        kubectl rollout restart deployment/claude-flow-novice
        ;;
    "database_issue")
        # Restart database
        docker-compose restart postgres
        ;;
    "high_memory")
        # Scale up resources
        kubectl patch deployment claude-flow-novice -p '{"spec":{"template":{"spec":{"containers":[{"name":"app","resources":{"limits":{"memory":"2Gi"}}}]}}}}'
        ;;
esac
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily Tasks
```bash
#!/bin/bash
# Daily maintenance script
echo "=== Daily Maintenance Tasks ==="

# Check system health
kubectl get pods
kubectl top nodes

# Check backup status
aws s3 ls s3://backup-bucket/ --recursive | grep $(date +%Y%m%d)

# Review security alerts
aws guardduty get-findings --detector-id $(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)

# Clean up old logs
find /var/log -name "*.log" -mtime +7 -delete
```

#### Weekly Tasks
```bash
#!/bin/bash
# Weekly maintenance script
echo "=== Weekly Maintenance Tasks ==="

# Update dependencies
npm audit fix
npm update

# Security scan
trivy image --severity HIGH,CRITICAL claude-flow-novice:latest

# Performance review
kubectl top pods --sort-by=cpu
kubectl top pods --sort-by=memory

# Capacity planning
kubectl describe nodes | grep -A 5 "Allocated resources:"
```

#### Monthly Tasks
```bash
#!/bin/bash
# Monthly maintenance script
echo "=== Monthly Maintenance Tasks ==="

# Security audit
npm audit --audit-level moderate

# Performance optimization
# Analyze slow queries
docker-compose exec postgres psql -U claudeflow -d claudeflow -c "
    SELECT query, mean_time, calls
    FROM pg_stat_statements
    ORDER BY mean_time DESC
    LIMIT 10;
"

# Capacity review
aws cloudwatch get-metric-statistics \
    --namespace AWS/ECS \
    --metric-name CPUUtilization \
    --start-time $(date -d '30 days ago' --iso-8601) \
    --end-time $(date --iso-8601) \
    --period 86400 \
    --statistics Average

# Disaster recovery test
# Test backup restoration in staging environment
```

## Troubleshooting Guide

### Common Issues and Solutions

#### Application Not Starting
```bash
# Symptom: Application fails to start
# Check logs
docker-compose logs claude-flow-novice

# Common solutions:
# 1. Check environment variables
docker-compose exec claude-flow-novice env | grep -E "(NODE_ENV|PORT|DATABASE_URL)"

# 2. Check port conflicts
netstat -tulpn | grep :3000

# 3. Check database connectivity
docker-compose exec claude-flow-novice node -e "
const pg = require('pg');
const client = new pg.Client(process.env.DATABASE_URL);
client.connect().then(() => {
    console.log('Database connection successful');
    process.exit(0);
}).catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
});
"
```

#### High Memory Usage
```bash
# Symptom: High memory consumption
# Diagnose
docker stats
kubectl top pods

# Solutions:
# 1. Restart application
docker-compose restart claude-flow-novice

# 2. Scale horizontally
kubectl scale deployment claude-flow-novice --replicas=5

# 3. Increase memory limits
kubectl patch deployment claude-flow-novice -p '{
    "spec":{"template":{"spec":{"containers":[{"name":"app","resources":{"limits":{"memory":"2Gi"}}}]}}}
}'
```

#### Database Connection Issues
```bash
# Symptom: Database connection failures
# Diagnose
docker-compose exec postgres pg_isready
docker-compose logs postgres

# Solutions:
# 1. Check connection pool settings
# 2. Restart database
docker-compose restart postgres

# 3. Check network connectivity
docker-compose exec claude-flow-novice ping postgres

# 4. Verify credentials
docker-compose exec claude-flow-novice node -e "
console.log('Database URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
"
```

#### Performance Degradation
```bash
# Symptom: Slow response times
# Diagnose
curl -w "@curl-format.txt" -o /dev/null -s http://app-url/api/test

# Check database performance
docker-compose exec postgres psql -U claudeflow -d claudeflow -c "
    SELECT query, mean_time, calls
    FROM pg_stat_statements
    ORDER BY mean_time DESC
    LIMIT 5;
"

# Solutions:
# 1. Add database indexes
# 2. Optimize queries
# 3. Implement caching
# 4. Scale horizontally
```

### Emergency Procedures

#### Service Restoration
```bash
#!/bin/bash
# Emergency service restoration
echo "=== Emergency Service Restoration ==="

# 1. Check system status
kubectl get pods -o wide
kubectl get services

# 2. Restart services
kubectl rollout restart deployment/claude-flow-novice
kubectl rollout restart deployment/postgres
kubectl rollout restart deployment/redis

# 3. Verify health
kubectl wait --for=condition=ready pod -l app=claude-flow-novice --timeout=300s
curl -f http://app-url/health

# 4. Scale to desired capacity
kubectl scale deployment claude-flow-novice --replicas=3
```

#### Data Recovery
```bash
#!/bin/bash
# Emergency data recovery
echo "=== Emergency Data Recovery ==="

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

# Stop application
kubectl scale deployment claude-flow-novice --replicas=0

# Restore database
gunzip -c $BACKUP_FILE | docker-compose exec -T postgres psql -U claudeflow -d claudeflow

# Restart application
kubectl scale deployment claude-flow-novice --replicas=3

# Verify restoration
kubectl wait --for=condition=ready pod -l app=claude-flow-novice --timeout=300s
curl -f http://app-url/health
```

---

This operations guide should be regularly updated as the system evolves and new operational procedures are established.