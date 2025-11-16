# Workflow Codification Monitoring Setup Guide

## Overview

This guide provides comprehensive setup and usage instructions for the Workflow Codification Enhancement v2 monitoring system, which includes:

1. **Prometheus Metrics** - Expose system and feature metrics
2. **Health Checks** - Health, readiness, and liveness endpoints
3. **Alert Rules** - Automated alerting for critical conditions
4. **OpenAPI Specification** - Complete REST API documentation
5. **Grafana Dashboards** - Real-time monitoring visualizations

## Architecture

```
┌─────────────────────┐
│  Application Code    │
└──────────┬──────────┘
           │ Records metrics
           ▼
┌─────────────────────────────────────────┐
│  Monitoring Module                       │
│  ├── prometheus_metrics.py               │
│  ├── health_checks.py                    │
│  ├── alerting.py                         │
│  └── dashboards/                         │
│      ├── overview.json                   │
│      ├── health_scores.json              │
│      ├── circuit_breaker.json            │
│      ├── regression_testing.json         │
│      ├── pattern_recommender.json        │
│      └── skill_composition.json          │
└─────────────────────────────────────────┘
           │
           ├─────────────────┬──────────────┬──────────────┐
           ▼                 ▼              ▼              ▼
       Prometheus       Health Checks   Alerting Rules   API Docs
       (port 9090)      (port 8080)     (alert_rules.    (openapi.yaml)
                                         yaml)
```

## Installation

### Prerequisites

- Python 3.8+
- pip

### Setup Steps

1. **Install dependencies:**
   ```bash
   pip install -r requirements-monitoring.txt
   ```

2. **Verify installation:**
   ```bash
   python3 -c "import flask; import prometheus_client; import yaml; print('✅ All dependencies installed')"
   ```

3. **Run tests:**
   ```bash
   pytest tests/workflow_codification/monitoring/ -v
   ```

## Components

### 1. Prometheus Metrics

**Location:** `src/workflow_codification/monitoring/prometheus_metrics.py`

**Exported Metrics:**

#### Feature 1: Health Scores
- `workflow_codification_health_score` (Gauge)
- `workflow_codification_health_score_calculation_duration_seconds` (Histogram)

#### Feature 2: Circuit Breaker
- `workflow_codification_circuit_breaker_state` (Gauge: 0=CLOSED, 1=HALF_OPEN, 2=OPEN)
- `workflow_codification_circuit_breaker_failures_total` (Counter)
- `workflow_codification_circuit_breaker_recovery_time_seconds` (Histogram)

#### Feature 3: Regression Testing
- `workflow_codification_regression_tests_total` (Counter: pass/fail)
- `workflow_codification_regression_test_pass_rate` (Gauge: 0.0-1.0)
- `workflow_codification_regression_test_duration_seconds` (Histogram)

#### Feature 4: Pattern Recommender
- `workflow_codification_pattern_recommendations_total` (Counter)
- `workflow_codification_pattern_recommendation_acceptance_rate` (Gauge)
- `workflow_codification_pattern_recommendations_savings_usd` (Summary)

#### Feature 5: Skill Composition
- `workflow_codification_composite_executions_total` (Counter)
- `workflow_codification_composite_execution_duration_seconds` (Histogram)
- `workflow_codification_composite_skills_created_total` (Counter)

#### Feature 6: Execution Tracing
- `workflow_codification_traces_created_total` (Counter)
- `workflow_codification_trace_steps_total` (Summary)
- `workflow_codification_trace_duration_seconds` (Histogram)

**Usage:**

```python
from src.workflow_codification.monitoring.prometheus_metrics import (
    PrometheusMetricsExporter,
    record_health_score,
    record_circuit_breaker_state,
    record_regression_test,
)

# Start metrics exporter
exporter = PrometheusMetricsExporter(port=9090)
exporter.start()

# Record metrics
record_health_score("cfn-coordination", score=87, level="good")
record_circuit_breaker_state("health-scorer", "CLOSED")
record_regression_test("composite-skill", passed=True, duration=5.2)

# Access metrics at http://localhost:9090/metrics
```

### 2. Health Checks

**Location:** `src/workflow_codification/monitoring/health_checks.py`

**Endpoints:**

- `GET /health` - Overall system health (200 or 503)
- `GET /ready` - Readiness check (200 or 503)
- `GET /live` - Liveness check (always 200 if running)

**Usage:**

```python
from src.workflow_codification.monitoring.health_checks import create_health_check_app

app = create_health_check_app()
app.run(port=8080)

# Test endpoints
curl http://localhost:8080/health
curl http://localhost:8080/ready
curl http://localhost:8080/live
```

