"""
Redis Connection Manager
Handles connection pooling, health checks, and configuration
"""

import os
import redis
from redis.connection import ConnectionPool
from typing import Optional


class RedisClient:
    """
    Redis client with connection pooling and health monitoring

    Configuration via environment variables:
    - REDIS_HOST: Redis server host (default: localhost)
    - REDIS_PORT: Redis server port (default: 6379)
    - REDIS_DB: Redis database number (default: 0)
    - REDIS_PASSWORD: Redis password (optional)
    - REDIS_MAX_CONNECTIONS: Max connection pool size (default: 50)
    """

    _instance: Optional['RedisClient'] = None
    _pool: Optional[ConnectionPool] = None
    _client: Optional[redis.Redis] = None

    def __new__(cls):
        """Singleton pattern to reuse connection pool"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize Redis connection pool"""
        if self._pool is None:
            # Read configuration from environment
            host = os.getenv('REDIS_HOST', 'localhost')
            port = int(os.getenv('REDIS_PORT', '6379'))
            db = int(os.getenv('REDIS_DB', '0'))
            password = os.getenv('REDIS_PASSWORD', None)
            max_connections = int(os.getenv('REDIS_MAX_CONNECTIONS', '50'))

            # Create connection pool
            self._pool = ConnectionPool(
                host=host,
                port=port,
                db=db,
                password=password,
                max_connections=max_connections,
                decode_responses=True,  # Automatically decode bytes to strings
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )

            # Create Redis client from pool
            self._client = redis.Redis(connection_pool=self._pool)

    def ping(self) -> bool:
        """
        Health check: Verify Redis connection is alive

        Returns:
            bool: True if Redis is reachable, False otherwise
        """
        try:
            return self._client.ping()
        except (redis.ConnectionError, redis.TimeoutError):
            return False

    def get_client(self) -> redis.Redis:
        """
        Get Redis client instance

        Returns:
            redis.Redis: Redis client with connection pooling
        """
        return self._client

    def close(self):
        """Close connection pool (cleanup)"""
        if self._pool:
            self._pool.disconnect()
            self._pool = None
            self._client = None
