"""
OutputComparator module for regression testing
Compares expected vs actual test outputs with normalization support
"""

import re
from typing import Tuple, Dict
from difflib import SequenceMatcher


class OutputComparator:
    """Compare test outputs with fuzzy matching for dynamic values"""

    # Patterns for dynamic values
    UUID_PATTERN = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
    TIMESTAMP_PATTERN = re.compile(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}')

    @staticmethod
    def normalize_output(output: str) -> str:
        """
        Normalize output for comparison

        Replaces dynamic values with placeholders:
        - UUIDs → <UUID>
        - Timestamps → <TIMESTAMP>
        - Normalizes whitespace

        Args:
            output: Raw output string

        Returns:
            Normalized output string
        """
        normalized = output
        normalized = OutputComparator.UUID_PATTERN.sub('<UUID>', normalized)
        normalized = OutputComparator.TIMESTAMP_PATTERN.sub('<TIMESTAMP>', normalized)
        normalized = ' '.join(normalized.split())  # Normalize whitespace
        return normalized

    @staticmethod
    def compare_outputs(
        expected: str,
        actual: str,
        normalize: bool = True
    ) -> Tuple[bool, float]:
        """
        Compare expected vs actual outputs

        Args:
            expected: Expected output string
            actual: Actual output string
            normalize: Whether to normalize dynamic values (default: True)

        Returns:
            Tuple of (matches: bool, similarity: float)
            - matches: True if outputs match (after normalization)
            - similarity: Similarity score 0.0-1.0
        """
        if normalize:
            expected_norm = OutputComparator.normalize_output(expected)
            actual_norm = OutputComparator.normalize_output(actual)
        else:
            expected_norm = expected
            actual_norm = actual

        # Exact match after normalization
        matches = expected_norm == actual_norm

        # Similarity score using SequenceMatcher
        similarity = SequenceMatcher(None, expected_norm, actual_norm).ratio()

        return matches, similarity

    @staticmethod
    def compare_test_case(
        test_case: Dict,
        actual_result: Dict
    ) -> Dict:
        """
        Compare test case expected vs actual results

        Args:
            test_case: Test case dict with expected_stdout
            actual_result: Actual execution result dict with stdout

        Returns:
            Comparison result dict with:
            - test_id: Test identifier
            - passed: Whether test passed
            - similarity: Similarity score
            - expected_stdout: First 100 chars of expected
            - actual_stdout: First 100 chars of actual
            - exit_code: Exit code from execution
        """
        expected_stdout = test_case.get("expected_stdout", "")
        actual_stdout = actual_result.get("stdout", "")

        matches, similarity = OutputComparator.compare_outputs(expected_stdout, actual_stdout)

        return {
            "test_id": test_case["test_id"],
            "passed": matches,
            "similarity": similarity,
            "expected_stdout": expected_stdout[:100],  # First 100 chars
            "actual_stdout": actual_stdout[:100],
            "exit_code": actual_result.get("exit_code", 0)
        }
