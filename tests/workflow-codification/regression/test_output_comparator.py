"""
Test suite for OutputComparator module
Tests output comparison, normalization, and similarity scoring
"""

import pytest
from src.workflow_codification.regression.output_comparator import OutputComparator


class TestOutputNormalization:
    """Test output normalization for dynamic values"""

    def test_normalize_uuid(self):
        """Test UUID normalization"""
        output = "Task ID: 550e8400-e29b-41d4-a716-446655440000"
        normalized = OutputComparator.normalize_output(output)
        assert normalized == "Task ID: <UUID>"

    def test_normalize_timestamp_iso(self):
        """Test ISO timestamp normalization"""
        output = "Started at 2025-11-16T14:30:45"
        normalized = OutputComparator.normalize_output(output)
        assert normalized == "Started at <TIMESTAMP>"

    def test_normalize_timestamp_space(self):
        """Test space-separated timestamp normalization"""
        output = "Started at 2025-11-16 14:30:45"
        normalized = OutputComparator.normalize_output(output)
        assert normalized == "Started at <TIMESTAMP>"

    def test_normalize_whitespace(self):
        """Test whitespace normalization"""
        output = "Hello    world\n\n\ttest"
        normalized = OutputComparator.normalize_output(output)
        assert normalized == "Hello world test"

    def test_normalize_multiple_uuids(self):
        """Test multiple UUID normalization"""
        output = "Agent 550e8400-e29b-41d4-a716-446655440000 spawned 123e4567-e89b-12d3-a456-426614174000"
        normalized = OutputComparator.normalize_output(output)
        assert normalized == "Agent <UUID> spawned <UUID>"

    def test_normalize_complex_output(self):
        """Test complex output with UUIDs, timestamps, and whitespace"""
        output = """
        Task:  550e8400-e29b-41d4-a716-446655440000
        Started: 2025-11-16T14:30:45
        Status:   complete
        """
        normalized = OutputComparator.normalize_output(output)
        assert "Task: <UUID>" in normalized
        assert "<TIMESTAMP>" in normalized
        assert "Status: complete" in normalized


class TestOutputComparison:
    """Test output comparison logic"""

    def test_exact_match(self):
        """Test exact match returns True and similarity 1.0"""
        expected = "Hello world"
        actual = "Hello world"
        matches, similarity = OutputComparator.compare_outputs(expected, actual)
        assert matches is True
        assert similarity == 1.0

    def test_whitespace_differences(self):
        """Test whitespace differences normalized"""
        expected = "Hello    world"
        actual = "Hello world"
        matches, similarity = OutputComparator.compare_outputs(expected, actual)
        assert matches is True
        assert similarity == 1.0

    def test_uuid_differences(self):
        """Test UUID differences normalized"""
        expected = "Task 550e8400-e29b-41d4-a716-446655440000 complete"
        actual = "Task 123e4567-e89b-12d3-a456-426614174000 complete"
        matches, similarity = OutputComparator.compare_outputs(expected, actual)
        assert matches is True
        assert similarity >= 0.95

    def test_timestamp_differences(self):
        """Test timestamp differences normalized"""
        expected = "Started 2025-11-16T14:30:45"
        actual = "Started 2025-11-16T15:45:30"
        matches, similarity = OutputComparator.compare_outputs(expected, actual)
        assert matches is True
        assert similarity >= 0.95

    def test_different_content(self):
        """Test different content returns False"""
        expected = "Hello world"
        actual = "Goodbye universe"
        matches, similarity = OutputComparator.compare_outputs(expected, actual)
        assert matches is False
        assert similarity < 1.0

    def test_normalize_false(self):
        """Test normalize=False requires exact match"""
        expected = "Task 550e8400-e29b-41d4-a716-446655440000"
        actual = "Task 123e4567-e89b-12d3-a456-426614174000"
        matches, similarity = OutputComparator.compare_outputs(expected, actual, normalize=False)
        assert matches is False
        assert similarity < 1.0

    def test_empty_strings(self):
        """Test empty string comparison"""
        matches, similarity = OutputComparator.compare_outputs("", "")
        assert matches is True
        assert similarity == 1.0

    def test_partial_match_similarity(self):
        """Test partial match has correct similarity score"""
        expected = "The quick brown fox jumps over the lazy dog"
        actual = "The quick brown fox walks over the lazy cat"
        matches, similarity = OutputComparator.compare_outputs(expected, actual)
        assert matches is False
        assert 0.7 < similarity < 0.95


class TestTestCaseComparison:
    """Test test case comparison with expected vs actual results"""

    def test_compare_test_case_passing(self):
        """Test passing test case comparison"""
        test_case = {
            "test_id": "test-001",
            "expected_stdout": "Success: Task complete"
        }
        actual_result = {
            "stdout": "Success: Task complete",
            "exit_code": 0
        }

        result = OutputComparator.compare_test_case(test_case, actual_result)

        assert result["test_id"] == "test-001"
        assert result["passed"] is True
        assert result["similarity"] == 1.0
        assert result["exit_code"] == 0

    def test_compare_test_case_failing(self):
        """Test failing test case comparison"""
        test_case = {
            "test_id": "test-002",
            "expected_stdout": "Success"
        }
        actual_result = {
            "stdout": "Failure",
            "exit_code": 1
        }

        result = OutputComparator.compare_test_case(test_case, actual_result)

        assert result["test_id"] == "test-002"
        assert result["passed"] is False
        assert result["similarity"] < 1.0
        assert result["exit_code"] == 1

    def test_compare_test_case_with_normalization(self):
        """Test test case comparison with UUID normalization"""
        test_case = {
            "test_id": "test-003",
            "expected_stdout": "Agent 550e8400-e29b-41d4-a716-446655440000 spawned"
        }
        actual_result = {
            "stdout": "Agent 123e4567-e89b-12d3-a456-426614174000 spawned",
            "exit_code": 0
        }

        result = OutputComparator.compare_test_case(test_case, actual_result)

        assert result["passed"] is True
        assert result["similarity"] >= 0.95

    def test_compare_test_case_truncates_output(self):
        """Test test case comparison truncates long outputs"""
        long_output = "x" * 500
        test_case = {
            "test_id": "test-004",
            "expected_stdout": long_output
        }
        actual_result = {
            "stdout": long_output,
            "exit_code": 0
        }

        result = OutputComparator.compare_test_case(test_case, actual_result)

        assert len(result["expected_stdout"]) == 100
        assert len(result["actual_stdout"]) == 100
        assert result["passed"] is True

    def test_compare_test_case_missing_expected(self):
        """Test test case with missing expected_stdout"""
        test_case = {
            "test_id": "test-005"
        }
        actual_result = {
            "stdout": "Some output",
            "exit_code": 0
        }

        result = OutputComparator.compare_test_case(test_case, actual_result)

        # Empty expected should not match non-empty actual
        assert result["passed"] is False
