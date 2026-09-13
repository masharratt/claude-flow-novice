"""Shared helpers used by both fixture features."""


def clean_token(raw):
    """Normalize a raw input line: strip whitespace, lowercase."""
    return raw.strip().lower()
