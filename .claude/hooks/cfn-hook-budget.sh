#!/bin/bash
# Shared wall-clock budget for the PreToolUse search hooks.
#
# Both search hooks are registered with "timeout": 5 in ~/.claude/settings.local.json.
# Their own per-step guards used to sum far past that (bash-search 11s,
# smart-search 13s), and a plain `timeout N` does not actually bound a step.
# Two dependency behaviours defeat it, both measured against a 2s limit:
#
#   1. A dependency that ignores SIGTERM. `timeout N` sends only SIGTERM and
#      then waits for its child indefinitely.                    -> 10002ms
#   2. A dependency whose grandchild escapes the process group (setsid) while
#      holding the inherited stdout. `timeout` itself returns on schedule, but
#      a pipeline or command substitution reading that stdout then blocks
#      waiting for EOF on a pipe the straggler still holds open. -> 15336ms
#
# So a bounded step must do BOTH:
#   (a) use `timeout -k` so SIGKILL follows SIGTERM, and
#   (b) write stdout to a regular FILE, never a pipe, so a straggler holding
#       the inherited fd cannot block the reader. Post-process the file after.
#
# Fixing only (a) still hangs on case 2; fixing only (b) still hangs on case 1.

CFN_HOOK_KILL_GRACE_MS=300
CFN_HOOK_KILL_GRACE=0.3

# Monotonic milliseconds, from /proc/uptime.
#
# `date` reports CLOCK_REALTIME, which is NOT monotonic on this host: after one
# of the stalls described below the wall clock resynchronises and can jump
# backwards (a test measuring with `date` recorded an elapsed time of -1533ms).
# A backwards jump would silently push the deadline further out, removing the
# bound exactly when it is needed most.
cfn_now_ms() {
    local up
    read -r up _ < /proc/uptime
    echo $(( ${up%.*} * 1000 + 10#${up#*.} * 10 ))
}

# Degrade to CLOCK_REALTIME only where /proc/uptime does not exist (non-Linux).
if ! [ -r /proc/uptime ]; then
    cfn_now_ms() { echo $(( $(date +%s) * 1000 )); }
fi

# cfn_budget_init [total_ms] -- start the clock for this hook invocation.
#
# Default 3000ms against a registered timeout of 5000ms. The 2s of headroom is
# deliberate: this host intermittently stalls an arbitrary process for ~3.3s
# (a bare `sleep 2` measured 5336ms on 2 of 30 runs under load), and no
# userspace deadline can bound wall-clock time through a stall like that. The
# budget only bites when a dependency is slow -- healthy deps finish in
# milliseconds and every step still runs -- so buying headroom costs nothing in
# the normal case.
cfn_budget_init() {
    CFN_HOOK_BUDGET_MS="${1:-${CFN_SEARCH_HOOK_BUDGET_MS:-3000}}"
    CFN_HOOK_DEADLINE_MS=$(( $(cfn_now_ms) + CFN_HOOK_BUDGET_MS ))
}

# cfn_budget <preferred_ms> -- seconds available for the next step, as a decimal
# string, capped by the remaining budget and reserving the SIGKILL grace so the
# kill still lands before the deadline.
#
# Returns 1 and prints nothing when the budget cannot cover another step. The
# caller MUST skip the step in that case: `timeout 0` means NO time limit in
# coreutils, so passing a floored-to-zero budget would remove the bound entirely.
cfn_budget() {
    local want_ms="$1" left_ms
    left_ms=$(( CFN_HOOK_DEADLINE_MS - $(cfn_now_ms) - CFN_HOOK_KILL_GRACE_MS ))
    [ "$left_ms" -le 0 ] && return 1
    [ "$want_ms" -gt "$left_ms" ] && want_ms="$left_ms"
    [ "$want_ms" -le 0 ] && return 1
    printf '%d.%03d' $(( want_ms / 1000 )) $(( want_ms % 1000 ))
}

# cfn_run_bounded <seconds> <outfile> <cmd...>
# Run cmd with stdout captured to outfile, hard-bounded at <seconds> + grace.
# The braces plus redirect swallow the shell's "Killed" job-control chatter,
# which would otherwise land on the hook's stderr -- the same stream the harness
# reads for a blocking exit 2.
cfn_run_bounded() {
    local limit="$1" out="$2"; shift 2
    : > "$out"
    { timeout -k "$CFN_HOOK_KILL_GRACE" "$limit" "$@" > "$out" 2>/dev/null; } 2>/dev/null || true
}
