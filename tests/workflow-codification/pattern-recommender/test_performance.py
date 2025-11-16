"""
Performance tests for Pattern Recommender
Requirement: Process 1000 workflows in <10 seconds
"""
import pytest
import time
from datetime import datetime, timedelta
import sys
import os
from unittest.mock import patch, MagicMock

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../src'))

from workflow_codification.pattern_recommender.workflow_monitor import WorkflowMonitor
from workflow_codification.pattern_recommender.pattern_detector import PatternDetector
from workflow_codification.pattern_recommender.similarity_matcher import SimilarityMatcher
from workflow_codification.pattern_recommender.strength_calculator import StrengthCalculator


class TestPerformance:
    """Performance benchmarks for pattern recommender"""

    def test_process_1000_workflows_under_10_seconds(self):
        """Process 1000 workflows in <10 seconds"""
        monitor = WorkflowMonitor()
        detector = PatternDetector()

        # Generate 1000 workflows
        base_time = datetime(2025, 1, 1, 12, 0, 0)
        workflows = []

        print("\nGenerating 1000 workflows...")
        for i in range(1000):
            # Create varied workflows
            if i % 3 == 0:
                workflow = ["git status", "git add .", "git commit"]
            elif i % 3 == 1:
                workflow = ["docker build", "docker run"]
            else:
                workflow = ["npm install", "npm test", "npm build"]

            workflows.append(workflow)

            # Record in monitor
            timestamp = base_time + timedelta(minutes=i*10)
            for cmd in workflow:
                monitor.record_command("user1", cmd, timestamp)
                timestamp += timedelta(seconds=1)

        print(f"Generated {len(workflows)} workflows")

        # Measure pattern detection performance
        print("Starting pattern detection...")
        start_time = time.time()

        patterns = detector.detect_patterns(workflows, min_occurrences=3)

        end_time = time.time()
        elapsed = end_time - start_time

        print(f"Pattern detection completed in {elapsed:.2f} seconds")
        print(f"Found {len(patterns)} patterns")

        # Verify performance requirement
        assert elapsed < 10.0, f"Processing took {elapsed:.2f}s, expected <10s"

    def test_similarity_matching_performance(self):
        """Similarity matching should be reasonably fast"""
        with patch.object(SimilarityMatcher, 'load_existing_skills') as mock_load:
            # Mock 50 skills
            mock_load.return_value = [
                {
                    "name": f"skill-{i}",
                    "description": f"test skill {i} with docker build deploy",
                    "keywords": {"test", "skill", "docker", "build", f"kw{i}"}
                }
                for i in range(50)
            ]

            matcher = SimilarityMatcher()
            workflow = ["docker", "build", "test", "deploy"]

            start_time = time.time()

            for _ in range(100):
                similar = matcher.find_similar_skills(workflow, top_n=5)

            end_time = time.time()
            elapsed = end_time - start_time

            print(f"\n100 similarity searches completed in {elapsed:.2f} seconds")
            assert elapsed < 5.0, f"Similarity matching too slow: {elapsed:.2f}s"

    def test_strength_calculation_performance(self):
        """Strength calculation should be very fast"""
        calculator = StrengthCalculator()

        start_time = time.time()

        for i in range(1000):
            result = calculator.calculate_strength(
                frequency=i % 20,
                similarity=0.5,
                projected_monthly_savings=500,
                workflow=["cmd1", "cmd2"]
            )

        end_time = time.time()
        elapsed = end_time - start_time

        print(f"\n1000 strength calculations completed in {elapsed:.2f} seconds")
        assert elapsed < 1.0, f"Strength calculation too slow: {elapsed:.2f}s"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
