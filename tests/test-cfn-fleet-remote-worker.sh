#!/usr/bin/env bash
# tests/test-cfn-fleet-remote-worker.sh
# cfn-fleet remote worker kit (planning/PLAN_fleet-remote-host-workers.md phase 3):
#   templates/remote-worker.sh  report writer + claims-only local commit
#   templates/BRIEF_REMOTE.md   brief for a worker on a remote host
# No network, no ssh. The worktree keeps a temp bare repo as origin only to
# prove commit never pushes (PLAN_fleet-host-sandbox step 3: fleet land fetches
# the lane from the server's fleet clone instead). The script runs on a
# Linux server but these tests run on macOS, so everything here stays portable.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
set +e

TPL="$PROJECT_ROOT/.claude/skills/cfn-fleet/templates"
WORKER_SRC="$TPL/remote-worker.sh"
BRIEF="$TPL/BRIEF_REMOTE.md"

# pwd -P: macOS reports mktemp dirs under /private/var.
TMP=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/fleet-remote-worker-XXXXXX")" && pwd -P)
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { # check NAME CMD...  (CMD succeeds => ok)
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$name"; else no "$name"; fi
}

BARE="$TMP/bare.git"
WT="$TMP/wt"
OUTBOX="$TMP/outbox/WS1"
GEN="g20261013a"

git init -q --bare "$BARE"
git init -q -b main "$WT"
git -C "$WT" config user.email t@example.com
git -C "$WT" config user.name tester
git -C "$WT" config commit.gpgsign false
git -C "$WT" remote add origin "$BARE"
mkdir -p "$WT/src" "$OUTBOX"
echo one > "$WT/src/a.txt"
echo one > "$WT/src/b.txt"
git -C "$WT" add -A && git -C "$WT" commit -q -m base
git -C "$WT" push -q origin main
git -C "$WT" checkout -q -b fleet/WS1

cp "$WORKER_SRC" "$OUTBOX/remote-worker.sh" 2>/dev/null
cat > "$OUTBOX/outbox.env" <<EOF
FLEET_WS=WS1
FLEET_GEN=$GEN
FLEET_OUTBOX=$OUTBOX
FLEET_BRANCH=fleet/WS1
EOF
printf 'src/a.txt\n' > "$OUTBOX/claims.txt"

W() { (cd "$WT" && bash "$OUTBOX/remote-worker.sh" "$@"); }
# jget FILE KEY -> value (python3 is the independent JSON parser; no jq).
jget() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=d.get(sys.argv[2]); print("" if v is None else v)' "$1" "$2"; }

echo "test_remote_worker_exists"
check "remote-worker.sh exists" test -f "$WORKER_SRC"

echo "test_reports_atomic_and_monotonic"
for i in 1 2 3; do W heartbeat "tick $i" >/dev/null 2>&1; done
W status working >/dev/null 2>&1
R="$OUTBOX/reports"
for n in 1 2 3 4; do
  check "report $GEN-$n.json is valid JSON" python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$R/$GEN-$n.json"
done
[[ "$(jget "$R/$GEN-1.json" seq)" == "1" && "$(jget "$R/$GEN-4.json" seq)" == "4" ]] && ok "seq counts up from 1" || no "seq counts up from 1"
[[ "$(jget "$R/$GEN-1.json" kind)" == "heartbeat" && "$(jget "$R/$GEN-1.json" ws)" == "WS1" && "$(jget "$R/$GEN-1.json" gen)" == "$GEN" ]] && ok "heartbeat carries ws/gen/kind" || no "heartbeat carries ws/gen/kind"
[[ "$(jget "$R/$GEN-1.json" note)" == "tick 1" ]] && ok "heartbeat note stored" || no "heartbeat note stored"
[[ "$(jget "$R/$GEN-4.json" kind)" == "status" && "$(jget "$R/$GEN-4.json" status)" == "working" ]] && ok "status report carries status" || no "status report carries status"
[[ -n "$(jget "$R/$GEN-1.json" ts_worker)" ]] && ok "ts_worker present" || no "ts_worker present"
leftover=$(find "$R" -name '*.tmp' -o -name '.*tmp*' 2>/dev/null | wc -l | tr -d ' ')
[[ "$leftover" == "0" ]] && ok "no tmp files left behind" || no "no tmp files left behind ($leftover)"

# Concurrent writers must still get distinct seqs.
for i in 1 2 3 4 5 6; do W heartbeat "par $i" >/dev/null 2>&1 & done
wait
uniq_count=$(ls "$R" | grep -c '^g20261013a-[0-9]*\.json$')
[[ "$uniq_count" == "10" ]] && ok "concurrent heartbeats get distinct seqs (10 reports)" || no "concurrent heartbeats get distinct seqs (got $uniq_count)"

