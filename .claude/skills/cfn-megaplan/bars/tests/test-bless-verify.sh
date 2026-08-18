#!/usr/bin/env bash
# Tests for bless-verify.sh (S007).
#
# Origin: MANIFEST_HANDOFF_conversational_interview_engine.md item 6. The
# integrity sidecar proves "not edited since bless", but blessing was a bare
# `sha256sum > sidecar` one-liner, so a re-bless was all-or-nothing: a reviewer
# could not see whether only `check`/`evidence` text moved or whether the
# acceptance criteria themselves had been rewritten to match the code. That
# manifest was re-blessed twice, and the handoff says the re-blesses were
# "harder to trust" for exactly this reason.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../bless-verify.sh"
FIX="$DIR/fixtures"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
assert_exit() { if [ "$1" -eq "$2" ]; then ok "$3"; else no "$3 (exit $1 wanted $2)"; fi; }

VF="$WORK/VERIFY_clean.md"
LEDGER="$WORK/.VERIFY_clean.bless.json"
SIDECAR="$WORK/.VERIFY_clean.sha256"
cp "$FIX/clean.md" "$VF"

# ---- first bless ----
"$SCRIPT" "$VF" >/dev/null 2>&1
assert_exit $? 0 "first bless: exit 0 on a Bar-A-clean manifest"
[ -f "$SIDECAR" ] && ok "first bless: sidecar written" || no "first bless: sidecar written"
[ "$(cat "$SIDECAR")" = "$(sha256sum "$VF" | awk '{print $1}')" ] && ok "first bless: sidecar matches file hash" || no "first bless: sidecar matches file hash"
[ -f "$LEDGER" ] && ok "first bless: ledger created" || no "first bless: ledger created"
[ "$(jq -r '.blessings | length' "$LEDGER")" = "1" ] && ok "first bless: one ledger entry" || no "first bless: one ledger entry"
[ "$(jq -r '.blessings[0].first' "$LEDGER")" = "true" ] && ok "first bless: marked first" || no "first bless: marked first"

# ---- refuse to bless a manifest that fails the static bar ----
BAD="$WORK/VERIFY_weasel.md"
cp "$FIX/weasel.md" "$BAD"
"$SCRIPT" "$BAD" >/dev/null 2>&1
assert_exit $? 1 "bar-A-failing manifest: refused (exit 1)"
[ -f "$WORK/.VERIFY_weasel.sha256" ] && no "bar-A-failing manifest: sidecar must NOT be written" || ok "bar-A-failing manifest: no sidecar written"

# ---- re-bless after a check/evidence-only edit ----
# The benign case the handoff wanted made visible: the criteria did not move,
# only the command that proves them.
python3 - "$VF" <<'PY'
import json, re, sys
p = sys.argv[1]; t = open(p).read()
raw = re.findall(r'```json\n(.*?)```', t, re.S)[-1]
m = json.loads(raw)
m['acs'][0]['check'] = m['acs'][0]['check'] + ' --reporter=verbose'
m['acs'][0]['evidence'] = ' Tests  2 passed (2)'
new = json.dumps(m, indent=2) + "\n"
open(p,'w').write(t[:t.rindex(raw)] + new + t[t.rindex(raw)+len(raw):])
PY
"$SCRIPT" "$VF" >/dev/null 2>&1
assert_exit $? 0 "re-bless (check only): exit 0"
[ "$(jq -r '.blessings | length' "$LEDGER")" = "2" ] && ok "re-bless: ledger appended, not overwritten" || no "re-bless: ledger appended"
[ "$(jq -r '.blessings[1].changed[0].id' "$LEDGER")" = "AC-1" ] && ok "re-bless: names the changed AC" || no "re-bless: names the changed AC"
jq -e '.blessings[1].changed[0].fields | index("check")' "$LEDGER" >/dev/null 2>&1 \
  && ok "re-bless: names the changed field" || no "re-bless: names the changed field"
[ "$(jq -r '.blessings[1].structure_changed' "$LEDGER")" = "false" ] && ok "re-bless: structure_changed false" || no "re-bless: structure_changed false"
[ "$(jq -r '.blessings[1].predicate_changed' "$LEDGER")" = "false" ] && ok "re-bless: predicate_changed false" || no "re-bless: predicate_changed false"
[ "$(cat "$SIDECAR")" = "$(sha256sum "$VF" | awk '{print $1}')" ] && ok "re-bless: sidecar re-pinned to new bytes" || no "re-bless: sidecar re-pinned"

