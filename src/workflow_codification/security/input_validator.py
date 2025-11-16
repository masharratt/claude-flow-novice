"""
Input validation and sanitization module
Prevents injection attacks, XSS, path traversal, and other input-based vulnerabilities
"""
import re
import os
from typing import Any


class InputValidator:
    """Validates and sanitizes user inputs against various attack vectors"""

    # Dangerous patterns to block - SQL Injection
    SQL_INJECTION_PATTERNS = [
        re.compile(r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)", re.IGNORECASE),
        re.compile(r"(--|\#|\/\*|\*\/|;)"),
        re.compile(r"('|\")(.*?)('|\")"),  # SQL string delimiters
    ]

    # Command Injection patterns
    COMMAND_INJECTION_PATTERNS = [
        re.compile(r"[;&|><`$()]"),
        re.compile(r"\$\{.*?\}"),  # Variable substitution
        re.compile(r"`.*?`"),  # Backticks
    ]

    # XSS patterns
    XSS_PATTERNS = [
        re.compile(r"<script", re.IGNORECASE),
        re.compile(r"javascript:", re.IGNORECASE),
        re.compile(r"on\w+\s*=", re.IGNORECASE),  # Event handlers
    ]

    # Path Traversal patterns
    PATH_TRAVERSAL_PATTERNS = [
        re.compile(r"\.\./"),
        re.compile(r"\.\\."),
        re.compile(r"~"),
    ]

    @staticmethod
    def validate_skill_name(skill_name: str) -> bool:
        """
        Validate skill name (alphanumeric, dash, underscore only)

        Args:
            skill_name: Skill name to validate

        Returns:
            True if valid

        Raises:
            ValueError: If validation fails
        """
        if not skill_name:
            raise ValueError("Skill name cannot be empty")

        if len(skill_name) > 100:
            raise ValueError("Skill name too long (max 100 characters)")

        # Allow only alphanumeric, dash, underscore
        if not re.match(r"^[a-zA-Z0-9_\-]+$", skill_name):
            raise ValueError("Skill name contains invalid characters")

        return True

    @staticmethod
    def validate_command(command: str) -> bool:
        """
        Validate command for injection attacks

        Args:
            command: Command string to validate

        Returns:
            True if valid

        Raises:
            ValueError: If dangerous patterns detected
        """
        if not command:
            raise ValueError("Command cannot be empty")

        if len(command) > 10000:
            raise ValueError("Command too long (max 10000 characters)")

        # Check for null bytes
        if "\x00" in command:
            raise ValueError("Null bytes detected in command")

        # Check for command injection patterns
        for pattern in InputValidator.COMMAND_INJECTION_PATTERNS:
            if pattern.search(command):
                raise ValueError(f"Dangerous pattern detected in command: {pattern.pattern}")

        # Check for XSS patterns
        for pattern in InputValidator.XSS_PATTERNS:
            if pattern.search(command):
                raise ValueError(f"XSS pattern detected in command: {pattern.pattern}")

        return True

    @staticmethod
    def validate_sql_parameter(param: Any) -> bool:
        """
        Validate SQL parameter for injection attacks

        Args:
            param: Parameter value

        Returns:
            True if valid

        Raises:
            ValueError: If SQL injection patterns detected
        """
        param_str = str(param)

        if not param_str:
            raise ValueError("Parameter cannot be empty")

        # Check for SQL injection patterns
        for pattern in InputValidator.SQL_INJECTION_PATTERNS:
            if pattern.search(param_str):
                raise ValueError(f"SQL injection pattern detected: {pattern.pattern}")

        return True

    @staticmethod
    def sanitize_output(output: str) -> str:
        """
        Sanitize output to prevent XSS

        Args:
            output: Output string

        Returns:
            Sanitized output
        """
        sanitized = output
        sanitized = sanitized.replace("<", "&lt;")
        sanitized = sanitized.replace(">", "&gt;")
        sanitized = sanitized.replace('"', "&quot;")
        sanitized = sanitized.replace("'", "&#x27;")
        return sanitized

    @staticmethod
    def validate_file_path(file_path: str, allowed_base: str = None) -> bool:
        """
        Validate file path to prevent path traversal

        Args:
            file_path: File path to validate
            allowed_base: Optional base directory restriction

        Returns:
            True if valid

        Raises:
            ValueError: If path traversal detected
        """
        if not file_path:
            raise ValueError("File path cannot be empty")

        # Check for null bytes
        if "\x00" in file_path:
            raise ValueError("Null bytes detected in file path")

        # Check for path traversal patterns
        for pattern in InputValidator.PATH_TRAVERSAL_PATTERNS:
            if pattern.search(file_path):
                raise ValueError("Path traversal pattern detected")

        # If base directory specified, ensure path is within it
        if allowed_base:
            abs_path = os.path.abspath(file_path)
            abs_base = os.path.abspath(allowed_base)

            if not abs_path.startswith(abs_base):
                raise ValueError(
                    f"Path {file_path} is outside allowed base {allowed_base}"
                )

        return True
