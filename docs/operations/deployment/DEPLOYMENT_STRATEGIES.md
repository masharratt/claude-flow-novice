# Deployment Strategies - Claude Flow Novice

## Overview

Comprehensive guide to advanced deployment strategies for Claude Flow Novice including blue-green, canary, A/B testing, and progressive rollouts with minimal downtime and risk.

## Table of Contents
1. [Blue-Green Deployment](#blue-green-deployment)
2. [Canary Deployment](#canary-deployment)
3. [A/B Testing](#ab-testing)
4. [Rolling Updates](#rolling-updates)
5. [Feature Flags](#feature-flags)
6. [Progressive Rollouts](#progressive-rollouts)
7. [Traffic Splitting](#traffic-splitting)
8. [Rollback Strategies](#rollback-strategies)

---

## Blue-Green Deployment

### Overview
Blue-green deployment maintains two identical production environments (blue and green), allowing instant rollback and zero-downtime deployments.

### Implementation with Argo Rollouts

```yaml
# k8s/deployment-strategies/blue-green-rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: claude-flow-blue-green
  namespace: production
spec:
  replicas: 5
  strategy:
    blueGreen:
      # Active service points to current version
      activeService: claude-flow-active
      # Preview service points to new version
      previewService: claude-flow-preview
      # Disable automatic promotion
      autoPromotionEnabled: false
      # Scale down old version after promotion
      scaleDownDelaySeconds: 30
      # Pre-promotion analysis
      prePromotionAnalysis:
        templates:
        - templateName: success-rate-analysis
        - templateName: latency-analysis
        args:
        - name: service-name
          value: claude-flow-preview.production.svc.cluster.local
        - name: prometheus-server
          value: http://prometheus.monitoring.svc.cluster.local:9090
      # Post-promotion analysis
      postPromotionAnalysis:
        templates:
        - templateName: success-rate-analysis
        - templateName: latency-analysis
        args:
        - name: service-name
          value: claude-flow-active.production.svc.cluster.local
        - name: prometheus-server
          value: http://prometheus.monitoring.svc.cluster.local:9090
  selector:
    matchLabels:
      app: claude-flow-novice
  template:
    metadata:
      labels:
        app: claude-flow-novice
    spec:
      containers:
      - name: claude-flow-novice
        image: claude-flow-novice:v1.2.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DEPLOYMENT_STRATEGY
          value: blue-green
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
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
---
# Active service (current production traffic)
apiVersion: v1
kind: Service
metadata:
  name: claude-flow-active
  namespace: production
spec:
  selector:
    app: claude-flow-novice
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
---
# Preview service (new version testing)
apiVersion: v1
kind: Service
metadata:
  name: claude-flow-preview
  namespace: production
spec:
  selector:
    app: claude-flow-novice
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

### Analysis Templates

```yaml
# k8s/deployment-strategies/analysis-templates.yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate-analysis
  namespace: production
spec:
  args:
  - name: service-name
  - name: prometheus-server
    value: http://prometheus.monitoring.svc.cluster.local:9090
  metrics:
  - name: success-rate
    initialDelay: 60s
    interval: 60s
    count: 5
    successCondition: result[0] >= 0.95
    failureLimit: 3
    provider:
      prometheus:
        address: "{{args.prometheus-server}}"
        query: |
          sum(rate(
            http_requests_total{service="{{args.service-name}}",status!~"5.."}[2m]
          )) /
          sum(rate(
            http_requests_total{service="{{args.service-name}}"}[2m]
          ))
  - name: latency-p95
    initialDelay: 60s
    interval: 60s
    count: 5
    successCondition: result[0] <= 0.5
    failureLimit: 3
    provider:
      prometheus:
        address: "{{args.prometheus-server}}"
        query: |
          histogram_quantile(0.95,
            sum(rate(
              http_request_duration_seconds_bucket{service="{{args.service-name}}"}[2m]
            )) by (le)
          )
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: latency-analysis
  namespace: production
spec:
  args:
  - name: service-name
  - name: prometheus-server
  metrics:
  - name: avg-response-time
    initialDelay: 60s
    interval: 30s
    count: 10
    successCondition: result[0] <= 1.0
    failureLimit: 3
    provider:
      prometheus:
        address: "{{args.prometheus-server}}"
        query: |
          avg(rate(
            http_request_duration_seconds_sum{service="{{args.service-name}}"}[2m]
          )) /
          avg(rate(
            http_request_duration_seconds_count{service="{{args.service-name}}"}[2m]
          ))
```

### Blue-Green Automation Script

```bash
#!/bin/bash
# scripts/blue-green-deploy.sh

set -e

NAMESPACE=${NAMESPACE:-production}
ROLLOUT_NAME="claude-flow-blue-green"
IMAGE_TAG=${1:-latest}
TIMEOUT=${TIMEOUT:-600}

echo "🔄 Starting blue-green deployment for claude-flow-novice:${IMAGE_TAG}"

# Update the rollout with new image
kubectl patch rollout ${ROLLOUT_NAME} -n ${NAMESPACE} --type='merge' -p='{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "claude-flow-novice",
          "image": "claude-flow-novice:'${IMAGE_TAG}'"
        }]
      }
    }
  }
}'

echo "⏳ Waiting for rollout to be ready..."
kubectl rollout status rollout/${ROLLOUT_NAME} -n ${NAMESPACE} --timeout=${TIMEOUT}s

# Wait for analysis to complete
echo "📊 Waiting for pre-promotion analysis..."
kubectl wait --for=condition=Completed analysisrun \
  -l rollout=${ROLLOUT_NAME} \
  -n ${NAMESPACE} \
  --timeout=${TIMEOUT}s

# Check if analysis passed
ANALYSIS_STATUS=$(kubectl get analysisrun -l rollout=${ROLLOUT_NAME} -n ${NAMESPACE} -o jsonpath='{.items[0].status.phase}')

if [ "$ANALYSIS_STATUS" = "Successful" ]; then
  echo "✅ Pre-promotion analysis passed. Promoting rollout..."
  kubectl argo rollouts promote ${ROLLOUT_NAME} -n ${NAMESPACE}

  echo "⏳ Waiting for promotion to complete..."
  kubectl rollout status rollout/${ROLLOUT_NAME} -n ${NAMESPACE} --timeout=${TIMEOUT}s

  echo "📊 Running post-promotion analysis..."
  kubectl wait --for=condition=Completed analysisrun \
    -l rollout=${ROLLOUT_NAME},analysis-type=post-promotion \
    -n ${NAMESPACE} \
    --timeout=${TIMEOUT}s

  echo "🎉 Blue-green deployment completed successfully!"
else
  echo "❌ Pre-promotion analysis failed. Rolling back..."
  kubectl argo rollouts abort ${ROLLOUT_NAME} -n ${NAMESPACE}
  exit 1
fi
```

---

## Canary Deployment

### Progressive Canary with Istio

```yaml
# k8s/deployment-strategies/canary-rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: claude-flow-canary
  namespace: production
spec:
  replicas: 10
  strategy:
    canary:
      # Canary steps with traffic percentages
      steps:
      - setWeight: 5
      - pause:
          duration: 2m
      - analysis:
          templates:
          - templateName: canary-analysis
          args:
          - name: canary-service
            value: claude-flow-canary
          - name: stable-service
            value: claude-flow-stable
      - setWeight: 10
      - pause:
          duration: 2m
      - analysis:
          templates:
          - templateName: canary-analysis
          args:
          - name: canary-service
            value: claude-flow-canary
      - setWeight: 25
      - pause:
          duration: 5m
      - analysis:
          templates:
          - templateName: canary-analysis
      - setWeight: 50
      - pause:
          duration: 5m
      - analysis:
          templates:
          - templateName: canary-analysis
      - setWeight: 75
      - pause:
          duration: 5m
      - analysis:
          templates:
          - templateName: canary-analysis

      # Traffic routing with Istio
      trafficRouting:
        istio:
          virtualService:
            name: claude-flow-vs
            routes:
            - primary
          destinationRule:
            name: claude-flow-dr
            canarySubsetName: canary
            stableSubsetName: stable

      # Analysis for automated rollback
      analysis:
        templates:
        - templateName: canary-analysis
        args:
        - name: canary-service
          value: claude-flow-canary
        - name: stable-service
          value: claude-flow-stable
  selector:
    matchLabels:
      app: claude-flow-novice
  template:
    metadata:
      labels:
        app: claude-flow-novice
    spec:
      containers:
      - name: claude-flow-novice
        image: claude-flow-novice:v1.3.0
        ports:
        - containerPort: 3000
        env:
        - name: DEPLOYMENT_STRATEGY
          value: canary
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
```

### Istio Traffic Configuration

```yaml
# k8s/deployment-strategies/istio-canary.yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: claude-flow-vs
  namespace: production
spec:
  hosts:
  - claude-flow.example.com
  gateways:
  - claude-flow-gateway
  http:
  - name: primary
    match:
    - headers:
        end-user:
          exact: canary
    route:
    - destination:
        host: claude-flow-service
        subset: canary
      weight: 100
  - name: default
    route:
    - destination:
        host: claude-flow-service
        subset: stable
      weight: 100
    - destination:
        host: claude-flow-service
        subset: canary
      weight: 0
---
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: claude-flow-dr
  namespace: production
spec:
  host: claude-flow-service
  subsets:
  - name: stable
    labels:
      version: stable
  - name: canary
    labels:
      version: canary
---
apiVersion: networking.istio.io/v1alpha3
kind: Gateway
metadata:
  name: claude-flow-gateway
  namespace: production
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 443
      name: https
      protocol: HTTPS
    tls:
      mode: SIMPLE
      credentialName: claude-flow-tls
    hosts:
    - claude-flow.example.com
```

### Canary Analysis Template

```yaml
# k8s/deployment-strategies/canary-analysis.yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: canary-analysis
  namespace: production
spec:
  args:
  - name: canary-service
  - name: stable-service
  - name: prometheus-server
    value: http://prometheus.monitoring.svc.cluster.local:9090
  metrics:
  - name: error-rate-comparison
    initialDelay: 60s
    interval: 60s
    count: 5
    successCondition: result[0] <= 0.05
    failureLimit: 2
    provider:
      prometheus:
        address: "{{args.prometheus-server}}"
        query: |
          (
            sum(rate(http_requests_total{service="{{args.canary-service}}",status=~"5.."}[2m])) /
            sum(rate(http_requests_total{service="{{args.canary-service}}"}[2m]))
          ) -
          (
            sum(rate(http_requests_total{service="{{args.stable-service}}",status=~"5.."}[2m])) /
            sum(rate(http_requests_total{service="{{args.stable-service}}"}[2m]))
          )

  - name: latency-comparison
    initialDelay: 60s
    interval: 60s
    count: 5
    successCondition: result[0] <= 0.2
    failureLimit: 2
    provider:
      prometheus:
        address: "{{args.prometheus-server}}"
        query: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{service="{{args.canary-service}}"}[2m])) by (le)
          ) -
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{service="{{args.stable-service}}"}[2m])) by (le)
          )

  - name: canary-success-rate
    initialDelay: 60s
    interval: 60s
    count: 5
    successCondition: result[0] >= 0.95
    failureLimit: 2
    provider:
      prometheus:
        address: "{{args.prometheus-server}}"
        query: |
          sum(rate(http_requests_total{service="{{args.canary-service}}",status!~"5.."}[2m])) /
          sum(rate(http_requests_total{service="{{args.canary-service}}"}[2m]))
