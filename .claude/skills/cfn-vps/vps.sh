#!/usr/bin/env bash
# cfn-vps: run commands, git syncs and long background jobs on a remote server.
#
# Every host detail lives in the user's ~/.ssh/config under an alias (default
# "vps"); nothing about the server is stored here, because this file ships in a
# public repo. Override the alias with CFN_VPS_HOST and the projects folder
# (relative to the remote home) with CFN_VPS_PROJECTS.
set -euo pipefail

HOST="${CFN_VPS_HOST:-vps}"
PROJECTS="${CFN_VPS_PROJECTS:-Projects}"
JOBS_DIR='$HOME/.cache/cfn-vps/jobs'

usage() {
  cat >&2 <<'EOF'
usage: vps.sh <command> ...
  check                              reachability, OS and load
  run    <project> -- <cmd...>       run a command in ~/Projects/<project>
  sync   <project>                   git pull --ff-only (refuses if the copy is dirty)
  job    <project> <name> -- <cmd...> start a background job that survives disconnects
  status <name>                      running, or finished with its exit code
  log    <name> [lines]              tail a job's output (default 50 lines)
  jobs                               list all jobs
exit codes: 2 bad usage, 3 no such project/job, 4 dirty copy, 5 job name busy,
            otherwise the remote command's own exit code
EOF
  exit 2
}

# Names go into remote paths: letters, digits, dot, dash, underscore; no
# leading dot, so "..", ".git" and slashes can never form a path.
valid_name() { [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]*$ ]]; }
need_name() { valid_name "$1" || { echo "cfn-vps: invalid $2 name: $1" >&2; exit 2; }; }

# Non-interactive ssh shells skip ~/.bashrc, so load the usual toolchains here.
PREAMBLE='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"; export PATH="$HOME/.local/bin:$PATH";'

remote() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "bash -lc $(printf '%q' "$PREAMBLE $1")"
}

project_cd() {
  local dir="\$HOME/$PROJECTS/$1"
  printf '[ -d "%s" ] || { echo "cfn-vps: no project %s on %s" >&2; exit 3; }; cd "%s" || exit 3;' \
    "$dir" "$1" "$HOST" "$dir"
}

split_cmd() {
  # Everything after "--" is the command; quote each word for the remote shell.
  [ "${1:-}" = "--" ] || usage
  shift
  [ $# -gt 0 ] || usage
  printf '%q ' "$@"
}

job_state() {
  # Remote snippet: sets st to running|done|lost for job dir $d.
  printf '%s' 'if [ -f "$d/exit" ]; then st="done, exit $(cat "$d/exit")"; elif kill -0 "$(cat "$d/pid" 2>/dev/null)" 2>/dev/null; then st=running; else st="lost (no exit code; server restarted?)"; fi;'
}

cmd="${1:-}"
[ -n "$cmd" ] || usage
shift

case "$cmd" in
  check)
    remote 'echo "host: $(hostname)"; uname -sr; uptime'
    ;;
  run)
    [ $# -ge 1 ] || usage
    project="$1"; shift
    need_name "$project" project
    words=$(split_cmd "$@")
    remote "$(project_cd "$project") $words"
    ;;
  sync)
    [ $# -eq 1 ] || usage
    need_name "$1" project
    remote "$(project_cd "$1")"' dirty=$(git status --porcelain); if [ -n "$dirty" ]; then echo "cfn-vps: server copy has uncommitted changes, not pulling:" >&2; echo "$dirty" >&2; exit 4; fi; git pull --ff-only'
    ;;
  job)
    [ $# -ge 2 ] || usage
    project="$1"; name="$2"; shift 2
    need_name "$project" project
    need_name "$name" job
    words=$(split_cmd "$@")
    inner="$PREAMBLE $(project_cd "$project") $words"
    remote "$(project_cd "$project") d=$JOBS_DIR/$name; mkdir -p \"\$d\"; $(job_state)"' case "$st" in running) echo "cfn-vps: job '"$name"' is still running" >&2; exit 5;; esac; rm -f "$d/exit" "$d/pid";'" printf '%s\n' $(printf '%q' "$project") > \"\$d/project\"; printf '%s\n' $(printf '%q' "$words") > \"\$d/cmd\"; date '+%Y-%m-%d %H:%M:%S' > \"\$d/started\"; CFN_JOB_DIR=\"\$d\" nohup bash -c $(printf '%q' "$inner"' ; echo $? > "$CFN_JOB_DIR/exit"') > \"\$d/log\" 2>&1 < /dev/null & echo \$! > \"\$d/pid\"; echo \"started job $name in $project (log: vps.sh log $name)\""
    ;;
  status)
    [ $# -eq 1 ] || usage
    need_name "$1" job
    remote "d=$JOBS_DIR/$1; [ -d \"\$d\" ] || { echo \"cfn-vps: no job $1\" >&2; exit 3; }; $(job_state)"' echo "$st | $(cat "$d/project") | started $(cat "$d/started") | $(cat "$d/cmd")"'
    ;;
  log)
    [ $# -ge 1 ] && [ $# -le 2 ] || usage
    need_name "$1" job
    lines="${2:-50}"
    [[ "$lines" =~ ^[0-9]+$ ]] || usage
    remote "d=$JOBS_DIR/$1; [ -d \"\$d\" ] || { echo \"cfn-vps: no job $1\" >&2; exit 3; }; tail -n $lines \"\$d/log\""
    ;;
  jobs)
    remote "for d in $JOBS_DIR/*/; do [ -d \"\$d\" ] || continue; d=\${d%/}; $(job_state)"' printf "%-20s %-40s %s\n" "$(basename "$d")" "$st" "$(cat "$d/project")"; done'
    ;;
  *)
    usage
    ;;
esac
