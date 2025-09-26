# Enterprise Integration Patterns

Production-ready integration patterns for large-scale enterprise deployments with Claude Flow.

## 🏢 Enterprise Architecture Patterns

### Service Mesh Integration
```typescript
// Enterprise service mesh coordination with Istio/Linkerd
const serviceMeshConfig = {
  topology: "mesh",
  maxAgents: 12,
  security: "mTLS",
  observability: "full"
};

// Parallel agent deployment for microservices
Task("Service Mesh Architect", `
  Design Istio service mesh configuration:
  - Configure ingress gateway and virtual services
  - Set up traffic policies and circuit breakers
  - Implement distributed tracing with Jaeger
  - Configure Grafana dashboards for monitoring
`, "system-architect");

Task("Security Engineer", `
  Implement zero-trust security model:
  - Configure mTLS between all services
  - Set up RBAC policies and service accounts
  - Implement JWT validation and OIDC integration
  - Configure network policies and security scanning
`, "security-manager");

Task("DevOps Engineer", `
  Automate deployment pipeline:
  - Create GitOps workflow with ArgoCD
  - Implement canary deployments with Flagger
  - Set up multi-cluster deployment strategy
  - Configure disaster recovery procedures
`, "cicd-engineer");
```

### Event-Driven Architecture
```javascript
// Enterprise event sourcing and CQRS implementation
Task("Event Architect", `
  Design event-driven microservices architecture:
  - Implement event sourcing with Apache Kafka
  - Design CQRS patterns for read/write separation
  - Create event schemas and versioning strategy
  - Set up event store with projections
`, "architect");

Task("Message Broker Specialist", `
  Configure enterprise message infrastructure:
  - Set up Kafka cluster with high availability
  - Implement schema registry with Confluent
  - Configure message routing and dead letter queues
  - Set up cross-datacenter replication
`, "integration-specialist");

Task("Monitoring Engineer", `
  Implement observability for event flows:
  - Set up distributed tracing across events
  - Create event flow visualization dashboards
  - Implement alerting for event processing delays
  - Configure log aggregation and correlation
`, "monitoring-specialist");
```

## 🔐 Security and Compliance

### Enterprise Authentication and Authorization
```typescript
// Multi-tenant authentication with enterprise SSO
interface EnterpriseAuthConfig {
  providers: {
    activeDirectory: ADConfig;
    okta: OktaConfig;
    auth0: Auth0Config;
    custom: CustomSAMLConfig;
  };
  multiTenant: boolean;
  rbac: RBACConfig;
  compliance: ComplianceConfig;
}

Task("Security Architect", `
  Design enterprise authentication system:
  - Implement OAuth 2.0/OIDC with PKCE
  - Configure SAML SSO for enterprise customers
  - Set up multi-factor authentication flows
  - Design role-based access control (RBAC)
  - Implement attribute-based access control (ABAC)
`, "security-manager");

Task("Compliance Engineer", `
  Ensure regulatory compliance:
  - Implement SOC 2 Type II controls
  - Configure GDPR data processing workflows
  - Set up HIPAA compliance for healthcare data
  - Implement PCI DSS for payment processing
  - Create audit trails and compliance reporting
`, "compliance-specialist");
```

### Zero-Trust Network Architecture
```yaml
# Zero-trust implementation with network segmentation
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: enterprise-zero-trust
spec:
  selector:
    matchLabels:
      app: enterprise-api
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/prod/sa/api-gateway"]
    - source:
        requestPrincipals: ["*"]
    to:
    - operation:
        methods: ["GET", "POST"]
    when:
    - key: source.certificate_fingerprint
      values: ["*"]
```

## 📊 Data Integration Patterns

### Enterprise Data Pipeline
```python
# Large-scale data processing with enterprise orchestration
from enterprise_integration import DataPipelineOrchestrator

Task("Data Architect", """
  Design enterprise data lake architecture:
  - Implement medallion architecture (bronze, silver, gold)
  - Set up data catalog with Apache Atlas
  - Design data lineage tracking system
  - Configure data quality monitoring
  - Implement data governance policies
""", "data-architect");

Task("ETL Engineer", """
  Build scalable data pipelines:
  - Create Apache Airflow DAGs for batch processing
  - Implement Kafka Streams for real-time processing
  - Set up Apache Spark jobs for large-scale analytics
  - Configure data validation and schema evolution
  - Implement incremental data loading strategies
""", "data-engineer");

Task("MLOps Engineer", """
  Create ML pipeline infrastructure:
  - Set up MLflow for model lifecycle management
  - Implement feature store with Feast
  - Configure model serving with Seldon Core
  - Set up A/B testing for model deployments
  - Implement model monitoring and drift detection
""", "ml-engineer");
```

