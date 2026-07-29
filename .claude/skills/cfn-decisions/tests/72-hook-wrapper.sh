#!/usr/bin/env bash
# tests/72-hook-wrapper.sh - hook.sh coordinator->writer bridge (DRY + D-8).
#
# Closes the runtime gap the exit-gate reconciliation flagged: the 3 FR-7 hook
# sites in cfn-loop-task.md (Phase 4.2 PO, Phase 5 user-batch, Phase 5E.4
# quarantine) were only statically grepped (AC-62 counted matches). This test
# fires hook.sh end-to-end at each site label and proves:
#   AC-9  site 1 (phase-4.2-po) happy: hook exit 0, JSON written, ok-line logged.
#   AC-10 site 2 (phase-5-batch) multi-item: 2 items both land, distinct ids.
#   AC-11 site 3 (phase-5E.4-quarantine): writer --blocking=true forwarded to JSON.
#   AC-13 D-8 isolation: failing sink -> hook exit 0, WARN logged (loop continues).
#   AC-38 OBS-4 cross-site: distinct site labels; WARN carries the site marker.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-9/10/11/13/38: hook.sh wrapper (3 sites happy + D-8 isolation + OBS-4 markers)"
ROOT_TMP="$(make_test_root)"
BIN_OK="$(make_stub_sink 0 0)"
BIN_FAIL=""
trap 'rm -rf "$ROOT_TMP" "$BIN_OK" "$BIN_FAIL"' EXIT
PATH="$BIN_OK:$PATH"

SLUG="$(make_test_slug)"
HOOK="$REPO_ROOT/.claude/skills/cfn-decisions/hook.sh"
JSON="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"

# === AC-9: SITE 1 (phase-4.2-po) happy path, actor=ai ===
LOG1="$ROOT_TMP/site1.log"; : >"$LOG1"
RUN_LOG="$LOG1" bash "$HOOK" \
  --site phase-4.2-po \
  --slug "$SLUG" --id test-D01 --title "PO verdict" --chosen "Impl X" \
  --actor ai --rationale "r1" --alternatives "a1" \
  --status accepted --blocking true --root "$ROOT_TMP" \
  >/dev/null 2>&1
assert_exit "$?" 0 "AC-9: site 1 hook exit 0 on writer success"
jq -e '.decisions[]|select(.id=="test-D01" and .actor=="ai")' "$JSON" >/dev/null 2>&1 \
  && ok "AC-9: site 1 JSON entry written via wrapper (actor=ai)" \
  || fail "AC-9: site 1 JSON entry written via wrapper (actor=ai)"
grep -qE '^phase-4\.2-po decisions\.ledger test-D01 ok \(0\)$' "$LOG1" \
  && ok "AC-9: site 1 ok-line carries --site marker + id" \
  || fail "AC-9: site 1 ok-line carries --site marker + id" "log=[$(cat "$LOG1")]"

# === AC-10: SITE 2 (phase-5-batch) multi-item, actor=human ===
LOG2="$ROOT_TMP/site2.log"; : >"$LOG2"
for n in 02 03; do
  RUN_LOG="$LOG2" bash "$HOOK" \
    --site phase-5-batch \
    --slug "$SLUG" --id "test-D$n" --title "batch $n" --chosen "opt $n" \
    --actor human --rationale "rb$n" --alternatives "ab$n" \
    --status proposed --blocking false --root "$ROOT_TMP" \
    >/dev/null 2>&1
  assert_exit "$?" 0 "AC-10: site 2 item test-D$n hook exit 0"
done
jq -e '.decisions|map(select(.id=="test-D02" or .id=="test-D03"))|length==2' "$JSON" >/dev/null 2>&1 \
  && ok "AC-10: site 2 batch landed 2 distinct ids (test-D02 + test-D03)" \
  || fail "AC-10: site 2 batch landed 2 distinct ids (test-D02 + test-D03)"
grep -qE '^phase-5-batch decisions\.ledger test-D0[23] ok \(0\)$' "$LOG2" \
  && ok "AC-10: site 2 ok-line carries batch --site marker" \
  || fail "AC-10: site 2 ok-line carries batch --site marker" "log=[$(cat "$LOG2")]"

