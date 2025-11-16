"""
Trace Query API
Search and analysis functions for execution traces
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from .trace_storage import TraceStorage


class TraceQuery:
    """
    Trace query and analysis API

    Provides search capabilities for execution traces including:
    - Query by skill and time range
    - Pagination support
    - Similar failure detection (Jaccard similarity)

    Usage:
        query = TraceQuery(db_config)
        results = query.query_by_skill("docker-build", limit=10)
        similar = query.find_similar_failures("connection timeout", limit=5)
    """

    def __init__(self, db_config: Dict[str, Any]):
        """
        Initialize trace query API

        Args:
            db_config: PostgreSQL connection config
        """
        self.storage = TraceStorage(db_config)

    def query_by_skill(
        self,
        skill_name: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Query traces for a skill within time range

        Args:
            skill_name: Skill to filter by
            start_date: Start of time range (default: 30 days ago)
            end_date: End of time range (default: now)
            limit: Max results (default: 100)

        Returns:
            list: List of trace summaries (sorted by started_at DESC)

        Example:
            >>> results = query.query_by_skill("docker-build", limit=10)
            >>> print(len(results))
            10
            >>> print(results[0]['skill_name'])
            'docker-build'
        """
        # Default time range: last 30 days
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        with self.storage.conn.cursor() as cursor:
            cursor.execute("""
                SELECT trace_id, skill_name, started_at, completed_at,
                       total_duration_ms, status
                FROM execution_traces
                WHERE skill_name = %s
                AND started_at >= %s
                AND started_at <= %s
                ORDER BY started_at DESC
                LIMIT %s
            """, (skill_name, start_date, end_date, limit))

            results = []
            for row in cursor.fetchall():
                results.append({
                    "trace_id": row[0],
                    "skill_name": row[1],
                    "started_at": row[2].isoformat(),
                    "completed_at": row[3].isoformat() if row[3] else None,
                    "total_duration_ms": row[4],
                    "status": row[5]
                })

            return results

    def find_similar_failures(
        self,
        error_pattern: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Find traces with similar error messages (Jaccard similarity)

        Uses Jaccard similarity on tokenized error messages to find
        similar failures. Threshold: 30% similarity.

        Args:
            error_pattern: Error message to match
            limit: Max results (default: 10)

        Returns:
            list: List of similar failed traces (sorted by similarity DESC)

        Example:
            >>> results = query.find_similar_failures("timeout database connection")
            >>> print(results[0]['similarity_score'])
            0.85
        """
        # Tokenize error pattern
        keywords = set(error_pattern.lower().split())

        # Query all failed traces
        with self.storage.conn.cursor() as cursor:
            cursor.execute("""
                SELECT trace_id, skill_name, error_message, started_at
                FROM execution_traces
                WHERE status = 'failed'
                AND error_message IS NOT NULL
                ORDER BY started_at DESC
                LIMIT 100
            """)

            results = []
            for row in cursor.fetchall():
                trace_id, skill_name, error_message, started_at = row

                # Tokenize error message
                error_keywords = set(error_message.lower().split())

                # Calculate Jaccard similarity
                # Jaccard = |intersection| / |union|
                intersection = keywords & error_keywords
                union = keywords | error_keywords
                similarity = len(intersection) / len(union) if union else 0

                # Filter by similarity threshold (30%)
                if similarity > 0.3:
                    results.append({
                        "trace_id": trace_id,
                        "skill_name": skill_name,
                        "error_message": error_message,
                        "started_at": started_at.isoformat(),
                        "similarity_score": round(similarity, 2)
                    })

            # Sort by similarity (highest first) and return top N
            results.sort(key=lambda x: x["similarity_score"], reverse=True)
            return results[:limit]
