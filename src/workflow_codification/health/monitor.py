"""
Health Monitor

Background service for continuous skill health monitoring
- Periodic health checks (default: every 5 minutes)
- Alert on significant health drops (>10 points in 24 hours)
- Automatic recalculation after skill executions
"""

import time
from datetime import datetime, timedelta
from typing import List, Optional

from .calculator import HealthScoreCalculator


class HealthMonitor:
    """
    Background health monitoring service

    Monitors skill health continuously and sends alerts on significant degradation
    """

    def __init__(self, db_config: dict, check_interval: int = 300):
        """
        Initialize health monitor

        Args:
            db_config: PostgreSQL connection configuration
            check_interval: Interval between checks in seconds (default: 300 = 5 minutes)
        """
        self.calculator = HealthScoreCalculator(db_config)
        self.check_interval = check_interval
        self.running = False

    def start(self):
        """
        Start background monitoring

        Runs continuously until stop() is called
        """
        self.running = True
        print(f"Health Monitor started (interval: {self.check_interval}s)")

        while self.running:
            try:
                self._check_all_skills()
            except Exception as e:
                print(f"Error in health monitor loop: {e}")

            time.sleep(self.check_interval)

    def stop(self):
        """Stop background monitoring"""
        self.running = False
        print("Health Monitor stopped")

    def _check_all_skills(self):
        """
        Check health of all active skills

        Active skills are defined as skills with at least one execution in the last 30 days
        """
        active_skills = self._get_active_skills()

        print(f"Checking {len(active_skills)} active skills...")

        for skill_name in active_skills:
            try:
                # Calculate health score (bypass cache for monitoring)
                health_score = self.calculator.calculate_skill_health(skill_name, use_cache=False)

                # Check for significant drops
                self._check_for_drop(skill_name, health_score.overall_score)

            except Exception as e:
                print(f"Error monitoring {skill_name}: {e}")

    def _get_active_skills(self) -> List[str]:
        """
        Get list of skills that have been executed recently

        Returns:
            list: List of skill names with executions in last 30 days
        """
        conn = self.calculator.component_calculator.conn

        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT skill_id
                FROM skill_executions
                WHERE execution_started_at > NOW() - INTERVAL '30 days'
            """)

            return [row[0] for row in cursor.fetchall()]

    def _check_for_drop(self, skill_name: str, current_score: int):
        """
        Check if health score dropped significantly in last 24 hours

        Triggers alert if drop is >10 points

        Args:
            skill_name: Name of skill
            current_score: Current health score
        """
        conn = self.calculator.component_calculator.conn

        with conn.cursor() as cursor:
            # Get earliest score from last 24 hours
            cursor.execute("""
                SELECT overall_score
                FROM skill_health_history
                WHERE skill_name = %s
                AND calculated_at > NOW() - INTERVAL '24 hours'
                ORDER BY calculated_at ASC
                LIMIT 1
            """, (skill_name,))

            row = cursor.fetchone()
            if not row:
                # No previous score, nothing to compare
                return

            previous_score = row[0]
            drop = previous_score - current_score

            if drop > 10:
                self._send_alert(skill_name, previous_score, current_score, drop)

    def _send_alert(self, skill_name: str, previous_score: int, current_score: int, drop: int):
        """
        Send alert for significant health drop

        Currently prints to console. In production, would send to:
        - Slack
        - Email
        - PagerDuty
        - Monitoring dashboard

        Args:
            skill_name: Name of affected skill
            previous_score: Previous health score
            current_score: Current health score
            drop: Point drop amount
        """
        alert_message = (
            f"🚨 ALERT: {skill_name} health dropped {drop} points "
            f"(was {previous_score}, now {current_score})"
        )

        print(alert_message)

        # TODO: Integration with alerting systems
        # self._send_slack_alert(alert_message)
        # self._send_email_alert(skill_name, previous_score, current_score, drop)
        # self._send_pagerduty_alert(skill_name, "high", alert_message)

    def check_skill_now(self, skill_name: str) -> dict:
        """
        Immediately check health of a specific skill

        Useful for on-demand checks after deployments or changes

        Args:
            skill_name: Name of skill to check

        Returns:
            dict: Health score information
        """
        health_score = self.calculator.calculate_skill_health(skill_name, use_cache=False)

        return {
            "skill_name": skill_name,
            "overall_score": health_score.overall_score,
            "health_level": health_score.health_level,
            "components": {
                "reliability": health_score.reliability_score,
                "performance": health_score.performance_score,
                "edge_cases": health_score.edge_case_score,
                "documentation": health_score.documentation_score,
                "test_coverage": health_score.test_coverage_score
            },
            "calculated_at": health_score.calculated_at.isoformat()
        }

    def get_system_health_summary(self) -> dict:
        """
        Get overall system health summary

        Returns:
            dict: Summary of all active skills with health statistics
        """
        active_skills = self._get_active_skills()

        health_distribution = {
            "excellent": 0,
            "good": 0,
            "fair": 0,
            "poor": 0
        }

        total_score = 0
        skill_details = []

        for skill_name in active_skills:
            try:
                health_score = self.calculator.calculate_skill_health(skill_name, use_cache=True)

                health_distribution[health_score.health_level] += 1
                total_score += health_score.overall_score

                skill_details.append({
                    "skill_name": skill_name,
                    "overall_score": health_score.overall_score,
                    "health_level": health_score.health_level
                })

            except Exception as e:
                print(f"Error getting health for {skill_name}: {e}")

        average_score = total_score / len(active_skills) if active_skills else 0

        return {
            "total_skills": len(active_skills),
            "average_score": round(average_score, 2),
            "health_distribution": health_distribution,
            "skills": sorted(skill_details, key=lambda x: x["overall_score"])
        }

    def close(self):
        """Close all connections"""
        self.calculator.close()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.stop()
        self.close()
