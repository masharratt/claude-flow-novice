#!/usr/bin/env bash
# Create a nitpicky run directory scaffold in the target project.
# Usage: new-run.sh <project-root> <app-url>
# Prints the created run directory path on stdout. Exit 0 = created, 2 = bad args.
set -euo pipefail

[ $# -eq 2 ] || { echo "usage: new-run.sh <project-root> <app-url>" >&2; exit 2; }
PROJECT_ROOT="$1"
APP_URL="$2"
[ -d "$PROJECT_ROOT" ] || { echo "new-run.sh: not a directory: $PROJECT_ROOT" >&2; exit 2; }

RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$PROJECT_ROOT/planning/nitpicky/$RUN_ID"
if [ -e "$RUN_DIR" ]; then
  RUN_DIR="${RUN_DIR}-$((RANDOM))"
fi
mkdir -p "$RUN_DIR/findings" "$RUN_DIR/screenshots"

ESC_URL="$(printf '%s' "$APP_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf '{
  "run_id": "%s",
  "app_url": "%s",
  "created": "%s",
  "skill_version": "1.0.0"
}\n' "$RUN_ID" "$ESC_URL" "$(date -Is)" >"$RUN_DIR/run.json"

echo "$RUN_DIR"
