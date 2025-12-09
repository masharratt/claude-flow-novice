from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from typing import List, Dict, Optional, Tuple
import sqlite3
from datetime import datetime

class EmbeddingsManager:
    def __init__(self):
        self.embeddings = {}
    
    def get_embedding(self, text: str) -> np.ndarray:
        if text not in self.embeddings:
            self.embeddings[text] = np.random.rand(1536).astype(np.float32)
        return self.embeddings[text]

class SQLiteStore:
    def __init__(self, db_path: str = ":memory:"):
        self.conn = sqlite3.connect(db_path)
        self._init_db()
    
    def _init_db(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS patterns (
                id TEXT PRIMARY KEY,
                pattern TEXT NOT NULL,
                file_type TEXT,
                embedding BLOB,
                success_rate REAL DEFAULT 0.0,
                usage_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.commit()
    
    def get_patterns(self, file_type: str = None, limit: int = 10) -> List[Dict]:
        query = "SELECT * FROM patterns"
        params = []
        if file_type:
            query += " WHERE file_type = ?"
            params.append(file_type)
        query += " ORDER BY usage_count DESC LIMIT ?"
        params.append(limit)
        
        cursor = self.conn.execute(query, params)
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    def get_pattern_by_id(self, pattern_id: str) -> Optional[Dict]:
        cursor = self.conn.execute("SELECT * FROM patterns WHERE id = ?", (pattern_id,))
        row = cursor.fetchone()
        if row:
            columns = [desc[0] for desc in cursor.description]
            return dict(zip(columns, row))
        return None
    
    def text_search(self, query: str, file_type: str = None, limit: int = 10) -> List[Dict]:
        query_sql = "SELECT * FROM patterns WHERE pattern LIKE ?"
        params = [f"%{query}%"]
        if file_type:
            query_sql += " AND file_type = ?"
            params.append(file_type)
        query_sql += " ORDER BY usage_count DESC LIMIT ?"
        params.append(limit)
        
        cursor = self.conn.execute(query_sql, params)
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

class SearchEngine:
    def __init__(self, embeddings_manager: EmbeddingsManager, sqlite_store: SQLiteStore):
        self.embeddings = embeddings_manager
        self.db = sqlite_store
        self._embedding_cache = {}
        
    def search(self, query_pattern: str, file_type: str = None, 
               limit: int = 10, min_similarity: float = 0.7) -> List[Dict]:
        """Search for similar patterns using semantic similarity"""
        query_embedding = self.get_embedding(query_pattern)
        
        patterns = self.db.get_patterns(file_type=file_type, limit=limit * 3)
        
        if not patterns:
            return []
        
        pattern_embeddings = []
        valid_patterns = []
        
        for pattern in patterns:
            if pattern['embedding']:
                embedding = np.frombuffer(pattern['embedding'], dtype=np.float32)
                pattern_embeddings.append(embedding)
                valid_patterns.append(pattern)
        
        if not pattern_embeddings:
            return self.search_by_text(query_pattern, file_type, limit)
        
        pattern_embeddings = np.array(pattern_embeddings)
        similarities = self._calculate_similarity(query_embedding, pattern_embeddings)
        
        results = []
        for i, pattern in enumerate(valid_patterns):
            similarity = similarities[i]
            if similarity >= min_similarity:
                pattern['similarity_score'] = float(similarity)
                pattern['hybrid_score'] = self._calculate_hybrid_score(pattern, similarity)
                results.append(pattern)
        
        results.sort(key=lambda x: x['hybrid_score'], reverse=True)
        return results[:limit]
        
    def search_by_text(self, query_text: str, file_type: str = None,
                      limit: int = 10) -> List[Dict]:
        """Full-text search fallback"""
        patterns = self.db.text_search(query_text, file_type, limit)
        
        for pattern in patterns:
            pattern['similarity_score'] = 0.5
            pattern['hybrid_score'] = self._calculate_hybrid_score(pattern, 0.5)
        
        return patterns
        
    def get_embedding(self, text: str) -> np.ndarray:
        """Get embedding for text with caching"""
        if text in self._embedding_cache:
            return self._embedding_cache[text]
            
        embedding = self.embeddings.get_embedding(text)
        self._embedding_cache[text] = embedding
        return embedding
        
    def _calculate_similarity(self, query_embedding: np.ndarray,
                             pattern_embeddings: np.ndarray) -> np.ndarray:
        """Calculate cosine similarities"""
        return cosine_similarity([query_embedding], pattern_embeddings)[0]
        
    def get_similar_patterns(self, pattern_id: str, limit: int = 5) -> List[Dict]:
        """Get patterns similar to a given pattern"""
        pattern = self.db.get_pattern_by_id(pattern_id)
        if not pattern:
            return []
        
        return self.search(
            query_pattern=pattern['pattern'],
            file_type=pattern['file_type'],
            limit=limit,
            min_similarity=0.5
        )
    
    def _calculate_hybrid_score(self, pattern: Dict, similarity: float) -> float:
        """Calculate hybrid ranking score combining similarity, success rate, and usage"""
        similarity_weight = 0.6
        success_weight = 0.25
        usage_weight = 0.15
        
        max_usage = 100
        usage_score = min(pattern['usage_count'] / max_usage, 1.0)
        
        hybrid_score = (
            similarity * similarity_weight +
            pattern['success_rate'] * success_weight +
            usage_score * usage_weight
        )
        
        return hybrid_score
    
    def add_pattern(self, pattern_id: str, pattern_text: str, 
                   file_type: str = None, success_rate: float = 0.0,
                   usage_count: int = 0) -> None:
        """Add a new pattern to the database"""
        embedding = self.get_embedding(pattern_text)
        embedding_blob = embedding.tobytes()
        
        self.db.conn.execute("""
            INSERT OR REPLACE INTO patterns 
            (id, pattern, file_type, embedding, success_rate, usage_count)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (pattern_id, pattern_text, file_type, embedding_blob, 
              success_rate, usage_count))
        self.db.conn.commit()
    
    def update_usage(self, pattern_id: str, success: bool = True) -> None:
        """Update pattern usage statistics"""
        pattern = self.db.get_pattern_by_id(pattern_id)
        if pattern:
            new_usage = pattern['usage_count'] + 1
            if success:
                new_success_rate = ((pattern['success_rate'] * pattern['usage_count']) + 1) / new_usage
            else:
                new_success_rate = (pattern['success_rate'] * pattern['usage_count']) / new_usage
            
            self.db.conn.execute("""
                UPDATE patterns 
                SET usage_count = ?, success_rate = ?
                WHERE id = ?
            """, (new_usage, new_success_rate, pattern_id))
            self.db.conn.commit()
    
    def clear_cache(self) -> None:
        """Clear the embedding cache"""
        self._embedding_cache.clear()