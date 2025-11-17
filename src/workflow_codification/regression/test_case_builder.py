"""
Test Case Builder

Generates test cases from execution records with priority assignment.
Builds complete test suites ready for storage and execution.
"""

from typing import Dict, List
from datetime import datetime


class TestCaseBuilder:
    """Build test cases from execution records"""

    @staticmethod
    def create_test_case(
        test_id: str,
        execution: Dict,
        skill_name: str,
        priority: str = "P1"
    ) -> Dict:
        """
        Create test case from execution record

        Args:
            test_id: Unique test case identifier (format: {skill}-reg-{number:03d})
            execution: Execution record
            skill_name: Name of skill being tested
            priority: P0 (critical), P1 (high), or P2 (medium)

        Returns:
            Test case dictionary
        """
        return {
            "test_id": test_id,
            "skill_name": skill_name,
            "input_parameters": execution.get("input_parameters", {}),
            "expected_stdout": execution.get("stdout", ""),
            "expected_duration_seconds": execution.get("execution_duration_seconds", 0),
            "priority": priority,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": {
                "source_execution_id": execution.get("execution_id"),
                "team": execution.get("team_invoked_by", "unknown")
            }
        }

    @staticmethod
    def assign_priority(execution: Dict, frequency: int) -> str:
        """
        Assign priority based on execution frequency

        Priority Rules:
            - P0: Frequent patterns (frequency ≥10) - breaking changes are critical
            - P1: Common cases (3 ≤ frequency < 10) - high priority
            - P2: Rare cases (frequency < 3) - medium priority / performance tests

        Args:
            execution: Execution record (not used currently, for future enhancements)
            frequency: Number of times this pattern occurred

        Returns:
            Priority: 'P0', 'P1', or 'P2'
        """
        if frequency >= 10:
            return "P0"  # Frequent patterns - critical
        elif frequency >= 3:
            return "P1"  # Common cases - high priority
        else:
            return "P2"  # Rare cases - medium priority

    @staticmethod
    def build_test_suite(
        skill_name: str,
        executions: List[Dict],
        frequency_map: Dict[str, int] = None
    ) -> List[Dict]:
        """
        Build complete test suite from executions

        Args:
            skill_name: Name of skill
            executions: Sampled execution records
            frequency_map: Optional parameter_hash → frequency mapping for priority

        Returns:
            List of test cases
        """
        if not executions:
            return []

        test_cases = []
        frequency_map = frequency_map or {}

        # Import deduplicator for hash calculation
        from .deduplicator import ExecutionDeduplicator

        for i, execution in enumerate(executions):
            # Generate test ID (format: {skill}-reg-{number:03d})
            test_id = f"{skill_name}-reg-{i+1:03d}"

            # Determine priority based on frequency
            params = execution.get("input_parameters", {})
            param_hash = ExecutionDeduplicator.hash_parameters(params)
            frequency = frequency_map.get(param_hash, 1)
            priority = TestCaseBuilder.assign_priority(execution, frequency)

            # Create test case
            test_case = TestCaseBuilder.create_test_case(
                test_id, execution, skill_name, priority
            )
            test_cases.append(test_case)

        return test_cases
