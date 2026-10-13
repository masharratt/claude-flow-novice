#!/usr/bin/env bash
# fleet host-setup <alias> [--check]
# One-time (idempotent) preparation of a worker host for `fleet spawn --host`.
# Server layout (all under the server's $HOME, never a hardcoded user):
#   ~/git/<project>.git        bare repo the Mac pushes to / lands from
#   ~/fleet-repos/<project>    fleet clone of that bare repo
#   ~/fleet-runs/              outboxes for remote workers
# Never touches ~/Projects/<project> on the server, never copies .env,
# never touches claude/gh logins. Exit codes: 0 ok, 64 usage, 65 data error
# (remote alias already points elsewhere, bad project), 71 transport/internal.

# shellcheck source=host.sh
source "$(dirname "${BASH_SOURCE[0]}")/host.sh"

# Candidate server paths for the claude-flow-novice-src checkout (drift check).
_HS_CFN_SRC_CANDIDATES='$HOME/claude-flow-novice-src $HOME/Projects/claude-flow-novice-src $HOME/fleet-repos/claude-flow-novice-src'

# Server side, run via `bash -c SCRIPT _ PROJECT`: create dirs and the bare repo.
_HS_SERVER_PREP='
set -e
p="$1"
mkdir -p "$HOME/git" "$HOME/fleet-repos" "$HOME/fleet-runs"
if [ ! -d "$HOME/git/$p.git" ]; then
  git init --bare -q "$HOME/git/$p.git"
  git --git-dir="$HOME/git/$p.git" symbolic-ref HEAD refs/heads/main
fi
'

# Server side: clone the bare repo once; afterwards only fetch (and fast-forward
# the clone, which fleet owns) so an existing clone is never rewritten.
_HS_SERVER_CLONE='
set -e
p="$1"
c="$HOME/fleet-repos/$p"
if [ ! -d "$c/.git" ]; then
  git clone -q "$HOME/git/$p.git" "$c"
else
  git -C "$c" fetch -q origin
  git -C "$c" merge -q --ff-only origin/main >/dev/null 2>&1 || true
fi
'

_HS_SERVER_INFO='
tm=$(tmux -V 2>/dev/null || echo "missing")
cl=$(claude --version 2>/dev/null | head -n 1); [ -n "$cl" ] || cl="missing"
acct=""
for f in "$HOME/.claude.json" "$HOME/.claude/.claude.json"; do
  [ -f "$f" ] || continue
  acct=$(grep -o "\"emailAddress\": *\"[^\"]*\"" "$f" 2>/dev/null | head -n 1 | sed "s/.*: *\"//; s/\"$//")
  [ -n "$acct" ] && break
done
printf "tmux=%s\nclaude=%s\naccount=%s\n" "$tm" "$cl" "${acct:-unknown}"
for d in '"$_HS_CFN_SRC_CANDIDATES"'; do
  if [ -d "$d/.git" ]; then printf "cfn_commit=%s\n" "$(git -C "$d" rev-parse HEAD 2>/dev/null)"; break; fi
done
'

_host_setup_check() { # _host_setup_check ALIAS
  local alias="$1" out line free mac_dir mac_commit srv_commit
  out=$(_fleet_host_run "$alias" bash -c "$_HS_SERVER_INFO" 2>/dev/null) \
    || fleet_die 71 "cannot reach host '$alias' over ssh"
  printf '%s\n' "$out" | grep -v '^cfn_commit=' | while IFS= read -r line; do
    echo "$line"
  done
  if free=$(_fleet_host_free_gb "$alias"); then
    echo "free_disk_gb=$free"
  else
    echo "free_disk_gb=unknown"
  fi
  srv_commit=$(printf '%s\n' "$out" | sed -n 's/^cfn_commit=//p' | head -n 1)
  mac_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
  mac_commit=$(git -C "$mac_dir" rev-parse HEAD 2>/dev/null || true)
  if [ -z "$srv_commit" ]; then
    echo "cfn_commit=unknown (claude-flow-novice-src not found on host)"
    echo "WARN: cannot compare claude-flow-novice-src commits: no checkout on host" >&2
  elif [ -z "$mac_commit" ]; then
    echo "cfn_commit=$srv_commit (local commit unknown)"
  elif [ "$srv_commit" = "$mac_commit" ]; then
    echo "cfn_commit=$srv_commit (matches local)"
  else
    echo "cfn_commit=$srv_commit (local ${mac_commit})"
    echo "WARN: claude-flow-novice-src on '$alias' differs from this machine (drift)" >&2
  fi
}

host_setup() { # host_setup ALIAS [--check]
  local alias="" check=0 a
  for a in "$@"; do
    case "$a" in
      --check) check=1 ;;
      -*) fleet_die 64 "usage: fleet host-setup <alias> [--check] (unknown flag $a)" ;;
      *) [ -z "$alias" ] || fleet_die 64 "usage: fleet host-setup <alias> [--check]"; alias="$a" ;;
    esac
  done
  [ -n "$alias" ] || fleet_die 64 "usage: fleet host-setup <alias> [--check]"
  fleet_valid_host "$alias" || fleet_die 64 "invalid host alias: $alias"

  if [ "$check" -eq 1 ]; then
    _host_setup_check "$alias"
    return 0
  fi

  local top project want have
  top=$(git rev-parse --show-toplevel 2>/dev/null) \
    || fleet_die 65 "host-setup must run inside the project's git repo"
  project=$(fleet_project_name "$top")
  [[ "$project" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || fleet_die 65 "project name '$project' has characters unsafe for a server path"
  want="$alias:git/$project.git"

  # Refuse before any server change when the remote name is taken elsewhere.
  if have=$(git -C "$top" remote get-url "$alias" 2>/dev/null); then
    [ "$have" = "$want" ] \
      || fleet_die 65 "git remote '$alias' already exists pointing at '$have' (expected '$want'); rename it or pick another alias"
  fi
  git -C "$top" rev-parse --verify -q refs/heads/main >/dev/null \
    || fleet_die 65 "no local 'main' branch to push"

  _fleet_host_run "$alias" bash -c "$_HS_SERVER_PREP" _ "$project" \
    || fleet_die 71 "could not prepare ~/git/$project.git on '$alias'"
  [ -n "${have:-}" ] || git -C "$top" remote add "$alias" "$want"
  git -C "$top" push -q "$alias" main \
    || fleet_die 71 "git push to '$alias' failed"
  _fleet_host_run "$alias" bash -c "$_HS_SERVER_CLONE" _ "$project" \
    || fleet_die 71 "could not clone/refresh ~/fleet-repos/$project on '$alias'"
  echo "host-setup ok: $alias ($project)"
}

main() { host_setup "$@"; }
