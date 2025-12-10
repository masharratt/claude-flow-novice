#!/usr/bin/env python3
"""
Security controls for AST-Aware RuVector Accelerator
Implements path validation, resource limits, and input sanitization
"""

import os
import sys
import hashlib
import logging
from pathlib import Path
from typing import List, Optional, Union, Dict, Any
import stat
import time
import sqlite3
from contextlib import contextmanager

# Security configuration
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_BATCH_SIZE = 1000
MAX_EMBEDDING_DIMENSION = 8192
MAX_DATABASE_SIZE = 1024 * 1024 * 1024  # 1GB
MAX_PATH_LENGTH = 4096
SUSPICIOUS_PATTERNS = [
    '..', '~', '$', '<', '>', '|', ';', '&', '`', '(', ')',
    '${', '__', '\x00',  # Null byte
]

# Setup logging
logger = logging.getLogger(__name__)

class SecurityError(Exception):
    """Security-related errors"""
    pass

class PathValidator:
    """Validates file paths to prevent directory traversal"""

    def __init__(self, base_path: Union[str, Path]):
        self.base_path = Path(base_path).resolve()
        if not self.base_path.exists():
            raise SecurityError(f"Base path does not exist: {self.base_path}")

    def validate_path(self, file_path: Union[str, Path]) -> Path:
        """
        Validate and canonicalize a file path

        Args:
            file_path: Path to validate

        Returns:
            Canonicalized absolute path within base directory

        Raises:
            SecurityError: If path is invalid or outside base directory
        """
        try:
            # Convert to Path object
            path = Path(file_path)

            # Check for suspicious patterns
            path_str = str(path)
            for pattern in SUSPICIOUS_PATTERNS:
                if pattern in path_str:
                    raise SecurityError(f"Suspicious pattern '{pattern}' in path: {path_str}")

            # Resolve to absolute path
            abs_path = path.resolve()

            # Check path length
            if len(str(abs_path)) > MAX_PATH_LENGTH:
                raise SecurityError(f"Path too long: {len(str(abs_path))} > {MAX_PATH_LENGTH}")

            # Ensure path is within base directory
            try:
                rel_path = abs_path.relative_to(self.base_path)
            except ValueError:
                raise SecurityError(f"Path outside base directory: {abs_path} not in {self.base_path}")

            # Additional check for symlink safety
            if abs_path.is_symlink():
                target = abs_path.resolve()
                try:
                    target.relative_to(self.base_path)
                except ValueError:
                    raise SecurityError(f"Symlink target outside base directory: {target}")

            return abs_path

        except (OSError, ValueError) as e:
            raise SecurityError(f"Path validation failed: {e}")

    def validate_directory(self, dir_path: Union[str, Path]) -> Path:
        """Validate a directory path"""
        path = self.validate_path(dir_path)
        if not path.is_dir():
            raise SecurityError(f"Path is not a directory: {path}")
        return path

    def validate_file(self, file_path: Union[str, Path]) -> Path:
        """Validate a file path"""
        path = self.validate_path(file_path)
        if not path.is_file():
            raise SecurityError(f"Path is not a file: {path}")
        return path

