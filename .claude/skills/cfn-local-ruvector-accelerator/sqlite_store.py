import sqlite3
import json
import threading
from typing import Optional, List, Dict, Any
from datetime import datetime
import queue
import contextlib
import logging
import os
from pathlib import Path

# Import security controls
from security import (
    SecurityError, PathValidator, DatabaseQuota,
    InputSanitizer, hash_file_content, validate_metadata
)

logger = logging.getLogger(__name__)

# Configuration limits
MAX_CONNECTION_POOL_SIZE = 10
MAX_QUERY_RESULTS = 10000
MAX_CONTENT_LENGTH = 1000000  # 1MB
MAX_METADATA_SIZE = 100000  # 100KB

class SQLiteStore:
    def __init__(self, db_path: str, pool_size: int = 5):
        # Validate pool size
        if not isinstance(pool_size, int) or pool_size < 1:
            pool_size = 5
        if pool_size > MAX_CONNECTION_POOL_SIZE:
            pool_size = MAX_CONNECTION_POOL_SIZE

        # Validate database path
        try:
            self.base_path = Path(db_path).parent
            validator = PathValidator(self.base_path)
            self.db_path = str(validator.validate_path(db_path))
        except SecurityError as e:
            logger.error(f"Database path validation failed: {e}")
            raise

        self._pool_size = pool_size
        self._pool = queue.Queue(maxsize=pool_size)
        self._lock = threading.Lock()
        self._db_quota = DatabaseQuota(self.db_path)

        self._init_db()
        self._init_connection_pool()

    def _init_connection_pool(self):
        """Initialize connection pool with security checks"""
        for _ in range(self._pool_size):
            try:
                conn = sqlite3.connect(
                    self.db_path,
                    check_same_thread=False,
                    timeout=30.0  # Add timeout to prevent hanging
                )

                # Set security pragmas
                conn.execute("PRAGMA foreign_keys = ON")
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA secure_delete = ON")
                conn.execute("PRAGMA temp_store = MEMORY")  # Keep temp data in memory

                conn.row_factory = sqlite3.Row
                self._pool.put(conn)
            except sqlite3.Error as e:
                logger.error(f"Failed to create database connection: {e}")
                raise SecurityError(f"Database connection failed: {e}")

    @contextlib.contextmanager
    def _get_connection(self):
        """Get connection from pool with timeout"""
        try:
            conn = self._pool.get(timeout=5.0)  # 5 second timeout
            yield conn
        finally:
            self._pool.put(conn, timeout=5.0)

    def _init_db(self):
        """Initialize database schema with security constraints"""
        try:
            # Check database size before operations
            self._db_quota.check_database_size()

            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

            with sqlite3.connect(self.db_path) as conn:
                # Set security pragmas first
                conn.execute("PRAGMA foreign_keys = ON")
                conn.execute("PRAGMA secure_delete = ON")

                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS patterns (
                        id TEXT PRIMARY KEY,
                        file_path TEXT NOT NULL,
                        file_type TEXT NOT NULL,
                        content TEXT NOT NULL,
                        metadata TEXT,
                        success_rate REAL DEFAULT 0.0 CHECK(success_rate >= 0 AND success_rate <= 1),
                        usage_count INTEGER DEFAULT 0 CHECK(usage_count >= 0),
                        success_count INTEGER DEFAULT 0 CHECK(success_count >= 0),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        content_hash TEXT,  -- Add content hash for integrity
                        CHECK(usage_count >= success_count),
                        CHECK(length(id) <= 255),
                        CHECK(length(file_path) <= 4096),
                        CHECK(length(file_type) <= 50)
                    );

                    CREATE TABLE IF NOT EXISTS pattern_similarities (
                        pattern1_id TEXT,
                        pattern2_id TEXT,
                        similarity REAL CHECK(similarity >= -1 AND similarity <= 1),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (pattern1_id, pattern2_id),
                        FOREIGN KEY (pattern1_id) REFERENCES patterns(id) ON DELETE CASCADE,
                        FOREIGN KEY (pattern2_id) REFERENCES patterns(id) ON DELETE CASCADE
                    );

                    -- Security indexes
                    CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(file_type);
                    CREATE INDEX IF NOT EXISTS idx_patterns_success_rate ON patterns(success_rate DESC);
                    CREATE INDEX IF NOT EXISTS idx_patterns_usage ON patterns(usage_count DESC);
                    CREATE INDEX IF NOT EXISTS idx_patterns_created ON patterns(created_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_patterns_hash ON patterns(content_hash);

                    -- Trigger to prevent too many entries
                    CREATE TRIGGER IF NOT EXISTS limit_patterns_count
                    BEFORE INSERT ON patterns
                    WHEN (SELECT COUNT(*) FROM patterns) >= 500000
                    BEGIN
                        SELECT RAISE(ABORT, 'Maximum pattern limit reached');
                    END;
                """)

                # Additional security: create audit table
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS security_audit (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        operation TEXT NOT NULL,
                        pattern_id TEXT,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        details TEXT,
                        FOREIGN KEY (pattern_id) REFERENCES patterns(id)
                    )
                """)

                conn.commit()

        except sqlite3.Error as e:
            logger.error(f"Failed to initialize database: {e}")
            raise SecurityError(f"Database initialization failed: {e}")

    def _audit_operation(self, operation: str, pattern_id: str = None, details: str = None):
        """Log security audit entry"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO security_audit (operation, pattern_id, details)
                    VALUES (?, ?, ?)
                """, (operation, pattern_id, details))
                conn.commit()
        except sqlite3.Error as e:
            logger.warning(f"Failed to log audit entry: {e}")

    def store_pattern(self, pattern_id: str, file_path: str, file_type: str,
                     content: str, metadata: dict) -> None:
        """Store or update pattern metadata with security validation"""
        try:
            # Validate all inputs
            InputSanitizer.sanitize_pattern_id(pattern_id)
            InputSanitizer.sanitize_file_type(file_type)

            # Validate content
            if not isinstance(content, str):
                raise SecurityError("Content must be a string")

            if len(content) > MAX_CONTENT_LENGTH:
                logger.warning(f"Content too large, truncating: {len(content)} bytes")
                content = content[:MAX_CONTENT_LENGTH]

            # Validate and sanitize metadata
            if metadata is None:
                metadata = {}

            metadata_str = json.dumps(validate_metadata(metadata))
            if len(metadata_str) > MAX_METADATA_SIZE:
                logger.warning("Metadata too large, removing large fields")
                # Keep only essential metadata
                essential_metadata = {
                    'file_size': metadata.get('file_size', 0),
                    'line_count': metadata.get('line_count', 0)
                }
                metadata_str = json.dumps(essential_metadata)

            # Sanitize file path
            file_path = str(file_path).replace('\0', '').replace('\r', '').replace('\n', '')
            if len(file_path) > 4096:
                file_path = file_path[-4096:]  # Keep last 4096 chars

            # Calculate content hash
            content_hash = hash_file_content(content)

            with self._get_connection() as conn:
                # Check if pattern already exists
                cursor = conn.execute("SELECT id FROM patterns WHERE id = ?", (pattern_id,))
                exists = cursor.fetchone() is not None

                conn.execute("""
                    INSERT OR REPLACE INTO patterns
                    (id, file_path, file_type, content, metadata, content_hash, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (pattern_id, file_path, file_type, content, metadata_str, content_hash))

                conn.commit()

                # Log audit
                operation = "update_pattern" if exists else "create_pattern"
                self._audit_operation(operation, pattern_id, f"file_type={file_type}")

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to store pattern: {e}")
            self._audit_operation("store_pattern_error", pattern_id, str(e))
            raise

    def get_pattern(self, pattern_id: str) -> Optional[dict]:
        """Get pattern metadata by ID with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT * FROM patterns WHERE id = ?
                """, (pattern_id,))
                row = cursor.fetchone()

                if row:
                    result = dict(row)

                    # Parse metadata safely
                    if result['metadata']:
                        try:
                            result['metadata'] = json.loads(result['metadata'])
                        except json.JSONDecodeError:
                            result['metadata'] = {}
                    else:
                        result['metadata'] = {}

                    # Log access
                    self._audit_operation("access_pattern", pattern_id)

                    return result
                return None

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to get pattern: {e}")
            return None

    def query_patterns(self, file_type: str = None, limit: int = 100,
                      min_success_rate: float = None,
                      order_by: str = 'created_at DESC') -> List[dict]:
        """Query patterns with filters and security validation"""
        try:
            # Validate inputs
            if file_type is not None:
                InputSanitizer.sanitize_file_type(file_type)

            if not isinstance(limit, int) or limit < 0:
                limit = 100
            if limit > MAX_QUERY_RESULTS:
                limit = MAX_QUERY_RESULTS

            if min_success_rate is not None:
                if not isinstance(min_success_rate, (int, float)):
                    min_success_rate = 0.0
                else:
                    min_success_rate = max(0.0, min(1.0, float(min_success_rate)))

            # Validate order_by to prevent SQL injection
            allowed_orders = [
                'created_at DESC', 'created_at ASC',
                'updated_at DESC', 'updated_at ASC',
                'success_rate DESC', 'success_rate ASC',
                'usage_count DESC', 'usage_count ASC',
                'file_type', 'id'
            ]
            if order_by not in allowed_orders:
                order_by = 'created_at DESC'

            query = "SELECT * FROM patterns WHERE 1=1"
            params = []

            if file_type:
                query += " AND file_type = ?"
                params.append(file_type)

            if min_success_rate is not None:
                query += " AND success_rate >= ?"
                params.append(min_success_rate)

            query += f" ORDER BY {order_by} LIMIT ?"
            params.append(limit)

            with self._get_connection() as conn:
                cursor = conn.execute(query, params)
                results = []

                for row in cursor.fetchall():
                    result = dict(row)

                    # Parse metadata safely
                    if result['metadata']:
                        try:
                            result['metadata'] = json.loads(result['metadata'])
                        except json.JSONDecodeError:
                            result['metadata'] = {}
                    else:
                        result['metadata'] = {}

                    results.append(result)

                # Limit content size in results
                for result in results:
                    if 'content' in result and result['content']:
                        result['content'] = result['content'][:1000]

                # Log query
                self._audit_operation("query_patterns", None,
                                    f"file_type={file_type}, limit={limit}")

                return results

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to query patterns: {e}")
            return []

    def update_usage(self, pattern_id: str, success: bool = None) -> None:
        """Update pattern usage statistics with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            with self._get_connection() as conn:
                if success is not None:
                    # Validate success value
                    success_val = 1 if success else 0

                    conn.execute("""
                        UPDATE patterns
                        SET usage_count = usage_count + 1,
                            success_count = success_count + ?,
                            success_rate = CAST(success_count + ? AS REAL) / CAST(usage_count + 1 AS REAL),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (success_val, success_val, pattern_id))
                else:
                    conn.execute("""
                        UPDATE patterns
                        SET usage_count = usage_count + 1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (pattern_id,))

                conn.commit()

                # Log update
                self._audit_operation("update_usage", pattern_id,
                                    f"success={success}")

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to update usage: {e}")

    def store_similarity(self, pattern1_id: str, pattern2_id: str, similarity: float) -> None:
        """Store pattern similarity with validation"""
        try:
            # Validate inputs
            InputSanitizer.sanitize_pattern_id(pattern1_id)
            InputSanitizer.sanitize_pattern_id(pattern2_id)

            if not isinstance(similarity, (int, float)):
                raise SecurityError("Similarity must be a number")

            # Clamp similarity to valid range
            similarity = max(-1.0, min(1.0, float(similarity)))

            with self._get_connection() as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO pattern_similarities
                    (pattern1_id, pattern2_id, similarity)
                    VALUES (?, ?, ?)
                """, (pattern1_id, pattern2_id, similarity))
                conn.commit()

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to store similarity: {e}")

    def get_similar_patterns(self, pattern_id: str, threshold: float = 0.5,
                           limit: int = 10) -> List[dict]:
        """Get similar patterns above threshold"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            if not isinstance(threshold, (int, float)):
                threshold = 0.5
            threshold = max(-1.0, min(1.0, float(threshold)))

            if not isinstance(limit, int) or limit < 0:
                limit = 10
            limit = min(limit, 1000)  # Hard limit

            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT p.*, ps.similarity
                    FROM patterns p
                    JOIN pattern_similarities ps ON p.id = ps.pattern2_id
                    WHERE ps.pattern1_id = ? AND ps.similarity >= ?
                    ORDER BY ps.similarity DESC
                    LIMIT ?
                """, (pattern_id, threshold, limit))

                results = []
                for row in cursor.fetchall():
                    result = dict(row)

                    # Parse metadata safely
                    if result['metadata']:
                        try:
                            result['metadata'] = json.loads(result['metadata'])
                        except json.JSONDecodeError:
                            result['metadata'] = {}
                    else:
                        result['metadata'] = {}

                    results.append(result)

                return results

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to get similar patterns: {e}")
            return []

    def delete_pattern(self, pattern_id: str) -> None:
        """Delete pattern and its similarities with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            with self._get_connection() as conn:
                # Check if pattern exists
                cursor = conn.execute("SELECT id FROM patterns WHERE id = ?", (pattern_id,))
                if cursor.fetchone() is None:
                    logger.warning(f"Pattern not found for deletion: {pattern_id}")
                    return

                conn.execute("DELETE FROM patterns WHERE id = ?", (pattern_id,))
                conn.execute("DELETE FROM pattern_similarities WHERE pattern1_id = ? OR pattern2_id = ?",
                           (pattern_id, pattern_id))
                conn.commit()

                # Log deletion
                self._audit_operation("delete_pattern", pattern_id)

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to delete pattern: {e}")

    def get_stats(self) -> dict:
        """Get database statistics"""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT
                        COUNT(*) as total_patterns,
                        COUNT(DISTINCT file_type) as unique_types,
                        COALESCE(AVG(success_rate), 0) as avg_success_rate,
                        COALESCE(SUM(usage_count), 0) as total_usage
                    FROM patterns
                """)
                stats = dict(cursor.fetchone())

                cursor = conn.execute("""
                    SELECT file_type, COUNT(*) as count
                    FROM patterns
                    GROUP BY file_type
                    ORDER BY count DESC
                    LIMIT 20
                """)
                stats['by_type'] = [dict(row) for row in cursor.fetchall()]

                # Add database size info
                stats['database_size_bytes'] = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
                stats['connection_pool_size'] = self._pool_size
                stats['available_connections'] = self._pool.qsize()

                return stats

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to get stats: {e}")
            return {
                'total_patterns': 0,
                'unique_types': 0,
                'avg_success_rate': 0,
                'total_usage': 0,
                'by_type': [],
                'database_size_bytes': 0,
                'connection_pool_size': self._pool_size,
                'available_connections': 0
            }

    def cleanup_old_patterns(self, days: int = 30, min_usage: int = 5) -> int:
        """Clean up old patterns with low usage"""
        try:
            if not isinstance(days, int) or days < 1:
                days = 30
            if days > 365:
                days = 365  # Max 1 year

            if not isinstance(min_usage, int) or min_usage < 0:
                min_usage = 5

            with self._get_connection() as conn:
                cursor = conn.execute("""
                    DELETE FROM patterns
                    WHERE created_at < datetime('now', '-{} days')
                    AND usage_count < ?
                """.format(days), (min_usage,))
                deleted_count = cursor.rowcount
                conn.commit()

                # Log cleanup
                self._audit_operation("cleanup_patterns", None,
                                    f"deleted={deleted_count}, days={days}")

                # Also cleanup orphaned similarities
                cursor = conn.execute("""
                    DELETE FROM pattern_similarities
                    WHERE pattern1_id NOT IN (SELECT id FROM patterns)
                       OR pattern2_id NOT IN (SELECT id FROM patterns)
                """)
                similarities_deleted = cursor.rowcount
                conn.commit()

                if deleted_count > 0 or similarities_deleted > 0:
                    logger.info(f"Cleanup: deleted {deleted_count} patterns and {similarities_deleted} similarities")

                return deleted_count

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to cleanup old patterns: {e}")
            return 0

    def close(self):
        """Close all connections in pool"""
        while not self._pool.empty():
            try:
                conn = self._pool.get_nowait()
                conn.close()
            except (queue.Empty, sqlite3.Error):
                pass
        logger.info(f"Closed {self._pool_size} database connections")