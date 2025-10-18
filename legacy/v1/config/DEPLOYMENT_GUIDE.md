# Production Deployment Guide - Claude Flow Novice

## Overview

This guide covers deployment configurations for Claude Flow Novice across development, staging, and production environments with support for 10 to 500 concurrent agents.

## Environment Scenarios

| Environment | Max Agents | Shards | Memory | Log Level | Alerting | Use Case |
|-------------|------------|--------|---------|-----------|----------|----------|
| **Development** | 10 | 4 | 2GB | debug | disabled | Local testing, debugging |
| **Staging** | 100 | 16 | 10GB | info | enabled | Pre-production validation, chaos testing |
| **Production** | 500 | 32 | 50GB | warn | enabled | Production workloads, high-scale coordination |

---

## Docker Deployment

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2+
- 2GB RAM (development) / 10GB RAM (staging) / 50GB RAM (production)

### Development Environment

```bash
# 1. Copy environment file
cp config/docker/env.development .env

# 2. Start services
docker-compose -f docker-compose.dev.yml up -d

# 3. Verify deployment
docker-compose -f docker-compose.dev.yml ps
docker logs cfn-coordinator-dev

# 4. Test coordination
curl http://localhost:3000/health
```

### Staging Environment

```bash
# 1. Copy and configure environment
cp config/docker/env.staging .env

# 2. Generate auth token
export CFN_AGENT_AUTH_TOKEN=$(openssl rand -base64 32)
echo "CFN_AGENT_AUTH_TOKEN=${CFN_AGENT_AUTH_TOKEN}" >> .env

# 3. Start with tmpfs volume for performance
docker-compose -f docker-compose.staging.yml up -d

# 4. Enable chaos engineering
# Chaos mode is enabled by default in staging (5% failure rate)

# 5. Monitor metrics
docker logs -f cfn-coordinator-staging
```

### Production Environment

```bash
# 1. Copy production environment
cp config/docker/env.production .env

# 2. Configure secrets (DO NOT use .env for production secrets)
# Use Docker secrets or external secret management
docker secret create cfn_auth_token /path/to/token.txt
docker secret create cfn_db_password /path/to/db_password.txt

# 3. Configure TLS certificates
docker secret create cfn_tls_cert /path/to/cert.pem
docker secret create cfn_tls_key /path/to/key.pem

# 4. Start services with secrets
docker stack deploy -c docker-compose.production.yml cfn

# 5. Verify health
curl --cacert /path/to/ca.pem https://your-domain.com/health

# 6. Monitor logs (minimal in production)
docker service logs cfn_coordinator
```

**Production Docker Compose Example:**

```yaml
version: '3.8'
services:
  coordinator:
    image: claude-flow-novice:latest
    secrets:
      - cfn_auth_token
      - cfn_db_password
      - cfn_tls_cert
      - cfn_tls_key
    environment:
      CFN_AGENT_AUTH_TOKEN_FILE: /run/secrets/cfn_auth_token
      CFN_DB_PASSWORD_FILE: /run/secrets/cfn_db_password
      CFN_TLS_CERT_PATH: /run/secrets/cfn_tls_cert
      CFN_TLS_KEY_PATH: /run/secrets/cfn_tls_key
    env_file:
      - config/docker/env.production
    tmpfs:
      - /dev/shm:size=50g
    deploy:
      resources:
        limits:
          memory: 51200M
        reservations:
          memory: 25600M

secrets:
  cfn_auth_token:
    external: true
  cfn_db_password:
    external: true
  cfn_tls_cert:
    external: true
  cfn_tls_key:
    external: true
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes 1.24+
- kubectl configured
- Namespace created: `kubectl create namespace claude-flow-novice`
- Storage class with tmpfs support (production)

### Development Deployment

```bash
# 1. Apply ConfigMap
kubectl apply -f config/k8s/configmap-development.yaml

# 2. Create deployment
kubectl apply -f k8s/deployment-development.yaml

# 3. Expose service
kubectl apply -f k8s/service-development.yaml

# 4. Verify deployment
kubectl get pods -n claude-flow-novice
kubectl logs -f deployment/cfn-coordinator-dev -n claude-flow-novice

