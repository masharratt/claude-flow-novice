"""Text formatting helpers for the reporting feature."""


def format_table(records):
    """Render records as a fixed-width two-column table."""
    rows = ["NAME     VALUE"]
    for record in records:
        rows.append("%-8s %s" % (record["name"], record["value"]))
    return "\n".join(rows)
