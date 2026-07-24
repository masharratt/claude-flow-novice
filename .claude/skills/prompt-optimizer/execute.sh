#!/usr/bin/env bash
# prompt-optimizer shared engine entry point.
#
# Usage: ./execute.sh <target-id> [--dry-run] [--budget=N] [--max-iters=N] [--patience=N]
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
