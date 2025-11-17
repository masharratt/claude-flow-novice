"""
Workflow Codification Monitoring Module

Provides comprehensive monitoring, metrics, health checks, and alerting
for the Workflow Codification Enhancement v2 system.

Features:
- Prometheus metrics for all 6 feature areas
- Health check endpoints (health, readiness, liveness)
- Alert rule definitions
- OpenAPI specification
- Grafana dashboards
"""

from src.workflow_codification.monitoring.prometheus_metrics import (
    PrometheusMetricsExporter,
    record_health_score,
    record_health_score_calculation_time,
    record_circuit_breaker_state,
    record_circuit_breaker_failure,
    record_regression_test,
    record_regression_test_pass_rate,
    record_pattern_recommendation,
    record_composite_execution,
    record_trace_created,
)

from src.workflow_codification.monitoring.health_checks import (
    create_health_check_app,
    get_health_manager,
)

from src.workflow_codification.monitoring.alerting import (
    get_alert_manager,
    trigger_health_score_drop,
    trigger_circuit_breaker_open,
    trigger_regression_test_failure,
)

__all__ = [
    'PrometheusMetricsExporter',
    'record_health_score',
    'record_health_score_calculation_time',
    'record_circuit_breaker_state',
    'record_circuit_breaker_failure',
    'record_regression_test',
    'record_regression_test_pass_rate',
    'record_pattern_recommendation',
    'record_composite_execution',
    'record_trace_created',
    'create_health_check_app',
    'get_health_manager',
    'get_alert_manager',
    'trigger_health_score_drop',
    'trigger_circuit_breaker_open',
    'trigger_regression_test_failure',
]
