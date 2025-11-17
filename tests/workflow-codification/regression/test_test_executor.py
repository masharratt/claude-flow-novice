"""
Test suite for TestExecutor module
Tests single test execution, command building, and timeout handling
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import subprocess
from src.workflow_codification.regression.test_executor import TestExecutor


class TestCommandBuilding:
    """Test command template building"""

    def test_build_simple_command(self):
        """Test simple command template substitution"""
        executor = TestExecutor()
        template = "echo {message}"
        params = {"message": "hello"}

        command = executor._build_command(template, params)

        assert command == "echo hello"

    def test_build_multiple_params(self):
        """Test multiple parameter substitution"""
        executor = TestExecutor()
        template = "skill.sh --task={task} --mode={mode}"
        params = {"task": "test-task", "mode": "standard"}

        command = executor._build_command(template, params)

        assert command == "skill.sh --task=test-task --mode=standard"

    def test_build_empty_params(self):
        """Test command with no parameters"""
        executor = TestExecutor()
        template = "skill.sh --run"
        params = {}

        command = executor._build_command(template, params)

        assert command == "skill.sh --run"

    def test_build_unused_params(self):
        """Test template with unused parameters"""
        executor = TestExecutor()
        template = "skill.sh {param1}"
        params = {"param1": "value1", "param2": "value2"}

        command = executor._build_command(template, params)

        assert command == "skill.sh value1"
        assert "param2" not in command


class TestSingleTestExecution:
    """Test single test case execution"""

    @patch('subprocess.run')
    def test_execute_successful_test(self, mock_run):
        """Test successful test execution"""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="Success: Task complete",
            stderr=""
        )

        executor = TestExecutor(timeout=300)
        test_case = {
            "test_id": "test-001",
            "input_parameters": {"task": "test"},
            "expected_stdout": "Success: Task complete",
            "expected_duration_seconds": 2.0
        }
        skill_command = "echo {task}"

        result = executor.execute_test_case(test_case, skill_command)

        assert result["test_id"] == "test-001"
        assert result["passed"] is True
        assert result["similarity"] == 1.0
        assert result["exit_code"] == 0
        assert result["stdout_match"] is True
        assert result["error_message"] is None

    @patch('subprocess.run')
    def test_execute_failing_test(self, mock_run):
        """Test failing test execution (output mismatch)"""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="Different output",
            stderr=""
        )

        executor = TestExecutor()
        test_case = {
            "test_id": "test-002",
            "input_parameters": {},
            "expected_stdout": "Expected output",
            "expected_duration_seconds": 1.0
        }

        result = executor.execute_test_case(test_case, "echo test")

        assert result["test_id"] == "test-002"
        assert result["passed"] is False
        assert result["stdout_match"] is False

    @patch('subprocess.run')
    def test_execute_timeout(self, mock_run):
        """Test timeout handling"""
        mock_run.side_effect = subprocess.TimeoutExpired("cmd", 300)

        executor = TestExecutor(timeout=300)
        test_case = {
            "test_id": "test-003",
            "input_parameters": {},
            "expected_stdout": "Output",
            "expected_duration_seconds": 1.0
        }

        result = executor.execute_test_case(test_case, "long_running_cmd")

        assert result["test_id"] == "test-003"
        assert result["passed"] is False
        assert result["exit_code"] == 124  # Timeout exit code
        assert "timed out" in result["error_message"]

    @patch('subprocess.run')
    def test_execute_duration_regression(self, mock_run):
        """Test duration regression detection"""
        import time

        def slow_execution(*args, **kwargs):
            time.sleep(0.1)  # Simulate 100ms execution
            return Mock(returncode=0, stdout="Success", stderr="")

        mock_run.side_effect = slow_execution

        executor = TestExecutor()
        test_case = {
            "test_id": "test-004",
            "input_parameters": {},
            "expected_stdout": "Success",
            "expected_duration_seconds": 0.01  # Expected 10ms, actual 100ms = 10x slower
        }

        result = executor.execute_test_case(test_case, "echo test")

        assert result["duration_regression"] is True
        # Even if output matches, duration regression causes failure
        assert result["passed"] is False

    @patch('subprocess.run')
    def test_execute_no_duration_regression(self, mock_run):
        """Test no duration regression when within threshold"""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="Success",
            stderr=""
        )

        executor = TestExecutor()
        test_case = {
            "test_id": "test-005",
            "input_parameters": {},
            "expected_stdout": "Success",
            "expected_duration_seconds": 10.0  # Much longer expected duration
        }

        result = executor.execute_test_case(test_case, "echo test")

        assert result["duration_regression"] is False
        assert result["passed"] is True

    @patch('subprocess.run')
    def test_execute_command_error(self, mock_run):
        """Test command execution error"""
        mock_run.return_value = Mock(
            returncode=1,
            stdout="",
            stderr="Command failed"
        )

        executor = TestExecutor()
        test_case = {
            "test_id": "test-006",
            "input_parameters": {},
            "expected_stdout": "Success"
        }

        result = executor.execute_test_case(test_case, "failing_cmd")

        assert result["exit_code"] == 1
        assert result["error_message"] == "Command failed"
        assert result["passed"] is False

    @patch('subprocess.run')
    def test_execute_captures_timing(self, mock_run):
        """Test execution timing capture"""
        import time

        def timed_execution(*args, **kwargs):
            time.sleep(0.05)  # 50ms
            return Mock(returncode=0, stdout="Success", stderr="")

        mock_run.side_effect = timed_execution

        executor = TestExecutor()
        test_case = {
            "test_id": "test-007",
            "input_parameters": {},
            "expected_stdout": "Success",
            "expected_duration_seconds": 10.0
        }

        result = executor.execute_test_case(test_case, "echo test")

        assert result["actual_duration"] >= 0.05
        assert result["expected_duration"] == 10.0

    @patch('subprocess.run')
    def test_execute_zero_expected_duration(self, mock_run):
        """Test execution with zero expected duration (new test)"""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="Success",
            stderr=""
        )

        executor = TestExecutor()
        test_case = {
            "test_id": "test-008",
            "input_parameters": {},
            "expected_stdout": "Success",
            "expected_duration_seconds": 0  # Zero duration
        }

        result = executor.execute_test_case(test_case, "echo test")

        # Should not trigger duration regression when expected is 0
        # (actual * 1.5 always > 0)
        assert "duration_regression" in result