```

---

## A/B Testing

### Feature-Based A/B Testing

```yaml
# k8s/deployment-strategies/ab-test-rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: claude-flow-ab-test
  namespace: production
spec:
  replicas: 10
  strategy:
    canary:
      canaryService: claude-flow-canary
      stableService: claude-flow-stable
      trafficRouting:
        nginx:
          stableIngress: claude-flow-stable-ingress
          annotationPrefix: nginx.ingress.kubernetes.io
          additionalIngressAnnotations:
            canary-by-header: "X-AB-Test"
            canary-by-header-value: "variant-b"
      steps:
      - setWeight: 50  # 50/50 split for A/B test
      - pause: {}      # Manual promotion after analysis
  selector:
    matchLabels:
      app: claude-flow-novice
  template:
    metadata:
      labels:
        app: claude-flow-novice
        version: variant-b
    spec:
      containers:
      - name: claude-flow-novice
        image: claude-flow-novice:variant-b
        env:
        - name: FEATURE_FLAG_NEW_UI
          value: "true"
        - name: AB_TEST_VARIANT
          value: "b"
        ports:
        - containerPort: 3000
```

### A/B Test Configuration

```typescript
// src/ab-testing/ab-test-manager.ts
export interface ABTestConfig {
  testId: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  trafficSplit: {
    control: number;
    variant: number;
  };
  targetMetrics: string[];
  segmentationRules?: {
    userAttribute: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
    value: any;
  }[];
}

