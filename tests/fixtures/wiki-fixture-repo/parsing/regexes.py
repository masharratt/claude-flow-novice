"""Line patterns used by the parsing feature."""
import re

FIELD_RE = re.compile(r"^(?P<name>[a-z]+),(?P<value>\d+)$")
