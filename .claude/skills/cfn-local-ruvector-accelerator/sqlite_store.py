import sqlite3
import json
import threading
from typing import Optional, List, Dict, Any
from datetime import datetime
import queue
import contextlib


class SQLiteStore:
    def __init__(self, db_path: str, pool_size: int = 5):
        self.db_path = db_path
        self._pool_size = pool_size
        self._pool = queue.Queue(maxsize=pool_size)
        self._lock = threading.Lock()
        self._init_db()
        self._init_connection_pool()
        
    def _init_connection_pool(self):
        """Initialize connection pool"""
        for _ in range(self._pool_size):
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self._pool.put(conn)
    
    @contextlib.contextmanager
    def _get_connection(self):
        """Get connection from pool"""
        conn = self._pool.get()
        try:
            yield conn
        finally:
            self._pool.put(conn)
    
    def _init_db(self):
        """Initialize database schema"""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS patterns (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    file_type TEXT,
                    content TEXT,
                    metadata TEXT, -- JSON
                    success_rate REAL DEFAULT 0.0,
                    usage_count INTEGER DEFAULT 0,
                    success_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS pattern_similarities (
                    pattern1_id TEXT,
                    pattern2_id TEXT,
                    similarity REAL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (pattern1_id, pattern2_id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(file_type);
                CREATE INDEX IF NOT EXISTS idx_patterns_success_rate ON patterns(success_rate DESC);
                CREATE INDEX IF NOT EXISTS idx_patterns_usage ON patterns(usage_count DESC);
                CREATE INDEX IF NOT EXISTS idx_patterns_created ON patterns(created_at DESC);
            """)
            
    def store_pattern(self, pattern_id: str, file_path: str, file_type: str, 
                     content: str, metadata: dict) -> None:
        """Store or update pattern metadata"""
        metadata_json = json.dumps(metadata) if metadata else None
        
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO patterns 
                (id, file_path, file_type, content, metadata, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (pattern_id, file_path, file_type, content, metadata_json))
            conn.commit()
            
    def get_pattern(self, pattern_id: str) -> Optional[dict]:
        """Get pattern metadata by ID"""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM patterns WHERE id = ?
            """, (pattern_id,))
            row = cursor.fetchone()
            
            if row:
                result = dict(row)
                if result['metadata']:
                    result['metadata'] = json.loads(result['metadata'])
                return result
            return None
            
    def query_patterns(self, file_type: str = None, limit: int = 100, 
                      min_success_rate: float = None, 
                      order_by: str = 'created_at DESC') -> List[dict]:
        """Query patterns with filters"""
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
                if result['metadata']:
                    result['metadata'] = json.loads(result['metadata'])
                results.append(result)
            return results
            
    def update_usage(self, pattern_id: str, success: bool = None) -> None:
        """Update pattern usage statistics"""
        with self._get_connection() as conn:
            if success is not None:
                conn.execute("""
                    UPDATE patterns 
                    SET usage_count = usage_count + 1,
                        success_count = success_count + ?,
                        success_rate = CAST(success_count + ? AS REAL) / CAST(usage_count + 1 AS REAL),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (1 if success else 0, 1 if success else 0, pattern_id))
            else:
                conn.execute("""
                    UPDATE patterns 
                    SET usage_count = usage_count + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (pattern_id,))
            conn.commit()
            
    def store_similarity(self, pattern1_id: str, pattern2_id: str, similarity: float) -> None:
        """Store pattern similarity for caching"""
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO pattern_similarities 
                (pattern1_id, pattern2_id, similarity)
                VALUES (?, ?, ?)
            """, (pattern1_id, pattern2_id, similarity))
            conn.commit()
            
    def get_similar_patterns(self, pattern_id: str, threshold: float = 0.5, 
                           limit: int = 10) -> List[dict]:
        """Get similar patterns above threshold"""
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
                if result['metadata']:
                    result['metadata'] = json.loads(result['metadata'])
                results.append(result)
            return results
            
    def delete_pattern(self, pattern_id: str) -> None:
        """Delete pattern and its similarities"""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM patterns WHERE id = ?", (pattern_id,))
            conn.execute("DELETE FROM pattern_similarities WHERE pattern1_id = ? OR pattern2_id = ?", 
                        (pattern_id, pattern_id))
            conn.commit()
            
    def get_stats(self) -> dict:
        """Get database statistics"""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT 
                    COUNT(*) as total_patterns,
                    COUNT(DISTINCT file_type) as unique_types,
                    AVG(success_rate) as avg_success_rate,
                    SUM(usage_count) as total_usage
                FROM patterns
            """)
            stats = dict(cursor.fetchone())
            
            cursor = conn.execute("""
                SELECT file_type, COUNT(*) as count
                FROM patterns
                GROUP BY file_type
                ORDER BY count DESC
            """)
            stats['by_type'] = [dict(row) for row in cursor.fetchall()]
            return stats
            
    def cleanup_old_patterns(self, days: int = 30, min_usage: int = 5) -> int:
        """Clean up old patterns with low usage"""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                DELETE FROM patterns 
                WHERE created_at < datetime('now', '-{} days') 
                AND usage_count < ?
            """.format(days), (min_usage,))
            deleted_count = cursor.rowcount
            conn.commit()
            return deleted_count
            
    def close(self):
        """Close all connections in pool"""
        while not self._pool.empty():
            conn = self._pool.get()
            conn.close()