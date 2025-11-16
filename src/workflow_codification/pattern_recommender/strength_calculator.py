"""
Strength Calculator
Calculates recommendation strength using weighted formula
"""
import re
from typing import List, Dict


class StrengthCalculator:
    """
    Calculate recommendation strength based on multiple factors
    Formula: 0.40×frequency + 0.30×similarity + 0.20×value + 0.10×determinism
    """

    # Component weights
    WEIGHTS = {
        "frequency": 0.40,
        "similarity": 0.30,
        "value": 0.20,
        "determinism": 0.10
    }

    # Patterns indicating non-deterministic workflows
    NON_DETERMINISTIC_PATTERNS = [
        re.compile(r'\brandom\b', re.IGNORECASE),
        re.compile(r'\buuid\b', re.IGNORECASE),
        re.compile(r'\btimestamp\b', re.IGNORECASE),
        re.compile(r'\bdate\b', re.IGNORECASE),
        re.compile(r'\bnow\(\)', re.IGNORECASE)
    ]

    @staticmethod
    def calculate_frequency_score(frequency: int) -> float:
        """
        Calculate frequency score (0-1)

        Args:
            frequency: Number of pattern occurrences

        Returns:
            Score: frequency / 10, capped at 1.0
        """
        return min(1.0, frequency / 10.0)

    @staticmethod
    def calculate_determinism_score(workflow: List[str]) -> float:
        """
        Calculate determinism score (0-1)

        Args:
            workflow: Command sequence

        Returns:
            Score: 1.0 if deterministic, 0.5 if non-deterministic
        """
        workflow_text = " ".join(workflow)

        for pattern in StrengthCalculator.NON_DETERMINISTIC_PATTERNS:
            if pattern.search(workflow_text):
                return 0.5  # Non-deterministic

        return 1.0  # Deterministic

    @staticmethod
    def calculate_value_score(projected_monthly_savings: float) -> float:
        """
        Calculate value score (0-1)

        Args:
            projected_monthly_savings: Estimated savings in USD

        Returns:
            Score: savings / 1000, capped at 1.0
        """
        return min(1.0, projected_monthly_savings / 1000.0)

    @staticmethod
    def calculate_strength(
        frequency: int,
        similarity: float,
        projected_monthly_savings: float,
        workflow: List[str]
    ) -> Dict:
        """
        Calculate recommendation strength

        Args:
            frequency: Pattern occurrence count
            similarity: Jaccard similarity to existing skills
            projected_monthly_savings: Estimated monthly savings (USD)
            workflow: Command sequence

        Returns:
            Dict with overall_strength, strength_level, and component scores
        """
        # Calculate component scores
        freq_score = StrengthCalculator.calculate_frequency_score(frequency)
        sim_score = similarity
        val_score = StrengthCalculator.calculate_value_score(projected_monthly_savings)
        det_score = StrengthCalculator.calculate_determinism_score(workflow)

        # Weighted combination
        overall_strength = (
            freq_score * StrengthCalculator.WEIGHTS["frequency"] +
            sim_score * StrengthCalculator.WEIGHTS["similarity"] +
            val_score * StrengthCalculator.WEIGHTS["value"] +
            det_score * StrengthCalculator.WEIGHTS["determinism"]
        )

        # Determine strength level
        if overall_strength >= 0.75:
            level = "high"
        elif overall_strength >= 0.50:
            level = "medium"
        else:
            level = "low"

        return {
            "overall_strength": round(overall_strength, 2),
            "strength_level": level,
            "frequency_score": round(freq_score, 2),
            "similarity_score": round(sim_score, 2),
            "value_score": round(val_score, 2),
            "determinism_score": round(det_score, 2)
        }

    @staticmethod
    def get_strength_explanation(strength_result: Dict) -> str:
        """
        Get human-readable explanation of strength calculation

        Args:
            strength_result: Result from calculate_strength()

        Returns:
            Explanation string
        """
        level = strength_result["strength_level"]
        score = strength_result["overall_strength"]

        explanation = f"Recommendation strength: {level.upper()} ({score})\n"
        explanation += f"  - Frequency: {strength_result['frequency_score']} (weight: 40%)\n"
        explanation += f"  - Similarity: {strength_result['similarity_score']} (weight: 30%)\n"
        explanation += f"  - Value: {strength_result['value_score']} (weight: 20%)\n"
        explanation += f"  - Determinism: {strength_result['determinism_score']} (weight: 10%)\n"

        return explanation
