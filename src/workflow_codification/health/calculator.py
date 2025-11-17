"""
Health Score Calculator

Main calculator that computes overall health scores from component scores
Integrates with cache and stores history in PostgreSQL
"""

import psycopg2
from typing import Optional

from .component_scores import ComponentScoreCalculator
from .models import HealthScore
from ..redis.health_score_cache import HealthScoreCache


class HealthScoreCalculator:
    """
    Main health score calculator

    Computes weighted overall health score from five components:
    - Reliability (35%)
    - Performance (20%)
    - Edge Cases (20%)
    - Documentation (10%)
    - Test Coverage (15%)

    Health Levels:
    - Excellent: 90-100
    - Good: 75-89
    - Fair: 60-74
    - Poor: <60
    """

    # Component weights (must sum to 1.0)
    WEIGHTS = {
        "reliability": 0.35,
        "performance": 0.20,
        "edge_cases": 0.20,
        "documentation": 0.10,
        "test_coverage": 0.15
    }

    # Health level thresholds
    HEALTH_LEVELS = [
        (90, "excellent"),
        (75, "good"),
        (60, "fair"),
        (0, "poor")
    ]

    def __init__(self, db_config: dict):
        """
        Initialize health score calculator

        Args:
            db_config: PostgreSQL connection configuration
        """
        self.component_calculator = ComponentScoreCalculator(db_config)
        self.cache = HealthScoreCache()
        self.db_config = db_config

    def calculate_skill_health(self, skill_name: str, use_cache: bool = True) -> HealthScore:
        """
        Calculate complete health score for a skill

        Args:
            skill_name: Name of skill to analyze
            use_cache: Whether to use cached value if available (default: True)

        Returns:
            HealthScore: Complete health score with all components
        """
        # Check cache first
        if use_cache:
            cached = self.cache.get(skill_name)
            if cached:
                return HealthScore.from_dict(cached)

        # Calculate all component scores
        reliability_score = self.component_calculator.calculate_reliability_score(skill_name)
        performance_score = self.component_calculator.calculate_performance_score(skill_name)
        edge_case_score = self.component_calculator.calculate_edge_case_score(skill_name)
        documentation_score = self.component_calculator.calculate_documentation_score(skill_name)
        test_coverage_score = self.component_calculator.calculate_test_coverage_score(skill_name)

        # Calculate weighted overall score
        overall_score = (
            reliability_score * self.WEIGHTS["reliability"] +
            performance_score * self.WEIGHTS["performance"] +
            edge_case_score * self.WEIGHTS["edge_cases"] +
            documentation_score * self.WEIGHTS["documentation"] +
            test_coverage_score * self.WEIGHTS["test_coverage"]
        )
        overall_score = round(overall_score)

        # Determine health level
        health_level = self._determine_health_level(overall_score)

        # Create result object
        result = HealthScore(
            skill_name=skill_name,
            overall_score=overall_score,
            reliability_score=round(reliability_score, 2),
            performance_score=round(performance_score, 2),
            edge_case_score=round(edge_case_score, 2),
            documentation_score=round(documentation_score, 2),
            test_coverage_score=round(test_coverage_score, 2),
            health_level=health_level
        )

        # Store in cache
        self.cache.set(skill_name, result.to_dict())

        # Store in PostgreSQL history
        self._store_in_history(result)

        return result

    def _determine_health_level(self, score: int) -> str:
        """
        Determine health level based on overall score

        Args:
            score: Overall health score (0-100)

        Returns:
            str: Health level (excellent, good, fair, poor)
        """
        for threshold, level in self.HEALTH_LEVELS:
            if score >= threshold:
                return level
        return "poor"

    def _store_in_history(self, health_score: HealthScore):
        """
        Store health score in PostgreSQL history table

        Args:
            health_score: HealthScore object to store
        """
        conn = psycopg2.connect(**self.db_config)
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO skill_health_history
                    (skill_name, overall_score, reliability_score, performance_score,
                     edge_case_score, documentation_score, test_coverage_score, health_level)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    health_score.skill_name,
                    health_score.overall_score,
                    health_score.reliability_score,
                    health_score.performance_score,
                    health_score.edge_case_score,
                    health_score.documentation_score,
                    health_score.test_coverage_score,
                    health_score.health_level
                ))
                conn.commit()
        finally:
            conn.close()

    def get_health_trend(self, skill_name: str, days: int = 7) -> list[dict]:
        """
        Get health score trend over time

        Args:
            skill_name: Name of skill
            days: Number of days to look back (default: 7)

        Returns:
            list: List of health score records ordered by time
        """
        conn = psycopg2.connect(**self.db_config)
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT overall_score, health_level, calculated_at
                    FROM skill_health_history
                    WHERE skill_name = %s
                    AND calculated_at > NOW() - INTERVAL '%s days'
                    ORDER BY calculated_at ASC
                """, (skill_name, days))

                results = []
                for row in cursor.fetchall():
                    results.append({
                        "overall_score": row[0],
                        "health_level": row[1],
                        "calculated_at": row[2].isoformat()
                    })
                return results
        finally:
            conn.close()

    def invalidate_cache(self, skill_name: str):
        """
        Invalidate cached health score for a skill

        Args:
            skill_name: Name of skill
        """
        self.cache.invalidate(skill_name)

    def close(self):
        """Close all connections"""
        self.component_calculator.close()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
