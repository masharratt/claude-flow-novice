#!/usr/bin/env bash
# cfn-perf-gate - performance regression gate.
# Runs CFN_PERF_BENCH_CMD, compares output against a stored baseline, and
# emits a cfn-vote-implement manifest for every benchmark path that regressed
# beyond CFN_PERF_THRESHOLD_PCT percent. Never auto-fixes.
#
# Exit codes:
#   0  - baseline recorded (first run or --update-baseline), OR no regressions found
#   1  - config or execution error (CFN_PERF_BENCH_CMD unset, bad output, etc.)
#   2  - regressions found; manifest emitted to .cfn-cache/manifests/
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

THRESHOLD_PCT="${CFN_PERF_THRESHOLD_PCT:-10}"
BASELINE_PATH="${PROJECT_ROOT}/.cfn-cache/perf-baseline.json"
MANIFEST_DIR="${PROJECT_ROOT}/.cfn-cache/manifests"

# --- arg parsing
UPDATE_BASELINE=0
for arg in "$@"; do
  case "$arg" in
    --update-baseline) UPDATE_BASELINE=1 ;;
    *) : ;;
  esac
done

# --- require CFN_PERF_BENCH_CMD -----------------------------------------------
if [[ -z "${CFN_PERF_BENCH_CMD:-}" ]]; then
  echo "cfn-perf-gate: CFN_PERF_BENCH_CMD is not set." >&2
  echo "  Set it to a shell command that outputs a flat JSON object:" >&2
  echo "    {\"<benchmark-name>\": <number>, ...}" >&2
  echo "  where each value is a numeric measurement (milliseconds or any consistent unit)." >&2
  exit 1
fi

# --- setup dirs + gitignore ---------------------------------------------------
GITIGNORE="${PROJECT_ROOT}/.gitignore"
grep -qxE '\.cfn-cache/?' "$GITIGNORE" 2>/dev/null \
  || printf '\n# CFN local cache\n.cfn-cache/\n' >> "$GITIGNORE"
mkdir -p "$MANIFEST_DIR" "${PROJECT_ROOT}/.cfn-cache"

# --- run benchmark ------------------------------------------------------------
echo "cfn-perf-gate: running benchmark..."
# cfn: flat {name: number} JSON shape assumed; upgrade trigger: need for multi-metric (p50/p99) baselines
BENCH_OUTPUT=""
if ! BENCH_OUTPUT=$(eval "$CFN_PERF_BENCH_CMD" 2>&1); then
  echo "cfn-perf-gate: benchmark command exited with an error." >&2
  echo "$BENCH_OUTPUT" >&2
  exit 1
fi

if ! echo "$BENCH_OUTPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "cfn-perf-gate: benchmark output is not a valid JSON object." >&2
  echo "  Expected: {\"<name>\": <number>, ...}" >&2
  echo "  Got: $BENCH_OUTPUT" >&2
  exit 1
fi

# --- --update-baseline --------------------------------------------------------
if [[ "$UPDATE_BASELINE" -eq 1 ]]; then
  echo "$BENCH_OUTPUT" | jq '.' > "$BASELINE_PATH"
  echo "cfn-perf-gate: baseline updated."
  echo "  baseline: $BASELINE_PATH"
  exit 0
fi

# --- first run: no baseline exists --------------------------------------------
if [[ ! -f "$BASELINE_PATH" ]]; then
  echo "$BENCH_OUTPUT" | jq '.' > "$BASELINE_PATH"
  echo "cfn-perf-gate: no baseline found. Recorded current results as baseline."
  echo "  baseline: $BASELINE_PATH"
  echo "  Re-run after your changes to detect regressions."
  exit 0
fi

# --- compare against baseline -------------------------------------------------
echo "cfn-perf-gate: comparing against baseline (threshold: ${THRESHOLD_PCT}%)..."

suggestions=$(
  jq -n \
    --slurpfile baseline "$BASELINE_PATH" \
    --argjson current "$BENCH_OUTPUT" \
    --argjson threshold "$THRESHOLD_PCT" \
    '
    $baseline[0] | to_entries |
    map(
      . as $entry |
      select(
        ($current | has($entry.key)) and
        ($entry.value | type == "number") and
        $entry.value > 0 and
        (($current[$entry.key] - $entry.value) / $entry.value * 100) > $threshold
      ) |
      {
        key: $entry.key,
        baseline_ms: $entry.value,
        current_ms: $current[$entry.key],
        regression_pct: ((($current[$entry.key] - $entry.value) / $entry.value * 100) * 100 | floor | . / 100)
      }
    ) |
    to_entries |
    map({
      id: ("S" + (1000 + .key + 1 | tostring | .[1:])),
      category: "perf_regression",
      tag: "fix",
      one_liner: (.value.key + ": regressed " + (.value.regression_pct | tostring) + "% (baseline " + (.value.baseline_ms | tostring) + ", current " + (.value.current_ms | tostring) + ")"),
      title: ("perf regression: " + .value.key),
      description: (.value.key + " regressed " + (.value.regression_pct | tostring) + "% above the " + ($threshold | tostring) + "% threshold. Baseline: " + (.value.baseline_ms | tostring) + ". Current: " + (.value.current_ms | tostring) + "."),
      files: [],
      impact: (if .value.regression_pct > 50 then "high" elif .value.regression_pct > 20 then "medium" else "low" end),
      effort: "medium",
      suggested_approach: ("Profile " + .value.key + " to identify the regression. Compare the diff since baseline was recorded. Optimize the hot path or revert the regressing change."),
      related_suggestions: []
    })
    '
)

REGRESSION_COUNT=$(echo "$suggestions" | jq 'length')
echo "cfn-perf-gate: regressions found: $REGRESSION_COUNT (threshold: ${THRESHOLD_PCT}%)"

if [[ "$REGRESSION_COUNT" -eq 0 ]]; then
  echo "  No regressions. No manifest emitted."
  exit 0
fi

# --- emit manifest ------------------------------------------------------------
TS=$(date +%s%N 2>/dev/null || echo "$(date +%s)-$$")
MANIFEST_PATH="${MANIFEST_DIR}/cfn-perf-gate-${TS}.json"

jq -n \
  --arg review_id "perf-gate-${TS}" \
  --arg source "cfn-perf-gate" \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson threshold_pct "$THRESHOLD_PCT" \
  --arg baseline_file "$BASELINE_PATH" \
  --argjson regression_count "$REGRESSION_COUNT" \
  --argjson suggestions "$suggestions" \
  '{
    review_id: $review_id,
    source: $source,
    generated_at: $generated_at,
    threshold_pct: $threshold_pct,
    baseline_file: $baseline_file,
    regression_count: $regression_count,
    suggestions: $suggestions
  }' > "$MANIFEST_PATH"

echo "  manifest: $MANIFEST_PATH"
echo
echo "Next: /cfn-vote-implement latest"
exit 2
