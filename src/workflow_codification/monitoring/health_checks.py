"""
Health check endpoints for Workflow Codification monitoring

Provides:
- /health - Overall system health status
- /ready - Readiness check (dependencies ready)
- /live - Liveness check (service is alive)
"""

from flask import Flask, jsonify
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class HealthCheckManager:
    """Manages health check status for the system."""

    def __init__(self):
        """Initialize health check manager."""
        self.health_status = "healthy"
        self.ready_status = True
        self.alive_status = True
        self.dependencies = {
            "prometheus_client": True,
            "flask": True,
            "database": True,
        }

    def get_health_status(self) -> Dict[str, Any]:
        """
        Get current health status.

        Returns health level: healthy, degraded, or unhealthy
        """
        # Determine overall health based on components
        if not all(self.dependencies.values()):
            self.health_status = "degraded"
        else:
            self.health_status = "healthy"

        return {
            "status": self.health_status,
            "dependencies": self.dependencies,
            "timestamp": self._get_timestamp(),
        }

    def get_readiness_status(self) -> Dict[str, Any]:
        """
        Get readiness status.

        Returns True if system is ready to serve traffic
        """
        ready = all(self.dependencies.values())
        self.ready_status = ready

        status_code = 200 if ready else 503

        return {
            "ready": ready,
            "dependencies": self.dependencies,
            "timestamp": self._get_timestamp(),
        }, status_code

    def get_liveness_status(self) -> Dict[str, Any]:
        """
        Get liveness status.

        Returns True if service process is running
        """
        return {
            "alive": True,
            "pid": self._get_process_id(),
            "timestamp": self._get_timestamp(),
        }, 200

    def update_dependency(self, name: str, status: bool):
        """Update the status of a dependency."""
        self.dependencies[name] = status
        logger.info(f"Dependency '{name}' status updated to {status}")

    @staticmethod
    def _get_timestamp():
        """Get current ISO 8601 timestamp."""
        from datetime import datetime
        return datetime.utcnow().isoformat() + "Z"

    @staticmethod
    def _get_process_id():
        """Get current process ID."""
        import os
        return os.getpid()


# Global health check manager
_health_manager = HealthCheckManager()


def create_health_check_app():
    """
    Create Flask app with health check endpoints.

    Returns:
        Flask application with health check routes
    """
    app = Flask(__name__)

    @app.route('/health', methods=['GET'])
    def health_check():
        """
        Overall health check endpoint.

        Returns:
            200: healthy status
            503: degraded or unhealthy status
        """
        status_data = _health_manager.get_health_status()

        if status_data['status'] == 'healthy':
            return jsonify(status_data), 200
        else:
            return jsonify(status_data), 503

    @app.route('/ready', methods=['GET'])
    def readiness_check():
        """
        Readiness check endpoint.

        Used by orchestrators to determine if service can accept traffic.

        Returns:
            200: Ready
            503: Not ready
        """
        status_data, status_code = _health_manager.get_readiness_status()
        return jsonify(status_data), status_code

    @app.route('/live', methods=['GET'])
    def liveness_check():
        """
        Liveness check endpoint.

        Used by orchestrators to determine if service should be restarted.

        Returns:
            200: Service is alive
        """
        status_data, status_code = _health_manager.get_liveness_status()
        return jsonify(status_data), status_code

    return app


def get_health_manager():
    """Get the global health check manager instance."""
    return _health_manager


if __name__ == '__main__':
    """Run health check service as standalone."""
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    app = create_health_check_app()

    logging.basicConfig(level=logging.INFO)
    logger.info(f"Starting health check service on port {port}")

    app.run(host='0.0.0.0', port=port, debug=False)