class ResourceMonitor:
    """Monitors and enforces resource limits"""

    def __init__(self):
        self._start_time = time.time()
        self._bytes_processed = 0
        self._files_processed = 0
        self._operations = 0

    def check_file_size(self, file_path: Path) -> None:
        """Check if file size is within limits"""
        try:
            size = file_path.stat().st_size
            if size > MAX_FILE_SIZE:
                raise SecurityError(
                    f"File too large: {size} bytes > {MAX_FILE_SIZE} bytes: {file_path}"
                )
        except OSError as e:
            raise SecurityError(f"Failed to check file size: {e}")

    def check_batch_size(self, batch_size: int) -> None:
        """Check if batch size is within limits"""
        if batch_size > MAX_BATCH_SIZE:
            raise SecurityError(
                f"Batch size too large: {batch_size} > {MAX_BATCH_SIZE}"
            )

    def check_embedding_dimension(self, dimension: int) -> None:
        """Check if embedding dimension is within limits"""
        if dimension > MAX_EMBEDDING_DIMENSION:
            raise SecurityError(
                f"Embedding dimension too large: {dimension} > {MAX_EMBEDDING_DIMENSION}"
            )

    def record_file_processed(self, size: int) -> None:
        """Record file processing for monitoring"""
        self._files_processed += 1
        self._bytes_processed += size
        self._operations += 1

    def get_stats(self) -> Dict[str, Any]:
        """Get resource usage statistics"""
        elapsed = time.time() - self._start_time
        return {
            'files_processed': self._files_processed,
            'bytes_processed': self._bytes_processed,
            'operations': self._operations,
            'elapsed_seconds': elapsed,
            'bytes_per_second': self._bytes_processed / max(elapsed, 1)
        }

