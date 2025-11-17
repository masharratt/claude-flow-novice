"""
ParallelTestRunner module for regression testing
Executes test suites in parallel using ThreadPoolExecutor
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict
from .test_executor import TestExecutor


class ParallelTestRunner:
    """Run test suites in parallel with configurable workers"""

    def __init__(self, max_workers: int = 10):
        """
        Initialize parallel test runner

        Args:
            max_workers: Maximum number of concurrent workers (default: 10)
        """
        self.max_workers = max_workers
        self.executor_pool = None

    def run_test_suite(
        self,
        test_suite: Dict,
        skill_command_template: str
    ) -> Dict:
        """
        Run entire test suite in parallel

        Args:
            test_suite: Test suite dict with:
                - id: Suite identifier
                - skill_name: Skill being tested
                - test_cases: List of test case dicts
            skill_command_template: Command template for skill execution

        Returns:
            Aggregated test run results dict with:
            - suite_id: Test suite identifier
            - skill_name: Skill name
            - total_tests: Total test count
            - passed: Number of passed tests
            - failed: Number of failed tests
            - pass_rate: Pass rate percentage
            - results: List of individual test results
        """
        test_cases = test_suite.get("test_cases", [])
        if not test_cases:
            return {
                "total_tests": 0,
                "passed": 0,
                "failed": 0,
                "pass_rate": 0.0,
                "results": []
            }

        # Execute tests in parallel
        results = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all test cases
            future_to_test = {}
            for test_case in test_cases:
                test_executor = TestExecutor()
                future = executor.submit(
                    test_executor.execute_test_case,
                    test_case,
                    skill_command_template
                )
                future_to_test[future] = test_case["test_id"]

            # Collect results as they complete
            for future in as_completed(future_to_test):
                test_id = future_to_test[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    results.append({
                        "test_id": test_id,
                        "passed": False,
                        "error_message": str(e)
                    })

        # Aggregate results
        passed = sum(1 for r in results if r.get("passed", False))
        failed = len(results) - passed
        pass_rate = (passed / len(results)) * 100 if results else 0.0

        return {
            "suite_id": test_suite.get("id"),
            "skill_name": test_suite.get("skill_name"),
            "total_tests": len(results),
            "passed": passed,
            "failed": failed,
            "pass_rate": pass_rate,
            "results": results
        }
