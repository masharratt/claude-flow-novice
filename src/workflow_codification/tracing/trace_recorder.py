"""
Trace Recorder
Records individual steps within an execution trace
"""

import time
from datetime import datetime
from typing import Optional, Dict, Any


class TraceRecorder:
    """
    Step recorder for execution traces

    Records individual operations/steps with timing, status, and error context.
    Steps are appended to the trace's JSONB steps array.

    Usage:
        recorder = TraceRecorder(tracer)
        recorder.start_step("validate-input")
        # ... perform validation ...
        recorder.end_step("validate-input", status="success")
    """

    def __init__(self, tracer):
        """
        Initialize trace recorder

        Args:
            tracer: ExecutionTracer instance
        """
        self.tracer = tracer
        self.step_start_times: Dict[str, float] = {}

    def start_step(self, step_name: str):
        """
        Mark start of a step

        Args:
            step_name: Name of the step being started

        Example:
            >>> recorder.start_step("load-config")
        """
        self.step_start_times[step_name] = time.time()

    def end_step(
        self,
        step_name: str,
        status: str = "success",
        error_message: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Complete a step and record it

        Args:
            step_name: Name of step to complete
            status: 'success' or 'failed' (default: 'success')
            error_message: Optional error details (included if status='failed')

        Returns:
            dict: Recorded step object

        Raises:
            ValueError: If step was not started

        Example:
            >>> recorder.end_step("load-config", status="success")
            {'name': 'load-config', 'timestamp': '2025-11-16T12:00:00.123456',
             'duration_ms': 150, 'status': 'success'}
        """
        if step_name not in self.step_start_times:
            raise ValueError(f"Step '{step_name}' was not started")

        # Calculate duration
        start_time = self.step_start_times[step_name]
        duration_ms = int((time.time() - start_time) * 1000)

        # Build step object
        step = {
            "name": step_name,
            "timestamp": datetime.utcnow().isoformat(),
            "duration_ms": duration_ms,
            "status": status
        }

        # Add error message if provided
        if error_message:
            step["error_message"] = error_message

        # Append to current trace
        trace = self.tracer.get_current_trace()
        if trace:
            trace["steps"].append(step)

        # Clean up start time
        del self.step_start_times[step_name]

        return step

    def record_step(
        self,
        step_name: str,
        duration_ms: int,
        status: str = "success",
        error_message: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record a step without start/end timing (manual duration)

        Useful when duration is already calculated or when recording
        steps retroactively.

        Args:
            step_name: Name of step
            duration_ms: Duration in milliseconds
            status: 'success' or 'failed' (default: 'success')
            error_message: Optional error details

        Returns:
            dict: Recorded step object

        Example:
            >>> recorder.record_step("validate-input", 75, status="success")
            {'name': 'validate-input', 'timestamp': '2025-11-16T12:00:00.123456',
             'duration_ms': 75, 'status': 'success'}
        """
        # Build step object
        step = {
            "name": step_name,
            "timestamp": datetime.utcnow().isoformat(),
            "duration_ms": duration_ms,
            "status": status
        }

        # Add error message if provided
        if error_message:
            step["error_message"] = error_message

        # Append to current trace
        trace = self.tracer.get_current_trace()
        if trace:
            trace["steps"].append(step)

        return step
