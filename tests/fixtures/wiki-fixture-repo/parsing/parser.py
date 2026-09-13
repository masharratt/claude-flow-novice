"""Record parser for the parsing feature."""
from parsing.regexes import FIELD_RE


def parse_record(line):
    """Split one 'name,value' line into a dict record."""
    match = FIELD_RE.match(line)
    if not match:
        return {"name": line, "value": None}
    return {"name": match.group("name"), "value": int(match.group("value"))}
