# Docker Security & Best Practices - Claude Flow Novice

## Overview

Comprehensive Docker security guidelines and best practices for Claude Flow Novice, covering container hardening, image security, runtime protection, and compliance standards.

## Table of Contents
1. [Secure Image Building](#secure-image-building)
2. [Container Hardening](#container-hardening)
3. [Runtime Security](#runtime-security)
4. [Network Security](#network-security)
5. [Secrets Management](#secrets-management)
6. [Security Scanning](#security-scanning)
7. [Compliance & Monitoring](#compliance--monitoring)
8. [Production Best Practices](#production-best-practices)

---

## Secure Image Building

### Multi-Stage Production Dockerfile

```dockerfile
# Dockerfile.production
# Build stage
FROM node:20-alpine AS builder

# Security: Use non-root user for build
RUN addgroup -g 1001 -S nodejs && \
    adduser -S claude -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=claude:nodejs package*.json ./

# Install dependencies with security flags
RUN npm ci --only=production --ignore-scripts --no-audit

# Copy source code
COPY --chown=claude:nodejs . .

# Build application
RUN npm run build

# Remove development dependencies and clean cache
RUN npm prune --production && \
    npm cache clean --force

# Runtime stage
FROM node:20-alpine AS runtime

# Security labels
LABEL maintainer="claude-flow-team@example.com" \
      version="1.0.0" \
      description="Claude Flow Novice - Production Runtime" \
      security.scan="enabled"

# Install security updates and required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        dumb-init \
        tini \
        curl \
        ca-certificates && \
    rm -rf /var/cache/apk/*

# Create non-root user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S claude -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder --chown=claude:nodejs /app/dist ./dist
COPY --from=builder --chown=claude:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=claude:nodejs /app/package.json ./package.json

# Create required directories with proper permissions
RUN mkdir -p /app/logs /app/tmp /app/.cache && \
    chown -R claude:nodejs /app/logs /app/tmp /app/.cache && \
    chmod 755 /app/logs /app/tmp /app/.cache

# Security: Remove unnecessary packages and files
RUN rm -rf /tmp/* /var/tmp/* /usr/share/doc/* /usr/share/man/* /var/log/*

# Switch to non-root user
USER claude

# Expose port (non-privileged)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use tini as init system to handle signals properly
ENTRYPOINT ["tini", "--"]

# Start application
CMD ["node", "dist/index.js"]
```

### Distroless Production Image

```dockerfile
# Dockerfile.distroless
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts
COPY . .
RUN npm run build

# Production stage with distroless
FROM gcr.io/distroless/nodejs20-debian12:nonroot

# Copy application
COPY --from=builder --chown=nonroot:nonroot /app/dist /app/dist
COPY --from=builder --chown=nonroot:nonroot /app/node_modules /app/node_modules
COPY --from=builder --chown=nonroot:nonroot /app/package.json /app/package.json

# Set working directory
WORKDIR /app

# Use non-root user (built into distroless)
USER nonroot

# Expose port
EXPOSE 3000

# Start application
ENTRYPOINT ["node", "dist/index.js"]
```

### Build Security Script

```bash
#!/bin/bash
# scripts/secure-build.sh

set -euo pipefail

IMAGE_NAME="claude-flow-novice"
IMAGE_TAG="${1:-latest}"
DOCKERFILE="${2:-Dockerfile.production}"
BUILD_CONTEXT="${3:-.}"

echo "🔒 Starting secure Docker build process..."

# Security checks before build
echo "🔍 Running pre-build security checks..."

# Check for secrets in source code
if command -v trufflehog &> /dev/null; then
    echo "Scanning for secrets..."
    trufflehog --regex --entropy=False .
fi

# Check for vulnerabilities in dependencies
if command -v npm &> /dev/null; then
    echo "Scanning npm dependencies..."
    npm audit --audit-level high
fi

# Build image with security flags
echo "🏗️ Building Docker image..."
docker build \
    --file "${DOCKERFILE}" \
    --tag "${IMAGE_NAME}:${IMAGE_TAG}" \
    --tag "${IMAGE_NAME}:latest" \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --progress=plain \
    --no-cache \
    "${BUILD_CONTEXT}"

# Security scan of built image
echo "🔍 Running container security scan..."

# Trivy scan
if command -v trivy &> /dev/null; then
    echo "Running Trivy vulnerability scan..."
    trivy image --severity HIGH,CRITICAL "${IMAGE_NAME}:${IMAGE_TAG}"
fi

# Grype scan (alternative)
if command -v grype &> /dev/null; then
    echo "Running Grype vulnerability scan..."
    grype "${IMAGE_NAME}:${IMAGE_TAG}"
fi

# Docker Scout scan (if available)
if docker scout version &> /dev/null; then
    echo "Running Docker Scout scan..."
    docker scout cves "${IMAGE_NAME}:${IMAGE_TAG}"
fi

# CIS Docker Benchmark
if command -v docker-bench-security &> /dev/null; then
    echo "Running CIS Docker Benchmark..."
    docker-bench-security
fi

# Image analysis
echo "📊 Analyzing image security..."
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    anchore/grype:latest "${IMAGE_NAME}:${IMAGE_TAG}" -o table

# Sign image (if cosign is available)
if command -v cosign &> /dev/null && [ -n "${COSIGN_PRIVATE_KEY:-}" ]; then
    echo "🔏 Signing image with cosign..."
    cosign sign --key env://COSIGN_PRIVATE_KEY "${IMAGE_NAME}:${IMAGE_TAG}"
fi

echo "✅ Secure build process completed successfully!"
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"

# Generate SBOM (Software Bill of Materials)
if command -v syft &> /dev/null; then
    echo "📋 Generating SBOM..."
    syft "${IMAGE_NAME}:${IMAGE_TAG}" -o spdx-json > "sbom-${IMAGE_TAG}.json"
fi
```

---

## Container Hardening

### Security Context Configuration

```yaml
# k8s/security/security-context.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow-hardened
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-flow-novice
  template:
    metadata:
      labels:
        app: claude-flow-novice
      annotations:
        # Security annotations
        container.apparmor.security.beta.kubernetes.io/claude-flow: runtime/default
        seccomp.security.alpha.kubernetes.io/pod: runtime/default
    spec:
      # Security context for the pod
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
        fsGroupChangePolicy: "OnRootMismatch"
        seccompProfile:
          type: RuntimeDefault

      # Service account with minimal permissions
      serviceAccountName: claude-flow-minimal

      # Automount service account token disabled for security
      automountServiceAccountToken: false

      containers:
      - name: claude-flow-novice
        image: claude-flow-novice:v1.0.0

        # Container security context
        securityContext:
          allowPrivilegeEscalation: false
          runAsNonRoot: true
          runAsUser: 1001
          runAsGroup: 1001
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
          seccompProfile:
            type: RuntimeDefault

        # Resource limits for security
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"

        # Volume mounts for writable areas
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: app-cache
          mountPath: /app/.cache
        - name: app-logs
          mountPath: /app/logs

        # Health checks
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

        # Environment variables (use secrets for sensitive data)
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: "3000"

      volumes:
      - name: tmp
        emptyDir: {}
      - name: app-cache
        emptyDir: {}
      - name: app-logs
        emptyDir: {}

      # Node selector for dedicated security nodes
      nodeSelector:
        security-level: high

      # Tolerations for security nodes
      tolerations:
      - key: "security"
        operator: "Equal"
        value: "dedicated"
        effect: "NoSchedule"
```

### Pod Security Policy

```yaml
# k8s/security/pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: claude-flow-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: true
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: claude-flow-minimal
  namespace: production
automountServiceAccountToken: false
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: claude-flow-role
  namespace: production
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: claude-flow-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: claude-flow-minimal
  namespace: production
roleRef:
  kind: Role
  name: claude-flow-role
  apiGroup: rbac.authorization.k8s.io
```

---

## Runtime Security

### Falco Security Rules

```yaml
# k8s/security/falco-rules.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: falco-claude-flow-rules
  namespace: falco-system
data:
  claude_flow_rules.yaml: |
    - rule: Claude Flow Privileged Container
      desc: Detect privileged containers in Claude Flow namespace
      condition: >
        k8s_audit and
        ka.target.namespace = "production" and
        ka.target.resource = "pods" and
        ka.verb in (create, update) and
        ka.request_object.spec.securityContext.privileged = true
      output: >
        Privileged container created in Claude Flow namespace
        (user=%ka.user.name verb=%ka.verb resource=%ka.target.resource
        namespace=%ka.target.namespace name=%ka.target.name)
      priority: WARNING

    - rule: Claude Flow Suspicious Process Activity
      desc: Detect suspicious process execution in Claude Flow containers
      condition: >
        spawned_process and
        container.image.repository contains "claude-flow" and
        (proc.name in (bash, sh, zsh, csh, ksh, tcsh, dash) or
         proc.cmdline contains "curl" or
         proc.cmdline contains "wget" or
         proc.cmdline contains "nc" or
         proc.cmdline contains "netcat")
      output: >
        Suspicious process activity in Claude Flow container
        (container=%container.name image=%container.image.repository
         command=%proc.cmdline user=%user.name)
      priority: WARNING

    - rule: Claude Flow File Modification
      desc: Detect unexpected file modifications in Claude Flow containers
      condition: >
        open_write and
        container.image.repository contains "claude-flow" and
        not fd.name startswith "/app/logs" and
        not fd.name startswith "/app/.cache" and
        not fd.name startswith "/tmp"
      output: >
        Unexpected file modification in Claude Flow container
        (container=%container.name file=%fd.name command=%proc.cmdline)
      priority: WARNING

    - rule: Claude Flow Network Activity
      desc: Detect suspicious network activity from Claude Flow containers
      condition: >
        outbound and
        container.image.repository contains "claude-flow" and
        not fd.rip in (private_ip_addresses) and
        not fd.rip in (claude_api_endpoints)
      output: >
        Suspicious outbound connection from Claude Flow container
        (container=%container.name destination=%fd.rip port=%fd.rport
         command=%proc.cmdline)
      priority: INFO
```

### Runtime Protection with OPA Gatekeeper

```yaml
# k8s/security/gatekeeper-constraints.yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  name: claudeflowsecurity
spec:
  crd:
    spec:
      names:
        kind: ClaudeFlowSecurity
      validation:
        type: object
        properties:
          allowedImages:
            type: array
            items:
              type: string
          requiredSecurityContext:
            type: object
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package claudeflowsecurity

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          not starts_with(container.image, input.parameters.allowedImages[_])
          msg := sprintf("Container image %v is not from allowed registry", [container.image])
        }

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          container.securityContext.privileged == true
          msg := "Privileged containers are not allowed"
        }

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          not container.securityContext.readOnlyRootFilesystem
          msg := "Containers must have read-only root filesystem"
        }

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          container.securityContext.runAsUser == 0
          msg := "Containers must not run as root user"
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: ClaudeFlowSecurity
metadata:
  name: claude-flow-security-policy
spec:
  match:
    kinds:
      - apiGroups: ["apps"]
        kinds: ["Deployment", "StatefulSet", "DaemonSet"]
    namespaces: ["production"]
  parameters:
    allowedImages:
      - "claude-flow-novice"
      - "registry.example.com/claude-flow"
    requiredSecurityContext:
      runAsNonRoot: true
      readOnlyRootFilesystem: true
```

---

## Network Security

### Network Policies

```yaml
# k8s/security/network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: claude-flow-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: claude-flow-novice
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # Allow ingress from ingress controller
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - podSelector:
        matchLabels:
          app.kubernetes.io/name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  # Allow ingress from monitoring
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
    - podSelector:
        matchLabels:
          app: prometheus
    ports:
    - protocol: TCP
      port: 3000
  egress:
  # Allow DNS resolution
  - to: []
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
  # Allow database connections
  - to:
    - podSelector:
        matchLabels:
          app: postgresql
    ports:
    - protocol: TCP
      port: 5432
  # Allow Redis connections
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  # Allow HTTPS to external APIs
  - to: []
    ports:
    - protocol: TCP
      port: 443
  # Block all other traffic
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

### Istio Security Policies

```yaml
# k8s/security/istio-security.yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: claude-flow-authz
  namespace: production
spec:
  selector:
    matchLabels:
      app: claude-flow-novice
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/ingress-nginx/sa/ingress-nginx"]
  - to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/*", "/health", "/ready", "/metrics"]
---
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: claude-flow-mtls
  namespace: production
spec:
  selector:
    matchLabels:
      app: claude-flow-novice
  mtls:
    mode: STRICT
---
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: claude-flow-dr
  namespace: production
spec:
  host: claude-flow-service
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL
```

---

## Secrets Management

### External Secrets Operator

```yaml
# k8s/security/external-secrets.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: claude-flow-secret-store
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-west-2
      auth:
        secretRef:
          accessKeyID:
            name: aws-secret
            key: access-key-id
          secretAccessKey:
            name: aws-secret
            key: secret-access-key
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: claude-flow-secrets
  namespace: production
spec:
  refreshInterval: 15s
  secretStoreRef:
    name: claude-flow-secret-store
    kind: SecretStore
  target:
    name: claude-flow-app-secrets
    creationPolicy: Owner
  data:
  - secretKey: database-url
    remoteRef:
      key: claude-flow/production/database-url
  - secretKey: redis-url
    remoteRef:
      key: claude-flow/production/redis-url
  - secretKey: claude-api-key
    remoteRef:
      key: claude-flow/production/claude-api-key
  - secretKey: jwt-secret
    remoteRef:
      key: claude-flow/production/jwt-secret
```

### Sealed Secrets

```yaml
# k8s/security/sealed-secrets.yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: claude-flow-sealed-secrets
  namespace: production
spec:
  encryptedData:
    database-url: AgBy3i4OJSWK+PiTySYZZA9rO43cGDEQAx...
    redis-url: AgBy3i4OJSWK+PiTySYZZA9rO43cGDEQAx...
    claude-api-key: AgBy3i4OJSWK+PiTySYZZA9rO43cGDEQAx...
  template:
    metadata:
      name: claude-flow-secrets
      namespace: production
    type: Opaque
```

### Secrets Rotation Script

```bash
#!/bin/bash
# scripts/rotate-secrets.sh

set -euo pipefail

NAMESPACE="${NAMESPACE:-production}"
SECRET_NAME="${SECRET_NAME:-claude-flow-secrets}"

echo "🔄 Starting secrets rotation for ${SECRET_NAME} in ${NAMESPACE}"

# Generate new secrets
NEW_JWT_SECRET=$(openssl rand -base64 32)
NEW_API_KEY=$(uuidgen)

# Update secrets in AWS Secrets Manager
aws secretsmanager update-secret \
    --secret-id "claude-flow/${NAMESPACE}/jwt-secret" \
    --secret-string "${NEW_JWT_SECRET}"

aws secretsmanager update-secret \
    --secret-id "claude-flow/${NAMESPACE}/api-key" \
    --secret-string "${NEW_API_KEY}"

# Trigger External Secrets Operator refresh
kubectl annotate externalsecret claude-flow-secrets \
    force-sync=$(date +%s) \
    --namespace "${NAMESPACE}"

# Wait for secret update
echo "⏳ Waiting for secret update..."
kubectl wait --for=condition=Ready externalsecret/claude-flow-secrets \
    --namespace "${NAMESPACE}" \
    --timeout=60s

# Restart pods to pick up new secrets
echo "🔄 Restarting pods to pick up new secrets..."
kubectl rollout restart deployment/claude-flow-novice \
    --namespace "${NAMESPACE}"

# Wait for rollout to complete
kubectl rollout status deployment/claude-flow-novice \
    --namespace "${NAMESPACE}" \
    --timeout=300s

echo "✅ Secrets rotation completed successfully!"

# Send notification
curl -X POST "${SLACK_WEBHOOK_URL}" \
    -H 'Content-type: application/json' \
    --data "{
        \"text\": \"🔄 Secrets rotation completed for ${SECRET_NAME} in ${NAMESPACE}\",
        \"color\": \"good\"
    }"
```

---

## Security Scanning

### Continuous Security Scanning Pipeline

```yaml
# .github/workflows/security-scan.yaml
name: Security Scanning

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image for scanning
        run: |
          docker build -t claude-flow-scan:${{ github.sha }} \
            -f Dockerfile.production .

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'claude-flow-scan:${{ github.sha }}'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy scan results to GitHub Security tab
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

      - name: Run Grype vulnerability scanner
        uses: anchore/scan-action@v3
        with:
          image: 'claude-flow-scan:${{ github.sha }}'
          fail-build: true
          severity-cutoff: high

      - name: Docker Scout security scan
        if: github.event_name == 'pull_request'
        uses: docker/scout-action@v1
        with:
          command: cves
          image: 'claude-flow-scan:${{ github.sha }}'
          only-severities: critical,high
          exit-code: true

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: TruffleHog OSS
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD
          extra_args: --debug --only-verified

      - name: GitLeaks scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: |
          npm audit --audit-level high --json > audit-results.json
          cat audit-results.json

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'claude-flow-novice'
          path: '.'
          format: 'JSON'
          args: >
            --enableRetired
            --enableExperimental
            --nvdApiKey ${{ secrets.NVD_API_KEY }}

  runtime-security:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      - name: Setup kubectl
        uses: azure/setup-kubectl@v3

      - name: Run kube-score security analysis
        run: |
          wget https://github.com/zegl/kube-score/releases/latest/download/kube-score_linux_amd64
          chmod +x kube-score_linux_amd64
          ./kube-score_linux_amd64 score k8s/production/*.yaml

      - name: Run OPA Conftest policy check
        run: |
          wget https://github.com/open-policy-agent/conftest/releases/latest/download/conftest_linux_x86_64.tar.gz
          tar xzf conftest_linux_x86_64.tar.gz
          ./conftest verify --policy security-policies/ k8s/production/
```

### Security Monitoring Dashboard

```typescript
// src/security/security-dashboard.ts
import express from 'express';
import { SecurityMetrics } from './security-metrics';

export class SecurityDashboard {
  private app: express.Application;
  private metrics: SecurityMetrics;

  constructor() {
    this.app = express();
    this.metrics = new SecurityMetrics();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/security/dashboard', async (req, res) => {
      const dashboard = await this.generateDashboard();
      res.json(dashboard);
    });

    this.app.get('/security/vulnerabilities', async (req, res) => {
      const vulnerabilities = await this.getVulnerabilities();
      res.json(vulnerabilities);
    });

    this.app.get('/security/compliance', async (req, res) => {
      const compliance = await this.getComplianceStatus();
      res.json(compliance);
    });
  }

  private async generateDashboard(): Promise<any> {
    return {
      overview: {
        riskScore: await this.metrics.calculateRiskScore(),
        vulnerabilities: await this.metrics.getVulnerabilityCount(),
        complianceScore: await this.metrics.getComplianceScore(),
        lastScan: await this.metrics.getLastScanTime(),
      },
      alerts: await this.metrics.getActiveAlerts(),
      trends: await this.metrics.getSecurityTrends(),
      recommendations: await this.getSecurityRecommendations(),
    };
  }

  private async getVulnerabilities(): Promise<any> {
    return {
      critical: await this.metrics.getCriticalVulnerabilities(),
      high: await this.metrics.getHighVulnerabilities(),
      medium: await this.metrics.getMediumVulnerabilities(),
      low: await this.metrics.getLowVulnerabilities(),
    };
  }

  private async getComplianceStatus(): Promise<any> {
    return {
      cis: await this.metrics.getCISCompliance(),
      nist: await this.metrics.getNISTCompliance(),
      soc2: await this.metrics.getSOC2Compliance(),
      gdpr: await this.metrics.getGDPRCompliance(),
    };
  }

  private async getSecurityRecommendations(): Promise<any[]> {
    const recommendations = [];

    // Check for high-risk configurations
    const riskScore = await this.metrics.calculateRiskScore();
    if (riskScore > 7) {
      recommendations.push({
        type: 'high_risk',
        message: 'Multiple high-risk configurations detected',
        action: 'Review security policies and configurations',
        priority: 'high',
      });
    }

    // Check for outdated images
    const outdatedImages = await this.metrics.getOutdatedImages();
    if (outdatedImages.length > 0) {
      recommendations.push({
        type: 'outdated_images',
        message: `${outdatedImages.length} container images need updates`,
        action: 'Update container images to latest secure versions',
        priority: 'medium',
      });
    }

    // Check for excessive permissions
    const excessivePermissions = await this.metrics.getExcessivePermissions();
    if (excessivePermissions.length > 0) {
      recommendations.push({
        type: 'excessive_permissions',
        message: 'Some service accounts have excessive permissions',
        action: 'Review and reduce service account permissions',
        priority: 'medium',
      });
    }

    return recommendations;
  }

  public start(port: number = 8080): void {
    this.app.listen(port, () => {
      console.log(`Security dashboard running on port ${port}`);
    });
  }
}
```

This comprehensive Docker security guide provides enterprise-grade security practices for Claude Flow Novice containers, covering secure image building, container hardening, runtime protection, network security, secrets management, security scanning, and compliance monitoring.