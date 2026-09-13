"""Reporting service: the seam between the two fixture features.

Consumes parsing/parser output and hands records to the reporting feature's
renderer. This is the module an architecture view should draw as the edge
between `parsing` and `reporting`.
"""
from parsing.parser import parse_record
from reporting.reporter import render_report


def build_report(lines):
    """Parse raw lines and render them as one text report."""
    records = [parse_record(line) for line in lines]
    return render_report(records)