# 5. Port-forward for testing
kubectl port-forward -n claude-flow-novice svc/cfn-coordinator-dev 3000:3000
curl http://localhost:3000/health
```

**Development Deployment YAML Example:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-coordinator-dev
  namespace: claude-flow-novice
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cfn-coordinator
      environment: development
  template:
    metadata:
      labels:
        app: cfn-coordinator
        environment: development
    spec:
      containers:
      - name: coordinator
        image: claude-flow-novice:latest
        envFrom:
        - configMapRef:
            name: cfn-coordination-config-dev
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        volumeMounts:
        - name: tmp
          mountPath: /tmp/cfn
      volumes:
      - name: tmp
        emptyDir: {}
```

### Staging Deployment

```bash
# 1. Create secrets
kubectl create secret generic cfn-coordination-secrets-staging \
  --from-literal=CFN_AGENT_AUTH_TOKEN="$(openssl rand -base64 32)" \
  --from-literal=CFN_DB_PASSWORD="your-staging-password" \
  -n claude-flow-novice

# 2. Apply ConfigMap
kubectl apply -f config/k8s/configmap-staging.yaml

# 3. Deploy application
kubectl apply -f k8s/deployment-staging.yaml

# 4. Create service and ingress
kubectl apply -f k8s/service-staging.yaml
kubectl apply -f k8s/ingress-staging.yaml

# 5. Monitor deployment
kubectl rollout status deployment/cfn-coordinator-staging -n claude-flow-novice
kubectl logs -f deployment/cfn-coordinator-staging -n claude-flow-novice
```

**Staging Deployment with Chaos Engineering:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-coordinator-staging
  namespace: claude-flow-novice
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cfn-coordinator
      environment: staging
  template:
    metadata:
      labels:
        app: cfn-coordinator
        environment: staging
    spec:
      containers:
      - name: coordinator
        image: claude-flow-novice:latest
        envFrom:
        - configMapRef:
            name: cfn-coordination-config-staging
        env:
        - name: CFN_AGENT_AUTH_TOKEN
          valueFrom:
            secretKeyRef:
              name: cfn-coordination-secrets-staging
              key: CFN_AGENT_AUTH_TOKEN
        - name: CFN_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: cfn-coordination-secrets-staging
              key: CFN_DB_PASSWORD
        resources:
          requests:
            memory: "5Gi"
            cpu: "2000m"
          limits:
            memory: "10Gi"
            cpu: "4000m"
        volumeMounts:
        - name: shm
          mountPath: /dev/shm
      volumes:
      - name: shm
        emptyDir:
          medium: Memory
          sizeLimit: 10Gi
```

### Production Deployment

```bash
# 1. Use external secret management (recommended)
# Option A: AWS Secrets Manager + External Secrets Operator
kubectl apply -f k8s/external-secret-prod.yaml

# Option B: Manual secret creation (not recommended for production)
kubectl create secret generic cfn-coordination-secrets-prod \
  --from-literal=CFN_AGENT_AUTH_TOKEN="$(openssl rand -base64 32)" \
  --from-literal=CFN_DB_HOST="postgres.prod.internal" \
  --from-literal=CFN_DB_PASSWORD="your-production-password" \
  -n claude-flow-novice

# 2. Create TLS secret for secure communication
kubectl create secret tls cfn-tls-cert \
  --cert=/path/to/cert.pem \
  --key=/path/to/key.pem \
  -n claude-flow-novice

# 3. Apply ConfigMap
kubectl apply -f config/k8s/configmap-production.yaml

# 4. Deploy with high availability
kubectl apply -f k8s/deployment-production.yaml

# 5. Create service and ingress with TLS
kubectl apply -f k8s/service-production.yaml
kubectl apply -f k8s/ingress-production.yaml

# 6. Monitor rollout
kubectl rollout status deployment/cfn-coordinator-prod -n claude-flow-novice

# 7. Verify health through ingress
curl https://cfn.your-domain.com/health
```

**Production Deployment with HA and tmpfs:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-coordinator-prod
  namespace: claude-flow-novice
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: cfn-coordinator
      environment: production
  template:
    metadata:
      labels:
        app: cfn-coordinator
        environment: production
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: cfn-coordinator
            topologyKey: kubernetes.io/hostname
      containers:
      - name: coordinator
        image: claude-flow-novice:1.6.5
        envFrom:
        - configMapRef:
            name: cfn-coordination-config-prod
        env:
        - name: CFN_AGENT_AUTH_TOKEN
          valueFrom:
            secretKeyRef:
              name: cfn-coordination-secrets-prod
              key: CFN_AGENT_AUTH_TOKEN
        - name: CFN_DB_HOST
          valueFrom:
            secretKeyRef:
              name: cfn-coordination-secrets-prod
              key: CFN_DB_HOST
        - name: CFN_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: cfn-coordination-secrets-prod
              key: CFN_DB_PASSWORD
        - name: CFN_TRACING_ENDPOINT
          valueFrom:
            secretKeyRef:
              name: cfn-coordination-secrets-prod
              key: CFN_TRACING_ENDPOINT
        resources:
          requests:
            memory: "25Gi"
            cpu: "8000m"
          limits:
            memory: "51Gi"
            cpu: "16000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
            scheme: HTTPS
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
            scheme: HTTPS
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        volumeMounts:
        - name: shm
          mountPath: /dev/shm
        - name: tls-certs
          mountPath: /etc/cfn/certs
          readOnly: true
      volumes:
      - name: shm
        emptyDir:
          medium: Memory
          sizeLimit: 50Gi
      - name: tls-certs
        secret:
          secretName: cfn-tls-cert
```

