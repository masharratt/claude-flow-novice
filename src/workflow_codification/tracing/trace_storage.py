"""
Trace Storage
PostgreSQL persistence layer for execution traces
"""

import psycopg2
import psycopg2.extras
from typing import Optional, Dict, Any


class TraceStorage:
    """
    PostgreSQL storage for execution traces

    Handles trace finalization, duration calculation, and persistence
    to the execution_traces table with monthly partitioning.

    Usage:
        storage = TraceStorage(db_config)
        result = storage.finalize_trace(trace, "success")
        retrieved = storage.get_trace(trace_id)
        storage.close()
    """

    def __init__(self, db_config: Dict[str, Any]):
        """
        Initialize trace storage

        Args:
            db_config: PostgreSQL connection config
                      {'host': 'localhost', 'port': 5432, 'database': 'cfn_workflow', 'user': 'postgres'}
        """
        self.conn = psycopg2.connect(**db_config)

    def finalize_trace(self, trace: Dict[str, Any], final_status: str) -> Dict[str, Any]:
        """
        Finalize trace and store in PostgreSQL

        Calculates total duration from all steps, updates status,
        and persists to execution_traces table.

        Args:
            trace: Trace object from ExecutionTracer
            final_status: 'success', 'failed', or 'timeout'

        Returns:
            dict: Summary with trace_id, total_duration_ms, status

        Example:
            >>> result = storage.finalize_trace(trace, "success")
            >>> print(result)
            {'trace_id': 'a1b2c3d4...', 'total_duration_ms': 325, 'status': 'success'}
        """
        trace_id = trace["trace_id"]
        skill_name = trace["skill_name"]
        started_at = trace["started_at"]
        steps = trace["steps"]
        metadata = trace["metadata"]

        # Calculate total duration from all steps
        total_duration_ms = sum(step.get("duration_ms", 0) for step in steps)

        # Extract first error message (if any failures in steps)
        error_message = None
        for step in steps:
            if step["status"] == "failed" and "error_message" in step:
                error_message = step["error_message"]
                break

        # Insert into PostgreSQL
        with self.conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO execution_traces
                (trace_id, skill_name, started_at, completed_at, total_duration_ms,
                 status, steps, error_message, metadata)
                VALUES (%s, %s, %s, NOW(), %s, %s, %s, %s, %s)
            """, (
                trace_id,
                skill_name,
                started_at,
                total_duration_ms,
                final_status,
                psycopg2.extras.Json(steps),
                error_message,
                psycopg2.extras.Json(metadata)
            ))
            self.conn.commit()

        return {
            "trace_id": trace_id,
            "total_duration_ms": total_duration_ms,
            "status": final_status
        }

    def get_trace(self, trace_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve trace by ID

        Args:
            trace_id: UUID of trace to retrieve

        Returns:
            dict: Complete trace object or None if not found

        Example:
            >>> trace = storage.get_trace("a1b2c3d4...")
            >>> print(trace['skill_name'])
            'docker-build'
        """
        with self.conn.cursor() as cursor:
            cursor.execute("""
                SELECT trace_id, skill_name, started_at, completed_at,
                       total_duration_ms, status, steps, error_message, metadata
                FROM execution_traces
                WHERE trace_id = %s
            """, (trace_id,))

            row = cursor.fetchone()
            if not row:
                return None

            return {
                "trace_id": row[0],
                "skill_name": row[1],
                "started_at": row[2].isoformat(),
                "completed_at": row[3].isoformat() if row[3] else None,
                "total_duration_ms": row[4],
                "status": row[5],
                "steps": row[6],
                "error_message": row[7],
                "metadata": row[8]
            }

    def close(self):
        """
        Close database connection

        Should be called when done with storage operations.
        """
        self.conn.close()
