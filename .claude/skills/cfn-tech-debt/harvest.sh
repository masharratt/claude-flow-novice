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
