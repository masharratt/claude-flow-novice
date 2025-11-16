"""
Pattern Recommender
Main recommendation engine that combines all components
"""
import psycopg2
import psycopg2.extras
from datetime import datetime
from typing import List, Dict, Optional

from .workflow_monitor import WorkflowMonitor
from .pattern_detector import PatternDetector
from .similarity_matcher import SimilarityMatcher
from .strength_calculator import StrengthCalculator


class PatternRecommender:
    """
    AI Pattern Recommender Engine
    Generates workflow automation recommendations
    """

    def __init__(self, db_config: Optional[Dict] = None):
        """
        Initialize pattern recommender

        Args:
            db_config: PostgreSQL connection config (optional for testing)
        """
        self.monitor = WorkflowMonitor()
        self.detector = PatternDetector()
        self.matcher = SimilarityMatcher()
        self.calculator = StrengthCalculator()

        # Database connection (optional)
        self.conn = None
        if db_config:
            try:
                self.conn = psycopg2.connect(**db_config)
            except Exception as e:
                print(f"Warning: Could not connect to database: {e}")
                self.conn = None

    def generate_recommendations(self, user_id: str) -> List[Dict]:
        """
        Generate pattern recommendations for user

        Args:
            user_id: User identifier

        Returns:
            List of recommendations with all details
        """
        # Step 1: Get user workflows
        workflows = self.monitor.get_workflow_sequences(user_id)

        # Step 2: Detect repeated patterns
        patterns = self.detector.detect_patterns(workflows, min_occurrences=3)

        # Step 3: Generate recommendations for each pattern
        recommendations = []

        for pattern in patterns:
            # Find similar existing skills
            similar_skills = self.matcher.find_similar_skills(pattern["pattern"])
            best_similarity = similar_skills[0]["similarity"] if similar_skills else 0.0

            # Calculate projected savings
            projected_savings = self._estimate_savings(
                pattern["frequency"],
                len(pattern["pattern"])
            )

            # Calculate strength
            strength = self.calculator.calculate_strength(
                frequency=pattern["frequency"],
                similarity=best_similarity,
                projected_monthly_savings=projected_savings,
                workflow=pattern["pattern"]
            )

            # Create recommendation
            recommendation = {
                "user_id": user_id,
                "workflow_steps": pattern["pattern"],
                "frequency": pattern["frequency"],
                "similar_skills": similar_skills[:3],  # Top 3
                "strength": strength,
                "projected_monthly_savings_usd": projected_savings,
                "status": "suggested"
            }

            # Store in PostgreSQL if connected
            if self.conn:
                rec_id = self._store_recommendation(recommendation)
                recommendation["id"] = rec_id

            recommendations.append(recommendation)

        return recommendations

    def _estimate_savings(self, frequency: int, num_commands: int) -> float:
        """
        Estimate monthly savings from automation

        Args:
            frequency: Times pattern repeated
            num_commands: Number of commands in pattern

        Returns:
            Estimated monthly savings (USD)
        """
        # Assumptions:
        # - Each command takes 30 seconds manually
        # - Developer cost: $100/hour
        # - Pattern repeats this frequently per month

        time_per_execution = (num_commands * 30) / 3600  # Hours
        monthly_executions = frequency  # Assume current frequency is monthly rate
        monthly_hours_saved = time_per_execution * monthly_executions
        monthly_savings = monthly_hours_saved * 100  # $100/hour

        return round(monthly_savings, 2)

    def _store_recommendation(self, recommendation: Dict) -> str:
        """
        Store recommendation in PostgreSQL

        Args:
            recommendation: Recommendation data

        Returns:
            Recommendation UUID
        """
        if not self.conn:
            raise Exception("Database connection not available")

        with self.conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO pattern_recommendations
                (user_id, workflow_steps, recommendation_strength, strength_score,
                 frequency_score, similarity_score, value_score, determinism_score,
                 projected_monthly_savings_usd, status, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                recommendation["user_id"],
                psycopg2.extras.Json(recommendation["workflow_steps"]),
                recommendation["strength"]["strength_level"],
                recommendation["strength"]["overall_strength"],
                recommendation["strength"]["frequency_score"],
                recommendation["strength"]["similarity_score"],
                recommendation["strength"]["value_score"],
                recommendation["strength"]["determinism_score"],
                recommendation["projected_monthly_savings_usd"],
                recommendation["status"],
                psycopg2.extras.Json({
                    "frequency": recommendation["frequency"],
                    "similar_skills": recommendation["similar_skills"],
                    "strength_components": recommendation["strength"]
                })
            ))

            rec_id = cursor.fetchone()[0]
            self.conn.commit()
            return rec_id

    def get_recommendations_by_user(self, user_id: str) -> List[Dict]:
        """
        Retrieve stored recommendations for a user

        Args:
            user_id: User identifier

        Returns:
            List of recommendations from database
        """
        if not self.conn:
            raise Exception("Database connection not available")

        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("""
                SELECT *
                FROM pattern_recommendations
                WHERE user_id = %s
                ORDER BY suggested_at DESC
            """, (user_id,))

            return [dict(row) for row in cursor.fetchall()]

    def update_recommendation_status(
        self,
        recommendation_id: str,
        status: str
    ) -> None:
        """
        Update recommendation status

        Args:
            recommendation_id: Recommendation UUID
            status: New status (suggested, accepted, rejected, deployed)
        """
        if not self.conn:
            raise Exception("Database connection not available")

        valid_statuses = ['suggested', 'accepted', 'rejected', 'deployed']
        if status not in valid_statuses:
            raise ValueError(f"Invalid status: {status}")

        with self.conn.cursor() as cursor:
            cursor.execute("""
                UPDATE pattern_recommendations
                SET status = %s, responded_at = NOW()
                WHERE id = %s
            """, (status, recommendation_id))

            self.conn.commit()

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            self.conn = None

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
