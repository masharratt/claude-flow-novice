"""
Pytest Fixtures for Regression Testing Module

Provides mock data, database fixtures, and test utilities for
comprehensive testing of the regression test suite generator.
"""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, MagicMock
from typing import List, Dict


@pytest.fixture
def mock_db_config():
    """Mock PostgreSQL connection configuration"""
    return {
        "host": "localhost",
        "port": 5432,
        "database": "test_workflow_codification",
        "user": "test_user",
        "password": "test_pass"
    }


@pytest.fixture
def sample_execution_traces():
    """
    Sample execution_traces data for testing

    Generates 100 mock execution records with:
    - Mixed teams (team-a: 70%, team-b: 30%)
    - Successful executions only
    - Varied parameters for deduplication testing
    - Realistic timestamps (last 90 days)
    """
    base_time = datetime.utcnow()
    traces = []

    for i in range(100):
        # Create some duplicate parameters for deduplication testing
        param_set = i // 10  # Groups of 10 with same parameters

        trace = {
            "trace_id": f"trace-{i:03d}",
            "skill_name": "cfn-coordination",
            "started_at": (base_time - timedelta(days=i % 90)).isoformat(),
            "completed_at": (base_time - timedelta(days=i % 90, hours=-1)).isoformat(),
            "total_duration_ms": 1500 + i * 100,
            "status": "success",
            "metadata": {
                "team": "team-a" if i % 10 < 7 else "team-b",  # 70/30 split
                "input_parameters": {
                    "param1": f"value{param_set}",
                    "param2": f"option{param_set}"
                }
            },
            "steps": [
                {"step": "validate", "output": "validation passed"},
                {"step": "execute", "output": f"execution result {i}"}
            ]
        }
        traces.append(trace)

    return traces


@pytest.fixture
def sample_execution_traces_with_failures():
    """
    Sample execution_traces including failed executions

    Should be filtered out by execution history retrieval
    """
    base_time = datetime.utcnow()
    traces = []

    for i in range(20):
        status = "success" if i % 3 != 0 else "failed"  # 1/3 failed

        trace = {
            "trace_id": f"trace-mixed-{i:03d}",
            "skill_name": "cfn-coordination",
            "started_at": (base_time - timedelta(days=i)).isoformat(),
            "completed_at": (base_time - timedelta(days=i, hours=-1)).isoformat() if status == "success" else None,
            "total_duration_ms": 1500 + i * 100 if status == "success" else None,
            "status": status,
            "metadata": {
                "team": "team-a",
                "input_parameters": {"param1": f"value{i}"}
            },
            "steps": [{"step": "execute", "output": f"result {i}"}] if status == "success" else [],
            "error_message": "execution failed" if status == "failed" else None
        }
        traces.append(trace)

    return traces


@pytest.fixture
def small_execution_set():
    """
    Small set of executions (20 total) for testing edge cases

    Used for testing sampling behavior when executions < sample_size
    """
    base_time = datetime.utcnow()
    return [
        {
            "trace_id": f"small-{i:03d}",
            "skill_name": "test-skill",
            "started_at": (base_time - timedelta(days=i)).isoformat(),
            "completed_at": (base_time - timedelta(days=i, hours=-1)).isoformat(),
            "total_duration_ms": 2000,
            "status": "success",
            "metadata": {
                "team": f"team-{i % 3}",  # 3 teams
                "input_parameters": {"test": f"param{i}"}
            },
            "steps": [{"step": "run", "output": f"output {i}"}]
        }
        for i in range(20)
    ]


@pytest.fixture
def duplicate_parameter_executions():
    """
    Executions with intentional duplicate parameters

    Tests deduplication logic - should reduce to 5 unique parameter sets
    Note: Uses flattened format (post-execution_history retrieval)
    """
    base_time = datetime.utcnow()
    traces = []

    # 5 unique parameter sets, each repeated 4 times
    for param_id in range(5):
        for repeat in range(4):
            trace = {
                "execution_id": f"dup-{param_id}-{repeat}",
                "input_parameters": {  # Flattened (not in metadata)
                    "mode": f"mode{param_id}",
                    "count": 100 + param_id
                },
                "stdout": "success",
                "execution_duration_seconds": 1.0,
                "team_invoked_by": "team-a",
                "execution_started_at": (base_time - timedelta(hours=param_id * 4 + repeat)).isoformat()
            }
            traces.append(trace)

    return traces


@pytest.fixture
def mock_pg_connection():
    """
    Mock psycopg2 connection and cursor

    Provides controlled database interaction for testing without real PostgreSQL
    """
    from unittest.mock import patch, MagicMock

    mock_conn = MagicMock()
    mock_cursor = MagicMock()

    # Setup cursor context manager
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_conn.cursor.return_value.__exit__.return_value = None

    # Mock psycopg2.connect to return our mock connection
    with patch('psycopg2.connect', return_value=mock_conn):
        yield {
            'connection': mock_conn,
            'cursor': mock_cursor
        }


@pytest.fixture
def mock_pg_cursor_with_data(mock_pg_connection, sample_execution_traces):
    """
    Mock PostgreSQL cursor pre-loaded with sample execution traces

    Simulates successful database query with realistic result set
    """
    cursor = mock_pg_connection['cursor']

    # Convert traces to database row format
    rows = []
    for trace in sample_execution_traces:
        row = (
            trace['trace_id'],
            json.dumps(trace['metadata'].get('input_parameters', {})),
            trace['steps'][-1]['output'] if trace['steps'] else '',
            trace['total_duration_ms'] / 1000,  # Convert to seconds
            trace['metadata'].get('team', 'unknown'),
            trace['started_at']
        )
        rows.append(row)

    cursor.fetchall.return_value = rows
    return mock_pg_connection


@pytest.fixture
def frequency_map():
    """
    Sample frequency map for priority assignment testing

    Maps parameter hashes to occurrence counts
    """
    return {
        "hash1": 15,  # P0 (≥10)
        "hash2": 7,   # P1 (3-9)
        "hash3": 2,   # P2 (<3)
        "hash4": 1,   # P2
        "hash5": 12,  # P0
    }


@pytest.fixture
def sample_test_cases():
    """
    Sample generated test cases for storage testing
    """
    return [
        {
            "test_id": "cfn-coordination-reg-001",
            "skill_name": "cfn-coordination",
            "input_parameters": {"mode": "standard", "count": 10},
            "expected_stdout": "execution successful",
            "expected_duration_seconds": 1.5,
            "priority": "P0",
            "created_at": datetime.utcnow().isoformat(),
            "metadata": {
                "source_execution_id": "trace-001",
                "team": "team-a"
            }
        },
        {
            "test_id": "cfn-coordination-reg-002",
            "skill_name": "cfn-coordination",
            "input_parameters": {"mode": "mvp", "count": 5},
            "expected_stdout": "execution successful",
            "expected_duration_seconds": 0.8,
            "priority": "P1",
            "created_at": datetime.utcnow().isoformat(),
            "metadata": {
                "source_execution_id": "trace-002",
                "team": "team-b"
            }
        }
    ]


@pytest.fixture
def empty_execution_history():
    """Empty execution history for edge case testing"""
    return []


@pytest.fixture
def single_execution():
    """Single execution for minimum edge case testing"""
    return [{
        "trace_id": "single-001",
        "skill_name": "test-skill",
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": (datetime.utcnow() + timedelta(seconds=1)).isoformat(),
        "total_duration_ms": 1000,
        "status": "success",
        "metadata": {
            "team": "team-a",
            "input_parameters": {"test": "value"}
        },
        "steps": [{"step": "run", "output": "success"}]
    }]