---

## Configuration Management

### Environment Variables Reference

Comprehensive list available in `/config/.env.example`

**Critical Production Settings:**

- `CFN_BASE_DIR=/dev/shm/cfn` - REQUIRED for production (tmpfs for speed)
- `CFN_ENABLE_AGENT_AUTH=true` - REQUIRED for security
- `CFN_ENABLE_TLS=true` - REQUIRED for secure communication
- `CFN_LOG_LEVEL=warn` - Minimize logging overhead
- `CFN_CONSENSUS_THRESHOLD=0.95` - Higher threshold for production
- `CFN_ALERT_COORD_TIME_MS=8000` - Alert on slow coordination

### Secret Management

**Development:**
- `.env` file (acceptable for local development)

**Staging:**
- Kubernetes Secrets
- Docker Secrets
- Environment-specific tokens

**Production (choose one):**
- AWS Secrets Manager + External Secrets Operator
- Azure Key Vault + Secrets Store CSI Driver
- HashiCorp Vault + Vault Agent Injector
- Google Secret Manager + Workload Identity

**Secret Rotation Schedule:**
- Development: No rotation required
- Staging: Every 90 days
- Production: Every 30 days

---

## Monitoring and Observability

### Health Checks

```bash
# Basic health
curl http://localhost:3000/health

# Detailed status
curl http://localhost:3000/status

# Metrics endpoint (if enabled)
curl http://localhost:3000/metrics
```

### Key Metrics to Monitor

1. **Coordination Time**: `CFN_ALERT_COORD_TIME_MS` threshold
2. **Memory Usage**: Alert at 80% of `CFN_TOTAL_MEMORY_LIMIT_MB`
3. **Agent Failures**: Alert after 3 consecutive failures
4. **Consensus Success Rate**: Alert below 70%

### Logging

**Development:**
- Log Level: `debug`
- Verbose logging enabled
- All agent lifecycle events tracked

**Staging:**
- Log Level: `info`
- Chaos engineering events logged
- Performance metrics collected

**Production:**
- Log Level: `warn`
- Minimal logging to reduce overhead
- Critical errors and alerts only
- Structured logging with correlation IDs

### Distributed Tracing (Production)

```yaml
# Enable in production ConfigMap
CFN_TRACING_ENABLED: "true"
CFN_TRACING_ENDPOINT: "http://jaeger-collector:9411"
CFN_TRACING_SERVICE_NAME: "claude-flow-novice"
```

**Supported Backends:**
- Jaeger
- Zipkin
- OpenTelemetry Collector

---

## Performance Tuning

### Development (10 agents)
- **Shards**: 4
- **Concurrent Operations**: 10
- **Cache TTL**: 300s
- **Memory**: 2GB

### Staging (100 agents)
- **Shards**: 16
- **Concurrent Operations**: 50
- **Cache TTL**: 300s
- **Memory**: 10GB
- **Chaos**: 5% failure rate

### Production (500 agents)
- **Shards**: 32
- **Concurrent Operations**: 100
- **Cache TTL**: 600s
- **Memory**: 50GB
- **tmpfs**: REQUIRED (`/dev/shm`)

### Scaling Guidelines

**Horizontal Scaling (Kubernetes):**
```bash
# Scale replicas
kubectl scale deployment cfn-coordinator-prod --replicas=5 -n claude-flow-novice

# Auto-scaling
kubectl autoscale deployment cfn-coordinator-prod \
  --min=3 --max=10 \
  --cpu-percent=70 \
  -n claude-flow-novice
```

**Vertical Scaling:**
- Increase `CFN_MAX_AGENTS` in increments of 100
- Increase `CFN_SHARD_COUNT` proportionally (agents / 15)
- Increase `CFN_TOTAL_MEMORY_LIMIT_MB` (100MB per agent minimum)

