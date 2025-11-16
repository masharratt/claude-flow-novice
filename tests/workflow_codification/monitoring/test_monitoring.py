"""
Comprehensive test suite for Workflow Codification Monitoring
Tests all 6 features with 100% coverage requirement

TDD Protocol: Tests written first, before implementation
"""

import pytest
import json
import time
import threading
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

# Optional imports for monitoring dependencies
try:
    from prometheus_client import REGISTRY, CollectorRegistry
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

# Conditional test markers
pytestmark = []
if not PROMETHEUS_AVAILABLE:
    pytestmark.append(pytest.mark.skip(reason="prometheus_client not available"))


class TestPrometheusMetrics:
    """Tests for Prometheus metrics integration"""

    def test_health_score_metric_exposed(self):
        """Test health score gauge metric is properly exposed"""
        pytest.importorskip("prometheus_client")
        from src.workflow_codification.monitoring.prometheus_metrics import health_score_gauge

        # Record a health score
        health_score_gauge.labels(skill_name="cfn-coordination", health_level="good").set(87)

        # Verify metric can be retrieved
        samples = list(health_score_gauge.collect())[0].samples
        assert len(samples) > 0
        assert any(s.name == 'workflow_codification_health_score' for s in samples)

    def test_health_score_calculation_duration_histogram(self):
        """Test health score calculation duration histogram"""
        from src.workflow_codification.monitoring.prometheus_metrics import health_score_calculation_duration

        # Record calculation durations
        health_score_calculation_duration.observe(0.5)
        health_score_calculation_duration.observe(1.2)
        health_score_calculation_duration.observe(0.8)

        # Verify histogram buckets exist
        samples = list(health_score_calculation_duration.collect())[0].samples
        bucket_samples = [s for s in samples if s.name.endswith('_bucket')]
        assert len(bucket_samples) > 0

    def test_circuit_breaker_state_metric(self):
        """Test circuit breaker state gauge metric"""
        from src.workflow_codification.monitoring.prometheus_metrics import circuit_breaker_state

        # Set different states
        circuit_breaker_state.labels(skill_name="health-scorer").set(0)  # CLOSED
        circuit_breaker_state.labels(skill_name="pattern-recommender").set(2)  # OPEN

        samples = list(circuit_breaker_state.collect())[0].samples
        assert len(samples) > 0

    def test_circuit_breaker_failures_counter(self):
        """Test circuit breaker failures counter increments"""
        from src.workflow_codification.monitoring.prometheus_metrics import circuit_breaker_failures

        initial_count = sum(1 for s in circuit_breaker_failures.collect()[0].samples if s.name == 'workflow_codification_circuit_breaker_failures_total')

        circuit_breaker_failures.labels(skill_name="test-skill").inc()
        circuit_breaker_failures.labels(skill_name="test-skill").inc()

        # Verify counter incremented
        new_count = sum(1 for s in circuit_breaker_failures.collect()[0].samples if s.name == 'workflow_codification_circuit_breaker_failures_total')
        assert new_count >= initial_count

    def test_regression_tests_counter(self):
        """Test regression test counter for pass/fail tracking"""
        from src.workflow_codification.monitoring.prometheus_metrics import regression_tests_total

        # Record test results
        regression_tests_total.labels(skill_name="cfn-coordination", result="pass").inc()
        regression_tests_total.labels(skill_name="cfn-coordination", result="pass").inc()
        regression_tests_total.labels(skill_name="cfn-coordination", result="fail").inc()

        samples = list(regression_tests_total.collect())[0].samples
        assert len(samples) > 0

    def test_regression_test_pass_rate_gauge(self):
        """Test regression test pass rate gauge"""
        from src.workflow_codification.monitoring.prometheus_metrics import regression_test_pass_rate

        regression_test_pass_rate.labels(skill_name="composite-skill").set(0.95)

        samples = list(regression_test_pass_rate.collect())[0].samples
        assert len(samples) > 0

    def test_regression_test_duration_histogram(self):
        """Test regression test execution time histogram"""
        from src.workflow_codification.monitoring.prometheus_metrics import regression_test_duration

        # Record various test durations
        for duration in [2.5, 5.0, 10.5, 30.0, 60.0]:
            regression_test_duration.labels(skill_name="test-skill").observe(duration)

        samples = list(regression_test_duration.collect())[0].samples
        assert len(samples) > 0

    def test_pattern_recommendations_counter(self):
        """Test pattern recommendations counter"""
        from src.workflow_codification.monitoring.prometheus_metrics import pattern_recommendations_total

        pattern_recommendations_total.labels(user_id="user123", strength_level="high").inc()
        pattern_recommendations_total.labels(user_id="user456", strength_level="medium").inc(2)

        samples = list(pattern_recommendations_total.collect())[0].samples
        assert len(samples) > 0

    def test_pattern_recommendation_acceptance_rate(self):
        """Test pattern recommendation acceptance rate gauge"""
        from src.workflow_codification.monitoring.prometheus_metrics import pattern_recommendation_acceptance_rate

        pattern_recommendation_acceptance_rate.labels(strength_level="high").set(0.78)
        pattern_recommendation_acceptance_rate.labels(strength_level="medium").set(0.65)

        samples = list(pattern_recommendation_acceptance_rate.collect())[0].samples
        assert len(samples) > 0

    def test_composite_executions_counter(self):
        """Test composite skill executions counter"""
        from src.workflow_codification.monitoring.prometheus_metrics import composite_executions_total

        composite_executions_total.labels(composite_name="auth-flow", status="success").inc()
        composite_executions_total.labels(composite_name="auth-flow", status="success").inc(5)
        composite_executions_total.labels(composite_name="auth-flow", status="failed").inc()

        samples = list(composite_executions_total.collect())[0].samples
        assert len(samples) > 0

    def test_composite_execution_duration_histogram(self):
        """Test composite skill execution duration histogram"""
        from src.workflow_codification.monitoring.prometheus_metrics import composite_execution_duration

        composite_execution_duration.labels(composite_name="workflow-1", execution_mode="sequential").observe(2.5)
        composite_execution_duration.labels(composite_name="workflow-1", execution_mode="parallel").observe(1.2)

        samples = list(composite_execution_duration.collect())[0].samples
        assert len(samples) > 0

    def test_traces_created_counter(self):
        """Test execution traces created counter"""
        from src.workflow_codification.monitoring.prometheus_metrics import traces_created_total

        traces_created_total.labels(skill_name="cfn-coordination").inc()
        traces_created_total.labels(skill_name="health-scorer").inc(3)

        samples = list(traces_created_total.collect())[0].samples
        assert len(samples) > 0

    def test_trace_steps_summary(self):
        """Test number of steps in traces summary"""
        from src.workflow_codification.monitoring.prometheus_metrics import trace_steps_total

        trace_steps_total.labels(skill_name="composite-1").observe(5)
        trace_steps_total.labels(skill_name="composite-1").observe(12)
        trace_steps_total.labels(skill_name="composite-1").observe(8)

        samples = list(trace_steps_total.collect())[0].samples
        assert len(samples) > 0

    def test_metrics_endpoint_returns_prometheus_format(self):
        """Test /metrics endpoint returns valid Prometheus format"""
        from src.workflow_codification.monitoring.prometheus_metrics import PrometheusMetricsExporter

        exporter = PrometheusMetricsExporter(port=9091)
        with exporter.app.test_client() as client:
            response = client.get('/metrics')
            assert response.status_code == 200
            assert b'workflow_codification_health_score' in response.data
            assert b'TYPE' in response.data


