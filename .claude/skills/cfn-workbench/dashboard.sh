#!/usr/bin/env bash
# dashboard.sh - cfn-workbench project-wide entry point.
#
# Renders one self-contained HTML page showing EVERY loop run in a project as
# its own transit line (see lib/section-map-all.sh). Where render.sh answers
# "how is run <slug> going", this answers "what is every session doing right
# now" in a single tab.
#
# Same self-containment contract as render.sh: zero <link> tags, zero non-data:
# src=/href=, all interpolation HTML-escaped, idempotent render, exit 0 on the
# normal path (a dashboard is a reporting artifact and is never a gate).
#
# Bash + jq only. No node dependency.

set -euo pipefail

# GNU-tool shims for macOS. Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT_DEFAULT="${CLAUDE_PROJECT_DIR:-$PWD}"

source "$SCRIPT_DIR/lib/html.sh"
source "$SCRIPT_DIR/lib/section-roster.sh"
source "$SCRIPT_DIR/lib/section-events.sh"
source "$SCRIPT_DIR/lib/section-map.sh"
source "$SCRIPT_DIR/lib/section-map-all.sh"
source "$SCRIPT_DIR/lib/section-footer.sh"

OUT=""
ROOT="$PROJECT_ROOT_DEFAULT"
OPEN=0
LIVE_SECS=""
MAX_LINES=12

usage() {
  cat <<EOF
Usage: cfn-workbench dashboard [options]

Renders a self-contained HTML page with one transit line per loop run found in
the project (run plans under planning/ plus event streams under tmp/ and /tmp),
sorted by last activity, newest first.

Optional:
  --out <path>          Output HTML path. Default: <root>/planning/workbench-dashboard.html
  --root <dir>          Project root to resolve inputs from.
                        Default: $PROJECT_ROOT_DEFAULT
  --max-lines <N>       Cap on run bands rendered. Default: 12. Overflow runs
                        are counted in a note at the bottom.
  --open                Open the rendered HTML in the default browser once.
                        Idempotent per output path (re-renders refresh the same
                        tab via --live).
  --live <secs>         Inject <meta http-equiv="refresh" content="<secs>">.
                        Positive integer; same-page reload, keeps the page
                        self-contained.
  -h|--help             This help.

Exit codes:
  0  success (including empty-state: no runs found is a data gap, not an error)
  2  usage error
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      [[ $# -lt 2 ]] && { echo "Error: --out requires a value" >&2; usage; exit 2; }
      OUT="$2"; shift 2 ;;
    --root)
      [[ $# -lt 2 ]] && { echo "Error: --root requires a value" >&2; usage; exit 2; }
      ROOT="$2"; shift 2 ;;
    --max-lines)
      [[ $# -lt 2 ]] && { echo "Error: --max-lines requires a value" >&2; usage; exit 2; }
      if ! [[ "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: --max-lines must be a positive integer" >&2; exit 2
      fi
      MAX_LINES="$2"; shift 2 ;;
    --open) OPEN=1; shift ;;
    --live)
      [[ $# -lt 2 ]] && { echo "Error: --live requires a value" >&2; usage; exit 2; }
      if ! [[ "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: --live must be a positive integer (seconds)" >&2; exit 2
      fi
      LIVE_SECS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "Error: unknown option: $1" >&2; usage; exit 2 ;;
    *) echo "Error: unexpected positional argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ ! -d "$ROOT" ]]; then
  echo "Error: --root does not exist: $ROOT" >&2
  exit 2
fi

[[ -z "$OUT" ]] && OUT="$ROOT/planning/workbench-dashboard.html"
mkdir -p "$(dirname "$OUT")"

GAPS_FILE="$(mktemp -t cfn-workbench-gaps.XXXXXX)"
trap 'rm -f "$GAPS_FILE"' EXIT

export WORKBENCH_GAPS_FILE="$GAPS_FILE"
export WORKBENCH_ROOT="$ROOT"
export WORKBENCH_SLUG="dashboard"
export WORKBENCH_MAX_LINES="$MAX_LINES"
export WORKBENCH_OUT="$OUT"
root_display="$ROOT"
[[ "$ROOT" == /tmp/tmp.* ]] && root_display="<tmpdir>"
export WORKBENCH_INVOCATION="cfn-workbench dashboard$( [[ "$ROOT" != "$PROJECT_ROOT_DEFAULT" ]] && printf ' --root %s' "$root_display" )$( [[ "$MAX_LINES" != "12" ]] && printf ' --max-lines %s' "$MAX_LINES" )$( [[ "$OPEN" == "1" ]] && printf ' --open' )$( [[ -n "$LIVE_SECS" ]] && printf ' --live %s' "$LIVE_SECS" )"

# Header band: project name, generated timestamp, run count teaser.
dash_header() {
  local project; project="$(basename "$ROOT")"
  printf '<header class="card" id="wb-header">'
  printf '<span class="section-kicker">Project dashboard</span>'
  printf '<h1>%s</h1>' "$(html_escape "CFN Workbench: ${project}")"
  printf '<div class="footer-meta"><div>%s</div></div>' \
    "$(html_escape "Every loop run in this project as one transit line. One tab, auto-refreshing with --live.")"
  printf '</header>'
}

MAP_ALL_HTML="$(section_map_all)"
FOOTER_HTML="$(section_footer)"
GAPS_STRIP_HTML="$(gaps_strip)"

{
  printf '<!DOCTYPE html>\n'
  printf '<html lang="en">\n'
  printf '<head>\n'
  printf '<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  [[ -n "$LIVE_SECS" ]] && printf '<meta http-equiv="refresh" content="%s">\n' "$LIVE_SECS"
  printf '<title>%s</title>\n' "$(html_escape "CFN Workbench Dashboard: $(basename "$ROOT")")"
  printf '<style>\n'
  default_style
  printf '</style>\n'
  printf '</head>\n'
  printf '<body>\n'
  printf '<main class="container">\n'
  printf '%s\n' "$(dash_header)"
  printf '%s\n' "$GAPS_STRIP_HTML"
  printf '%s\n' "$MAP_ALL_HTML"
  printf '%s\n' "$FOOTER_HTML"
  printf '</main>\n'
  printf '</body>\n'
  printf '</html>\n'
} > "$OUT"

SIZE=$(wc -c < "$OUT" | tr -d ' ')
sed -i "s#__WB_SIZE__#${SIZE}#" "$OUT"

wb_self_containment_check "$OUT" \
  || echo "WARN: self-containment check reported problems (see above). HTML still written." >&2

[[ "$OPEN" == "1" ]] && wb_open_if_needed "$OUT"

GAP_COUNT=$(get_gap_count)
echo "Rendered: $OUT"
echo "Size: ${SIZE} bytes"
echo "Data gaps: ${GAP_COUNT}"

exit 0
