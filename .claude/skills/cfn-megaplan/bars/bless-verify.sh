#!/usr/bin/env bash
# bless-verify.sh — the ONLY supported way to bless a VERIFY manifest (S007).
#
# Replaces the bare `sha256sum VERIFY_<slug>.md > .VERIFY_<slug>.sha256`
# one-liner with a gated, audited bless:
#
#   1. Runs bars/check-verifiable-static.sh and REFUSES to bless on any
#      error-severity finding. Blessing was previously self-service, so a
#      manifest could be pinned without ever having passed the static bar.
#   2. Writes the sha256 sidecar (same path and format as before, so
#      cfn-loop-task Step 0 and verify-run.sh need no change).
#   3. Snapshots the blessed manifest and appends a bless-ledger entry naming
#      exactly which ACs moved and in which fields.
#
# Step 3 exists because a re-bless used to be all-or-nothing: a reviewer could
# not tell whether only the `check` command was corrected or whether the
# acceptance criteria themselves had been rewritten to match whatever the code
# happened to do. Two axes are reported separately:
#
#   structure_changed  — an AC was added or removed, or its id/kind/maps_to
#                        moved. The criteria set itself changed.
#   predicate_changed  — a `pass` condition moved. This is the gaming vector
#                        (loosen the predicate until the code satisfies it), so
#                        it is never folded into "just check text".
#
# Usage:  bless-verify.sh <planning/<slug>/VERIFY_<slug>.md> [--note "<why>"]
# Writes (always beside the manifest, derived from its own dir + basename, so this
# works unchanged for a per-plan dir and for a legacy flat planning/ layout):
#         <dir>/.VERIFY_<slug>.sha256        (integrity sidecar)
#         <dir>/.VERIFY_<slug>.blessed.json  (manifest snapshot, for diffing)
#         <dir>/.VERIFY_<slug>.bless.json    (append-only bless ledger)
# Exit:   0 = blessed
#         1 = refused (Bar A static findings) — sidecar left untouched
#         2 = usage / file-not-found / jq-missing / no json manifest block
# Deps:   jq, sha256sum
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATIC_CHECK="$SCRIPT_DIR/check-verifiable-static.sh"

VERIFY="${1:-}"
NOTE=""
STAGE="plan"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --note) NOTE="${2:-}"; shift 2 ;;
    --stage) STAGE="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
case "$STAGE" in
  plan|exit) : ;;
  *) echo "error: --stage must be 'plan' or 'exit' (got '$STAGE')" >&2; exit 2 ;;
esac

if [ -z "$VERIFY" ]; then
  echo 'usage: bless-verify.sh <planning/<slug>/VERIFY_<slug>.md> [--stage plan|exit] [--note "<why>"]' >&2
  exit 2
fi
[ -f "$VERIFY" ] || { echo "error: file not found: $VERIFY" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo 'error: jq is required' >&2; exit 2; }

DIR="$(dirname "$VERIFY")"
BASE="$(basename "$VERIFY" .md)"
SIDECAR="$DIR/.$BASE.sha256"
SNAPSHOT="$DIR/.$BASE.blessed.json"
LEDGER="$DIR/.$BASE.bless.json"

# Same extractor as verify-run.sh / check-verifiable-static.sh: the LAST fenced
# json block is the manifest.
MANIFEST="$(awk '
  /^```json/     { inblock=1; buf=""; next }
  inblock && /^```/ { inblock=0; last=buf; next }
  inblock        { buf = buf $0 "\n" }
  END            { printf "%s", last }
' "$VERIFY")"

[ -n "${MANIFEST//[[:space:]]/}" ] || { echo "error: no fenced json manifest block in $VERIFY" >&2; exit 2; }
echo "$MANIFEST" | jq -e . >/dev/null 2>&1 || { echo "error: manifest json does not parse" >&2; exit 2; }

# ---- gate: Bar A static pass must be clean before anything is pinned ----
if [ -x "$STATIC_CHECK" ] || [ -f "$STATIC_CHECK" ]; then
  FINDINGS="$(bash "$STATIC_CHECK" "$VERIFY" --stage "$STAGE" 2>/dev/null)"; SC=$?
  if [ "$SC" -eq 2 ]; then
    echo "error: static checker could not read the manifest" >&2
    exit 2
  fi
  if [ "$SC" -ne 0 ]; then
    echo "REFUSED: Bar A static check has error-severity findings — fix them, then bless." >&2
    echo "$FINDINGS" | jq -r '.[] | select(.severity=="error") | "  \(.ac_id) [\(.field)] \(.issue)"' >&2 2>/dev/null || echo "$FINDINGS" >&2
    exit 1
  fi
