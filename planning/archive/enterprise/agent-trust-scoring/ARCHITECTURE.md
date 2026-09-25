# Agent Trust Scoring - Architecture

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      CFN v3 Agent Platform                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │  Agents    │  │  Agents    │  │  Agents    │                │
│  │ (1000+)    │  │            │  │            │                │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘                │
│         │                │                │                      │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
          │ All actions logged for trust scoring
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────┐
│               Trust Scoring Platform                             │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Behavior Collection Layer                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │ │
│  │  │ Action       │  │ Metrics      │  │ Event        │    │ │
│  │  │ Logger       │  │ Aggregator   │  │ Stream       │    │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │ │
│  └─────────┼──────────────────┼──────────────────┼────────────┘ │
│            │                  │                  │              │
│            ▼                  ▼                  ▼              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Time-Series Database (InfluxDB)                    │ │
│  │         • Agent actions (100K writes/sec)                  │ │
│  │         • Performance metrics                              │ │
│  │         • 90-day retention with aggregation                │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           │                                     │
│  ┌────────────────────────┼───────────────────────────────────┐ │
│  │         Trust Score Engine                                 │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │  Score Calculator (Python)                          │  │ │
│  │  │  • Multi-dimensional scoring                        │  │ │
│  │  │  • Real-time updates (<100ms)                       │  │ │
│  │  └─────────────────────┬───────────────────────────────┘  │ │
│  │                        │                                   │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │  Anomaly Detector (Scikit-learn)                    │  │ │
│  │  │  • Statistical anomaly detection (3-sigma)          │  │ │
│  │  │  • Pattern recognition (time-series analysis)       │  │ │
│  │  └─────────────────────┬───────────────────────────────┘  │ │
│  │                        │                                   │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │  Privilege Manager                                   │  │ │
│  │  │  • Auto tier assignment                             │  │ │
│  │  │  • Permission enforcement                           │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  └────────────────────────┼───────────────────────────────────┘ │
│                           │                                     │
│  ┌────────────────────────┼───────────────────────────────────┐ │
│  │         Storage & Cache Layer                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │ │
│  │  │ PostgreSQL   │  │ Redis Cache  │  │ S3 Archive   │    │ │
│  │  │ (Scores)     │  │ (Real-time)  │  │ (History)    │    │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │ │
│  └────────────────────────┼───────────────────────────────────┘ │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
    ▼                       ▼                       ▼
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│Dashboard │      │ Alert System │      │ API Gateway  │
│(React)   │      │(Slack, Email)│      │(REST/GraphQL)│
└──────────┘      └──────────────┘      └──────────────┘
```

---

## Component Breakdown

### 1. Behavior Collection Layer

**Technology:** Kafka + InfluxDB for high-throughput time-series data

**Components:**

#### 1.1 Action Logger
```typescript
// Kafka producer for agent actions
export class ActionLogger {
  async logAction(agentId: string, action: AgentAction): Promise<void> {
    const event = {
      agent_id: agentId,
      timestamp: Date.now(),
      action_type: action.type,
      resource: action.resource,
      success: action.result.success,
      duration_ms: action.duration,
      errors: action.errors,
      metadata: action.metadata
    };

    await this.kafka.send({
      topic: 'agent-actions',
      messages: [{ key: agentId, value: JSON.stringify(event) }]
    });
  }
}
```

#### 1.2 Metrics Aggregator (InfluxDB)
```sql
-- InfluxDB schema (line protocol)
agent_metrics,agent_id=backend-dev-001 success_rate=0.95,error_count=5,response_time=47 1700000000000

-- Continuous queries for aggregation
CREATE CONTINUOUS QUERY "agent_hourly_metrics"
ON cfn_trust
BEGIN
  SELECT
    mean(success_rate) AS avg_success_rate,
    sum(error_count) AS total_errors,
    mean(response_time) AS avg_response_time
  INTO agent_metrics_hourly
  FROM agent_metrics
  GROUP BY time(1h), agent_id
END
```

### 2. Trust Score Engine

**Database Schema (PostgreSQL):**
```sql
CREATE TABLE trust_scores (
    agent_id VARCHAR(100) PRIMARY KEY,
    overall_score NUMERIC(5,2) NOT NULL,
    accuracy_score NUMERIC(5,2),
    compliance_score NUMERIC(5,2),
    reliability_score NUMERIC(5,2),
    security_score NUMERIC(5,2),
    efficiency_score NUMERIC(5,2),
    tier VARCHAR(20) NOT NULL,
    trend VARCHAR(20),
    last_updated TIMESTAMP DEFAULT NOW(),
    CHECK (overall_score >= 0 AND overall_score <= 100),
    CHECK (tier IN ('TRUSTED', 'STANDARD', 'SUPERVISED', 'RESTRICTED'))
);

