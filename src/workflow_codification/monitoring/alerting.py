"""
Alerting rules and integration for Workflow Codification monitoring

Manages:
- Alert rule definitions
- Alert triggering logic
- Alert notifications
"""

import yaml
import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass
class AlertRule:
    """Represents an alert rule."""

    name: str
    expr: str
    severity: str
    duration: str
    description: str
    summary: str
    labels: Dict[str, str] = None

    def to_dict(self) -> Dict:
        """Convert to dictionary for YAML serialization."""
        return {
            'alert': self.name,
            'expr': self.expr,
            'for': self.duration,
            'labels': {'severity': self.severity, **(self.labels or {})},
            'annotations': {
                'summary': self.summary,
                'description': self.description,
            }
        }


class AlertManager:
    """Manages alert rules and triggering."""

    # Predefined alert rules
    HEALTH_SCORE_DROP = AlertRule(
        name='HealthScoreDrop',
        expr='(workflow_codification_health_score - workflow_codification_health_score offset 24h) < -10',
        severity='warning',
        duration='5m',
        summary='Health score dropped >10 points',
        description='Skill {{ $labels.skill_name }} health score dropped significantly'
    )

    CIRCUIT_BREAKER_OPEN = AlertRule(
        name='CircuitBreakerOpen',
        expr='workflow_codification_circuit_breaker_state == 2',
        severity='critical',
        duration='1m',
        summary='Circuit breaker open',
        description='Skill {{ $labels.skill_name }} circuit breaker is OPEN. Failures detected.'
    )

    REGRESSION_TEST_FAILURE = AlertRule(
        name='RegressionTestFailureRate',
        expr='workflow_codification_regression_test_pass_rate < 0.95',
        severity='warning',
        duration='5m',
        summary='Regression test pass rate below 95%',
        description='Skill {{ $labels.skill_name }} test pass rate is {{ $value | humanizePercentage }}'
    )

    HIGH_ERROR_RATE = AlertRule(
        name='HighCompositeErrorRate',
        expr='sum(rate(workflow_codification_composite_executions_total{status="failed"}[5m])) / sum(rate(workflow_codification_composite_executions_total[5m])) > 0.05',
        severity='warning',
        duration='5m',
        summary='High composite execution error rate',
        description='Error rate is {{ $value | humanizePercentage }}. Threshold: 5%'
    )

    PATTERN_RECOMMENDATION_DROP = AlertRule(
        name='PatternRecommendationAcceptanceDropped',
        expr='workflow_codification_pattern_recommendation_acceptance_rate < 0.5',
        severity='info',
        duration='10m',
        summary='Pattern recommendation acceptance rate dropped',
        description='Acceptance rate for {{ $labels.strength_level }} recommendations is {{ $value | humanizePercentage }}'
    )

    COMPOSITE_EXECUTION_TIMEOUT = AlertRule(
        name='CompositeExecutionTimeout',
        expr='histogram_quantile(0.95, workflow_codification_composite_execution_duration_seconds) > 300',
        severity='warning',
        duration='5m',
        summary='Composite execution P95 duration exceeds 5 minutes',
        description='95th percentile execution time for {{ $labels.composite_name }} is {{ $value }}s'
    )

    def __init__(self):
        """Initialize alert manager."""
        self.active_alerts: Dict[str, AlertRule] = {}
        self.alert_history: List[Dict] = []
        self.alert_rules = [
            self.HEALTH_SCORE_DROP,
            self.CIRCUIT_BREAKER_OPEN,
            self.REGRESSION_TEST_FAILURE,
            self.HIGH_ERROR_RATE,
            self.PATTERN_RECOMMENDATION_DROP,
            self.COMPOSITE_EXECUTION_TIMEOUT,
        ]

    def get_alert_rules(self) -> List[AlertRule]:
        """Get all defined alert rules."""
        return self.alert_rules

    def trigger_alert(self, rule_name: str, labels: Dict[str, str], value: Optional[float] = None):
        """
        Trigger an alert.

        Args:
            rule_name: Name of the alert rule
            labels: Labels for the alert (skill_name, composite_name, etc.)
            value: Alert value (metric value)
        """
        alert = next((r for r in self.alert_rules if r.name == rule_name), None)
        if not alert:
            logger.warning(f"Alert rule not found: {rule_name}")
            return

        alert_id = f"{rule_name}_{hash(frozenset(labels.items()))}"
        self.active_alerts[alert_id] = alert

        alert_event = {
            'timestamp': datetime.utcnow().isoformat(),
            'rule': rule_name,
            'severity': alert.severity,
            'labels': labels,
            'value': value,
            'summary': alert.summary,
            'description': alert.description,
        }

        self.alert_history.append(alert_event)
        logger.warning(f"ALERT TRIGGERED: {rule_name} - {alert.summary}")

    def resolve_alert(self, rule_name: str, labels: Dict[str, str]):
        """Resolve an active alert."""
        alert_id = f"{rule_name}_{hash(frozenset(labels.items()))}"
        if alert_id in self.active_alerts:
            del self.active_alerts[alert_id]
            logger.info(f"Alert resolved: {rule_name}")

    def get_active_alerts(self) -> List[Dict]:
        """Get all active alerts."""
        return [
            {
                'rule': rule.name,
                'severity': rule.severity,
                'summary': rule.summary,
            }
            for rule in self.active_alerts.values()
        ]

    def get_alert_history(self, limit: int = 100) -> List[Dict]:
        """Get alert history."""
        return self.alert_history[-limit:]

    def export_alert_rules_yaml(self) -> str:
        """
        Export alert rules as Prometheus alert rules YAML.

        Returns:
            YAML string suitable for Prometheus config
        """
        rules_dict = {
            'groups': [
                {
                    'name': 'workflow_codification',
                    'interval': '30s',
                    'rules': [rule.to_dict() for rule in self.alert_rules]
                }
            ]
        }
        return yaml.dump(rules_dict, default_flow_style=False, sort_keys=False)


