"""
Circuit Breaker State Manager
Manages circuit breaker state transitions with Redis persistence
"""

import time
from typing import Dict, Optional
from .client import RedisClient


class CircuitBreaker:
    """
    Circuit breaker pattern implementation with Redis state storage

    State transitions:
    - CLOSED: Normal operation, failures are counted
    - OPEN: Too many failures, executions are blocked
    - HALF_OPEN: Cooldown expired, testing if service recovered

    Key format: circuit_breaker:{skill_name}
    Value: Hash with fields: status, consecutive_failures, opened_at
    """

    # Circuit breaker states
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

    def __init__(self):
        """Initialize circuit breaker manager"""
        self.redis = RedisClient().get_client()
        self.failure_threshold = 5  # Open circuit after N failures
        self.cooldown_seconds = 300  # 5 minutes cooldown before HALF_OPEN
        self.key_prefix = "circuit_breaker:"

    def _make_key(self, skill_name: str) -> str:
        """Generate Redis key for skill"""
        return f"{self.key_prefix}{skill_name}"

    def get_state(self, skill_name: str) -> Dict[str, any]:
        """
        Get current circuit breaker state

        Args:
            skill_name: Skill identifier

        Returns:
            dict: State with status, consecutive_failures, opened_at
        """
        key = self._make_key(skill_name)
        state = self.redis.hgetall(key)

        if not state:
            # No state exists, return default (CLOSED)
            return {
                "status": self.CLOSED,
                "consecutive_failures": 0,
                "opened_at": None
            }

        return {
            "status": state.get("status", self.CLOSED),
            "consecutive_failures": int(state.get("consecutive_failures", 0)),
            "opened_at": state.get("opened_at")
        }

    def is_open(self, skill_name: str) -> bool:
        """
        Check if circuit breaker is open (blocking executions)

        Automatically transitions to HALF_OPEN if cooldown expired

        Args:
            skill_name: Skill identifier

        Returns:
            bool: True if circuit is open, False otherwise
        """
        state = self.get_state(skill_name)

        if state["status"] == self.OPEN:
            # Check if cooldown period has passed
            if state["opened_at"]:
                opened_at = float(state["opened_at"])
                elapsed = time.time() - opened_at

                if elapsed >= self.cooldown_seconds:
                    # Transition to HALF_OPEN
                    self.set_half_open(skill_name)
                    return False

            return True

        return False

    def record_failure(self, skill_name: str):
        """
        Record execution failure and potentially open circuit

        Args:
            skill_name: Skill identifier
        """
        key = self._make_key(skill_name)
        state = self.get_state(skill_name)

        # Increment failure counter
        failures = state["consecutive_failures"] + 1
        self.redis.hset(key, "consecutive_failures", failures)

        # Open circuit if threshold reached
        if failures >= self.failure_threshold:
            self.redis.hset(key, "status", self.OPEN)
            self.redis.hset(key, "opened_at", time.time())

    def record_success(self, skill_name: str):
        """
        Record successful execution and close circuit

        Args:
            skill_name: Skill identifier
        """
        key = self._make_key(skill_name)

        # Reset to CLOSED state
        self.redis.hset(key, "status", self.CLOSED)
        self.redis.hset(key, "consecutive_failures", 0)
        self.redis.hdel(key, "opened_at")

    def set_half_open(self, skill_name: str):
        """
        Manually transition to HALF_OPEN state

        Args:
            skill_name: Skill identifier
        """
        key = self._make_key(skill_name)
        self.redis.hset(key, "status", self.HALF_OPEN)

    def reset(self, skill_name: str):
        """
        Reset circuit breaker to initial state (CLOSED)

        Args:
            skill_name: Skill identifier
        """
        key = self._make_key(skill_name)
        self.redis.delete(key)

    def get_all_circuits(self) -> Dict[str, Dict]:
        """
        Get state of all circuit breakers

        Returns:
            dict: Map of skill_name -> state
        """
        pattern = f"{self.key_prefix}*"
        keys = self.redis.keys(pattern)

        circuits = {}
        for key in keys:
            if key.startswith(self.key_prefix):
                skill_name = key[len(self.key_prefix):]
                circuits[skill_name] = self.get_state(skill_name)

        return circuits

    def clear_all(self):
        """
        Clear all circuit breaker states
        Useful for testing and maintenance
        """
        pattern = f"{self.key_prefix}*"
        keys = self.redis.keys(pattern)

        if keys:
            self.redis.delete(*keys)

    def is_closed(self, skill_name: str) -> bool:
        """
        Check if circuit breaker is closed (allowing executions)

        Args:
            skill_name: Skill identifier

        Returns:
            bool: True if circuit is closed, False otherwise
        """
        state = self.get_state(skill_name)
        return state["status"] == self.CLOSED

    def get_failure_count(self, skill_name: str) -> int:
        """
        Get current consecutive failure count

        Args:
            skill_name: Skill identifier

        Returns:
            int: Number of consecutive failures
        """
        state = self.get_state(skill_name)
        return state["consecutive_failures"]

    def open_circuit(self, skill_name: str):
        """
        Manually open circuit breaker (useful for testing)

        Args:
            skill_name: Skill identifier
        """
        key = self._make_key(skill_name)
        self.redis.hset(key, "status", self.OPEN)
        self.redis.hset(key, "opened_at", time.time())
        self.redis.hset(key, "consecutive_failures", self.failure_threshold)