export class ABTestManager {
  private tests: Map<string, ABTestConfig> = new Map();

  registerTest(config: ABTestConfig): void {
    this.tests.set(config.testId, config);
  }

  determineVariant(testId: string, userId: string, userAttributes: Record<string, any>): 'control' | 'variant' {
    const test = this.tests.get(testId);
    if (!test) return 'control';

    // Check if test is active
    const now = new Date();
    if (now < test.startDate || now > test.endDate) {
      return 'control';
    }

    // Check segmentation rules
    if (test.segmentationRules) {
      const qualifies = test.segmentationRules.every(rule => {
        const value = userAttributes[rule.userAttribute];
        switch (rule.operator) {
          case 'equals':
            return value === rule.value;
          case 'contains':
            return value && value.includes(rule.value);
          case 'greater_than':
            return value > rule.value;
          case 'less_than':
            return value < rule.value;
          default:
            return false;
        }
      });

      if (!qualifies) return 'control';
    }

    // Consistent hash-based assignment
    const hash = this.hashUserId(userId + testId);
    const threshold = test.trafficSplit.variant / 100;

    return hash < threshold ? 'variant' : 'control';
  }

  private hashUserId(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) / Math.pow(2, 31);
  }

  trackEvent(testId: string, userId: string, variant: string, event: string, value?: number): void {
    // Send to analytics system
    console.log('AB Test Event:', {
      testId,
      userId,
      variant,
      event,
      value,
      timestamp: new Date().toISOString(),
    });
  }
}
```

---

## Feature Flags

### Feature Flag Service

```typescript
// src/feature-flags/feature-flag-service.ts
export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  conditions?: {
    userSegments?: string[];
    userAttributes?: Record<string, any>;
    environment?: string[];
  };
  variants?: {
    control: any;
    treatment: any;
  };
}

