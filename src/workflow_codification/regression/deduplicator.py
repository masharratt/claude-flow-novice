"""
Execution Deduplicator

Provides SHA256-based deduplication of skill executions by input parameters.
Ensures test suite contains only unique parameter combinations.
"""

import hashlib
import json
from typing import List, Dict


class ExecutionDeduplicator:
    """Deduplicate executions by SHA256 hash of input parameters"""

    @staticmethod
    def hash_parameters(parameters: Dict) -> str:
        """
        Generate SHA256 hash of input parameters

        Args:
            parameters: Dictionary of input parameters

        Returns:
            SHA256 hash string (64 hex characters)
        """
        # Sort keys for consistent hashing (order-independent)
        param_json = json.dumps(parameters, sort_keys=True)
        return hashlib.sha256(param_json.encode()).hexdigest()

    @staticmethod
    def deduplicate_by_input(executions: List[Dict]) -> List[Dict]:
        """
        Deduplicate executions by input parameters

        Keeps only the first occurrence of each unique parameter set.
        Since executions are DESC ordered by time, this keeps the most recent.

        Args:
            executions: List of execution records

        Returns:
            Deduplicated list (one per unique parameter set)
        """
        seen_hashes = set()
        unique_executions = []

        for execution in executions:
            params = execution.get("input_parameters", {})
            param_hash = ExecutionDeduplicator.hash_parameters(params)

            if param_hash not in seen_hashes:
                seen_hashes.add(param_hash)
                unique_executions.append(execution)

        return unique_executions
