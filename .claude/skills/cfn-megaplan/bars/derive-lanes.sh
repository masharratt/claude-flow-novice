#!/usr/bin/env bash
# Bar helper - mechanical lane + wave derivation for cfn-loop-task PHASE 2.
#
# Replaces the model-side derivation of cfn-loop-task.md LANE DERIVATION steps 2-6
# (one lane per phase, LANE_CAP merge, wide-phase file-cluster split, exclusive file
# ownership, produce/consume edges, cycle merge, topological waves). Measured
# 2026-08-20: a coordinator spent ~53k context tokens across 14 python heredocs
# re-deriving this for a 165-step plan. It is a graph computation with one answer.
#
# Usage:  derive-lanes.sh <planning/<slug>/PLAN_<slug>.md> [options]
#   --lane-cap N       max concurrent lanes per wave slot   (default 8)
#   --max-steps N      per-lane step cap before split       (default 15)
#   --max-files M      per-lane distinct-file cap           (default 8)
#   --min-sublane N    never split below this many steps    (default 5)
#   --hub-min-steps N  writers before a file counts as a hub (default 10)
#   --hub-split        give a hub file one owner lane and order the rest behind it
#                      (trades strict exclusive ownership for parallelism)
#   --quiet            JSON only, no stderr log lines
#
# Output: one JSON object on stdout with keys
#   plan lane_cap lanes[] edges[] waves[] logs[] blockers[] hubs[]
#   lanes[]: {id, phase, steps[], files[], shared_hub_files[], produces[], consumes[]}
#   waves[]: ordered list of lane-id slots; each slot is <= lane_cap lanes to spawn
#            in parallel. Spawn slot N only after slot N-1 reports.
#   Human-readable log lines (phase-split, file-merge, cycle-merge, cap-merge, hub,
#   dangling consume, wave N) go to stderr.
#
# Exit:   0 = lanes derived clean
#         1 = blocker present (duplicate producer across lanes) - JSON still emitted,
#             surface one AskUserQuestion for ownership before spawning
#         2 = usage / file not found / no step rows / python3 missing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPL="$SCRIPT_DIR/derive_lanes.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 required by derive-lanes.sh" >&2
  exit 2
fi
if [ ! -f "$IMPL" ]; then
  echo "error: missing implementation: $IMPL" >&2
  exit 2
fi

exec python3 "$IMPL" "$@"
