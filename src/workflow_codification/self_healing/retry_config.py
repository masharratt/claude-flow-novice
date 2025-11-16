"""
Retry Configuration Module
Sprint 2.1 - Self-Healing Retry Wrapper

Per-skill retry configuration with defaults.
"""

from dataclasses import dataclass
from typing import Dict


@dataclass
class RetryConfig:
    """
    Retry configuration for skill execution

    Attributes:
        max_retries: Maximum number of retry attempts (default: 3)
        base_delay: Base delay for backoff in seconds (default: 2.0)
        backoff_strategy: Backoff strategy ('exponential', 'linear', 'constant')
        enabled: Whether retry is enabled (default: True)
    """
    max_retries: int = 3
    base_delay: float = 2.0
    backoff_strategy: str = "exponential"
    enabled: bool = True

    @classmethod
    def from_dict(cls, data: dict) -> 'RetryConfig':
        """
        Create config from dictionary

        Args:
            data: Configuration dictionary

        Returns:
            RetryConfig instance
        """
        return cls(
            max_retries=data.get("max_retries", 3),
            base_delay=data.get("base_delay", 2.0),
            backoff_strategy=data.get("backoff_strategy", "exponential"),
            enabled=data.get("enabled", True)
        )

    def to_dict(self) -> dict:
        """
        Convert config to dictionary

        Returns:
            Configuration as dictionary
        """
        return {
            "max_retries": self.max_retries,
            "base_delay": self.base_delay,
            "backoff_strategy": self.backoff_strategy,
            "enabled": self.enabled
        }


# Default retry configuration
DEFAULT_CONFIG = RetryConfig()


# Per-skill retry configurations
SKILL_CONFIGS: Dict[str, RetryConfig] = {
    # Coordination skills: Higher retries, lower delay
    "cfn-coordination": RetryConfig(
        max_retries=5,
        base_delay=1.0,
        backoff_strategy="exponential",
        enabled=True
    ),

    # Docker builds: Fewer retries, longer delay
    "docker-build": RetryConfig(
        max_retries=2,
        base_delay=5.0,
        backoff_strategy="exponential",
        enabled=True
    ),

    # Database migrations: NEVER retry (too risky)
    "database-migration": RetryConfig(
        max_retries=3,
        base_delay=2.0,
        backoff_strategy="exponential",
        enabled=False
    ),
}


def get_retry_config(skill_name: str) -> RetryConfig:
    """
    Get retry configuration for skill

    Args:
        skill_name: Name of skill

    Returns:
        RetryConfig for skill (falls back to DEFAULT_CONFIG)
    """
    return SKILL_CONFIGS.get(skill_name, DEFAULT_CONFIG)
