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
APPROVE="$PROJECT_ROOT/.claude/cfn-scripts/glm-open-approve.sh"
OD_LIB="$PROJECT_ROOT/.claude/cfn-scripts/lib/open-dirs.sh"
# glm-open approvals go to a test store, never the real ~/.config
export CFN_GLM_OPEN_APPROVALS="$TMP/approvals"
# allow-list fence worker homes go to the test dir, never the real ~/.claude
export ZAI_FENCE_WORKER_BASE="$TMP/workers"
mkdir -p -m 700 "$CFN_GLM_OPEN_APPROVALS"

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

# glm-open (2026-11-15): a project opts in to extra read+write folders through
# <root>/.claude/glm-open-dirs (one absolute folder per line, # comments). The
# fence binds them only when ZAI_FENCE_OPEN_DIRS=1 (the glm-open engine sets it)
# and reads the list itself from the fence root. Missing/empty list or any bad
# entry refuses (70) before the command runs. Plain glm ignores the list.
OPEN_LIST="$FENCE/.claude/glm-open-dirs"

# The list is policy only once COMMITTED: the fence reads HEAD, never the
# working copy. commit_list BODY writes + commits it; drop_list removes it.
commit_list(){
  printf '%s\n' "$1" > "$OPEN_LIST"
  git -C "$FENCE" add -f .claude/glm-open-dirs && git -C "$FENCE" "${GITC[@]}" commit -qm "glm-open list" >/dev/null
  "$APPROVE" "$FENCE" >/dev/null 2>&1 || true   # bad lists fail to approve; the fence refuses them anyway
}
drop_list(){
  if git -C "$FENCE" ls-files --error-unmatch .claude/glm-open-dirs >/dev/null 2>&1; then
    git -C "$FENCE" rm -qf .claude/glm-open-dirs && git -C "$FENCE" "${GITC[@]}" commit -qm "drop glm-open list" >/dev/null
  fi
  rm -f "$OPEN_LIST"
}

# open_refused <name> <list-body> [VAR=val ...]: the fence must exit 70 and
# never run the probe. Body __NOFILE__ = no list; __KEEP__ = leave as is.
open_refused(){
  local name="$1" body="$2" marker="$TMP/open-refused.marker"
  shift 2
  rm -f "$marker"
  case "$body" in __NOFILE__) drop_list ;; __KEEP__) ;; *) commit_list "$body" ;; esac
  OUT=$(cd "$FENCE" && env ZAI_FENCE_OPEN_DIRS=1 "$@" "$WRAP" /bin/bash -c "echo PROBE_RAN; touch $(q "$FENCE/open-refused.marker")" 2>&1); RC=$?
  local s=""; { [ -e "$FENCE/open-refused.marker" ] || grep -q PROBE_RAN <<<"$OUT"; } && s="probe ran"
  rm -f "$FENCE/open-refused.marker"
  if [ "$RC" -eq 70 ] && [ -z "$s" ] && grep -q 'glm-open-dirs' <<<"$OUT"; then ok "$name"
  else no "$name: want rc=70, no probe, message naming glm-open-dirs; got rc=$RC ${s:+side=[$s]} out=$(head -c 300 <<<"$OUT")"; fi
}

test_open_dirs(){
  local OPEN1="$TMP/opened" NOTL="$TMP/notlisted" s
  mkdir -p "$OPEN1" "$NOTL"
  echo "OPEN_ENV_SECRET_$$" > "$OPEN1/.env"

  open_refused open_dirs_missing_file_refused __NOFILE__
  open_refused open_dirs_empty_file_refused "# nothing opted in yet"
  open_refused open_dirs_relative_entry_refused "relative/dir"
  open_refused open_dirs_missing_entry_refused "$TMP/does-not-exist"
  open_refused open_dirs_slash_refused "/"
  open_refused open_dirs_top_level_refused "/usr"
  open_refused open_dirs_system_subdir_refused "/etc/ssl"
  open_refused open_dirs_home_refused "$HOME"
  open_refused open_dirs_home_parent_refused "$(dirname "$HOME")"
  open_refused open_dirs_inside_claude_refused "$HOME/.claude"
  if [ -L "$HOME/.claude/skills" ]; then
    # ~/.claude/skills links into a repo; opening that repo would make the
    # read-only ~/.claude targets writable.
    open_refused open_dirs_claude_link_target_parent_refused "$(dirname "$(dirname "$(realpath "$HOME/.claude/skills")")")"
  else
    skip "open_dirs_claude_link_target_parent_refused: ~/.claude/skills is not a link here"
  fi
  open_refused open_dirs_one_bad_entry_refuses_all "$(printf '%s\n%s' "$OPEN1" relative/dir)"

  commit_list "$(printf '# opened for glm-open\n%s' "$OPEN1")"

  PROBE="echo PROBE_RAN; echo ok > $(q "$OPEN1/open-write.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -f "$OPEN1/open-write.txt" ] || s="file not created"
  expect "open_dirs_listed_write_allowed" allowed "$s"

  PROBE="echo PROBE_RAN; echo ok > fence-open.txt"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -f "$FENCE/fence-open.txt" ] || s="file not created"
  expect "open_dirs_fence_root_still_writable" allowed "$s"

  PROBE="echo PROBE_RAN; echo x > $(q "$NOTL/new.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -e "$NOTL/new.txt" ] && s="new.txt was created"
  expect "open_dirs_unlisted_write_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; cat $(q "$OPEN1/.env")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; grep -q "OPEN_ENV_SECRET_$$" <<<"$OUT" && s=".env content leaked"
  expect "open_dirs_env_file_masked" blocked "$s"

  PROBE="echo PROBE_RAN; echo $(q "$NOTL") >> .claude/glm-open-dirs"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; grep -qF "$NOTL" "$OPEN_LIST" && s="worker widened its own list"
  expect "open_dirs_list_not_writable_by_worker" blocked "$s"

  # plain glm: no ZAI_FENCE_OPEN_DIRS, list present -> folders stay closed
  rm -f "$OPEN1/plain.txt"
  PROBE="echo PROBE_RAN; echo x > $(q "$OPEN1/plain.txt")"; fence_run "$FENCE"
  s=""; [ -e "$OPEN1/plain.txt" ] && s="plain fence opened the folder"
  expect "open_dirs_ignored_without_optin" blocked "$s"

  # Credential masks win over an opened folder. A fake HOME so the test can
  # plant ~/.ssh and ~/.config/gh and open ~/.config without touching the real
  # home; the real $HOME is never written.
  local FH="$TMP/fhome"
  mkdir -p "$FH/.ssh" "$FH/.config/gh" "$FH/.config/tool"
  echo "SSH_SECRET_$$" > "$FH/.ssh/id_test"
  echo "GH_SECRET_$$" > "$FH/.config/gh/hosts.yml"
  commit_list "$FH/.config"

  PROBE="echo PROBE_RAN; echo ok > \"\$HOME/.config/tool/cfg\""; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1 HOME="$FH"
  s=""; [ -f "$FH/.config/tool/cfg" ] || s="file not created"
  expect "open_dirs_fake_home_config_writable" allowed "$s"

  PROBE="echo PROBE_RAN; cat \"\$HOME/.config/gh/hosts.yml\""; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1 HOME="$FH"
  s=""; grep -q "GH_SECRET_$$" <<<"$OUT" && s="gh credentials leaked"
  expect "open_dirs_gh_config_still_masked" blocked "$s"

  PROBE="echo PROBE_RAN; cat \"\$HOME/.ssh/id_test\""; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1 HOME="$FH"
  s=""; grep -q "SSH_SECRET_$$" <<<"$OUT" && s="ssh key leaked"
  expect "open_dirs_ssh_still_masked" blocked "$s"

  drop_list
}

# glm-open list round 3 (MDTWII's real list): a glob in the LAST path segment
# expands at fence start to existing folders (files skipped; zero matches warn
# and skip); a glob in an earlier segment refuses. `ro:` lines bind read-only.
# When entries nest, the deeper one wins for its subtree (rw /a, ro /a/study:
# writes under /a/study fail).
test_open_dirs_glob_ro(){
  local G="$TMP/g" RO="$TMP/ro-share" A="$TMP/a" s
  mkdir -p "$G/anim-1" "$G/anim-2" "$RO" "$A/study"
  echo file > "$G/anim-file"
  echo ro-content > "$RO/keep.txt"
  echo "RO_ENV_SECRET_$$" > "$RO/.env"

  open_refused open_dirs_glob_in_earlier_segment_refused "$TMP/g*/anim-1"

  commit_list "$G/anim-*"
  PROBE="echo PROBE_RAN; echo ok > $(q "$G/anim-1/w.txt") && echo ok > $(q "$G/anim-2/w.txt")"
  fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; { [ -f "$G/anim-1/w.txt" ] && [ -f "$G/anim-2/w.txt" ]; } || s="not both glob matches writable"
  expect "open_dirs_glob_expands_to_two_dirs_file_skipped" allowed "$s"

  commit_list "$(printf '%s\n%s' "$G/none-*" "$G/anim-1")"
  PROBE="echo PROBE_RAN; echo ok > $(q "$G/anim-1/w2.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -f "$G/anim-1/w2.txt" ] || s="file not created"
  grep -q 'none-\*' <<<"$OUT" || s="${s:+$s; }no warning naming the empty glob"
  expect "open_dirs_glob_zero_matches_warns_and_skips" allowed "$s"

  commit_list "ro:$RO"
  PROBE="echo PROBE_RAN; echo x > $(q "$RO/new.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -e "$RO/new.txt" ] && s="new.txt was created"
  expect "open_dirs_ro_write_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; cat $(q "$RO/keep.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; grep -q ro-content <<<"$OUT" || s="content not read"
  expect "open_dirs_ro_read_allowed" allowed "$s"

  PROBE="echo PROBE_RAN; cat $(q "$RO/.env")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; grep -q "RO_ENV_SECRET_$$" <<<"$OUT" && s=".env content leaked"
  expect "open_dirs_ro_env_masked" blocked "$s"

  commit_list "$(printf '%s\nro:%s' "$A" "$A/study")"
  PROBE="echo PROBE_RAN; echo x > $(q "$A/study/new.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -e "$A/study/new.txt" ] && s="write landed in the ro subtree"
  expect "open_dirs_nested_ro_inside_rw_blocked" blocked "$s"

  PROBE="echo PROBE_RAN; echo x > $(q "$A/top.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -f "$A/top.txt" ] || s="file not created"
  expect "open_dirs_rw_parent_of_ro_still_writable" allowed "$s"

  drop_list
}

