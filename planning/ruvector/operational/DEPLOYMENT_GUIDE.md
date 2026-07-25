# CFN Loop Production Deployment Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-29
**Target Audience**: DevOps Engineers, SREs

**Purpose**: Step-by-step guide for deploying CFN Loop to production environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Configuration](#configuration)
4. [Database Setup](#database-setup)
5. [RuVector Deployment](#ruvector-deployment)
6. [Coordinator Deployment](#coordinator-deployment)
7. [Verification](#verification)
8. [Post-Deployment](#post-deployment)
9. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Tools

- `kubectl` v1.28+ (Kubernetes CLI)
- `helm` v3.12+ (Package manager)
- `terraform` v1.5+ (Infrastructure as Code)
- `aws-cli` v2.13+ (or equivalent cloud provider CLI)
- `psql` v14+ (PostgreSQL client)
- `curl` (API testing)
- `jq` (JSON processing)

### Required Access

- [ ] Kubernetes cluster admin access
- [ ] Cloud provider console access (AWS/GCP/Azure)
- [ ] Docker registry push access
- [ ] Secrets management access (Vault, Secrets Manager)
- [ ] DNS management access
- [ ] Monitoring system access (Grafana, Datadog)

### Required Credentials

- [ ] Cerebras API key (decomposers)
- [ ] Anthropic API key (fallback provider)
- [ ] Trigger.dev API key (secret key: `tr_prod_*`)
- [ ] RuVector admin token
- [ ] PostgreSQL admin password
- [ ] Redis password
- [ ] Docker registry credentials

---

## Infrastructure Setup

### Step 1: Provision Kubernetes Cluster (60 minutes)

**Using Terraform (AWS EKS example)**:

```bash
cd terraform/kubernetes-cluster/

# Review configuration
cat terraform.tfvars
# Expected:
#   cluster_name = "cfn-prod"
#   region = "us-east-1"
#   node_instance_type = "m5.xlarge"
#   node_count = 5

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -out=cluster.plan

# Review plan output
# Expected: 30-40 resources (VPC, subnets, EKS cluster, node groups, IAM roles)

# Apply configuration
terraform apply cluster.plan

# Wait for completion (~45 minutes)
# Expected output:
#   cluster_endpoint = "https://xxx.eks.amazonaws.com"
#   cluster_name = "cfn-prod"
#   kubeconfig_command = "aws eks update-kubeconfig ..."

# Configure kubectl
aws eks update-kubeconfig --name cfn-prod --region us-east-1

# Verify cluster
kubectl get nodes
# Expected: 5 nodes Ready
```

**Cluster Specifications**:
- 5 nodes × m5.xlarge (4 vCPU, 16GB RAM each)
- 100GB gp3 EBS volumes per node
- Auto-scaling enabled (5-15 nodes)
- Multi-AZ deployment for high availability

### Step 2: Setup Persistent Storage (15 minutes)

**Create Storage Classes**:

```bash
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: postgres-storage
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "5000"
  throughput: "250"
  fsType: ext4
allowVolumeExpansion: true
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
EOF
```

**Create Persistent Volumes**:

```bash
kubectl apply -f k8s/pv-postgres.yaml
kubectl apply -f k8s/pv-ruvector.yaml

# Verify volumes
kubectl get pv
# Expected:
#   pv-postgres   100Gi  Retain  Available  postgres-storage
#   pv-ruvector   50Gi   Retain  Available  fast-ssd
```

### Step 3: Setup Networking (10 minutes)

**Create Namespaces**:

```bash
kubectl create namespace production
kubectl create namespace monitoring
kubectl label namespace production env=production
```

**Setup Ingress Controller** (NGINX example):

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace production \
  --set controller.replicaCount=2 \
  --set controller.service.type=LoadBalancer \
  --set controller.metrics.enabled=true

# Wait for external IP
kubectl get svc -n production ingress-nginx-controller -w

# Get external IP (for DNS configuration)
EXTERNAL_IP=$(kubectl get svc -n production ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Ingress external IP: $EXTERNAL_IP"
```

**Configure DNS**:

```bash
# Create A record pointing to ingress IP
# Domain: cfn.example.com → $EXTERNAL_IP
# Use your DNS provider's CLI or console

# Verify DNS propagation
dig cfn.example.com +short
# Expected: $EXTERNAL_IP
```

---

## Configuration

### Step 4: Create Secrets (10 minutes)

**Create Kubernetes Secrets**:

```bash
# Cerebras API key
kubectl create secret generic cerebras-api-key \
  --from-literal=api-key="$CEREBRAS_API_KEY" \
  --namespace production

# Anthropic API key
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key="$ANTHROPIC_API_KEY" \
  --namespace production

# Trigger.dev API key (SECRET KEY, not PAT!)
kubectl create secret generic trigger-api-key \
  --from-literal=secret-key="$TRIGGER_SECRET_KEY" \
  --namespace production

# PostgreSQL credentials
kubectl create secret generic postgres-credentials \
  --from-literal=username=postgres \
  --from-literal=password="$POSTGRES_PASSWORD" \
  --from-literal=url="postgresql://postgres:$POSTGRES_PASSWORD@postgres:5432/main" \
  --namespace production

# Redis password
kubectl create secret generic redis-credentials \
  --from-literal=password="$REDIS_PASSWORD" \
  --namespace production

# RuVector admin token
kubectl create secret generic ruvector-credentials \
  --from-literal=admin-token="$RUVECTOR_ADMIN_TOKEN" \
  --namespace production
```

**Verify Secrets**:

```bash
kubectl get secrets -n production
# Expected: 6 secrets listed above
```

### Step 5: Create ConfigMaps (5 minutes)

```bash
kubectl create configmap cfn-coordinator-config \
  --from-literal=LOG_LEVEL=info \
  --from-literal=DEFAULT_PROVIDER=cerebras \
  --from-literal=SLA_ENFORCEMENT=true \
  --from-literal=METRICS_ENABLED=true \
  --namespace production

kubectl create configmap ruvector-config \
  --from-literal=RBAC_ENABLED=true \
  --from-literal=AUDIT_LOGGING=true \
  --from-literal=BACKUP_INTERVAL=6h \
  --namespace production
```

---

## Database Setup

### Step 6: Deploy PostgreSQL (20 minutes)

**Using Helm Chart**:

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

helm install postgres bitnami/postgresql \
  --namespace production \
  --set auth.existingSecret=postgres-credentials \
  --set primary.persistence.storageClass=postgres-storage \
  --set primary.persistence.size=100Gi \
  --set primary.resources.requests.cpu=4 \
  --set primary.resources.requests.memory=8Gi \
  --set primary.resources.limits.cpu=8 \
  --set primary.resources.limits.memory=16Gi \
  --set metrics.enabled=true \
  --set metrics.serviceMonitor.enabled=true

# Wait for pod ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=postgresql -n production --timeout=600s

# Verify connection
kubectl exec -it postgres-postgresql-0 -n production -- psql -U postgres -c "SELECT version();"
```

### Step 7: Initialize Database Schema (10 minutes)

**Run Trigger.dev Migrations**:

```bash
# Port-forward to PostgreSQL
kubectl port-forward svc/postgres-postgresql 5432:5432 -n production &

# Run migrations from local machine
cd docker/trigger-dev-v4/hosting/docker/webapp/
npm run db:migrate

# Verify tables created
psql -h localhost -U postgres -d main -c "\dt"
# Expected: 20+ tables including RuntimeEnvironment, TaskRun, etc.

# Stop port-forward
kill %1
```

### Step 8: Create Backup CronJob (5 minutes)

```bash
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: production
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:14
            env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: password
            command:
            - /bin/bash
            - -c
            - |
              pg_dump -h postgres-postgresql -U postgres main | gzip > /backup/postgres-\$(date +%Y%m%d-%H%M%S).sql.gz
              aws s3 cp /backup/postgres-*.sql.gz s3://cfn-backups-prod/postgres/
            volumeMounts:
            - name: backup
              mountPath: /backup
          restartPolicy: OnFailure
          volumes:
          - name: backup
            emptyDir: {}
EOF

# Verify CronJob
kubectl get cronjob -n production
```

---

## RuVector Deployment

### Step 9: Deploy RuVector (15 minutes)

**Using Helm Chart**:

```bash
helm repo add ruvector https://charts.ruvector.io
helm repo update

helm install ruvector ruvector/ruvector \
  --namespace production \
  --set auth.adminToken.existingSecret=ruvector-credentials \
  --set persistence.storageClass=fast-ssd \
  --set persistence.size=50Gi \
  --set replicaCount=2 \
  --set resources.requests.cpu=2 \
  --set resources.requests.memory=8Gi \
  --set resources.limits.cpu=4 \
  --set resources.limits.memory=16Gi \
  --set rbac.enabled=true \
  --set auditLogging.enabled=true \
  --set metrics.enabled=true

# Wait for pods ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=ruvector -n production --timeout=600s

# Verify health
kubectl exec -it ruvector-0 -n production -- curl http://localhost:8000/health
# Expected: {"status": "healthy"}
```

### Step 10: Initialize RuVector Collections (10 minutes)

**Create Required Collections**:

```bash
# Port-forward to RuVector
kubectl port-forward svc/ruvector 8000:8000 -n production &

# Create collections
for collection in decomposition_plans validation_results error_patterns decision_history code_artifacts; do
  echo "Creating collection: $collection"

  curl -X POST http://localhost:8000/collections \
    -H "Authorization: Bearer $RUVECTOR_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"$collection\",
      \"dimension\": 1536,
      \"metric\": \"cosine\",
      \"rbac\": {
        \"readers\": [\"coordinator\", \"validators\"],
        \"writers\": [\"coordinator\"]
      }
    }"
done

# Verify collections
curl http://localhost:8000/collections | jq '.[] | .name'
# Expected: 5 collections listed

# Stop port-forward
kill %1
```

### Step 11: Setup RuVector Backup CronJob (5 minutes)

```bash
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ruvector-backup
  namespace: production
spec:
  schedule: "0 */6 * * *"  # Every 6 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: curlimages/curl:latest
            env:
            - name: RUVECTOR_ADMIN_TOKEN
              valueFrom:
                secretKeyRef:
                  name: ruvector-credentials
                  key: admin-token
            command:
            - /bin/sh
            - -c
            - |
              curl -X POST http://ruvector:8000/admin/backup \
                -H "Authorization: Bearer \$RUVECTOR_ADMIN_TOKEN" \
                -o /backup/ruvector-\$(date +%Y%m%d-%H%M%S).tar.gz
              # Upload to S3 (requires AWS CLI in image)
          restartPolicy: OnFailure
EOF
```

---

## Coordinator Deployment

### Step 12: Build and Push Coordinator Image (20 minutes)

**Build Docker Image**:

```bash
cd docker/trigger-dev/

# Build image
docker build -t cfn-coordinator:v1.0.0 .

# Tag for registry
docker tag cfn-coordinator:v1.0.0 \
  your-registry.example.com/cfn-coordinator:v1.0.0

docker tag cfn-coordinator:v1.0.0 \
  your-registry.example.com/cfn-coordinator:latest

# Push to registry
docker push your-registry.example.com/cfn-coordinator:v1.0.0
docker push your-registry.example.com/cfn-coordinator:latest

# Verify image pushed
docker manifest inspect your-registry.example.com/cfn-coordinator:v1.0.0
```

### Step 13: Deploy Coordinator (15 minutes)

**Create Deployment**:

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-coordinator
  namespace: production
  labels:
    app: cfn-coordinator
    version: v1.0.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cfn-coordinator
  template:
    metadata:
      labels:
        app: cfn-coordinator
        version: v1.0.0
    spec:
      containers:
      - name: coordinator
        image: your-registry.example.com/cfn-coordinator:v1.0.0
        ports:
        - containerPort: 8080
          name: health
        env:
        - name: TRIGGER_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: trigger-api-key
              key: secret-key
        - name: CEREBRAS_API_KEY
          valueFrom:
            secretKeyRef:
              name: cerebras-api-key
              key: api-key
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: anthropic-api-key
              key: api-key
        - name: POSTGRES_URL
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: url
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: password
        - name: RUVECTOR_URL
          value: "http://ruvector:8000"
        - name: RUVECTOR_ADMIN_TOKEN
          valueFrom:
            secretKeyRef:
              name: ruvector-credentials
              key: admin-token
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: cfn-coordinator-config
              key: LOG_LEVEL
        - name: DEFAULT_PROVIDER
          valueFrom:
            configMapKeyRef:
              name: cfn-coordinator-config
              key: DEFAULT_PROVIDER
        resources:
          requests:
            cpu: 2
            memory: 4Gi
          limits:
            cpu: 4
            memory: 8Gi
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 5
        startupProbe:
          httpGet:
            path: /health/startup
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 12
---
apiVersion: v1
kind: Service
metadata:
  name: cfn-coordinator
  namespace: production
spec:
  selector:
    app: cfn-coordinator
  ports:
  - port: 8080
    targetPort: 8080
    name: health
  type: ClusterIP
EOF

# Wait for deployment
kubectl rollout status deployment/cfn-coordinator -n production

# Verify pods running
kubectl get pods -l app=cfn-coordinator -n production
# Expected: 3 pods (3/3 Ready)
```

### Step 14: Setup Horizontal Pod Autoscaler (5 minutes)

```bash
kubectl apply -f - <<EOF
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cfn-coordinator-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cfn-coordinator
  minReplicas: 3
  maxReplicas: 10
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
EOF

# Verify HPA
kubectl get hpa -n production
```

---

## Verification

### Step 15: Health Checks (10 minutes)

```bash
# Port-forward to coordinator
kubectl port-forward svc/cfn-coordinator 8080:8080 -n production &

# Test liveness
curl http://localhost:8080/health/live | jq .
# Expected: {"status": "healthy", ...}

# Test readiness
curl http://localhost:8080/health/ready | jq .
# Expected: {"status": "healthy", "ready": true, ...}

# Test startup
curl http://localhost:8080/health/startup | jq .
# Expected: {"status": "healthy", ...}

# Stop port-forward
kill %1
```

### Step 16: Smoke Tests (15 minutes)

**Trigger Test Task**:

```bash
# Port-forward to Trigger.dev webapp
kubectl port-forward svc/trigger-webapp 8030:3000 -n production &

# Trigger hello-world task
curl -X POST "http://localhost:8030/api/v1/tasks/hello-world/trigger" \
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "outputDir": "/tmp/smoke-test",
      "language": "en",
      "greeting": "Production smoke test",
      "progLang": "typescript",
      "extension": "ts",
      "agentType": "smoke-test"
    }
  }'

# Expected response:
# {"id": "run_xxx", "status": "PENDING"}

# Wait 2 minutes, then check status
RUN_ID="run_xxx"  # From response above
curl "http://localhost:8030/api/v1/runs/$RUN_ID" \
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY" | jq .

# Expected: {"status": "COMPLETED", ...}

# Stop port-forward
kill %1
```

**Verify Logs**:

```bash
# Check coordinator logs
kubectl logs -l app=cfn-coordinator -n production --tail=100

# Look for:
# - "Task started"
# - "Phase 1: RuVector initialized"
# - "Phase 2: Decomposition complete"
# - "Task completed"
```

### Step 17: Metrics Verification (5 minutes)

```bash
# Port-forward to Prometheus (if deployed)
kubectl port-forward svc/prometheus 9090:9090 -n monitoring &

# Check metrics endpoint
curl http://localhost:9090/api/v1/query?query=cfn_tasks_total | jq .

# Expected: Results showing task counts

# Stop port-forward
kill %1
```

---

## Post-Deployment

### Step 18: Setup Monitoring Dashboards (10 minutes)

**Import Grafana Dashboard**:

```bash
# Port-forward to Grafana
kubectl port-forward svc/grafana 3000:3000 -n monitoring &

# Login to Grafana (http://localhost:3000)
# Import dashboard: docker/trigger-dev/grafana-dashboard.json

# Verify panels show data:
# - Request rate
# - Phase latencies
# - SLA compliance
# - Error rate
```

### Step 19: Configure Alerts (10 minutes)

**Apply Prometheus Alert Rules**:

```bash
kubectl apply -f k8s/prometheus-alerts.yaml -n monitoring

# Verify alerts loaded
kubectl exec -it prometheus-0 -n monitoring -- promtool check rules /etc/prometheus/alerts.yaml
```

### Step 20: Enable Backups (5 minutes)

**Verify Backup CronJobs**:

```bash
kubectl get cronjobs -n production
# Expected:
#   postgres-backup   (daily at 2 AM)
#   ruvector-backup   (every 6 hours)

# Trigger manual backup test
kubectl create job --from=cronjob/postgres-backup postgres-backup-manual -n production

# Check backup uploaded to S3
aws s3 ls s3://cfn-backups-prod/postgres/
```

### Step 21: Update Documentation (5 minutes)

- [ ] Update DNS records in runbook
- [ ] Document deployment date and version
- [ ] Share credentials with on-call team (via Vault)
- [ ] Update status page (if applicable)
- [ ] Announce deployment to stakeholders

---

## Rollback Procedures

### Immediate Rollback (Pod-level)

**If coordinator pods crashlooping**:

```bash
# Rollback to previous version
kubectl rollout undo deployment/cfn-coordinator -n production

# Monitor rollback
kubectl rollout status deployment/cfn-coordinator -n production

# Verify pods healthy
kubectl get pods -l app=cfn-coordinator -n production
```

### Full Rollback (Image-level)

**If new version has critical bug**:

```bash
# Update deployment to use previous image
kubectl set image deployment/cfn-coordinator \
  coordinator=your-registry.example.com/cfn-coordinator:v0.9.0 \
  -n production

# Restart pods
kubectl rollout restart deployment/cfn-coordinator -n production

# Verify rollback
kubectl get pods -l app=cfn-coordinator -n production -o jsonpath='{.items[0].spec.containers[0].image}'
# Expected: v0.9.0
```

### Database Rollback

**If migration caused issues**:

```bash
# Port-forward to PostgreSQL
kubectl port-forward svc/postgres-postgresql 5432:5432 -n production &

# Rollback migration
cd docker/trigger-dev-v4/hosting/docker/webapp/
npm run db:rollback

# Verify rollback
psql -h localhost -U postgres -d main -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"

# Stop port-forward
kill %1
```

---

## Troubleshooting

### Common Deployment Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Pods CrashLoopBackOff | Missing env var or secret | Check logs, verify secrets exist |
| ImagePullBackOff | Wrong image tag or auth | Verify image exists, check registry credentials |
| Readiness probe failing | Dependency unavailable | Check RuVector/PostgreSQL health |
| High memory usage | Under-provisioned | Increase memory limits (4Gi → 8Gi) |

### Deployment Checklist

Before declaring deployment successful:

- [ ] All pods Running (3/3 coordinator, 2/2 RuVector, 1/1 PostgreSQL)
- [ ] Health checks passing (liveness, readiness, startup)
- [ ] Smoke tests passing (100%)
- [ ] Metrics exporting (Prometheus endpoint responding)
- [ ] Logs shipping to centralized logging
- [ ] Alerts configured and firing test alert
- [ ] Backups scheduled and tested
- [ ] DNS resolving correctly
- [ ] Documentation updated
- [ ] Stakeholders notified

---

**Deployment Complete!** 🎉

**Next Steps**:
1. Monitor for 24 hours
2. Review metrics and alerts
3. Conduct post-deployment review
4. Plan for scaling if needed

**Document Version**: 1.0.0
**Deployment Date**: [To be filled]
**Deployed By**: [To be filled]
