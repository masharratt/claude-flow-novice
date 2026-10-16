#!/usr/bin/env bash
# tests/test-zai-fence.sh
# Red suite for .claude/cfn-scripts/zai-fence.sh (planning/PLAN_zai-folder-fence.md,
# Build step 1). The wrapper runs a command under sandbox-exec so a z.ai worker can
# touch only its own project folder plus what Claude Code needs.
#
# Every probe prints PROBE_RAN before its action, so "blocked" means "the probe ran
# inside the fence and its action failed", never "the wrapper is missing". While the
# wrapper does not exist every case is red.
#
# Fixtures live under a mktemp dir (fence root repo + worktree + fleet run dir, and a
# sibling "other project"). The real $HOME is only READ by probes, never written.
# Must run OUTSIDE Claude Code's own Bash sandbox: nested sandbox-exec is refused.
# Style: ok/no counters + trap cleanup per tests/test-cfn-fleet-engines.sh.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
set +e   # test-utils turns on -e; one failed check must not abort the suite

WRAP="$PROJECT_ROOT/.claude/cfn-scripts/zai-fence.sh"
GITC=(-c user.name=zai-fence-test -c user.email=zai-fence-test@example.invalid -c commit.gpgsign=false)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/zai-fence-test-XXXXXX")
TMP=$(cd "$TMP" && pwd -P)          # Seatbelt matches real paths (/private/var/...)
FENCE="$TMP/proj"                    # fence root: a real git repo
OTHER="$TMP/other-proj"              # sibling project the worker must not see
WT="$FENCE/.claude/worktrees/w1"
RUN="$FENCE/planning/fleet-x"
TSOCKDIR="/private/tmp/tmux-$(id -u)-zaifence-$$"
TSOCK="$TSOCKDIR/s"
SENTINEL="zai-fence-sentinel-$$"

PASS=0; FAIL=0; SKIP=0
UNEXPECTED_ALLOWED=(); UNEXPECTED_BLOCKED=(); SKIPPED=()
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
skip(){ echo "SKIP: $1"; SKIP=$((SKIP+1)); SKIPPED+=("$1"); }

