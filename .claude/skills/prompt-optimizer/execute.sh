#!/usr/bin/env bash
# prompt-optimizer shared engine entry point.
#
# Usage: ./execute.sh <target-id> [--dry-run] [--apply] [--budget=N] [--lifetime-budget=N]
#                     [--max-iters=N] [--patience=N] [--holdout-repeats=N]
#
# --apply (default OFF) auto-applies a real winning template back into the
# target's own source file, replacing the region between
#   // PROMPT-OPTIMIZER:START id=<target-id>
#   // PROMPT-OPTIMIZER:END
# A target opts in by declaring sourceFile + varMap + assignmentVar together
# (see types.ts / SKILL.md). The patch is attempted ONLY when --apply was
# passed AND the target declares sourceFile AND the run was not --dry-run
# AND the holdout gate produced a real win (not OVERFIT, not HOLDOUT
# INCONCLUSIVE, and the final template actually differs from the baseline).
# A refused or unchanged result never reaches a real source file. The old
# region is backed up first, under backups/<id>-<ISO-timestamp>.txt (distinct
# from the .md template backups). Any patch failure (missing file, missing
# or malformed sentinels, any other error) is caught, reported as a warning,
# and recorded in the run report; it never fails the run. Targets that
# declare no sourceFile are unaffected regardless of this flag.
#
# --budget=N (default 5.0) caps THIS run only. _budget.json is one ledger,
# per-project, SHARED across every target, whose spentUsd persists across
# every run forever. --budget is compared only against this run's own fresh
# spend (starts at 0 every invocation), never against that cumulative total.
#
# --lifetime-budget=N (default: unset, no lifetime ceiling) is an OPTIONAL
# absolute cap across every run that ever wrote to the ledger, for when you
# want a hard stop on total project spend in addition to the per-run cap.
#
# --holdout-repeats=N (default 2) only takes effect when the target declares a
# non-zero `evalTemperature`: the holdout baseline AND the holdout final are
# each re-scored N times, and the candidate must beat the baseline on EVERY
# repeat. Winning on some repeats but not others means the measured win sits
# inside the run-to-run noise floor, and the engine refuses it as INCONCLUSIVE.
#
# Resolves the PROJECT-LOCAL plugin from the CALLER's cwd
# (<cwd>/.claude/prompt-optimizer/config.json), never from this script's own
# location (BLOCKER-1: this skill dir is shared/symlinked read-only code).
# Run this from inside the consuming project, e.g.:
#   cd /path/to/your-project && /path/to/prompt-optimizer/execute.sh my-target --dry-run
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_ENTRY="$SKILL_DIR/engine/optimize.ts"

if [[ ! -f "$ENGINE_ENTRY" ]]; then
  echo "Error: engine entry not found at $ENGINE_ENTRY" >&2
  exit 1
fi

# Deliberately do NOT cd anywhere: engine/paths.ts resolves every writable
# path relative to process.cwd(), which must stay the CALLER's project.
exec npx tsx "$ENGINE_ENTRY" "$@"