class DatabaseQuota:
    """Manages database size quotas and cleanup"""

    def __init__(self, db_path: Union[str, Path]):
        self.db_path = Path(db_path)

    def check_database_size(self) -> None:
        """Check if database size exceeds quota"""
        if self.db_path.exists():
            size = self.db_path.stat().st_size
            if size > MAX_DATABASE_SIZE:
                logger.warning(
                    f"Database size {size} bytes exceeds quota {MAX_DATABASE_SIZE} bytes"
                )
                self._cleanup_old_entries()

    def _cleanup_old_entries(self) -> None:
        """Remove old entries to free space"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get table sizes
                cursor = conn.execute("""
                    SELECT name FROM sqlite_master
                    WHERE type='table' AND name NOT LIKE 'sqlite_%'
                """)
                tables = [row[0] for row in cursor.fetchall()]

                for table in tables:
                    # Delete entries older than 90 days with low usage
                    cursor = conn.execute(f"""
                        DELETE FROM {table}
                        WHERE created_at < datetime('now', '-90 days')
                        AND (usage_count < 5 OR usage_count IS NULL)
                    """)
                    deleted = cursor.rowcount
                    if deleted > 0:
                        logger.info(f"Deleted {deleted} old entries from {table}")

                # Vacuum to reclaim space
                conn.execute("VACUUM")
                conn.commit()

                # Check size again
                new_size = self.db_path.stat().st_size
                if new_size > MAX_DATABASE_SIZE:
                    logger.error(
                        f"Database still too large after cleanup: {new_size} bytes"
                    )
                    # Emergency: delete oldest entries regardless of usage
                    for table in tables:
                        cursor = conn.execute(f"""
                            DELETE FROM {table}
                            WHERE rowid IN (
                                SELECT rowid FROM {table}
                                ORDER BY created_at ASC
                                LIMIT 1000
                            )
                        """)
                        deleted = cursor.rowcount
                        if deleted > 0:
                            logger.warning(
                                f"Emergency cleanup: deleted {deleted} entries from {table}"
                            )
                    conn.execute("VACUUM")
                    conn.commit()

        except sqlite3.Error as e:
            logger.error(f"Failed to cleanup database: {e}")

class InputSanitizer:
    """Sanitizes user inputs"""

    @staticmethod
    def sanitize_query(query: str) -> str:
        """Sanitize search query"""
        if not isinstance(query, str):
            raise SecurityError("Query must be a string")

        # Remove control characters
        query = ''.join(char for char in query if ord(char) >= 32 or char in '\t\n\r')

        # Limit length
        if len(query) > 1000:
            raise SecurityError(f"Query too long: {len(query)} > 1000")

        # Check for SQL injection patterns
        sql_patterns = ['--', '/*', '*/', 'xp_', 'sp_', 'DROP', 'DELETE', 'INSERT', 'UPDATE']
        upper_query = query.upper()
        for pattern in sql_patterns:
            if pattern in upper_query:
                raise SecurityError(f"Suspicious SQL pattern in query: {pattern}")

        return query.strip()

    @staticmethod
    def sanitize_file_type(file_type: str) -> str:
        """Sanitize file type"""
        if not isinstance(file_type, str):
            raise SecurityError("File type must be a string")

        # Only allow alphanumeric characters and common extensions
        import re
        if not re.match(r'^[a-zA-Z0-9._-]+$', file_type):
            raise SecurityError(f"Invalid file type format: {file_type}")

        return file_type.lower().strip()

    @staticmethod
    def sanitize_pattern_id(pattern_id: str) -> str:
        """Sanitize pattern ID"""
        if not isinstance(pattern_id, str):
            raise SecurityError("Pattern ID must be a string")

        # Only allow specific pattern ID format
        import re
        if not re.match(r'^pattern_[a-f0-9]{16}$', pattern_id):
            raise SecurityError(f"Invalid pattern ID format: {pattern_id}")

        return pattern_id

@contextmanager
def security_context(base_path: Union[str, Path], operation: str = "unknown"):
    """
    Context manager for security operations

    Usage:
        with security_context("/safe/path") as (validator, monitor):
            safe_path = validator.validate_path(user_input)
            monitor.check_file_size(safe_path)
            # ... perform operation ...
    """
    validator = PathValidator(base_path)
    monitor = ResourceMonitor()

    logger.info(f"Starting security context for operation: {operation}")

    try:
        yield validator, monitor
        stats = monitor.get_stats()
        logger.info(
            f"Operation '{operation}' completed: "
            f"files={stats['files_processed']}, "
            f"bytes={stats['bytes_processed']}, "
            f"time={stats['elapsed_seconds']:.2f}s"
        )
    except SecurityError as e:
        logger.error(f"Security violation in operation '{operation}': {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in operation '{operation}': {e}")
        raise

# Utility functions
def safe_file_read(file_path: Path, max_size: int = MAX_FILE_SIZE) -> str:
    """Safely read file with size limits"""
    try:
        size = file_path.stat().st_size
        if size > max_size:
            raise SecurityError(f"File exceeds size limit: {size} > {max_size}")

        with open(file_path, 'rb') as f:
            content = f.read(max_size)

            # Check for incomplete read
            if len(content) < size:
                raise SecurityError("File read was incomplete - possible truncation")

        # Decode with error handling
        try:
            return content.decode('utf-8')
        except UnicodeDecodeError as e:
            # Try with latin-1 as fallback
            try:
                return content.decode('latin-1')
            except UnicodeDecodeError:
                raise SecurityError(f"Unable to decode file: {e}")

    except OSError as e:
        raise SecurityError(f"Failed to read file: {e}")

def hash_file_content(content: str) -> str:
    """Generate secure hash of file content"""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

def validate_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and sanitize metadata"""
    if not isinstance(metadata, dict):
        raise SecurityError("Metadata must be a dictionary")

    # Remove any potentially dangerous keys
    dangerous_keys = ['__proto__', 'constructor', 'prototype']
    sanitized = {}

    for key, value in metadata.items():
        if key in dangerous_keys:
            logger.warning(f"Skipping dangerous metadata key: {key}")
            continue

        # Only allow simple types
        if isinstance(value, (str, int, float, bool)):
            sanitized[key] = value
        elif isinstance(value, list):
            # Sanitize lists recursively
            sanitized[key] = [str(item) for item in value[:100]]  # Limit list size
        elif isinstance(value, dict):
            # Sanitize nested dicts recursively
            sanitized[key] = validate_metadata(value)
        else:
            # Convert other types to string
            sanitized[key] = str(value)[:1000]  # Limit string length

    return sanitized

# Initialize logging
def init_security_logging(level: str = "INFO"):
    """Initialize security logging"""
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stderr),
            logging.FileHandler('/tmp/cfn-security.log')
        ]
    )

# Auto-initialize on import
init_security_logging()