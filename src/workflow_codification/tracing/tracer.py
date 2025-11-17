"""
Execution Tracer
Main tracing interface for creating and managing execution traces
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from workflow_codification.redis.trace_context import TraceContext


class ExecutionTracer:
    """
    Execution trace manager

    Creates and manages distributed execution traces with UUID generation,
    metadata storage, and Redis-based correlation.

    Usage:
        tracer = ExecutionTracer()
        trace_id = tracer.start_trace("skill-name", execution_id="exec-001")
        # ... perform work ...
        trace = tracer.get_current_trace()
    """

    def __init__(self):
        """Initialize execution tracer"""
        self.trace_context = TraceContext()
        self.current_trace = None

    def start_trace(
        self,
        skill_name: str,
        execution_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Start a new execution trace

        Args:
            skill_name: Name of skill being executed
            execution_id: Optional execution ID (for correlation with existing execution)
            metadata: Optional additional metadata (dict)

        Returns:
            str: UUID trace_id for this trace

        Example:
            >>> tracer = ExecutionTracer()
            >>> trace_id = tracer.start_trace("docker-build", execution_id="exec-123",
            ...                               metadata={"user": "alice"})
            >>> print(trace_id)
            'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6'
        """
        # Generate UUID for trace
        trace_id = str(uuid.uuid4())

        # Initialize trace object
        self.current_trace = {
            "trace_id": trace_id,
            "skill_name": skill_name,
            "started_at": datetime.utcnow().isoformat(),
            "status": "running",
            "steps": [],
            "metadata": metadata or {}
        }

        # Store in Redis for correlation (if execution_id provided)
        if execution_id:
            self.trace_context.set_trace_id(execution_id, trace_id)

        return trace_id

    def get_trace_id(self, execution_id: Optional[str] = None) -> Optional[str]:
        """
        Get trace_id for current execution or by execution_id

        Args:
            execution_id: Optional execution ID to look up

        Returns:
            str: trace_id if found, None otherwise

        Example:
            >>> tracer.get_trace_id(execution_id="exec-123")
            'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6'
        """
        # Look up by execution_id
        if execution_id:
            return self.trace_context.get_trace_id(execution_id)

        # Return current trace_id
        if self.current_trace:
            return self.current_trace["trace_id"]

        return None

    def get_current_trace(self) -> Optional[Dict[str, Any]]:
        """
        Get current trace object

        Returns:
            dict: Current trace object or None if no trace active

        Example:
            >>> trace = tracer.get_current_trace()
            >>> print(trace['status'])
            'running'
        """
        return self.current_trace

    def clear_current_trace(self):
        """
        Clear current trace (useful for starting new trace)
        """
        self.current_trace = None
