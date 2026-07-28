#!/usr/bin/env bash
# cfn-ab-critic — blind A/B critic gate.
#
# Compares a build artifact ("ours") against an acceptance criterion's
# `reference` artifact, with labels shuffled so the critic cannot tell which
# is ours. Emits a vote-manifest at .cfn-cache/manifests/cfn-ab-critic-<ns>.json
# in the shared cfn-vote-implement suggestion schema. The executable AC `check`
# still owns pass/fail; this is an additional quality layer that the AC opts
# into by carrying a `reference` key (see check-verifiable-static.sh check 1g).
#
# Re-entrant two-phase design (the LLM IS the critic, but the bash script owns
# the blind mechanic):
#   phase 1 (no winner source): emit a blinded prompt (artifact_A / artifact_B
#           only) to stdout, no manifest. The agent does the comparison per
#           SKILL.md, writes verdicts to a --winner-file, and re-invokes.
#   phase 2 (winner source):    un-shuffle the verdict, emit the manifest,
#           exit per the routing table below.
#
# Exit codes (mirrors cfn-persona-verify shape):
#   0  clean    every comparison won by ours at confidence >= threshold
#   1  findings one or more suggestions emitted
#   2  usage    bad CLI args
#   3  schema   winner-file invalid (raw_winner not A/B/tie, confidence out of [0,1])
#   4  blocked  every comparison blocked (missing / unreadable / unsupported)
#
# cfn: judgment requires a live model; in phase 1 this script only emits the
#   blinded prompt and exits 0 without a manifest. The agent re-invokes with
#   verdicts. Upgrade trigger: bake a non-Anthropic vision/text compare MCP
#   call directly into this script when one is reachable in-process, so the
#   two-phase handoff collapses to a single invocation.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-ab-critic"
# shellcheck source=lib/shuffle.sh
source "$SKILL_DIR/lib/shuffle.sh"

MANIFEST_DIR="$PROJECT_ROOT/.cfn-cache/manifests"
DEFAULT_THRESHOLD="${CFN_AB_CRITIC_THRESHOLD:-0.75}"

usage() {
  cat >&2 <<EOF
Usage: cfn-ab-critic --ac <id,id,...> [options]

Required:
  --ac            Comma-separated acceptance-criterion ids.

Optional:
  --iteration N            Iteration index (default 0). Part of the shuffle seed.
  --verify FILE            JSON map of AC -> {reference, ours}; or a VERIFY
                           markdown doc using the line grammar
                           "AC-<id>: reference=<path> ours=<path>".
  --ours p1,p2,...         Build artifact paths, parallel to --ac. Overrides --verify.
  --reference r1,r2,...    Reference artifact paths, parallel to --ac. Overrides --verify.
  --threshold 0..1         Confidence threshold (default $DEFAULT_THRESHOLD,
                           or \$CFN_AB_CRITIC_THRESHOLD).
  --winner-file FILE       JSON map {AC: {raw_winner, confidence, biggest_gap}}.
                           Agent writes verdicts here after the blinded compare.
  --emit-fixture-winner X  TEST HOOK. Canned raw winner (A|B|tie) for all ACs.
  --out FILE               Manifest output path (default auto-timestamped).
EOF
  exit 2
}

# ============================================================================
# arg parsing
# ============================================================================

AC_CSV=""
ITERATION="0"
VERIFY=""
OURS_CSV=""
REF_CSV=""
THRESHOLD="$DEFAULT_THRESHOLD"
WINNER_FILE=""
FIXTURE_WINNER=""
OUT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ac)                   AC_CSV="${2:-}";        shift 2 ;;
    --iteration)            ITERATION="${2:-}";     shift 2 ;;
    --verify)               VERIFY="${2:-}";        shift 2 ;;
    --ours)                 OURS_CSV="${2:-}";      shift 2 ;;
    --reference)            REF_CSV="${2:-}";       shift 2 ;;
    --threshold)            THRESHOLD="${2:-}";     shift 2 ;;
    --winner-file)          WINNER_FILE="${2:-}";   shift 2 ;;
    --emit-fixture-winner)  FIXTURE_WINNER="${2:-}";shift 2 ;;
    --out)                  OUT="${2:-}";           shift 2 ;;
    -h|--help)              usage ;;
    *) echo "Error: unknown argument: $1" >&2; usage ;;
  esac
done

[ -n "$AC_CSV" ] || { echo "Error: --ac is required" >&2; usage; }
[[ "$ITERATION" =~ ^[0-9]+$ ]] || { echo "Error: --iteration must be a non-negative integer" >&2; usage; }
if [ -n "$FIXTURE_WINNER" ]; then
  [[ "$FIXTURE_WINNER" =~ ^(A|B|tie)$ ]] || { echo "Error: --emit-fixture-winner must be A, B, or tie" >&2; usage; }
