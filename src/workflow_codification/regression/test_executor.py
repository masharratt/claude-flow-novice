"""
TestExecutor module for regression testing
Executes individual test cases and compares results
"""

import subprocess
import time
from typing import Dict
from .output_comparator import OutputComparator


class TestExecutor:
    """Execute individual test cases and validate results"""

    def __init__(self, timeout: int = 300):
        """
        Initialize test executor

        Args:
            timeout: Maximum execution time in seconds (default: 300)
        """
        self.timeout = timeout
        self.comparator = OutputComparator()

    def execute_test_case(
        self,
        test_case: Dict,
        skill_command_template: str
    ) -> Dict:
        """
        Execute single test case

        Args:
            test_case: Test case dict with:
                - test_id: Unique identifier
                - input_parameters: Dict of parameters to substitute
                - expected_stdout: Expected output
                - expected_duration_seconds: Expected execution time
            skill_command_template: Command template with {param} placeholders

        Returns:
            Test result dict with:
            - test_id: Test identifier
            - passed: Whether test passed (output match + no duration regression)
            - similarity: Output similarity score
            - actual_duration: Actual execution time
            - expected_duration: Expected execution time
            - duration_regression: Whether duration exceeded threshold
            - exit_code: Process exit code
            - stdout_match: Whether stdout matched
            - error_message: Error message if failed
        """
        start_time = time.time()

        # Build command with input parameters
        params = test_case.get("input_parameters", {})
        skill_command = self._build_command(skill_command_template, params)

        # Execute skill
        try:
            process = subprocess.run(
                skill_command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=self.timeout
            )

            duration = time.time() - start_time

            actual_result = {
                "exit_code": process.returncode,
                "stdout": process.stdout,
                "stderr": process.stderr,
                "duration_seconds": duration
            }

        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            actual_result = {
                "exit_code": 124,  # Timeout exit code
                "stdout": "",
                "stderr": f"Test timed out after {self.timeout} seconds",
                "duration_seconds": duration
            }

        # Compare outputs
        comparison = self.comparator.compare_test_case(test_case, actual_result)

        # Check duration regression (50% slower = regression)
        expected_duration = test_case.get("expected_duration_seconds", 0)
        duration_regression = False
        if expected_duration > 0:
            duration_regression = duration > (expected_duration * 1.5)

        return {
            "test_id": test_case["test_id"],
            "passed": comparison["passed"] and not duration_regression,
            "similarity": comparison["similarity"],
            "actual_duration": duration,
            "expected_duration": expected_duration,
            "duration_regression": duration_regression,
            "exit_code": actual_result["exit_code"],
            "stdout_match": comparison["passed"],
            "error_message": actual_result["stderr"] if actual_result["exit_code"] != 0 else None
        }

    def _build_command(self, template: str, params: Dict) -> str:
        """
        Build command from template and parameters

        Args:
            template: Command template with {param} placeholders
            params: Dict of parameter values

        Returns:
            Command string with parameters substituted
        """
        command = template
        for key, value in params.items():
            placeholder = f"{{{key}}}"
            command = command.replace(placeholder, str(value))
        return command
