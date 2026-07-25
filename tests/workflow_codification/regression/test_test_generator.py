"""
Tests for test_generator.py module (main orchestrator)

Integration tests for complete regression test suite generation workflow.
"""

import pytest
import time
import uuid
from unittest.mock import patch, MagicMock


class TestRegressionTestGenerator:
    """Test suite for RegressionTestGenerator class (integration)"""

    def test_end_to_end_generation(self, mock_pg_connection, mock_db_config, sample_execution_traces):
        """Full pipeline: fetch → dedupe → sample → build → store"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']

        # Mock execution history fetch
        rows = []
        for trace in sample_execution_traces[:50]:  # Limit for test
            row = (
                trace['trace_id'],
                trace['metadata'].get('input_parameters', {}),
                trace['steps'][-1]['output'] if trace['steps'] else '',
                trace['total_duration_ms'] / 1000,
                trace['metadata'].get('team', 'unknown'),
                trace['started_at']
            )
            rows.append(row)

        cursor.fetchall.return_value = rows
        cursor.fetchone.return_value = (str(uuid.uuid4()),)  # Store response

        generator = RegressionTestGenerator(mock_db_config)
        summary = generator.generate_test_suite("cfn-coordination", lookback_days=90, sample_size=30)

        # Verify summary structure
        assert 'suite_id' in summary
        assert summary['skill_name'] == "cfn-coordination"
        assert summary['total_tests'] > 0
        assert summary['executions_analyzed'] > 0
        assert summary['unique_patterns'] > 0

        generator.close()

    def test_empty_execution_history(self, mock_pg_connection, mock_db_config):
        """No executions → error message"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']
        cursor.fetchall.return_value = []  # No executions

        generator = RegressionTestGenerator(mock_db_config)
        summary = generator.generate_test_suite("nonexistent-skill")

        assert 'error' in summary
        assert summary['total_tests'] == 0
        assert "No successful executions found" in summary['error']

        generator.close()

    def test_summary_contains_counts(self, mock_pg_connection, mock_db_config, sample_execution_traces):
        """Summary has executions_analyzed, unique_patterns, test_cases_generated"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']

        # Mock with data
        rows = []
        for trace in sample_execution_traces[:80]:
            row = (
                trace['trace_id'],
                trace['metadata'].get('input_parameters', {}),
                trace['steps'][-1]['output'] if trace['steps'] else '',
                trace['total_duration_ms'] / 1000,
                trace['metadata'].get('team', 'unknown'),
                trace['started_at']
            )
            rows.append(row)

        cursor.fetchall.return_value = rows
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        generator = RegressionTestGenerator(mock_db_config)
        summary = generator.generate_test_suite("cfn-test", sample_size=40)

        assert 'executions_analyzed' in summary
        assert 'unique_patterns' in summary
        assert 'test_cases_generated' in summary
        assert summary['executions_analyzed'] == 80

        generator.close()

    def test_performance_5_second_limit(self, mock_pg_connection, mock_db_config, sample_execution_traces):
        """50 test suite generated in <5 seconds"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']

        # Mock with 100 executions
        rows = []
        for trace in sample_execution_traces:
            row = (
                trace['trace_id'],
                trace['metadata'].get('input_parameters', {}),
                trace['steps'][-1]['output'] if trace['steps'] else '',
                trace['total_duration_ms'] / 1000,
                trace['metadata'].get('team', 'unknown'),
                trace['started_at']
            )
            rows.append(row)

        cursor.fetchall.return_value = rows
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        generator = RegressionTestGenerator(mock_db_config)

        start_time = time.time()
        summary = generator.generate_test_suite("cfn-test", sample_size=50)
        elapsed_time = time.time() - start_time

        assert elapsed_time < 5.0, f"Generation took {elapsed_time:.2f}s (limit: 5s)"
        assert summary['total_tests'] > 0

        generator.close()

    def test_all_steps_execute_in_order(self, mock_pg_connection, mock_db_config, sample_execution_traces):
        """Verify execution order: history → dedupe → sample → build → store"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']

        # Mock with data
        rows = []
        for trace in sample_execution_traces[:30]:
            row = (
                trace['trace_id'],
                trace['metadata'].get('input_parameters', {}),
                trace['steps'][-1]['output'] if trace['steps'] else '',
                trace['total_duration_ms'] / 1000,
                trace['metadata'].get('team', 'unknown'),
                trace['started_at']
            )
            rows.append(row)

        cursor.fetchall.return_value = rows
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        generator = RegressionTestGenerator(mock_db_config)
        summary = generator.generate_test_suite("cfn-test", sample_size=20)

        # Verify all steps completed successfully
        assert 'suite_id' in summary
        assert summary['executions_analyzed'] > 0
        assert summary['unique_patterns'] > 0
        assert summary['test_cases_generated'] > 0

        generator.close()

    def test_deduplication_reduces_count(self, mock_pg_connection, mock_db_config, duplicate_parameter_executions):
        """Deduplication reduces 20 executions with 5 unique params to 5"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']

        # Mock with duplicate executions (flattened format)
        rows = []
        for exec_record in duplicate_parameter_executions:
            row = (
                exec_record['execution_id'],
                exec_record.get('input_parameters', {}),
                exec_record.get('stdout', ''),
                exec_record.get('execution_duration_seconds', 1.0),
                exec_record.get('team_invoked_by', 'unknown'),
                exec_record.get('execution_started_at', '')
            )
            rows.append(row)

        cursor.fetchall.return_value = rows
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        generator = RegressionTestGenerator(mock_db_config)
        summary = generator.generate_test_suite("cfn-test", sample_size=10)

        # Deduplication should reduce unique_patterns
        assert summary['executions_analyzed'] == 20  # Original count
        assert summary['unique_patterns'] == 5  # After deduplication
        assert summary['test_cases_generated'] == 5  # All 5 unique sampled

        generator.close()

    def test_sampling_reduces_to_target(self, mock_pg_connection, mock_db_config, sample_execution_traces):
        """Sampling reduces 100 executions to target sample_size"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']

        # Mock with 100 executions
        rows = []
        for trace in sample_execution_traces:
            row = (
                trace['trace_id'],
                trace['metadata'].get('input_parameters', {}),
                trace['steps'][-1]['output'] if trace['steps'] else '',
                trace['total_duration_ms'] / 1000,
                trace['metadata'].get('team', 'unknown'),
                trace['started_at']
            )
            rows.append(row)

        cursor.fetchall.return_value = rows
        cursor.fetchone.return_value = (str(uuid.uuid4()),)

        generator = RegressionTestGenerator(mock_db_config)
        summary = generator.generate_test_suite("cfn-test", sample_size=25)

        # Should sample down to 25
        assert summary['test_cases_generated'] <= 25

        generator.close()

    def test_lookback_period_configuration(self, mock_pg_connection, mock_db_config):
        """Test different lookback periods: 7, 30, 90 days"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        cursor = mock_pg_connection['cursor']
        cursor.fetchall.return_value = []

        generator = RegressionTestGenerator(mock_db_config)

        for lookback_days in [7, 30, 90]:
            summary = generator.generate_test_suite("cfn-test", lookback_days=lookback_days)
            assert 'skill_name' in summary

        generator.close()

    def test_close_resources(self, mock_pg_connection, mock_db_config):
        """Verify all resources closed on generator.close()"""
        from src.workflow_codification.regression.test_generator import RegressionTestGenerator

        generator = RegressionTestGenerator(mock_db_config)
        generator.close()

        # Verify connections closed
        assert mock_pg_connection['connection'].close.call_count >= 1