CREATE TABLE trust_score_history (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    overall_score NUMERIC(5,2),
    tier VARCHAR(20),
    change_reason VARCHAR(255),
    incident_id VARCHAR(100),
    FOREIGN KEY (agent_id) REFERENCES trust_scores(agent_id)
);

CREATE TABLE trust_incidents (
    incident_id VARCHAR(100) PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    incident_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20),
    trust_impact NUMERIC(5,2),
    description TEXT,
    remediation_steps JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP
);

CREATE INDEX idx_history_agent_time ON trust_score_history(agent_id, timestamp DESC);
CREATE INDEX idx_incidents_agent ON trust_incidents(agent_id, resolved);
```

**Cache Layer (Redis):**
```redis
# Trust score cache (5-minute TTL)
trust:score:{agent_id} = {
  "overall_score": 82.5,
  "tier": "STANDARD",
  "components": {...},
  "cached_at": 1700000000
}
EXPIRE trust:score:{agent_id} 300

# Recent behavior cache (1-minute TTL)
trust:behavior:{agent_id} = {
  "success_rate_1h": 0.95,
  "error_count_1h": 3,
  "violations_24h": 0
}
EXPIRE trust:behavior:{agent_id} 60
```

### 3. Anomaly Detection System

**Technology:** Python (scikit-learn) + Airflow for scheduled analysis

**ML Model Pipeline:**
```python
# models/anomaly_detector.py
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

class AnomalyDetectionModel:
    def __init__(self):
        self.model = IsolationForest(
            contamination=0.03,  # Expect 3% anomalies
            random_state=42
        )
        self.scaler = StandardScaler()

    def train(self, historical_data: pd.DataFrame):
        """Train on 30 days of normal behavior."""
        features = ['error_rate', 'api_call_volume', 'response_time',
                    'resource_access_count', 'cost_per_task']

        X = historical_data[features]
        X_scaled = self.scaler.fit_transform(X)

        self.model.fit(X_scaled)

    def predict_anomalies(self, current_data: pd.DataFrame) -> List[int]:
        """Predict anomalies in current behavior."""
        X = current_data[self.features]
        X_scaled = self.scaler.transform(X)

        predictions = self.model.predict(X_scaled)

        # -1 indicates anomaly in Isolation Forest
        anomaly_indices = np.where(predictions == -1)[0]

        return anomaly_indices.tolist()
```

**Airflow DAG:**
```python
# dags/trust_anomaly_detection.py
from airflow import DAG
from datetime import timedelta

default_args = {
    'owner': 'trust-team',
    'retries': 2,
    'retry_delay': timedelta(minutes=5)
}

dag = DAG(
    'trust_anomaly_detection',
    default_args=default_args,
    schedule_interval='*/5 * * * *',  # Every 5 minutes
    catchup=False
)

# Tasks
fetch_current_behavior = PythonOperator(
    task_id='fetch_current_behavior',
    python_callable=fetch_agent_behavior
)

detect_anomalies = PythonOperator(
    task_id='detect_anomalies',
    python_callable=run_anomaly_detection
)

send_alerts = PythonOperator(
    task_id='send_alerts',
    python_callable=send_anomaly_alerts
)

fetch_current_behavior >> detect_anomalies >> send_alerts
```

### 4. Privilege Management

**Policy Enforcement (OPA - Open Policy Agent):**
```rego
# policies/trust_based_access.rego
package cfn.trust

default allow = false

# TRUSTED tier (score >= 90)
allow {
    input.agent.trust_tier == "TRUSTED"
    input.action.risk_level in ["LOW", "MEDIUM", "HIGH"]
}

# STANDARD tier (score 70-89)
allow {
    input.agent.trust_tier == "STANDARD"
    input.action.risk_level in ["LOW", "MEDIUM"]
}

# SUPERVISED tier (score 50-69)
allow {
    input.agent.trust_tier == "SUPERVISED"
    input.action.risk_level == "LOW"
    input.action.approved_by != ""
}