cleanup(){
  if command -v tmux >/dev/null 2>&1; then tmux -S "$TSOCK" kill-server >/dev/null 2>&1; fi
  rm -rf "$TSOCKDIR"
  git -C "$FENCE" worktree remove --force "$WT" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------
mkdir -p "$FENCE" "$OTHER"
git -C "$FENCE" init -q
mkdir -p "$FENCE/.claude/hooks" "$RUN" "$FENCE/.fakebin"
echo '{}' > "$FENCE/.claude/settings.json"
echo seed > "$FENCE/README"
git -C "$FENCE" add README .claude/settings.json
git -C "$FENCE" "${GITC[@]}" commit -qm seed
git -C "$FENCE" worktree add -q "$WT" -b w1
echo "$SENTINEL" > "$OTHER/secret.txt"

# Fake commands that print their argv, one per line. Kept inside the fence so the
# sandboxed exec can read them.
for n in claude notclaude; do
  printf '#!/bin/bash\necho PROBE_RAN\nfor a in "$@"; do printf "ARG:%%s\\n" "$a"; done\n' \
    > "$FENCE/.fakebin/$n"
  chmod +x "$FENCE/.fakebin/$n"
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# fence_run <cwd> [VAR=val ...] -- runs "$WRAP /bin/bash -c $PROBE" from <cwd>.
# Sets OUT (stdout+stderr) and RC.
fence_run(){
  local dir="$1"; shift
  OUT=$(cd "$dir" && env "$@" "$WRAP" /bin/bash -c "$PROBE" 2>&1); RC=$?
}

# expect <name> allowed|blocked [side-effect-problem]
# side-effect-problem: empty when the after-the-fact check agrees, else a reason.
expect(){
  local name="$1" want="$2" side="${3:-}"
  if ! grep -q PROBE_RAN <<<"$OUT"; then
    no "$name: probe never ran inside the fence (rc=$RC) out=$(head -c 300 <<<"$OUT")"
    return
  fi
  if [ "$want" = allowed ]; then
    if [ "$RC" -eq 0 ] && [ -z "$side" ]; then ok "$name"
    else no "$name: expected allowed, got rc=$RC ${side:+side=[$side]} out=$(head -c 300 <<<"$OUT")"
         UNEXPECTED_BLOCKED+=("$name"); fi
  else
    if [ "$RC" -ne 0 ] && [ -z "$side" ]; then ok "$name"
    else no "$name: expected blocked, got rc=$RC ${side:+side=[$side]} out=$(head -c 300 <<<"$OUT")"
         UNEXPECTED_ALLOWED+=("$name"); fi
  fi
}

q(){ printf '%q' "$1"; }

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
test_wrapper_present(){
  if [ -x "$WRAP" ]; then ok "wrapper_present"; else no "wrapper_present: $WRAP missing or not executable"; fi
}

test_other_project_blocked(){
  PROBE="echo PROBE_RAN; cat $(q "$OTHER/secret.txt")"; fence_run "$FENCE"
  local s=""; grep -q "$SENTINEL" <<<"$OUT" && s="sentinel content leaked"
  expect "other_project_read_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; ls $(q "$OTHER")"; fence_run "$FENCE"
  s=""; grep -q secret.txt <<<"$OUT" && s="listing leaked secret.txt"
  expect "other_project_list_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; echo x > $(q "$OTHER/new.txt")"; fence_run "$FENCE"
  s=""; [ -e "$OTHER/new.txt" ] && s="new.txt was created"
  expect "other_project_write_blocked" blocked "$s"
}

# home_read_blocked <name> <path> <cmd>: skip when the path does not exist outside,
# because then a failure inside proves nothing.
home_read_blocked(){
  local name="$1" path="$2" cmd="$3"
  if [ ! -e "$path" ]; then skip "$name: $path absent on this machine"; return; fi
  PROBE="echo PROBE_RAN; $cmd $(q "$path") >/dev/null"; fence_run "$FENCE"
  expect "$name" blocked
}

test_home_reads_blocked(){
  home_read_blocked home_zshrc_read_blocked      "$HOME/.zshrc"                 "head -c1"
  home_read_blocked home_projects_list_blocked   "$HOME/Projects"               "ls"
  home_read_blocked home_ssh_read_blocked        "$HOME/.ssh"                   "ls"
  home_read_blocked home_gh_config_read_blocked  "$HOME/.config/gh"             "ls"
  home_read_blocked claude_history_read_blocked  "$HOME/.claude/history.jsonl"  "head -c1"
}

test_fence_writes_allowed(){
  PROBE="echo PROBE_RAN; echo ok > fence-write.txt"; fence_run "$FENCE"
  local s=""; [ -f "$FENCE/fence-write.txt" ] || s="file not created"
  expect "fence_write_allowed" allowed "$s"

  PROBE="echo PROBE_RAN; echo ok > wt-write.txt"; fence_run "$WT"
  s=""; [ -f "$WT/wt-write.txt" ] || s="file not created"
  expect "worktree_write_allowed" allowed "$s"

  PROBE="echo PROBE_RAN; echo ok > roster.tmp"; fence_run "$RUN"
  s=""; [ -f "$RUN/roster.tmp" ] || s="file not created"
  expect "run_dir_write_allowed" allowed "$s"

  # Regression (2026-10-10): `allow file-read*` does not override a broader
  # `deny file-read-data`, so the fence could write its own files but not read
  # them back. Writes passed; reads, git and script exec all failed.
  echo fence-content > "$FENCE/fence-read.txt"
  PROBE="echo PROBE_RAN; cat fence-read.txt"; fence_run "$FENCE"
  s=""; grep -q fence-content <<<"$OUT" || s="content not read"
  expect "fence_read_allowed" allowed "$s"

  # Claude Code reads its own config through ~/.claude (read-only allow).
  PROBE="echo PROBE_RAN; head -c 64 \"\$HOME/.claude/CLAUDE.md\" >/dev/null && echo READ_OK"; fence_run "$FENCE"
  s=""; grep -q READ_OK <<<"$OUT" || s="~/.claude/CLAUDE.md not readable"
  expect "claude_config_read_allowed" allowed "$s"

  local before; before=$(git -C "$FENCE" rev-parse HEAD)
  PROBE="echo PROBE_RAN; echo c > probe.txt && git add probe.txt && git $(printf '%q ' "${GITC[@]}") commit -qm probe"
  fence_run "$FENCE"
  s=""; [ "$(git -C "$FENCE" rev-parse HEAD)" != "$before" ] || s="HEAD did not move"
  expect "git_commit_in_fence_allowed" allowed "$s"
}

# Persistence paths: run unfenced later by the master or the user.
CONFIG_TARGETS=(".git/hooks/x" ".git/config" ".claude/settings.json" ".claude/hooks/x")

test_config_writes_blocked(){
  local t h1 h2 s
  for t in "${CONFIG_TARGETS[@]}"; do
    h1=$(cat "$FENCE/$t" 2>/dev/null | shasum)
    PROBE="echo PROBE_RAN; echo '# zai-fence-probe' >> $(q "$t")"; fence_run "$FENCE"
    h2=$(cat "$FENCE/$t" 2>/dev/null | shasum)
    s=""; [ "$h1" != "$h2" ] && s="$t changed"
    expect "config_write_blocked:$t" blocked "$s"
  done
}

test_config_writes_allowed_with_optin(){
  local t s
  for t in "${CONFIG_TARGETS[@]}"; do
    PROBE="echo PROBE_RAN; echo '# zai-fence-optin' >> $(q "$t")"
    fence_run "$FENCE" ZAI_FENCE_ALLOW_CONFIG=1
    s=""; grep -q zai-fence-optin "$FENCE/$t" 2>/dev/null || s="$t not written"
    expect "config_write_allowed_optin:$t" allowed "$s"
  done
}

# Regression (MDTWII incident 2026-10-16): a glm worker's Rust test fixture ran
# remove_dir_all on <worktree>/extracted/data. The worktree reached the main
# checkout's 7.5 GB shared data through a symlink, which resolves inside the fence
# root, so the fence allowed the delete; it wiped the shared copy four times.
# Paths listed in <root>/.zai-fence-readonly (or ZAI_FENCE_READONLY, colon-separated)
# stay readable but refuse every write and delete, through a symlink or not.
test_readonly_paths_blocked(){
  local s
  mkdir -p "$FENCE/shared/data" "$FENCE/shared2"
  echo keep > "$FENCE/shared/data/keep.txt"
  echo keep2 > "$FENCE/shared2/keep.txt"
  ln -s "$FENCE/shared" "$WT/extracted"
  printf '# shared caches linked into worktrees\nshared\n' > "$FENCE/.zai-fence-readonly"

  PROBE="echo PROBE_RAN; rm -rf extracted/data"; fence_run "$WT"
  s=""; [ -f "$FENCE/shared/data/keep.txt" ] || s="shared data deleted through the symlink"
  expect "readonly_delete_via_symlink_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; echo x > extracted/data/new.txt"; fence_run "$WT"
  s=""; [ -e "$FENCE/shared/data/new.txt" ] && s="new.txt was created"
  expect "readonly_write_via_symlink_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; cat extracted/data/keep.txt"; fence_run "$WT"
  s=""; grep -q keep <<<"$OUT" || s="content not read"
  expect "readonly_read_allowed" allowed "$s"

  PROBE="echo PROBE_RAN; rm -f shared2/keep.txt"; fence_run "$FENCE" ZAI_FENCE_READONLY="$FENCE/shared2"
  s=""; [ -f "$FENCE/shared2/keep.txt" ] || s="env-listed path deleted"
  expect "readonly_env_path_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; echo ok > not-shared.txt"; fence_run "$FENCE"
  s=""; [ -f "$FENCE/not-shared.txt" ] || s="file not created"
  expect "readonly_other_fence_writes_allowed" allowed "$s"

  rm -f "$FENCE/.zai-fence-readonly" "$WT/extracted"
}

test_tmux_socket_blocked(){
  if ! command -v tmux >/dev/null 2>&1; then skip "tmux_socket_blocked: tmux not installed"; return; fi
  mkdir -p "$TSOCKDIR" && chmod 700 "$TSOCKDIR"
  if ! tmux -S "$TSOCK" new -d -s zaifence >/dev/null 2>&1 || ! tmux -S "$TSOCK" ls >/dev/null 2>&1; then
    skip "tmux_socket_blocked: could not start a test tmux server on $TSOCK"; return
  fi
  PROBE="echo PROBE_RAN; tmux -S $(q "$TSOCK") ls"; fence_run "$FENCE"
  # tmux ls prints "zaifence: 1 windows ..."; the socket path in an error message also
  # contains "zaifence", so match the listing line, not the bare word.
  local s=""; grep -q '^zaifence:' <<<"$OUT" && s="session list leaked"
  expect "tmux_socket_blocked" blocked "$s"
}

test_env_scrubbed(){
  PROBE='echo PROBE_RAN; for v in SSH_AUTH_SOCK GH_TOKEN GITHUB_TOKEN DISABLE_AUTOUPDATER; do
    if [ -n "${!v+x}" ]; then echo "ENV:$v=${!v}"; else echo "ENV:$v=<unset>"; fi; done'
  fence_run "$FENCE" SSH_AUTH_SOCK=/private/tmp/fake-agent.sock GH_TOKEN=fake-gh GITHUB_TOKEN=fake-github
  local want=("SSH_AUTH_SOCK=<unset>" "GH_TOKEN=<unset>" "GITHUB_TOKEN=<unset>" "DISABLE_AUTOUPDATER=1")
  local missing=() w
  for w in "${want[@]}"; do grep -qxF "ENV:$w" <<<"$OUT" || missing+=("$w"); done
  if ! grep -q PROBE_RAN <<<"$OUT"; then no "env_scrubbed: probe never ran (rc=$RC)"
  elif [ "${#missing[@]}" -eq 0 ]; then ok "env_scrubbed"
  else no "env_scrubbed: missing=[${missing[*]}] got=[$(grep '^ENV:' <<<"$OUT" | tr '\n' ' ')]"; fi
}

test_keychain_blocked(){
  if ! security find-generic-password -s "Claude Code-credentials" >/dev/null 2>&1; then
    skip "keychain_blocked: item not readable outside the fence either"; return
  fi
  PROBE='echo PROBE_RAN; security find-generic-password -s "Claude Code-credentials" >/dev/null'
  fence_run "$FENCE"
  expect "keychain_blocked" blocked
}

test_tls_to_zai_allowed(){
  PROBE="echo PROBE_RAN; curl -sI --max-time 10 https://api.z.ai >/dev/null"; fence_run "$FENCE"
  expect "tls_to_api_zai_allowed" allowed
}

test_fail_closed_no_sandbox_exec(){
  local stub="$TMP/nosbx-bin" f marker="$FENCE/failclosed-path.marker"
  mkdir -p "$stub"
  for f in /bin/* /usr/bin/*; do
    [ "$(basename "$f")" = sandbox-exec ] && continue
    ln -sf "$f" "$stub/$(basename "$f")"
  done
  ln -sf "$(command -v bash)" "$stub/bash"; ln -sf "$(command -v git)" "$stub/git"
  OUT=$(cd "$FENCE" && env PATH="$stub" "$WRAP" /bin/bash -c "touch $(q "$marker")" 2>&1); RC=$?
  local s=""; [ -e "$marker" ] && s="probe ran unfenced"
  if [ "$RC" -eq 70 ] && [ -z "$s" ]; then ok "fail_closed_no_sandbox_exec"
  else no "fail_closed_no_sandbox_exec: want rc=70 and no marker, got rc=$RC ${s:+side=[$s]} out=$(head -c 200 <<<"$OUT")"; fi
}

test_fail_closed_cwd_home(){
  local marker="$TMP/failclosed-home.marker"
  OUT=$(cd "$HOME" && "$WRAP" /bin/bash -c "touch $(q "$marker")" 2>&1); RC=$?
  local s=""; [ -e "$marker" ] && s="probe ran with root=\$HOME"
  if [ "$RC" -eq 70 ] && [ -z "$s" ]; then ok "fail_closed_cwd_home"
  else no "fail_closed_cwd_home: want rc=70 and no marker, got rc=$RC ${s:+side=[$s]} out=$(head -c 200 <<<"$OUT")"; fi
}

test_claude_gets_settings_flag(){
  local want='{"sandbox":{"enabled":false}}'
  OUT=$(cd "$FENCE" && PATH="$FENCE/.fakebin:$PATH" "$WRAP" claude --keep-me 2>&1); RC=$?
  local missing=()
  grep -q PROBE_RAN <<<"$OUT" || missing+=("probe-ran")
  grep -qxF "ARG:--keep-me" <<<"$OUT" || missing+=("--keep-me")
  grep -A1 -xF "ARG:--settings" <<<"$OUT" | grep -q '"enabled":[[:space:]]*false' \
    || missing+=("--settings $want")
  if [ "$RC" -eq 0 ] && [ "${#missing[@]}" -eq 0 ]; then ok "claude_gets_settings_flag"
  else no "claude_gets_settings_flag: rc=$RC missing=[${missing[*]}] got=[$(grep '^ARG:' <<<"$OUT" | tr '\n' ' ')] out=$(head -c 300 <<<"$OUT")"; fi

  OUT=$(cd "$FENCE" && PATH="$FENCE/.fakebin:$PATH" "$WRAP" notclaude --keep-me 2>&1); RC=$?
  local unexpected=()
  grep -q PROBE_RAN <<<"$OUT" || unexpected+=("probe-never-ran")
  grep -qxF "ARG:--settings" <<<"$OUT" && unexpected+=("--settings")
  if [ "$RC" -eq 0 ] && [ "${#unexpected[@]}" -eq 0 ]; then ok "non_claude_no_settings_flag"
  else no "non_claude_no_settings_flag: rc=$RC unexpected=[${unexpected[*]}] out=$(head -c 300 <<<"$OUT")"; fi
}

# Fence workers must reach the fleet CLI by bare name (heartbeat, claim, commit).
# Seen 2026-10-14: a GLM worker in MDTWII found `fleet` on no PATH and fell back to
# plain git, losing the claims guard and heartbeats.
test_fleet_on_path(){
  local want="$HOME/.claude/skills/cfn-fleet/cli"
  OUT=$(cd "$FENCE" && env PATH=/usr/bin:/bin "$WRAP" /bin/bash -c \
    'echo PROBE_RAN; command -v fleet; fleet --help 2>&1 | grep -q "^Usage: fleet" && echo FLEET_RAN' 2>&1); RC=$?
  local missing=()
  grep -q PROBE_RAN <<<"$OUT" || missing+=("probe-ran")
  grep -qxF "$want/fleet" <<<"$OUT" || missing+=("fleet-resolves-to=$want/fleet")
  grep -q FLEET_RAN <<<"$OUT" || missing+=("fleet-help-ran")
  if [ "$RC" -eq 0 ] && [ "${#missing[@]}" -eq 0 ]; then ok "fleet_on_path"
  else no "fleet_on_path: rc=$RC missing=[${missing[*]}] out=$(head -c 300 <<<"$OUT")"; fi
}

# ---------------------------------------------------------------------------
test_wrapper_present
test_other_project_blocked
test_home_reads_blocked
test_fence_writes_allowed
test_config_writes_blocked
test_config_writes_allowed_with_optin
test_readonly_paths_blocked
test_tmux_socket_blocked
test_env_scrubbed
test_keychain_blocked
test_tls_to_zai_allowed
test_fail_closed_no_sandbox_exec
test_fail_closed_cwd_home
test_claude_gets_settings_flag
test_fleet_on_path

echo
echo "unexpected_allowed=[${UNEXPECTED_ALLOWED[*]}]"
echo "unexpected_blocked=[${UNEXPECTED_BLOCKED[*]}]"
echo "skipped=[${SKIPPED[*]}]"
echo "zai-fence: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