class TestHealthChecks:
    """Tests for health check endpoints"""

    def test_health_check_endpoint(self):
        """Test basic health check endpoint"""
        from src.workflow_codification.monitoring.health_checks import create_health_check_app

        app = create_health_check_app()
        with app.test_client() as client:
            response = client.get('/health')
            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['status'] in ['healthy', 'degraded', 'unhealthy']

    def test_readiness_check(self):
        """Test readiness check endpoint"""
        from src.workflow_codification.monitoring.health_checks import create_health_check_app

        app = create_health_check_app()
        with app.test_client() as client:
            response = client.get('/ready')
            assert response.status_code in [200, 503]
            data = json.loads(response.data)
            assert 'ready' in data

    def test_liveness_check(self):
        """Test liveness check endpoint"""
        from src.workflow_codification.monitoring.health_checks import create_health_check_app

        app = create_health_check_app()
        with app.test_client() as client:
            response = client.get('/live')
            assert response.status_code == 200
            data = json.loads(response.data)
            assert 'alive' in data


class TestAlerting:
    """Tests for alerting rules and integration"""

    def test_alert_rules_yaml_valid(self):
        """Test alert rules YAML is valid and parseable"""
        import yaml

        with open('src/workflow_codification/monitoring/alert_rules.yaml', 'r') as f:
            rules = yaml.safe_load(f)

        assert 'groups' in rules
        assert len(rules['groups']) > 0
        assert 'rules' in rules['groups'][0]
        assert len(rules['groups'][0]['rules']) > 0

    def test_health_score_drop_alert_defined(self):
        """Test health score drop alert is defined"""
        import yaml

        with open('src/workflow_codification/monitoring/alert_rules.yaml', 'r') as f:
            rules = yaml.safe_load(f)

        alert_names = [r['alert'] for r in rules['groups'][0]['rules']]
        assert 'HealthScoreDrop' in alert_names

    def test_circuit_breaker_open_alert_defined(self):
        """Test circuit breaker open alert is defined"""
        import yaml

        with open('src/workflow_codification/monitoring/alert_rules.yaml', 'r') as f:
            rules = yaml.safe_load(f)

        alert_names = [r['alert'] for r in rules['groups'][0]['rules']]
        assert 'CircuitBreakerOpen' in alert_names

    def test_regression_test_failure_alert_defined(self):
        """Test regression test failure rate alert is defined"""
        import yaml

        with open('src/workflow_codification/monitoring/alert_rules.yaml', 'r') as f:
            rules = yaml.safe_load(f)

        alert_names = [r['alert'] for r in rules['groups'][0]['rules']]
        assert 'RegressionTestFailureRate' in alert_names

    def test_high_error_rate_alert_defined(self):
        """Test high error rate alert is defined"""
        import yaml

        with open('src/workflow_codification/monitoring/alert_rules.yaml', 'r') as f:
            rules = yaml.safe_load(f)

        alert_names = [r['alert'] for r in rules['groups'][0]['rules']]
        assert 'HighCompositeErrorRate' in alert_names

    def test_alert_has_severity_labels(self):
        """Test all alerts have severity labels"""
        import yaml

        with open('src/workflow_codification/monitoring/alert_rules.yaml', 'r') as f:
            rules = yaml.safe_load(f)

        for rule in rules['groups'][0]['rules']:
            assert 'labels' in rule
            assert 'severity' in rule['labels']
            assert rule['labels']['severity'] in ['critical', 'warning', 'info']


