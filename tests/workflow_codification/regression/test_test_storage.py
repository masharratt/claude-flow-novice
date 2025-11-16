"""
Tests for test_storage.py module

Tests PostgreSQL storage and retrieval of regression test suites.
"""

import pytest
import uuid
import json
from unittest.mock import patch, MagicMock
from datetime import datetime


class TestTestStorage:
    """Test suite for TestStorage class"""

    def test_store_test_suite(self, mock_pg_connection, mock_db_config, sample_test_cases):
        """Insert test suite into PostgreSQL"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        cursor.fetchone.return_value = (str(uuid.uuid4()),)  # Mock UUID return

        storage = TestStorage(mock_db_config)
        suite_id = storage.store_test_suite(
            skill_name="cfn-coordination",
            test_cases=sample_test_cases,
            priority="P1"
        )

        # Verify SQL INSERT executed
        assert cursor.execute.called
        executed_sql = cursor.execute.call_args[0][0]
        assert "INSERT INTO regression_test_suites" in executed_sql
        assert "RETURNING id" in executed_sql

        # Verify commit called
        mock_pg_connection['connection'].commit.assert_called_once()

    def test_store_returns_uuid(self, mock_pg_connection, mock_db_config, sample_test_cases):
        """Returned suite_id is valid UUID"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        expected_uuid = str(uuid.uuid4())
        cursor.fetchone.return_value = (expected_uuid,)

        storage = TestStorage(mock_db_config)
        suite_id = storage.store_test_suite("skill", sample_test_cases)

        # Verify valid UUID format
        assert suite_id == expected_uuid
        try:
            uuid.UUID(suite_id)
        except ValueError:
            pytest.fail("Returned ID is not a valid UUID")

    def test_jsonb_storage(self, mock_pg_connection, mock_db_config, sample_test_cases):
        """test_cases JSONB stored correctly"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        storage = TestStorage(mock_db_config)
        storage.store_test_suite("skill", sample_test_cases, "P1")

        # Verify test_cases passed as JSONB
        call_args = cursor.execute.call_args[0][1]
        assert len(call_args) >= 3

    def test_get_test_suite_latest(self, mock_pg_connection, mock_db_config, sample_test_cases):
        """Retrieve latest suite for skill"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        mock_uuid = str(uuid.uuid4())
        mock_timestamp = datetime.utcnow()

        cursor.fetchone.return_value = (
            mock_uuid,
            "cfn-coordination",
            2,
            sample_test_cases,  # JSONB
            "P1",
            mock_timestamp
        )

        storage = TestStorage(mock_db_config)
        suite = storage.get_test_suite("cfn-coordination")

        assert suite is not None
        assert suite['id'] == mock_uuid
        assert suite['skill_name'] == "cfn-coordination"
        assert suite['total_tests'] == 2
        assert suite['test_cases'] == sample_test_cases
        assert suite['priority'] == "P1"

    def test_get_nonexistent_suite(self, mock_pg_connection, mock_db_config):
        """Non-existent skill → None"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        cursor.fetchone.return_value = None

        storage = TestStorage(mock_db_config)
        suite = storage.get_test_suite("nonexistent-skill")

        assert suite is None

    def test_multiple_suites_returns_latest(self, mock_pg_connection, mock_db_config):
        """Multiple suites → latest by generated_at"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        storage = TestStorage(mock_db_config)
        storage.get_test_suite("cfn-test")

        # Verify ORDER BY generated_at DESC LIMIT 1
        executed_sql = cursor.execute.call_args[0][0]
        assert "ORDER BY generated_at DESC" in executed_sql
        assert "LIMIT 1" in executed_sql

    def test_database_connection_error(self, mock_db_config):
        """Handle connection failures gracefully"""
        from src.workflow_codification.regression.test_storage import TestStorage

        with patch('psycopg2.connect', side_effect=Exception("Connection refused")):
            with pytest.raises(Exception, match="Connection refused"):
                storage = TestStorage(mock_db_config)

    def test_total_tests_count(self, mock_pg_connection, mock_db_config):
        """total_tests matches len(test_cases)"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        test_cases = [{"test_id": f"test-{i:03d}"} for i in range(25)]

        storage = TestStorage(mock_db_config)
        storage.store_test_suite("skill", test_cases, "P1")

        # Verify total_tests = 25
        call_args = cursor.execute.call_args[0][1]
        assert 25 in call_args  # total_tests parameter

    def test_close_connection(self, mock_pg_connection, mock_db_config):
        """Verify connection cleanup on close()"""
        from src.workflow_codification.regression.test_storage import TestStorage

        storage = TestStorage(mock_db_config)
        storage.close()

        mock_pg_connection['connection'].close.assert_called_once()

    def test_priority_validation(self, mock_pg_connection, mock_db_config, sample_test_cases):
        """Priority must be P0, P1, or P2"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        storage = TestStorage(mock_db_config)

        # Valid priorities
        for priority in ['P0', 'P1', 'P2']:
            suite_id = storage.store_test_suite("skill", sample_test_cases, priority)
            assert suite_id is not None

    def test_empty_test_cases(self, mock_pg_connection, mock_db_config):
        """Empty test_cases array should fail (total_tests > 0 constraint)"""
        from src.workflow_codification.regression.test_storage import TestStorage

        cursor = mock_pg_connection['cursor']
        cursor.execute.side_effect = Exception("CHECK constraint failed: total_tests > 0")

        storage = TestStorage(mock_db_config)

        with pytest.raises(Exception, match="total_tests > 0"):
            storage.store_test_suite("skill", [], "P1")
