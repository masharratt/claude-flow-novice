# Corporate Infrastructure Integration with trigger.dev CFN Loop

**Status**: Implementation Guide | **Last Updated**: 2025-11-21

Enterprise deployment patterns for CFN Loop orchestration within corporate infrastructure, including Kubernetes, security controls, monitoring, and disaster recovery.

---

## 1. Overview

CFN Loop runs as a containerized orchestrator within corporate VPCs, coordinating agent workloads across Kubernetes clusters with enterprise-grade security, monitoring, and compliance controls.

**Key Requirements:**
- Multi-region deployment with HA
- VPC isolation with egress controls
- SSO/SAML authentication enforcement
- Comprehensive audit logging
- Disaster recovery with <4hr RTO

---

## 2. Authentication & Authorization

### SSO Integration (SAML 2.0 / OIDC)

```yaml
# .env.corporate
CFN_AUTH_TYPE=oidc
CFN_OIDC_PROVIDER=https://sso.corp.com/oauth2/v1
CFN_OIDC_CLIENT_ID=[REDACTED]
CFN_OIDC_CLIENT_SECRET=[REDACTED]
CFN_OIDC_REDIRECT_URI=https://cfn.corp.com/auth/callback

# SAML Alternative
CFN_SAML_IDPURL=https://sso.corp.com/saml/metadata
CFN_SAML_CERTPATH=/secrets/saml-cert.pem
```

### RBAC Configuration

```yaml
# kubernetes/rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: cfn-system
  name: cfn-orchestrator
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["create", "delete", "get", "list"]
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: cfn-system
  name: cfn-orchestrator-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cfn-orchestrator
subjects:
- kind: ServiceAccount
  name: cfn-orchestrator
  namespace: cfn-system
```

### API Key Management

```bash
# Rotate API keys every 90 days
CFN_API_KEY_ROTATION_DAYS=90

# Store in corporate vault
vault kv put secret/cfn/api-key \
  key="$(openssl rand -base64 32)" \
  rotated_at="$(date -Iseconds)" \
  rotated_by="$USER"

# Retrieve in pod via secret
kubectl create secret generic cfn-api-key \
  --from-literal=key="$(vault kv get -field=key secret/cfn/api-key)"
```

---

## 3. Network Architecture

### VPC & Subnet Design

```
┌─────────────────────────────────────────────────────┐
│  Corporate VPC (10.0.0.0/16)                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────┐      ┌──────────────────┐    │
│  │ Public Subnet    │      │ Private Subnet   │    │
│  │ (10.0.1.0/24)    │      │ (10.0.2.0/24)    │    │
│  ├──────────────────┤      ├──────────────────┤    │
│  │ NAT Gateway      │      │ CFN Orchestrator │    │
│  │ ALB              │  ──► │ Agent Pods       │    │
│  │ Bastion          │      │ Redis Cache      │    │
│  │                  │      │ Postgres DB      │    │
│  └──────────────────┘      └──────────────────┘    │
│        │                           ▲                │
│        │ Internet Gateway          │ VPC Endpoints │
│        └─────────────┬─────────────┘                │
│                      │                              │
│                  AWS Services                       │
│          (ECR, S3, CloudWatch)                      │
└─────────────────────────────────────────────────────┘
```

### Security Group Rules

```hcl
# terraform/security-groups.tf
resource "aws_security_group" "cfn_orchestrator" {
  name        = "cfn-orchestrator-sg"
  description = "CFN Orchestrator security group"
  vpc_id      = aws_vpc.corporate.id

  # Ingress from ALB
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Egress to private subnet only
  egress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["10.0.2.0/24"]
  }

  egress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.vpc_endpoints.id]
  }
}

resource "aws_lb" "cfn" {
  name               = "cfn-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = [aws_subnet.public.id]

  enable_deletion_protection = true
  enable_http2              = true
  enable_cross_zone_load_balancing = true
}
```

---

## 4. Kubernetes Deployment

### Helm Chart Structure

