#!/usr/bin/env python3
"""
Security tests for AST-Aware RuVector Accelerator
Tests path traversal, resource limits, and input validation
"""

import os
import sys
import tempfile
import shutil
import unittest
import numpy as np
from pathlib import Path

# Add the module to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from security import (
    SecurityError, PathValidator, ResourceMonitor, DatabaseQuota,
    InputSanitizer, safe_file_read, hash_file_content, validate_metadata,
    security_context
)

class TestPathValidator(unittest.TestCase):
    """Test path traversal protection"""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.validator = PathValidator(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_valid_paths(self):
        """Test valid paths are accepted"""
        # Create test file
        test_file = Path(self.temp_dir) / "test.txt"
        test_file.write_text("test content")

        # Test absolute path
        validated = self.validator.validate_path(test_file)
        self.assertEqual(str(validated), str(test_file.resolve()))

        # Test relative path
        os.chdir(self.temp_dir)
        validated = self.validator.validate_path("test.txt")
        self.assertEqual(str(validated), str(test_file.resolve()))

    def test_path_traversal_blocked(self):
        """Test path traversal attempts are blocked"""
        # Attempt to go outside base directory
        with self.assertRaises(SecurityError):
            self.validator.validate_path("../etc/passwd")

        with self.assertRaises(SecurityError):
            self.validator.validate_path(f"{self.temp_dir}/../../../etc/passwd")

        with self.assertRaises(SecurityError):
            self.validator.validate_path("/etc/passwd")

    def test_suspicious_patterns_blocked(self):
        """Test suspicious patterns are blocked"""
        with self.assertRaises(SecurityError):
            self.validator.validate_path("test${malicious}")

        with self.assertRaises(SecurityError):
            self.validator.validate_path("test\x00injection")

    def test_symlink_protection(self):
        """Test symlinks outside directory are blocked"""
        # Create symlink outside directory
        outside_file = Path(self.temp_dir).parent / "outside.txt"
        outside_file.write_text("outside content")

        symlink = Path(self.temp_dir) / "symlink.txt"
        symlink.symlink_to(outside_file)

        with self.assertRaises(SecurityError):
            self.validator.validate_path(symlink)

class TestResourceMonitor(unittest.TestCase):
    """Test resource limits enforcement"""

    def setUp(self):
        self.monitor = ResourceMonitor()

    def test_file_size_limit(self):
        """Test file size limits are enforced"""
        # Create large file
        large_file = Path(tempfile.mktemp())
        try:
            # Write 15MB (exceeds 10MB limit)
            with open(large_file, 'wb') as f:
                f.write(b'0' * (15 * 1024 * 1024))

            with self.assertRaises(SecurityError):
                self.monitor.check_file_size(large_file)
        finally:
            if large_file.exists():
                large_file.unlink()

    def test_batch_size_limit(self):
        """Test batch size limits are enforced"""
        # Test valid batch size
        self.monitor.check_batch_size(100)

        # Test invalid batch size
        with self.assertRaises(SecurityError):
            self.monitor.check_batch_size(2000)  # Exceeds 1000 limit

    def test_embedding_dimension_limit(self):
        """Test embedding dimension limits are enforced"""
        # Test valid dimension
        self.monitor.check_embedding_dimension(1536)

        # Test invalid dimension
        with self.assertRaises(SecurityError):
            self.monitor.check_embedding_dimension(10000)  # Exceeds 8192 limit

class TestInputSanitizer(unittest.TestCase):
    """Test input sanitization"""

    def test_query_sanitization(self):
        """Test query input sanitization"""
        # Valid query
        query = "test query"
        sanitized = InputSanitizer.sanitize_query(query)
        self.assertEqual(sanitized, "test query")

        # Query with control characters
        query = "test\x00query"
        sanitized = InputSanitizer.sanitize_query(query)
        self.assertEqual(sanitized, "testquery")

        # SQL injection attempt
        with self.assertRaises(SecurityError):
            InputSanitizer.sanitize_query("query; DROP TABLE users;")

    def test_file_type_sanitization(self):
        """Test file type sanitization"""
        # Valid file type
        ft = "py"
        sanitized = InputSanitizer.sanitize_file_type(ft)
        self.assertEqual(sanitized, "py")

        # Invalid file type
        with self.assertRaises(SecurityError):
            InputSanitizer.sanitize_file_type("py<script>")

    def test_pattern_id_sanitization(self):
        """Test pattern ID sanitization"""
        # Valid pattern ID
        pattern_id = "pattern_1234567890abcdef"
        sanitized = InputSanitizer.sanitize_pattern_id(pattern_id)
        self.assertEqual(sanitized, pattern_id)

        # Invalid pattern ID
        with self.assertRaises(SecurityError):
            InputSanitizer.sanitize_pattern_id("invalid_pattern")

    def test_metadata_validation(self):
        """Test metadata validation"""
        # Valid metadata
        metadata = {
            "file_size": 1000,
            "line_count": 50,
            "tags": ["test", "sample"]
        }
        validated = validate_metadata(metadata)
        self.assertEqual(validated["file_size"], 1000)

        # Remove dangerous keys
        dangerous = {
            "__proto__": {"malicious": True},
            "valid_key": "value"
        }
        validated = validate_metadata(dangerous)
        self.assertNotIn("__proto__", validated)
        self.assertIn("valid_key", validated)

class TestSafeFileOperations(unittest.TestCase):
    """Test safe file operations"""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_safe_file_read(self):
        """Test safe file reading"""
        # Create test file
        test_file = Path(self.temp_dir) / "test.txt"
        test_file.write_text("test content")

        # Read safely
        content = safe_file_read(test_file)
        self.assertEqual(content, "test content")

        # Test with size limit - expect SecurityError for file larger than limit
        with self.assertRaises(SecurityError):
            safe_file_read(test_file, max_size=5)

    def test_file_hash(self):
        """Test file content hashing"""
        # Create test file
        test_file = Path(self.temp_dir) / "test.txt"
        content = "test content"
        test_file.write_text(content)

        # Calculate hash
        file_hash = hash_file_content(content)
        self.assertEqual(len(file_hash), 64)  # SHA-256 length

        # Same content should produce same hash
        test_file2 = Path(self.temp_dir) / "test2.txt"
        test_file2.write_text(content)
        file_hash2 = hash_file_content(content)
        self.assertEqual(file_hash, file_hash2)

class TestDatabaseQuota(unittest.TestCase):
    """Test database quota management"""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test.db"
        self.quota = DatabaseQuota(self.db_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_quota_check(self):
        """Test database quota checking"""
        # Small database should pass
        self.quota.check_database_size()

        # Note: Testing actual quota enforcement would require creating a very large DB,
        # which is impractical in unit tests

class TestSecurityContext(unittest.TestCase):
    """Test security context manager"""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_security_context(self):
        """Test security context manager"""
        with security_context(self.temp_dir, "test_operation") as (validator, monitor):
            self.assertIsInstance(validator, PathValidator)
            self.assertIsInstance(monitor, ResourceMonitor)

            # Test operations within context
            test_file = Path(self.temp_dir) / "test.txt"
            test_file.write_text("test content")

            # Should be able to validate path
            validated = validator.validate_path(str(test_file))
            self.assertIsNotNone(validated)

class TestIntegration(unittest.TestCase):
    """Integration tests for security controls"""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_index_code_security(self):
        """Test index-code.sh security integration"""
        # This would test the actual index-code.sh script
        # For now, we'll test the Python components it uses

        # Test that suspicious paths are rejected
        validator = PathValidator(self.temp_dir)

        with self.assertRaises(SecurityError):
            validator.validate_path("../etc/passwd")

        # Test that large files are rejected
        monitor = ResourceMonitor()
        large_file = Path(self.temp_dir) / "large.txt"
        try:
            with open(large_file, 'wb') as f:
                f.write(b'0' * (15 * 1024 * 1024))  # 15MB

            with self.assertRaises(SecurityError):
                monitor.check_file_size(large_file)
        finally:
            if large_file.exists():
                large_file.unlink()

    def test_embeddings_manager_security(self):
        """Test embeddings manager security integration"""
        # Test dimension validation directly without importing full module
        from security import SecurityError

        # Test that invalid pattern IDs are rejected
        from security import InputSanitizer
        with self.assertRaises(SecurityError):
            InputSanitizer.sanitize_pattern_id("test_pattern")  # Invalid format

        # Test that valid pattern IDs are accepted
        valid_id = "pattern_1234567890abcdef"
        sanitized = InputSanitizer.sanitize_pattern_id(valid_id)
        self.assertEqual(sanitized, valid_id)

def run_security_tests():
    """Run all security tests"""
    print("\n🔒 Running Security Tests for AST-Aware RuVector Accelerator")
    print("=" * 60)

    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    test_classes = [
        TestPathValidator,
        TestResourceMonitor,
        TestInputSanitizer,
        TestSafeFileOperations,
        TestDatabaseQuota,
        TestSecurityContext,
        TestIntegration
    ]

    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "=" * 60)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")

    if result.failures:
        print("\n❌ Failures:")
        for test, traceback in result.failures:
            print(f"  - {test}: {traceback.split('AssertionError:')[-1].strip()}")

    if result.errors:
        print("\n⚠️ Errors:")
        for test, traceback in result.errors:
            print(f"  - {test}: {traceback.split('Exception:')[-1].strip()}")

    if result.wasSuccessful():
        print("\n✅ All security tests passed!")
        return True
    else:
        print("\n❌ Some security tests failed!")
        return False

if __name__ == "__main__":
    success = run_security_tests()
    sys.exit(0 if success else 1)