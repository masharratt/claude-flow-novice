"""
Trace Context Storage
Manages execution trace context for distributed tracing
"""

from typing import Optional
from .client import RedisClient


class TraceContext:
    """
    Execution trace context manager with Redis storage

    Correlates execution_id to trace_id for distributed tracing

    Key format: trace_context:{execution_id}
    Value: trace_id (UUID)
    TTL: 3600 seconds (1 hour)
    """

    def __init__(self):
        """Initialize trace context manager"""
        self.redis = RedisClient().get_client()
        self.ttl = 3600  # 1 hour
        self.key_prefix = "trace_context:"

    def _make_key(self, execution_id: str) -> str:
        """Generate Redis key for execution"""
        return f"{self.key_prefix}{execution_id}"

    def set_trace_id(self, execution_id: str, trace_id: str):
        """
        Associate execution_id with trace_id

        Args:
            execution_id: Unique execution identifier
            trace_id: Distributed trace identifier (usually UUID)
        """
        key = self._make_key(execution_id)
        self.redis.setex(key, self.ttl, trace_id)

    def get_trace_id(self, execution_id: str) -> Optional[str]:
        """
        Get trace_id for execution_id

        Args:
            execution_id: Unique execution identifier

        Returns:
            str: trace_id if found, None otherwise
        """
        key = self._make_key(execution_id)
        return self.redis.get(key)

    def delete_trace_id(self, execution_id: str):
        """
        Remove trace context for execution

        Args:
            execution_id: Unique execution identifier
        """
        key = self._make_key(execution_id)
        self.redis.delete(key)

    def get_ttl(self, execution_id: str) -> int:
        """
        Get remaining TTL for trace context

        Args:
            execution_id: Unique execution identifier

        Returns:
            int: Remaining TTL in seconds, -2 if key doesn't exist
        """
        key = self._make_key(execution_id)
        return self.redis.ttl(key)

    def get_all_executions(self) -> list[str]:
        """
        Get all execution IDs with trace context

        Returns:
            list: List of execution IDs
        """
        pattern = f"{self.key_prefix}*"
        keys = self.redis.keys(pattern)

        execution_ids = []
        for key in keys:
            if key.startswith(self.key_prefix):
                execution_id = key[len(self.key_prefix):]
                execution_ids.append(execution_id)

        return execution_ids

    def clear_all(self):
        """
        Clear all trace contexts
        Useful for testing and maintenance
        """
        pattern = f"{self.key_prefix}*"
        keys = self.redis.keys(pattern)

        if keys:
            self.redis.delete(*keys)