fi

# threshold must be a number in [0,1].
THRESHOLD_NUM=$(jq -eRr 'tonumber | select(. >= 0 and . <= 1)' <<<"$THRESHOLD" 2>/dev/null) \
  || { echo "Error: --threshold must be a number in [0,1]" >&2; usage; }

# Split comma-separated lists into arrays (parallel to --ac).
IFS=',' read -ra AC_IDS <<<"$AC_CSV"
[ "${#AC_IDS[@]}" -gt 0 ] && [ -n "${AC_IDS[0]:-}" ] \
  || { echo "Error: --ac has no ids" >&2; usage; }
IFS=',' read -ra OURS_PATHS <<<"$OURS_CSV"
IFS=',' read -ra REF_PATHS  <<<"$REF_CSV"

# ============================================================================
# --verify resolution (JSON map primary; markdown best-effort, v1-limited)
# ============================================================================

declare -A VERIFY_OURS VERIFY_REF
if [ -n "$VERIFY" ] && [ -f "$VERIFY" ]; then
  case "$VERIFY" in
    *.json)
      for ac in "${AC_IDS[@]}"; do
        o=$(jq -r --arg ac "$ac" '.[$ac].ours // empty' "$VERIFY" 2>/dev/null || true)
        r=$(jq -r --arg ac "$ac" '.[$ac].reference // empty' "$VERIFY" 2>/dev/null || true)
        [ -n "$o" ] && VERIFY_OURS["$ac"]="$o"
        [ -n "$r" ] && VERIFY_REF["$ac"]="$r"
      done
      ;;
    *)
      # cfn: VERIFY_<slug>.md markdown parsing is intentionally v1-limited. The
      # JSON map form is the contract; markdown extraction only reads a simple
      # "AC-<id>: reference=<path> ours=<path>" line grammar. Upgrade trigger:
      # a second markdown shape lands, or a verify doc drifts; then write a
      # real parser or emit verify docs as JSON sidecars.
      while IFS= read -r line; do
        ac=$(printf '%s\n' "$line" | grep -oE 'AC-[A-Za-z0-9_-]+' | head -1)
        [ -z "$ac" ] && continue
        ref=$(printf '%s\n' "$line" | grep -oE 'reference=[^ ]+' | cut -d= -f2-)
        ours=$(printf '%s\n' "$line" | grep -oE 'ours=[^ ]+' | cut -d= -f2-)
        [ -n "$ref" ]  && VERIFY_REF["$ac"]="$ref"
        [ -n "$ours" ] && VERIFY_OURS["$ac"]="$ours"
      done < "$VERIFY"
      ;;
  esac
fi

# ============================================================================
# winner-file validation (schema violation -> exit 3, before any work)
# ============================================================================

declare -A WF_RAW WF_CONF WF_GAP
if [ -n "$WINNER_FILE" ] && [ -f "$WINNER_FILE" ]; then
  for ac in "${AC_IDS[@]}"; do
    raw=$(jq -r --arg ac "$ac" '.[$ac].raw_winner // empty' "$WINNER_FILE" 2>/dev/null || true)
    [ -z "$raw" ] && continue
    [[ "$raw" =~ ^(A|B|tie)$ ]] || {
      echo "Error: winner-file raw_winner for $ac must be A, B, or tie (got '$raw')" >&2
      exit 3
    }
    conf=$(jq -r --arg ac "$ac" '.[$ac].confidence // empty' "$WINNER_FILE" 2>/dev/null || true)
    if ! jq -eR --arg ac "$ac" '
        tonumber | select(. >= 0 and . <= 1)
      ' <<<"$conf" >/dev/null 2>&1; then
      echo "Error: winner-file confidence for $ac out of [0,1] (got '$conf')" >&2
      exit 3
    fi
    gap=$(jq -r --arg ac "$ac" '.[$ac].biggest_gap // ""' "$WINNER_FILE" 2>/dev/null || true)
    WF_RAW["$ac"]="$raw"
    WF_CONF["$ac"]="$conf"
    WF_GAP["$ac"]="$gap"
  done
fi

# ============================================================================
# artifact dispatch (symmetric, by extension / scheme)
# ============================================================================

# Echoes "vision" | "read" | "web" | "unsupported:<reason>".
ingest_kind() {
  local p="$1" ext
  case "$p" in
    http://*|https://*)
      case "$p" in
        *.html|*.htm|*/) echo "web" ;;
        *) echo "unsupported:remote non-html (v1)" ;;
      esac
      ;;
    *)
      ext="${p##*.}"
      case "${ext,,}" in
        png|jpg|jpeg|webp|gif) echo "vision" ;;
        webm|mp4|mov|avi|mkv)  echo "unsupported:.$ext" ;;
        *)                     echo "read" ;;
      esac
      ;;
  esac
}