# ---- re-bless after loosening a pass predicate ----
# The gaming vector: a `pass` rewritten to match whatever the code does. It is
# reported on its own axis so a reviewer never has to infer it from a diff.
python3 - "$VF" <<'PY'
import json, re, sys
p = sys.argv[1]; t = open(p).read()
raw = re.findall(r'```json\n(.*?)```', t, re.S)[-1]
m = json.loads(raw)
m['acs'][0]['pass'] = 'body error == "any_error"'
new = json.dumps(m, indent=2) + "\n"
open(p,'w').write(t[:t.rindex(raw)] + new + t[t.rindex(raw)+len(raw):])
PY
"$SCRIPT" "$VF" >/dev/null 2>&1
assert_exit $? 0 "re-bless (pass edit): exit 0"
[ "$(jq -r '.blessings[2].predicate_changed' "$LEDGER")" = "true" ] && ok "re-bless: predicate_changed true when pass moves" || no "re-bless: predicate_changed true when pass moves"

# ---- re-bless after removing an AC ----
python3 - "$VF" <<'PY'
import json, re, sys
p = sys.argv[1]; t = open(p).read()
raw = re.findall(r'```json\n(.*?)```', t, re.S)[-1]
m = json.loads(raw)
m['acs'] = [a for a in m['acs'] if a['id'] != 'AC-2']
m['coverage']['fr_total'] = 0; m['coverage']['fr_mapped'] = 0
m['coverage']['core_fr'] = []; m['coverage']['core_fr_assembled_path_ok'] = []
m['coverage']['out_of_band_core_fr'] = []; m['coverage']['core_fr_runtime_observed'] = []
m['coverage']['no_core_mechanism_reason'] = 'test: AC-2 removed to exercise structure_changed'
new = json.dumps(m, indent=2) + "\n"
open(p,'w').write(t[:t.rindex(raw)] + new + t[t.rindex(raw)+len(raw):])
PY
"$SCRIPT" "$VF" >/dev/null 2>&1
assert_exit $? 0 "re-bless (AC removed): exit 0"
[ "$(jq -r '.blessings[3].structure_changed' "$LEDGER")" = "true" ] && ok "re-bless: structure_changed true when an AC disappears" || no "re-bless: structure_changed true when an AC disappears"
[ "$(jq -r '.blessings[3].removed[0]' "$LEDGER")" = "AC-2" ] && ok "re-bless: names the removed AC" || no "re-bless: names the removed AC"

# ---- stage: plan-time bless of a not-yet-implemented manifest ----
# The canonical pipeline blesses VERIFY during megaplan, before any code exists,
# so the run-before-bless rule has to admit a PENDING placeholder there and
# collect on it at the exit gate instead.
PEND="$WORK/VERIFY_evidence-pending.md"
cp "$FIX/evidence-pending.md" "$PEND"
"$SCRIPT" "$PEND" >/dev/null 2>&1
assert_exit $? 0 "plan stage (default): PENDING evidence blesses"
[ "$(jq -r '.blessings[0].stage' "$WORK/.VERIFY_evidence-pending.bless.json")" = "plan" ] \
  && ok "plan stage: recorded in the ledger" || no "plan stage: recorded in the ledger"

rm -f "$WORK/.VERIFY_evidence-pending.sha256"
"$SCRIPT" "$PEND" --stage exit >/dev/null 2>&1
assert_exit $? 1 "exit stage: PENDING evidence refused"
[ -f "$WORK/.VERIFY_evidence-pending.sha256" ] && no "exit stage: sidecar must NOT be re-pinned" || ok "exit stage: no sidecar written"

"$SCRIPT" "$VF" --stage exit >/dev/null 2>&1
assert_exit $? 0 "exit stage: real evidence blesses"
[ "$(jq -r '.blessings[-1].stage' "$LEDGER")" = "exit" ] && ok "exit stage: recorded in the ledger" || no "exit stage: recorded in the ledger"

# ---- usage ----
"$SCRIPT" "$VF" --stage bogus >/dev/null 2>&1; assert_exit $? 2 "bad --stage -> exit 2"
"$SCRIPT" >/dev/null 2>&1; assert_exit $? 2 "no arg -> exit 2"
"$SCRIPT" /nonexistent/x.md >/dev/null 2>&1; assert_exit $? 2 "missing file -> exit 2"

echo "----"
echo "S007 bless-verify: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
