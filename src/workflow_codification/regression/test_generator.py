"""
Regression Test Suite Generator

Main orchestrator that combines all components to generate
regression test suites from execution history.

Workflow:
    1. Fetch successful executions from PostgreSQL (execution_traces table)
    2. Deduplicate by SHA256 hash of input parameters
    3. Stratified sampling by team (proportional representation)
    4. Build test cases with priority assignment
    5. Store test suite in PostgreSQL (regression_test_suites table)
"""

from typing import Dict
from .execution_history import ExecutionHistory
from .deduplicator import ExecutionDeduplicator
from .execution_sampler import ExecutionSampler
from .test_case_builder import TestCaseBuilder
from .test_storage import TestStorage


class RegressionTestGenerator:
    """Main orchestrator for regression test suite generation"""

    def __init__(self, db_config):
        """
        Initialize with database configuration

        Args:
            db_config: Dictionary with host, port, database, user, password
        """
        self.history = ExecutionHistory(db_config)
        self.deduplicator = ExecutionDeduplicator()
        self.sampler = ExecutionSampler()
        self.builder = TestCaseBuilder()
        self.storage = TestStorage(db_config)

    def generate_test_suite(
        self,
        skill_name: str,
        lookback_days: int = 90,
        sample_size: int = 50
    ) -> Dict:
        """
        Generate complete regression test suite

        This is the main entry point that orchestrates the entire workflow:
        1. Fetch execution history (last N days)
        2. Deduplicate by input parameters (SHA256)
        3. Stratified sampling (proportional by team)
        4. Build test cases with priorities
        5. Store in PostgreSQL

        Args:
            skill_name: Name of skill to generate tests for
            lookback_days: Historical data range (default: 90)
            sample_size: Target number of test cases (default: 50)

        Returns:
            Test suite summary with counts and suite_id
        """
        # Step 1: Fetch successful executions
        executions = self.history.fetch_successful_executions(
            skill_name, lookback_days
        )

        if not executions:
            return {
                "skill_name": skill_name,
                "total_tests": 0,
                "error": "No successful executions found"
            }

        # Step 2: Deduplicate by input parameters
        unique_executions = self.deduplicator.deduplicate_by_input(executions)

        # Step 3: Stratified sampling (proportional by team)
        sampled_executions = self.sampler.stratified_sample(
            unique_executions,
            sample_size,
            strata_key='team_invoked_by'
        )

        # Step 4: Build frequency map for priority assignment
        frequency_map = {}
        for execution in executions:
            param_hash = self.deduplicator.hash_parameters(
                execution.get('input_parameters', {})
            )
            frequency_map[param_hash] = frequency_map.get(param_hash, 0) + 1

        # Step 5: Build test cases
        test_cases = self.builder.build_test_suite(
            skill_name, sampled_executions, frequency_map
        )

        # Step 6: Store in PostgreSQL
        suite_id = self.storage.store_test_suite(skill_name, test_cases)

        return {
            "suite_id": suite_id,
            "skill_name": skill_name,
            "total_tests": len(test_cases),
            "sample_size": sample_size,
            "executions_analyzed": len(executions),
            "unique_patterns": len(unique_executions),
            "test_cases_generated": len(test_cases)
        }

    def close(self):
        """Close all database connections"""
        self.history.close()
        self.storage.close()


def main():
    """CLI entry point for manual test suite generation"""
    import argparse
    import os

    parser = argparse.ArgumentParser(
        description='Generate regression test suite from execution history'
    )
    parser.add_argument('--skill', required=True, help='Skill name to generate tests for')
    parser.add_argument('--lookback-days', type=int, default=90,
                       help='Days of history to analyze (default: 90)')
    parser.add_argument('--sample-size', type=int, default=50,
                       help='Target number of test cases (default: 50)')
    parser.add_argument('--db-host', default='localhost', help='PostgreSQL host')
    parser.add_argument('--db-port', type=int, default=5432, help='PostgreSQL port')
    parser.add_argument('--db-name', default='workflow_codification', help='Database name')
    parser.add_argument('--db-user', default='postgres', help='Database user')
    parser.add_argument('--db-password', help='Database password (or use PGPASSWORD env var)')

    args = parser.parse_args()

    # Database configuration
    db_config = {
        'host': args.db_host,
        'port': args.db_port,
        'database': args.db_name,
        'user': args.db_user,
        'password': args.db_password or os.getenv('PGPASSWORD', '')
    }

    # Generate test suite
    generator = RegressionTestGenerator(db_config)
    try:
        summary = generator.generate_test_suite(
            args.skill,
            lookback_days=args.lookback_days,
            sample_size=args.sample_size
        )

        print("✅ Regression Test Suite Generated")
        print(f"   Skill: {summary['skill_name']}")
        print(f"   Suite ID: {summary.get('suite_id', 'N/A')}")
        print(f"   Total Tests: {summary['total_tests']}")
        print(f"   Executions Analyzed: {summary.get('executions_analyzed', 0)}")
        print(f"   Unique Patterns: {summary.get('unique_patterns', 0)}")

    finally:
        generator.close()


if __name__ == '__main__':
    main()
