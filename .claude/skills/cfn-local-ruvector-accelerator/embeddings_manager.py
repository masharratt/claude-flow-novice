import os
import pickle
import numpy as np
from typing import Dict, Optional, List, Tuple, Any
from pathlib import Path
import logging
import hashlib

# Import security controls
from security import (
    SecurityError, PathValidator, ResourceMonitor,
    InputSanitizer, safe_file_read
)

logger = logging.getLogger(__name__)

# Security limits
MAX_EMBEDDINGS = 100000
MAX_EMBEDDINGS_FILE_SIZE = 1024 * 1024 * 1024  # 1GB
MAX_EMBEDDING_CACHE_SIZE = 10000
MIN_DIMENSION = 1
MAX_DIMENSION = 8192

class EmbeddingsManager:
    def __init__(self, storage_path: str, dimensions: int = 1536):
        # Validate and secure storage path
        try:
            self.base_path = Path(storage_path).parent
            validator = PathValidator(self.base_path)
            self.storage_path = Path(validator.validate_path(storage_path))
        except SecurityError as e:
            logger.error(f"Storage path validation failed: {e}")
            raise

        self.embeddings_file = self.storage_path / 'embeddings.bin'
        self.index_file = self.storage_path / 'embeddings.index'
        self.metadata_file = self.storage_path / 'metadata.pkl'

        # Validate dimensions
        if not isinstance(dimensions, int) or dimensions < MIN_DIMENSION or dimensions > MAX_DIMENSION:
            raise SecurityError(f"Invalid dimensions: {dimensions}. Must be between {MIN_DIMENSION} and {MAX_DIMENSION}")
        self.dimensions = dimensions

        # Security components
        self.resource_monitor = ResourceMonitor()

        # Embedding storage
        self._embeddings: Optional[np.ndarray] = None
        self._id_to_index: Optional[Dict[str, int]] = None
        self._index_to_id: Optional[Dict[int, str]] = None
        self._loaded = False

        # Content hashes for integrity checking
        self._content_hashes: Dict[str, str] = {}

        self.logger = logging.getLogger(__name__)

    @property
    def embeddings(self) -> np.ndarray:
        """Lazy load embeddings on first access with security checks"""
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
        """Load embeddings from binary file with comprehensive security checks"""
        try:
            # Validate file exists and check size
            if not self.embeddings_file.exists():
                self._initialize_empty_storage()
                return True

            # Check file size limit
            file_size = self.embeddings_file.stat().st_size
            if file_size > MAX_EMBEDDINGS_FILE_SIZE:
                logger.error(f"Embeddings file too large: {file_size} bytes")
                self._initialize_empty_storage()
                return False

            # Safely read file with size limit
            data = safe_file_read(self.embeddings_file, MAX_EMBEDDINGS_FILE_SIZE)

            # Load embeddings with validation
            self._embeddings = np.frombuffer(data, dtype=np.float32)

            # Check if data is valid
            if len(self._embeddings) % self.dimensions != 0:
                logger.error("Invalid embeddings file: size not multiple of dimensions")
                self._initialize_empty_storage()
                return False

            # Reshape to 2D array
            num_embeddings = len(self._embeddings) // self.dimensions
            self._embeddings = self._embeddings.reshape(num_embeddings, self.dimensions)

            # Validate all embedding values
            if not np.all(np.isfinite(self._embeddings)):
                logger.error("Embeddings contain invalid values (NaN/Inf)")
                self._initialize_empty_storage()
                return False

            # Load index mapping
            self._load_index()

            # Load content hashes if available
            self._load_content_hashes()

            # Validate consistency
            if not self._validate_consistency():
                logger.error("Embeddings consistency check failed")
                self._initialize_empty_storage()
                return False

            self._loaded = True
            self.logger.info(f"Loaded {len(self._embeddings)} embeddings from {self.embeddings_file}")
            return True

        except SecurityError as e:
            self.logger.error(f"Security error loading embeddings: {e}")
            self._initialize_empty_storage()
            return False
        except Exception as e:
            self.logger.error(f"Failed to load embeddings: {e}")
            self._initialize_empty_storage()
            return False

    def _initialize_empty_storage(self):
        """Initialize empty storage"""
        self._embeddings = np.zeros((0, self.dimensions), dtype=np.float32)
        self._id_to_index = {}
        self._index_to_id = {}
        self._content_hashes = {}
        self._loaded = True

    def _validate_consistency(self) -> bool:
        """Validate internal consistency of loaded data"""
        try:
            if self._embeddings is None or self._id_to_index is None or self._index_to_id is None:
                return False

            num_embeddings = len(self._embeddings)
            if num_embeddings != len(self._id_to_index) or num_embeddings != len(self._index_to_id):
                return False

            # Check index mappings are consistent
            for pattern_id, index in self._id_to_index.items():
                if index >= num_embeddings:
                    return False
                if self._index_to_id.get(index) != pattern_id:
                    return False

            return True

        except Exception:
            return False

    def _load_content_hashes(self):
        """Load content hashes for integrity checking"""
        try:
            hash_file = self.storage_path / 'content_hashes.pkl'
            if hash_file.exists():
                with open(hash_file, 'rb') as f:
                    data = f.read(1024 * 1024)  # 1MB limit
                    self._content_hashes = pickle.loads(data)
        except Exception as e:
            self.logger.warning(f"Failed to load content hashes: {e}")
            self._content_hashes = {}

    def save_embeddings(self) -> bool:
        """Save embeddings to binary file with security checks"""
        try:
            # Validate storage path
            validator = PathValidator(self.storage_path.parent)
            validated_path = validator.validate_path(self.storage_path)

            # Create directory if needed
            os.makedirs(validated_path, exist_ok=True)

            if self._embeddings is None or len(self._embeddings) == 0:
                self.logger.warning("No embeddings to save")
                return True

            # Limit number of embeddings
            if len(self._embeddings) > MAX_EMBEDDINGS:
                self.logger.warning(f"Too many embeddings ({len(self._embeddings)}), saving only first {MAX_EMBEDDINGS}")
                self._embeddings = self._embeddings[:MAX_EMBEDDINGS]
                self._rebuild_mappings()

            # Check final data size
            data_size = self._embeddings.nbytes
            if data_size > MAX_EMBEDDINGS_FILE_SIZE:
                self.logger.error(f"Embeddings data too large: {data_size} bytes")
                return False

            # Save embeddings file
            with open(self.embeddings_file, 'wb') as f:
                self._embeddings.tofile(f)

            # Save index mappings
            self._save_index()

            # Save content hashes
            self._save_content_hashes()

            # Save metadata
            self._save_metadata()

            self.logger.info(f"Saved {len(self._embeddings)} embeddings to {self.embeddings_file}")
            return True

        except SecurityError as e:
            self.logger.error(f"Security error saving embeddings: {e}")
            return False
        except Exception as e:
            self.logger.error(f"Failed to save embeddings: {e}")
            return False

    def _rebuild_mappings(self):
        """Rebuild index mappings after truncation"""
        if self._embeddings is None or self._id_to_index is None:
            return

        new_id_to_index = {}
        new_index_to_id = {}
        new_hashes = {}

        for pattern_id, index in self._id_to_index.items():
            if index < len(self._embeddings):
                new_id_to_index[pattern_id] = index
                new_index_to_id[index] = pattern_id
                if pattern_id in self._content_hashes:
                    new_hashes[pattern_id] = self._content_hashes[pattern_id]

        self._id_to_index = new_id_to_index
        self._index_to_id = new_index_to_id
        self._content_hashes = new_hashes

    def _save_content_hashes(self):
        """Save content hashes"""
        try:
            hash_file = self.storage_path / 'content_hashes.pkl'
            with open(hash_file, 'wb') as f:
                pickle.dump(self._content_hashes, f)
        except Exception as e:
            self.logger.error(f"Failed to save content hashes: {e}")

    def add_embedding(self, vector: np.ndarray, pattern_id: str, content: str = None) -> bool:
        """Add new embedding with comprehensive validation"""
        try:
            # Validate pattern ID
            InputSanitizer.sanitize_pattern_id(pattern_id)

            # Validate vector
            if not isinstance(vector, np.ndarray):
                raise SecurityError("Vector must be a numpy array")

            if len(vector.shape) != 1 or vector.shape[0] != self.dimensions:
                raise SecurityError(f"Vector shape {vector.shape} does not match expected ({self.dimensions},)")

            # Check for invalid values
            if not np.all(np.isfinite(vector)):
                raise SecurityError("Vector contains NaN or infinite values")

            # Check vector norm (avoid zero vectors)
            norm = np.linalg.norm(vector)
            if norm < 1e-8:
                self.logger.warning(f"Vector has very small norm: {norm}")
                # Normalize to avoid issues
                vector = vector / max(norm, 1e-8)

            # Check content hash if provided
            if content is not None:
                content_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
                if pattern_id in self._content_hashes:
                    if self._content_hashes[pattern_id] != content_hash:
                        self.logger.warning(f"Content hash changed for pattern {pattern_id}")
                self._content_hashes[pattern_id] = content_hash

            # Load if not loaded
            if not self._loaded:
                self.load_embeddings()

            # Initialize storage if empty
            if self._embeddings is None or len(self._embeddings) == 0:
                self._embeddings = np.zeros((1, self.dimensions), dtype=np.float32)
                self._embeddings[0] = vector
                self._id_to_index = {pattern_id: 0}
                self._index_to_id = {0: pattern_id}
            else:
                # Check if already exists
                if pattern_id in self._id_to_index:
                    # Update existing embedding
                    index = self._id_to_index[pattern_id]
                    self._embeddings[index] = vector
                else:
                    # Check limit
                    if len(self._embeddings) >= MAX_EMBEDDINGS:
                        self.logger.error(f"Maximum embeddings limit reached: {MAX_EMBEDDINGS}")
                        return False

                    # Add new embedding
                    new_index = len(self._embeddings)
                    self._embeddings = np.vstack([self._embeddings, vector.reshape(1, -1)])
                    self._id_to_index[pattern_id] = new_index
                    self._index_to_id[new_index] = pattern_id

            # Record resource usage
            self.resource_monitor.record_file_processed(vector.nbytes)

            self.logger.debug(f"Added/updated embedding for pattern: {pattern_id}")
            return True

        except SecurityError as e:
            self.logger.error(f"Security error adding embedding for {pattern_id}: {e}")
            return False
        except Exception as e:
            self.logger.error(f"Failed to add embedding for {pattern_id}: {e}")
            return False

    def get_embedding(self, pattern_id: str) -> Optional[np.ndarray]:
        """Get embedding by pattern ID with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            if not self._loaded:
                self.load_embeddings()

            if self._id_to_index is None or pattern_id not in self._id_to_index:
                return None

            index = self._id_to_index[pattern_id]
            if self._embeddings is None or index >= len(self._embeddings):
                return None

            # Return a copy to prevent modification
            embedding = self._embeddings[index].copy()

            # Validate embedding before returning
            if not np.all(np.isfinite(embedding)):
                self.logger.warning(f"Invalid embedding values for pattern {pattern_id}")
                return None

            return embedding

        except SecurityError:
            return None

    def get_embeddings_batch(self, pattern_ids: List[str]) -> Dict[str, Optional[np.ndarray]]:
        """Get multiple embeddings efficiently with validation"""
        result = {}

        # Validate and limit batch size
        if not isinstance(pattern_ids, list):
            raise SecurityError("Pattern IDs must be a list")

        if len(pattern_ids) > MAX_EMBEDDING_CACHE_SIZE:
            self.logger.warning(f"Batch too large ({len(pattern_ids)}), limiting to {MAX_EMBEDDING_CACHE_SIZE}")
            pattern_ids = pattern_ids[:MAX_EMBEDDING_CACHE_SIZE]

        if not self._loaded:
            self.load_embeddings()

        for pattern_id in pattern_ids:
            try:
                result[pattern_id] = self.get_embedding(pattern_id)
            except SecurityError:
                result[pattern_id] = None

        return result

    def remove_embedding(self, pattern_id: str) -> bool:
        """Remove embedding by pattern ID with validation"""
        try:
            InputSanitizer.sanitize_pattern_id(pattern_id)

            if not self._loaded:
                self.load_embeddings()

            if self._id_to_index is None or pattern_id not in self._id_to_index:
                return False

            index = self._id_to_index[pattern_id]

            if self._embeddings is None or len(self._embeddings) == 0:
                return False

            # Remove from embeddings array
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

            # Remove content hash
            if pattern_id in self._content_hashes:
                del self._content_hashes[pattern_id]

            self.logger.info(f"Removed embedding for pattern: {pattern_id}")
            return True

        except SecurityError as e:
            self.logger.error(f"Security error removing embedding for {pattern_id}: {e}")
            return False

    def search_similar(self, query_vector: np.ndarray, top_k: int = 5) -> List[Tuple[str, float]]:
        """Search for similar embeddings with security validation"""
        try:
            # Validate query vector
            if not isinstance(query_vector, np.ndarray):
                raise SecurityError("Query vector must be a numpy array")

            if query_vector.shape != (self.dimensions,):
                raise SecurityError(f"Query vector shape {query_vector.shape} does not match expected ({self.dimensions},)")

            if not np.all(np.isfinite(query_vector)):
                raise SecurityError("Query vector contains invalid values")

            # Validate top_k
            if not isinstance(top_k, int) or top_k < 1:
                top_k = 5
            top_k = min(top_k, 1000)  # Hard limit

            if not self._loaded:
                self.load_embeddings()

            if self._embeddings is None or len(self._embeddings) == 0:
                return []

            # Normalize vectors
            query_norm = query_vector / np.linalg.norm(query_vector)
            embeddings_norm = self._embeddings / np.linalg.norm(
                self._embeddings, axis=1, keepdims=True
            )

            # Check for any invalid normalizations
            if not np.all(np.isfinite(embeddings_norm)):
                self.logger.warning("Some embeddings have invalid norms, excluding from search")
                valid_mask = np.all(np.isfinite(embeddings_norm), axis=1)
                embeddings_norm = embeddings_norm[valid_mask]
                # Need to adjust indices based on valid_mask
                valid_indices = np.where(valid_mask)[0]
            else:
                valid_indices = np.arange(len(self._embeddings))

            # Calculate similarities
            similarities = np.dot(embeddings_norm, query_norm)

            # Get top-k
            if len(similarities) < top_k:
                top_k = len(similarities)

            top_indices = np.argpartition(similarities, -top_k)[-top_k:]
            top_indices = top_indices[np.argsort(-similarities[top_indices])]

            results = []
            for idx in top_indices:
                original_idx = valid_indices[idx]
                if original_idx in self._index_to_id:
                    pattern_id = self._index_to_id[original_idx]
                    similarity = float(similarities[idx])
                    # Clamp to valid range
                    similarity = max(-1.0, min(1.0, similarity))
                    results.append((pattern_id, similarity))

            return results

        except SecurityError as e:
            self.logger.error(f"Security error in similarity search: {e}")
            return []
        except Exception as e:
            self.logger.error(f"Failed to search similar embeddings: {e}")
            return []

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        if not self._loaded:
            self.load_embeddings()

        stats = {
            'total_embeddings': len(self._embeddings) if self._embeddings is not None else 0,
            'dimensions': self.dimensions,
            'storage_path': str(self.storage_path),
            'embeddings_file_size': self.embeddings_file.stat().st_size if self.embeddings_file.exists() else 0,
            'index_file_size': self.index_file.stat().st_size if self.index_file.exists() else 0,
            'content_hashes_count': len(self._content_hashes),
            'memory_usage_bytes': self._embeddings.nbytes if self._embeddings is not None else 0,
            'max_embeddings_limit': MAX_EMBEDDINGS,
            'max_file_size_bytes': MAX_EMBEDDINGS_FILE_SIZE
        }

        # Add resource monitor stats
        stats.update(self.resource_monitor.get_stats())

        return stats

    def _load_index(self) -> None:
        """Load ID-index mappings from file with error handling"""
        try:
            if not self.index_file.exists():
                self._id_to_index = {}
                self._index_to_id = {}
                return

            # Validate file size
            if self.index_file.stat().st_size > 10 * 1024 * 1024:  # 10MB limit
                raise SecurityError("Index file too large")

            self._id_to_index = {}
            self._index_to_id = {}

            with open(self.index_file, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    if line_num > MAX_EMBEDDINGS * 2:  # Safety limit
                        break

                    line = line.strip()
                    if line:
                        parts = line.split(':', 1)
                        if len(parts) == 2:
                            index_str, pattern_id = parts
                            try:
                                idx = int(index_str)
                                if idx >= 0 and idx < MAX_EMBEDDINGS:
                                    # Validate pattern ID
                                    InputSanitizer.sanitize_pattern_id(pattern_id)
                                    self._id_to_index[pattern_id] = idx
                                    self._index_to_id[idx] = pattern_id
                            except (ValueError, SecurityError):
                                self.logger.warning(f"Invalid index format at line {line_num}: {line}")
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

            # Limit number of entries
            if len(self._id_to_index) > MAX_EMBEDDINGS:
                self.logger.warning(f"Too many index entries ({len(self._id_to_index)}), saving only first {MAX_EMBEDDINGS}")
                items = list(self._id_to_index.items())[:MAX_EMBEDDINGS]
                self._id_to_index = dict(items)

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
                'created_at': self.embeddings_file.stat().st_ctime if self.embeddings_file.exists() else None,
                'version': '2.0',
                'security_enabled': True,
                'max_embeddings': MAX_EMBEDDINGS,
                'embedding_count': len(self._embeddings) if self._embeddings is not None else 0
            }

            metadata_file = self.storage_path / 'metadata.pkl'
            with open(metadata_file, 'wb') as f:
                pickle.dump(metadata, f)

        except Exception as e:
            self.logger.error(f"Failed to save metadata: {e}")

    def clear_all(self) -> bool:
        """Clear all embeddings and mappings"""
        try:
            self._embeddings = np.zeros((0, self.dimensions), dtype=np.float32)
            self._id_to_index = {}
            self._index_to_id = {}
            self._content_hashes = {}

            # Remove files
            for file_path in [self.embeddings_file, self.index_file, self.metadata_file,
                             self.storage_path / 'content_hashes.pkl']:
                if file_path.exists():
                    file_path.unlink()

            self.logger.info("Cleared all embeddings and mappings")
            return True

        except Exception as e:
            self.logger.error(f"Failed to clear embeddings: {e}")
            return False

    def verify_integrity(self) -> Dict[str, Any]:
        """Verify integrity of embeddings and mappings"""
        issues = []

        try:
            if not self._loaded:
                self.load_embeddings()

            # Check embeddings array
            if self._embeddings is None:
                issues.append("No embeddings loaded")
            else:
                # Check for invalid values
                if not np.all(np.isfinite(self._embeddings)):
                    issues.append(f"Found {np.sum(~np.isfinite(self._embeddings))} invalid values")

                # Check dimensions
                if self._embeddings.shape[1] != self.dimensions:
                    issues.append(f"Embedding dimension mismatch: expected {self.dimensions}, got {self._embeddings.shape[1]}")

            # Check mapping consistency
            if self._id_to_index is None or self._index_to_id is None:
                issues.append("Missing index mappings")
            else:
                if len(self._id_to_index) != len(self._index_to_id):
                    issues.append("Index mapping size mismatch")

                # Verify each mapping
                for pattern_id, index in list(self._id_to_index.items())[:100]:  # Check first 100
                    if index >= len(self._embeddings):
                        issues.append(f"Invalid index for pattern {pattern_id}: {index} >= {len(self._embeddings)}")
                    elif self._index_to_id.get(index) != pattern_id:
                        issues.append(f"Mapping inconsistency for pattern {pattern_id}")

            return {
                'valid': len(issues) == 0,
                'issues': issues,
                'total_embeddings': len(self._embeddings) if self._embeddings is not None else 0,
                'verified_mappings': min(len(self._id_to_index), 100) if self._id_to_index else 0
            }

        except Exception as e:
            return {
                'valid': False,
                'issues': [f"Integrity check failed: {e}"],
                'total_embeddings': 0,
                'verified_mappings': 0
            }