```yaml
# helm/cfn-loop/values.yaml
image:
  repository: 012345678901.dkr.ecr.us-east-1.amazonaws.com/cfn-orchestrator
  tag: "1.2.3"
  pullPolicy: IfNotPresent

replicaCount: 3

resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

# ServiceAccount with IAM role binding
serviceAccount:
  create: true
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::012345678901:role/cfn-orchestrator
  name: cfn-orchestrator

# Pod security policy
podSecurityPolicy:
  enabled: true
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 1000

# Network policies
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress

env:
  - name: CFN_ENVIRONMENT
    value: "production"
  - name: CFN_LOG_LEVEL
    value: "info"
  - name: CFN_AUTH_TYPE
    value: "oidc"

secrets:
  - name: CFN_OIDC_CLIENT_SECRET
    valueFrom:
      secretKeyRef:
        name: cfn-oidc
        key: client-secret
  - name: CFN_DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: cfn-postgres
        key: connection-string
```

### Deployment Manifest

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-orchestrator
  namespace: cfn-system
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1

  selector:
    matchLabels:
      app: cfn-orchestrator

  template:
    metadata:
      labels:
        app: cfn-orchestrator
        version: "1.2.3"
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"

    spec:
      serviceAccountName: cfn-orchestrator
      securityContext:
        fsGroup: 1000
        runAsNonRoot: true

      containers:
      - name: orchestrator
        image: cfn-orchestrator:1.2.3
        imagePullPolicy: IfNotPresent

        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
              - ALL

        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        - name: metrics
          containerPort: 9090
          protocol: TCP

        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi

        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10

        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/cache

        env:
        - name: CFN_REDIS_URL
          valueFrom:
            secretKeyRef:
              name: cfn-redis
              key: connection-url
        - name: CFN_DB_HOST
          value: "postgres.cfn-system.svc.cluster.local"

      volumes:
      - name: tmp
        emptyDir: {}
      - name: cache
        emptyDir: {}

      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - cfn-orchestrator
              topologyKey: kubernetes.io/hostname
```

### Ingress Configuration

```yaml
# kubernetes/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cfn-ingress
  namespace: cfn-system
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - cfn.corp.com
    secretName: cfn-tls-cert

  rules:
  - host: cfn.corp.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: cfn-orchestrator
            port:
              number: 3000
```

---

## 5. Monitoring Integration

### Prometheus Metrics

```yaml
# kubernetes/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cfn-orchestrator
  namespace: cfn-system

spec:
  selector:
    matchLabels:
      app: cfn-orchestrator

  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

### Key Metrics to Export

```go
// Expose these metrics from CFN Orchestrator
prometheus.Counter("cfn_loop_executions_total", "CFN Loop executions")
prometheus.Histogram("cfn_loop_duration_seconds", "Loop execution duration", []float64{1, 5, 10, 30})
prometheus.Gauge("cfn_active_agents", "Number of active agent processes")
prometheus.Histogram("cfn_agent_spawn_latency_ms", "Agent spawn latency")
prometheus.Counter("cfn_coordination_failures_total", "Redis coordination failures")
prometheus.Gauge("cfn_redis_connections", "Active Redis connections")
```

### Datadog Integration

```yaml
# kubernetes/datadog-agent.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: datadog-agent-config
  namespace: cfn-system

data:
  prometheus.yaml: |
    init_config:
    instances:
      - prometheus_url: http://cfn-orchestrator:9090
        namespace: cfn
        metrics:
          - cfn_loop_*
          - cfn_active_agents
          - cfn_agent_spawn_latency_ms
        tags:
          - env:production
          - service:cfn-loop
```

### Alert Thresholds

```yaml
# monitoring/alert-rules.yaml
groups:
- name: cfn-alerts
  rules:
  - alert: CFNLoopFailureRate
    expr: |
      rate(cfn_loop_executions_total{status="failed"}[5m]) > 0.05
    for: 5m
    annotations:
      summary: "High CFN Loop failure rate ({{ $value | humanizePercentage }})"

  - alert: CFNAgentSpawnLatency
    expr: |
      histogram_quantile(0.95, cfn_agent_spawn_latency_ms) > 5000
    for: 10m
    annotations:
      summary: "P95 agent spawn latency > 5s"

  - alert: RedisConnectivityIssues
    expr: |
      increase(cfn_coordination_failures_total[5m]) > 10
    for: 2m
    annotations:
      summary: "Redis coordination failures detected"
```

---

## 6. CI/CD Integration

### GitHub Actions Deployment

