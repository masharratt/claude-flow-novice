#!/usr/bin/env bash
# lib/help.sh - help text + exit-code constants for cfn-decisions/record.sh.
#
# Sourced by record.sh. Defines the canonical exit-code enum (ARCH §10.1) and
# the --help output (FR-8 no-DELETE floor; FR-9 no-leak floor).
#
# Exit-code semantics (D-7/D-8 contract):
#   0  success: JSON written AND SQLite row synced.
#   1  validation failure (FR-3): missing/empty/whitespace required field.
#   2  CLI parse failure: unknown flag, missing flag value, invalid enum,
#      malformed timestamp/iteration/blocking.
#   3  internal: jq failed to build ENTRY (OP-W2; defensive, near-unreachable
#      because --arg escapes every untrusted string).
#   4  filesystem failure: dir missing/RO, mktemp fail, mv fail, disk full.
#   5  target JSON corrupt: existing .VERIFY_*.decisions.json does not parse;
#      PRESERVE the bad file for inspection.
#   6  RESERVED (was 2a-FATAL in PSEUDO OP-W4 step2a; REJECTED by D-7; never
#      emitted in the current contract). Reserved so a future policy reversal
#      can emit it without renumbering.
#   7  SQLite sink missing: decision-log/record.sh not on PATH (D-7 PERSIST).
#      JSON already committed; coordinator can retry the sync.
#   8  SQLite sink non-zero: record.sh exited non-zero (SQLite busy, disk full
#      at the SQLite layer). JSON already committed; idempotent retry safe.

# Exit-code constants (single source of truth for ARCH §10.1).
E_OK=0
E_VALIDATION=1
E_CLI_PARSE=2
E_JQ_BUILD=3
E_FILESYSTEM=4
E_TARGET_CORRUPT=5
E_RESERVED_6=6
E_SINK_MISSING=7
E_SINK_NONZERO=8

# Sink timeout (Q1 promotion, user-approved 2026-07-28).
# Canonical named constant (code-quality rule: no magic numbers in callers).
# Wraps the decision-log/record.sh subprocess call to bound a hung sink
# (sqlite lock contention). On timeout (exit 124 from `timeout`), the writer
# treats 124 as a non-zero sink RC per D-7: JSON kept, exit 8.
# Caller-supplied env var wins (so tests / coordinators can shrink the budget).
: "${SINK_TIMEOUT_SECONDS:=30}"
export SINK_TIMEOUT_SECONDS

# NFR-3 perf budget (advisory; the writer does not enforce, tests assert).
: "${WRITER_LATENCY_P95_MS:=500}"
export WRITER_LATENCY_P95_MS

# print_help - emit the --help text to stdout. No side effects, no file mod.
# Documents all 12 flags + the 4 reject flags + the 9-code exit taxonomy.
print_help() {
  cat <<'HELP'
cfn-decisions/record.sh - record one resolved decision to the per-run ledger.

Usage:
  .claude/skills/cfn-decisions/record.sh \
    --slug <s> --id <id> --title <t> --chosen <c> --actor human|ai \
    [--rationale <text>] [--alternatives <text>] \
    [--status proposed|accepted|superseded] \
    [--iteration <int>] [--blocking true|false] \
    [--timestamp <iso8601-utc>] [--root <dir>]

Required flags (FR-3):
  --slug       <string>   run slug, ^[a-z0-9][a-z0-9_-]{0,59}$
  --id         <string>   stable decision id within the slug (D1, D2, ...)
  --title      <string>   non-empty after trim
  --chosen     <string>   non-empty after trim
  --actor      <enum>     human | ai

Optional flags (FR-10 defaults):
  --rationale      <text>   default "" (any UTF-8; jq-escaped, FR-6)
  --alternatives   <text>   default ""
  --status         <enum>   proposed | accepted | superseded (default: proposed)
  --iteration      <int>    default 1; JSON-only, NOT forwarded to sink
  --blocking       <bool>   true | false (default: false; bare --blocking sent
                            to sink only when writer's --blocking=true)
  --timestamp      <iso>    default date -u +%Y-%m-%dT%H:%M:%SZ (UTC)
  --root           <dir>    default $(pwd)/planning

Reject flags (FR-8 floor; exit 2 with "unknown arg"):
  --delete, --remove, --purge, --supersede
  The sink's supersede path is NOT exposed through this writer; status
  transitions are encoded via --status on the replacement entry.

Exit codes (0..8; code 6 RESERVED per D-7, never emitted):
  0  success (JSON written AND SQLite row synced)
  1  validation failure (missing/empty/whitespace required field)
  2  CLI parse failure (unknown flag, bad enum, malformed value)
  3  internal: jq failed to build ENTRY (defensive, near-unreachable)
  4  filesystem failure (dir missing/RO, mktemp/mv fail)
  5  existing target JSON corrupt (bad file PRESERVED, no overwrite)
  6  RESERVED (D-7 rejected FATAL; writer NEVER emits 6)
  7  SQLite sink missing (record.sh not on PATH; JSON kept)
  8  SQLite sink non-zero (record.sh failed; JSON kept)

Output (FR-9): stdout is "<id> <status>\n" only. stderr carries field names,
exit codes, and target paths. Field VALUES (rationale, alternatives, title,
chosen) never appear in stdout, stderr, or any log channel.

Persistence (D-7 dual-write order):
  1. Write JSON FIRST (planning/.VERIFY_<slug>.decisions.json, atomic mv).
  2. Call decision-log/record.sh to sync SQLite (best-effort).
  3. On sink failure: KEEP the JSON, surface the failure via exit code.

Composition (D-1): the writer delegates SQLite persistence to the LOCKED
decision-log/record.sh subprocess. It never opens decisions.db directly and
never duplicates the sink's SQL.

State machine (ARCH §9, SM-1..SM-9): all status transitions are legal in both
directions (EC-16 mistake correction). There is no forward-only gate; the
enum is the only validation. See lib/state-machine-doc.md.

For the full contract see .claude/skills/cfn-decisions/SKILL.md and
planning/ARCH_decisions_ledger.md.
HELP
}
