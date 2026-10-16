#!/usr/bin/env bash
# install-claude-tmux.sh: point the dsp / dspr / dspc aliases in ~/.zshrc at claude-tmux.sh,
# so every Claude session starts inside tmux, and add a starter ~/.tmux.conf if none exists.
#
# Usage: install-claude-tmux.sh [--dry-run | --undo]
#   (default)  back up ~/.zshrc to ~/.zshrc.bak-<time>, replace the three alias lines (or add
#              them), write ~/.tmux.conf only when missing. Safe to re-run.
#   --dry-run  print the alias lines it would write; change nothing.
#   --undo     restore ~/.zshrc from the newest backup this script made.
# Open a new terminal tab (or `source ~/.zshrc`) afterwards.
set -euo pipefail

ZSHRC="$HOME/.zshrc"
TMUXCONF="$HOME/.tmux.conf"
LAUNCH='$HOME/.claude/cfn-scripts/claude-tmux.sh'
MODE="${1:-install}"

lines() {
  printf "alias dsp='%s --permission-mode auto'\n" "$LAUNCH"
  printf "alias dspr='%s --permission-mode auto --resume'\n" "$LAUNCH"
  printf "alias dspc='%s --permission-mode auto --continue'\n" "$LAUNCH"
}

case "$MODE" in
  --dry-run) echo "would write to $ZSHRC:"; lines; exit 0 ;;
  --undo)
    bk=$(ls -t "$ZSHRC".bak-* 2>/dev/null | head -1 || true)
    [ -n "$bk" ] || { echo "no backup found ($ZSHRC.bak-*)" >&2; exit 1; }
    cp -p "$bk" "$ZSHRC"; echo "restored $ZSHRC from $bk"; exit 0 ;;
  install) ;;
  *) echo "usage: install-claude-tmux.sh [--dry-run | --undo]" >&2; exit 2 ;;
esac

[ -f "$ZSHRC" ] || : > "$ZSHRC"
# Compute the new content first; write only when it differs.
new=$(awk -v l1="$(lines | sed -n 1p)" -v l2="$(lines | sed -n 2p)" -v l3="$(lines | sed -n 3p)" '
  /^alias dsp=/  { if (!d1++) print l1; next }
  /^alias dspr=/ { if (!d2++) print l2; next }
  /^alias dspc=/ { if (!d3++) print l3; next }
  { print }
  END { if (!d1) print l1; if (!d2) print l2; if (!d3) print l3 }' "$ZSHRC")

if [ "$new" = "$(cat "$ZSHRC")" ]; then
  echo "aliases already point at claude-tmux.sh; $ZSHRC unchanged"
else
  bk="$ZSHRC.bak-$(date +%Y%m%d%H%M%S)"
  cp -p "$ZSHRC" "$bk"
  printf '%s\n' "$new" > "$ZSHRC"
  echo "updated dsp/dspr/dspc in $ZSHRC (backup: $bk; undo: install-claude-tmux.sh --undo)"
fi

if [ -e "$TMUXCONF" ]; then
  echo "$TMUXCONF exists; left as is"
else
  cat > "$TMUXCONF" <<'EOF'
# Written by claude-flow-novice install-claude-tmux.sh. Edit freely.
set -g mouse on                      # scroll with the trackpad, click to select panes
set -g history-limit 50000
set -s escape-time 10                # Esc reaches Claude Code without a delay
set -s extended-keys on              # Shift+Enter (new line) reaches Claude Code
set -as terminal-features 'xterm*:extkeys'
set -g allow-passthrough on          # terminal notifications from inside tmux
set -g set-clipboard on              # copy reaches the macOS clipboard
EOF
  echo "wrote $TMUXCONF"
fi
echo "open a new terminal tab (or: source ~/.zshrc) to use it"
