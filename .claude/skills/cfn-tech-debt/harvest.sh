#!/bin/bash
# cfn-tech-debt harvest: collect `cfn:` shortcut markers into a ledger.
# Valid marker:   cfn: <ceiling>, <upgrade trigger>
# no-trigger rot: cfn: <ceiling>            (no comma -> upgrade: NONE)
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

PERSIST=0
[[ "${1:-}" == "--persist" ]] && PERSIST=1

MARKERS=$(grep -rnE '(#|//|--|/\*) ?cfn:' . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage \
  --exclude-dir=worktrees --exclude-dir=.artifacts 2>/dev/null || true)

if [[ -z "$MARKERS" ]]; then
  echo "No cfn: debt. Clean ledger."
  exit 0
fi

LEDGER=$(echo "$MARKERS" | awk -F: '
{
  file=$1; line=$2;
  idx=index($0, "cfn:");
  body=substr($0, idx+4);
  gsub(/^[ \t]+/, "", body); gsub(/\*\/.*$/, "", body); gsub(/[ \t]+$/, "", body);
  ci=index(body, ",");
  if (ci > 0) {
    ceiling=substr(body, 1, ci-1);
    trigger=substr(body, ci+1);
    gsub(/^[ \t]+/, "", trigger); gsub(/[ \t]+$/, "", trigger);
  } else {
    ceiling=body; trigger="NONE";
  }
  printf "%s:%s: ceiling: %s. upgrade: %s.\n", file, line, ceiling, trigger;
}' | sort)

TOTAL=$(echo "$LEDGER" | grep -c . || true)
NOTRIG=$(echo "$LEDGER" | grep -c 'upgrade: NONE\.$' || true)

echo "$LEDGER"
echo
echo "$TOTAL markers, $NOTRIG with no trigger."

# Machine-readable ledger (always written; feeds cfn-megaplan scoping). Lives in
# the gitignored .cfn-cache/ per the project manifest convention, so a harvest run
# never dirties tracked files. cfn-megaplan READS this; it never re-harvests.
if command -v jq >/dev/null 2>&1; then
  CACHE_DIR="${PROJECT_ROOT}/.cfn-cache"
  LEDGER_JSON="${CACHE_DIR}/tech-debt-ledger.json"
  mkdir -p "$CACHE_DIR"
  GITIGNORE="${PROJECT_ROOT}/.gitignore"
  grep -qxE '\.cfn-cache/?' "$GITIGNORE" 2>/dev/null \
    || printf '\n# CFN local cache\n.cfn-cache/\n' >> "$GITIGNORE"

  # Re-parse raw markers into TSV (file, line, ceiling, trigger), then jq -R for
  # correct JSON escaping. Empty trigger -> null + has_trigger:false (rot flag).
  TSV=$(echo "$MARKERS" | awk -F: '
  {
    file=$1; line=$2;
    idx=index($0, "cfn:");
    body=substr($0, idx+4);
    gsub(/^[ \t]+/, "", body); gsub(/\*\/.*$/, "", body); gsub(/[ \t]+$/, "", body);
    ci=index(body, ",");
    if (ci > 0) {
      ceiling=substr(body, 1, ci-1);
      trigger=substr(body, ci+1);
      gsub(/^[ \t]+/, "", trigger); gsub(/[ \t]+$/, "", trigger);
    } else {
      ceiling=body; trigger="";
    }
    printf "%s\t%s\t%s\t%s\n", file, line, ceiling, trigger;
  }' | sort)

  MARKERS_JSON=$(echo "$TSV" | jq -R -s '
    split("\n") | map(select(length > 0)) | map(split("\t")) |
    map({
      file: .[0],
      line: (.[1] | tonumber),
      ceiling: .[2],
      upgrade_trigger: (if .[3] == "" then null else .[3] end),
      has_trigger: (.[3] != "")
    })')

  jq -n \
    --argjson markers "$MARKERS_JSON" \
    --arg generated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      generated: $generated,
      total: ($markers | length),
      no_trigger: ([$markers[] | select(.has_trigger == false)] | length),
      markers: $markers
    }' > "$LEDGER_JSON"

  echo
  echo "Machine ledger written to $LEDGER_JSON"
fi

if [[ "$PERSIST" == "1" ]]; then
  OUT="docs/TECH_DEBT.md"
  mkdir -p docs
  {
    echo "# Tech Debt Ledger"
    echo
    echo "Harvested \`cfn:\` shortcut markers. Regenerate: \`./.claude/skills/cfn-tech-debt/harvest.sh --persist\`"
    echo
    echo "$LEDGER" | sed 's/^/- /'
    echo
    echo "**$TOTAL markers, $NOTRIG with no trigger.**"
  } > "$OUT"
  echo
  echo "Ledger written to $OUT"
fi
