#!/usr/bin/env bash
# lib/sink-delegate.sh - OP-W4 delegate_to_record_sh.
#
# Sourced by record.sh. Exposes:
#   delegate_to_record_sh - calls decision-log/record.sh with the SHARED
#                           fields only (FR-5). Best-effort: on sink failure
#                           (non-zero OR timeout) JSON is KEPT, exit 7/8.
#
# Composition per D-1: the writer NEVER opens decisions.db and NEVER
# duplicates the sink's SQL.
#
# Q1 promotion (user-approved 2026-07-28): the sink call is wrapped in
# `timeout "${SINK_TIMEOUT_SECONDS:-30}"` to bound a hung sink (sqlite lock
# contention). On timeout (exit 124 from `timeout`), the writer treats 124
# as a non-zero sink RC per D-7: JSON kept, exit 8 (E_SINK_NONZERO).
# This covers all 4 coordinator hook sites since they invoke this writer
# (DRY: one entry point).

# delegate_to_record_sh - calls decision-log/record.sh; exits 7 or 8 on failure.
# PRECONDITION: OP-W3 (upsert_by_key_atomic) already committed TARGET.
delegate_to_record_sh() {
  local rc=0

  # EC-10: sink missing from PATH. D-7 winner 2a-PERSIST: JSON already
  # committed; surface the failure (exit 7) so the coordinator sees it,
  # but NEVER roll back the JSON.
  if ! command -v record.sh >/dev/null 2>&1; then
    printf 'record.sh missing; JSON persisted at %s; SQLite sync skipped\n' \
      "$TARGET" >&2
    exit "$E_SINK_MISSING"
  fi

  # Build the sink argv (SHARED fields only; FR-5).
  # - actor + iteration are JSON-only and NEVER forwarded (the SQLite schema
  #   does not admit them; ARCH §2.4).
  # - --status is ALWAYS forwarded explicitly (the sink defaults STATUS to
  #   "accepted" at record.sh:19 but the writer's default is "proposed";
  #   forgetting to forward would silently upgrade a proposed decision to
  #   accepted in the SQLite register).
  # - --blocking is sent as the bare flag form (record.sh:30) ONLY when the
  #   writer's --blocking_bool is true; the sink has no --blocking=false form.
  # - --project is NEVER passed (the sink derives from git toplevel basename
  #   at record.sh:51-53; Q-6 PARKED).
  # - --supersede is NEVER passed (status encoded via --status on the new
  #   ENTRY; supersession is replacement-by-key per FR-2/FR-8).
  # shellcheck disable=SC2086  # word-splitting ARGV_SQL on purpose
  ARGV_SQL=(
    --slug "$SLUG"
    --id "$DEC_ID"
    --title "$TITLE"
    --chosen "$CHOSEN"
    --rationale "$RATIONALE"
    --alternatives "$ALTS"
    --status "$STATUS"
    --timestamp "$TIMESTAMP"
  )
  if [ "$BLOCKING_BOOL" = "true" ]; then
    ARGV_SQL+=(--blocking)
  fi

  # Suppress sink stderr (2>/dev/null) so the sink's own diagnostics cannot
  # leak field VALUES (FR-9 invariant). The writer reports its OWN structured
  # stderr line on failure (id + TARGET + RC; never rationale).
  # Q1: wrap with `timeout` to bound a hung sink.
  timeout "${SINK_TIMEOUT_SECONDS:-30}" \
    record.sh "${ARGV_SQL[@]}" 2>/dev/null
  rc=$?

  # timeout returns 124 on kill-by-timeout. Treat as sink non-zero per D-7.
  if [ "$rc" -ne "$E_OK" ]; then
    printf 'record.sh failed exit=%d; JSON persisted at %s; SQLite out of sync\n' \
      "$rc" "$TARGET" >&2
    exit "$E_SINK_NONZERO"
  fi

  return 0
}
