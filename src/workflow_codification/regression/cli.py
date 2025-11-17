#!/usr/bin/env python3
"""
CLI tool for executing regression test suites
Usage: python3 -m src.workflow_codification.regression.cli --suite-id <uuid>
"""

import argparse
import sys
import json
from typing import Dict, Optional

from .parallel_runner import ParallelTestRunner
from .quality_gate import QualityGate, Mode
from .results_storage import ResultsStorage


def load_test_suite_from_db(suite_id: str, db_config: Dict) -> Optional[Dict]:
    """
    Load test suite from PostgreSQL

    Args:
        suite_id: Test suite UUID
        db_config: Database connection config

    Returns:
        Test suite dict or None if not found
    """
    import psycopg2

    try:
        conn = psycopg2.connect(**db_config)
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, skill_name, metadata, command_template
                FROM regression_test_suites
                WHERE id = %s
            """, (suite_id,))

            row = cursor.fetchone()
            if not row:
                return None

            # Fetch test cases
            cursor.execute("""
                SELECT test_id, input_parameters, expected_stdout,
                       expected_duration_seconds
                FROM regression_test_cases
                WHERE suite_id = %s
            """, (suite_id,))

            test_cases = []
            for test_row in cursor.fetchall():
                test_cases.append({
                    "test_id": test_row[0],
                    "input_parameters": test_row[1],
                    "expected_stdout": test_row[2],
                    "expected_duration_seconds": test_row[3]
                })

            return {
                "id": row[0],
                "skill_name": row[1],
                "metadata": row[2],
                "command_template": row[3],
                "test_cases": test_cases
            }

    except Exception as e:
        print(f"Error loading test suite: {e}", file=sys.stderr)
        return None
    finally:
        conn.close()


def execute_test_suite(
    suite_id: str,
    db_config: Dict,
    mode: Mode = Mode.STANDARD,
    max_workers: int = 10
) -> int:
    """
    Execute test suite and store results

    Args:
        suite_id: Test suite UUID
        db_config: Database connection config
        mode: Quality gate mode (mvp, standard, enterprise)
        max_workers: Number of parallel workers

    Returns:
        Exit code (0 = success, 1 = quality gate failed, 2 = error)
    """
    # Load test suite
    print(f"Loading test suite {suite_id}...")
    test_suite = load_test_suite_from_db(suite_id, db_config)
    if not test_suite:
        print(f"Test suite {suite_id} not found", file=sys.stderr)
        return 2

    skill_name = test_suite["skill_name"]
    command_template = test_suite["command_template"]
    test_count = len(test_suite["test_cases"])

    print(f"Test suite: {skill_name}")
    print(f"Test cases: {test_count}")
    print(f"Workers: {max_workers}")
    print(f"Quality mode: {mode.value}")
    print()

    # Execute tests in parallel
    print("Executing tests...")
    runner = ParallelTestRunner(max_workers=max_workers)
    results = runner.run_test_suite(test_suite, command_template)

    # Display results
    print()
    print("=" * 60)
    print("TEST RESULTS")
    print("=" * 60)
    print(f"Total tests:  {results['total_tests']}")
    print(f"Passed:       {results['passed']} ✓")
    print(f"Failed:       {results['failed']} ✗")
    print(f"Pass rate:    {results['pass_rate']:.1f}%")
    print()

    # Check quality gate
    gate_result = QualityGate.check_quality_gate(results['pass_rate'], mode)
    print("QUALITY GATE")
    print("-" * 60)
    print(f"Threshold:    {gate_result['threshold']}%")
    print(f"Status:       {'PASS ✓' if gate_result['passes'] else 'FAIL ✗'}")
    print(f"Recommendation: {gate_result['recommendation']}")
    print()

    # Store results
    storage = ResultsStorage(db_config)
    storage.update_test_suite_results(
        suite_id=suite_id,
        pass_rate=results['pass_rate'],
        total_tests=results['total_tests'],
        passed=results['passed'],
        failed=results['failed']
    )
    storage.close()
    print("Results stored to database")

    # Return appropriate exit code
    if not gate_result['passes']:
        return 1  # Quality gate failed
    return 0  # Success


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description='Execute regression test suites'
    )
    parser.add_argument(
        '--suite-id',
        required=True,
        help='Test suite UUID'
    )
    parser.add_argument(
        '--mode',
        choices=['mvp', 'standard', 'enterprise'],
        default='standard',
        help='Quality gate mode (default: standard)'
    )
    parser.add_argument(
        '--workers',
        type=int,
        default=10,
        help='Number of parallel workers (default: 10)'
    )
    parser.add_argument(
        '--db-host',
        default='localhost',
        help='Database host (default: localhost)'
    )
    parser.add_argument(
        '--db-port',
        type=int,
        default=5432,
        help='Database port (default: 5432)'
    )
    parser.add_argument(
        '--db-name',
        default='cfn_workflow',
        help='Database name (default: cfn_workflow)'
    )
    parser.add_argument(
        '--db-user',
        default='cfn_user',
        help='Database user (default: cfn_user)'
    )
    parser.add_argument(
        '--db-password',
        default='',
        help='Database password'
    )

    args = parser.parse_args()

    # Build database config
    db_config = {
        'host': args.db_host,
        'port': args.db_port,
        'database': args.db_name,
        'user': args.db_user,
        'password': args.db_password
    }

    # Convert mode string to enum
    mode_map = {
        'mvp': Mode.MVP,
        'standard': Mode.STANDARD,
        'enterprise': Mode.ENTERPRISE
    }
    mode = mode_map[args.mode]

    # Execute test suite
    exit_code = execute_test_suite(
        suite_id=args.suite_id,
        db_config=db_config,
        mode=mode,
        max_workers=args.workers
    )

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
