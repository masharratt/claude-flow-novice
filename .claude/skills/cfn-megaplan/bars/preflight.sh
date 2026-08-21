#!/usr/bin/env bash
# Bar helper - pre-loop readiness scan of a plan directory.
#
# Answers "what in this plan still needs a human before /cfn-loop-task starts" in
# bounded output. Measured 2026-08-20: a coordinator answered that same question by
# grepping SPEC/DECISIONS/PLAN in the main chat for ~41k context tokens across 26 bash
# calls (one grep returned 7.1k tokens on its own). Run this instead, then act on it.
#
# It is a section scan, not a keyword grep: a heading that announces open work
# (escalations, still open, parked, unresolved, open questions, defects not patched)
# contributes its items; the same heading qualified as answered / resolved / closed /
# decided / retired / not re-litigated does not.
#
# Usage:  preflight.sh --plan-dir planning/<slug> [--json]
#         preflight.sh --slug <slug> [--json]        # resolves planning/<slug>
#
# Output: compact human report on stdout (under ~3k chars, items capped per section),
#         or the full structure with --json:
#           slug plan_dir artifacts{} missing_artifacts[] open_sections[]
#           open_item_count open_blocking_deferrals needs_human
#
# Exit:   0 = clear to start
#         1 = needs a human (open items, open blocking deferrals, or a missing
#             required artifact). Resolve or explicitly accept each one, record the
#             answers in DECISIONS, then re-run.
#         2 = usage / plan dir not found / python3 missing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPL="$SCRIPT_DIR/preflight.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 required by preflight.sh" >&2
  exit 2
fi
if [ ! -f "$IMPL" ]; then
  echo "error: missing implementation: $IMPL" >&2
  exit 2
fi

exec python3 "$IMPL" "$@"