# ---------------------------------------------------------------------------
# Security review 2026-11-16 (codex): one red test per finding.

# 2. the list is policy only when committed at HEAD
test_sec_2_uncommitted_list(){
  local OPEN1="$TMP/opened" NOTL="$TMP/notlisted" s
  mkdir -p "$OPEN1" "$NOTL"
  drop_list
  printf '%s\n' "$OPEN1" > "$OPEN_LIST"     # untracked
  open_refused test_sec_2_untracked_list_refused __KEEP__
  commit_list "$OPEN1"
  printf '%s\n' "$NOTL" > "$OPEN_LIST"      # modified, not committed
  rm -f "$NOTL/sec2.txt"
  PROBE="echo PROBE_RAN; echo x > $(q "$NOTL/sec2.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -e "$NOTL/sec2.txt" ] && s="uncommitted entry was honoured"
  expect "test_sec_2_uncommitted_edit_ignored" blocked "$s"
  PROBE="echo PROBE_RAN; echo x > $(q "$OPEN1/sec2.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -f "$OPEN1/sec2.txt" ] || s="committed entry not opened"
  expect "test_sec_2_head_entry_used" allowed "$s"
  git -C "$FENCE" checkout -q -- .claude/glm-open-dirs
  drop_list
}

# 3. inherited GIT_DIR must not move the fence root (or pick another policy)
test_sec_3_git_env_redirect(){
  local OR="$TMP/other-repo" s
  mkdir -p "$OR"; git -C "$OR" init -q
  PROBE="echo PROBE_RAN; echo x > $(q "$OR/sec3.txt")"
  fence_run "$FENCE" GIT_DIR="$OR/.git" GIT_WORK_TREE="$OR"
  s=""; [ -e "$OR/sec3.txt" ] && s="redirected repo became writable"
  expect "test_sec_3_git_dir_redirect_blocked" blocked "$s"
  PROBE="echo PROBE_RAN; echo x > sec3-own.txt"
  fence_run "$FENCE" GIT_DIR="$OR/.git" GIT_WORK_TREE="$OR"
  s=""; [ -f "$FENCE/sec3-own.txt" ] || s="own repo not writable"
  expect "test_sec_3_git_dir_redirect_keeps_own_root" allowed "$s"
}

# 4. the committed list must be a regular file, not a symlink
test_sec_4_symlink_list(){
  local OPEN1="$TMP/opened"
  mkdir -p "$OPEN1"
  drop_list
  printf '%s\n' "$OPEN1" > "$FENCE/policy.txt"
  ln -s ../policy.txt "$OPEN_LIST"
  git -C "$FENCE" add -f policy.txt .claude/glm-open-dirs && git -C "$FENCE" "${GITC[@]}" commit -qm symlink-list >/dev/null
  open_refused test_sec_4_symlink_list_refused __KEEP__
  git -C "$FENCE" rm -qf policy.txt >/dev/null; drop_list
}

# 5. opening inside a credential dir is refused
test_sec_5_open_inside_cred_refused(){
  local FH="$TMP/fhome5"
  mkdir -p "$FH/.aws/sso/cache"
  open_refused test_sec_5_open_inside_cred_refused "$FH/.aws/sso/cache" HOME="$FH"
  drop_list
}

