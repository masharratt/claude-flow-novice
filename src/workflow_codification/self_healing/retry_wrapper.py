"""
Retry Wrapper Module
Sprint 2.1 - Self-Healing Retry Wrapper

Main orchestration for automatic retry with circuit breaker integration.
"""

import subprocess
import time
from typing import Optional, Dict
from ..redis.circuit_breaker import CircuitBreaker
from .error_classifier import ErrorClassifier, ExecutionResult, ErrorType
from .backoff_strategy import BackoffStrategy
from .retry_config import RetryConfig, get_retry_config


class RetryWrapper:
    """
    Automatic retry wrapper with circuit breaker integration

    Features:
    - Automatic retry on retriable errors
    - Exponential backoff between retries
    - Circuit breaker protection
    - Per-skill configuration
    - Comprehensive execution metadata

    Example:
        wrapper = RetryWrapper()
        result = wrapper.execute_skill_with_retry(
            "cfn-coordination",
            ".claude/skills/cfn-coordination/execute.sh"
        )
        if result.is_success:
            print("Success!")
    """

    def __init__(self):
        """Initialize retry wrapper with circuit breaker"""
        self.circuit_breaker = CircuitBreaker()
        self.classifier = ErrorClassifier()

    def execute_skill_with_retry(
        self,
        skill_name: str,
        skill_command: str,
        params: Optional[Dict] = None,
        retry_config: Optional[RetryConfig] = None
    ) -> ExecutionResult:
        """
        Execute skill with automatic retry on retriable errors

        Args:
            skill_name: Name of skill to execute
            skill_command: Shell command to execute
            params: Optional parameters dict (not currently used)
            retry_config: Optional custom retry config

        Returns:
            ExecutionResult with final status
        """
        if retry_config is None:
            retry_config = get_retry_config(skill_name)

        if not retry_config.enabled:
            # Retry disabled, execute once only
            return self._execute_skill_direct(skill_name, skill_command)

        backoff = BackoffStrategy(retry_config.base_delay)
        attempt = 1

        while attempt <= retry_config.max_retries:
            # Check circuit breaker before each attempt
            if self.circuit_breaker.is_open(skill_name):
                return ExecutionResult(
                    exit_code=503,
                    stdout="",
                    stderr="Circuit breaker open - blocking execution",
                    duration_seconds=0.0,
                    error_message="Circuit breaker OPEN"
                )

            # Execute skill
            result = self._execute_skill_direct(skill_name, skill_command)

            # Success - close circuit and return
            if result.is_success:
                self.circuit_breaker.record_success(skill_name)
                return result

            # Failure - check if retriable
            error_type = result.error_type

            if error_type == ErrorType.NON_RETRIABLE:
                # Don't retry non-retriable errors
                self.circuit_breaker.record_failure(skill_name)
                return result

            # Retriable error
            self.circuit_breaker.record_failure(skill_name)

            # Check if more retries available
            if attempt < retry_config.max_retries:
                backoff.sleep(attempt, retry_config.backoff_strategy)
                attempt += 1
            else:
                # Max retries exhausted
                break

        # Return final failure
        return result

    def _execute_skill_direct(
        self,
        skill_name: str,
        skill_command: str
    ) -> ExecutionResult:
        """
        Execute skill command directly without retry

        Args:
            skill_name: Name of skill
            skill_command: Shell command to execute

        Returns:
            ExecutionResult with execution details
        """
        start_time = time.time()

        try:
            process = subprocess.run(
                skill_command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            duration = time.time() - start_time

            return ExecutionResult(
                exit_code=process.returncode,
                stdout=process.stdout,
                stderr=process.stderr,
                duration_seconds=duration,
                error_message=process.stderr if process.returncode != 0 else None
            )

        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            return ExecutionResult(
                exit_code=124,  # Timeout exit code
                stdout="",
                stderr="Command timed out after 300 seconds",
                duration_seconds=duration,
                error_message="Execution timeout"
            )

        except Exception as e:
            duration = time.time() - start_time
            return ExecutionResult(
                exit_code=1,
                stdout="",
                stderr=str(e),
                duration_seconds=duration,
                error_message=str(e)
            )