```yaml
# .github/workflows/deploy-corporate.yaml
name: Deploy to Corporate Infrastructure

on:
  push:
    branches:
      - main
      - develop
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
    - uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-deploy
        aws-region: us-east-1

    - name: Login to Amazon ECR
      run: |
        aws ecr get-login-password | docker login --username AWS --password-stdin \
          ${{ secrets.ECR_REGISTRY }}

    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: |
          ${{ secrets.ECR_REGISTRY }}/cfn-orchestrator:latest
          ${{ secrets.ECR_REGISTRY }}/cfn-orchestrator:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'staging' }}

    steps:
    - uses: actions/checkout@v4

    - name: Configure kubeconfig
      run: |
        aws eks update-kubeconfig --name cfn-eks-cluster --region us-east-1

    - name: Deploy via Helm
      run: |
        helm upgrade --install cfn-loop ./helm/cfn-loop \
          --namespace cfn-system \
          --values helm/values-${{ github.event.inputs.environment || 'staging' }}.yaml \
          --set image.tag=${{ github.sha }} \
          --wait \
          --timeout 5m

    - name: Run smoke tests
      run: |
        kubectl rollout status deployment/cfn-orchestrator -n cfn-system --timeout=5m

        # Verify orchestrator is responsive
        kubectl run -n cfn-system smoke-test --rm -i --image=curlimages/curl --restart=Never -- \
          curl -f http://cfn-orchestrator:3000/health

    - name: Notify deployment
      if: success()
      run: |
        curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
          -H 'Content-Type: application/json' \
          -d '{"text":"CFN Loop deployed to ${{ github.event.inputs.environment || "staging" }} ✓"}'
```

### GitLab CI/CD Pipeline

```yaml
# .gitlab-ci.yml
stages:
  - build
  - deploy
  - validate

variables:
  ECR_REGISTRY: 012345678901.dkr.ecr.us-east-1.amazonaws.com
  IMAGE_NAME: cfn-orchestrator

build:image:
  stage: build
  image: docker:24-dind
  services:
    - docker:24-dind

  script:
    - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
    - docker build -f docker/Dockerfile.orchestrator -t $ECR_REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHA .
    - docker push $ECR_REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHA
    - docker tag $ECR_REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHA $ECR_REGISTRY/$IMAGE_NAME:latest
    - docker push $ECR_REGISTRY/$IMAGE_NAME:latest

deploy:staging:
  stage: deploy
  image: alpine/helm:latest
  environment:
    name: staging
    kubernetes_namespace: cfn-system

  script:
    - helm repo add cfn-loop ./helm
    - helm upgrade --install cfn-loop cfn-loop/cfn-loop
        --namespace cfn-system
        --values helm/values-staging.yaml
        --set image.tag=$CI_COMMIT_SHA
        --wait

deploy:production:
  stage: deploy
  image: alpine/helm:latest
  environment:
    name: production
    kubernetes_namespace: cfn-system
  when: manual

  script:
    - helm upgrade --install cfn-loop cfn-loop/cfn-loop
        --namespace cfn-system
        --values helm/values-production.yaml
        --set image.tag=$CI_COMMIT_SHA
        --wait

smoke_tests:
  stage: validate
  script:
    - kubectl rollout status deployment/cfn-orchestrator -n cfn-system --timeout=5m
    - |
      STATUS=$(kubectl run -n cfn-system smoke-test --rm -i --image=curlimages/curl \
        --restart=Never -- curl -s http://cfn-orchestrator:3000/health)
      [[ "$STATUS" == "ok" ]] || exit 1
```

### Deployment Gates

```bash
# scripts/pre-deployment-checks.sh
#!/bin/bash
set -euo pipefail

echo "Running pre-deployment checks..."

# 1. Test pass rate
PASS_RATE=$(npm test 2>&1 | grep -oP 'Pass rate: \K[0-9.]+' || echo "0")
if (( $(echo "$PASS_RATE < 0.95" | bc -l) )); then
  echo "FAIL: Test pass rate $PASS_RATE < 95%"
  exit 1
fi

# 2. Security scanning
echo "Running security scan..."
trivy image --exit-code 1 --severity HIGH,CRITICAL \
  $ECR_REGISTRY/$IMAGE_NAME:$COMMIT_SHA

# 3. Image vulnerability check
echo "Checking image vulnerabilities..."
aws ecr describe-image-scan-findings \
  --repository-name cfn-orchestrator \
  --image-id imageTag=$COMMIT_SHA \
  --query 'imageScanFindings.findingSeverityCounts.CRITICAL' \
  | grep -q '0' || exit 1

# 4. Helm lint
helm lint ./helm/cfn-loop

echo "All pre-deployment checks passed ✓"
```

