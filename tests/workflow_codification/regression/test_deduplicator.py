"""
Tests for deduplicator.py module

Tests SHA256 hashing of input parameters and deduplication logic.
"""

import pytest
import hashlib
import json


class TestExecutionDeduplicator:
    """Test suite for ExecutionDeduplicator class"""

    def test_sha256_hash_consistency(self):
        """Same parameters should always produce same hash"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        params1 = {"mode": "standard", "count": 10}
        params2 = {"mode": "standard", "count": 10}

        hash1 = ExecutionDeduplicator.hash_parameters(params1)
        hash2 = ExecutionDeduplicator.hash_parameters(params2)

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 produces 64 hex characters

    def test_hash_different_parameters(self):
        """Different parameters should produce different hashes"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        params1 = {"mode": "standard", "count": 10}
        params2 = {"mode": "mvp", "count": 5}

        hash1 = ExecutionDeduplicator.hash_parameters(params1)
        hash2 = ExecutionDeduplicator.hash_parameters(params2)

        assert hash1 != hash2

    def test_hash_key_order_independence(self):
        """Parameter order shouldn't affect hash (sort_keys=True)"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        params1 = {"a": 1, "b": 2, "c": 3}
        params2 = {"c": 3, "a": 1, "b": 2}
        params3 = {"b": 2, "c": 3, "a": 1}

        hash1 = ExecutionDeduplicator.hash_parameters(params1)
        hash2 = ExecutionDeduplicator.hash_parameters(params2)
        hash3 = ExecutionDeduplicator.hash_parameters(params3)

        assert hash1 == hash2 == hash3

    def test_deduplicate_removes_duplicates(self, duplicate_parameter_executions):
        """Duplicate input parameters should be reduced to one execution"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        # 20 executions with 5 unique parameter sets (4 duplicates each)
        deduplicated = ExecutionDeduplicator.deduplicate_by_input(duplicate_parameter_executions)

        assert len(deduplicated) == 5  # Only unique parameter sets
        assert len(duplicate_parameter_executions) == 20  # Original unchanged

    def test_keeps_most_recent(self):
        """When deduplicating, keep first occurrence (most recent, since DESC ordered)"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        executions = [
            {
                "execution_id": "exec-001",
                "input_parameters": {"test": "value"},
                "started_at": "2025-01-10T10:00:00"
            },
            {
                "execution_id": "exec-002",
                "input_parameters": {"test": "value"},  # Duplicate
                "started_at": "2025-01-09T10:00:00"
            },
            {
                "execution_id": "exec-003",
                "input_parameters": {"test": "other"},
                "started_at": "2025-01-08T10:00:00"
            }
        ]

        deduplicated = ExecutionDeduplicator.deduplicate_by_input(executions)

        assert len(deduplicated) == 2
        assert deduplicated[0]['execution_id'] == "exec-001"  # Most recent kept
        assert deduplicated[1]['execution_id'] == "exec-003"

    def test_empty_parameters_handling(self):
        """Handle empty or null input parameters"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        # Empty dict
        hash1 = ExecutionDeduplicator.hash_parameters({})
        assert len(hash1) == 64

        # None becomes empty dict
        hash2 = ExecutionDeduplicator.hash_parameters({})
        assert hash1 == hash2

    def test_nested_parameters_hashing(self):
        """Complex nested parameters should hash correctly"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        params1 = {
            "config": {
                "mode": "standard",
                "options": ["a", "b", "c"]
            },
            "count": 10
        }
        params2 = {
            "config": {
                "mode": "standard",
                "options": ["a", "b", "c"]
            },
            "count": 10
        }

        hash1 = ExecutionDeduplicator.hash_parameters(params1)
        hash2 = ExecutionDeduplicator.hash_parameters(params2)

        assert hash1 == hash2

    def test_deduplicate_empty_list(self):
        """Deduplicating empty list returns empty list"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        deduplicated = ExecutionDeduplicator.deduplicate_by_input([])
        assert deduplicated == []

    def test_deduplicate_single_execution(self, single_execution):
        """Single execution remains unchanged"""
        from src.workflow_codification.regression.deduplicator import ExecutionDeduplicator

        deduplicated = ExecutionDeduplicator.deduplicate_by_input(single_execution)
        assert len(deduplicated) == 1
        assert deduplicated[0] == single_execution[0]
