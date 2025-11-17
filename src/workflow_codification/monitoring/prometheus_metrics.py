"""
Prometheus metrics integration for Workflow Codification monitoring

Exports metrics for all 6 features:
1. Health Score - Skill health tracking
2. Circuit Breaker - Failure isolation
3. Regression Testing - Test quality metrics
4. Pattern Recommender - Recommendation analytics
5. Skill Composition - Composite workflow tracking
6. Execution Tracing - Trace step metrics

Metrics endpoint: http://localhost:9090/metrics
"""

from prometheus_client import (
    Counter, Gauge, Histogram, Summary, generate_latest, CollectorRegistry
)
from flask import Flask, Response
import threading
import logging

logger = logging.getLogger(__name__)

# Global registry for metrics (default)
REGISTRY = CollectorRegistry()

# ============================================================================
# FEATURE 1: HEALTH SCORE METRICS
# ============================================================================

health_score_gauge = Gauge(
    'workflow_codification_health_score',
    'Current health score for skills (0-100)',
    ['skill_name', 'health_level'],
    registry=REGISTRY
)

health_score_calculation_duration = Histogram(
    'workflow_codification_health_score_calculation_duration_seconds',
    'Time to calculate health score',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0],
    registry=REGISTRY
)

# ============================================================================
# FEATURE 2: CIRCUIT BREAKER METRICS
# ============================================================================

circuit_breaker_state = Gauge(
    'workflow_codification_circuit_breaker_state',
    'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
    ['skill_name'],
    registry=REGISTRY
)

circuit_breaker_failures = Counter(
    'workflow_codification_circuit_breaker_failures_total',
    'Total circuit breaker failures',
    ['skill_name'],
    registry=REGISTRY
)

circuit_breaker_recovery_time = Histogram(
    'workflow_codification_circuit_breaker_recovery_time_seconds',
    'Time to recover from circuit breaker open state',
    ['skill_name'],
    buckets=[10, 30, 60, 300, 900, 1800],
    registry=REGISTRY
)

# ============================================================================
# FEATURE 3: REGRESSION TESTING METRICS
# ============================================================================

regression_tests_total = Counter(
    'workflow_codification_regression_tests_total',
    'Total regression tests executed',
    ['skill_name', 'result'],
    registry=REGISTRY
)

regression_test_pass_rate = Gauge(
    'workflow_codification_regression_test_pass_rate',
    'Regression test pass rate (0.0-1.0)',
    ['skill_name'],
    registry=REGISTRY
)

regression_test_duration = Histogram(
    'workflow_codification_regression_test_duration_seconds',
    'Regression test execution time',
    ['skill_name'],
    buckets=[1, 5, 10, 30, 60, 120, 300],
    registry=REGISTRY
)

regression_tests_generated = Counter(
    'workflow_codification_regression_tests_generated_total',
    'Total regression test suites generated',
    ['skill_name'],
    registry=REGISTRY
)

# ============================================================================
# FEATURE 4: PATTERN RECOMMENDER METRICS
# ============================================================================

pattern_recommendations_total = Counter(
    'workflow_codification_pattern_recommendations_total',
    'Total pattern recommendations generated',
    ['user_id', 'strength_level'],
    registry=REGISTRY
)

pattern_recommendation_acceptance_rate = Gauge(
    'workflow_codification_pattern_recommendation_acceptance_rate',
    'Pattern recommendation acceptance rate (0.0-1.0)',
    ['strength_level'],
    registry=REGISTRY
)

pattern_recommendations_savings_usd = Summary(
    'workflow_codification_pattern_recommendations_savings_usd',
    'Projected monthly savings from pattern recommendations (USD)',
    ['strength_level'],
    registry=REGISTRY
)

pattern_recommendations_deployed = Counter(
    'workflow_codification_pattern_recommendations_deployed_total',
    'Total pattern recommendations deployed',
    ['strength_level'],
    registry=REGISTRY
)

# ============================================================================
# FEATURE 5: SKILL COMPOSITION METRICS
# ============================================================================

composite_executions_total = Counter(
    'workflow_codification_composite_executions_total',
    'Total composite skill executions',
    ['composite_name', 'status'],
    registry=REGISTRY
)

composite_execution_duration = Histogram(
    'workflow_codification_composite_execution_duration_seconds',
    'Composite skill execution time',
    ['composite_name', 'execution_mode'],
    buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 300.0],
    registry=REGISTRY
)

composite_skills_created = Counter(
    'workflow_codification_composite_skills_created_total',
    'Total composite skills created',
    registry=REGISTRY
)