# Global alert manager
_alert_manager = AlertManager()


def get_alert_manager() -> AlertManager:
    """Get the global alert manager instance."""
    return _alert_manager


def trigger_health_score_drop(skill_name: str, current_score: int, previous_score: int):
    """Trigger health score drop alert."""
    drop = previous_score - current_score
    _alert_manager.trigger_alert(
        'HealthScoreDrop',
        {'skill_name': skill_name},
        value=drop
    )


def trigger_circuit_breaker_open(skill_name: str):
    """Trigger circuit breaker open alert."""
    _alert_manager.trigger_alert(
        'CircuitBreakerOpen',
        {'skill_name': skill_name}
    )


def trigger_regression_test_failure(skill_name: str, pass_rate: float):
    """Trigger regression test failure alert."""
    _alert_manager.trigger_alert(
        'RegressionTestFailureRate',
        {'skill_name': skill_name},
        value=pass_rate
    )


def trigger_high_error_rate(composite_name: str, error_rate: float):
    """Trigger high error rate alert."""
    _alert_manager.trigger_alert(
        'HighCompositeErrorRate',
        {'composite_name': composite_name},
        value=error_rate
    )


def trigger_pattern_recommendation_drop(strength_level: str, acceptance_rate: float):
    """Trigger pattern recommendation acceptance drop alert."""
    _alert_manager.trigger_alert(
        'PatternRecommendationAcceptanceDropped',
        {'strength_level': strength_level},
        value=acceptance_rate
    )


def trigger_composite_execution_timeout(composite_name: str, duration: float):
    """Trigger composite execution timeout alert."""
    _alert_manager.trigger_alert(
        'CompositeExecutionTimeout',
        {'composite_name': composite_name},
        value=duration
    )


if __name__ == '__main__':
    """Export alert rules to YAML file."""
    import sys

    output_file = sys.argv[1] if len(sys.argv) > 1 else 'alert_rules.yaml'

    manager = get_alert_manager()
    yaml_content = manager.export_alert_rules_yaml()

    with open(output_file, 'w') as f:
        f.write(yaml_content)

    logger.info(f"Alert rules exported to {output_file}")
