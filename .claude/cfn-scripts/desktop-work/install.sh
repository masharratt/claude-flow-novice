#!/usr/bin/env bash
# install.sh: install the desktop "work" layout.
#   ~/.local/bin/work -> work.sh; systemd user units (snapshot timer, restore at login);
#   "set -g mouse on" in ~/.tmux.conf (created, or appended after a dated backup).
# WORK_NO_SYSTEMD=1 copies the units without calling systemctl (tests).
set -euo pipefail
D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

mkdir -p "$HOME/.local/bin" "$HOME/.config/systemd/user"
ln -sfn "$D/work.sh" "$HOME/.local/bin/work"

for u in work-snapshot.service work-snapshot.timer work-restore.service; do
  install -m 644 "$D/$u" "$HOME/.config/systemd/user/$u"
done

conf="$HOME/.tmux.conf"
if [ ! -e "$conf" ]; then
  cp "$D/tmux.conf" "$conf"
elif ! grep -qE '^[[:space:]]*set(-option)?[[:space:]]+-g[[:space:]]+mouse[[:space:]]+on' "$conf"; then
  cp -p "$conf" "$conf.bak-$(date +%Y%m%d-%H%M%S)"
  printf '\n%s\n' "set -g mouse on" >> "$conf"
fi

if [ -z "${WORK_NO_SYSTEMD:-}" ]; then
  systemctl --user daemon-reload
  systemctl --user enable work-restore.service
  systemctl --user enable --now work-snapshot.timer
fi
echo "work installed: $HOME/.local/bin/work"
