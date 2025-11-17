"""
Authentication and Authorization Management Module
Handles API key validation, token expiration, and access control
"""
import re
import time
from typing import Optional
from ..redis.client import RedisClient


class AuthManager:
    """Manages API authentication and token validation"""

    # API Key format: 32 alphanumeric characters
    API_KEY_FORMAT = re.compile(r"^[A-Za-z0-9]{32}$")

    # Token TTL in seconds (default: 1 hour)
    DEFAULT_TOKEN_TTL = 3600

    def __init__(self):
        """Initialize auth manager with Redis client"""
        self.redis = RedisClient().get_client()

    def validate_api_key(self, api_key: str) -> bool:
        """
        Validate API key format and existence

        Args:
            api_key: API key to validate

        Returns:
            True if valid API key format
        """
        if not api_key:
            return False

        if len(api_key) != 32:
            return False

        if not self.API_KEY_FORMAT.match(api_key):
            return False

        return True

    def validate_token(self, token: str, ttl: int = None) -> bool:
        """
        Validate token and check expiration

        Args:
            token: Token to validate
            ttl: Token time-to-live in seconds (uses default if None)

        Returns:
            True if token is valid and not expired
        """
        if not token:
            return False

        try:
            # Get token from Redis
            stored_token = self.redis.get(f"token:{token}")

            if not stored_token:
                return False

            # Parse expiration time
            expiration_time = float(stored_token.decode())

            # Check if token is expired
            current_time = time.time()
            if current_time > expiration_time:
                return False

            return True

        except (ValueError, AttributeError):
            return False

    def generate_token(self, identifier: str, ttl: int = None) -> str:
        """
        Generate and store a new token

        Args:
            identifier: User or API identifier
            ttl: Token time-to-live in seconds

        Returns:
            Generated token
        """
        if ttl is None:
            ttl = self.DEFAULT_TOKEN_TTL

        import secrets
        import hashlib

        # Generate random token
        random_token = secrets.token_hex(32)

        # Create token hash for storage
        token_hash = hashlib.sha256(random_token.encode()).hexdigest()

        # Calculate expiration time
        expiration_time = time.time() + ttl

        # Store token in Redis with expiration
        key = f"token:{token_hash}"
        self.redis.setex(key, ttl, str(expiration_time))

        # Also store mapping from identifier to token for revocation
        self.redis.lpush(f"user_tokens:{identifier}", token_hash)
        self.redis.expire(f"user_tokens:{identifier}", ttl)

        return token_hash

    def revoke_token(self, token: str) -> bool:
        """
        Revoke a token

        Args:
            token: Token to revoke

        Returns:
            True if revoked successfully
        """
        key = f"token:{token}"
        self.redis.delete(key)
        return True

    def revoke_all_user_tokens(self, identifier: str) -> bool:
        """
        Revoke all tokens for a user

        Args:
            identifier: User identifier

        Returns:
            True if all tokens revoked
        """
        key = f"user_tokens:{identifier}"
        tokens = self.redis.lrange(key, 0, -1)

        for token in tokens:
            self.revoke_token(token.decode())

        self.redis.delete(key)
        return True

    def get_token_expiration(self, token: str) -> Optional[float]:
        """
        Get token expiration time

        Args:
            token: Token to check

        Returns:
            Expiration timestamp or None if token doesn't exist
        """
        key = f"token:{token}"
        stored_token = self.redis.get(key)

        if not stored_token:
            return None

        try:
            return float(stored_token.decode())
        except (ValueError, AttributeError):
            return None

    def is_token_expired(self, token: str) -> bool:
        """
        Check if token is expired

        Args:
            token: Token to check

        Returns:
            True if token is expired
        """
        expiration = self.get_token_expiration(token)

        if expiration is None:
            return True

        return time.time() > expiration
