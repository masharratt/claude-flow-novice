import redis
import time
import json
from typing import Optional, Union, Dict

class PriorityWakeMechanism:
    """
    Implements priority-based wake-up mechanism using Redis Sorted Sets
    Supports both legacy and new wake-up strategies
    """

    PRIORITY_MULTIPLIER = 1_000_000
    PRIORITY_LEVELS = {
        "critical": (0, 10),
        "high": (11, 30),
        "medium": (31, 60),
        "low": (61, 100)
    }

    def __init__(self,
                 redis_client: redis.Redis,
                 config_path: str = '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/redis-coordination/config.json'):
        self.redis = redis_client
        self.config = self._load_config(config_path)

    def _load_config(self, config_path: str) -> Dict:
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return {"features": {"enablePriorityWake": {"default": False}}}

    def calculate_score(self, priority_level: str) -> float:
        """
        Calculate wake-up score based on timestamp and priority

        Args:
            priority_level (str): Priority of the wake-up message

        Returns:
            float: Calculated score for sorted set insertion
        """
        now = time.time()
        priority_range = self.PRIORITY_LEVELS.get(priority_level, (50, 70))
        priority_midpoint = sum(priority_range) / 2

        return now + (priority_midpoint * self.PRIORITY_MULTIPLIER)

    def enqueue_wake_message(
        self,
        task_id: str,
        agent_id: str,
        wake_message: str,
        priority_level: str = "medium"
    ) -> bool:
        """
        Enqueue a wake message with priority

        Args:
            task_id (str): Unique task identifier
            agent_id (str): Agent identifier
            wake_message (str): Message to be processed
            priority_level (str, optional): Priority of message. Defaults to "medium".

        Returns:
            bool: Whether message was successfully enqueued
        """
        if not self._is_priority_wake_enabled():
            # Fallback to traditional LPUSH
            self.redis.lpush(f"swarm:{task_id}:{agent_id}:wake", wake_message)
            return True

        score = self.calculate_score(priority_level)
        key = f"swarm:{task_id}:wake-queue"

        try:
            self.redis.zadd(key, {wake_message: score})
            return True
        except Exception as e:
            print(f"Wake message enqueue failed: {e}")
            return False

    def dequeue_wake_message(
        self,
        task_id: str,
        timeout: int = 0
    ) -> Optional[Union[str, tuple]]:
        """
        Dequeue highest priority wake message

        Args:
            task_id (str): Unique task identifier
            timeout (int, optional): Blocking timeout. Defaults to 0 (indefinite wait).

        Returns:
            Optional message or None if no message available
        """
        if not self._is_priority_wake_enabled():
            # Fallback to traditional BLPOP
            return self.redis.blpop(f"swarm:{task_id}:*:wake", timeout)

        key = f"swarm:{task_id}:wake-queue"

        try:
            result = self.redis.bzpopmin(key, timeout)
            return result[1] if result else None
        except Exception as e:
            print(f"Wake message dequeue failed: {e}")
            return None

    def _is_priority_wake_enabled(self) -> bool:
        """
        Check if priority wake mechanism is enabled in configuration

        Returns:
            bool: Whether priority wake is enabled
        """
        return self.config.get('features', {}).get('enablePriorityWake', {}).get('default', False)

def main():
    # Example usage
    redis_client = redis.Redis(host='localhost', port=6379, db=0)
    pwm = PriorityWakeMechanism(redis_client)

    # Enqueue messages with different priorities
    pwm.enqueue_wake_message("task123", "agent-1", "Critical update", "critical")
    pwm.enqueue_wake_message("task123", "agent-2", "Standard update", "medium")

    # Dequeue messages (will return critical message first)
    message = pwm.dequeue_wake_message("task123")
    print(f"Received message: {message}")

if __name__ == "__main__":
    main()