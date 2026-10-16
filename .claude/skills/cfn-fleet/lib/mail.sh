#!/usr/bin/env bash
# cfn-fleet lib/mail.sh: the fleet's side of the agent mailbox (mailbox stage 5,
# planning/PLAN_agent-mailbox.md "Stage 5 design (fleet, all workers)").
#
# Sourced by lib/common.sh (functions and constants only; prints nothing when
# sourced). Roster, brief and handoff files stay the record of truth; mail only
# carries short messages that name files.
#
#   fleet_mail_name PROJECT WS     worker address name <project>-<ws>, [a-z0-9-], <= 64
#   fleet_master_mail_name PROJECT master address name <project>-master
#   _fleet_mb_enabled              0 unless FLEET_MAILBOX (env > fleet.env) is off
#   _fleet_mb ARGS...              run mailbox.sh (FLEET_MAILBOX_SH overrides the path)
#   _fleet_mb_project              this run's project name (main checkout folder)
#   _fleet_mb_owner                mailbox owner from the local config (no network)
#   _fleet_coord_secret_file       <run>/.coord/secret, created on first use (dir 700,
#                                  file 600, self-ignoring .gitignore); prints the path
#   _fleet_mail_send WS TYPE TEXT  master -> worker mail with the coordinator secret
#   _fleet_mb_down_reason RC       plain words for a mailbox.sh exit code
#
# Message types (the mailbox `fleet` field): worker -> master status, handoff,
# claim-request, done, blocked; master -> worker assign, answer, stop.
# `status` is fyi (never wakes anyone); every other type is ask (the watcher
# wakes an idle pane). Bodies are short and name files; never paste a file.

_FLEET_MAIL_WORKER_TYPES="status handoff claim-request done blocked"
_FLEET_MAIL_MASTER_TYPES="assign answer stop"
_FLEET_MAIL_BODY_MAX=1000   # bytes; mail names files, it never carries them

# _fleet_mail_sanitize STR: lowercase, anything outside [a-z0-9-] becomes "-".
_fleet_mail_sanitize(){
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g'
}

# fleet_mail_name PROJECT WS: <project>-<ws>. WS ids repeat across projects, so
# the project is part of the name; a long project is cut so the ws part survives.
fleet_mail_name(){
  local p w max
  p=$(_fleet_mail_sanitize "$1")
  w=$(_fleet_mail_sanitize "$2")
  max=$((64 - 1 - ${#w} - 7))   # room for a spare's "-spare9" suffix within the 64-char name limit
  [ "$max" -ge 1 ] || max=1
  p="${p:0:$max}"
  printf '%s-%s\n' "$p" "$w"
}

fleet_master_mail_name(){ fleet_mail_name "$1" master; }

# _fleet_mb_enabled: the mailbox path is on unless FLEET_MAILBOX=off (env, then
# fleet.env). Suites that test the file-only paths set it off.
_fleet_mb_enabled(){
  local v="${FLEET_MAILBOX:-}"
  [ -n "$v" ] || v=$(fleet_env_get FLEET_MAILBOX 2>/dev/null || true)
  case "$v" in off|0|no|false) return 1 ;; esac
  return 0
}

_fleet_mb_sh(){
  if [ -n "${FLEET_MAILBOX_SH:-}" ]; then printf '%s\n' "$FLEET_MAILBOX_SH"; return 0; fi
  printf '%s\n' "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../cfn-mailbox" 2>/dev/null && pwd)/mailbox.sh"
}

# _fleet_mb ARGS: mailbox.sh with the caller's env. Output and exit code pass through.
_fleet_mb(){ bash "$(_fleet_mb_sh)" "$@"; }

# _fleet_mb_project: the project name every mailbox name of this run uses. The
# main checkout's folder (fleet_project_name), from git when possible, else the
# folder holding planning/fleet-*.
_fleet_mb_project(){
  local repo
  repo=$(git rev-parse --show-toplevel 2>/dev/null) || repo=""
  [ -n "$repo" ] || repo=$(cd "$(fleet_run_dir)/../.." 2>/dev/null && pwd)
  fleet_project_name "$repo"
}

# _fleet_mb_owner: the owner in the local mailbox config (whoami reads only the
# config). Empty, rc 1, when the mailbox is not set up.
_fleet_mb_owner(){
  local out
  out=$(_fleet_mb whoami 2>/dev/null) || return 1
  out=$(printf '%s\n' "$out" | sed -n 's/^owner=//p' | head -n 1)
  [ -n "$out" ] || return 1
  printf '%s\n' "$out"
}

# _fleet_coord_secret_file: the run's coordinator secret file, created on first
# use. One secret per run (32 hex from /dev/urandom). The dir is 700 and carries
# its own .gitignore ("*"), so the secret never reaches git even though run dirs
# live in the repo. Never print the secret itself.
_fleet_coord_secret_file(){
  local d f hex
  d="$(fleet_run_dir)/.coord"
  f="$d/secret"
  ( umask 077; mkdir -p "$d" ) || fleet_die 71 "cannot create $d"
  chmod 700 "$d" 2>/dev/null || true
  [ -f "$d/.gitignore" ] || printf '*\n' > "$d/.gitignore"
  if [ ! -s "$f" ]; then
    hex=$(od -An -N16 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')
    [[ "$hex" =~ ^[0-9a-f]{32}$ ]] || fleet_die 71 "could not read /dev/urandom for the coordinator secret"
    ( umask 077; printf 'coordinator-secret: %s\n' "$hex" > "$f.tmp.$$" && mv -f "$f.tmp.$$" "$f" ) \
      || fleet_die 71 "cannot write $f"
  fi
  chmod 600 "$f" 2>/dev/null || true
  printf '%s\n' "$f"
}

# _fleet_mail_kind TYPE: status is fyi, every other fleet type asks (wakes).
_fleet_mail_kind(){ if [ "$1" = status ]; then echo fyi; else echo ask; fi; }

# _fleet_mail_body_ok TEXT: non-empty and at most _FLEET_MAIL_BODY_MAX bytes.
_fleet_mail_body_ok(){
  local n
  n=$(printf '%s' "$1" | wc -c | tr -d ' ')
  [ "$n" -gt 0 ] && [ "$n" -le "$_FLEET_MAIL_BODY_MAX" ]
}

# _fleet_mail_send WS TYPE TEXT: master -> worker. Sends as <project>-master with
# the run's coordinator secret (mailbox.sh passes it on stdin, never argv).
# Prints mailbox.sh's message id; returns mailbox.sh's exit code (15 unreachable,
# 78 no config, ...) so callers can fall back.
_fleet_mail_send(){
  local ws="$1" type="$2" text="$3" project secret owner
  project=$(_fleet_mb_project)
  secret=$(_fleet_coord_secret_file)
  owner=$(_fleet_mb_owner) || return 78
  MAILBOX_SESSION="$(fleet_master_mail_name "$project")" _fleet_mb send \
    "$owner/s/$(fleet_mail_name "$project" "$ws")" --kind "$(_fleet_mail_kind "$type")" \
    --fleet "$type" --coord-file "$secret" -- "$text"
}

# _fleet_mb_down_reason RC: why the mailbox did not answer, in plain words.
_fleet_mb_down_reason(){
  case "$1" in
    15) echo "unreachable" ;;
    16) echo "login refused" ;;
    17) echo "permission denied" ;;
    78) echo "no mailbox config" ;;
    *)  echo "mailbox error (exit $1)" ;;
  esac
}
