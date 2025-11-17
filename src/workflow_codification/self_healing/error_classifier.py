"""
Error Classification Module
Sprint 2.1 - Self-Healing Retry Wrapper

Classifies execution errors as retriable, non-retriable, or success.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Optional


class ErrorType(Enum):
    """Classification of execution errors"""
    SUCCESS = "success"
    RETRIABLE = "retriable"
    NON_RETRIABLE = "non_retriable"


@dataclass
class ExecutionResult:
    """
    Result of skill execution

    Attributes:
        exit_code: Process exit code
        stdout: Standard output
        stderr: Standard error
        duration_seconds: Execution duration
        error_message: Optional error message
    """
    exit_code: int
    stdout: str
    stderr: str
    duration_seconds: float
    error_message: Optional[str] = None

    @property
    def is_success(self) -> bool:
        """Check if execution succeeded"""
        return self.exit_code == 0

    @property
    def error_type(self) -> ErrorType:
        """Classify the error type"""
        return ErrorClassifier.classify_error(self.exit_code)


class ErrorClassifier:
    """
    Classifies execution errors for retry decisions

    Retriable Errors:
    - 124: Timeout
    - 7: Connection failed
    - 110: Timeout
    - 503: Service unavailable

    Non-Retriable Errors:
    - 1: Validation error
    - 2: Precondition failed
    - 127: Command not found
    - All unknown error codes

    Success:
    - 0: Successful execution
    """

    # Exit codes that indicate retriable errors
    RETRIABLE_EXIT_CODES = {124, 7, 110, 503}

    # Exit codes that indicate non-retriable errors
    NON_RETRIABLE_EXIT_CODES = {1, 2, 127}

    @classmethod
    def is_retriable(cls, exit_code: int) -> bool:
        """
        Check if error is retriable

        Args:
            exit_code: Process exit code

        Returns:
            True if error is retriable, False otherwise
        """
        if exit_code == 0:
            return False
        return exit_code in cls.RETRIABLE_EXIT_CODES

    @classmethod
    def is_non_retriable(cls, exit_code: int) -> bool:
        """
        Check if error is non-retriable

        Args:
            exit_code: Process exit code

        Returns:
            True if error is non-retriable, False otherwise
        """
        return exit_code in cls.NON_RETRIABLE_EXIT_CODES

    @classmethod
    def classify_error(cls, exit_code: int) -> ErrorType:
        """
        Classify error type

        Args:
            exit_code: Process exit code

        Returns:
            ErrorType classification
        """
        if exit_code == 0:
            return ErrorType.SUCCESS
        elif cls.is_retriable(exit_code):
            return ErrorType.RETRIABLE
        else:
            # Unknown error codes default to non-retriable
            return ErrorType.NON_RETRIABLE
