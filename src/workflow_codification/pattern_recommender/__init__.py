"""
AI Pattern Recommender Engine
Monitors workflows, detects patterns, and generates automation recommendations
"""

from .workflow_monitor import WorkflowMonitor
from .pattern_detector import PatternDetector
from .similarity_matcher import SimilarityMatcher
from .strength_calculator import StrengthCalculator
from .recommender import PatternRecommender

__all__ = [
    'WorkflowMonitor',
    'PatternDetector',
    'SimilarityMatcher',
    'StrengthCalculator',
    'PatternRecommender'
]