export class FeatureFlagService {
  private flags: Map<string, FeatureFlag> = new Map();

  constructor() {
    this.loadFlags();
  }

  isEnabled(flagKey: string, userId?: string, userAttributes?: Record<string, any>): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag || !flag.enabled) return false;

    // Check environment conditions
    if (flag.conditions?.environment) {
      const currentEnv = process.env.NODE_ENV || 'development';
      if (!flag.conditions.environment.includes(currentEnv)) {
        return false;
      }
    }

    // Check user conditions
    if (flag.conditions?.userAttributes && userAttributes) {
      const matches = Object.entries(flag.conditions.userAttributes).every(([key, value]) => {
        return userAttributes[key] === value;
      });
      if (!matches) return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100 && userId) {
      const hash = this.hashUserId(userId + flagKey);
      return hash < (flag.rolloutPercentage / 100);
    }

    return true;
  }

  getVariant(flagKey: string, userId?: string, userAttributes?: Record<string, any>): any {
    const flag = this.flags.get(flagKey);
    if (!flag || !flag.variants) return null;

    if (this.isEnabled(flagKey, userId, userAttributes)) {
      return flag.variants.treatment;
    }

    return flag.variants.control;
  }

  private hashUserId(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / Math.pow(2, 31);
  }

  private loadFlags(): void {
    // Load from configuration or external service
    const flags: FeatureFlag[] = [
      {
        key: 'new_neural_model',
        name: 'New Neural Model',
        description: 'Enable the new improved neural network model',
        enabled: true,
        rolloutPercentage: 25,
        conditions: {
          environment: ['staging', 'production'],
        },
      },
      {
        key: 'enhanced_ui',
        name: 'Enhanced UI',
        description: 'New user interface improvements',
        enabled: true,
        rolloutPercentage: 50,
        variants: {
          control: { theme: 'classic', layout: 'standard' },
          treatment: { theme: 'modern', layout: 'enhanced' },
        },
      },
    ];

    flags.forEach(flag => this.flags.set(flag.key, flag));
  }
}
```

### Feature Flag Middleware

```typescript
// src/feature-flags/middleware.ts
import { Request, Response, NextFunction } from 'express';
import { FeatureFlagService } from './feature-flag-service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    attributes: Record<string, any>;
  };
}