echo "test_report_json_escaping"
W heartbeat $'say "hi" \\ back\nline2\ttab' >/dev/null 2>&1
last=$(ls "$R" | sed 's/^.*-\([0-9]*\)\.json$/\1/' | sort -n | tail -1)
[[ "$(jget "$R/$GEN-$last.json" note)" == $'say "hi" \\ back\nline2\ttab' ]] && ok "quotes, backslash, newline, tab round-trip" || no "quotes, backslash, newline, tab round-trip"

echo "test_handoff_and_claim_request"
printf '# handoff\nbody\n' > "$TMP/HANDOFF_WS1.md"
W handoff "$TMP/HANDOFF_WS1.md" >/dev/null 2>&1
check "handoff copied into outbox handoffs/" test -f "$OUTBOX/handoffs/HANDOFF_WS1.md"
last=$(ls "$R" | sed 's/^.*-\([0-9]*\)\.json$/\1/' | sort -n | tail -1)
[[ "$(jget "$R/$GEN-$last.json" kind)" == "handoff" && "$(jget "$R/$GEN-$last.json" file)" == "HANDOFF_WS1.md" ]] && ok "handoff report names the file" || no "handoff report names the file"
W handoff "$TMP/does-not-exist.md" >/dev/null 2>&1
[[ $? -ne 0 ]] && ok "handoff of a missing file fails" || no "handoff of a missing file fails"
W request-claim src/c.txt >/dev/null 2>&1
last=$(ls "$R" | sed 's/^.*-\([0-9]*\)\.json$/\1/' | sort -n | tail -1)
[[ "$(jget "$R/$GEN-$last.json" kind)" == "claim_request" && "$(jget "$R/$GEN-$last.json" path)" == "src/c.txt" ]] && ok "claim request report carries path" || no "claim request report carries path"
grep -q 'src/c.txt' "$OUTBOX/claims.txt" && no "request-claim must not edit claims.txt" || ok "request-claim does not edit claims.txt"

echo "test_remote_worker_commit_stages_only_claimed_and_never_pushes"
echo two > "$WT/src/a.txt"      # claimed
echo two > "$WT/src/b.txt"      # NOT claimed
before=$(ls "$R" | wc -l | tr -d ' ')
W commit -m "claimed change" >/dev/null 2>&1
rc=$?
[[ $rc -eq 0 ]] && ok "commit exits 0" || no "commit exits 0 (rc=$rc)"
files=$(git -C "$WT" show --name-only --format= HEAD)
[[ "$files" == "src/a.txt" ]] && ok "commit contains only the claimed path" || no "commit contains only the claimed path (got: $files)"
[[ "$(git -C "$WT" log -1 --format=%s)" == "claimed change" ]] && ok "commit message used" || no "commit message used"
git -C "$WT" status --porcelain | grep -q ' M src/b.txt' && ok "unclaimed edit left dirty" || no "unclaimed edit left dirty"
head=$(git -C "$WT" rev-parse HEAD)
[[ "$(git -C "$WT" rev-parse refs/heads/fleet/WS1)" == "$head" ]] && ok "commit is on the local lane branch fleet/WS1" || no "commit is on the local lane branch fleet/WS1"
git -C "$BARE" rev-parse --verify -q refs/heads/fleet/WS1 >/dev/null 2>&1 && no "commit must not push to origin" || ok "commit does not push to origin"
last=$(ls "$R" | sed 's/^.*-\([0-9]*\)\.json$/\1/' | sort -n | tail -1)
[[ "$(jget "$R/$GEN-$last.json" kind)" == "commit" && "$(jget "$R/$GEN-$last.json" sha)" == "$head" ]] && ok "commit report carries sha" || no "commit report carries sha"

echo "test_commit_refuses_off_the_lane_branch"
# fleet land fetches refs/heads/fleet/WS1 from the clone; a commit made on any
# other branch would never land, so commit refuses instead of losing it.
git -C "$WT" checkout -q -b scratch-side
echo side > "$WT/src/a.txt"
W commit -m "wrong branch" >/dev/null 2>&1
rc=$?
[[ $rc -eq 66 ]] && ok "commit off fleet/WS1 exits 66" || no "commit off fleet/WS1 exits 66 (rc=$rc)"
[[ "$(git -C "$WT" log -1 --format=%s)" != "wrong branch" ]] && ok "no commit made off the lane branch" || no "no commit made off the lane branch"
git -C "$WT" checkout -q src/a.txt
git -C "$WT" checkout -q fleet/WS1
git -C "$WT" branch -q -D scratch-side

