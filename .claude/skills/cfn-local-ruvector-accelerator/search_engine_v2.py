import sqlite3
import os
import json
import numpy as np
from typing import List, Dict, Optional, Tuple, Any
from sklearn.metrics.pairwise import cosine_similarity
import pickle
from datetime import datetime

class EmbeddingsManager:
    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        self.embeddings_file = os.path.join(storage_path, "embeddings.pkl")
        self.embeddings = {}
        self._load_embeddings()
        
    def _load_embeddings(self):
        if os.path.exists(self.embeddings_file):
            with open(self.embeddings_file, 'rb') as f:
                self.embeddings = pickle.load(f)
                
    def save_embeddings(self):
        os.makedirs(self.storage_path, exist_ok=True)
        with open(self.embeddings_file, 'wb') as f:
            pickle.dump(self.embeddings, f)
            
    def add_embedding(self, embedding: np.ndarray, pattern_id: str):
        self.embeddings[pattern_id] = embedding
        
    def get_embedding(self, pattern_id: str) -> Optional[np.ndarray]:
        return self.embeddings.get(pattern_id)
        
    def remove_embedding(self, pattern_id: str):
        if pattern_id in self.embeddings:
            del self.embeddings[pattern_id]

class SQLiteStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()
        
    def _init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS patterns (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    success_rate REAL DEFAULT 0.0,
                    usage_count INTEGER DEFAULT 0,
                    success_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()
            
    def store_pattern(self, pattern_id: str, file_path: str, file_type: str,
                     content: str, metadata: dict = None):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT OR REPLACE INTO patterns 
                (id, file_path, file_type, content, metadata, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (pattern_id, file_path, file_type, content,
                  json.dumps(metadata) if metadata else None,
                  datetime.now()))
            conn.commit()
            
    def query_patterns(self, file_type: str = None, limit: int = 100,
                      min_success_rate: float = 0.0) -> List[Dict]:
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
            return [dict(row) for row in cursor.fetchall()]
            
    def update_usage(self, pattern_id: str, success: bool = None):
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
            
    def get_pattern(self, pattern_id: str) -> Optional[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT * FROM patterns WHERE id = ?', (pattern_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

class SearchEngine:
    def __init__(self, storage_path: str):
        self.embeddings = EmbeddingsManager(storage_path)
        self.db = SQLiteStore(f"{storage_path}/cache.db")
        self._embedding_cache = {}
        
    def search(self, query_pattern: str, file_type: str = None, 
               limit: int = 10, min_similarity: float = 0.7) -> List[Dict]:
        query_embedding = self.get_embedding(query_pattern)
        
        candidates = self.db.query_patterns(
            file_type=file_type, 
            limit=limit * 2,
            min_success_rate=0.5
        )
        
        if not candidates:
            return []
            
        pattern_embeddings = []
        valid_candidates = []
        
        for pattern in candidates:
            embedding = self.embeddings.get_embedding(pattern['id'])
            if embedding is not None:
                pattern_embeddings.append(embedding)
                valid_candidates.append(pattern)
        
        if not pattern_embeddings:
            return []
            
        similarities = self._calculate_similarity(query_embedding, np.array(pattern_embeddings))
        
        results = []
        for i, pattern in enumerate(valid_candidates):
            similarity = float(similarities[i])
            
            if similarity >= min_similarity:
                composite_score = self._calculate_composite_score(
                    similarity, 
                    pattern['success_rate'], 
                    pattern['usage_count']
                )
                
                results.append({
                    'id': pattern['id'],
                    'file_path': pattern['file_path'],
                    'file_type': pattern['file_type'],
                    'content': pattern['content'],
                    'metadata': json.loads(pattern['metadata']) if pattern['metadata'] else {},
                    'similarity': similarity,
                    'composite_score': composite_score,
                    'success_rate': pattern['success_rate'],
                    'usage_count': pattern['usage_count']
                })
        
        results.sort(key=lambda x: x['composite_score'], reverse=True)
        
        return results[:limit]
        
    def get_embedding(self, text: str) -> np.ndarray:
        if text in self._embedding_cache:
            return self._embedding_cache[text]
            
        embedding = np.random.rand(1536).astype(np.float32)
        self._embedding_cache[text] = embedding
        return embedding
        
    def _calculate_similarity(self, query_embedding: np.ndarray,
                             pattern_embeddings: np.ndarray) -> np.ndarray:
        return cosine_similarity([query_embedding], pattern_embeddings)[0]
        
    def _calculate_composite_score(self, similarity: float, success_rate: float, 
                                  usage_count: int) -> float:
        usage_weight = min(usage_count / 100, 0.3)
        return similarity * (1 + usage_weight) * (0.5 + 0.5 * success_rate)
        
    def add_pattern(self, pattern_id: str, file_path: str, file_type: str,
                   content: str, metadata: dict = None) -> None:
        self.db.store_pattern(pattern_id, file_path, file_type, content, metadata or {})
        
        embedding = self.get_embedding(content)
        self.embeddings.add_embedding(embedding, pattern_id)
        self.embeddings.save_embeddings()
        
    def update_usage(self, pattern_id: str, success: bool = None) -> None:
        self.db.update_usage(pattern_id, success)
        
    def get_pattern(self, pattern_id: str) -> Optional[Dict]:
        return self.db.get_pattern(pattern_id)
        
    def delete_pattern(self, pattern_id: str) -> None:
        with sqlite3.connect(self.db.db_path) as conn:
            conn.execute('DELETE FROM patterns WHERE id = ?', (pattern_id,))
            conn.commit()
        self.embeddings.remove_embedding(pattern_id)
        self.embeddings.save_embeddings()
        
    def get_stats(self) -> Dict:
        with sqlite3.connect(self.db.db_path) as conn:
            cursor = conn.execute('''
                SELECT 
                    COUNT(*) as total_patterns,
                    AVG(success_rate) as avg_success_rate,
                    SUM(usage_count) as total_usage,
                    COUNT(DISTINCT file_type) as unique_file_types
                FROM patterns
            ''')
            stats = dict(cursor.fetchone())
            
            cursor = conn.execute('''
                SELECT file_type, COUNT(*) as count
                FROM patterns
                GROUP BY file_type
                ORDER BY count DESC
            ''')
            stats['by_file_type'] = [dict(row) for row in cursor.fetchall()]
            
            return stats