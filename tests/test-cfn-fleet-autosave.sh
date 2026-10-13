#!/usr/bin/env bash
# tests/test-cfn-fleet-autosave.sh
# Heartbeat-ticker autosave: every FLEET_AUTOSAVE_SECS (default 1200, `off`
# disables) a fleet worker's dirty worktree is snapshotted to
# ${TMPDIR}/fleet-autosave/<run-name>/<WS>/<UTC ts>/ as a `git diff HEAD`
# patch plus a tarball of untracked, non-ignored files; newest 6 kept. The
# worker's index, HEAD and branch must not change, and a held index.lock
# (worker mid-git-operation) must neither block nor be touched.
# Why: workers held 1,000+ uncommitted lines for an hour with no copy anywhere
# (2026-10-10).
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
SKILL="$PROJECT_ROOT/.claude/skills/cfn-fleet"

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }

T=$(mktemp -d "${TMPDIR:-/tmp}/fleet-autosave-test-XXXXXX")
T=$(cd "$T" && pwd -P)
LOOP_PID=""
cleanup(){ [ -n "$LOOP_PID" ] && kill "$LOOP_PID" 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT

# shellcheck source=/dev/null
source "$SKILL/lib/heartbeat-ticker.sh"

REPO="$T/repo"; WT="$REPO/.claude/worktrees/ws01"
mkdir -p "$REPO"
(
  cd "$REPO"
  git init -q; git config user.email t@example.com; git config user.name t
  mkdir -p src; echo one > src/a.txt; echo two > src/b.txt; printf 'extracted/\n' > .gitignore
  git add -A; git commit -qm init
  git worktree add -q "$WT" -b fleet/WS01
  cd "$WT"
  echo staged >> src/a.txt; git add src/a.txt
  echo unstaged >> src/b.txt
  mkdir -p examples extracted; echo probe > examples/probe.rs; echo n > notes.md
  echo bigdata > extracted/blob.bin
  printf '\x00\x01binary' > examples/shot.png
)
export TMPDIR="$T/tmp"; mkdir -p "$TMPDIR"
SNAPROOT="$TMPDIR/fleet-autosave/run-x/WS01"
GITDIR=$(git -C "$WT" rev-parse --absolute-git-dir)
sum(){ shasum -a 1 "$1" | cut -d' ' -f1; }
snaps(){ ls -1 "$SNAPROOT" 2>/dev/null | grep -v '\.partial$'; }

idx_before=$(sum "$GITDIR/index"); head_before=$(git -C "$WT" rev-parse HEAD)
branch_before=$(git -C "$WT" symbolic-ref HEAD); cached_before=$(git -C "$WT" diff --cached --name-only)

# --- 1. snapshot of a dirty worktree ---------------------------------------------
_fleet_autosave_once "$WT" run-x WS01 >/dev/null 2>&1
n=$(snaps | wc -l | tr -d ' ')
[ "$n" = 1 ] && ok "dirty worktree -> one snapshot" || no "snapshot count $n"
S="$SNAPROOT/$(snaps | tail -1)"
[ -s "$S/tracked.patch" ] && ok "tracked.patch written" || no "no tracked.patch"
[ -s "$S/untracked.tar.gz" ] && ok "untracked.tar.gz written" || no "no untracked tarball"
grep -q "$head_before" "$S/head.txt" 2>/dev/null && ok "head.txt records HEAD" || no "head.txt missing HEAD"
tar -tzf "$S/untracked.tar.gz" 2>/dev/null | grep -q 'examples/probe.rs' && ok "untracked file in tarball" || no "probe.rs missing"
tar -tzf "$S/untracked.tar.gz" 2>/dev/null | grep -q 'extracted/' && no "ignored data in tarball" || ok "ignored files left out"
[[ "$(snaps | tail -1)" =~ ^[0-9]{8}T[0-9]{6}Z ]] && ok "snapshot named by UTC timestamp" || no "name: $(snaps | tail -1)"

# --- 2. the worker's git state is untouched --------------------------------------
[ "$(sum "$GITDIR/index")" = "$idx_before" ] && ok "index file byte-identical" || no "index changed"
[ "$(git -C "$WT" rev-parse HEAD)" = "$head_before" ] && ok "HEAD unchanged" || no "HEAD moved"
[ "$(git -C "$WT" symbolic-ref HEAD)" = "$branch_before" ] && ok "branch unchanged" || no "branch changed"
[ "$(git -C "$WT" diff --cached --name-only)" = "$cached_before" ] && ok "staged set unchanged" || no "staging changed"

# --- 3. restore round trip (the documented procedure) ----------------------------
R="$T/restore"
git -C "$REPO" worktree add -q --detach "$R" "$(cat "$S/head.txt" | head -1)"
( cd "$R" && git apply "$S/tracked.patch" && tar -xzf "$S/untracked.tar.gz" ) 2>"$T/restore.err" \
  && ok "patch applies and tarball extracts on a fresh checkout" || no "restore failed: $(cat "$T/restore.err")"
if diff -r -x .git -x extracted "$WT" "$R" >/dev/null; then ok "restored tree equals the worker's tree"
else no "restored tree differs: $(diff -r -x .git -x extracted "$WT" "$R" | head -3)"; fi

# --- 4. no new snapshot when nothing changed --------------------------------------
_fleet_autosave_once "$WT" run-x WS01 >/dev/null 2>&1
[ "$(snaps | wc -l | tr -d ' ')" = 1 ] && ok "unchanged worktree -> no duplicate snapshot" || no "duplicate snapshot"

# --- 5. retention: newest 6 ------------------------------------------------------
for i in 1 2 3 4 5 6 7; do echo "edit $i" >> "$WT/notes.md"; _fleet_autosave_once "$WT" run-x WS01 >/dev/null 2>&1; done
[ "$(snaps | wc -l | tr -d ' ')" = 6 ] && ok "keeps the newest 6" || no "kept $(snaps | wc -l)"
last=$(snaps | tail -1)
tar -xzOf "$SNAPROOT/$last/untracked.tar.gz" notes.md 2>/dev/null | grep -q 'edit 7' \
  && ok "newest snapshot holds the latest edit" || no "newest snapshot is stale"

# --- 6. mid-git-operation: a held index.lock -------------------------------------
echo held > "$GITDIR/index.lock"
echo "edit locked" >> "$WT/notes.md"
before=$(snaps | tail -1)
_fleet_autosave_once "$WT" run-x WS01 >/dev/null 2>&1
[ "$(snaps | tail -1)" != "$before" ] && ok "snapshot taken while index.lock is held" || no "lock blocked the snapshot"
[ "$(cat "$GITDIR/index.lock" 2>/dev/null)" = held ] && ok "index.lock left exactly as found" || no "index.lock touched"
rm -f "$GITDIR/index.lock"

# --- 7. clean worktree and main checkout are skipped ----------------------------
C="$REPO/.claude/worktrees/ws02"; git -C "$REPO" worktree add -q "$C" -b fleet/WS02
_fleet_autosave_once "$C" run-x WS02 >/dev/null 2>&1
[ ! -d "$TMPDIR/fleet-autosave/run-x/WS02" ] && ok "clean worktree -> no snapshot" || no "clean worktree snapshotted"
echo dirty > "$REPO/main-dirty.txt"
_fleet_autosave_once "$REPO" run-x MAIN >/dev/null 2>&1
[ ! -d "$TMPDIR/fleet-autosave/run-x/MAIN" ] && ok "main checkout (not a linked worktree) skipped" || no "main checkout snapshotted"

# --- 8. interval knob -----------------------------------------------------------
[ "$(FLEET_AUTOSAVE_SECS= _fleet_autosave_interval)" = 1200 ] && ok "default interval 1200s" || no "default"
[ "$(FLEET_AUTOSAVE_SECS=300 _fleet_autosave_interval)" = 300 ] && ok "numeric interval honoured" || no "numeric"
[ -z "$(FLEET_AUTOSAVE_SECS=off _fleet_autosave_interval)" ] && ok "off disables" || no "off"
[ -z "$(FLEET_AUTOSAVE_SECS=0 _fleet_autosave_interval)" ] && ok "0 disables" || no "0"
[ -z "$(FLEET_AUTOSAVE_SECS=abc _fleet_autosave_interval)" ] && ok "garbage disables" || no "garbage"

# --- 9. the ticker loop runs autosave on schedule --------------------------------
L="$REPO/.claude/worktrees/ws03"; git -C "$REPO" worktree add -q "$L" -b fleet/WS03
echo loopdirty > "$L/scratch.txt"
( cd "$L" && FLEET_AUTOSAVE_SECS=1 _fleet_tick_loop no-such-sock-$$ s1 WS03 /bin/true "$T/run-loop" 1 ) >/dev/null 2>&1 &
LOOP_PID=$!
for _ in 1 2 3 4 5 6 7 8; do [ -d "$TMPDIR/fleet-autosave/run-loop/WS03" ] && break; sleep 0.5; done
kill "$LOOP_PID" 2>/dev/null; wait "$LOOP_PID" 2>/dev/null; LOOP_PID=""
ls "$TMPDIR/fleet-autosave/run-loop/WS03" 2>/dev/null | grep -q . && ok "ticker loop wrote an autosave" || no "ticker loop never autosaved"

echo
echo "cfn-fleet-autosave: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
