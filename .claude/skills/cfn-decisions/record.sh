#!/usr/bin/env bash
# .claude/skills/cfn-decisions/record.sh - the writer entrypoint.
#
# Records ONE resolved decision per invocation to the per-run JSON ledger
# planning/.VERIFY_<slug>.decisions.json (atomic upsert-by-key) AND delegates
# the SQLite register sync to decision-log/record.sh (composition per D-1).
#
# Closes the gap where cfn-workbench/lib/section-decisions.sh:14,38-51 reads
# the per-run JSON but nothing writes it.
#
# Usage: see `record.sh --help` or lib/help.sh:print_help.
#
# Exit taxonomy (ARCH §10.1; code 6 RESERVED per D-7, never emitted):
#   0  E_OK             success: JSON written AND SQLite row synced.
#   1  E_VALIDATION     FR-3 missing/empty/whitespace required field.
#   2  E_CLI_PARSE      unknown flag, missing value, invalid enum, malformed
#                       timestamp/iteration/blocking.
#   3  E_JQ_BUILD       internal: jq failed to build ENTRY (defensive).
#   4  E_FILESYSTEM     dir missing/RO, mktemp fail, mv fail.
#   5  E_TARGET_CORRUPT existing JSON invalid; PRESERVE bad file.
#   6  E_RESERVED_6     RESERVED (D-7 rejected FATAL; never emitted).
#   7  E_SINK_MISSING   record.sh not on PATH (D-7 PERSIST; JSON kept).
#   8  E_SINK_NONZERO   record.sh non-zero (or timeout 124; JSON kept).

set -uo pipefail

# Source lib modules (constants first, then operations).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/help.sh
. "$SCRIPT_DIR/lib/help.sh"
# shellcheck source=lib/arg-parse.sh
. "$SCRIPT_DIR/lib/arg-parse.sh"
# shellcheck source=lib/jq-build.sh
. "$SCRIPT_DIR/lib/jq-build.sh"
# shellcheck source=lib/upsert.sh
. "$SCRIPT_DIR/lib/upsert.sh"
# shellcheck source=lib/sink-delegate.sh
. "$SCRIPT_DIR/lib/sink-delegate.sh"

# OP-W0: writer_entry.
main() {
  # FR-4 invariant: install the cleanup trap BEFORE any work that could
  # allocate a TMP. The trap guards the unset-before-set case via ${TMP:-}
  # under `set -u` (TMP is declared in lib/upsert.sh but remains "" until
  # mktemp runs, so the trap is safe to install up-front).
  TMP=""  # declared globally in lib/upsert.sh; reset here for clarity.
  trap 'cleanup_tmp' EXIT
  trap 'cleanup_tmp; exit 130' INT
  trap 'cleanup_tmp; exit 143' TERM

  # Startup check: jq is mandatory (mirrors bless-verify.sh:60). Without it
  # we cannot build ENTRY or upsert.
  command -v jq >/dev/null 2>&1 || {
    printf 'error: jq is required\n' >&2
    exit "$E_CLI_PARSE"
  }

  # OP-W1: parse + validate. Exits 2 on bad flag/enum/value.
  parse_and_validate_args "$@"

  # OP-W1b: refuse on missing/empty required field. Exits 1.
  refuse_on_missing_or_invalid

  # OP-W2: build ENTRY via jq. Exits 3 (defensive; near-unreachable).
  ENTRY="$(build_decision_object)"

  # OP-W3: atomic upsert-by-key. Exits 4 (FS) or 5 (corrupt target).
  # TARGET is set globally so sink-delegate can log it on failure.
  upsert_by_key_atomic "$ENTRY"

  # OP-W4: delegate SQLite sync. Exits 7 (sink missing) or 8 (sink non-zero
  # or timeout 124). JSON is already committed at this point; D-7 says keep
  # it and surface the failure via exit code.
  delegate_to_record_sh

  # Success: stdout is "<id> <status>\n" only (FR-9: id+status; no rationale,
  # no title, no chosen, no alternatives, no timestamp, no iteration).
  printf '%s %s\n' "$DEC_ID" "$STATUS"
  exit "$E_OK"
}

main "$@"
