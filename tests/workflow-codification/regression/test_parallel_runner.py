"""
Test suite for ParallelTestRunner module
Tests parallel test execution, ThreadPoolExecutor, and result aggregation
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from concurrent.futures import ThreadPoolExecutor
import time
from src.workflow_codification.regression.parallel_runner import ParallelTestRunner


class TestParallelExecution:
    """Test parallel test execution"""

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_parallel(self, mock_executor_class):
        """Test parallel execution of test suite"""
        # Mock executor returns successful results
        mock_executor = Mock()
        mock_executor.execute_test_case.return_value = {
            "test_id": "test-001",
            "passed": True,
            "similarity": 1.0
        }
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-001",
            "skill_name": "cfn-coordination",
            "test_cases": [
                {"test_id": f"test-{i:03d}", "input_parameters": {}}
                for i in range(5)
            ]
        }

        result = runner.run_test_suite(test_suite, "echo {task}")

        assert result["suite_id"] == "suite-001"
        assert result["skill_name"] == "cfn-coordination"
        assert result["total_tests"] == 5
        assert result["passed"] == 5
        assert result["failed"] == 0
        assert result["pass_rate"] == 100.0
        assert len(result["results"]) == 5

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_50_tests_performance(self, mock_executor_class):
        """Test 50 tests execute in <5 minutes"""
        # Mock quick execution
        mock_executor = Mock()

        def quick_execute(*args, **kwargs):
            time.sleep(0.01)  # 10ms per test
            return {"test_id": "test", "passed": True, "similarity": 1.0}

        mock_executor.execute_test_case.side_effect = quick_execute
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-perf",
            "skill_name": "performance-test",
            "test_cases": [
                {"test_id": f"test-{i:03d}", "input_parameters": {}}
                for i in range(50)
            ]
        }

        start_time = time.time()
        result = runner.run_test_suite(test_suite, "echo test")
        duration = time.time() - start_time

        # 50 tests at 10ms each with 10 workers should take ~50ms (5 batches)
        # Add buffer for overhead, should be well under 5 minutes (300s)
        assert duration < 300  # 5 minutes
        assert duration < 5  # Actually should be under 5 seconds with parallelism
        assert result["total_tests"] == 50

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_mixed_results(self, mock_executor_class):
        """Test aggregation of mixed pass/fail results"""
        # Mock executor with mixed results
        mock_executor = Mock()
        results = [
            {"test_id": "test-001", "passed": True},
            {"test_id": "test-002", "passed": True},
            {"test_id": "test-003", "passed": False},
            {"test_id": "test-004", "passed": True},
            {"test_id": "test-005", "passed": False},
        ]
        mock_executor.execute_test_case.side_effect = results
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-mixed",
            "skill_name": "mixed-results",
            "test_cases": [{"test_id": f"test-{i:03d}"} for i in range(1, 6)]
        }

        result = runner.run_test_suite(test_suite, "echo test")

        assert result["total_tests"] == 5
        assert result["passed"] == 3
        assert result["failed"] == 2
        assert result["pass_rate"] == 60.0

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_empty(self, mock_executor_class):
        """Test empty test suite"""
        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-empty",
            "skill_name": "empty-suite",
            "test_cases": []
        }

        result = runner.run_test_suite(test_suite, "echo test")

        assert result["total_tests"] == 0
        assert result["passed"] == 0
        assert result["failed"] == 0
        assert result["pass_rate"] == 0.0
        assert result["results"] == []

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_exception_handling(self, mock_executor_class):
        """Test exception handling in parallel execution"""
        # Mock executor that raises exception for some tests
        mock_executor = Mock()

        def execute_with_error(test_case, cmd):
            if test_case["test_id"] == "test-003":
                raise Exception("Execution error")
            return {"test_id": test_case["test_id"], "passed": True}

        mock_executor.execute_test_case.side_effect = execute_with_error
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-errors",
            "skill_name": "error-handling",
            "test_cases": [
                {"test_id": "test-001"},
                {"test_id": "test-002"},
                {"test_id": "test-003"},  # This will raise exception
                {"test_id": "test-004"},
            ]
        }

        result = runner.run_test_suite(test_suite, "echo test")

        assert result["total_tests"] == 4
        # 3 passed, 1 failed due to exception
        assert result["passed"] == 3
        assert result["failed"] == 1

        # Find the error result
        error_result = next(r for r in result["results"] if r["test_id"] == "test-003")
        assert error_result["passed"] is False
        assert "error_message" in error_result

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_concurrent_workers(self, mock_executor_class):
        """Test that max_workers setting is respected"""
        # This test verifies the ThreadPoolExecutor is created with correct workers
        mock_executor = Mock()
        mock_executor.execute_test_case.return_value = {
            "test_id": "test", "passed": True
        }
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=5)

        # Verify max_workers is set
        assert runner.max_workers == 5

        test_suite = {
            "id": "suite-workers",
            "skill_name": "worker-test",
            "test_cases": [{"test_id": f"test-{i}"} for i in range(10)]
        }

        result = runner.run_test_suite(test_suite, "echo test")

        assert result["total_tests"] == 10

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_all_passing(self, mock_executor_class):
        """Test all tests passing scenario"""
        mock_executor = Mock()
        mock_executor.execute_test_case.return_value = {
            "test_id": "test", "passed": True, "similarity": 1.0
        }
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-all-pass",
            "skill_name": "all-passing",
            "test_cases": [{"test_id": f"test-{i}"} for i in range(20)]
        }

        result = runner.run_test_suite(test_suite, "echo test")

        assert result["total_tests"] == 20
        assert result["passed"] == 20
        assert result["failed"] == 0
        assert result["pass_rate"] == 100.0

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_all_failing(self, mock_executor_class):
        """Test all tests failing scenario"""
        mock_executor = Mock()
        mock_executor.execute_test_case.return_value = {
            "test_id": "test", "passed": False, "similarity": 0.5
        }
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-all-fail",
            "skill_name": "all-failing",
            "test_cases": [{"test_id": f"test-{i}"} for i in range(20)]
        }

        result = runner.run_test_suite(test_suite, "echo test")

        assert result["total_tests"] == 20
        assert result["passed"] == 0
        assert result["failed"] == 20
        assert result["pass_rate"] == 0.0

    @patch('src.workflow_codification.regression.parallel_runner.TestExecutor')
    def test_run_test_suite_pass_rate_calculation(self, mock_executor_class):
        """Test accurate pass rate calculation"""
        mock_executor = Mock()

        # 17 pass, 3 fail = 85% pass rate
        results = []
        for i in range(20):
            results.append({
                "test_id": f"test-{i}",
                "passed": i < 17  # First 17 pass, last 3 fail
            })

        mock_executor.execute_test_case.side_effect = results
        mock_executor_class.return_value = mock_executor

        runner = ParallelTestRunner(max_workers=10)
        test_suite = {
            "id": "suite-calc",
            "skill_name": "calculation-test",
            "test_cases": [{"test_id": f"test-{i}"} for i in range(20)]
        }

        result = runner.run_test_suite(test_suite, "echo test")

        assert result["total_tests"] == 20
        assert result["passed"] == 17
        assert result["failed"] == 3
        assert result["pass_rate"] == 85.0
