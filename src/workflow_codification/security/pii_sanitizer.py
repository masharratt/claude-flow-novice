"""
PII (Personally Identifiable Information) Sanitization Module
Removes sensitive data from logs, traces, and error messages for GDPR compliance
"""
import re
from typing import Dict, Any


class PIISanitizer:
    """Sanitizes text and traces by redacting personally identifiable information"""

    # Patterns for various PII types
    EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
    API_KEY_PATTERN = re.compile(r"\b[A-Za-z0-9]{32,}\b")
    PASSWORD_PATTERN = re.compile(
        r"(password|passwd|pwd)[\"']?\s*[:=]\s*[\"']?([^\"'\s]+)", re.IGNORECASE
    )
    CREDIT_CARD_PATTERN = re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b")
    IP_PATTERN = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")

    @staticmethod
    def sanitize_text(text: str) -> str:
        """
        Sanitize text by redacting PII

        Args:
            text: Text to sanitize

        Returns:
            Sanitized text with PII redacted
        """
        sanitized = text

        # Redact emails
        sanitized = PIISanitizer.EMAIL_PATTERN.sub("[EMAIL_REDACTED]", sanitized)

        # Redact API keys
        sanitized = PIISanitizer.API_KEY_PATTERN.sub("[API_KEY_REDACTED]", sanitized)

        # Redact passwords
        sanitized = PIISanitizer.PASSWORD_PATTERN.sub(
            r"\1=[PASSWORD_REDACTED]", sanitized
        )

        # Redact credit cards
        sanitized = PIISanitizer.CREDIT_CARD_PATTERN.sub("[CARD_REDACTED]", sanitized)

        # Mask IP addresses (keep first octet for debugging)
        def mask_ip(match):
            ip = match.group(0)
            parts = ip.split(".")
            return f"{parts[0]}.xxx.xxx.xxx"

        sanitized = PIISanitizer.IP_PATTERN.sub(mask_ip, sanitized)

        return sanitized

    @staticmethod
    def sanitize_trace(trace: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize execution trace by redacting PII in error messages

        Args:
            trace: Execution trace dictionary

        Returns:
            Sanitized trace dictionary
        """
        sanitized = trace.copy()

        # Sanitize error message at root level
        if "error_message" in sanitized and isinstance(sanitized["error_message"], str):
            sanitized["error_message"] = PIISanitizer.sanitize_text(
                sanitized["error_message"]
            )

        # Sanitize steps
        if "steps" in sanitized and isinstance(sanitized["steps"], list):
            sanitized_steps = []
            for step in sanitized["steps"]:
                sanitized_step = step.copy() if isinstance(step, dict) else step
                if isinstance(sanitized_step, dict) and "error_message" in sanitized_step:
                    sanitized_step["error_message"] = PIISanitizer.sanitize_text(
                        sanitized_step["error_message"]
                    )
                sanitized_steps.append(sanitized_step)
            sanitized["steps"] = sanitized_steps

        # Sanitize metadata
        if "metadata" in sanitized and isinstance(sanitized["metadata"], dict):
            sanitized_metadata = sanitized["metadata"].copy()
            for key, value in sanitized_metadata.items():
                if isinstance(value, str):
                    sanitized_metadata[key] = PIISanitizer.sanitize_text(value)
            sanitized["metadata"] = sanitized_metadata

        return sanitized

    @staticmethod
    def sanitize_dict(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively sanitize a dictionary for PII

        Args:
            data: Dictionary to sanitize

        Returns:
            Sanitized dictionary
        """
        if not isinstance(data, dict):
            return data

        sanitized = {}
        for key, value in data.items():
            if isinstance(value, str):
                sanitized[key] = PIISanitizer.sanitize_text(value)
            elif isinstance(value, dict):
                sanitized[key] = PIISanitizer.sanitize_dict(value)
            elif isinstance(value, list):
                sanitized[key] = [
                    PIISanitizer.sanitize_dict(item) if isinstance(item, dict)
                    else PIISanitizer.sanitize_text(item) if isinstance(item, str)
                    else item
                    for item in value
                ]
            else:
                sanitized[key] = value

        return sanitized

    @staticmethod
    def has_pii(text: str) -> bool:
        """
        Check if text contains PII

        Args:
            text: Text to check

        Returns:
            True if PII is detected
        """
        if PIISanitizer.EMAIL_PATTERN.search(text):
            return True
        if PIISanitizer.API_KEY_PATTERN.search(text):
            return True
        if PIISanitizer.PASSWORD_PATTERN.search(text):
            return True
        if PIISanitizer.CREDIT_CARD_PATTERN.search(text):
            return True
        if PIISanitizer.IP_PATTERN.search(text):
            return True
        return False