---

## 7. Disaster Recovery

### Backup Strategy

```bash
# scripts/backup-cfn-infrastructure.sh
#!/bin/bash
set -euo pipefail

BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
S3_BACKUP_PATH="s3://cfn-backups-prod/daily/$BACKUP_DATE"

echo "Starting infrastructure backup..."

# 1. Export Kubernetes state
kubectl get all -A -o yaml | \
  aws s3 cp - "$S3_BACKUP_PATH/k8s-state.yaml"

# 2. Database backup (Postgres)
pg_dump -h postgres.cfn-system.svc.cluster.local \
  -U postgres cfn_loop | \
  gzip | \
  aws s3 cp - "$S3_BACKUP_PATH/database.sql.gz"

# 3. Redis snapshot
redis-cli -h redis.cfn-system.svc.cluster.local \
  BGSAVE
sleep 5
kubectl cp cfn-system/redis-0:/data/dump.rdb \
  /tmp/redis-dump.rdb
aws s3 cp /tmp/redis-dump.rdb "$S3_BACKUP_PATH/redis-dump.rdb"

# 4. Helm release state
helm get values cfn-loop -n cfn-system | \
  aws s3 cp - "$S3_BACKUP_PATH/helm-values.yaml"

# 5. Encrypt and verify
aws s3api put-object-acl --bucket cfn-backups-prod \
  --key "daily/$BACKUP_DATE/*" --acl private
aws s3api put-bucket-encryption --bucket cfn-backups-prod \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

echo "Backup complete: $S3_BACKUP_PATH"
```

### RTO/RPO Targets

| Component | RTO | RPO | Strategy |
|-----------|-----|-----|----------|
| Orchestrator | 15 min | 5 min | EKS multi-AZ, automated backup |
| Database | 30 min | 1 min | RDS automated backups + continuous replication |
| Redis | 10 min | < 1 min | AOF persistence + replication |
| Secrets | 5 min | 0 min | AWS Secrets Manager (replication) |

### Recovery Procedures

```bash
# scripts/restore-cfn-infrastructure.sh
#!/bin/bash
set -euo pipefail

RESTORE_DATE=$1  # e.g., 20251121-100000
S3_RESTORE_PATH="s3://cfn-backups-prod/daily/$RESTORE_DATE"

echo "Restoring infrastructure from $RESTORE_DATE..."

# 1. Restore Kubernetes manifests
aws s3 cp "$S3_RESTORE_PATH/k8s-state.yaml" - | \
  kubectl apply -f -

# 2. Restore database
aws s3 cp "$S3_RESTORE_PATH/database.sql.gz" - | \
  gunzip | \
  psql -h postgres.cfn-system.svc.cluster.local -U postgres cfn_loop

# 3. Restore Redis
aws s3 cp "$S3_RESTORE_PATH/redis-dump.rdb" /tmp/redis-dump.rdb
kubectl cp /tmp/redis-dump.rdb cfn-system/redis-0:/data/dump.rdb
kubectl exec -n cfn-system redis-0 -- redis-cli SHUTDOWN
kubectl delete pod -n cfn-system redis-0  # StatefulSet will respawn

# 4. Verify restoration
echo "Waiting for services to stabilize..."
kubectl rollout status deployment/cfn-orchestrator -n cfn-system --timeout=10m
sleep 30

# 5. Smoke test
curl -f http://cfn-orchestrator.cfn-system.svc.cluster.local:3000/health || exit 1

echo "Infrastructure restored successfully"
```

---

## References

- [AWS VPC Architecture](https://docs.aws.amazon.com/vpc/)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [Helm Best Practices](https://helm.sh/docs/chart_best_practices/)
- [Prometheus Monitoring](https://prometheus.io/docs/introduction/overview/)
- [CFN Loop Architecture](../CFN_LOOP_ARCHITECTURE.md)
