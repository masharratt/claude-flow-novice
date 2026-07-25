#!/usr/bin/env bash
# cfn-a11y-gate - LOCAL accessibility (WCAG) gate. Runs axe-core against rendered
# pages via a headless browser (Playwright) and emits each violation (contrast,
# missing label, keyboard trap, ARIA misuse) as a suggestion in the shared
# cfn-vote-implement manifest schema. NOT a GitHub Action. Never auto-fixes.
#
# Driver: Node + @axe-core/playwright + playwright, which must be PREINSTALLED.
# This skill never installs deps. When the dep is absent it exits 3 with the
# exact install line (see SKILL.md).
#
# Targets: env CFN_A11Y_URLS (comma-separated) OR repeatable --url flag.
# WCAG level: env CFN_A11Y_TAGS (default "wcag2a,wcag2aa").
#
# Exit codes:
#   0  scan ran, no violations (no manifest emitted)
#   1  violations found (manifest emitted)
#   2  usage error (no URLs provided)
#   3  missing dependency: node absent, or a real module-resolution failure for
#      @axe-core/playwright / playwright. Nothing else maps to 3.
#   4  runtime error (browser launch / navigation / runner failure), including
#      any dep-load error that is NOT a module-resolution failure. The original
#      error message is always printed.
#
# Dependency resolution: the deps live in the PROJECT being scanned, not in this
# skill directory. NODE_PATH is built from every node_modules dir found walking
# up from the invocation cwd and the project root, so the runner (which lives in
# the skill dir) resolves the project's copies.
#
# cfn: assumes axe-core is preinstalled. Upgrade trigger: bundle a pinned local
# copy of axe-core under lib/ if cross-project install drift becomes a problem.
set -euo pipefail

INVOKE_DIR="$(pwd)"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# .cjs so the CommonJS require() calls work even under a parent "type": "module"
RUNNER="${SKILL_DIR}/lib/axe-runner.cjs"
cd "$PROJECT_ROOT"

# --- resolve the TARGET PROJECT's node_modules for the runner -----------------
# The runner lives in the skill dir; without this, Node resolves deps relative
# to the skill dir and misses correctly-installed project deps.
collect_node_modules() { # dir -> prints colon-separated node_modules chain
  local dir="$1" acc=""
  while [[ -n "$dir" && "$dir" != "/" ]]; do
    if [[ -d "$dir/node_modules" ]]; then
      acc="${acc:+$acc:}${dir}/node_modules"
    fi
    dir="$(dirname "$dir")"
  done
  printf '%s' "$acc"
}
DISCOVERED_NODE_PATH="$(collect_node_modules "$INVOKE_DIR")"
if [[ "$PROJECT_ROOT" != "$INVOKE_DIR" ]]; then
  ROOT_CHAIN="$(collect_node_modules "$PROJECT_ROOT")"
  [[ -n "$ROOT_CHAIN" ]] && DISCOVERED_NODE_PATH="${DISCOVERED_NODE_PATH:+$DISCOVERED_NODE_PATH:}${ROOT_CHAIN}"
fi
if [[ -n "$DISCOVERED_NODE_PATH" ]]; then
  export NODE_PATH="${DISCOVERED_NODE_PATH}${NODE_PATH:+:$NODE_PATH}"
fi

INSTALL_LINE="npm install --save-dev @axe-core/playwright playwright && npx playwright install chromium"
TAGS="${CFN_A11Y_TAGS:-wcag2a,wcag2aa}"

# --- collect target URLs: --url flags (repeatable) + CFN_A11Y_URLS (CSV) -------
URLS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) shift; [[ $# -gt 0 ]] && URLS+=("$1") ;;
    --url=*) URLS+=("${1#--url=}") ;;
    *) : ;;  # ignore unknown args
  esac
  shift || true
done
if [[ -n "${CFN_A11Y_URLS:-}" ]]; then
  IFS=',' read -r -a CSV <<< "$CFN_A11Y_URLS"
  for u in "${CSV[@]}"; do
    u="$(echo "$u" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [[ -n "$u" ]] && URLS+=("$u")
  done
fi

if [[ "${#URLS[@]}" -eq 0 ]]; then
  echo "cfn-a11y-gate: no target URLs."
  echo "  Provide URLs via env or flag:"
  echo "    CFN_A11Y_URLS=\"http://localhost:3000,http://localhost:3000/about\" ./.claude/skills/cfn-a11y-gate/execute.sh"
  echo "    ./.claude/skills/cfn-a11y-gate/execute.sh --url http://localhost:3000 --url http://localhost:3000/about"
  exit 2
fi

# --- dependency gate: node + axe-core/playwright must be preinstalled ----------
if ! command -v node >/dev/null 2>&1; then
  echo "cfn-a11y-gate: node is not installed. This gate needs Node + axe-core."
  echo "  Install axe-core after Node is available:"
  echo "    $INSTALL_LINE"
  exit 3
