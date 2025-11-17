"""
Health Score Cache
Caches skill health scores with TTL for performance optimization
"""

import json
from typing import Optional, Dict, List, Any
from .client import RedisClient


class HealthScoreCache:
    """
    Health score caching layer with automatic expiration

    Key format: health_score:{skill_name}
    Value: JSON-serialized health score object
    TTL: 300 seconds (5 minutes)
    """

    def __init__(self):
        """Initialize cache with Redis client"""
        self.redis = RedisClient().get_client()
        self.ttl = 300  # 5 minutes
        self.key_prefix = "health_score:"

    def _make_key(self, skill_name: str) -> str:
        """Generate Redis key for skill"""
        return f"{self.key_prefix}{skill_name}"

    def get(self, skill_name: str) -> Optional[Dict[str, Any]]:
        """
        Get cached health score for skill

        Args:
            skill_name: Skill identifier

        Returns:
            dict: Health score object if cached, None otherwise
        """
        key = self._make_key(skill_name)
        value = self.redis.get(key)

        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                # Invalid JSON in cache, remove it
                self.redis.delete(key)
                return None

        return None

    def set(self, skill_name: str, health_score: Dict[str, Any]):
        """
        Cache health score with TTL

        Args:
            skill_name: Skill identifier
            health_score: Health score object to cache
        """
        key = self._make_key(skill_name)
        value = json.dumps(health_score)
        self.redis.setex(key, self.ttl, value)

    def invalidate(self, skill_name: str):
        """
        Remove health score from cache

        Args:
            skill_name: Skill identifier
        """
        key = self._make_key(skill_name)
        self.redis.delete(key)

    def get_all(self) -> List[str]:
        """
        Get all cached skill names

        Returns:
            list: List of skill names currently cached
        """
        pattern = f"{self.key_prefix}*"
        keys = self.redis.keys(pattern)

        # Extract skill names from keys
        skill_names = []
        for key in keys:
            if key.startswith(self.key_prefix):
                skill_name = key[len(self.key_prefix):]
                skill_names.append(skill_name)

        return skill_names

    def clear_all(self):
        """
        Clear all cached health scores
        Useful for testing and maintenance
        """
        pattern = f"{self.key_prefix}*"
        keys = self.redis.keys(pattern)

        if keys:
            self.redis.delete(*keys)

    def get_ttl(self, skill_name: str) -> int:
        """
        Get remaining TTL for cached skill

        Args:
            skill_name: Skill identifier

        Returns:
            int: Remaining TTL in seconds, -2 if key doesn't exist
        """
        key = self._make_key(skill_name)
        return self.redis.ttl(key)
