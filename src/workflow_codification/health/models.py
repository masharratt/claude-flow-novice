"""
Health Score Data Models

Defines data structures for health score calculation and storage
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class HealthScore:
    """
    Complete health score for a skill

    Attributes:
        skill_name: Identifier for the skill
        overall_score: Composite health score (0-100)
        reliability_score: Success rate component (0-100)
        performance_score: Execution time component (0-100)
        edge_case_score: Edge case handling component (0-100)
        documentation_score: Documentation completeness component (0-100)
        test_coverage_score: Test coverage component (0-100)
        health_level: Classification (excellent, good, fair, poor)
        calculated_at: Timestamp when score was calculated
    """

    skill_name: str
    overall_score: int
    reliability_score: float
    performance_score: float
    edge_case_score: float
    documentation_score: float
    test_coverage_score: float
    health_level: str
    calculated_at: Optional[datetime] = None

    def __post_init__(self):
        """Set default calculated_at to current time if not provided"""
        if self.calculated_at is None:
            self.calculated_at = datetime.utcnow()

    def to_dict(self) -> dict:
        """
        Serialize health score to dictionary

        Returns:
            dict: JSON-serializable representation
        """
        return {
            "skill_name": self.skill_name,
            "overall_score": self.overall_score,
            "reliability_score": self.reliability_score,
            "performance_score": self.performance_score,
            "edge_case_score": self.edge_case_score,
            "documentation_score": self.documentation_score,
            "test_coverage_score": self.test_coverage_score,
            "health_level": self.health_level,
            "calculated_at": self.calculated_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'HealthScore':
        """
        Deserialize health score from dictionary

        Args:
            data: Dictionary with health score data

        Returns:
            HealthScore: Reconstructed health score object
        """
        data_copy = data.copy()
        if "calculated_at" in data_copy and isinstance(data_copy["calculated_at"], str):
            data_copy["calculated_at"] = datetime.fromisoformat(data_copy["calculated_at"])
        return cls(**data_copy)


@dataclass
class ComponentMetrics:
    """
    Raw metrics used for component score calculation

    Used for detailed diagnostics and debugging
    """

    # Reliability metrics
    successful_executions: int = 0
    total_executions: int = 0

    # Performance metrics
    baseline_duration: Optional[float] = None
    recent_avg_duration: Optional[float] = None

    # Edge case metrics
    edge_case_count: int = 0
    edge_case_rate: float = 0.0

    # Documentation metrics
    has_skill_md: bool = False
    has_readme_md: bool = False
    has_examples: bool = False
    has_metadata: bool = False

    # Test coverage metrics
    test_coverage_percent: float = 0.0

    def to_dict(self) -> dict:
        """Serialize to dictionary"""
        return {
            "successful_executions": self.successful_executions,
            "total_executions": self.total_executions,
            "baseline_duration": self.baseline_duration,
            "recent_avg_duration": self.recent_avg_duration,
            "edge_case_count": self.edge_case_count,
            "edge_case_rate": self.edge_case_rate,
            "has_skill_md": self.has_skill_md,
            "has_readme_md": self.has_readme_md,
            "has_examples": self.has_examples,
            "has_metadata": self.has_metadata,
            "test_coverage_percent": self.test_coverage_percent
        }