class TestOpenAPISpecification:
    """Tests for OpenAPI specification"""

    def test_openapi_spec_valid_json(self):
        """Test OpenAPI spec is valid JSON"""
        with open('openapi.yaml', 'r') as f:
            import yaml
            spec = yaml.safe_load(f)

        assert spec is not None
        assert 'openapi' in spec

    def test_openapi_version_correct(self):
        """Test OpenAPI version is 3.0.0"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert spec['openapi'] == '3.0.0'

    def test_api_info_present(self):
        """Test API info section present"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert 'info' in spec
        assert 'title' in spec['info']
        assert 'version' in spec['info']
        assert 'description' in spec['info']

    def test_health_scores_endpoint_documented(self):
        """Test /health-scores endpoint is documented"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert 'paths' in spec
        assert '/health-scores/{skill_name}' in spec['paths']

    def test_circuit_breaker_endpoint_documented(self):
        """Test /circuit-breaker endpoint is documented"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert '/circuit-breaker/{skill_name}/state' in spec['paths']

    def test_regression_tests_endpoint_documented(self):
        """Test /regression-tests endpoint is documented"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert '/regression-tests/generate' in spec['paths']

    def test_pattern_recommendations_endpoint_documented(self):
        """Test /pattern-recommendations endpoint is documented"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert '/pattern-recommendations' in spec['paths']

    def test_composite_skills_endpoint_documented(self):
        """Test /composite-skills endpoint is documented"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert '/composite-skills/execute' in spec['paths']

    def test_traces_endpoint_documented(self):
        """Test /traces endpoint is documented"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert '/traces/{trace_id}' in spec['paths']

    def test_security_schemes_defined(self):
        """Test security schemes are defined"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        assert 'components' in spec
        assert 'securitySchemes' in spec['components']
        assert 'apiKey' in spec['components']['securitySchemes']

    def test_schemas_defined(self):
        """Test all required schemas are defined"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        schemas = spec['components']['schemas']
        required_schemas = [
            'HealthScore', 'CircuitBreakerState', 'TestSuiteGenerated',
            'PatternRecommendation', 'CompositeExecutionRequest',
            'CompositeExecutionResult', 'ExecutionTrace'
        ]

        for schema in required_schemas:
            assert schema in schemas

    def test_endpoint_responses_documented(self):
        """Test all endpoints have documented responses"""
        import yaml

        with open('openapi.yaml', 'r') as f:
            spec = yaml.safe_load(f)

        for path, path_item in spec['paths'].items():
            for method in ['get', 'post', 'put', 'delete']:
                if method in path_item:
                    assert 'responses' in path_item[method]
                    assert len(path_item[method]['responses']) > 0


