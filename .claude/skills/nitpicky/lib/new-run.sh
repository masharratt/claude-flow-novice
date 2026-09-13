#!/usr/bin/env bash
# Create a nitpicky run directory scaffold in the target project.
# Usage: new-run.sh <project-root> <app-url> [--routes-file <file>] [--redact-file <file>]
#   --routes-file  one route/path per line; becomes coverage.expected in run.json
#   --redact-file  one secret per line; merge + export scrub these from all output
# Prints the created run directory path on stdout. Exit 0 = created, 2 = bad args.
set -euo pipefail

PYTHON="${PYTHON:-python3}"

[ $# -ge 2 ] || { echo "usage: new-run.sh <project-root> <app-url> [--routes-file <file>] [--redact-file <file>]" >&2; exit 2; }
PROJECT_ROOT="$1"
APP_URL="$2"
shift 2

ROUTES_FILE=""
REDACT_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --routes-file) ROUTES_FILE="${2:-}"; shift 2 ;;
    --redact-file) REDACT_FILE="${2:-}"; shift 2 ;;
    *) echo "new-run.sh: unknown option: $1" >&2; exit 2 ;;
  esac
done

[ -d "$PROJECT_ROOT" ] || { echo "new-run.sh: not a directory: $PROJECT_ROOT" >&2; exit 2; }
[ -z "$ROUTES_FILE" ] || [ -f "$ROUTES_FILE" ] || { echo "new-run.sh: routes file not found: $ROUTES_FILE" >&2; exit 2; }
[ -z "$REDACT_FILE" ] || [ -f "$REDACT_FILE" ] || { echo "new-run.sh: redact file not found: $REDACT_FILE" >&2; exit 2; }

RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$PROJECT_ROOT/planning/nitpicky/$RUN_ID"
if [ -e "$RUN_DIR" ]; then
  RUN_DIR="${RUN_DIR}-$((RANDOM))"
fi
mkdir -p "$RUN_DIR/findings" "$RUN_DIR/screenshots"

# JSON string arrays built with python (safe quoting), inlined into run.json
ARRS="$("$PYTHON" - "$ROUTES_FILE" "$REDACT_FILE" <<'PYEOF'
import json, sys
def arr(path):
    if not path:
        return []
    return [l.strip() for l in open(path) if l.strip()]
print(json.dumps({"routes": arr(sys.argv[1]), "redactions": arr(sys.argv[2])}))
PYEOF
)"

ESC_URL="$(printf '%s' "$APP_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')"
"$PYTHON" - "$RUN_DIR/run.json" "$RUN_ID" "$ESC_URL" "$ARRS" <<'PYEOF'
import json, sys
from datetime import datetime, timezone
path, run_id, url, arrs = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
doc = {
    "run_id": run_id,
    "app_url": url,
    "created": datetime.now(timezone.utc).isoformat(),
    "skill_version": "1.3.0",
    "coverage": {"expected": arrs["routes"]},
    "redactions": arrs["redactions"],
}
with open(path, "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
PYEOF

echo "$RUN_DIR"
