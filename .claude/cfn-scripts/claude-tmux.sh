#!/usr/bin/env bash
# claude-tmux.sh: start Claude Code inside tmux, so the agent mailbox watcher can wake the
# session when mail arrives while it sits idle (it types into the pane; a plain terminal tab
# has no pane to type into).
#
# Usage: claude-tmux.sh [claude args...]     (the dsp/dspr/dspc aliases call this)
#   Already inside tmux, or CFN_CLAUDE_TMUX=off: runs claude directly.
#   Otherwise: a new tmux session named after the project folder (git toplevel, else cwd),
#   lowercased to [a-z0-9-], with -2, -3 ... when the name is taken. The session closes when
#   claude exits. Reattach after closing a terminal tab with `tmux attach -t <name>`.
# Installed by install-claude-tmux.sh.
set -euo pipefail

if [ -n "${TMUX:-}" ] || [ "${CFN_CLAUDE_TMUX:-on}" = off ] || ! command -v tmux >/dev/null 2>&1; then
  exec claude "$@"
fi

top=$(git rev-parse --show-toplevel 2>/dev/null) || top="$PWD"
base=$(basename "$top" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9-]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//' | cut -c1-40)
[ -n "$base" ] || base=claude
name="$base" n=2
while tmux has-session -t "$name" 2>/dev/null; do name="$base-$n"; n=$((n + 1)); done

# A running tmux server keeps the environment it started with; pass PATH so claude and its
# tools resolve the same as in this shell.
exec tmux new-session -s "$name" -c "$PWD" -e "PATH=$PATH" claude "$@"