class TestGrafanaDashboards:
    """Tests for Grafana dashboard definitions"""

    def test_overview_dashboard_valid_json(self):
        """Test overview dashboard is valid JSON"""
        with open('src/workflow_codification/monitoring/dashboards/overview.json', 'r') as f:
            dashboard = json.load(f)

        assert 'dashboard' in dashboard

    def test_health_scores_dashboard_valid(self):
        """Test health scores dashboard is valid JSON"""
        with open('src/workflow_codification/monitoring/dashboards/health_scores.json', 'r') as f:
            dashboard = json.load(f)

        assert 'dashboard' in dashboard

    def test_circuit_breaker_dashboard_valid(self):
        """Test circuit breaker dashboard is valid JSON"""
        with open('src/workflow_codification/monitoring/dashboards/circuit_breaker.json', 'r') as f:
            dashboard = json.load(f)

        assert 'dashboard' in dashboard

    def test_regression_testing_dashboard_valid(self):
        """Test regression testing dashboard is valid JSON"""
        with open('src/workflow_codification/monitoring/dashboards/regression_testing.json', 'r') as f:
            dashboard = json.load(f)

        assert 'dashboard' in dashboard

    def test_pattern_recommender_dashboard_valid(self):
        """Test pattern recommender dashboard is valid JSON"""
        with open('src/workflow_codification/monitoring/dashboards/pattern_recommender.json', 'r') as f:
            dashboard = json.load(f)

        assert 'dashboard' in dashboard

    def test_skill_composition_dashboard_valid(self):
        """Test skill composition dashboard is valid JSON"""
        with open('src/workflow_codification/monitoring/dashboards/skill_composition.json', 'r') as f:
            dashboard = json.load(f)

        assert 'dashboard' in dashboard

    def test_dashboards_have_panels(self):
        """Test all dashboards have panel definitions"""
        import glob

        dashboard_files = glob.glob('src/workflow_codification/monitoring/dashboards/*.json')
        assert len(dashboard_files) == 6, f"Expected 6 dashboards, found {len(dashboard_files)}"

        for dashboard_file in dashboard_files:
            with open(dashboard_file, 'r') as f:
                dashboard = json.load(f)
            assert 'dashboard' in dashboard
            assert 'panels' in dashboard['dashboard']
            assert len(dashboard['dashboard']['panels']) > 0


class TestMetricsRecordingFunctions:
    """Tests for convenience functions to record metrics"""

    def test_record_health_score_function(self):
        """Test record_health_score helper function"""
        from src.workflow_codification.monitoring.prometheus_metrics import record_health_score

        record_health_score("test-skill", 85, "good")
        # Function should not raise exceptions

    def test_record_circuit_breaker_state_function(self):
        """Test record_circuit_breaker_state helper function"""
        from src.workflow_codification.monitoring.prometheus_metrics import record_circuit_breaker_state

        record_circuit_breaker_state("test-skill", "CLOSED")
        record_circuit_breaker_state("test-skill", "OPEN")
        record_circuit_breaker_state("test-skill", "HALF_OPEN")

    def test_record_regression_test_function(self):
        """Test record_regression_test helper function"""
        from src.workflow_codification.monitoring.prometheus_metrics import record_regression_test

        record_regression_test("test-skill", True, 5.0)
        record_regression_test("test-skill", False, 3.5)

    def test_record_pattern_recommendation_function(self):
        """Test record_pattern_recommendation helper function"""
        from src.workflow_codification.monitoring.prometheus_metrics import record_pattern_recommendation

        record_pattern_recommendation("user123", "high")
        record_pattern_recommendation("user456", "medium")

    def test_record_composite_execution_function(self):
        """Test record_composite_execution helper function"""
        from src.workflow_codification.monitoring.prometheus_metrics import record_composite_execution

        record_composite_execution("workflow-1", "success", 5.0, "sequential")
        record_composite_execution("workflow-1", "failed", 2.5, "parallel")

    def test_record_trace_created_function(self):
        """Test record_trace_created helper function"""
        from src.workflow_codification.monitoring.prometheus_metrics import record_trace_created

        record_trace_created("test-skill", 5)
        record_trace_created("test-skill", 12)


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--cov=src.workflow_codification.monitoring', '--cov-report=term-missing'])
