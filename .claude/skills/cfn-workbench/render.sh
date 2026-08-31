#!/usr/bin/env bash
# render.sh - cfn-workbench entry point.
#
# Renders a self-contained HTML progress page for a CFN Loop run from scattered
# data: manifests, VERIFY doc, results JSON, bless ledger, lane reports,
# test outputs, screenshots, and git log.
#
# Self-contained means: zero <link> tags, zero non-data: src=/href=. All
# interpolated content is HTML-escaped. The render is idempotent: same inputs
# produce the same output, runnable at any checkpoint.
#
# Bash + jq only. No node dependency.

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The default root is the PROJECT BEING RENDERED, not this skill's own checkout.
# Everything the render reads (manifests, VERIFY doc, results JSON, bless ledger,
# lane reports, test output, screenshots, git log) belongs to that project.
# This was a BASH_SOURCE-derived root, which is wrong twice over: the skill is
# reached from every project through the ~/.claude/skills reverse symlink, so it
# resolved into the shared CFN checkout and rendered CFN's own run instead of the
# caller's; and the depth did not even match its own comment, since "../.." from
# .claude/skills/cfn-workbench/ lands on .claude/, not the repo root.
# watch.sh:122 already resolves it this way; the two now agree.
PROJECT_ROOT_DEFAULT="${CLAUDE_PROJECT_DIR:-$PWD}"

# Source shared helpers + section builders.
source "$SCRIPT_DIR/lib/html.sh"
source "$SCRIPT_DIR/lib/section-header.sh"
source "$SCRIPT_DIR/lib/section-timeline.sh"
source "$SCRIPT_DIR/lib/section-roster.sh"
source "$SCRIPT_DIR/lib/section-events.sh"
source "$SCRIPT_DIR/lib/section-map.sh"
source "$SCRIPT_DIR/lib/section-garden.sh"
source "$SCRIPT_DIR/lib/section-iteration-detail.sh"
source "$SCRIPT_DIR/lib/section-ac-table.sh"
source "$SCRIPT_DIR/lib/section-vote-ledger.sh"
source "$SCRIPT_DIR/lib/section-tech-debt.sh"
source "$SCRIPT_DIR/lib/section-bless-ledger.sh"
source "$SCRIPT_DIR/lib/section-decisions.sh"
source "$SCRIPT_DIR/lib/section-footer.sh"

SLUG=""
OUT=""
MAX_SCREENSHOTS=50
NO_SCREENSHOTS=0
ROOT="$PROJECT_ROOT_DEFAULT"
OPEN=0
LIVE_SECS=""