### Multi-Database Integration
```sql
-- Enterprise database federation strategy
-- PostgreSQL for transactional data
CREATE TABLE enterprise_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transaction_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MongoDB for document storage
db.enterprise_documents.createIndex({
    "tenant_id": 1,
    "document_type": 1,
    "created_at": -1
});

-- Redis for caching and session management
CLUSTER NODES
SET session:user:12345 '{"tenant_id":"abc", "roles":["admin"]}'
EXPIRE session:user:12345 3600
```

## ☁️ Cloud-Native Integration

### Multi-Cloud Deployment Strategy
```terraform
# Terraform configuration for multi-cloud deployment
module "aws_infrastructure" {
  source = "./modules/aws"

  providers = {
    aws = aws.primary
  }

  cluster_config = {
    name = "claude-flow-aws"
    region = "us-east-1"
    node_groups = ["compute", "memory", "gpu"]
  }
}

module "azure_infrastructure" {
  source = "./modules/azure"

  providers = {
    azurerm = azurerm.primary
  }

  cluster_config = {
    name = "claude-flow-azure"
    location = "East US"
    node_pools = ["system", "user", "spot"]
  }
}

module "gcp_infrastructure" {
  source = "./modules/gcp"

  providers = {
    google = google.primary
  }

  cluster_config = {
    name = "claude-flow-gcp"
    region = "us-central1"
    node_pools = ["default", "preemptible"]
  }
}
```

### Container Orchestration
```yaml
# Kubernetes deployment with enterprise requirements
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow-enterprise
  labels:
    app: claude-flow
    tier: enterprise
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-flow
  template:
    metadata:
      labels:
        app: claude-flow
    spec:
      serviceAccountName: claude-flow-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        fsGroup: 10001
      containers:
      - name: claude-flow-api
        image: claude-flow:enterprise-v2.0.0
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: claude-flow-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

## 🔧 Integration Automation

### Enterprise CI/CD Pipeline
```yaml
# GitLab CI/CD configuration for enterprise deployment
stages:
  - security-scan
  - unit-tests
  - integration-tests
  - performance-tests
  - security-tests
  - staging-deploy
  - production-deploy
  - post-deploy-verification

variables:
  SECURE_FILES_DOWNLOAD_PATH: '/tmp'
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"

security-scan:
  stage: security-scan
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker run --rm -v "$PWD":/code sonarqube/sonar-scanner-cli
    - docker run --rm -v "$PWD":/code aquasec/trivy fs /code
    - docker run --rm -v "$PWD":/code securecodewarrior/docker-security-scan

integration-tests:
  stage: integration-tests
  services:
    - postgres:13
    - redis:6
    - kafka:latest
  variables:
    POSTGRES_DB: test_db
    POSTGRES_USER: test_user
    POSTGRES_PASSWORD: test_pass
  script:
    - npm run test:integration
    - npm run test:e2e
  artifacts:
    reports:
      junit: test-results.xml
      coverage: coverage.xml

production-deploy:
  stage: production-deploy
  image: google/cloud-sdk:alpine
  only:
    - main
  script:
    - gcloud auth activate-service-account --key-file $GCP_SERVICE_KEY
    - gcloud container clusters get-credentials $GKE_CLUSTER_NAME --zone $GCP_ZONE
    - kubectl apply -f k8s/production/
    - kubectl rollout status deployment/claude-flow-enterprise
```

## 📈 Monitoring and Observability

### Enterprise Monitoring Stack
```yaml
# Prometheus configuration for enterprise monitoring
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "claude-flow-alerts.yml"
  - "sla-rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'claude-flow-api'
    static_configs:
      - targets: ['claude-flow-api:8080']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'claude-flow-agents'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: claude-flow-agent
```

### Distributed Tracing
```javascript
// OpenTelemetry configuration for distributed tracing
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT,
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});

sdk.start();

// Custom span creation for agent coordination
const tracer = opentelemetry.trace.getTracer('claude-flow-enterprise');

