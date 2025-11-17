"""
Component Score Calculators

Implements individual health score component calculations:
- Reliability Score (35% weight): Success rate from executions
- Performance Score (20% weight): Execution time vs baseline
- Edge Case Score (20% weight): Edge case handling effectiveness
- Documentation Score (10% weight): Documentation completeness
- Test Coverage Score (15% weight): Test coverage percentage
"""

import psycopg2
import os
import json
from typing import Optional
from decimal import Decimal


class ComponentScoreCalculator:
    """
    Calculates individual health score components

    Each component score is calculated independently and ranges from 0-100.
    """

    def __init__(self, db_config: dict):
        """
        Initialize calculator with database connection

        Args:
            db_config: PostgreSQL connection configuration
        """
        self.conn = psycopg2.connect(**db_config)

    def calculate_reliability_score(self, skill_name: str) -> float:
        """
        Calculate reliability score (35% weight)
        Based on success rate of last 100 executions

        Args:
            skill_name: Name of skill to analyze

        Returns:
            float: Reliability score (0-100)
        """
        with self.conn.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) FILTER (WHERE status = 'success') as successful,
                       COUNT(*) as total
                FROM skill_executions
                WHERE skill_id = %s
                ORDER BY execution_started_at DESC
                LIMIT 100
            """, (skill_name,))

            row = cursor.fetchone()
            if not row or row[1] == 0:
                return 0.0

            successful, total = row
            return (successful / total) * 100

    def calculate_performance_score(self, skill_name: str) -> float:
        """
        Calculate performance score (20% weight)
        Compare recent execution time to baseline

        Baseline: Median of first 20 executions
        Recent: Average of last 10 executions
        Score: (baseline / recent) * 100, capped at 100

        Args:
            skill_name: Name of skill to analyze

        Returns:
            float: Performance score (0-100)
        """
        with self.conn.cursor() as cursor:
            # Get baseline (median of first 20 executions)
            cursor.execute("""
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_duration_seconds)
                FROM (
                    SELECT execution_duration_seconds
                    FROM skill_executions
                    WHERE skill_id = %s
                    ORDER BY execution_started_at ASC
                    LIMIT 20
                ) baseline
            """, (skill_name,))

            baseline_row = cursor.fetchone()
            baseline = baseline_row[0] if baseline_row else None

            if not baseline or baseline == 0:
                return 100.0  # No baseline, assume perfect

            # Get recent average (last 10 executions)
            cursor.execute("""
                SELECT AVG(execution_duration_seconds)
                FROM (
                    SELECT execution_duration_seconds
                    FROM skill_executions
                    WHERE skill_id = %s
                    ORDER BY execution_started_at DESC
                    LIMIT 10
                ) recent
            """, (skill_name,))

            recent_row = cursor.fetchone()
            recent_avg = recent_row[0] if recent_row else None

            if not recent_avg or recent_avg == 0:
                return 100.0

            # Convert Decimal to float
            if isinstance(baseline, Decimal):
                baseline = float(baseline)
            if isinstance(recent_avg, Decimal):
                recent_avg = float(recent_avg)

            # Calculate ratio (capped at 100)
            ratio = (baseline / recent_avg) * 100
            return min(100, max(0, ratio))

    def calculate_edge_case_score(self, skill_name: str) -> float:
        """
        Calculate edge case score (20% weight)
        Inverse of edge case rate over last 90 days

        Score: max(0, 100 - (edge_cases / executions * 100))

        Args:
            skill_name: Name of skill to analyze

        Returns:
            float: Edge case score (0-100)
        """
        with self.conn.cursor() as cursor:
            # Count executions in last 90 days
            cursor.execute("""
                SELECT COUNT(*) FROM skill_executions
                WHERE skill_id = %s
                AND execution_started_at > NOW() - INTERVAL '90 days'
            """, (skill_name,))
            total_executions = cursor.fetchone()[0]

            if total_executions == 0:
                return 100.0  # No executions, no edge cases

            # Count edge cases in last 90 days
            cursor.execute("""
                SELECT COUNT(*) FROM edge_case_tracker
                WHERE skill_name = %s
                AND detected_at > NOW() - INTERVAL '90 days'
            """, (skill_name,))
            edge_cases = cursor.fetchone()[0]

            edge_case_rate = (edge_cases / total_executions) * 100
            return max(0, 100 - edge_case_rate)

    def calculate_documentation_score(self, skill_name: str) -> float:
        """
        Calculate documentation score (10% weight)
        Check for required documentation files

        Checks:
        - SKILL.md exists (25%)
        - README.md exists (25%)
        - examples/ directory exists (25%)
        - metadata.json exists (25%)

        Args:
            skill_name: Name of skill to analyze

        Returns:
            float: Documentation score (0-100)
        """
        skill_path = f"./.claude/skills/{skill_name}/"

        checks = {
            "SKILL.md": os.path.exists(f"{skill_path}SKILL.md"),
            "README.md": os.path.exists(f"{skill_path}README.md"),
            "examples": os.path.exists(f"{skill_path}examples/"),
            "metadata": os.path.exists(f"{skill_path}metadata.json")
        }

        passed = sum(1 for v in checks.values() if v)
        return (passed / len(checks)) * 100

    def calculate_test_coverage_score(self, skill_name: str) -> float:
        """
        Calculate test coverage score (15% weight)
        Read from metadata.json test_coverage field

        Args:
            skill_name: Name of skill to analyze

        Returns:
            float: Test coverage score (0-100)
        """
        metadata_path = f"./.claude/skills/{skill_name}/metadata.json"

        if not os.path.exists(metadata_path):
            return 0.0

        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
                return float(metadata.get("test_coverage", 0))
        except (json.JSONDecodeError, ValueError, IOError):
            return 0.0

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