# 6. macOS profile masks the mailbox and fleet credential dirs (profile printed
# through uname/getconf/sandbox-exec shims, so it runs on Linux too)
test_sec_6_macos_cred_masks(){
  local B="$TMP/darwin-bin" missing=() c
  mkdir -p "$B"
  printf '#!/bin/sh\necho Darwin\n' > "$B/uname"; printf '#!/bin/sh\necho /tmp\n' > "$B/getconf"
  printf '#!/bin/sh\nexit 0\n' > "$B/sandbox-exec"; chmod +x "$B"/*
  OUT=$(cd "$FENCE" && env PATH="$B:$PATH" ZAI_FENCE_PRINT_PROFILE=1 "$WRAP" /bin/true 2>&1); RC=$?
  for c in .config/cfn-mailbox .config/cfn-fleet .ssh .aws; do
    grep -E '^\(deny file-read-data file-write\*' <<<"$OUT" | grep -qF "/$c\"" || missing+=("$c")
  done
  if [ "$RC" -eq 0 ] && [ "${#missing[@]}" -eq 0 ]; then ok "test_sec_6_macos_cred_masks"
  else no "test_sec_6_macos_cred_masks: rc=$RC missing=[${missing[*]}]"; fi
}

# 7. .env discovery fails closed: no skipped dirs, symlinked .env masked,
# a scan that times out refuses to start
test_sec_7_env_scan_fail_closed(){
  local O="$TMP/opened7" s
  mkdir -p "$O/target" "$O/node_modules/pkg" "$O/sub"
  echo "T_SECRET_$$" > "$O/target/.env"
  echo "N_SECRET_$$" > "$O/node_modules/pkg/.env"
  echo "L_SECRET_$$" > "$O/real-secret.txt"
  ln -sf ../real-secret.txt "$O/sub/.env"
  commit_list "$O"
  PROBE="echo PROBE_RAN; cat $(q "$O/target/.env") $(q "$O/node_modules/pkg/.env")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; grep -q "_SECRET_$$" <<<"$OUT" && s=".env under target/node_modules leaked"
  expect "test_sec_7_env_in_skipped_dirs_masked" blocked "$s"
  PROBE="echo PROBE_RAN; cat $(q "$O/sub/.env")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; grep -q "L_SECRET_$$" <<<"$OUT" && s="symlinked .env leaked"
  expect "test_sec_7_symlinked_env_masked" blocked "$s"
  local SF="$TMP/slowfind"; mkdir -p "$SF"
  printf '#!/bin/bash\nsleep 3\nexec /usr/bin/find "$@"\n' > "$SF/find"; chmod +x "$SF/find"
  OUT=$(cd "$FENCE" && env PATH="$SF:$PATH" ZAI_FENCE_OPEN_DIRS=1 ZAI_FENCE_OPEN_SCAN_SECS=1 "$WRAP" /bin/bash -c "echo PROBE_RAN" 2>&1); RC=$?
  if [ "$RC" -eq 70 ] && ! grep -q PROBE_RAN <<<"$OUT" && grep -qF "$O" <<<"$OUT"; then ok "test_sec_7_scan_timeout_refuses"
  else no "test_sec_7_scan_timeout_refuses: want rc=70 naming $O; rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
  drop_list
}

# 8. a masked credential that resolves inside the repo stays masked after the root bind
test_sec_8_cred_in_repo_masked(){
  local FH="$TMP/fhome8" s
  mkdir -p "$FH/.claude"
  echo "CRED_SECRET_$$" > "$FENCE/creds-in-repo.json"
  ln -sf "$FENCE/creds-in-repo.json" "$FH/.claude/.credentials.json"
  PROBE="echo PROBE_RAN; cat $(q "$FENCE/creds-in-repo.json")"; fence_run "$FENCE" HOME="$FH"
  s=""; grep -q "CRED_SECRET_$$" <<<"$OUT" && s="credential re-exposed by the root bind"
  expect "test_sec_8_cred_in_repo_masked" blocked "$s"
  rm -f "$FENCE/creds-in-repo.json"
}

# 9. ro: inside the fence root stays read-only
test_sec_9_ro_inside_root(){
  local s
  mkdir -p "$FENCE/data"; echo keep9 > "$FENCE/data/keep.txt"
  commit_list "ro:$FENCE/data"
  PROBE="echo PROBE_RAN; echo x > data/new.txt"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -e "$FENCE/data/new.txt" ] && s="ro:ROOT/data was writable"
  expect "test_sec_9_ro_root_data_write_blocked" blocked "$s"
  PROBE="echo PROBE_RAN; cat data/keep.txt"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; grep -q keep9 <<<"$OUT" || s="content not read"
  expect "test_sec_9_ro_root_data_read_allowed" allowed "$s"
  drop_list; rm -rf "$FENCE/data"
}

# 10. the wrapper itself scrubs credential env (defence in depth)
test_sec_10_wrapper_scrubs_env(){
  local missing=()
  PROBE='echo PROBE_RAN; for v in OPENAI_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN PGPASSWORD DATABASE_URL; do [ -n "${!v+x}" ] && echo "LEAK:$v"; done; true'
  fence_run "$FENCE" OPENAI_API_KEY=x AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=x AWS_SESSION_TOKEN=x PGPASSWORD=x DATABASE_URL=x
  mapfile -t missing < <(grep '^LEAK:' <<<"$OUT")
  if grep -q PROBE_RAN <<<"$OUT" && [ "${#missing[@]}" -eq 0 ]; then ok "test_sec_10_wrapper_scrubs_env"
  else no "test_sec_10_wrapper_scrubs_env: rc=$RC leaked=[${missing[*]}] out=$(head -c 200 <<<"$OUT")"; fi
}

# ---------------------------------------------------------------------------
# Security review round 2 (codex, 2026-11-16).

# 3. any find error refuses, permission denied included: a mode-000 folder the
# worker could chmod back would otherwise hide an unscanned .env
test_sec2_3_unreadable_subdir_refuses(){
  local O="$TMP/opened-s23"
  mkdir -p "$O/locked"; echo "LOCK_SECRET_$$" > "$O/locked/.env"; chmod 000 "$O/locked"
  commit_list "$O"
  OUT=$(cd "$FENCE" && env ZAI_FENCE_OPEN_DIRS=1 "$WRAP" /bin/bash -c "echo PROBE_RAN" 2>&1); RC=$?
  if [ "$RC" -eq 70 ] && ! grep -q PROBE_RAN <<<"$OUT" && grep -qF "$O" <<<"$OUT"; then ok "test_sec2_3_unreadable_subdir_refuses"
  else no "test_sec2_3_unreadable_subdir_refuses: want rc=70 naming $O; rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
  chmod 700 "$O/locked"; drop_list
}

# BUG zai-fence-tmp-cwd (2026-11-17): a cwd of /tmp was refused because find
# cannot open root-owned mode-700 dirs (systemd-private-*). A permission-denied
# entry owned by ANOTHER user is skipped and counted; a missing dir or a find
# that cannot run still refuses. (find is shimmed: this test cannot chown.)
test_zai_scan_skips_foreign_unreadable(){
  [ "$(id -u)" -ne 0 ] || { skip "test_zai_scan_skips_foreign_unreadable: running as root"; return 0; }
  linux_only test_zai_scan_skips_foreign_unreadable || return 0
  local SD="$TMP/denyfind" R="$TMP/deny-root" B
  mkdir -p "$SD" "$R"
  B=$(command -v find)
  printf '#!/bin/bash\n%s "$@"; echo "find: '"'"'/root'"'"': Permission denied" >&2; exit 1\n' "$B" > "$SD/find"; chmod +x "$SD/find"
  OUT=$(cd "$R" && env PATH="$SD:$PATH" ZAI_FENCE_PRINT_PROFILE=1 "$WRAP" /bin/true 2>&1); RC=$?
  if [ "$RC" -eq 0 ] && grep -q "skipped 1 unreadable" <<<"$OUT"; then ok "test_zai_scan_skips_foreign_unreadable"
  else no "test_zai_scan_skips_foreign_unreadable: want rc=0 and 'skipped 1 unreadable'; rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
  printf '#!/bin/bash\necho "find: unknown predicate" >&2; exit 1\n' > "$SD/find"
  OUT=$(cd "$R" && env PATH="$SD:$PATH" ZAI_FENCE_PRINT_PROFILE=1 "$WRAP" /bin/true 2>&1); RC=$?
  if [ "$RC" -eq 70 ]; then ok "test_zai_scan_other_find_errors_stay_fatal"
  else no "test_zai_scan_other_find_errors_stay_fatal: want rc=70; rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
}

# 4. a credential resolving into ROOT/.claude/data stays masked after the
# .claude processing re-binds .claude children
test_sec2_4_cred_in_claude_dir_masked(){
  local FH="$TMP/fhome-s24" s
  mkdir -p "$FH/.claude" "$FENCE/.claude/data"
  echo "TOKEN_SECRET_$$" > "$FENCE/.claude/data/token.json"
  ln -sf "$FENCE/.claude/data/token.json" "$FH/.claude/.credentials.json"
  PROBE="echo PROBE_RAN; cat .claude/data/token.json"; fence_run "$FENCE" HOME="$FH"
  s=""; grep -q "TOKEN_SECRET_$$" <<<"$OUT" && s="credential re-exposed by the .claude re-bind"
  expect "test_sec2_4_cred_in_claude_dir_masked" blocked "$s"
  rm -rf "$FENCE/.claude/data"
}

# BUG glm-settings-mask (2026-11-18, MDTWII GLM lane): settings.local.json
# was masked with /dev/null, a device. Claude Code then stopped at a "Settings
# Error ... Not a regular file" menu and the lane sat 900s. A masked JSON
# settings file must be a regular read-only "{}" file, and the secret in the
# original must still be unreadable through it.
test_glm_settings_mask_regular_json(){
  linux_only test_glm_settings_mask_regular_json || return 0
  local f="$FENCE/.claude/settings.local.json" s=""
  printf '{"env":{"API_KEY":"SETTINGS_LOCAL_SECRET_%s"}}\n' "$$" > "$f"
  PROBE='echo PROBE_RAN; f=.claude/settings.local.json; [ -c "$f" ] && echo MASK:device; [ -f "$f" ] && echo MASK:regular; printf "BODY:%s\n" "$(cat "$f")"; echo x >> "$f" 2>/dev/null && echo MASK:writable; true'
  fence_run "$FENCE"
  grep -q "SETTINGS_LOCAL_SECRET_$$" <<<"$OUT" && s="secret readable through the mask"
  grep -q '^MASK:device' <<<"$OUT" && s="${s:+$s; }masked with a device"
  grep -q '^MASK:regular' <<<"$OUT" || s="${s:+$s; }mask is not a regular file"
  grep -qx 'BODY:{}' <<<"$OUT" || s="${s:+$s; }mask body is not {}"
  grep -q '^MASK:writable' <<<"$OUT" && s="${s:+$s; }mask writable"
  grep -q "SETTINGS_LOCAL_SECRET_$$" "$f" || s="${s:+$s; }host file changed"
  if grep -q PROBE_RAN <<<"$OUT" && [ "$RC" -eq 0 ] && [ -z "$s" ]; then ok "test_glm_settings_mask_regular_json"
  else no "test_glm_settings_mask_regular_json: rc=$RC ${s:-probe never ran} out=$(head -c 300 <<<"$OUT")"; fi
  rm -f "$f"
}

# 5. ro:ROOT/.claude/data stays read-only after the .claude processing
test_sec2_5_ro_claude_data(){
  local s
  mkdir -p "$FENCE/.claude/data"; echo keep25 > "$FENCE/.claude/data/keep.txt"
  commit_list "ro:$FENCE/.claude/data"
  PROBE="echo PROBE_RAN; echo x > .claude/data/new.txt"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""; [ -e "$FENCE/.claude/data/new.txt" ] && s="ro:ROOT/.claude/data was writable"
  expect "test_sec2_5_ro_claude_data_write_blocked" blocked "$s"
  drop_list; rm -rf "$FENCE/.claude/data"
}

# 6. a git replacement object must not substitute the committed policy
test_sec2_6_replace_ref_ignored(){
  local OPEN1="$TMP/opened" NOTL="$TMP/notlisted" blob nb
  mkdir -p "$OPEN1" "$NOTL"; rm -f "$NOTL/s26.txt"
  commit_list "$OPEN1"
  blob=$(git -C "$FENCE" rev-parse HEAD:.claude/glm-open-dirs)
  nb=$(printf '%s\n' "$NOTL" | git -C "$FENCE" hash-object -w --stdin)
  git -C "$FENCE" replace "$blob" "$nb"
  OUT=$(cd "$FENCE" && env ZAI_FENCE_OPEN_DIRS=1 "$WRAP" /bin/bash -c "echo PROBE_RAN; echo x > $(q "$NOTL/s26.txt")" 2>&1); RC=$?
  if [ ! -e "$NOTL/s26.txt" ] && [ "$RC" -eq 70 ] && grep -q 'refs/replace' <<<"$OUT"; then ok "test_sec2_6_replace_ref_ignored"
  else no "test_sec2_6_replace_ref_ignored: want rc=70 naming refs/replace and no write; rc=$RC written=$([ -e "$NOTL/s26.txt" ] && echo yes || echo no) out=$(head -c 300 <<<"$OUT")"; fi
  git -C "$FENCE" replace -d "$blob" >/dev/null 2>&1
  drop_list
}

# ---------------------------------------------------------------------------
# Allow-list Linux backend (planning/PLAN_zai-fence-linux-allowlist.md).
# Linux only: macOS keeps Seatbelt.
linux_only(){ [ "$(uname -s)" = Linux ] || { skip "$1: Linux allow-list backend only"; return 1; }; }

# 1. everything not listed is absent: /srv /mnt /var/log, other projects, the rest of $HOME
test_allow_1_absent(){
  linux_only test_allow_1_absent || return 0
  local p missing=() leaked=()
  for p in /mnt /srv /var/log /opt/containerd /root "$HOME/projects" "$HOME/.ssh" "$HOME/.config" "$HOME/.claude/history.jsonl" "$HOME/.claude/settings.local.json" "$HOME/.claude/decision-log.db" "$(ls -d "$HOME"/.claude/session-env/* 2>/dev/null | head -n 1)"; do
    [ -e "$p" ] || continue
    PROBE="echo PROBE_RAN; test -e $(q "$p") && echo LEAK:$(q "$p"); true"; fence_run "$FENCE"
    grep -q PROBE_RAN <<<"$OUT" || missing+=("probe:$p")
    grep -q "^LEAK:" <<<"$OUT" && leaked+=("$p")
  done
  if [ "${#leaked[@]}" -eq 0 ] && [ "${#missing[@]}" -eq 0 ]; then ok "test_allow_1_absent"
  else no "test_allow_1_absent: leaked=[${leaked[*]}] probe_failed=[${missing[*]}]"; fi
}

# 2. the real claude binary starts inside the fence
test_allow_2_claude_starts(){
  linux_only test_allow_2_claude_starts || return 0
  local c; c=$(command -v claude 2>/dev/null) || { skip "test_allow_2_claude_starts: no claude on PATH"; return 0; }
  OUT=$(cd "$FENCE" && "$WRAP" "$c" --version 2>&1); RC=$?
  if [ "$RC" -eq 0 ] && grep -qE '[0-9]+\.[0-9]+\.[0-9]+' <<<"$OUT"; then ok "test_allow_2_claude_starts"
  else no "test_allow_2_claude_starts: rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
}

# 5. the trusted runtime (~/.claude links into a repo) stays read-only even when it
# lives inside the fence root
test_allow_5_runtime_ro_inside_root(){
  linux_only test_allow_5_runtime_ro_inside_root || return 0
  local FH="$TMP/fhome-a5" s
  mkdir -p "$FH/.claude" "$FENCE/rt/cfn-scripts"; echo orig > "$FENCE/rt/cfn-scripts/tool.sh"
  ln -sfn "$FENCE/rt/cfn-scripts" "$FH/.claude/cfn-scripts"
  PROBE="echo PROBE_RAN; echo poison >> rt/cfn-scripts/tool.sh"; fence_run "$FENCE" HOME="$FH"
  s=""; grep -q poison "$FENCE/rt/cfn-scripts/tool.sh" && s="runtime rewritten through the root"
  expect "test_allow_5_runtime_ro_inside_root" blocked "$s"
  PROBE="echo PROBE_RAN; echo ok > rt-other.txt"; fence_run "$FENCE" HOME="$FH"
  s=""; [ -f "$FENCE/rt-other.txt" ] || s="root no longer writable"
  expect "test_allow_5_root_still_writable" allowed "$s"
  rm -rf "$FENCE/rt" "$FENCE/rt-other.txt"
}

# 6. private worker state: host Claude state invisible, host ~/.claude.json untouched,
# generated config has no MCP servers
test_allow_6_private_state(){
  linux_only test_allow_6_private_state || return 0
  local FH="$TMP/fhome-a6" s
  mkdir -p "$FH/.claude/session-env/other-session" "$FH/.claude/projects/-other-project"
  echo "OTHER_SESSION_$$" > "$FH/.claude/session-env/other-session/env"
  echo "OTHER_TRANSCRIPT_$$" > "$FH/.claude/projects/-other-project/t.jsonl"
  printf '{"hasCompletedOnboarding":true,"mcpServers":{"evil":{"command":"/bin/false"}},"marker":"HOSTJSON_%s"}\n' "$$" > "$FH/.claude.json"
  local before; before=$(cat "$FH/.claude.json")
  PROBE='echo PROBE_RAN; cat "$HOME"/.claude/session-env/*/* "$HOME"/.claude/projects/*/* 2>/dev/null; cat "$HOME/.claude.json"; echo "{}" > "$HOME/.claude.json"'
  fence_run "$FENCE" HOME="$FH"
  s=""
  grep -q "OTHER_SESSION_$$\|OTHER_TRANSCRIPT_$$" <<<"$OUT" && s="host session state visible"
  grep -q 'mcpServers' <<<"$OUT" && s="${s:+$s; }generated ~/.claude.json carries mcpServers"
  [ "$(cat "$FH/.claude.json")" = "$before" ] || s="${s:+$s; }host ~/.claude.json changed"
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_6_private_state"
  else no "test_allow_6_private_state: ${s:-probe failed} out=$(head -c 300 <<<"$OUT")"; fi
}

# 7. approval store: an unapproved or changed policy refuses; root ids never collide;
# a store with loose permissions refuses
test_allow_7_approval(){
  local OPEN1="$TMP/opened-a7" id1 id2
  mkdir -p "$OPEN1"
  printf '%s\n' "$OPEN1" > "$OPEN_LIST"
  git -C "$FENCE" add -f .claude/glm-open-dirs && git -C "$FENCE" "${GITC[@]}" commit -qm "unapproved list" >/dev/null
  open_refused test_allow_7_unapproved_refused __KEEP__
  grep -q 'approve' <<<"$OUT" || no "test_allow_7_unapproved_refused: message does not say how to approve"
  "$APPROVE" "$FENCE" >/dev/null 2>&1 || no "test_allow_7: approve script failed"
  PROBE="echo PROBE_RAN; echo x > $(q "$OPEN1/a7.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  expect "test_allow_7_approved_opens" allowed "$([ -f "$OPEN1/a7.txt" ] || echo not-written)"
  printf '%s\n%s\n' "$OPEN1" "$TMP/notlisted" > "$OPEN_LIST"; mkdir -p "$TMP/notlisted"
  git -C "$FENCE" add -f .claude/glm-open-dirs && git -C "$FENCE" "${GITC[@]}" commit -qm "changed list" >/dev/null
  open_refused test_allow_7_changed_policy_refused __KEEP__
  "$APPROVE" "$FENCE" >/dev/null 2>&1
  chmod 777 "$CFN_GLM_OPEN_APPROVALS"
  open_refused test_allow_7_loose_store_refused __KEEP__
  chmod 700 "$CFN_GLM_OPEN_APPROVALS"
  id1=$(bash -c '. "$1"; cfn_open_dirs_root_id /x/a-b' _ "$OD_LIB")
  id2=$(bash -c '. "$1"; cfn_open_dirs_root_id /x/a/b' _ "$OD_LIB")
  [ -n "$id1" ] && [ "$id1" != "$id2" ] && ok "test_allow_7_root_ids_distinct" || no "test_allow_7_root_ids_distinct: '$id1' '$id2'"
  PROBE="echo PROBE_RAN; ls $(q "$CFN_GLM_OPEN_APPROVALS")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  expect "test_allow_7_store_absent_inside" blocked
  drop_list
}

# 8. openings and the root are mounted from pinned directory fds
test_allow_8_pinned_fds(){
  linux_only test_allow_8_pinned_fds || return 0
  local OPEN1="$TMP/opened-a8"; mkdir -p "$OPEN1"
  commit_list "ro:$OPEN1"
  OUT=$(cd "$FENCE" && env ZAI_FENCE_OPEN_DIRS=1 ZAI_FENCE_PRINT_PROFILE=1 "$WRAP" /bin/true 2>&1); RC=$?
  local missing=()
  grep -qx -- '--bind-fd' <<<"$OUT" || missing+=("--bind-fd (root)")
  grep -qx -- '--ro-bind-fd' <<<"$OUT" || missing+=("--ro-bind-fd (ro opening)")
  if [ "$RC" -eq 0 ] && [ "${#missing[@]}" -eq 0 ]; then ok "test_allow_8_pinned_fds"
  else no "test_allow_8_pinned_fds: rc=$RC missing=[${missing[*]}]"; fi
  drop_list
}

# 9. inherited descriptors do not reach the worker
test_allow_9_fds_closed(){
  linux_only test_allow_9_fds_closed || return 0
  echo "FD_SECRET_$$" > "$TMP/fd-secret.txt"
  OUT=$(cd "$FENCE" && "$WRAP" /bin/bash -c 'echo PROBE_RAN; cat /proc/self/fd/7; ls /proc/self/fd' 7<"$TMP/fd-secret.txt" 2>&1); RC=$?
  if grep -q PROBE_RAN <<<"$OUT" && ! grep -q "FD_SECRET_$$" <<<"$OUT"; then ok "test_allow_9_fds_closed"
  else no "test_allow_9_fds_closed: rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
}

# 10. network: no host loopback, no abstract sockets, no pathname sockets in mounted
# trees; only api.z.ai through the broker
test_allow_10_network(){
  linux_only test_allow_10_network || return 0
  local port=$((20000 + $$ % 20000)) abs="zaifence-test-$$" O="$TMP/opened-a10" pids=() s
  mkdir -p "$O"
  python3 -c 'import socket,sys,time
s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(("127.0.0.1",int(sys.argv[1]))); s.listen(5)
a=socket.socket(socket.AF_UNIX); a.bind("\0"+sys.argv[2]); a.listen(5)
u=socket.socket(socket.AF_UNIX); u.bind(sys.argv[3]); u.listen(5)
time.sleep(60)' "$port" "$abs" "$O/ctl.sock" & pids+=($!)
  sleep 1
  commit_list "$O"; "$APPROVE" "$FENCE" >/dev/null 2>&1
  PROBE='echo PROBE_RAN; python3 - "'"$port"'" "'"$abs"'" "'"$O"'/ctl.sock" <<"PY"
import socket,sys
def t(name,fam,addr):
    s=socket.socket(fam)
    try: s.settimeout(3); s.connect(addr); print("REACHED:"+name)
    except Exception as e: print("blocked:"+name)
t("loopback",socket.AF_INET,("127.0.0.1",int(sys.argv[1])))
t("abstract",socket.AF_UNIX,"\0"+sys.argv[2])
t("pathsock",socket.AF_UNIX,sys.argv[3])
PY
curl -s -o /dev/null --max-time 8 -w "OTHERHOST:%{http_code}\n" https://example.com || echo OTHERHOST:fail'
  fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  kill "${pids[@]}" 2>/dev/null; wait "${pids[@]}" 2>/dev/null
  s=""; grep -q '^REACHED:' <<<"$OUT" && s="$(grep '^REACHED:' <<<"$OUT" | tr '\n' ' ')"
  grep -q '^OTHERHOST:200' <<<"$OUT" && s="${s:+$s; }example.com reachable"
  if grep -q PROBE_RAN <<<"$OUT" && grep -q 'blocked:loopback' <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_10_network"
  else no "test_allow_10_network: ${s:-probe incomplete} out=$(head -c 400 <<<"$OUT")"; fi
  drop_list; rm -f "$O/ctl.sock"
}

# 11. sanitized config: no /etc/ssl/private, sanitized gitconfig and settings, opened
# repos' git hooks/config read-only
test_allow_11_sanitized_config(){
  linux_only test_allow_11_sanitized_config || return 0
  local FH="$TMP/fhome-a11" O="$TMP/opened-a11" s
  mkdir -p "$FH/.claude" "$O"
  printf '[user]\n\tname = T\n\temail = t@example.invalid\n[http]\n\textraheader = AUTHORIZATION: bearer GITSECRET_%s\n[url "https://tok:GITSECRET_%s@github.com/"]\n\tinsteadOf = https://github.com/\n' "$$" "$$" > "$FH/.gitconfig"
  printf '{"env":{"DATABASE_URL":"postgres://u:SETTINGSSECRET_%s@h/db"},"hooks":{}}\n' "$$" > "$FH/.claude/settings.json"
  git -C "$O" init -q
  commit_list "$O"; "$APPROVE" "$FENCE" >/dev/null 2>&1
  PROBE='echo PROBE_RAN; test -e /etc/ssl/private && echo LEAK:sslprivate; cat "$HOME/.gitconfig" "$HOME/.claude/settings.json"; git config --global user.email; echo hook >> '"$(q "$O/.git/hooks/post-commit")"' && echo LEAK:hookwrite; echo x >> '"$(q "$O/.git/config")"' && echo LEAK:configwrite; true'
  fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1 HOME="$FH"
  s=""
  grep -q 'GITSECRET_\|SETTINGSSECRET_\|^LEAK:' <<<"$OUT" && s="$(grep -o 'GITSECRET_[0-9]*\|SETTINGSSECRET_[0-9]*\|LEAK:[a-z]*' <<<"$OUT" | sort -u | tr '\n' ' ')"
  grep -q 't@example.invalid' <<<"$OUT" || s="${s:+$s; }user.email lost"
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_11_sanitized_config"
  else no "test_allow_11_sanitized_config: $s out=$(head -c 300 <<<"$OUT")"; fi
  drop_list
}

# 12. secret files inside openings beyond .env
test_allow_12_secret_names(){
  linux_only test_allow_12_secret_names || return 0
  local O="$TMP/opened-a12" f leaked=()
  mkdir -p "$O/.claude" "$O/deep/x"
  for f in .claude/settings.local.json app.local.json .npmrc .netrc .git-credentials credentials.json deep/x/server.pem deep/x/tls.key service-account-prod.json .envrc .dev.vars secrets.yaml; do
    echo "SECRETNAME_${f//[^a-z]/}_$$" > "$O/$f"
  done
  commit_list "ro:$O"; "$APPROVE" "$FENCE" >/dev/null 2>&1
  PROBE="echo PROBE_RAN; cd $(q "$O") && cat .claude/settings.local.json app.local.json .npmrc .netrc .git-credentials credentials.json deep/x/server.pem deep/x/tls.key service-account-prod.json .envrc .dev.vars secrets.yaml 2>/dev/null; true"
  fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  mapfile -t leaked < <(grep -o "SECRETNAME_[a-z]*_$$" <<<"$OUT")
  if grep -q PROBE_RAN <<<"$OUT" && [ "${#leaked[@]}" -eq 0 ]; then ok "test_allow_12_secret_names"
  else no "test_allow_12_secret_names: leaked=[${leaked[*]}] out=$(head -c 200 <<<"$OUT")"; fi
  drop_list
}

# 13. /proc shows only the sandbox, no /sys, minimal /dev
test_allow_13_proc_sys_dev(){
  linux_only test_allow_13_proc_sys_dev || return 0
  PROBE='echo PROBE_RAN; ls /proc | grep -c "^[0-9]*$" | sed "s/^/PIDS:/"; test -e /sys/class && echo LEAK:sys; ls /dev | grep -E "^(sd|nvme|vd|mem|kmsg|loop)" | sed "s/^/LEAK:dev:/"; true'
  fence_run "$FENCE"
  local n; n=$(sed -n 's/^PIDS://p' <<<"$OUT")
  if grep -q PROBE_RAN <<<"$OUT" && ! grep -q '^LEAK:' <<<"$OUT" && [ "${n:-999}" -lt 10 ]; then ok "test_allow_13_proc_sys_dev"
  else no "test_allow_13_proc_sys_dev: pids=$n $(grep '^LEAK:' <<<"$OUT" | tr '\n' ' ')"; fi
}

# 14. the legacy backend stays selectable for one release, with a warning
test_allow_14_legacy_selectable(){
  linux_only test_allow_14_legacy_selectable || return 0
  PROBE='echo PROBE_RAN; test -d /usr/share && echo USR_OK'; fence_run "$FENCE" ZAI_FENCE_LINUX_BACKEND=legacy
  if grep -q USR_OK <<<"$OUT" && grep -qi 'legacy' <<<"$OUT"; then ok "test_allow_14_legacy_selectable"
  else no "test_allow_14_legacy_selectable: rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
}

# 16. fleet run-dir engine/env files inside the root are read-only to the worker
# (the master's next spawn would run what they say, unfenced)
test_allow_16_fleet_config_ro(){
  linux_only test_allow_16_fleet_config_ro || return 0
  local s
  mkdir -p "$FENCE/planning/fleet-t"; echo "orig" > "$FENCE/planning/fleet-t/engines.env"; echo "orig" > "$FENCE/planning/fleet-t/fleet.env"
  PROBE="echo PROBE_RAN; echo evil >> planning/fleet-t/engines.env; echo evil >> planning/fleet-t/fleet.env"; fence_run "$FENCE"
  s=""; grep -q evil "$FENCE/planning/fleet-t/engines.env" "$FENCE/planning/fleet-t/fleet.env" && s="fleet config rewritten"
  expect "test_allow_16_fleet_config_ro" blocked "$s"
  rm -rf "$FENCE/planning/fleet-t"
}

# Final codex build review (2026-11-16), escape A: approval must pin RESOLVED
# paths. A symlink inside the writable root can be swapped by the worker
# between launches; a symlink elsewhere can drift after approval.
test_allow_sec_a(){
  local SAFE="$TMP/a-safe" PRIV="$TMP/a-private" LNK="$TMP/a-link" s
  mkdir -p "$SAFE" "$PRIV"; echo "PRIVATE_A_$$" > "$PRIV/secret.txt"
  ln -sfn "$SAFE" "$FENCE/openref"
  open_refused test_allow_sec_a_symlink_in_root_refused "ro:$FENCE/openref"
  rm -f "$FENCE/openref"
  ln -sfn "$SAFE" "$LNK"
  commit_list "ro:$LNK"
  PROBE="echo PROBE_RAN; ls $(q "$SAFE")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  expect "test_allow_sec_a_approved_resolution_opens" allowed
  ln -sfn "$PRIV" "$LNK"      # drift after approval, policy text unchanged
  OUT=$(cd "$FENCE" && env ZAI_FENCE_OPEN_DIRS=1 "$WRAP" /bin/bash -c "echo PROBE_RAN; cat $(q "$PRIV/secret.txt")" 2>&1); RC=$?
  if [ "$RC" -eq 70 ] && ! grep -q "PRIVATE_A_$$" <<<"$OUT" && grep -qi 'approv' <<<"$OUT"; then ok "test_allow_sec_a_resolved_drift_refused"
  else no "test_allow_sec_a_resolved_drift_refused: rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
  rm -f "$LNK"; drop_list
}

# Escape B: renaming the PARENT of a read-only file bind moves the bind away;
# the worker then recreates the parent with its own config. Every protected
# file set must survive an ancestor rename attempt.
test_allow_sec_b(){
  linux_only test_allow_sec_b || return 0
  local s t
  mkdir -p "$FENCE/planning/fleet-b"; echo orig > "$FENCE/planning/fleet-b/engines.env"
  commit_list "$TMP/opened"; mkdir -p "$TMP/opened"
  local -a cases=(
    "git_config|mv .git oldgit; mkdir -p .git && printf '[core]\\n\\thooksPath=/tmp\\n' > .git/config|.git/config|hooksPath=/tmp"
    "git_hooks|mv .git oldgit2; mkdir -p .git/hooks && echo evil > .git/hooks/pre-commit|.git/hooks/pre-commit|evil"
    "claude_settings|mv .claude oldclaude; mkdir -p .claude && echo evil > .claude/settings.json|.claude/settings.json|evil"
    "glm_open_list|mv .claude oldclaude2; mkdir -p .claude && echo /etc > .claude/glm-open-dirs|.claude/glm-open-dirs|/etc"
    "worktree_settings|mv .claude/worktrees/w1 .claude/worktrees/w1x; mkdir -p .claude/worktrees/w1/.claude && echo evil > .claude/worktrees/w1/.claude/settings.json|.claude/worktrees/w1/.claude/settings.json|evil"
    "fleet_engines|mv planning/fleet-b planning/fleet-bx; mkdir -p planning/fleet-b && echo evil > planning/fleet-b/engines.env|planning/fleet-b/engines.env|evil"
    "fleet_planning|mv planning planning-x; mkdir -p planning/fleet-b && echo evil > planning/fleet-b/engines.env|planning/fleet-b/engines.env|evil"
  )
  mkdir -p "$WT/.claude"; echo '{}' > "$WT/.claude/settings.json"
  for t in "${cases[@]}"; do
    IFS='|' read -r name cmd file bad <<<"$t"
    PROBE="echo PROBE_RAN; $cmd; true"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
    s=""; grep -qF -- "$bad" "$FENCE/$file" 2>/dev/null && s="$file replaced via ancestor rename"
    if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_sec_b:$name"
    else no "test_allow_sec_b:$name: ${s:-probe never ran} out=$(head -c 200 <<<"$OUT")"; fi
    # undo any partial rename so the next case starts clean (host side)
    for x in oldgit oldgit2 oldclaude oldclaude2 planning-x; do
      [ -e "$FENCE/$x" ] || continue
      case "$x" in oldgit*) rm -rf "$FENCE/.git"; mv "$FENCE/$x" "$FENCE/.git" ;;
                   oldclaude*) rm -rf "$FENCE/.claude"; mv "$FENCE/$x" "$FENCE/.claude" ;;
                   planning-x) rm -rf "$FENCE/planning"; mv "$FENCE/$x" "$FENCE/planning" ;; esac
    done
    [ -e "$FENCE/.claude/worktrees/w1x" ] && { rm -rf "$FENCE/.claude/worktrees/w1"; mv "$FENCE/.claude/worktrees/w1x" "$FENCE/.claude/worktrees/w1"; }
    [ -e "$FENCE/planning/fleet-bx" ] && { rm -rf "$FENCE/planning/fleet-b"; mv "$FENCE/planning/fleet-bx" "$FENCE/planning/fleet-b"; }
  done
  drop_list; rm -rf "$FENCE/planning/fleet-b"
}

# Independent security review (2026-11-16): one red test per finding.

# rev 1: the worker env is an allow-list; unknown secret-looking names never pass
test_allow_rev_1_env_allowlist(){
  linux_only test_allow_rev_1_env_allowlist || return 0
  local v="fake-$RANDOM-$RANDOM-$$" leaked
  PROBE='echo PROBE_RAN; env'
  fence_run "$FENCE" FAKE_SVC_TOKEN="$v" N8N_NOTION_MCP_TOKEN="$v" TYPESAFE_API_KEY="$v" _ANTHROPIC_AUTH_TOKEN="$v" CLAUDE_CODE_MESSAGING_TOKEN="$v" FLEET_ZAI_TOKEN="$v" ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
  leaked=$(grep -F "$v" <<<"$OUT" | cut -d= -f1 | tr '\n' ' ')
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$leaked" ] && grep -q '^ANTHROPIC_BASE_URL=https://api.z.ai' <<<"$OUT"; then ok "test_allow_rev_1_env_allowlist"
  else no "test_allow_rev_1_env_allowlist: leaked=[$leaked] base_url=$(grep -c '^ANTHROPIC_BASE_URL=' <<<"$OUT")"; fi
}

# rev 2: git metadata the HOST runs later is read-only: worktree .git pointer,
# .git/worktrees/*/{commondir,gitdir}, config; an fsmonitor planted through any
# of them must never run on the host. A pointer resolving outside its repo refuses.
test_allow_rev_2_git_metadata(){
  linux_only test_allow_rev_2_git_metadata || return 0
  local m="$TMP/rev2-fsmonitor-ran" s wtn
  wtn=$(basename "$WT")
  mkdir -p "$TMP/evilgit"; git -C "$TMP/evilgit" init -q
  PROBE="echo PROBE_RAN; printf 'gitdir: $TMP/evilgit/.git\n' > .claude/worktrees/$wtn/.git; echo ../../../../evil > .git/worktrees/$wtn/commondir; echo x > .git/worktrees/$wtn/gitdir; printf '[core]\n\tfsmonitor = touch $m\n' >> .git/worktrees/$wtn/config.worktree; git -C .claude/worktrees/$wtn config core.fsmonitor 'touch $m'; true"
  fence_run "$FENCE"
  git -C "$WT" status >/dev/null 2>&1; git -C "$FENCE" status >/dev/null 2>&1
  s=""; [ -e "$m" ] && s="fsmonitor ran on the host"
  grep -q evilgit "$WT/.git" 2>/dev/null && s="${s:+$s; }worktree pointer rewritten"
  grep -q evil "$FENCE/.git/worktrees/$wtn/commondir" 2>/dev/null && s="${s:+$s; }commondir rewritten"
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_rev_2_git_metadata_ro"
  else no "test_allow_rev_2_git_metadata_ro: $s"; fi
  mkdir -p "$FENCE/subrepo"; printf 'gitdir: %s\n' "$TMP/evilgit/.git" > "$FENCE/subrepo/.git"
  OUT=$(cd "$FENCE" && "$WRAP" /bin/bash -c 'echo PROBE_RAN' 2>&1); RC=$?
  if [ "$RC" -eq 70 ] && ! grep -q PROBE_RAN <<<"$OUT" && grep -q 'subrepo' <<<"$OUT"; then ok "test_allow_rev_2_foreign_git_pointer_refused"
  else no "test_allow_rev_2_foreign_git_pointer_refused: rc=$RC out=$(head -c 200 <<<"$OUT")"; fi
  rm -rf "$FENCE/subrepo"
}

# rev 3: the worker cannot create a fleet run dir (fleet discovery picks the newest)
test_allow_rev_3_no_new_fleet_run_dir(){
  linux_only test_allow_rev_3_no_new_fleet_run_dir || return 0
  local s
  mkdir -p "$FENCE/planning/fleet-r3"; echo orig > "$FENCE/planning/fleet-r3/roster.tsv"
  PROBE="echo PROBE_RAN; mkdir -p planning/fleet-zzz && echo 'glm | /bin/sh | -c evil | | | | x' > planning/fleet-zzz/engines.env; echo row >> planning/fleet-r3/roster.tsv"
  fence_run "$FENCE"
  s=""; [ -e "$FENCE/planning/fleet-zzz" ] && s="new run dir created"
  grep -q row "$FENCE/planning/fleet-r3/roster.tsv" || s="${s:+$s; }existing run dir no longer writable"
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_rev_3_no_new_fleet_run_dir"
  else no "test_allow_rev_3_no_new_fleet_run_dir: $s"; fi
  rm -rf "$FENCE/planning/fleet-r3" "$FENCE/planning/fleet-zzz"
}

# rev 4: only AF_UNIX / AF_INET / AF_INET6 sockets (no AF_VSOCK to the Windows host)
test_allow_rev_4_socket_families(){
  linux_only test_allow_rev_4_socket_families || return 0
  PROBE='echo PROBE_RAN; python3 -c "
import socket
for name,fam in ((\"vsock\",40),(\"netlink\",16),(\"packet\",17),(\"unix\",1),(\"inet\",2),(\"inet6\",10)):
    try:
        s=socket.socket(fam, socket.SOCK_DGRAM if fam==16 else socket.SOCK_STREAM); s.close(); print(\"OPEN:\"+name)
    except OSError as e: print(\"DENIED:\"+name)
"'
  fence_run "$FENCE"
  local missing=()
  grep -q 'DENIED:vsock' <<<"$OUT" || missing+=(vsock-open)
  grep -q 'DENIED:packet' <<<"$OUT" || missing+=(packet-open)
  grep -q 'OPEN:unix' <<<"$OUT" || missing+=(unix-denied)
  grep -q 'OPEN:inet' <<<"$OUT" || missing+=(inet-denied)
  if grep -q PROBE_RAN <<<"$OUT" && [ "${#missing[@]}" -eq 0 ]; then ok "test_allow_rev_4_socket_families"
  else no "test_allow_rev_4_socket_families: [${missing[*]}] out=$(head -c 200 <<<"$OUT")"; fi
}

# rev 5: no .mcp.json and no writes to project .claude/{skills,agents,commands,hooks}
# or settings (the host's next unfenced session loads them)
test_allow_rev_5_project_claude_config(){
  linux_only test_allow_rev_5_project_claude_config || return 0
  local s d
  mkdir -p "$FENCE/.claude/skills/s1" "$FENCE/.claude/agents" "$FENCE/.claude/commands"
  echo orig > "$FENCE/.claude/skills/s1/SKILL.md"
  rm -f "$FENCE/.mcp.json"
  PROBE='echo PROBE_RAN; echo "{\"mcpServers\":{\"x\":{\"command\":\"evil\"}}}" > .mcp.json; echo evil >> .claude/skills/s1/SKILL.md; mkdir -p .claude/skills/s2 && echo evil > .claude/skills/s2/SKILL.md; echo evil > .claude/agents/a.md; echo evil > .claude/commands/c.md; echo evil > .claude/settings.local.json; true'
  fence_run "$FENCE"
  s=""
  grep -q evil "$FENCE/.mcp.json" 2>/dev/null && s=".mcp.json written"
  # the fence leaves a valid, empty placeholder (never deleted: other workers
  # on the same repo hold read-only mounts of it)
  [ "$(cat "$FENCE/.mcp.json" 2>/dev/null)" = '{"mcpServers":{}}' ] || s="${s:+$s; }placeholder not the empty server list"
  # ... and never shows up as an untracked file (local .git/info/exclude)
  git -C "$FENCE" status --porcelain | grep -q '\.mcp\.json' && s="${s:+$s; }placeholder listed by git status"
  grep -q evil "$FENCE/.claude/skills/s1/SKILL.md" && s="${s:+$s; }skill edited"
  for d in skills/s2/SKILL.md agents/a.md commands/c.md settings.local.json; do [ -e "$FENCE/.claude/$d" ] && s="${s:+$s; }$d created"; done
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_rev_5_project_claude_config"
  else no "test_allow_rev_5_project_claude_config: $s"; fi
  rm -rf "$FENCE/.claude/skills" "$FENCE/.claude/agents" "$FENCE/.claude/commands" "$FENCE/.mcp.json"
}

# Final review (2026-11-16): one red test per finding.

# fin 1: new files git would read from .git cannot be created by the worker
# (.git/commondir redirects the whole repo, config.worktree adds config); normal
# add / commit / branch still work.
test_allow_fin_1_git_new_files(){
  linux_only test_allow_fin_1_git_new_files || return 0
  local m="$TMP/fin1-fsmonitor-ran" s before
  before=$(git -C "$FENCE" rev-parse HEAD)
  PROBE="echo PROBE_RAN; mkdir -p $(q "$TMP/fin1evil"); echo $(q "$TMP/fin1evil") > .git/commondir; printf '[core]\n\tfsmonitor = touch $m\n' > .git/config.worktree; wt=\$(ls .git/worktrees | head -n 1); printf '[core]\n\tfsmonitor = touch $m\n' > .git/worktrees/\$wt/config.worktree; echo f1 > fin1.txt && git add fin1.txt && git $(printf '%q ' "${GITC[@]}") commit -qm fin1 && git branch fin1-branch && echo GIT_OK"
  fence_run "$FENCE"
  git -C "$FENCE" status >/dev/null 2>&1; git -C "$WT" status >/dev/null 2>&1
  s=""
  [ -e "$m" ] && s="fsmonitor ran on the host"
  grep -q fin1evil "$FENCE/.git/commondir" 2>/dev/null && s="${s:+$s; }commondir planted"
  grep -q fsmonitor "$FENCE/.git/config.worktree" 2>/dev/null && s="${s:+$s; }config.worktree planted"
  grep -q GIT_OK <<<"$OUT" || s="${s:+$s; }git add/commit/branch broke"
  [ "$(git -C "$FENCE" rev-parse HEAD)" != "$before" ] || s="${s:+$s; }no commit landed"
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_fin_1_git_new_files"
  else no "test_allow_fin_1_git_new_files: $s out=$(head -c 300 <<<"$OUT")"; fi
  # undo a planted redirect (red runs) so later tests see a working repo
  grep -q fin1evil "$FENCE/.git/commondir" 2>/dev/null && printf '.\n' > "$FENCE/.git/commondir"
  grep -q fsmonitor "$FENCE/.git/config.worktree" 2>/dev/null && : > "$FENCE/.git/config.worktree"
  for f in "$FENCE"/.git/worktrees/*/config.worktree; do grep -q fsmonitor "$f" 2>/dev/null && : > "$f"; done
  git -C "$FENCE" branch -D fin1-branch >/dev/null 2>&1
}

# fin 2: every rw opening gets the root's protections: no .claude/settings.json,
# no .mcp.json, no new .git the host would later trust
test_allow_fin_2_rw_opening_config(){
  linux_only test_allow_fin_2_rw_opening_config || return 0
  local O="$TMP/opened-fin2" s
  mkdir -p "$O"
  commit_list "$O"
  PROBE="echo PROBE_RAN; cd $(q "$O"); mkdir -p .claude; echo evil > .claude/settings.json; echo '{\"mcpServers\":{\"x\":{\"command\":\"evil\"}}}' > .mcp.json; git init -q . 2>/dev/null; mkdir -p .git/hooks && echo evil > .git/hooks/post-checkout; echo ok > data.txt; true"
  fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""
  grep -q evil "$O/.claude/settings.json" 2>/dev/null && s="settings.json planted"
  grep -q evil "$O/.mcp.json" 2>/dev/null && s="${s:+$s; }.mcp.json planted"
  [ -e "$O/.git/HEAD" ] && s="${s:+$s; }git repo planted"
  grep -q evil "$O/.git/hooks/post-checkout" 2>/dev/null && s="${s:+$s; }hook planted"
  [ -f "$O/data.txt" ] || s="${s:+$s; }opening no longer writable"
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_fin_2_rw_opening_config"
  else no "test_allow_fin_2_rw_opening_config: $s out=$(head -c 300 <<<"$OUT")"; fi
  drop_list
}

# fin 3: the project root is scanned with the full secret-name list too
test_allow_fin_3_root_secret_names(){
  linux_only test_allow_fin_3_root_secret_names || return 0
  local f leaked=()
  mkdir -p "$FENCE/fin3/x"
  for f in credentials.json x/server.pem x/tls.key .npmrc .dev.vars .envrc service-account-ci.json x/state.tfstate; do
    echo "ROOTSECRET_${f//[^a-z]/}_$$" > "$FENCE/fin3/$f"
  done
  PROBE="echo PROBE_RAN; cd fin3 && cat credentials.json x/server.pem x/tls.key .npmrc .dev.vars .envrc service-account-ci.json x/state.tfstate 2>/dev/null; true"
  fence_run "$FENCE"
  mapfile -t leaked < <(grep -o "ROOTSECRET_[a-z]*_$$" <<<"$OUT")
  if grep -q PROBE_RAN <<<"$OUT" && [ "${#leaked[@]}" -eq 0 ]; then ok "test_allow_fin_3_root_secret_names"
  else no "test_allow_fin_3_root_secret_names: leaked=[${leaked[*]}]"; fi
  rm -rf "$FENCE/fin3"
}

# Latest review P1-1: a symlink planted by an earlier run at a protected or
# placeholder path must never make the next launch bind (or write) the host
# file it points to. Each case plants the link host-side (as run 1 would) and
# expects the launch to refuse, naming the path, with the target untouched.
link_case(){
  # The link target must also exist INSIDE the fence, or bwrap fails by luck:
  # the fake HOME's ~/.claude.json (the fence gives the worker a generated one
  # at the same path), and ~/.claude for the directory case.
  local name="$1" path="$2" kind="${3:-file}" bak="$TMP/link-bak" FH="$TMP/fhome-link" before tgt
  mkdir -p "$FH/.claude"
  printf '{"hasCompletedOnboarding":true,"marker":"LINK_SECRET_%s"}\n' "$$" > "$FH/.claude.json"
  echo "LINK_SECRET_$$" > "$FH/.claude/inside.txt"
  before=$(cat "$FH/.claude.json")
  rm -rf "$bak"; [ -e "$path" ] || [ -L "$path" ] && mv "$path" "$bak"
  if [ "$kind" = dir ]; then tgt="$FH/.claude"; else tgt="$FH/.claude.json"; fi
  ln -s "$tgt" "$path"
  OUT=$(cd "$FENCE" && env HOME="$FH" "$WRAP" /bin/bash -c "echo PROBE_RAN; cat $(q "$path") $(q "$path")/inside.txt 2>/dev/null; true" 2>&1); RC=$?
  local s=""
  grep -q "LINK_SECRET_$$" <<<"$OUT" && s="host file content visible"
  [ "$(cat "$FH/.claude.json")" = "$before" ] || s="${s:+$s; }host file modified"
  if [ "$RC" -eq 70 ] && ! grep -q PROBE_RAN <<<"$OUT" && grep -qF "$path" <<<"$OUT" && grep -qi 'symlink' <<<"$OUT" && [ -z "$s" ]; then ok "$name"
  else no "$name: want rc=70 naming $path as a symlink; rc=$RC ${s:+side=[$s]} out=$(head -c 250 <<<"$OUT")"; fi
  rm -f "$path"; [ -e "$bak" ] || [ -L "$bak" ] && mv "$bak" "$path"
  return 0
}

test_allow_link(){
  linux_only test_allow_link || return 0
  local wtn; wtn=$(basename "$WT")
  link_case test_allow_link_1_config_worktree "$FENCE/.git/worktrees/$wtn/config.worktree"
  link_case test_allow_link_2_gitdir "$FENCE/.git/worktrees/$wtn/gitdir"
  link_case test_allow_link_3_git_hooks_dir "$FENCE/.git/hooks" dir
  link_case test_allow_link_4_worktree_mcp_json "$WT/.mcp.json"
  mkdir -p "$FENCE/planning/fleet-l"; echo orig > "$FENCE/planning/fleet-l/fleet.env"
  link_case test_allow_link_5_engines_env "$FENCE/planning/fleet-l/engines.env"
  link_case test_allow_link_5_fleet_env "$FENCE/planning/fleet-l/fleet.env"
  rm -rf "$FENCE/planning/fleet-l"
  # host-side append: .git/info/exclude planted as a link, .mcp.json absent
  rm -f "$FENCE/.mcp.json"
  link_case test_allow_link_6_exclude_append "$FENCE/.git/info/exclude"
}

# MDTWII art desk field report (2026-11-16): first real glm-open launch.

# field 1: an opened folder may hold a worktree of the fence root itself; its
# .git pointer leads into the root's .git, which the fence protects. This
# refused ("outside its own repo") and killed every MDTWII glm-open launch.
test_allow_field_1_opening_holds_root_worktree(){
  linux_only test_allow_field_1_opening_holds_root_worktree || return 0
  local O="$TMP/opened-field1"
  mkdir -p "$O"
  git -C "$FENCE" worktree add -q "$O/wt" -b field1 >/dev/null 2>&1
  commit_list "$O"
  PROBE="echo PROBE_RAN; echo ok > $(q "$O/field1.txt")"; fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  expect "test_allow_field_1_opening_holds_root_worktree" allowed "$([ -f "$O/field1.txt" ] || echo not-written)"
  git -C "$FENCE" worktree remove --force "$O/wt" >/dev/null 2>&1; git -C "$FENCE" branch -D field1 >/dev/null 2>&1
  drop_list
}

# field 2: the secret scan of big opened folders takes minutes on /mnt/c (138s
# for 680k files measured); the fence says what it is doing so a waiting pane
# is not mistaken for a hang.
test_allow_field_2_scan_progress(){
  linux_only test_allow_field_2_scan_progress || return 0
  local O="$TMP/opened-field2"; mkdir -p "$O"
  commit_list "$O"
  OUT=$(cd "$FENCE" && env ZAI_FENCE_OPEN_DIRS=1 "$WRAP" /bin/true 2>&1); RC=$?
  if [ "$RC" -eq 0 ] && grep -q "zai-fence: checking $O" <<<"$OUT"; then ok "test_allow_field_2_scan_progress"
  else no "test_allow_field_2_scan_progress: rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
  drop_list
}

# field 3: launching glm-open from an approved folder (not a repo with a list)
# is refused; the message must say to launch from the repo that lists it.
test_allow_field_3_refusal_names_pattern(){
  local D="$TMP/art-folder"; mkdir -p "$D"
  OUT=$(cd "$D" && env ZAI_FENCE_OPEN_DIRS=1 "$WRAP" /bin/bash -c 'echo PROBE_RAN' 2>&1); RC=$?
  if [ "$RC" -eq 70 ] && grep -q 'launch from the repo' <<<"$OUT"; then ok "test_allow_field_3_refusal_names_pattern"
  else no "test_allow_field_3_refusal_names_pattern: rc=$RC out=$(head -c 300 <<<"$OUT")"; fi
}

# noscan: (user decision 2026-11-16, MDTWII captures folder holds no passwords):
# a per-entry prefix that skips the secret-file scan for that entry only,
# combinable with ro: in any order. Changing it needs re-approval.
test_allow_noscan(){
  linux_only test_allow_noscan || return 0
  local O1="$TMP/ns-skip" O2="$TMP/ns-ro" O3="$TMP/ns-scan" s
  mkdir -p "$O1" "$O2" "$O3"
  for d in "$O1" "$O2" "$O3"; do echo "NS_SECRET_$(basename "$d")_$$" > "$d/.env"; done
  commit_list "$(printf 'noscan:%s\nro:noscan:%s\n%s' "$O1" "$O2" "$O3")"
  PROBE="echo PROBE_RAN; cat $(q "$O1/.env") $(q "$O2/.env") $(q "$O3/.env") 2>/dev/null; echo x > $(q "$O2/w.txt") && echo O2_WRITABLE; true"
  fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  s=""
  grep -q "zai-fence: not checking $O1 for secret files (noscan)" <<<"$OUT" || s="no skip line for $O1"
  grep -q "zai-fence: not checking $O2 for secret files (noscan)" <<<"$OUT" || s="${s:+$s; }no skip line for $O2 (ro:noscan:)"
  grep -q "NS_SECRET_ns-scan_$$" <<<"$OUT" && s="${s:+$s; }scanned entry's .env leaked"
  grep -q O2_WRITABLE <<<"$OUT" && s="${s:+$s; }ro:noscan: entry writable"
  grep -q "zai-fence: checking $O3" <<<"$OUT" || s="${s:+$s; }plain entry not scanned"
  if grep -q PROBE_RAN <<<"$OUT" && [ -z "$s" ]; then ok "test_allow_noscan_skips_only_marked_entries"
  else no "test_allow_noscan_skips_only_marked_entries: $s out=$(head -c 300 <<<"$OUT")"; fi
  # noscan:ro: (other order) parses too
  commit_list "$(printf 'noscan:ro:%s' "$O2")"
  PROBE="echo PROBE_RAN; echo x > $(q "$O2/w2.txt") && echo O2_WRITABLE; true"
  fence_run "$FENCE" ZAI_FENCE_OPEN_DIRS=1
  if grep -q PROBE_RAN <<<"$OUT" && ! grep -q O2_WRITABLE <<<"$OUT" && grep -q "not checking $O2" <<<"$OUT"; then ok "test_allow_noscan_any_prefix_order"
  else no "test_allow_noscan_any_prefix_order: out=$(head -c 300 <<<"$OUT")"; fi
  # toggling noscan without a new approval refuses
  commit_list "$O3"
  printf 'noscan:%s\n' "$O3" > "$OPEN_LIST"
  git -C "$FENCE" add -f .claude/glm-open-dirs && git -C "$FENCE" "${GITC[@]}" commit -qm "noscan toggle" >/dev/null
  open_refused test_allow_noscan_toggle_needs_reapproval __KEEP__
  grep -q 'approv' <<<"$OUT" || no "test_allow_noscan_toggle_needs_reapproval: message does not mention approval"
  drop_list
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
    # both fence backends: Seatbelt (macOS) and bubblewrap (Linux)
    case "$(basename "$f")" in sandbox-exec|bwrap) continue ;; esac
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
test_open_dirs
test_open_dirs_glob_ro
test_sec_2_uncommitted_list
test_sec_3_git_env_redirect
test_sec_4_symlink_list
test_sec_5_open_inside_cred_refused
test_sec_6_macos_cred_masks
test_sec_7_env_scan_fail_closed
test_sec_8_cred_in_repo_masked
test_sec_9_ro_inside_root
test_sec_10_wrapper_scrubs_env
test_sec2_3_unreadable_subdir_refuses
test_zai_scan_skips_foreign_unreadable
test_sec2_4_cred_in_claude_dir_masked
test_sec2_5_ro_claude_data
test_glm_settings_mask_regular_json
test_sec2_6_replace_ref_ignored
test_allow_1_absent
test_allow_2_claude_starts
test_allow_5_runtime_ro_inside_root
test_allow_6_private_state
test_allow_7_approval
test_allow_8_pinned_fds
test_allow_9_fds_closed
test_allow_10_network
test_allow_11_sanitized_config
test_allow_12_secret_names
test_allow_13_proc_sys_dev
test_allow_14_legacy_selectable
test_allow_16_fleet_config_ro
test_allow_sec_a
test_allow_sec_b
test_allow_rev_1_env_allowlist
test_allow_rev_2_git_metadata
test_allow_rev_3_no_new_fleet_run_dir
test_allow_rev_4_socket_families
test_allow_rev_5_project_claude_config
test_allow_fin_1_git_new_files
test_allow_fin_2_rw_opening_config
test_allow_fin_3_root_secret_names
test_allow_link
test_allow_field_1_opening_holds_root_worktree
test_allow_field_2_scan_progress
test_allow_field_3_refusal_names_pattern
test_allow_noscan
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