else
  echo "warn: $STATIC_CHECK not found — blessing without the static gate" >&2
fi

SLUG="$(echo "$MANIFEST" | jq -r '.slug // "unknown"')"
SHA="$(sha256sum "$VERIFY" | awk '{print $1}')"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---- diff against the previous blessed snapshot ----
# Compared field-by-field per AC id rather than as a text diff: a text diff of a
# reformatted manifest is unreadable, and the question a reviewer actually has
# is "which ACs moved, and did their criteria move or only their commands".
DIFF_JSON='{"changed":[],"added":[],"removed":[],"structure_changed":false,"predicate_changed":false,"first":true}'
# ARG_MAX guard: --argjson new "$MANIFEST" blows the ~128KB kernel limit on a
# large manifest (backfilled evidence fields). Write to a temp file and read via
# --slurpfile instead (same fix verify-run.sh uses). $new is then [[<manifest>]],
# so unwrap with $new[0].
NEWTMP="$(mktemp)"; printf '%s\n' "$MANIFEST" > "$NEWTMP"
if [ -f "$SNAPSHOT" ]; then
  DIFF_JSON="$(jq -n --slurpfile old "$SNAPSHOT" --slurpfile new "$NEWTMP" '
    ($old[0].acs // []) as $o | ($new[0].acs // []) as $n |
    ([$o[].id] | unique) as $oid | ([$n[].id] | unique) as $nid |
    (["id","kind","maps_to"]) as $structural |
    [ $n[] | . as $na | ($o[] | select(.id == $na.id)) as $oa |
      { id: $na.id,
        fields: ( [ ($na | keys_unsorted[]), ($oa | keys_unsorted[]) ] | unique
                  | map(select( ($na[.] // null) != ($oa[.] // null) )) ) }
      | select(.fields | length > 0)
    ] as $changed |
    { changed: $changed,
      added:   ($nid - $oid),
      removed: ($oid - $nid),
      structure_changed:
        ( (($nid - $oid) | length) > 0
          or (($oid - $nid) | length) > 0
          or ([ $changed[] | select(.fields | any(. as $f | $structural | index($f))) ] | length) > 0 ),
      predicate_changed:
        ( ( [ $changed[] | select(.fields | index("pass")) ] | length ) > 0 ),
      first: false }
  ')"
  # Never pin on a diff we could not compute: a silently-empty diff would
  # record a re-bless as if nothing had changed, which is the exact blind spot
  # the ledger exists to remove.
  if ! echo "$DIFF_JSON" | jq -e . >/dev/null 2>&1; then
    echo "REFUSED: could not diff against the previous blessed snapshot ($SNAPSHOT)" >&2
    exit 1
  fi
fi
rm -f "$NEWTMP"

# ---- append the ledger entry ----
ENTRY="$(jq -n \
  --arg ts "$TS" --arg sha "$SHA" --arg note "$NOTE" --arg stage "$STAGE" \
  --argjson acs "$(echo "$MANIFEST" | jq '.acs | length')" \
  --argjson d "$DIFF_JSON" \
  '$d + {timestamp:$ts, sha256:$sha, ac_count:$acs, stage:$stage, note:$note}')"

if [ -f "$LEDGER" ]; then
  TMP="$(mktemp)"
  jq --argjson e "$ENTRY" '.blessings += [$e]' "$LEDGER" > "$TMP" && mv "$TMP" "$LEDGER"
else
  jq -n --arg slug "$SLUG" --arg vf "$VERIFY" --argjson e "$ENTRY" \
    '{slug:$slug, verify_file:$vf, blessings:[$e]}' > "$LEDGER"
fi

# ---- pin ----
printf '%s\n' "$SHA" > "$SIDECAR"
printf '%s' "$MANIFEST" > "$SNAPSHOT"

N="$(jq -r '.blessings | length' "$LEDGER")"
if [ "$(echo "$DIFF_JSON" | jq -r '.first')" = "true" ]; then
  echo "blessed $VERIFY (bless #$N, first) sha256=${SHA:0:12}"
else
  echo "blessed $VERIFY (bless #$N) sha256=${SHA:0:12}"
  echo "$DIFF_JSON" | jq -r '
    "  changed: \(.changed | length) AC(s)  added: \(.added | length)  removed: \(.removed | length)",
    "  structure_changed: \(.structure_changed)   predicate_changed: \(.predicate_changed)",
    (.changed[] | "    \(.id): \(.fields | join(", "))")'
fi
exit 0
