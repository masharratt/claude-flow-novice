"""
Execution History Retrieval

Queries PostgreSQL execution_traces table for successful skill executions.
Adapts execution_traces schema to match expected skill_executions format.
"""

import psycopg2
import json
from datetime import datetime, timedelta
from typing import List, Dict


class ExecutionHistory:
    """Query and retrieve execution history from PostgreSQL"""

    def __init__(self, db_config):
        """
        Initialize with database configuration

        Args:
            db_config: Dictionary with host, port, database, user, password
        """
        self.conn = psycopg2.connect(**db_config)

    def fetch_successful_executions(
        self,
        skill_name: str,
        lookback_days: int = 90
    ) -> List[Dict]:
        """
        Fetch successful skill executions from history

        Schema Adaptation:
            - execution_traces.trace_id → execution_id
            - execution_traces.skill_name → skill_id
            - execution_traces.total_duration_ms / 1000 → execution_duration_seconds
            - execution_traces.metadata->>'team' → team_invoked_by
            - execution_traces.metadata->'input_parameters' → input_parameters
            - execution_traces.steps[last]->>'output' → stdout

        Args:
            skill_name: Name of skill to query
            lookback_days: Number of days to look back (default: 90)

        Returns:
            List of execution records with parameters and outputs
        """
        cutoff_date = datetime.utcnow() - timedelta(days=lookback_days)

        with self.conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    trace_id,
                    metadata->'input_parameters',
                    (steps->-1)->>'output',
                    total_duration_ms / 1000.0,
                    metadata->>'team',
                    started_at
                FROM execution_traces
                WHERE skill_name = %s
                AND status = 'success'
                AND started_at > %s
                ORDER BY started_at DESC
            """, (skill_name, cutoff_date))

            results = []
            for row in cursor.fetchall():
                # Parse JSON if needed
                input_params = row[1] if isinstance(row[1], dict) else json.loads(row[1] or '{}')
                stdout = row[2] or ''
                duration = row[3] or 0.0
                team = row[4] or 'unknown'
                started_at = row[5]

                # Handle both datetime objects and ISO strings
                if started_at:
                    if isinstance(started_at, str):
                        started_at_str = started_at
                    else:
                        started_at_str = started_at.isoformat()
                else:
                    started_at_str = None

                results.append({
                    "execution_id": row[0],
                    "input_parameters": input_params,
                    "stdout": stdout,
                    "execution_duration_seconds": duration,
                    "team_invoked_by": team,
                    "execution_started_at": started_at_str
                })

            return results

    def close(self):
        """Close database connection"""
        self.conn.close()