usage() {
  cat <<EOF
Usage: cfn-workbench --slug <slug> [options]

Renders a self-contained HTML progress page from CFN Loop run data.

Required:
  --slug <slug>            Run slug (matches VERIFY_<slug>.md, manifests, etc.).

Optional:
  --out <path>             Output HTML path. Default: <root>/planning/<slug>/workbench_<slug>.html
  --max-screenshots <N>    Cap on screenshots per iteration. Default: 50.
                           When more screenshots exist, the first N are rendered
                           and a placeholder card lists the overflow count + names.
  --no-screenshots         Skip screenshot embedding (text-only mode).
  --root <dir>             Project root to resolve inputs from.
                           Default: $PROJECT_ROOT_DEFAULT
  --open                   Open the rendered HTML in the default browser once.
                           Idempotent per output path: a marker in /tmp tracks
                           that the page is already open, so repeated renders
                           (e.g. each loop iteration) refresh the same tab via
                           --live instead of spawning new tabs.
  --live <secs>            Inject <meta http-equiv="refresh" content="<secs>">.
                           The open page re-reads the file from disk every <secs>,
                           so re-renders show up live. Positive integer. No url=
                           is emitted (same-page reload), keeping the page
                           self-contained.

Inputs (all optional except manifests; missing sources are recorded as data gaps):
  <root>/.cfn-cache/manifests/cfn-*.json         gate timeline + suggestions
  <root>/planning/<slug>/VERIFY_<slug>.md           AC table (markdown) + embedded manifest
  <root>/planning/<slug>/VERIFY_RESULTS_<slug>.json per-AC status/evidence
  <root>/planning/<slug>/.VERIFY_<slug>.bless.json  bless ledger (structure/predicate changes)
  (each also resolved from the legacy flat <root>/planning/ when the plan predates per-plan dirs)
  <root>/tmp/lane-report-<slug>-*.json           per-lane pass rate
  <root>/planning/<slug>/lanes-<slug>.json       transit map waves (also resolved
                                                 from the legacy flat planning/)
                                                 .waves: array of lane-id arrays
  <root>/tmp/test-output-<slug>-*.txt            test runner summary line
  /tmp/lane-report-<slug>-*.json                 runtime lane reports (also scanned)
  /tmp/test-output-<slug>-*.txt                  runtime test outputs (also scanned)
  <root>/tests/screenshots/<slug>-iteration-*.png screenshots (base64 inlined)
  git log at <root>                              branch, commit count

Exit codes:
  0  success (including empty-state: missing sources recorded as data gaps)
  2  usage error (bad args or missing --slug)

This skill is a reporting artifact. It is never a gate. If wired as a Phase 5
hook, emit WARN only.
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      [[ $# -lt 2 ]] && { echo "Error: --slug requires a value" >&2; usage; exit 2; }
      SLUG="$2"; shift 2 ;;
    --out)
      [[ $# -lt 2 ]] && { echo "Error: --out requires a value" >&2; usage; exit 2; }
      OUT="$2"; shift 2 ;;
    --max-screenshots)
      [[ $# -lt 2 ]] && { echo "Error: --max-screenshots requires a value" >&2; usage; exit 2; }
      if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --max-screenshots must be a non-negative integer" >&2; exit 2
      fi
      MAX_SCREENSHOTS="$2"; shift 2 ;;
    --no-screenshots)
      NO_SCREENSHOTS=1; shift ;;
    --root)
      [[ $# -lt 2 ]] && { echo "Error: --root requires a value" >&2; usage; exit 2; }
      ROOT="$2"; shift 2 ;;
    --open)
      OPEN=1; shift ;;
    --live)
      [[ $# -lt 2 ]] && { echo "Error: --live requires a value" >&2; usage; exit 2; }
      if ! [[ "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: --live must be a positive integer (seconds)" >&2; exit 2
      fi
      LIVE_SECS="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    --*)
      echo "Error: unknown option: $1" >&2; usage; exit 2 ;;
    *)
      echo "Error: unexpected positional argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$SLUG" ]]; then
  echo "Error: --slug is required" >&2
  usage
  exit 2
fi

if [[ ! -d "$ROOT" ]]; then
  echo "Error: --root does not exist: $ROOT" >&2
  exit 2
fi

# Default output lands in the plan's own directory alongside its VERIFY/PLAN docs.
[[ -z "$OUT" ]] && OUT="$(CFN_PLANNING_ROOT="$ROOT/planning" plan_ensure "$SLUG")/workbench_${SLUG}.html"

# Shared state for section libs.
GAPS_FILE="$(mktemp -t cfn-workbench-gaps.XXXXXX)"
trap 'rm -f "$GAPS_FILE"' EXIT

export WORKBENCH_GAPS_FILE="$GAPS_FILE"
export WORKBENCH_ROOT="$ROOT"
export WORKBENCH_SLUG="$SLUG"
export WORKBENCH_MAX_SCREENSHOTS="$MAX_SCREENSHOTS"
export WORKBENCH_NO_SCREENSHOTS="$NO_SCREENSHOTS"
export WORKBENCH_OUT="$OUT"
# Redact mktemp scratch roots in the recorded command (the dir is ephemeral).
root_display="$ROOT"
[[ "$ROOT" == /tmp/tmp.* ]] && root_display="<tmpdir>"
export WORKBENCH_INVOCATION="cfn-workbench --slug $SLUG$( [[ "$ROOT" != "$PROJECT_ROOT_DEFAULT" ]] && printf ' --root %s' "$root_display" )$( [[ "$MAX_SCREENSHOTS" != "50" ]] && printf ' --max-screenshots %s' "$MAX_SCREENSHOTS" )$( [[ "$NO_SCREENSHOTS" == "1" ]] && printf ' --no-screenshots' )$( [[ "$OPEN" == "1" ]] && printf ' --open' )$( [[ -n "$LIVE_SECS" ]] && printf ' --live %s' "$LIVE_SECS" )"

# Build sections. Each function emits an HTML chunk on stdout.
HEADER_HTML="$(section_header)"
NAV_HTML="$(section_nav)"
MAP_HTML="$(section_map)"
GARDEN_HTML="$(section_garden)"
TIMELINE_HTML="$(section_timeline)"
ROSTER_HTML="$(section_roster)"
EVENTS_HTML="$(section_events)"
DETAIL_HTML="$(section_iteration_detail)"
AC_HTML="$(section_ac_table)"
DECISIONS_HTML="$(section_decisions)"
VOTE_HTML="$(section_vote_ledger)"
DEBT_HTML="$(section_tech_debt)"
BLESS_HTML="$(section_bless_ledger)"
FOOTER_HTML="$(section_footer)"
# Gaps strip is emitted at the top of the page but can only be built after every
# section has run (sections record gaps as they render). Captured here, after all
# sections; empty string when there are no gaps (gap-free renders stay clean).
GAPS_STRIP_HTML="$(gaps_strip)"

# Assemble the document. Style is inlined; no <link>, no external src/href.
{
  printf '<!DOCTYPE html>\n'
  printf '<html lang="en">\n'
  printf '<head>\n'
  printf '<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  # Live auto-refresh: bare content="<secs>" reloads the same file:// page (no
  # url=), so the page stays self-contained while picking up re-renders.
  [[ -n "$LIVE_SECS" ]] && printf '<meta http-equiv="refresh" content="%s">\n' "$LIVE_SECS"
  printf '<title>%s</title>\n' "$(html_escape "CFN Workbench: ${SLUG}")"
  printf '<style>\n'
  default_style
  printf '</style>\n'
  printf '</head>\n'
  printf '<body>\n'
  printf '<main class="container">\n'
  printf '%s\n' "$HEADER_HTML"
  printf '%s\n' "$NAV_HTML"
  printf '%s\n' "$GAPS_STRIP_HTML"
  printf '%s\n' "$MAP_HTML"
  printf '%s\n' "$GARDEN_HTML"
  printf '%s\n' "$TIMELINE_HTML"
  printf '%s\n' "$ROSTER_HTML"
  printf '%s\n' "$EVENTS_HTML"
  printf '%s\n' "$DETAIL_HTML"
  printf '%s\n' "$AC_HTML"
  printf '%s\n' "$DECISIONS_HTML"
  printf '%s\n' "$VOTE_HTML"
  printf '%s\n' "$DEBT_HTML"
  printf '%s\n' "$BLESS_HTML"
  printf '%s\n' "$FOOTER_HTML"
  printf '</main>\n'
  printf '</body>\n'
  printf '</html>\n'
} > "$OUT"

# Backfill the footer size token (footer renders before the file is written).
SIZE=$(wc -c < "$OUT" | tr -d ' ')
sed -i "s#__WB_SIZE__#${SIZE}#" "$OUT"

# Self-containment assertion (defensive; tests also check), then a one-time
# open of the page. Both helpers live in lib/html.sh and are shared with
# dashboard.sh. cfn: defensive belt-and-suspenders, run on every render so a
# regression in a section lib cannot silently leak an external src/href into
# the output.
wb_self_containment_check "$OUT" \
  || echo "WARN: self-containment check reported problems (see above). HTML still written." >&2

[[ "$OPEN" == "1" ]] && wb_open_if_needed "$OUT"

# Summary on stdout.
GAP_COUNT=$(get_gap_count)
echo "Rendered: $OUT"
echo "Size: ${SIZE} bytes"
echo "Data gaps: ${GAP_COUNT}"

exit 0