### 3. Alert Rules

**Location:** `src/workflow_codification/monitoring/alert_rules.yaml`

**Defined Alerts:**

1. **HealthScoreDrop** (WARNING)
   - Triggers when health score drops >10 points in 24h
   - Duration: 5 minutes

2. **CircuitBreakerOpen** (CRITICAL)
   - Triggers when circuit breaker state = OPEN
   - Duration: 1 minute
   - Immediate investigation required

3. **RegressionTestFailureRate** (WARNING)
   - Triggers when pass rate < 95%
   - Duration: 5 minutes

4. **HighCompositeErrorRate** (WARNING)
   - Triggers when error rate > 5%
   - Duration: 5 minutes
   - Threshold: 5%

5. **PatternRecommendationAcceptanceDropped** (INFO)
   - Triggers when acceptance rate < 50%
   - Duration: 10 minutes

6. **CompositeExecutionTimeout** (WARNING)
   - Triggers when P95 duration > 5 minutes
   - Duration: 5 minutes

**Integration with Prometheus:**

1. Copy `alert_rules.yaml` to Prometheus config directory:
   ```bash
   cp src/workflow_codification/monitoring/alert_rules.yaml /etc/prometheus/rules/
   ```

2. Update `prometheus.yml`:
   ```yaml
   global:
     scrape_interval: 15s

   rule_files:
     - "/etc/prometheus/rules/alert_rules.yaml"

   scrape_configs:
     - job_name: 'workflow-codification'
       static_configs:
         - targets: ['localhost:9090']

   alerting:
     alertmanagers:
       - static_configs:
           - targets: ['localhost:9093']  # AlertManager port
   ```

3. Restart Prometheus:
   ```bash
   sudo systemctl restart prometheus
   ```

### 4. OpenAPI Specification

**Location:** `openapi.yaml`

**Endpoints Documented:**

- `GET /health-scores/{skill_name}` - Health score metrics
- `GET /circuit-breaker/{skill_name}/state` - Circuit breaker state
- `POST /regression-tests/generate` - Generate test suite
- `GET /pattern-recommendations` - Get recommendations
- `POST /composite-skills/execute` - Execute composite skill
- `GET /traces/{trace_id}` - Get execution trace

**Validation:**

```bash
# Install OpenAPI validator
pip install openapi-spec-validator

# Validate spec
openapi-spec-validator openapi.yaml
```

**API Documentation:**

Serve the OpenAPI spec with Swagger UI:

```bash
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/spec/openapi.yaml \
  -v $(pwd)/openapi.yaml:/spec/openapi.yaml \
  swaggerapi/swagger-ui
```

Then visit: `http://localhost:8080`

### 5. Grafana Dashboards

**Location:** `src/workflow_codification/monitoring/dashboards/`

**Available Dashboards:**

1. **Overview** (`overview.json`)
   - Health score trends
   - Circuit breaker states
   - Test pass rates
   - Pattern recommendations count
   - Composite execution durations
   - Trace creation rate

2. **Health Scores** (`health_scores.json`)
   - Health scores by skill
   - Health level distribution
   - Score calculation duration
   - Recent changes

3. **Circuit Breaker** (`circuit_breaker.json`)
   - Circuit breaker states
   - Open breakers count
   - Cumulative failures
   - Failure rate
   - Recovery time

4. **Regression Testing** (`regression_testing.json`)
   - Pass rate by skill
   - Test execution count
   - Tests generated
   - Execution duration distribution
   - Pass/fail ratio

5. **Pattern Recommender** (`pattern_recommender.json`)
   - Recommendations by strength level
   - Acceptance rate
   - Total recommendations
   - Deployed recommendations
   - Projected savings (USD)

6. **Skill Composition** (`skill_composition.json`)
   - Composite execution status
   - Error rate
   - Execution duration by mode
   - Skills created count
   - Total executions

**Import Dashboards:**

1. Log into Grafana
2. Go to: `Home → Dashboards → Import`
3. Upload JSON file from `src/workflow_codification/monitoring/dashboards/`
4. Select Prometheus data source
5. Click "Import"

**Refresh Interval:** All dashboards use 15-second refresh interval

## Testing

### Run All Monitoring Tests

```bash
pytest tests/workflow_codification/monitoring/ -v --cov=src.workflow_codification.monitoring
```

### Test Coverage Report

```bash
pytest tests/workflow_codification/monitoring/ --cov=src.workflow_codification.monitoring --cov-report=html
open htmlcov/index.html
```

### Test Categories

