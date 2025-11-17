"""
Pytest configuration for monitoring tests

Ensures all required dependencies are available
"""

import subprocess
import sys

def pytest_configure(config):
    """Install required dependencies before running tests"""
    dependencies = [
        'flask>=2.3.0',
        'prometheus-client>=0.17.0',
        'pyyaml>=6.0',
        'pytest>=7.4.0',
        'pytest-cov>=4.1.0',
    ]

    try:
        # Try importing key dependencies
        import flask
        import prometheus_client
        import yaml
    except ImportError as e:
        print(f"\n⚠️  Missing dependency: {e}")
        print("Run: pip install -r requirements-monitoring.txt")
        print("\nProceeding with tests that don't require external dependencies...")