fi
# NODE_PATH-aware, and narrowed: ONLY a real module-resolution failure exits 3.
# Any other failure is a genuine runtime error and is reported verbatim as 4.
DEP_PROBE='
var deps = ["@axe-core/playwright", "playwright"];
try {
  deps.forEach(function (d) { require.resolve(d); });
} catch (err) {
  var code = err && err.code;
  var msg = (err && err.message) || String(err);
  var missing = (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND")
    && deps.some(function (d) { return msg.indexOf(d) !== -1; });
  process.stderr.write(msg + "\n");
  process.exit(missing ? 3 : 4);
}
'
set +e
DEP_ERR=$(node -e "$DEP_PROBE" 2>&1 >/dev/null)
DEP_RC=$?
set -e
if [[ "$DEP_RC" -eq 3 ]]; then
  echo "cfn-a11y-gate: axe-core / playwright not installed (dependency gate)."
  echo "  Looked in: ${NODE_PATH:-<no node_modules found from $INVOKE_DIR>}"
  echo "  This skill never installs deps. Install them, then re-run:"
  echo "    $INSTALL_LINE"
  exit 3
fi
if [[ "$DEP_RC" -ne 0 ]]; then
  echo "cfn-a11y-gate: dependency probe failed with a real error (NOT a missing dependency):"
  echo "$DEP_ERR" | sed 's/^/  /'
  exit 4
fi

# --- run the axe runner -------------------------------------------------------
echo "cfn-a11y-gate: scanning ${#URLS[@]} URL(s) with tags [$TAGS]"
RUNNER_ERR=$(mktemp)
trap 'rm -f "$RUNNER_ERR"' EXIT
set +e
RUNNER_OUT=$(CFN_A11Y_TAGS="$TAGS" node "$RUNNER" "${URLS[@]}" 2>"$RUNNER_ERR")
RC=$?
set -e
if [[ "$RC" -eq 3 ]]; then
  # runner exits 3 only on a real module-resolution failure for its two deps
  echo "cfn-a11y-gate: axe-core / playwright not installed (runner gate)."
  sed 's/^/  /' "$RUNNER_ERR" || true
  echo "    $INSTALL_LINE"
  exit 3
fi
if [[ "$RC" -ne 0 ]]; then
  echo "cfn-a11y-gate: runner failed (exit $RC):"
  sed 's/^/  /' "$RUNNER_ERR" || true
  exit 4
fi
if ! echo "$RUNNER_OUT" | jq -e . >/dev/null 2>&1; then
  echo "cfn-a11y-gate: runner produced invalid JSON."
  exit 4
fi

VIOL_COUNT=$(echo "$RUNNER_OUT" | jq '.violations | length')
echo "  violations found: $VIOL_COUNT"

if [[ "$VIOL_COUNT" -eq 0 ]]; then
  echo
  echo "No accessibility violations. No manifest emitted."
  exit 0
fi

# --- emit manifest in the shared cfn-vote-implement schema --------------------
MANIFEST_DIR="${PROJECT_ROOT}/.cfn-cache/manifests"
mkdir -p "$MANIFEST_DIR"
GITIGNORE="${PROJECT_ROOT}/.gitignore"
grep -qxE '\.cfn-cache/?' "$GITIGNORE" 2>/dev/null || printf '\n# CFN local cache\n.cfn-cache/\n' >> "$GITIGNORE"
TS=$(date +%s%N 2>/dev/null || echo "$(date +%s)-$$")
MANIFEST_PATH="${MANIFEST_DIR}/cfn-a11y-gate-${TS}.json"

# map axe impact -> manifest impact + tag; build one suggestion per violation
suggestions=$(echo "$RUNNER_OUT" | jq '
  def impact_map: (if . == "critical" or . == "serious" then "high"
                   elif . == "moderate" then "medium" else "low" end);
  def tag_map:    (if . == "critical" or . == "serious" then "block"
                   elif . == "moderate" then "fix" else "harden" end);
  [.violations[] | {
    rule, impact, help, description, helpUrl, selector, url, failureSummary
  }]
  | to_entries
  | map({
      id: ("S" + (1000 + .key + 1 | tostring | .[1:])),
      category: .value.rule,
      tag: (.value.impact | tag_map),
      one_liner: (.value.url + " " + (.value.selector // "") + ": " + .value.rule + ": " + .value.help),
      title: (.value.rule + ": " + .value.help),
      description: .value.description,
      files: [ (.value.url + " :: " + (.value.selector // "(page)")) ],
      impact: (.value.impact | impact_map),
      effort: "low",
      suggested_approach: (
        (if (.value.failureSummary // "") != "" then .value.failureSummary + " " else "" end)
        + (if (.value.helpUrl // "") != "" then "See " + .value.helpUrl else "" end)
        | if . == "" then "Fix the violation per the axe rule." else . end
      ),
      status: "pending",
      related_suggestions: []
    })
  | sort_by(.impact)
')

urls_json=$(printf '%s\n' "${URLS[@]}" | jq -R . | jq -s '.')

jq -n \
  --arg review_id "a11y-gate-${TS}" \
  --arg source "cfn-a11y-gate" \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg wcag_tags "$TAGS" \
  --argjson urls_scanned "$urls_json" \
  --argjson suggestions "$suggestions" \
  '{
    review_id: $review_id,
    source: $source,
    generated_at: $generated_at,
    status: "pending_review",
    wcag_tags: $wcag_tags,
    urls_scanned: $urls_scanned,
    suggestions: $suggestions
  }' > "$MANIFEST_PATH"

echo
echo "  manifest: $MANIFEST_PATH"
echo
echo "Next: /cfn-vote-implement latest  (block-tagged a11y violations are merge blockers)."
exit 1