export function featureFlagMiddleware(flagService: FeatureFlagService) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Add feature flag helper to request
    req.featureFlags = {
      isEnabled: (flagKey: string) => {
        return flagService.isEnabled(
          flagKey,
          req.user?.id,
          req.user?.attributes
        );
      },
      getVariant: (flagKey: string) => {
        return flagService.getVariant(
          flagKey,
          req.user?.id,
          req.user?.attributes
        );
      },
    };

    next();
  };
}
```

---

## Progressive Rollouts

### Ring-based Deployment

```yaml
# k8s/deployment-strategies/progressive-rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: claude-flow-progressive
  namespace: production
spec:
  replicas: 20
  strategy:
    canary:
      steps:
      # Ring 0: Internal testing (5%)
      - setWeight: 5
      - pause:
          duration: 10m
      - analysis:
          templates:
          - templateName: ring-analysis
          args:
          - name: ring
            value: "0"

      # Ring 1: Early adopters (15%)
      - setWeight: 15
      - pause:
          duration: 30m
      - analysis:
          templates:
          - templateName: ring-analysis
          args:
          - name: ring
            value: "1"

      # Ring 2: General availability (50%)
      - setWeight: 50
      - pause:
          duration: 1h
      - analysis:
          templates:
          - templateName: ring-analysis
          args:
          - name: ring
            value: "2"

      # Ring 3: Full deployment (100%)
      - setWeight: 100

      trafficRouting:
        nginx:
          stableIngress: claude-flow-stable
          additionalIngressAnnotations:
            nginx.ingress.kubernetes.io/canary-by-header: "X-Ring"
            nginx.ingress.kubernetes.io/canary-by-header-pattern: "ring-[0-3]"
  selector:
    matchLabels:
      app: claude-flow-novice
  template:
    metadata:
      labels:
        app: claude-flow-novice
    spec:
      containers:
      - name: claude-flow-novice
        image: claude-flow-novice:v1.4.0
        env:
        - name: DEPLOYMENT_RING
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['rollouts-pod-template-hash']
```

### Automated Rollback

```yaml
# k8s/deployment-strategies/auto-rollback.yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: auto-rollback-analysis
  namespace: production
spec:
  args:
  - name: service-name
  - name: error-threshold
    value: "0.05"
  - name: latency-threshold
    value: "2.0"
  metrics:
  - name: error-rate
    interval: 30s
    count: 10
    successCondition: result[0] <= {{args.error-threshold}}
    failureLimit: 3
    provider:
      prometheus:
        address: http://prometheus.monitoring.svc.cluster.local:9090
        query: |
          sum(rate(http_requests_total{service="{{args.service-name}}",status=~"5.."}[1m])) /
          sum(rate(http_requests_total{service="{{args.service-name}}"}[1m]))

  - name: high-latency
    interval: 30s
    count: 10
    successCondition: result[0] <= {{args.latency-threshold}}
    failureLimit: 3
    provider:
      prometheus:
        address: http://prometheus.monitoring.svc.cluster.local:9090
        query: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{service="{{args.service-name}}"}[1m])) by (le)
          )

  - name: memory-usage
    interval: 60s
    count: 5
    successCondition: result[0] <= 0.8
    failureLimit: 2
    provider:
      prometheus:
        address: http://prometheus.monitoring.svc.cluster.local:9090
        query: |
          avg(container_memory_usage_bytes{pod=~"{{args.service-name}}-.*"}) /
          avg(container_spec_memory_limit_bytes{pod=~"{{args.service-name}}-.*"})