async function coordinateAgents(taskId, agents) {
  return tracer.startActiveSpan('agent-coordination', async (span) => {
    span.setAttributes({
      'task.id': taskId,
      'agents.count': agents.length,
      'coordination.type': 'enterprise'
    });

    try {
      const results = await Promise.all(
        agents.map(agent =>
          tracer.startActiveSpan(`agent-${agent.type}`, async (agentSpan) => {
            agentSpan.setAttributes({
              'agent.type': agent.type,
              'agent.id': agent.id
            });
            return agent.execute();
          })
        )
      );

      span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
      return results;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: opentelemetry.SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    }
  });
}
```

## 🏗️ Enterprise Deployment Examples

### Complete Enterprise Stack
```bash
#!/bin/bash
# Enterprise deployment with full observability

# Initialize enterprise swarm with security
mcp__claude-flow__swarm_init --topology mesh --maxAgents 20 --security enterprise

# Deploy infrastructure agents
Task("Infrastructure Architect", "
  Design enterprise infrastructure:
  - Multi-region Kubernetes clusters
  - Service mesh with Istio
  - Centralized logging with ELK stack
  - Distributed monitoring with Prometheus
  - Disaster recovery and backup strategy
", "system-architect")

Task("Security Engineer", "
  Implement enterprise security:
  - Zero-trust network architecture
  - Identity and access management
  - Vulnerability scanning and remediation
  - Compliance monitoring and reporting
  - Incident response automation
", "security-manager")

Task("Platform Engineer", "
  Build platform engineering capabilities:
  - Internal developer platform (IDP)
  - Self-service infrastructure provisioning
  - Golden path templates and standards
  - Developer productivity metrics
  - Platform reliability engineering
", "platform-engineer")

Task("SRE Engineer", "
  Ensure site reliability:
  - SLA/SLO definition and monitoring
  - Error budget management
  - Chaos engineering practices
  - Runbook automation
  - Performance optimization
", "sre-engineer")
```

### High-Availability Configuration
```yaml
# Enterprise HA configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: claude-flow-enterprise-config
data:
  ha-config.yaml: |
    high_availability:
      enabled: true
      replication_factor: 3
      failover_timeout: 30s
      health_check_interval: 10s

    load_balancing:
      strategy: "round_robin"
      health_checks: true
      circuit_breaker:
        enabled: true
        failure_threshold: 5
        recovery_timeout: 30s

    database:
      primary_replica: "postgresql-primary.db.svc.cluster.local"
      read_replicas:
        - "postgresql-replica-1.db.svc.cluster.local"
        - "postgresql-replica-2.db.svc.cluster.local"
      connection_pooling:
        max_connections: 100
        min_connections: 10

    cache:
      redis_cluster:
        - "redis-1.cache.svc.cluster.local:6379"
        - "redis-2.cache.svc.cluster.local:6379"
        - "redis-3.cache.svc.cluster.local:6379"
      ttl_default: 3600
      eviction_policy: "allkeys-lru"
```

## 📋 Best Practices

### Enterprise Development Standards
1. **Code Quality**
   - 95%+ test coverage requirement
   - SonarQube quality gates
   - Security scanning in CI/CD
   - Performance benchmarking

2. **Architecture Governance**
   - Architecture Decision Records (ADRs)
   - API design standards
   - Data governance policies
   - Security by design principles

3. **Operational Excellence**
   - Comprehensive monitoring and alerting
   - Automated incident response
   - Disaster recovery procedures
   - Business continuity planning

4. **Compliance and Security**
   - Regular security audits
   - Compliance automation
   - Data protection measures
   - Access control policies

### Performance Optimization
```javascript
// Enterprise performance monitoring
const performanceConfig = {
  metrics: {
    responseTime: { target: '< 100ms', threshold: '< 500ms' },
    throughput: { target: '> 1000 rps', threshold: '> 500 rps' },
    errorRate: { target: '< 0.1%', threshold: '< 1%' },
    availability: { target: '99.99%', threshold: '99.9%' }
  },

  optimization: {
    caching: 'multi-tier',
    compression: 'gzip+brotli',
    cdn: 'global',
    database: 'read-replicas',
    monitoring: 'real-time'
  }
};
```

## 🔗 Related Documentation

- [Legacy Migration Examples](../legacy-migration/README.md)
- [Multi-Cloud Deployment](../multi-cloud/README.md)
- [Performance Optimization](../performance-optimization/README.md)
- [Real-Time Collaboration](../real-time-collaboration/README.md)
- [Troubleshooting Guide](../troubleshooting/README.md)

---

**Next Steps:**
1. Choose an enterprise pattern that matches your needs
2. Review the security and compliance requirements
3. Set up monitoring and observability
4. Implement automated testing and deployment
5. Monitor performance and optimize as needed