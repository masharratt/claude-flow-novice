"""Report renderer for the reporting feature."""
from reporting.format import format_table


def render_report(records):
    """Render parsed records as a text table."""
    return format_table(records)