---

## Security Best Practices

### Authentication
- ✅ Enable `CFN_ENABLE_AGENT_AUTH=true` in staging/production
- ✅ Use strong tokens: `openssl rand -base64 32`
- ✅ Rotate tokens every 30 days (production)

### TLS/Encryption
- ✅ Enable `CFN_ENABLE_TLS=true` in production
- ✅ Use valid certificates (Let's Encrypt or corporate CA)
- ✅ Enforce HTTPS at ingress/load balancer

### Network Security
- ✅ Enable rate limiting: `CFN_ENABLE_RATE_LIMITING=true`
- ✅ Use Kubernetes NetworkPolicies to restrict pod communication
- ✅ Deploy in private subnets with NAT gateway

### Secret Management
- ❌ NEVER commit secrets to git
- ❌ NEVER use `.env` files in production
- ✅ Use external secret management systems
- ✅ Use Kubernetes RBAC to restrict secret access
- ✅ Enable audit logging for secret access

---

## Disaster Recovery

### Backup Strategy

**Metrics Database:**
```bash
# SQLite (Staging)
kubectl exec -n claude-flow-novice cfn-coordinator-staging-xxx -- \
  sqlite3 /var/lib/cfn/metrics.db .dump > backup-$(date +%Y%m%d).sql

# PostgreSQL (Production)
pg_dump -h $CFN_DB_HOST -U $CFN_DB_USER cfn_metrics > backup-$(date +%Y%m%d).sql
```

**Configuration:**
- Store ConfigMaps and Secrets in version control (encrypted)
- Use GitOps (ArgoCD, FluxCD) for infrastructure as code

### Recovery Procedures

**Pod Failure:**
- Kubernetes automatically restarts failed pods
- Verify with: `kubectl get pods -n claude-flow-novice`

**Node Failure:**
- Pod anti-affinity ensures distribution across nodes
- Kubernetes reschedules pods to healthy nodes

**Cluster Failure:**
- Maintain multi-region deployment
- Use disaster recovery cluster in different region
- RPO: 1 hour, RTO: 15 minutes

---

## Troubleshooting

### Common Issues

**1. High Coordination Time**
```bash
# Check current coordination time
kubectl logs -n claude-flow-novice deployment/cfn-coordinator-prod | grep "coordination_time"

# Solution: Increase shards or reduce agent count
kubectl edit configmap cfn-coordination-config-prod -n claude-flow-novice
# Increase CFN_SHARD_COUNT
```

**2. Memory Exhaustion**
```bash
# Check memory usage
kubectl top pods -n claude-flow-novice

# Solution: Increase memory limits or reduce agents
kubectl edit deployment cfn-coordinator-prod -n claude-flow-novice
```

**3. Consensus Failures**
```bash
# Check consensus rate
kubectl logs -n claude-flow-novice deployment/cfn-coordinator-prod | grep "consensus"

# Solution: Investigate network latency, increase timeout
# Edit CFN_CONSENSUS_TIMEOUT_MS in ConfigMap
```

**4. Agent Authentication Failures**
```bash
# Verify secret exists
kubectl get secret cfn-coordination-secrets-prod -n claude-flow-novice

# Verify token is mounted
kubectl exec -n claude-flow-novice cfn-coordinator-prod-xxx -- env | grep CFN_AGENT_AUTH_TOKEN
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Environment configuration reviewed and tested
- [ ] Secrets generated and stored securely
- [ ] TLS certificates valid and not expiring soon
- [ ] Resource limits appropriate for agent count
- [ ] Monitoring and alerting configured
- [ ] Backup procedures tested

### Deployment
- [ ] Apply ConfigMaps
- [ ] Create Secrets (use external secret management in production)
- [ ] Deploy application
- [ ] Verify health endpoints
- [ ] Test coordination with sample agents
- [ ] Monitor logs for errors

### Post-Deployment
- [ ] Verify all pods running: `kubectl get pods -n claude-flow-novice`
- [ ] Check resource usage: `kubectl top pods -n claude-flow-novice`
- [ ] Test health endpoints from external network
- [ ] Verify metrics collection
- [ ] Confirm alerting triggers
- [ ] Document deployment in runbook

---

## Support and Resources

- GitHub: https://github.com/your-org/claude-flow-novice
- Documentation: /docs
- Configuration Examples: /config
- Monitoring Dashboards: /monitor/dashboard

For production support, contact: devops@your-org.com