```bash
# Test Prometheus metrics
pytest tests/workflow_codification/monitoring/test_monitoring.py::TestPrometheusMetrics -v

# Test health checks
pytest tests/workflow_codification/monitoring/test_monitoring.py::TestHealthChecks -v

# Test alert rules
pytest tests/workflow_codification/monitoring/test_monitoring.py::TestAlerting -v

# Test OpenAPI specification
pytest tests/workflow_codification/monitoring/test_monitoring.py::TestOpenAPISpecification -v

# Test Grafana dashboards
pytest tests/workflow_codification/monitoring/test_monitoring.py::TestGrafanaDashboards -v
```

## Best Practices

### Metrics Recording

1. **Always use helper functions:**
   ```python
   from src.workflow_codification.monitoring import record_health_score
   record_health_score("skill-name", 87, "good")
   ```

2. **Validate input values:**
   ```python
   # Valid: score 0-100, health_level in [excellent, good, fair, poor]
   record_health_score("skill", 87, "good")  # ✅
   record_health_score("skill", 150, "good")  # ❌ Raises ValueError
   ```

3. **Record with context:**
   - Always include relevant labels (skill_name, composite_name, etc.)
   - Record both success and failure metrics

### Alert Configuration

1. **Severity Levels:**
   - `critical`: Immediate action required (1 minute evaluation)
   - `warning`: Review within 5-10 minutes
   - `info`: Track but no immediate action needed

2. **Alert Thresholds:**
   - Tuned for production workloads
   - Adjust thresholds in `alert_rules.yaml` based on your SLOs
   - Common adjustments:
     - Health score drop threshold: line 14
     - Test pass rate threshold: line 36
     - Error rate threshold: line 47

### Dashboard Usage

1. **Real-time Monitoring:**
   - Use Overview dashboard for quick health check
   - 15-second refresh captures recent changes

2. **Drill-down Investigation:**
   - Click on panels to drill down to detailed dashboards
   - Use time selector to investigate historical trends

3. **Custom Dashboards:**
   - Export existing dashboards (gear icon → Export)
   - Customize for specific use cases
   - Re-import with new panels

## Troubleshooting

### Metrics Not Appearing

1. **Check exporter is running:**
   ```bash
   curl http://localhost:9090/metrics
   ```

2. **Verify Prometheus scrape config:**
   ```bash
   # Check prometheus.yml for correct target
   grep -A5 "job_name.*codification" /etc/prometheus/prometheus.yml
   ```

3. **Check logs:**
   ```bash
   # Application logs
   tail -f app.log | grep "prometheus"
   ```

### Alerts Not Triggering

1. **Verify alert rules loaded:**
   ```bash
   curl http://localhost:9090/api/v1/rules | jq '.data.groups'
   ```

2. **Check alert expressions:**
   ```bash
   # Test query in Prometheus
   http://localhost:9090/graph
   # Paste alert expression from alert_rules.yaml
   ```

3. **Verify AlertManager configuration:**
   ```bash
   curl http://localhost:9093/api/v1/status
   ```

### Dashboard Issues

1. **Empty panels:**
   - Check data source configuration
   - Verify metric names match prometheus output
   - Check time range selector

2. **Connection errors:**
   - Verify Prometheus endpoint in data source settings
   - Check network connectivity: `ping prometheus-host`
   - Review Grafana logs: `/var/log/grafana/grafana.log`

## Performance Considerations

### Metrics Cardinality

- Be cautious with high-cardinality labels (e.g., user_id)
- Recommended max labels per metric: 10
- Monitor Prometheus memory usage

### Dashboard Optimization

- Limit number of queries per panel (max 5)
- Use aggregation where possible
- Set appropriate refresh intervals (15-60s)

### Alert Tuning

- Avoid alert fatigue with appropriate thresholds
- Use alert grouping in AlertManager
- Implement silence rules for maintenance windows

## Next Steps

1. **Deploy monitoring stack:**
   - Set up Prometheus + Grafana
   - Import dashboards
   - Configure AlertManager

2. **Integrate with application:**
   - Start metrics exporter on application startup
   - Record metrics from feature implementations
   - Monitor health checks in orchestrator

3. **Set up alerting:**
   - Configure AlertManager backends (Slack, PagerDuty)
   - Implement escalation policies
   - Create runbooks for each alert

4. **Continuous improvement:**
   - Monitor alert signal-to-noise ratio
   - Adjust thresholds based on baseline data
   - Add custom dashboards for team-specific views

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.0)
- [Flask Documentation](https://flask.palletsprojects.com/)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review test output: `pytest -vv`
3. Check application logs for metric recording errors
4. Verify Prometheus and Grafana configurations
