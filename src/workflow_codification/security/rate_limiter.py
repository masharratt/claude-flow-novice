"""
Rate limiting module
Implements sliding window rate limiting for per-user and per-IP restrictions
"""
import time
from typing import Optional, Tuple
from ..redis.client import RedisClient


class RateLimiter:
    """
    Rate limiter using Redis-backed sliding window algorithm
    - Per-user limit: 100 requests/minute
    - Per-IP limit: 200 requests/minute
    """

    def __init__(self):
        """Initialize rate limiter with Redis client"""
        self.redis = RedisClient().get_client()

    def check_rate_limit(
        self,
        identifier: str,
        limit: int = 100,
        window_seconds: int = 60,
        prefix: str = "rate_limit",
    ) -> Tuple[bool, Optional[int]]:
        """
        Check if request is within rate limit using sliding window algorithm

        Args:
            identifier: User ID or IP address
            limit: Max requests per window
            window_seconds: Time window in seconds
            prefix: Redis key prefix

        Returns:
            (allowed: bool, retry_after: Optional[int])
            allowed: True if within limit
            retry_after: Seconds to wait if rate limited
        """
        key = f"{prefix}:{identifier}"
        current_time = int(time.time())
        window_start = current_time - window_seconds

        # Remove old entries outside window
        self.redis.zremrangebyscore(key, 0, window_start)

        # Count requests in current window
        current_count = self.redis.zcard(key)

        if current_count >= limit:
            # Rate limited - calculate retry_after
            oldest_entries = self.redis.zrange(key, 0, 0, withscores=True)
            if oldest_entries:
                oldest_timestamp = float(oldest_entries[0][1])
                retry_after = int(oldest_timestamp + window_seconds - current_time)
                return False, max(1, retry_after)  # At least 1 second
            return False, window_seconds

        # Add current request
        self.redis.zadd(key, {str(current_time): current_time})

        # Set expiry on key
        self.redis.expire(key, window_seconds)

        return True, None

    def check_user_rate_limit(self, user_id: str) -> Tuple[bool, Optional[int]]:
        """
        Check user rate limit (100 requests/minute)

        Args:
            user_id: User identifier

        Returns:
            (allowed: bool, retry_after: Optional[int])
        """
        return self.check_rate_limit(
            user_id, limit=100, window_seconds=60, prefix="rate_limit_user"
        )

    def check_ip_rate_limit(self, ip_address: str) -> Tuple[bool, Optional[int]]:
        """
        Check IP rate limit (200 requests/minute)

        Args:
            ip_address: IP address

        Returns:
            (allowed: bool, retry_after: Optional[int])
        """
        return self.check_rate_limit(
            ip_address, limit=200, window_seconds=60, prefix="rate_limit_ip"
        )

    def reset_limit(self, identifier: str, prefix: str = "rate_limit") -> bool:
        """
        Reset rate limit for an identifier (e.g., after ban expires)

        Args:
            identifier: User ID or IP address
            prefix: Redis key prefix

        Returns:
            True if reset successfully
        """
        key = f"{prefix}:{identifier}"
        self.redis.delete(key)
        return True

    def get_current_count(
        self, identifier: str, prefix: str = "rate_limit", window_seconds: int = 60
    ) -> int:
        """
        Get current request count in the window

        Args:
            identifier: User ID or IP address
            prefix: Redis key prefix
            window_seconds: Time window in seconds

        Returns:
            Number of requests in current window
        """
        key = f"{prefix}:{identifier}"
        current_time = int(time.time())
        window_start = current_time - window_seconds

        # Remove old entries outside window
        self.redis.zremrangebyscore(key, 0, window_start)

        # Return current count
        return self.redis.zcard(key)
