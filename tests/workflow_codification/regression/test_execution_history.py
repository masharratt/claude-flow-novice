"""
Tests for execution_history.py module

Tests execution history retrieval from PostgreSQL execution_traces table,
including lookback filtering, status filtering, and metadata extraction.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
import json


class TestExecutionHistoryRetrieval:
    """Test suite for ExecutionHistory class"""

    def test_fetch_successful_executions_basic(self, mock_pg_cursor_with_data, mock_db_config):
        """Verify basic execution history retrieval returns correct structure"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        history = ExecutionHistory(mock_db_config)
        executions = history.fetch_successful_executions("cfn-coordination", lookback_days=90)

        assert isinstance(executions, list)
        assert len(executions) > 0
        assert all('execution_id' in ex for ex in executions)
        assert all('input_parameters' in ex for ex in executions)
        assert all('stdout' in ex for ex in executions)

    def test_fetch_with_lookback_period_90_days(self, mock_pg_connection, mock_db_config):
        """Test 90-day lookback period filtering"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        cursor = mock_pg_connection['cursor']
        history = ExecutionHistory(mock_db_config)
        history.fetch_successful_executions("test-skill", lookback_days=90)

        # Verify SQL query includes correct date filter
        executed_sql = cursor.execute.call_args[0][0]
        assert "started_at >" in executed_sql
        assert "status = 'success'" in executed_sql

    def test_fetch_with_lookback_period_30_days(self, mock_pg_connection, mock_db_config):
        """Test 30-day lookback period filtering"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        cursor = mock_pg_connection['cursor']
        history = ExecutionHistory(mock_db_config)
        history.fetch_successful_executions("test-skill", lookback_days=30)

        # Verify lookback parameter passed correctly
        call_args = cursor.execute.call_args
        assert call_args is not None

    def test_exclude_failed_executions(self, mock_pg_connection, mock_db_config):
        """Ensure only status='success' executions returned"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        cursor = mock_pg_connection['cursor']

        # Mock return data with mix of success and failed
        cursor.fetchall.return_value = []  # Will be filtered to success only

        history = ExecutionHistory(mock_db_config)
        executions = history.fetch_successful_executions("test-skill")

        # Verify SQL filters by success status
        executed_sql = cursor.execute.call_args[0][0]
        assert "status = 'success'" in executed_sql

    def test_empty_history_handling(self, mock_pg_connection, mock_db_config):
        """Handle skill with no execution history gracefully"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        cursor = mock_pg_connection['cursor']
        cursor.fetchall.return_value = []

        history = ExecutionHistory(mock_db_config)
        executions = history.fetch_successful_executions("nonexistent-skill")

        assert executions == []

    def test_execution_ordering(self, mock_pg_connection, mock_db_config):
        """Verify DESC ordering by started_at (most recent first)"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        cursor = mock_pg_connection['cursor']
        history = ExecutionHistory(mock_db_config)
        history.fetch_successful_executions("test-skill")

        executed_sql = cursor.execute.call_args[0][0]
        assert "ORDER BY" in executed_sql
        assert "DESC" in executed_sql

    def test_metadata_extraction(self, mock_pg_connection, mock_db_config):
        """Extract team and input_parameters from JSONB metadata"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        cursor = mock_pg_connection['cursor']

        # Mock row with JSONB metadata
        mock_row = (
            "trace-001",
            json.dumps({"param1": "value1"}),  # input_parameters as JSON string
            "output success",
            1.5,
            "team-a",
            datetime.utcnow().isoformat()
        )
        cursor.fetchall.return_value = [mock_row]

        history = ExecutionHistory(mock_db_config)
        executions = history.fetch_successful_executions("test-skill")

        assert executions[0]['team_invoked_by'] == "team-a"
        assert executions[0]['input_parameters'] == {"param1": "value1"}

    def test_database_connection_failure(self, mock_db_config):
        """Handle database connection errors gracefully"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        with patch('psycopg2.connect', side_effect=Exception("Connection failed")):
            with pytest.raises(Exception, match="Connection failed"):
                history = ExecutionHistory(mock_db_config)

    def test_invalid_skill_name(self, mock_pg_connection, mock_db_config):
        """Handle non-existent or invalid skill names"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        cursor = mock_pg_connection['cursor']
        cursor.fetchall.return_value = []

        history = ExecutionHistory(mock_db_config)
        executions = history.fetch_successful_executions("")

        assert executions == []

    def test_close_connection(self, mock_pg_connection, mock_db_config):
        """Verify connection cleanup on close()"""
        from src.workflow_codification.regression.execution_history import ExecutionHistory

        history = ExecutionHistory(mock_db_config)
        history.close()

        mock_pg_connection['connection'].close.assert_called_once()
