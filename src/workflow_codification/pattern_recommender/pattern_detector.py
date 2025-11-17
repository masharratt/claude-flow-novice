"""
Pattern Detector
Identifies repeated workflow patterns by normalizing commands
"""
import re
from collections import Counter
from typing import List, Dict


class PatternDetector:
    """
    Detect repeated workflow patterns
    Normalizes dynamic values (UUIDs, timestamps) for pattern matching
    """

    # Regex patterns for normalization
    UUID_PATTERN = re.compile(
        r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        re.IGNORECASE
    )
    TIMESTAMP_PATTERN = re.compile(
        r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}'
    )

    @staticmethod
    def normalize_command(command: str) -> str:
        """
        Normalize command by replacing dynamic values

        Args:
            command: Raw command string

        Returns:
            Normalized command with dynamic values replaced
        """
        normalized = command

        # Replace UUIDs
        normalized = PatternDetector.UUID_PATTERN.sub('<UUID>', normalized)

        # Replace timestamps
        normalized = PatternDetector.TIMESTAMP_PATTERN.sub('<TIMESTAMP>', normalized)

        return normalized

    @staticmethod
    def normalize_sequence(sequence: List[str]) -> str:
        """
        Normalize and serialize command sequence

        Args:
            sequence: List of commands

        Returns:
            Normalized sequence string (for hashing/counting)
        """
        normalized_commands = [
            PatternDetector.normalize_command(cmd) for cmd in sequence
        ]
        return " → ".join(normalized_commands)

    @staticmethod
    def detect_patterns(
        workflows: List[List[str]],
        min_occurrences: int = 3
    ) -> List[Dict]:
        """
        Detect repeated workflow patterns

        Args:
            workflows: List of command sequences
            min_occurrences: Minimum repetitions to be considered a pattern

        Returns:
            List of detected patterns with frequency, sorted by frequency descending
        """
        # Normalize and count sequences
        sequence_counter = Counter()
        sequence_to_original = {}

        for workflow in workflows:
            # Only consider multi-step workflows (length >= 2)
            if len(workflow) >= 2:
                normalized = PatternDetector.normalize_sequence(workflow)
                sequence_counter[normalized] += 1

                # Keep first occurrence as representative
                if normalized not in sequence_to_original:
                    sequence_to_original[normalized] = workflow

        # Filter patterns with >= min_occurrences
        patterns = []
        for normalized_seq, count in sequence_counter.items():
            if count >= min_occurrences:
                patterns.append({
                    "pattern": sequence_to_original[normalized_seq],
                    "normalized_pattern": normalized_seq,
                    "frequency": count
                })

        # Sort by frequency (descending)
        patterns.sort(key=lambda x: x["frequency"], reverse=True)

        return patterns

    @staticmethod
    def get_pattern_signature(pattern: List[str]) -> str:
        """
        Get unique signature for a pattern

        Args:
            pattern: Command sequence

        Returns:
            Pattern signature (normalized sequence)
        """
        return PatternDetector.normalize_sequence(pattern)
