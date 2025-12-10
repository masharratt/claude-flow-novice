import sqlite3
import os
import json
import numpy as np
from typing import List, Dict, Optional, Tuple, Any
from sklearn.metrics.pairwise import cosine_similarity
import pickle
from datetime import datetime
import logging

# Import security controls
from security import (
    SecurityError, PathValidator, ResourceMonitor, DatabaseQuota,
    InputSanitizer, security_context, safe_file_read,
    hash_file_content, validate_metadata
)

logger = logging.getLogger(__name__)

class EmbeddingsManager:
    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        self.embeddings_file = os.path.join(storage_path, "embeddings.pkl")
        self.embeddings = {}
        self._load_embeddings()
        self.resource_monitor = ResourceMonitor()

    def _load_embeddings(self):
        """Load embeddings with security checks"""
        try:
            # Validate storage path
            validator = PathValidator(os.path.dirname(self.storage_path))
            self.storage_path = str(validator.validate_path(self.storage_path))

            if os.path.exists(self.embeddings_file):
                # Check file size
                file_path = Path(self.embeddings_file)
                self.resource_monitor.check_file_size(file_path)

                with open(self.embeddings_file, 'rb') as f:
                    # Load with size limit
                    data = f.read(50 * 1024 * 1024)  # 50MB limit
                    self.embeddings = pickle.loads(data)

                    # Validate embeddings
                    for pattern_id, embedding in self.embeddings.items():
                        InputSanitizer.sanitize_pattern_id(pattern_id)
                        self.resource_monitor.check_embedding_dimension(len(embedding))

                        # Check for NaN/Inf values
                        if not np.all(np.isfinite(embedding)):
                            logger.warning(f"Invalid embedding values for pattern {pattern_id}")
                            del self.embeddings[pattern_id]

                logger.info(f"Loaded {len(self.embeddings)} embeddings")
        except (SecurityError, Exception) as e:
            logger.error(f"Failed to load embeddings: {e}")
            self.embeddings = {}

    def save_embeddings(self):
        """Save embeddings with security checks"""
        try:
            # Validate storage path
            validator = PathValidator(os.path.dirname(self.storage_path))
            self.storage_path = str(validator.validate_path(self.storage_path))

            os.makedirs(self.storage_path, exist_ok=True)

            # Limit number of embeddings saved
            if len(self.embeddings) > 10000:
                logger.warning(f"Too many embeddings ({len(self.embeddings)}), saving only first 10000")
                items = list(self.embeddings.items())[:10000]
                self.embeddings = dict(items)

            # Serialize with size check
            data = pickle.dumps(self.embeddings)
            if len(data) > 100 * 1024 * 1024:  # 100MB limit
                logger.error("Embeddings data too large, refusing to save")
                return False

            with open(self.embeddings_file, 'wb') as f:
                f.write(data)

            logger.info(f"Saved {len(self.embeddings)} embeddings")
            return True
        except (SecurityError, Exception) as e:
            logger.error(f"Failed to save embeddings: {e}")
            return False

    def add_embedding(self, embedding: np.ndarray, pattern_id: str):
        """Add embedding with validation"""
        try:
            # Validate inputs
            InputSanitizer.sanitize_pattern_id(pattern_id)
            self.resource_monitor.check_embedding_dimension(len(embedding))

            # Validate embedding values
            if not isinstance(embedding, np.ndarray) or not np.all(np.isfinite(embedding)):
                raise SecurityError("Invalid embedding data")

            self.embeddings[pattern_id] = embedding
            self.resource_monitor.record_file_processed(embedding.nbytes)

        except SecurityError as e:
            logger.error(f"Failed to add embedding: {e}")
            raise

    def get_embedding(self, pattern_id: str) -> Optional[np.ndarray]:
        """Get embedding with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)
            embedding = self.embeddings.get(pattern_id)

            if embedding is not None:
                # Return a copy to prevent modification
                return embedding.copy()
            return None
        except SecurityError:
            return None

    def remove_embedding(self, pattern_id: str):
        """Remove embedding with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)
            if pattern_id in self.embeddings:
                del self.embeddings[pattern_id]
        except SecurityError as e:
            logger.error(f"Failed to remove embedding: {e}")

class SQLiteStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.db_quota = DatabaseQuota(db_path)
        self._init_db()

    def _init_db(self):
        """Initialize database with security checks"""
        try:
            # Validate database path
            db_dir = os.path.dirname(self.db_path)
            if db_dir:
                validator = PathValidator(db_dir)
                db_path = validator.validate_path(self.db_path)

            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

            # Check database size before operations
            self.db_quota.check_database_size()

            with sqlite3.connect(self.db_path) as conn:
                # Set security pragma
                conn.execute("PRAGMA foreign_keys = ON")
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA secure_delete = ON")

                # Create tables with constraints
                conn.execute('''
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
                        CHECK(usage_count >= success_count)
                    )
                ''')

                # Create indexes for performance
                conn.execute("CREATE INDEX IF NOT EXISTS idx_patterns_file_type ON patterns(file_type)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_patterns_success_rate ON patterns(success_rate)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_patterns_created_at ON patterns(created_at)")

                conn.commit()

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    def store_pattern(self, pattern_id: str, file_path: str, file_type: str,
                     content: str, metadata: dict = None):
        """Store pattern with security validation"""
        try:
            # Validate all inputs
            InputSanitizer.sanitize_pattern_id(pattern_id)
            InputSanitizer.sanitize_file_type(file_type)

            # Validate content
            if not isinstance(content, str):
                raise SecurityError("Content must be a string")
            if len(content) > 1000000:  # 1MB limit per content
                raise SecurityError(f"Content too large: {len(content)} bytes")

            # Validate and sanitize metadata
            if metadata is None:
                metadata = {}
            metadata = validate_metadata(metadata)

            # Sanitize file path (remove base path for storage)
            file_path = file_path.replace('\0', '').replace('\r', '').replace('\n', '')

            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    INSERT OR REPLACE INTO patterns
                    (id, file_path, file_type, content, metadata, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (pattern_id, file_path, file_type, content,
                      json.dumps(metadata) if metadata else None,
                      datetime.now()))
                conn.commit()

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to store pattern: {e}")
            raise

    def query_patterns(self, file_type: str = None, limit: int = 100,
                      min_success_rate: float = 0.0) -> List[Dict]:
        """Query patterns with security validation"""
        try:
            # Validate inputs
            if file_type is not None:
                InputSanitizer.sanitize_file_type(file_type)

            if not isinstance(limit, int) or limit < 0 or limit > 1000:
                limit = 100

            if not isinstance(min_success_rate, (int, float)):
                min_success_rate = 0.0
            min_success_rate = max(0.0, min(1.0, float(min_success_rate)))

            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                query = '''
                    SELECT * FROM patterns
                    WHERE success_rate >= ?
                '''
                params = [min_success_rate]

                if file_type:
                    query += ' AND file_type = ?'
                    params.append(file_type)

                query += ' ORDER BY usage_count DESC, success_rate DESC LIMIT ?'
                params.append(limit)

                cursor = conn.execute(query, params)
                results = []

                for row in cursor.fetchall():
                    result = dict(row)
                    # Sanitize results
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
            logger.error(f"Failed to query patterns: {e}")
            return []

    def update_usage(self, pattern_id: str, success: bool = None):
        """Update pattern usage with validation"""
        try:
            # Validate pattern ID
            InputSanitizer.sanitize_pattern_id(pattern_id)

            with sqlite3.connect(self.db_path) as conn:
                if success is not None:
                    conn.execute('''
                        UPDATE patterns
                        SET usage_count = usage_count + 1,
                            success_count = success_count + ?,
                            success_rate = CAST(success_count + ? AS REAL) / CAST(usage_count + 1 AS REAL),
                            updated_at = ?
                        WHERE id = ?
                    ''', (1 if success else 0, 1 if success else 0, datetime.now(), pattern_id))
                else:
                    conn.execute('''
                        UPDATE patterns
                        SET usage_count = usage_count + 1,
                            updated_at = ?
                        WHERE id = ?
                    ''', (datetime.now(), pattern_id))
                conn.commit()

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Failed to update usage: {e}")

    def get_pattern(self, pattern_id: str) -> Optional[Dict]:
        """Get pattern with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute('SELECT * FROM patterns WHERE id = ?', (pattern_id,))
                row = cursor.fetchone()

                if row:
                    result = dict(row)
                    if result['metadata']:
                        try:
                            result['metadata'] = json.loads(result['metadata'])
                        except json.JSONDecodeError:
                            result['metadata'] = {}
                    else:
                        result['metadata'] = {}
                    return result

                return None

        except (SecurityError, sqlite3.Error):
            return None

class SearchEngine:
    def __init__(self, storage_path: str):
        # Validate storage path
        self.base_path = Path(storage_path).parent
        self.storage_path = storage_path

        self.embeddings = EmbeddingsManager(storage_path)
        self.db = SQLiteStore(f"{storage_path}/cache.db")
        self._embedding_cache = {}
        self.resource_monitor = ResourceMonitor()

    def search(self, query_pattern: str, file_type: str = None,
               limit: int = 10, min_similarity: float = 0.7) -> List[Dict]:
        """Search patterns with security validation"""
        try:
            # Validate inputs
            query_pattern = InputSanitizer.sanitize_query(query_pattern)
            if file_type is not None:
                InputSanitizer.sanitize_file_type(file_type)

            if not isinstance(limit, int) or limit < 0 or limit > 100:
                limit = 10

            if not isinstance(min_similarity, (int, float)):
                min_similarity = 0.7
            min_similarity = max(0.0, min(1.0, float(min_similarity)))

            # Get query embedding
            query_embedding = self.get_embedding(query_pattern)

            # Query candidates
            candidates = self.db.query_patterns(
                file_type=file_type,
                limit=min(limit * 2, 100),
                min_success_rate=0.5
            )

            if not candidates:
                return []

            # Process in batches to avoid memory issues
            results = []
            batch_size = 50

            for i in range(0, len(candidates), batch_size):
                batch = candidates[i:i + batch_size]

                pattern_embeddings = []
                valid_candidates = []

                for pattern in batch:
                    embedding = self.embeddings.get_embedding(pattern['id'])
                    if embedding is not None:
                        pattern_embeddings.append(embedding)
                        valid_candidates.append(pattern)

                if pattern_embeddings:
                    similarities = self._calculate_similarity(
                        query_embedding,
                        np.array(pattern_embeddings)
                    )

                    for j, pattern in enumerate(valid_candidates):
                        similarity = float(similarities[j])

                        if similarity >= min_similarity:
                            composite_score = self._calculate_composite_score(
                                similarity,
                                pattern.get('success_rate', 0.0),
                                pattern.get('usage_count', 0)
                            )

                            results.append({
                                'id': pattern['id'],
                                'file_path': pattern['file_path'],
                                'file_type': pattern['file_type'],
                                'content': pattern['content'][:1000],  # Limit content size
                                'metadata': pattern.get('metadata', {}),
                                'similarity': similarity,
                                'composite_score': composite_score,
                                'success_rate': pattern.get('success_rate', 0.0),
                                'usage_count': pattern.get('usage_count', 0)
                            })

            # Sort and limit results
            results.sort(key=lambda x: x['composite_score'], reverse=True)
            return results[:limit]

        except SecurityError as e:
            logger.error(f"Search security error: {e}")
            return []
        except Exception as e:
            logger.error(f"Search error: {e}")
            return []

    def get_embedding(self, text: str) -> np.ndarray:
        """Get embedding with caching and validation"""
        try:
            text = InputSanitizer.sanitize_query(text)

            # Check cache
            if text in self._embedding_cache:
                return self._embedding_cache[text]

            # Generate embedding (placeholder - in real implementation would call API)
            embedding = np.random.rand(1536).astype(np.float32)

            # Validate embedding
            if not np.all(np.isfinite(embedding)):
                raise SecurityError("Generated embedding contains invalid values")

            # Cache with size limit
            if len(self._embedding_cache) < 1000:
                self._embedding_cache[text] = embedding

            return embedding

        except SecurityError as e:
            logger.error(f"Embedding security error: {e}")
            # Return safe default
            return np.zeros(1536, dtype=np.float32)

    def _calculate_similarity(self, query_embedding: np.ndarray,
                             pattern_embeddings: np.ndarray) -> np.ndarray:
        """Calculate similarity with error handling"""
        try:
            # Validate inputs
            self.resource_monitor.check_embedding_dimension(len(query_embedding))
            self.resource_monitor.check_batch_size(len(pattern_embeddings))

            # Normalize vectors
            query_norm = query_embedding / np.linalg.norm(query_embedding)
            pattern_norms = pattern_embeddings / np.linalg.norm(
                pattern_embeddings, axis=1, keepdims=True
            )

            # Calculate cosine similarity
            similarities = np.dot(pattern_norms, query_norm)

            # Clip to valid range
            return np.clip(similarities, -1.0, 1.0)

        except Exception as e:
            logger.error(f"Similarity calculation error: {e}")
            # Return zeros
            return np.zeros(len(pattern_embeddings))

    def _calculate_composite_score(self, similarity: float, success_rate: float,
                                  usage_count: int) -> float:
        """Calculate composite score with validation"""
        # Validate inputs
        similarity = max(0.0, min(1.0, float(similarity)))
        success_rate = max(0.0, min(1.0, float(success_rate)))
        usage_count = max(0, int(usage_count))

        # Calculate weighted score
        usage_weight = min(usage_count / 100, 0.3)
        return similarity * (1 + usage_weight) * (0.5 + 0.5 * success_rate)

    def add_pattern(self, pattern_id: str, file_path: str, file_type: str,
                   content: str, metadata: dict = None) -> bool:
        """Add pattern with full security validation"""
        try:
            with security_context(self.base_path, "add_pattern") as (validator, monitor):
                # Validate inputs
                InputSanitizer.sanitize_pattern_id(pattern_id)
                InputSanitizer.sanitize_file_type(file_type)

                # Validate file path is within allowed directory
                file_path = validator.validate_path(file_path)

                # Check file size
                monitor.check_file_size(file_path)

                # Validate content
                if not isinstance(content, str):
                    raise SecurityError("Content must be a string")

                content_hash = hash_file_content(content)

                # Validate metadata
                if metadata is None:
                    metadata = {}
                metadata = validate_metadata(metadata)
                metadata['content_hash'] = content_hash
                metadata['indexed_at'] = datetime.now().isoformat()

                # Store in database
                self.db.store_pattern(pattern_id, str(file_path), file_type,
                                    content[:100000], metadata)  # Limit content size

                # Generate and store embedding
                embedding = self.get_embedding(content[:5000])  # Limit text for embedding
                self.embeddings.add_embedding(embedding, pattern_id)
                self.embeddings.save_embeddings()

                monitor.record_file_processed(len(content))
                logger.info(f"Added pattern: {pattern_id}")
                return True

        except SecurityError as e:
            logger.error(f"Security error adding pattern: {e}")
            return False
        except Exception as e:
            logger.error(f"Error adding pattern: {e}")
            return False

    def update_usage(self, pattern_id: str, success: bool = None) -> None:
        """Update usage with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)
            self.db.update_usage(pattern_id, success)
        except SecurityError as e:
            logger.error(f"Security error updating usage: {e}")

    def get_pattern(self, pattern_id: str) -> Optional[Dict]:
        """Get pattern with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)
            return self.db.get_pattern(pattern_id)
        except SecurityError:
            return None

    def delete_pattern(self, pattern_id: str) -> bool:
        """Delete pattern with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            # Delete from database
            with sqlite3.connect(self.db.db_path) as conn:
                conn.execute('DELETE FROM patterns WHERE id = ?', (pattern_id,))
                conn.commit()

            # Delete embedding
            self.embeddings.remove_embedding(pattern_id)
            self.embeddings.save_embeddings()

            logger.info(f"Deleted pattern: {pattern_id}")
            return True

        except (SecurityError, sqlite3.Error) as e:
            logger.error(f"Error deleting pattern: {e}")
            return False

    def get_stats(self) -> Dict:
        """Get database statistics with security checks"""
        try:
            with sqlite3.connect(self.db.db_path) as conn:
                cursor = conn.execute('''
                    SELECT
                        COUNT(*) as total_patterns,
                        COALESCE(AVG(success_rate), 0) as avg_success_rate,
                        COALESCE(SUM(usage_count), 0) as total_usage,
                        COUNT(DISTINCT file_type) as unique_file_types
                    FROM patterns
                ''')
                stats = dict(cursor.fetchone())

                cursor = conn.execute('''
                    SELECT file_type, COUNT(*) as count
                    FROM patterns
                    GROUP BY file_type
                    ORDER BY count DESC
                    LIMIT 20
                ''')
                stats['by_file_type'] = [dict(row) for row in cursor.fetchall()]

                # Add embedding stats
                stats['total_embeddings'] = len(self.embeddings.embeddings)
                stats['embedding_cache_size'] = len(self._embedding_cache)
                stats['database_size_bytes'] = os.path.getsize(self.db.db_path) if os.path.exists(self.db.db_path) else 0

                return stats

        except (sqlite3.Error, OSError) as e:
            logger.error(f"Error getting stats: {e}")
            return {
                'total_patterns': 0,
                'avg_success_rate': 0,
                'total_usage': 0,
                'unique_file_types': 0,
                'by_file_type': [],
                'total_embeddings': 0,
                'embedding_cache_size': 0,
                'database_size_bytes': 0
            }