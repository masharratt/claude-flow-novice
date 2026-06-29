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
#   3  missing dependency (node / @axe-core/playwright / playwright absent)
#   4  runtime error (browser launch / navigation / runner failure)
#
# cfn: assumes axe-core is preinstalled. Upgrade trigger: bundle a pinned local
# copy of axe-core under lib/ if cross-project install drift becomes a problem.
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="${SKILL_DIR}/lib/axe-runner.js"
cd "$PROJECT_ROOT"

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
if ! node -e "require.resolve('@axe-core/playwright'); require.resolve('playwright')" >/dev/null 2>&1; then
  echo "cfn-a11y-gate: axe-core / playwright not installed (dependency gate)."
  echo "  This skill never installs deps. Install them, then re-run:"
  echo "    $INSTALL_LINE"
  exit 3
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
  echo "cfn-a11y-gate: axe-core / playwright not installed (runner gate)."
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
