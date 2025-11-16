"""
Backoff Strategy Module
Sprint 2.1 - Self-Healing Retry Wrapper

Implements exponential, linear, and constant backoff strategies.
"""

import time


class BackoffStrategy:
    """
    Calculates backoff delays for retry attempts

    Strategies:
    - exponential: 2^(attempt-1) * base_delay
    - linear: attempt * base_delay
    - constant: base_delay

    Example (base_delay=2.0, exponential):
    - Attempt 1: 2 seconds
    - Attempt 2: 4 seconds
    - Attempt 3: 8 seconds
    """

    def __init__(self, base_delay: float = 2.0):
        """
        Initialize backoff strategy

        Args:
            base_delay: Base delay in seconds (default: 2.0)
        """
        self.base_delay = base_delay

    def calculate_delay(self, attempt: int, strategy: str = "exponential") -> float:
        """
        Calculate backoff delay for given attempt

        Args:
            attempt: Attempt number (1-indexed)
            strategy: Backoff strategy ('exponential', 'linear', or 'constant')

        Returns:
            Delay in seconds

        Raises:
            ValueError: If strategy is unknown
        """
        if strategy == "exponential":
            # 2^(attempt-1) * base_delay
            return self.base_delay * (2 ** (attempt - 1))

        elif strategy == "linear":
            # attempt * base_delay
            return self.base_delay * attempt

        elif strategy == "constant":
            # Always base_delay
            return self.base_delay

        else:
            raise ValueError(f"Unknown backoff strategy: {strategy}")

    def sleep(self, attempt: int, strategy: str = "exponential"):
        """
        Sleep for calculated backoff delay

        Args:
            attempt: Attempt number (1-indexed)
            strategy: Backoff strategy ('exponential', 'linear', or 'constant')
        """
        delay = self.calculate_delay(attempt, strategy)
        time.sleep(delay)
