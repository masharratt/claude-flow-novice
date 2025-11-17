"""
Test Storage

PostgreSQL storage and retrieval of regression test suites.
Uses JSONB for efficient test case storage and querying.
"""

import psycopg2
import psycopg2.extras
from typing import List, Dict


class TestStorage:
    """PostgreSQL storage for regression test suites"""

    def __init__(self, db_config):
        """
        Initialize with database configuration

        Args:
            db_config: Dictionary with host, port, database, user, password
        """
        self.conn = psycopg2.connect(**db_config)

    def store_test_suite(
        self,
        skill_name: str,
        test_cases: List[Dict],
        priority: str = "P1"
    ) -> str:
        """
        Store regression test suite in PostgreSQL

        Args:
            skill_name: Name of skill
            test_cases: List of test case dictionaries
            priority: Overall suite priority (P0, P1, P2)

        Returns:
            Suite ID (UUID)

        Raises:
            Exception: If test_cases is empty (violates total_tests > 0 constraint)
        """
        if not test_cases:
            raise Exception("CHECK constraint failed: total_tests > 0")

        with self.conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO regression_test_suites
                (skill_name, total_tests, test_cases, priority)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (
                skill_name,
                len(test_cases),
                psycopg2.extras.Json(test_cases),
                priority
            ))

            suite_id = cursor.fetchone()[0]
            self.conn.commit()

            return suite_id

    def get_test_suite(self, skill_name: str) -> Dict:
        """
        Retrieve latest test suite for skill

        Args:
            skill_name: Name of skill

        Returns:
            Test suite dictionary or None if not found
        """
        with self.conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, skill_name, total_tests, test_cases, priority, generated_at
                FROM regression_test_suites
                WHERE skill_name = %s
                ORDER BY generated_at DESC
                LIMIT 1
            """, (skill_name,))

            row = cursor.fetchone()
            if not row:
                return None

            return {
                "id": row[0],
                "skill_name": row[1],
                "total_tests": row[2],
                "test_cases": row[3],
                "priority": row[4],
                "generated_at": row[5].isoformat() if row[5] else None
            }

    def close(self):
        """Close database connection"""
        self.conn.close()