echo "test_commit_refuses_when_nothing_claimed_changed"
before=$(ls "$R" | wc -l | tr -d ' ')
headbefore=$(git -C "$WT" rev-parse HEAD)
W commit -m "nothing claimed" >/dev/null 2>&1
rc=$?
[[ $rc -ne 0 ]] && ok "refuses when only unclaimed files changed" || no "refuses when only unclaimed files changed"
[[ "$(git -C "$WT" rev-parse HEAD)" == "$headbefore" ]] && ok "no commit made on refusal" || no "no commit made on refusal"
after=$(ls "$R" | wc -l | tr -d ' ')
[[ "$before" == "$after" ]] && ok "no report written on refusal" || no "no report written on refusal"

echo "test_commit_requires_message_and_claims"
W commit >/dev/null 2>&1
[[ $? -ne 0 ]] && ok "commit without -m fails" || no "commit without -m fails"
mv "$OUTBOX/claims.txt" "$OUTBOX/claims.txt.bak"
echo three > "$WT/src/a.txt"
W commit -m "no claims file" >/dev/null 2>&1
[[ $? -ne 0 ]] && ok "commit without claims.txt fails" || no "commit without claims.txt fails"
mv "$OUTBOX/claims.txt.bak" "$OUTBOX/claims.txt"

echo "test_commit_does_not_sweep_preexisting_staged_unclaimed"
git -C "$WT" checkout -q src/a.txt
echo staged > "$WT/src/b.txt"; git -C "$WT" add src/b.txt
echo four > "$WT/src/a.txt"
W commit -m "claimed only" >/dev/null 2>&1
files=$(git -C "$WT" show --name-only --format= HEAD)
[[ "$files" == "src/a.txt" ]] && ok "pre-staged unclaimed file not committed" || no "pre-staged unclaimed file not committed (got: $files)"

echo "test_unknown_subcommand_fails"
W bogus >/dev/null 2>&1
[[ $? -ne 0 ]] && ok "unknown subcommand fails" || no "unknown subcommand fails"

echo "test_brief_remote_template_has_required_rules"
check "BRIEF_REMOTE.md exists" test -f "$BRIEF"
for pat in \
  'remote-worker.sh' \
  'no .*fleet.* (CLI|command)' \
  'SendMessage' \
  'request-claim' \
  '(never|do not|no) push' \
  'sandbox' \
  'Playwright' \
  'screenshot' \
  'reserved' \
  'scratch' \
  '~/fleet-repos' \
  'claims\.txt' ; do
  grep -Eiq -- "$pat" "$BRIEF" 2>/dev/null && ok "brief mentions /$pat/" || no "brief mentions /$pat/"
done
# Claude Code's own rm guard stalls an unattended worker ~80s on `rm $VAR/...`,
# and the cfn delete-check hook also prompts on "${VAR:?}" (MDTWII WS342).
# Only fully spelled-out literal paths pass both, so briefs must say exactly that
# and must not recommend the ${VAR:?} form.
for b in "$BRIEF" "$TPL/BRIEF_WS.md"; do
  n=$(basename "$b")
  grep -Eiq 'rm.*literal' "$b" 2>/dev/null && ok "$n has rm literal-path rule" \
    || no "$n has rm literal-path rule"
  grep -Fq ':?}' "$b" 2>/dev/null && no "$n does not recommend \${VAR:?} in rm" \
    || ok "$n does not recommend \${VAR:?} in rm"
done
grep -q $'—' "$BRIEF" 2>/dev/null && no "brief has no em dash" || ok "brief has no em dash"
grep -q $'—' "$WORKER_SRC" 2>/dev/null && no "worker script has no em dash" || ok "worker script has no em dash"
grep -Ev '^[[:space:]]*#' "$WORKER_SRC" | grep -q 'git push' && no "worker script has no git push" || ok "worker script has no git push"
grep -q 'PUSH_REMOTE' "$WORKER_SRC" && no "worker script has no push remote knob" || ok "worker script has no push remote knob"
if command -v jq >/dev/null 2>&1; then
  grep -Eq '(^|[^a-z])jq ' "$WORKER_SRC" 2>/dev/null && no "worker does not use jq" || ok "worker does not use jq"
else
  ok "worker does not use jq (jq absent)"
fi

echo
echo "passed=$PASS failed=$FAIL"
[[ $FAIL -eq 0 ]]