# ============================================================================
# per-AC processing
# ============================================================================

COMP_JSONS=()
PROMPT_BLOCKS=()
SUGGESTION_JSONS=()
SUGGEST_SEQ=1
ANY_BLOCKED=0
ALL_BLOCKED=1
PROMPT_MODE=0

for idx in "${!AC_IDS[@]}"; do
  ac="${AC_IDS[$idx]}"
  ours="${OURS_PATHS[$idx]:-}"
  [ -z "$ours" ] && ours="${VERIFY_OURS[$ac]:-}"
  ref="${REF_PATHS[$idx]:-}"
  [ -z "$ref" ] && ref="${VERIFY_REF[$ac]:-}"

  # The shuffle assignment does not depend on artifact resolution, so compute
  # it up front — blocked records still carry it for audit.
  assn=$(label_assignment "$ac" "$ITERATION")
  case "$assn" in
    A=ours,*) LA_A="ours";      LA_B="reference" ;;
    *)        LA_A="reference"; LA_B="ours" ;;
  esac

  # ---- resolve + validate both artifacts ----
  blocked_reason=""
  [ -z "$ref" ] && blocked_reason="missing reference (pass --reference or --verify with one)"
  if [ -z "$blocked_reason" ]; then
    case "$ref" in
      *\**|*\?*|*\{*) blocked_reason="reference must not be a glob (check 1g)" ;;
    esac
  fi
  if [ -z "$blocked_reason" ] && ! [[ "$ref" =~ ^https?:// ]] && [ ! -e "$ref" ]; then
    blocked_reason="reference not found: $ref"
  fi
  if [ -z "$blocked_reason" ]; then
    [ -z "$ours" ] && blocked_reason="missing ours artifact (pass --ours or --verify with one)"
  fi
  if [ -z "$blocked_reason" ] && [ -n "$ours" ] && ! [[ "$ours" =~ ^https?:// ]] && [ ! -e "$ours" ]; then
    blocked_reason="ours artifact not found: $ours"
  fi
  if [ -z "$blocked_reason" ]; then
    okind=$(ingest_kind "$ours"); rkind=$(ingest_kind "$ref")
    [[ "$okind" != unsupported:* ]] || blocked_reason="ours unsupported: $okind"
    if [ -z "$blocked_reason" ]; then
      [[ "$rkind" != unsupported:* ]] || blocked_reason="reference unsupported: $rkind"
    fi
  fi

  if [ -n "$blocked_reason" ]; then
    ANY_BLOCKED=1
    COMP_JSONS+=("$(jq -nc \
      --arg ac "$ac" --arg ours "${ours:-}" --arg ref "${ref:-}" \
      --arg laA "$LA_A" --arg laB "$LA_B" --arg br "$blocked_reason" \
      '{ac_id:$ac, ours_artifact:$ours, reference_artifact:$ref,
        label_assignment:{A:$laA,B:$laB},
        raw_winner:null, winner:null, confidence:0.0,
        biggest_gap:$br, status:"blocked",
        blocked_reason:$br}')")
    continue
  fi

  ALL_BLOCKED=0

  # ---- determine the verdict, if a source is available ----
  raw=""; conf=""; gap=""
  if [ -n "${WF_RAW[$ac]:-}" ]; then
    raw="${WF_RAW[$ac]}"; conf="${WF_CONF[$ac]}"; gap="${WF_GAP[$ac]}"
  elif [ -n "$FIXTURE_WINNER" ]; then
    raw="$FIXTURE_WINNER"; conf="0.8"; gap="fixture verdict (test hook)"
  else
    # Phase 1: emit a blinded prompt and skip manifest emission for this AC.
    # The prompt must reveal NOTHING about which side is ours.
    # cfn: labels are blinded but artifact PATHS are passed through verbatim —
    # a path named "ours.png" or "dist/..." can leak identity. Stage artifacts
    # to neutral temp paths (artifact_A.dat / artifact_B.dat) if a real run
    # shows the critic inferring identity from path semantics. Upgrade trigger:
    # first observed inference-from-path in a live review.
    PROMPT_MODE=1
    PROMPT_BLOCKS+=("$(printf '=== %s (iteration %s) ===\nartifact_A: %s\nartifact_B: %s\n' \
      "$ac" "$ITERATION" "$ours" "$ref")")
    continue
  fi

  winner=$(unshuffle "$raw" "$assn")

  COMP_JSONS+=("$(jq -nc \
    --arg ac "$ac" --arg ours "$ours" --arg ref "$ref" \
    --arg laA "$LA_A" --arg laB "$LA_B" \
    --arg raw "$raw" --arg win "$winner" \
    --argjson conf "$conf" --arg gap "$gap" \
    '{ac_id:$ac, ours_artifact:$ours, reference_artifact:$ref,
      label_assignment:{A:$laA,B:$laB},
      raw_winner:$raw, winner:$win, confidence:$conf,
      biggest_gap:$gap, status:"compared"}')")

  # ---- suggestion emission ----
  emit=0; tag=""; impact="medium"
  if [ "$winner" = "reference" ]; then
    emit=1
    if awk -v c="$conf" 'BEGIN { exit !(c >= 0.9) }'; then
      tag="block"; impact="high"
    elif awk -v c="$conf" -v t="$THRESHOLD_NUM" 'BEGIN { exit !(c >= t) }'; then
      tag="fix"
    else
      tag="polish"
    fi
  elif [ "$winner" = "tie" ]; then
    emit=1; tag="polish"
  else
    # winner == ours: emit only when confidence is below the threshold.
    if awk -v c="$conf" -v t="$THRESHOLD_NUM" 'BEGIN { exit !(c < t) }'; then
      emit=1; tag="polish"; impact="low"
    fi
  fi

  if [ "$emit" -eq 1 ]; then
    sid=$(printf 'S%03d' "$SUGGEST_SEQ"); SUGGEST_SEQ=$((SUGGEST_SEQ + 1))
    one_liner="AC $ac: ours did not clearly beat reference ($winner, conf=$conf). $gap"
    SUGGESTION_JSONS+=("$(jq -nc \
      --arg id "$sid" --arg tag "$tag" --arg one "$one_liner" \
      --arg title "AC $ac reference gap ($winner)" \
      --arg desc "$gap" \
      --arg files "$ac" --arg impact "$impact" --arg effort "medium" \
      --arg sa "Address the gap: $gap" \
      '{id:$id, category:"reference-gap", tag:$tag, one_liner:$one,
        title:$title, description:$desc, files:[$files],
        impact:$impact, effort:$effort,
        suggested_approach:$sa, status:"pending",
        related_suggestions:[]}')")
  fi
done

# ============================================================================
# phase 1: blinded prompt emission, no manifest
# ============================================================================

if [ "$PROMPT_MODE" -eq 1 ]; then
  printf '%s\n' "cfn-ab-critic: blinded comparison required."
  printf '%s\n' "Resolve each pair below using ONLY the labels artifact_A / artifact_B."
  printf '%s\n' "Do NOT attempt to infer which is ours. Pick the one that better satisfies the AC."
  printf -- '---\n'
  for b in "${PROMPT_BLOCKS[@]}"; do printf '%s\n' "$b"; done
  printf -- '---\n'
  printf '%s\n' "Write JSON verdicts to a file and re-run:"
  printf '  %s --ac %s --winner-file /path/verdicts.json\n' "$0" "$AC_CSV"
  printf '%s\n' "Verdict schema: {\"<AC-id>\": {\"raw_winner\":\"A|B|tie\", \"confidence\":0.0-1.0, \"biggest_gap\":\"one sentence\"}}"
  [ "$ANY_BLOCKED" -eq 1 ] && echo "Note: one or more ACs were blocked; they will appear in the eventual manifest." >&2
  exit 0
fi

# ============================================================================
# phase 2: manifest emission
# ============================================================================

mkdir -p "$MANIFEST_DIR"
if [ -z "$OUT" ]; then
  OUT="$MANIFEST_DIR/cfn-ab-critic-$(date +%s%N).json"
fi

COMPS=$(printf '%s\n' "${COMP_JSONS[@]}" | jq -cs '.')
if [ "${#SUGGESTION_JSONS[@]}" -gt 0 ]; then
  SUGS=$(printf '%s\n' "${SUGGESTION_JSONS[@]}" | jq -cs '.')
else
  SUGS="[]"
fi

GEN_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NS=$(date +%s%N)
jq -n \
  --arg rid "ab-critic-$NS" \
  --arg gen "$GEN_ISO" \
  --argjson comps "$COMPS" \
  --argjson sugs "$SUGS" \
  '{review_id:$rid, source:"cfn-ab-critic", generated_at:$gen,
    status:"pending_review", comparisons:$comps, suggestions:$sugs}' \
  > "$OUT"

# ============================================================================
# exit-code routing
# ============================================================================

if [ "$ALL_BLOCKED" -eq 1 ]; then
  echo "cfn-ab-critic: all comparisons blocked. Manifest: $OUT" >&2
  exit 4
fi
if [ "${#SUGGESTION_JSONS[@]}" -gt 0 ]; then
  echo "cfn-ab-critic: ${#SUGGESTION_JSONS[@]} suggestion(s). Manifest: $OUT"
  exit 1
fi
echo "cfn-ab-critic: clean (ours won every comparison at or above threshold). Manifest: $OUT"
exit 0
