"""
ResultsStorage module for regression testing
Stores test run results in PostgreSQL
"""

import psycopg2
import psycopg2.extras
from datetime import datetime
from typing import Dict


class ResultsStorage:
    """Store and retrieve test run results from PostgreSQL"""

    def __init__(self, db_config: Dict):
        """
        Initialize results storage with database connection

        Args:
            db_config: PostgreSQL connection config dict with:
                - host: Database host
                - port: Database port
                - database: Database name
                - user: Database user
                - password: Database password
        """
        self.conn = psycopg2.connect(**db_config)

    def update_test_suite_results(
        self,
        suite_id: str,
        pass_rate: float,
        total_tests: int,
        passed: int,
        failed: int
    ):
        """
        Update test suite with latest run results

        Updates the regression_test_suites table with:
        - last_run_at: Current timestamp
        - last_run_pass_rate: Pass rate percentage
        - metadata.last_run: Detailed run information

        Args:
            suite_id: Test suite UUID
            pass_rate: Pass rate percentage (0-100)
            total_tests: Total number of tests
            passed: Number of passed tests
            failed: Number of failed tests
        """
        with self.conn.cursor() as cursor:
            cursor.execute("""
                UPDATE regression_test_suites
                SET last_run_at = NOW(),
                    last_run_pass_rate = %s,
                    metadata = jsonb_set(
                        COALESCE(metadata, '{}'),
                        '{last_run}',
                        %s::jsonb
                    )
                WHERE id = %s
            """, (
                pass_rate,
                psycopg2.extras.Json({
                    "total_tests": total_tests,
                    "passed": passed,
                    "failed": failed,
                    "timestamp": datetime.utcnow().isoformat()
                }),
                suite_id
            ))
            self.conn.commit()

    def close(self):
        """Close database connection"""
        self.conn.close()
