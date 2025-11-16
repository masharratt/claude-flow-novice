"""
Pytest configuration and fixtures for security test suite
"""
import pytest
import sys
import os

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../../src'))


@pytest.fixture
def cleanup_redis(monkeypatch):
    """Fixture to mock Redis for tests"""
    from unittest.mock import MagicMock, patch

    mock_redis = MagicMock()
    mock_client = MagicMock()

    with patch('src.workflow_codification.security.rate_limiter.RedisClient') as mock_rc:
        mock_rc.return_value.get_client.return_value = mock_client
        yield mock_client


@pytest.fixture
def temp_file_with_secret(tmp_path):
    """Fixture to create a temporary Python file with a secret"""
    test_file = tmp_path / "test.py"
    test_file.write_text("api_key = 'secret123456789'")
    return test_file


def pytest_configure(config):
    """Configure pytest with custom markers"""
    config.addinivalue_line(
        "markers", "security: mark test as security-focused"
    )
    config.addinivalue_line(
        "markers", "owasp: mark test as OWASP Top 10 validation"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
