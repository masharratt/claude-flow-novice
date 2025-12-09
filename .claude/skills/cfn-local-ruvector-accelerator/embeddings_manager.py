import os
import pickle
import numpy as np
from typing import Dict, Optional, List, Tuple, Any
from pathlib import Path
import logging

class EmbeddingsManager:
    def __init__(self, storage_path: str, dimensions: int = 1536):
        self.storage_path = Path(storage_path)
        self.embeddings_file = self.storage_path / 'embeddings.bin'
        self.index_file = self.storage_path / 'embeddings.index'
        self.metadata_file = self.storage_path / 'metadata.pkl'
        self.dimensions = dimensions
        self._embeddings: Optional[np.ndarray] = None
        self._id_to_index: Optional[Dict[str, int]] = None
        self._index_to_id: Optional[Dict[int, str]] = None
        self._loaded = False
        self.logger = logging.getLogger(__name__)
        
    @property
    def embeddings(self) -> np.ndarray:
        """Lazy load embeddings on first access"""
        if not self._loaded:
            self.load_embeddings()
        return self._embeddings if self._embeddings is not None else np.zeros((0, self.dimensions))
    
    @property
    def id_to_index(self) -> Dict[str, int]:
        """Lazy load ID-index mapping on first access"""
        if not self._loaded:
            self.load_embeddings()
        return self._id_to_index if self._id_to_index is not None else {}
    
    @property
    def index_to_id(self) -> Dict[int, str]:
        """Lazy load index-ID mapping on first access"""
        if not self._loaded:
            self.load_embeddings()
        return self._index_to_id if self._index_to_id is not None else {}
    
    def load_embeddings(self) -> bool:
        """Load embeddings from binary file with error handling"""
        try:
            if self.embeddings_file.exists():
                with open(self.embeddings_file, 'rb') as f:
                    self._embeddings = np.load(f)
                self._load_index()
                self._loaded = True
                self.logger.info(f"Loaded {len(self._embeddings)} embeddings from {self.embeddings_file}")
                return True
            else:
                self._embeddings = np.zeros((0, self.dimensions), dtype=np.float32)
                self._id_to_index = {}
                self._index_to_id = {}
                self._loaded = True
                self.logger.info(f"No embeddings file found at {self.embeddings_file}, initialized empty storage")
                return False
        except Exception as e:
            self.logger.error(f"Failed to load embeddings: {e}")
            self._embeddings = np.zeros((0, self.dimensions), dtype=np.float32)
            self._id_to_index = {}
            self._index_to_id = {}
            self._loaded = True
            return False
    
    def save_embeddings(self) -> bool:
        """Save embeddings to binary file with error handling"""
        try:
            self.storage_path.mkdir(parents=True, exist_ok=True)
            
            if self._embeddings is not None and len(self._embeddings) > 0:
                with open(self.embeddings_file, 'wb') as f:
                    np.save(f, self._embeddings)
                self._save_index()
                self._save_metadata()
                self.logger.info(f"Saved {len(self._embeddings)} embeddings to {self.embeddings_file}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to save embeddings: {e}")
            return False
    
    def add_embedding(self, vector: np.ndarray, pattern_id: str) -> bool:
        """Add new embedding with pattern ID"""
        try:
            if not isinstance(vector, np.ndarray):
                raise ValueError("Vector must be a numpy array")
            
            if vector.shape[0] != self.dimensions:
                raise ValueError(f"Vector dimension {vector.shape[0]} does not match expected {self.dimensions}")
            
            if not self._loaded:
                self.load_embeddings()
            
            if self._embeddings is None or len(self._embeddings) == 0:
                self._embeddings = vector.reshape(1, -1).astype(np.float32)
            else:
                self._embeddings = np.vstack([self._embeddings, vector.astype(np.float32)])
            
            index = len(self._embeddings) - 1
            if self._id_to_index is None:
                self._id_to_index = {}
            if self._index_to_id is None:
                self._index_to_id = {}
            
            self._id_to_index[pattern_id] = index
            self._index_to_id[index] = pattern_id
            
            return True
        except Exception as e:
            self.logger.error(f"Failed to add embedding for {pattern_id}: {e}")
            return False
    
    def get_embedding(self, pattern_id: str) -> Optional[np.ndarray]:
        """Get embedding by pattern ID"""
        try:
            if not self._loaded:
                self.load_embeddings()
            
            if self._id_to_index is None or pattern_id not in self._id_to_index:
                return None
            
            index = self._id_to_index[pattern_id]
            if self._embeddings is None or index >= len(self._embeddings):
                return None
            
            return self._embeddings[index].copy()
        except Exception as e:
            self.logger.error(f"Failed to get embedding for {pattern_id}: {e}")
            return None
    
    def get_embeddings_batch(self, pattern_ids: List[str]) -> Dict[str, Optional[np.ndarray]]:
        """Get multiple embeddings by pattern IDs efficiently"""
        result = {}
        if not self._loaded:
            self.load_embeddings()
        
        for pattern_id in pattern_ids:
            result[pattern_id] = self.get_embedding(pattern_id)
        
        return result
    
    def remove_embedding(self, pattern_id: str) -> bool:
        """Remove embedding by pattern ID"""
        try:
            if not self._loaded:
                self.load_embeddings()
            
            if self._id_to_index is None or pattern_id not in self._id_to_index:
                return False
            
            index = self._id_to_index[pattern_id]
            
            if self._embeddings is not None and len(self._embeddings) > 0:
                mask = np.ones(len(self._embeddings), dtype=bool)
                mask[index] = False
                self._embeddings = self._embeddings[mask]
                
                # Rebuild mappings
                new_id_to_index = {}
                new_index_to_id = {}
                
                for pid, idx in self._id_to_index.items():
                    if pid != pattern_id:
                        new_idx = idx if idx < index else idx - 1
                        new_id_to_index[pid] = new_idx
                        new_index_to_id[new_idx] = pid
                
                self._id_to_index = new_id_to_index
                self._index_to_id = new_index_to_id
                
                return True
            return False
        except Exception as e:
            self.logger.error(f"Failed to remove embedding for {pattern_id}: {e}")
            return False
    
    def search_similar(self, query_vector: np.ndarray, top_k: int = 5) -> List[Tuple[str, float]]:
        """Search for similar embeddings using cosine similarity"""
        try:
            if not self._loaded:
                self.load_embeddings()
            
            if self._embeddings is None or len(self._embeddings) == 0:
                return []
            
            query_norm = query_vector / np.linalg.norm(query_vector)
            embeddings_norm = self._embeddings / np.linalg.norm(self._embeddings, axis=1, keepdims=True)
            
            similarities = np.dot(embeddings_norm, query_norm)
            top_indices = np.argsort(similarities)[-top_k:][::-1]
            
            results = []
            for idx in top_indices:
                if idx in self._index_to_id:
                    pattern_id = self._index_to_id[idx]
                    similarity = float(similarities[idx])
                    results.append((pattern_id, similarity))
            
            return results
        except Exception as e:
            self.logger.error(f"Failed to search similar embeddings: {e}")
            return []
    
    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        if not self._loaded:
            self.load_embeddings()
        
        return {
            'total_embeddings': len(self._embeddings) if self._embeddings is not None else 0,
            'dimensions': self.dimensions,
            'storage_path': str(self.storage_path),
            'embeddings_file_size': self.embeddings_file.stat().st_size if self.embeddings_file.exists() else 0,
            'index_file_size': self.index_file.stat().st_size if self.index_file.exists() else 0
        }
    
    def _load_index(self) -> None:
        """Load ID-index mappings from file with error handling"""
        try:
            if not self.index_file.exists():
                self._id_to_index = {}
                self._index_to_id = {}
                return
            
            self._id_to_index = {}
            self._index_to_id = {}
            
            with open(self.index_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        parts = line.split(':', 1)
                        if len(parts) == 2:
                            index_str, pattern_id = parts
                            try:
                                idx = int(index_str)
                                self._id_to_index[pattern_id] = idx
                                self._index_to_id[idx] = pattern_id
                            except ValueError:
                                self.logger.warning(f"Invalid index format in line: {line}")
                                continue
        except Exception as e:
            self.logger.error(f"Failed to load index file: {e}")
            self._id_to_index = {}
            self._index_to_id = {}
    
    def _save_index(self) -> None:
        """Save ID-index mappings to file with error handling"""
        try:
            if self._id_to_index is None:
                return
            
            with open(self.index_file, 'w', encoding='utf-8') as f:
                for pattern_id, index in self._id_to_index.items():
                    f.write(f"{index}:{pattern_id}\n")
        except Exception as e:
            self.logger.error(f"Failed to save index file: {e}")
    
    def _save_metadata(self) -> None:
        """Save metadata to pickle file"""
        try:
            metadata = {
                'dimensions': self.dimensions,
                'created_at': os.path.getctime(self.embeddings_file) if self.embeddings_file.exists() else None,
                'version': '1.0'
            }
            with open(self.metadata_file, 'wb') as f:
                pickle.dump(metadata, f)
        except Exception as e:
            self.logger.error(f"Failed to save metadata: {e}")
    
    def clear_all(self) -> bool:
        """Clear all embeddings and mappings"""
        try:
            self._embeddings = np.zeros((0, self.dimensions), dtype=np.float32)
            self._id_to_index = {}
            self._index_to_id = {}
            
            # Remove files
            for file_path in [self.embeddings_file, self.index_file, self.metadata_file]:
                if file_path.exists():
                    file_path.unlink()
            
            self.logger.info("Cleared all embeddings and mappings")
            return True
        except Exception as e:
            self.logger.error(f"Failed to clear embeddings: {e}")
            return False