```

---

## Rollback Strategies

### Automated Rollback Script

```bash
#!/bin/bash
# scripts/emergency-rollback.sh

set -e

NAMESPACE=${NAMESPACE:-production}
ROLLOUT_NAME=${ROLLOUT_NAME:-claude-flow-canary}
REASON=${1:-"Emergency rollback triggered"}

echo "🚨 Emergency rollback initiated: ${REASON}"
echo "Namespace: ${NAMESPACE}"
echo "Rollout: ${ROLLOUT_NAME}"

# Abort current rollout
echo "⏹️ Aborting current rollout..."
kubectl argo rollouts abort ${ROLLOUT_NAME} -n ${NAMESPACE}

# Wait for abort to complete
echo "⏳ Waiting for rollout abort..."
kubectl wait --for=condition=Degraded rollout/${ROLLOUT_NAME} -n ${NAMESPACE} --timeout=60s || true

# Rollback to previous version
echo "🔄 Rolling back to previous version..."
kubectl argo rollouts undo ${ROLLOUT_NAME} -n ${NAMESPACE}

# Wait for rollback to complete
echo "⏳ Waiting for rollback to complete..."
kubectl rollout status rollout/${ROLLOUT_NAME} -n ${NAMESPACE} --timeout=300s

# Verify health
echo "🔍 Verifying application health..."
kubectl wait --for=condition=Available rollout/${ROLLOUT_NAME} -n ${NAMESPACE} --timeout=180s

# Send notification
echo "📢 Sending rollback notification..."
curl -X POST "${SLACK_WEBHOOK_URL}" \
  -H 'Content-type: application/json' \
  --data "{
    \"text\": \"🚨 Emergency rollback completed for ${ROLLOUT_NAME} in ${NAMESPACE}\",
    \"attachments\": [{
      \"color\": \"warning\",
      \"fields\": [{
        \"title\": \"Reason\",
        \"value\": \"${REASON}\",
        \"short\": false
      }, {
        \"title\": \"Namespace\",
        \"value\": \"${NAMESPACE}\",
        \"short\": true
      }, {
        \"title\": \"Rollout\",
        \"value\": \"${ROLLOUT_NAME}\",
        \"short\": true
      }]
    }]
  }"

echo "✅ Emergency rollback completed successfully!"
```

### Database Migration Rollback

```typescript
// src/deployment/migration-rollback.ts
import { Pool } from 'pg';

export class MigrationRollback {
  private db: Pool;

  constructor(connectionString: string) {
    this.db = new Pool({ connectionString });
  }

  async rollbackToVersion(targetVersion: string): Promise<void> {
    try {
      // Get current migration version
      const currentVersion = await this.getCurrentVersion();
      console.log(`Current version: ${currentVersion}`);
      console.log(`Target version: ${targetVersion}`);

      if (currentVersion === targetVersion) {
        console.log('Already at target version');
        return;
      }

      // Get migrations to rollback
      const migrationsToRollback = await this.getMigrationsToRollback(
        currentVersion,
        targetVersion
      );

      console.log(`Rolling back ${migrationsToRollback.length} migrations`);

      // Execute rollback migrations in reverse order
      for (const migration of migrationsToRollback.reverse()) {
        console.log(`Rolling back migration: ${migration.version}`);
        await this.executeMigration(migration.rollbackSql);
        await this.removeMigrationRecord(migration.version);
      }

      console.log('Database rollback completed successfully');
    } catch (error) {
      console.error('Database rollback failed:', error);
      throw error;
    }
  }

  private async getCurrentVersion(): Promise<string> {
    const result = await this.db.query(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
    );
    return result.rows[0]?.version || '0';
  }

  private async getMigrationsToRollback(currentVersion: string, targetVersion: string): Promise<Migration[]> {
    // Implementation to get migrations between versions
    return [];
  }

  private async executeMigration(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  private async removeMigrationRecord(version: string): Promise<void> {
    await this.db.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
  }
}

interface Migration {
  version: string;
  rollbackSql: string;
}
```

This comprehensive deployment strategies guide provides enterprise-grade patterns for safe, reliable deployments with automated analysis, rollback capabilities, and progressive rollout strategies suitable for production environments.