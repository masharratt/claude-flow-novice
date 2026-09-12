#!/usr/bin/env bash
# Open the nitpicky review page in the user's browser (WSL2 aware).
# Usage: open-site.sh <http-url | path-to-review.html>
# Exit 0 = opened (or at least handed to Windows), 1 = could not open, location printed.
# Note: explorer.exe often returns nonzero even on success, so it is treated as
# best-effort; wslview is the reliable path when wslu is installed.
set -uo pipefail

[ $# -eq 1 ] || { echo "usage: open-site.sh <http-url | path-to-review.html>" >&2; exit 2; }
TARGET="$1"

open_target() { # $1 = url or windows path
  if command -v wslview >/dev/null 2>&1; then
    if wslview "$1" >/dev/null 2>&1; then
      echo "open-site.sh: opened via wslview: $1"
      return 0
    fi
  fi
  if command -v explorer.exe >/dev/null 2>&1; then
    explorer.exe "$1" >/dev/null 2>&1 || true
    echo "open-site.sh: handed to Windows shell: $1 (if nothing opened, open it manually)"
    return 0
  fi
  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$1" >/dev/null 2>&1 || true
    echo "open-site.sh: handed to cmd start: $1"
    return 0
  fi
  return 1
}

if [[ "$TARGET" == http://* || "$TARGET" == https://* ]]; then
  if open_target "$TARGET"; then exit 0; fi
  echo "open-site.sh: no opener found; open this URL in your browser: $TARGET"
  exit 1
fi

[ -f "$TARGET" ] || { echo "open-site.sh: not a file: $TARGET" >&2; exit 2; }
FILE="$(readlink -f "$TARGET")"
WIN_PATH="$(wslpath -w "$FILE" 2>/dev/null || true)"
if [ -n "$WIN_PATH" ]; then
  if open_target "$WIN_PATH"; then exit 0; fi
else
  if open_target "$FILE"; then exit 0; fi
fi
echo "open-site.sh: no opener found; open this file in your browser: $FILE"
exit 1