composite_execution_steps = Summary(
    'workflow_codification_composite_execution_steps',
    'Number of steps executed in composite workflows',
    ['composite_name'],
    registry=REGISTRY
)

# ============================================================================
# FEATURE 6: EXECUTION TRACING METRICS
# ============================================================================

traces_created_total = Counter(
    'workflow_codification_traces_created_total',
    'Total execution traces created',
    ['skill_name'],
    registry=REGISTRY
)

trace_steps_total = Summary(
    'workflow_codification_trace_steps_total',
    'Number of steps in traces',
    ['skill_name'],
    registry=REGISTRY
)

trace_duration = Histogram(
    'workflow_codification_trace_duration_seconds',
    'Total trace execution duration',
    ['skill_name'],
    buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0],
    registry=REGISTRY
)

trace_errors = Counter(
    'workflow_codification_trace_errors_total',
    'Total errors captured in traces',
    ['skill_name'],
    registry=REGISTRY
)

# ============================================================================
# CONVENIENCE FUNCTIONS FOR RECORDING METRICS
# ============================================================================

def record_health_score(skill_name: str, score: int, level: str):
    """
    Record a health score update for a skill.

    Args:
        skill_name: Name of the skill being scored
        score: Health score (0-100)
        level: Health level (excellent, good, fair, poor)
    """
    if not 0 <= score <= 100:
        raise ValueError(f"Score must be between 0 and 100, got {score}")
    if level not in ['excellent', 'good', 'fair', 'poor']:
        raise ValueError(f"Invalid health level: {level}")

    health_score_gauge.labels(skill_name=skill_name, health_level=level).set(score)
    logger.info(f"Recorded health score for {skill_name}: {score} ({level})")


def record_health_score_calculation_time(duration_seconds: float):
    """Record the time taken to calculate health score."""
    if duration_seconds < 0:
        raise ValueError("Duration must be non-negative")
    health_score_calculation_duration.observe(duration_seconds)


def record_circuit_breaker_state(skill_name: str, state: str):
    """
    Record circuit breaker state change.

    Args:
        skill_name: Name of the skill
        state: Circuit breaker state (CLOSED, HALF_OPEN, OPEN)
    """
    state_map = {"CLOSED": 0, "HALF_OPEN": 1, "OPEN": 2}
    if state not in state_map:
        raise ValueError(f"Invalid state: {state}")

    circuit_breaker_state.labels(skill_name=skill_name).set(state_map[state])
    logger.info(f"Circuit breaker for {skill_name} changed to {state}")


def record_circuit_breaker_failure(skill_name: str):
    """Record a circuit breaker failure."""
    circuit_breaker_failures.labels(skill_name=skill_name).inc()


def record_circuit_breaker_recovery_time(skill_name: str, duration_seconds: float):
    """Record the time taken to recover from circuit breaker open state."""
    circuit_breaker_recovery_time.labels(skill_name=skill_name).observe(duration_seconds)


def record_regression_test(skill_name: str, passed: bool, duration: float):
    """
    Record a regression test result.

    Args:
        skill_name: Name of the skill being tested
        passed: Whether the test passed
        duration: Test execution duration in seconds
    """
    result = "pass" if passed else "fail"
    regression_tests_total.labels(skill_name=skill_name, result=result).inc()
    regression_test_duration.labels(skill_name=skill_name).observe(duration)


def record_regression_test_pass_rate(skill_name: str, pass_rate: float):
    """
    Record the current regression test pass rate.

    Args:
        skill_name: Name of the skill
        pass_rate: Pass rate as float (0.0-1.0)
    """
    if not 0.0 <= pass_rate <= 1.0:
        raise ValueError(f"Pass rate must be between 0.0 and 1.0, got {pass_rate}")
    regression_test_pass_rate.labels(skill_name=skill_name).set(pass_rate)


def record_regression_test_suite_generated(skill_name: str):
    """Record that a regression test suite was generated."""
    regression_tests_generated.labels(skill_name=skill_name).inc()


def record_pattern_recommendation(user_id: str, strength_level: str):
    """
    Record a pattern recommendation.

    Args:
        user_id: User ID receiving the recommendation
        strength_level: Strength of recommendation (high, medium, low)
    """
    if strength_level not in ['high', 'medium', 'low']:
        raise ValueError(f"Invalid strength level: {strength_level}")
    pattern_recommendations_total.labels(user_id=user_id, strength_level=strength_level).inc()


