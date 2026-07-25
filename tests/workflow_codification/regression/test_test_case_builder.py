"""
Tests for test_case_builder.py module

Tests test case generation from execution records, including priority assignment.
"""

import pytest
from datetime import datetime


class TestTestCaseBuilder:
    """Test suite for TestCaseBuilder class"""

    def test_create_test_case_structure(self):
        """Verify test case has all required fields"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {
            "execution_id": "trace-001",
            "input_parameters": {"mode": "standard"},
            "stdout": "success",
            "execution_duration_seconds": 1.5,
            "team_invoked_by": "team-a"
        }

        test_case = TestCaseBuilder.create_test_case(
            test_id="cfn-test-reg-001",
            execution=execution,
            skill_name="cfn-test",
            priority="P1"
        )

        # Verify required fields
        assert test_case['test_id'] == "cfn-test-reg-001"
        assert test_case['skill_name'] == "cfn-test"
        assert test_case['input_parameters'] == {"mode": "standard"}
        assert test_case['expected_stdout'] == "success"
        assert test_case['expected_duration_seconds'] == 1.5
        assert test_case['priority'] == "P1"
        assert 'created_at' in test_case
        assert 'metadata' in test_case

    def test_test_id_format(self):
        """test_id format: {skill}-reg-{number:03d}"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {
            "execution_id": "trace-001",
            "input_parameters": {},
            "stdout": "",
            "execution_duration_seconds": 1.0,
            "team_invoked_by": "team-a"
        }

        test_case1 = TestCaseBuilder.create_test_case("skill-reg-001", execution, "skill", "P1")
        test_case2 = TestCaseBuilder.create_test_case("skill-reg-042", execution, "skill", "P1")

        assert test_case1['test_id'] == "skill-reg-001"
        assert test_case2['test_id'] == "skill-reg-042"

    def test_priority_assignment_p0(self):
        """frequency ≥10 → P0"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {}
        priority = TestCaseBuilder.assign_priority(execution, frequency=15)

        assert priority == "P0"

    def test_priority_assignment_p1(self):
        """3 ≤ frequency < 10 → P1"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {}

        assert TestCaseBuilder.assign_priority(execution, frequency=3) == "P1"
        assert TestCaseBuilder.assign_priority(execution, frequency=7) == "P1"
        assert TestCaseBuilder.assign_priority(execution, frequency=9) == "P1"

    def test_priority_assignment_p2(self):
        """frequency < 3 → P2"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {}

        assert TestCaseBuilder.assign_priority(execution, frequency=1) == "P2"
        assert TestCaseBuilder.assign_priority(execution, frequency=2) == "P2"

    def test_metadata_includes_source(self):
        """metadata.source_execution_id and team present"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {
            "execution_id": "trace-123",
            "input_parameters": {},
            "stdout": "",
            "execution_duration_seconds": 1.0,
            "team_invoked_by": "engineering"
        }

        test_case = TestCaseBuilder.create_test_case("test-001", execution, "skill", "P1")

        assert test_case['metadata']['source_execution_id'] == "trace-123"
        assert test_case['metadata']['team'] == "engineering"

    def test_build_test_suite_50_cases(self):
        """50 executions → 50 test cases"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        executions = [
            {
                "execution_id": f"trace-{i:03d}",
                "input_parameters": {"value": i},
                "stdout": f"result {i}",
                "execution_duration_seconds": 1.0 + i * 0.1,
                "team_invoked_by": "team-a"
            }
            for i in range(50)
        ]

        test_suite = TestCaseBuilder.build_test_suite("cfn-test", executions)

        assert len(test_suite) == 50
        assert all(tc['skill_name'] == "cfn-test" for tc in test_suite)

    def test_expected_output_capture(self):
        """expected_stdout captured from execution"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {
            "execution_id": "trace-001",
            "input_parameters": {},
            "stdout": "Execution completed successfully\nOutput: 42\n",
            "execution_duration_seconds": 2.5,
            "team_invoked_by": "team-a"
        }

        test_case = TestCaseBuilder.create_test_case("test-001", execution, "skill", "P1")

        assert test_case['expected_stdout'] == "Execution completed successfully\nOutput: 42\n"

    def test_frequency_map_integration(self):
        """Test suite builder uses frequency map for priority assignment"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        executions = [
            {
                "execution_id": f"trace-{i:03d}",
                "input_parameters": {"mode": "standard" if i < 15 else "mvp"},
                "stdout": "success",
                "execution_duration_seconds": 1.0,
                "team_invoked_by": "team-a"
            }
            for i in range(20)
        ]

        # Build frequency map
        frequency_map = {}
        for execution in executions:
            param_hash = ExecutionDeduplicator.hash_parameters(execution['input_parameters'])
            frequency_map[param_hash] = frequency_map.get(param_hash, 0) + 1

        test_suite = TestCaseBuilder.build_test_suite("skill", executions, frequency_map)

        # First 15 have mode=standard (frequency 15) → P0
        # Last 5 have mode=mvp (frequency 5) → P1
        assert any(tc['priority'] == 'P0' for tc in test_suite)
        assert any(tc['priority'] == 'P1' for tc in test_suite)

    def test_empty_executions(self):
        """Empty executions list → empty test suite"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        test_suite = TestCaseBuilder.build_test_suite("skill", [])
        assert test_suite == []

    def test_missing_fields_handling(self):
        """Handle executions with missing optional fields"""
        from src.workflow_codification.regression.test_case_builder import TestCaseBuilder

        execution = {
            "execution_id": "trace-001",
            # Missing input_parameters, stdout, duration, team
        }

        test_case = TestCaseBuilder.create_test_case("test-001", execution, "skill", "P1")

        # Should use defaults for missing fields
        assert test_case['input_parameters'] == {}
        assert test_case['expected_stdout'] == ""
        assert test_case['expected_duration_seconds'] == 0