# === AC-11: SITE 3 (phase-5E.4-quarantine) blocking=true forwarded ===
LOG3="$ROOT_TMP/site3.log"; : >"$LOG3"
RUN_LOG="$LOG3" bash "$HOOK" \
  --site phase-5E.4-quarantine \
  --slug "$SLUG" --id test-D04 --title "quarantine flaky" --chosen "Quarantine" \
  --actor human --rationale "rq" --alternatives "aq" \
  --status accepted --blocking true --root "$ROOT_TMP" \
  >/dev/null 2>&1
assert_exit "$?" 0 "AC-11: site 3 hook exit 0"
jq -e '.decisions[]|select(.id=="test-D04" and (.blocking==true or .blocking=="true"))' "$JSON" >/dev/null 2>&1 \
  && ok "AC-11: site 3 writer --blocking=true forwarded to JSON" \
  || fail "AC-11: site 3 writer --blocking=true forwarded to JSON"
grep -qE '^phase-5E\.4-quarantine decisions\.ledger test-D04 ok \(0\)$' "$LOG3" \
  && ok "AC-11: site 3 ok-line carries quarantine --site marker" \
  || fail "AC-11: site 3 ok-line carries quarantine --site marker" "log=[$(cat "$LOG3")]"

# === AC-38: OBS-4 cross-site - 3 distinct site labels observed across logs ===
# Success lines only (shape: "<site> decisions.ledger <id> ok (0)"); take token 1.
SITES_SEEN="$(grep -hE 'decisions\.ledger .* ok \(0\)$' "$LOG1" "$LOG2" "$LOG3" | awk '{print $1}' | sort -u)"
N_SITES="$(printf '%s\n' "$SITES_SEEN" | grep -c . || true)"
[ "$N_SITES" -eq 3 ] && ok "AC-38: OBS-4 3 distinct site labels in success logs" \
  || fail "AC-38: OBS-4 3 distinct site labels in success logs" "saw=[$(printf '%s ' $SITES_SEEN)]n=$N_SITES"

# === AC-13: D-8 isolation - failing sink -> hook exit 0 + WARN, loop continues ===
BIN_FAIL="$(make_stub_sink 1 0)"
PATH="$BIN_FAIL:$PATH"
LOGF="$ROOT_TMP/fail.log"; : >"$LOGF"
# First call fails at the writer (sink rc=1 -> writer E_SINK_NONZERO=8).
RUN_LOG="$LOGF" bash "$HOOK" \
  --site phase-4.2-po \
  --slug "$SLUG" --id test-D05 --title "will-fail" --chosen "C" \
  --actor ai --status proposed --blocking false --root "$ROOT_TMP" \
  >/dev/null 2>&1
assert_exit "$?" 0 "AC-13: D-8 hook exit 0 on writer failure (loop not broken)"
grep -qE '^WARN: phase-4\.2-po decisions\.ledger test-D05 failed \(rc=[0-9]+, isolated, continuing\)$' "$LOGF" \
  && ok "AC-13: D-8 WARN line carries --site + id + rc + isolation" \
  || fail "AC-13: D-8 WARN line carries --site + id + rc + isolation" "log=[$(cat "$LOGF")]"
# Second call at a DIFFERENT site proceeds (loop not stopped by prior failure).
RUN_LOG="$LOGF" bash "$HOOK" \
  --site phase-5-batch \
  --slug "$SLUG" --id test-D06 --title "after-fail" --chosen "C" \
  --actor human --status proposed --blocking false --root "$ROOT_TMP" \
  >/dev/null 2>&1
assert_exit "$?" 0 "AC-13: D-8 subsequent hook call still exits 0 (loop continues)"
grep -qE '^WARN: phase-5-batch decisions\.ledger test-D06 failed' "$LOGF" \
  && ok "AC-38: D-8 WARN at second site proves cross-site isolation continues" \
  || fail "AC-38: D-8 WARN at second site proves cross-site isolation continues"

# Defensive: scrub any test-fixture rows that reached the real SQLite sink.
# Happy paths used a stub sink so none should exist, but honor the test-db rule.
scrub_decisions_db

print_summary "$NAME"
