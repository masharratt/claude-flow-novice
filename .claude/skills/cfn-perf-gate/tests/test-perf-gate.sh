#!/usr/bin/env bash
# test-perf-gate.sh - self-contained tests for cfn-perf-gate/execute.sh.
# Uses fake CFN_PERF_BENCH_CMD (echo a JSON literal) so no real benchmark tool needed.
# Must be run from the project root or any subdirectory of a git repo.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXECUTE="$SKILL_DIR/execute.sh"

# --- temp git repo for isolation
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT
git -C "$TMPROOT" init -q
git -C "$TMPROOT" commit --allow-empty -m "init" -q 2>/dev/null || true

PASS=0
FAIL=0

ok() {
  echo "  PASS: $1"
  PASS=$((PASS + 1))
}
fail() {
  echo "  FAIL: $1"
  FAIL=$((FAIL + 1))
}
check() {
  local desc="$1"
  local expr="$2"
  if eval "$expr" >/dev/null 2>&1; then ok "$desc"; else fail "$desc"; fi
}

# Helper: run execute.sh inside the temp repo, capture exit code only
run_gate() {
  local code=0
  (cd "$TMPROOT" && "$EXECUTE" "$@") >/dev/null 2>&1 || code=$?
  echo "$code"
}

# --- write bench helper scripts into temp dir
cat > "$TMPROOT/bench-fast.sh" << 'EOF'
#!/usr/bin/env bash
printf '{"api_endpoint": 100, "db_query": 50}'
EOF
chmod +x "$TMPROOT/bench-fast.sh"

cat > "$TMPROOT/bench-within-threshold.sh" << 'EOF'
#!/usr/bin/env bash
# api_endpoint +5%, db_query +4%: both below 10% threshold
printf '{"api_endpoint": 105, "db_query": 52}'
EOF
chmod +x "$TMPROOT/bench-within-threshold.sh"

cat > "$TMPROOT/bench-slow.sh" << 'EOF'
#!/usr/bin/env bash
# api_endpoint +60% (regresses), db_query +4% (within threshold)
printf '{"api_endpoint": 160, "db_query": 52}'
EOF
chmod +x "$TMPROOT/bench-slow.sh"

cat > "$TMPROOT/bench-bad.sh" << 'EOF'
#!/usr/bin/env bash
printf 'not json'
EOF
chmod +x "$TMPROOT/bench-bad.sh"

# =============================================================================
echo "[1] exits 1 when CFN_PERF_BENCH_CMD is not set"
unset CFN_PERF_BENCH_CMD 2>/dev/null || true
code=$(run_gate 2>/dev/null)
check "exits 1 when CFN_PERF_BENCH_CMD unset" "[[ $code -eq 1 ]]"

# =============================================================================
echo "[2] first run records baseline, exits 0"
export CFN_PERF_BENCH_CMD="$TMPROOT/bench-fast.sh"
code=$(run_gate 2>/dev/null)
check "exits 0 on first run" "[[ $code -eq 0 ]]"
check "baseline file created" "[[ -f '$TMPROOT/.cfn-cache/perf-baseline.json' ]]"
check "baseline is valid JSON" "jq -e . '$TMPROOT/.cfn-cache/perf-baseline.json'"
check "baseline contains api_endpoint=100" "jq -e '.api_endpoint == 100' '$TMPROOT/.cfn-cache/perf-baseline.json'"

# =============================================================================
echo "[3] no regression when within threshold, exits 0, no manifest"
export CFN_PERF_BENCH_CMD="$TMPROOT/bench-within-threshold.sh"
code=$(run_gate 2>/dev/null)
check "exits 0 when within threshold" "[[ $code -eq 0 ]]"
MANIFEST_COUNT=$(find "$TMPROOT/.cfn-cache/manifests" -name "cfn-perf-gate-*.json" 2>/dev/null | wc -l)
check "no manifest emitted for within-threshold run" "[[ $MANIFEST_COUNT -eq 0 ]]"

# =============================================================================
echo "[4] regression emits manifest and exits 2"
export CFN_PERF_BENCH_CMD="$TMPROOT/bench-slow.sh"
code=$(run_gate 2>/dev/null)
check "exits 2 when regression found" "[[ $code -eq 2 ]]"

MANIFEST=$(ls "$TMPROOT/.cfn-cache/manifests/cfn-perf-gate-"*.json 2>/dev/null | head -1 || true)
check "manifest file created with cfn-perf-gate prefix" "[[ -n '$MANIFEST' ]]"

if [[ -n "$MANIFEST" ]]; then
  check "manifest is valid JSON" "jq -e . '$MANIFEST'"
  check "source is cfn-perf-gate" "jq -e '.source == \"cfn-perf-gate\"' '$MANIFEST'"
  check "review_id present" "jq -e '.review_id' '$MANIFEST'"
  check "generated_at present" "jq -e '.generated_at' '$MANIFEST'"
  check "threshold_pct present" "jq -e '.threshold_pct' '$MANIFEST'"
  check "suggestions is array" "jq -e '.suggestions | type == \"array\"' '$MANIFEST'"
  check "suggestions non-empty" "jq -e '(.suggestions | length) > 0' '$MANIFEST'"
  check "suggestion.id present" "jq -e '.suggestions[0].id' '$MANIFEST'"
  check "suggestion.category is perf_regression" "jq -e '.suggestions[0].category == \"perf_regression\"' '$MANIFEST'"
  check "suggestion.title present" "jq -e '.suggestions[0].title' '$MANIFEST'"
  check "suggestion.description present" "jq -e '.suggestions[0].description' '$MANIFEST'"
  check "suggestion.impact present" "jq -e '.suggestions[0].impact' '$MANIFEST'"
  check "suggestion.effort present" "jq -e '.suggestions[0].effort' '$MANIFEST'"
  check "suggestion.suggested_approach present" "jq -e '.suggestions[0].suggested_approach' '$MANIFEST'"
  check "suggestion.related_suggestions is array" "jq -e '.suggestions[0].related_suggestions | type == \"array\"' '$MANIFEST'"
  # api_endpoint regressed 60%, db_query only 4% (within threshold): only 1 suggestion
  check "only regressed path flagged (1 suggestion for 60% regression)" "jq -e '(.suggestions | length) == 1' '$MANIFEST'"
  check "flagged path is api_endpoint" "jq -e '.suggestions[0].title | contains(\"api_endpoint\")' '$MANIFEST'"
fi

# =============================================================================
echo "[5] --update-baseline updates baseline and exits 0"
export CFN_PERF_BENCH_CMD="$TMPROOT/bench-slow.sh"
code=$(run_gate --update-baseline 2>/dev/null)
check "exits 0 with --update-baseline" "[[ $code -eq 0 ]]"
check "baseline updated to slow values" "jq -e '.api_endpoint == 160' '$TMPROOT/.cfn-cache/perf-baseline.json'"

# =============================================================================
echo "[6] exits 1 on bad (non-JSON) bench output"
export CFN_PERF_BENCH_CMD="$TMPROOT/bench-bad.sh"
code=$(run_gate 2>/dev/null)
check "exits 1 on non-JSON bench output" "[[ $code -eq 1 ]]"

# =============================================================================
echo
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