def record_pattern_recommendation_acceptance_rate(strength_level: str, acceptance_rate: float):
    """
    Record pattern recommendation acceptance rate.

    Args:
        strength_level: Strength level (high, medium, low)
        acceptance_rate: Acceptance rate (0.0-1.0)
    """
    if not 0.0 <= acceptance_rate <= 1.0:
        raise ValueError(f"Acceptance rate must be between 0.0 and 1.0, got {acceptance_rate}")
    pattern_recommendation_acceptance_rate.labels(strength_level=strength_level).set(acceptance_rate)


def record_pattern_recommendation_savings(strength_level: str, savings_usd: float):
    """Record projected savings from pattern recommendation."""
    if savings_usd < 0:
        raise ValueError(f"Savings must be non-negative, got {savings_usd}")
    pattern_recommendations_savings_usd.labels(strength_level=strength_level).observe(savings_usd)


def record_pattern_recommendation_deployed(strength_level: str):
    """Record that a pattern recommendation was deployed."""
    pattern_recommendations_deployed.labels(strength_level=strength_level).inc()


def record_composite_execution(composite_name: str, status: str, duration: float, mode: str):
    """
    Record a composite skill execution.

    Args:
        composite_name: Name of the composite skill
        status: Execution status (success, failed)
        duration: Execution duration in seconds
        mode: Execution mode (sequential, parallel)
    """
    if status not in ['success', 'failed']:
        raise ValueError(f"Invalid status: {status}")
    if mode not in ['sequential', 'parallel']:
        raise ValueError(f"Invalid mode: {mode}")

    composite_executions_total.labels(composite_name=composite_name, status=status).inc()
    composite_execution_duration.labels(composite_name=composite_name, execution_mode=mode).observe(duration)


def record_composite_skill_created():
    """Record that a new composite skill was created."""
    composite_skills_created.inc()


def record_composite_execution_steps(composite_name: str, step_count: int):
    """Record the number of steps executed in a composite workflow."""
    if step_count < 0:
        raise ValueError(f"Step count must be non-negative, got {step_count}")
    composite_execution_steps.labels(composite_name=composite_name).observe(step_count)


def record_trace_created(skill_name: str, num_steps: int):
    """
    Record that an execution trace was created.

    Args:
        skill_name: Name of the skill being traced
        num_steps: Number of steps in the trace
    """
    if num_steps < 0:
        raise ValueError(f"Step count must be non-negative, got {num_steps}")
    traces_created_total.labels(skill_name=skill_name).inc()
    trace_steps_total.labels(skill_name=skill_name).observe(num_steps)


def record_trace_duration(skill_name: str, duration: float):
    """Record the duration of an execution trace."""
    if duration < 0:
        raise ValueError(f"Duration must be non-negative, got {duration}")
    trace_duration.labels(skill_name=skill_name).observe(duration)


def record_trace_error(skill_name: str):
    """Record an error captured in a trace."""
    trace_errors.labels(skill_name=skill_name).inc()


# ============================================================================
# PROMETHEUS METRICS EXPORTER
# ============================================================================

class PrometheusMetricsExporter:
    """
    Flask-based Prometheus metrics exporter.

    Exposes metrics at:
    - /metrics - Prometheus format metrics
    - /health - Service health status
    """

    def __init__(self, port=9090, host='0.0.0.0'):
        """
        Initialize metrics exporter.

        Args:
            port: Port to listen on (default: 9090)
            host: Host to bind to (default: 0.0.0.0)
        """
        self.port = port
        self.host = host
        self.app = Flask(__name__)
        self.setup_routes()

    def setup_routes(self):
        """Setup Flask routes for metrics and health."""

        @self.app.route('/metrics')
        def metrics():
            """Return Prometheus format metrics."""
            return Response(generate_latest(REGISTRY), mimetype='text/plain; charset=utf-8')

        @self.app.route('/health')
        def health():
            """Return basic health status."""
            return {
                "status": "healthy",
                "service": "workflow-codification-monitoring",
                "metrics_port": self.port
            }, 200

    def start(self):
        """Start metrics exporter in background thread."""
        thread = threading.Thread(target=self._run_server, daemon=True)
        thread.start()
        logger.info(f"Prometheus metrics exporter started on {self.host}:{self.port}")

    def _run_server(self):
        """Run Flask development server."""
        self.app.run(host=self.host, port=self.port, debug=False)

    def stop(self):
        """Stop the metrics exporter."""
        logger.info("Stopping metrics exporter")


# ============================================================================
# INITIALIZATION
# ============================================================================

if __name__ == '__main__':
    """Run metrics exporter as standalone service."""
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9090
    exporter = PrometheusMetricsExporter(port=port)

    logging.basicConfig(level=logging.INFO)
    logger.info(f"Starting Prometheus metrics exporter on port {port}")

    exporter.start()

    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down metrics exporter")
        exporter.stop()