# RESTRICTED tier (score < 50)
allow {
    input.agent.trust_tier == "RESTRICTED"
    false  # All operations blocked
}
```

**API for Privilege Checks:**
```typescript
// src/trust/privilege-checker.ts
export class PrivilegeChecker {
  async canPerformAction(
    agentId: string,
    action: AgentAction
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Get trust score from cache or DB
    const trustScore = await this.getTrustScore(agentId);

    // Query OPA for policy decision
    const decision = await this.opa.evaluate({
      input: {
        agent: {
          id: agentId,
          trust_tier: trustScore.tier,
          trust_score: trustScore.overall_score
        },
        action: {
          type: action.type,
          resource: action.resource,
          risk_level: this.assessRiskLevel(action)
        }
      },
      path: 'cfn/trust/allow'
    });

    return {
      allowed: decision.result,
      reason: decision.result ? undefined : `Insufficient trust (tier: ${trustScore.tier})`
    };
  }
}
```

---

## API Design

### REST API

```
# Trust Scores
GET    /api/v1/trust/agents/{agent_id}
GET    /api/v1/trust/agents/{agent_id}/history?days=30
PUT    /api/v1/trust/agents/{agent_id}/override  # Manual adjustment
POST   /api/v1/trust/agents/{agent_id}/incidents

# Anomalies
GET    /api/v1/trust/anomalies?severity=HIGH&resolved=false
GET    /api/v1/trust/anomalies/{anomaly_id}
PUT    /api/v1/trust/anomalies/{anomaly_id}/resolve

# Privileges
GET    /api/v1/trust/privileges/{agent_id}
POST   /api/v1/trust/privileges/check  # Check if action allowed

# Teams & Projects
GET    /api/v1/trust/teams/{team_id}
GET    /api/v1/trust/projects/{project_id}

# Benchmarks
GET    /api/v1/trust/benchmarks?domain=backend
```

### WebSocket for Real-Time Updates

```typescript
// WebSocket events
ws.on('connection', (socket) => {
  // Subscribe to agent trust updates
  socket.on('subscribe:agent', (agentId) => {
    trustEngine.on('score-updated', (data) => {
      if (data.agent_id === agentId) {
        socket.emit('trust-score-updated', data);
      }
    });
  });

  // Subscribe to anomaly alerts
  socket.on('subscribe:anomalies', () => {
    anomalyDetector.on('anomaly-detected', (anomaly) => {
      socket.emit('anomaly-alert', anomaly);
    });
  });
});
```

---

## Monitoring & Observability

### Metrics (Prometheus)

```yaml
# Trust Score Distribution
cfn_trust_score_distribution{tier="TRUSTED"} 245
cfn_trust_score_distribution{tier="STANDARD"} 532
cfn_trust_score_distribution{tier="SUPERVISED"} 89
cfn_trust_score_distribution{tier="RESTRICTED"} 12

# Anomaly Detection
cfn_trust_anomalies_detected_total{severity="HIGH"} 34
cfn_trust_anomalies_resolved_total 28

# Performance
cfn_trust_score_calculation_duration_seconds{quantile="0.95"} 0.087
cfn_trust_behavior_ingestion_rate_per_second 15420
```

### Alerts

```yaml
- alert: HighTrustScoreDecline
  expr: |
    (cfn_trust_score - cfn_trust_score offset 1h) < -20
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Agent trust score dropped >20 points in 1 hour"

- alert: CriticalAnomalyDetected
  expr: cfn_trust_anomalies_detected_total{severity="CRITICAL"} > 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Critical agent behavior anomaly detected"
```

---

## Deployment

### Kubernetes

```yaml
# k8s/trust-score-engine.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: trust-score-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: trust-score-engine
  template:
    spec:
      containers:
      - name: engine
        image: cfn/trust-score-engine:v1.0.0
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 2000m
            memory: 4Gi
        env:
        - name: INFLUXDB_URL
          value: "http://influxdb:8086"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: trust-score-engine-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: trust-score-engine
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## Migration Path

### Phase 1: Data Collection (Weeks 1-2)
- Deploy action logger to Kafka
- Set up InfluxDB for metrics
- Collect 2 weeks of baseline data

### Phase 2: Scoring Engine (Weeks 3-4)
- Implement trust score calculator
- Deploy PostgreSQL for score storage
- Build Redis cache layer
- Create trust score API

### Phase 3: Anomaly Detection (Weeks 5-6)
- Train ML models on baseline data
- Deploy Airflow for scheduled detection
- Integrate alert system

### Phase 4: Privilege Management (Weeks 7-8)
- Deploy OPA for policy enforcement
- Integrate with CFN orchestrator
- Automate tier transitions

---

**Document Version:** 1.0
**Last Updated:** 2024-11-17
**Author:** CFN System Architect
**Implementation:** 8 weeks, $150K engineering
