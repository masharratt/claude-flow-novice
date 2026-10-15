#!/usr/bin/env bash
# Rebuild a fresh Ubuntu 24.04 server from a vps-backup bundle, from the Mac.
#
# The 2026-10-08 server was set up by hand, so moving it (EU to US West,
# 2026-10-15) needed a way to get every setting back. This script replays that
# setup in phases. Each phase is idempotent and can be re-run.
#
# Nothing about the server lives here, because this file ships in a public repo.
# The user name, versions, repo list and tailnet name come from <bundle>/rebuild.conf.
# The host comes from the ssh alias in ~/.ssh/config.
#
# Usage:
#   vps-rebuild.sh <ssh-alias> <bundle-dir> <phase>
#
# Phases, in order:
#   plan           print the phases and what each one needs (no ssh)
#   bootstrap      as root: create the user, keys, sudoers, firewall tools, updates
#   harden         as the user: key-only ssh, no root login, ufw on (after login works)
#   packages       apt repos + packages from the saved list, code-server, docker group
#   home           restore dotfiles, scripts, logins, crontab; code-server; linger
#   tools          nvm/node/pnpm/codex, rustup, uv, flyctl, claude, supabase, playwright
#   repos          needs `gh auth login` first: clone, restore project files, CFN links
#   services       needs `tailscale up` first: serve/funnel routes, n8n, dispatch runner
#   check          report what is and is not in place
#   list-home      print the home files that would be restored (no ssh)
#   list-projects  print the project files that would be restored (no ssh)
#
# Exit codes: 0 ok, 64 usage, 65 bad bundle or missing prerequisite, 1 remote step failed.
set -euo pipefail
export COPYFILE_DISABLE=1  # stop macOS tar adding ._ files

PHASES="plan bootstrap harden packages home tools repos services check list-home list-projects"

# Rebuildable or worthless paths inside the bundle, never restored.
JUNK_RE='/\.claude/worktrees/|chrome-signed/(optimization_guide_model_store|WasmTtsEngine|Default/Extensions|Safe Browsing|component_crx_cache|Default/Service Worker|OnDeviceHeadSuggestModel|screen_ai|Crowd Deny|ZxcvbnData|hyphen-data)|/drones$'

usage() { sed -n '/^# Usage:/,/^# Exit codes/p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 64; }
die() { echo "vps-rebuild: $1" >&2; exit "${2:-1}"; }

[ $# -eq 3 ] || usage
ALIAS=$1 B=$2 PHASE=$3
case " $PHASES " in *" $PHASE "*) ;; *) echo "unknown phase: $PHASE (valid: $PHASES)" >&2; exit 64 ;; esac
[ -d "$B/home" ] && [ -d "$B/system" ] || die "not a backup bundle (needs home/ and system/): $B" 65
[ -f "$B/rebuild.conf" ] || die "missing $B/rebuild.conf" 65
B=$(cd -P "$B" && pwd -P)

# rebuild.conf: plain KEY=value lines, no commands.
# shellcheck disable=SC1091
. "$B/rebuild.conf"
: "${SERVER_USER:?rebuild.conf needs SERVER_USER}"
: "${NODE_VERSION:?rebuild.conf needs NODE_VERSION}"
: "${CODE_SERVER_VERSION:?rebuild.conf needs CODE_SERVER_VERSION}"
SUPABASE_VERSION=${SUPABASE_VERSION:-}
PNPM_VERSION=${PNPM_VERSION:-latest}
CODEX_VERSION=${CODEX_VERSION:-latest}
N8N_VERSION=${N8N_VERSION:-}
TAILNET_NAME=${TAILNET_NAME:-}
REPOS=${REPOS:-}
LOCAL_COPIES=${LOCAL_COPIES:-}
DISPATCH_FUNNEL_PORT=${DISPATCH_FUNNEL_PORT:-}

# grep -v exits 1 when every line is junk; that is "nothing to restore", not an error.
drop_junk() { grep -vE "$JUNK_RE" || true; }
list_home() { (cd "$B/home" && find . \( -type f -o -type l \) | drop_junk | sort); }
list_projects() { [ -d "$B/projects" ] || return 0; (cd "$B/projects" && find . -type f | drop_junk | sort); }
project_files() { (cd "$1" && find . -type f | drop_junk); }

# Run a bash script (stdin) on the server as the user, or as root with AS=root.
# KEY=value pairs given as arguments are defined before the script runs.
remote() {
  local who=() pre=""
  [ "${AS:-}" = root ] && who=(-l root)
  for kv in "$@"; do pre+="$(printf '%s=%q' "${kv%%=*}" "${kv#*=}")"$'\n'; done
  { printf 'set -euo pipefail\n%s' "$pre"; cat; } | ssh -o BatchMode=yes -o ConnectTimeout=15 ${who[@]+"${who[@]}"} "$ALIAS" bash -s
}

# Stream bundle paths (relative to $1, list on stdin) into a server directory ($2).
push() {
  local base=$1 dest=$2 who=()
  [ "${AS:-}" = root ] && who=(-l root)
  tar -cf - -C "$base" -T - | ssh -o BatchMode=yes ${who[@]+"${who[@]}"} "$ALIAS" "mkdir -p $dest && tar -xf - -C $dest --warning=no-unknown-keyword"
}

phase_plan() {
  cat <<EOF
Rebuild plan for user '$SERVER_USER' via ssh alias '$ALIAS', bundle $B

 1. bootstrap  (root)  Contabo reinstall must have your Mac's ssh key added for root.
 2. harden     (user)  Runs only after 'ssh $ALIAS sudo -n true' works, so you cannot be locked out.
 3. packages   (user)  docker, gh, chrome, tailscale repos; $(wc -l < "$B/system/apt-manual.txt" | tr -d ' ') saved packages; code-server $CODE_SERVER_VERSION.
 4. home       (user)  $(list_home | wc -l | tr -d ' ') files; junk (worktrees, chrome caches, binaries) skipped.
 5. tools      (user)  node $NODE_VERSION, pnpm, codex, rustup, uv, flyctl, claude, supabase ${SUPABASE_VERSION:-skip}, playwright.
 6. repos      (user)  YOU FIRST: gh auth login (both accounts). Then clone $(echo "$REPOS" | wc -w | tr -d ' ') repos, restore $(list_projects | wc -l | tr -d ' ') project files.
 7. services   (user)  YOU FIRST: sudo tailscale up. Then serve/funnel routes, n8n ${N8N_VERSION:-skip}, dispatch runner.
 8. check
EOF
}

phase_bootstrap() {
  # GIVEN a fresh image with root key login. Nothing here touches sshd.
  { echo ./system; echo ./home/.ssh/authorized_keys; } | AS=root push "$B" /root/rebuild-stage
  AS=root remote "U=$SERVER_USER" <<'EOF'
export DEBIAN_FRONTEND=noninteractive
S=/root/rebuild-stage
apt-get update -q
apt-get -yq upgrade
apt-get install -yq sudo ufw fail2ban unattended-upgrades sysstat rsync curl gnupg
id -u "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash "$U"
usermod -aG sudo "$U"
install -d -m 700 -o "$U" -g "$U" "/home/$U/.ssh"
install -m 600 -o "$U" -g "$U" "$S/home/.ssh/authorized_keys" "/home/$U/.ssh/authorized_keys"
for f in "$S"/system/etc/sudoers.d/90-"$U"; do
  [ -f "$f" ] || continue
  visudo -cf "$f" >/dev/null && install -m 440 "$f" "/etc/sudoers.d/$(basename "$f")"
done
for d in jail.d; do [ -d "$S/system/etc/fail2ban/$d" ] && cp -r "$S/system/etc/fail2ban/$d/." "/etc/fail2ban/$d/"; done
for f in 20auto-upgrades 50unattended-upgrades; do
  [ -f "$S/system/etc/apt/apt.conf.d/$f" ] && install -m 644 "$S/system/etc/apt/apt.conf.d/$f" "/etc/apt/apt.conf.d/$f"
done
timedatectl set-timezone Etc/UTC
sed -i 's/^ENABLED=.*/ENABLED="true"/' /etc/default/sysstat 2>/dev/null || true
systemctl enable --now fail2ban sysstat unattended-upgrades
echo "bootstrap ok: user $U exists with key and sudo"
EOF
}

phase_harden() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$ALIAS" sudo -n true \
    || die "refusing to harden: 'ssh $ALIAS sudo -n true' failed, so key login or sudo for $SERVER_USER is not working yet" 65
  echo ./system/etc/ssh/sshd_config.d | push "$B" /tmp/rebuild-stage
  remote <<'EOF'
S=/tmp/rebuild-stage/system/etc/ssh/sshd_config.d
sudo install -m 644 "$S/00-hardening.conf" /etc/ssh/sshd_config.d/00-hardening.conf
sudo sshd -t
sudo systemctl reload ssh
sudo ufw allow OpenSSH >/dev/null
sudo ufw --force enable >/dev/null
sudo ufw status | head -5
EOF
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$ALIAS" true \
    && echo "harden ok: still reachable as $SERVER_USER" \
    || die "LOST ACCESS after hardening: use the Contabo VNC console to fix /etc/ssh/sshd_config.d" 1
}

phase_packages() {
  echo ./system/apt-manual.txt | push "$B" /tmp/rebuild-stage
  remote "U=$SERVER_USER" "CS=$CODE_SERVER_VERSION" <<'EOF'
export DEBIAN_FRONTEND=noninteractive
K=/etc/apt/keyrings; sudo install -m 755 -d "$K"
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$K/docker.asc"
echo "deb [arch=amd64 signed-by=$K/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o "$K/githubcli.gpg"
echo "deb [arch=amd64 signed-by=$K/githubcli.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome-stable/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null
sudo curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg
sudo curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list
sudo apt-get update -q
want=(); missing=()
while read -r p; do
  [ -n "$p" ] && [ "$p" != code-server ] || continue
  if apt-cache show "$p" >/dev/null 2>&1; then want+=("$p"); else missing+=("$p"); fi
done < /tmp/rebuild-stage/system/apt-manual.txt
sudo apt-get install -yq "${want[@]}"
[ ${#missing[@]} -eq 0 ] || echo "WARN not in any repo, skipped: ${missing[*]}"
if [ "$(dpkg-query -W -f='${Version}' code-server 2>/dev/null)" != "$CS" ]; then
  curl -fsSL -o /tmp/code-server.deb "https://github.com/coder/code-server/releases/download/v$CS/code-server_${CS}_amd64.deb"
  sudo apt-get install -yq /tmp/code-server.deb
fi
sudo usermod -aG docker "$U"
sudo systemctl enable --now docker tailscaled
echo "packages ok: ${#want[@]} installed, code-server $CS"
EOF
}

phase_home() {
  list_home | push "$B/home" '$HOME'
  echo ./system/crontab.txt | push "$B" /tmp/rebuild-stage
  remote "U=$SERVER_USER" <<'EOF'
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
[ -s /tmp/rebuild-stage/system/crontab.txt ] && crontab /tmp/rebuild-stage/system/crontab.txt
sudo loginctl enable-linger "$U"
sudo systemctl enable --now "code-server@$U"
echo "home ok: $(find ~ -maxdepth 1 | wc -l) entries in home, crontab $(crontab -l 2>/dev/null | grep -vc '^#') line(s)"
EOF
}

phase_tools() {
  remote "NODE=$NODE_VERSION" "PNPM=$PNPM_VERSION" "CODEX=$CODEX_VERSION" "SB=$SUPABASE_VERSION" <<'EOF'
mkdir -p ~/.local/bin
[ -s ~/.nvm/nvm.sh ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null bash
set +u; . ~/.nvm/nvm.sh; set -u
nvm install "$NODE" >/dev/null && nvm alias default "$NODE" >/dev/null
npm i -g "pnpm@$PNPM" "@openai/codex@$CODEX" >/dev/null
[ -x ~/.cargo/bin/rustup ] || curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile default
~/.cargo/bin/rustup component add clippy rustfmt >/dev/null
[ -x ~/.local/bin/uv ] || curl -fsSL https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh >/dev/null
[ -x ~/.fly/bin/flyctl ] || curl -fsSL https://fly.io/install.sh | FLYCTL_INSTALL="$HOME/.fly" sh >/dev/null
[ -x ~/.local/bin/claude ] || curl -fsSL https://claude.ai/install.sh | bash >/dev/null
if [ -n "$SB" ] && [ "$(~/.local/bin/supabase --version 2>/dev/null)" != "$SB" ]; then
  curl -fsSL "https://github.com/supabase/cli/releases/download/v$SB/supabase_linux_amd64.tar.gz" | tar -xzf - -C ~/.local/bin supabase
fi
npx -y playwright install chromium >/dev/null
echo "tools ok: node $(node -v), pnpm $(pnpm -v), codex $(codex --version 2>/dev/null | head -1), $(~/.cargo/bin/rustc --version), claude $(~/.local/bin/claude --version 2>/dev/null)"
EOF
}

phase_repos() {
  remote <<'EOF' || die "gh is not logged in on the server: run 'ssh $ALIAS' then 'gh auth login' for each account" 65
gh auth status >/dev/null 2>&1
EOF
  for r in $REPOS; do
    IFS='|' read -r slug dest branch <<<"$r"
    remote "SLUG=$slug" "DEST=$dest" "BR=${branch:-main}" <<'EOF'
if [ ! -d "$HOME/$DEST/.git" ]; then
  git clone -q "https://github.com/$SLUG" "$HOME/$DEST"
fi
git -C "$HOME/$DEST" checkout -q "$BR"
echo "repo ok: $DEST ($BR)"
EOF
    name=$(basename "$dest")
    files=""
    [ -d "$B/projects/$name" ] && files=$(project_files "$B/projects/$name")
    if [ -n "$files" ]; then
      printf '%s\n' "$files" | push "$B/projects/$name" "\$HOME/$dest"
      echo "restored $(printf '%s\n' "$files" | wc -l | tr -d ' ') file(s) into $dest"
    fi
  done
  for d in $LOCAL_COPIES; do
    [ -d "$HOME/$d" ] || { echo "WARN local copy missing on this Mac: ~/$d"; continue; }
    (cd "$HOME/$d" && find . -type f) | push "$HOME/$d" "\$HOME/$d"
    echo "local copy ok: $d"
  done
  [ -d "$B/git" ] && echo ./git | push "$B" '$HOME/restore-git'
  # link-global-config replaces ~/.claude/CLAUDE.md with a symlink; the server keeps
  # its own wrapper, so put the restored one back afterwards.
  if [ -f "$B/home/.claude/CLAUDE.md" ]; then echo ./.claude/CLAUDE.md | push "$B/home" '$HOME/restore-claude-md'; fi
  remote <<'EOF'
cd ~/Projects/claude-flow-novice-src
.claude/cfn-scripts/link-global-config.sh --force >/dev/null
if [ -f ~/restore-claude-md/.claude/CLAUDE.md ]; then
  rm -f ~/.claude/CLAUDE.md && cp ~/restore-claude-md/.claude/CLAUDE.md ~/.claude/CLAUDE.md
fi
# Expected: only CLAUDE.md reports UNLINKED, because the server keeps its own wrapper.
.claude/cfn-scripts/link-global-config.sh --check | grep -E 'UNLINKED|runtime dirs:' || true
echo "repos ok. Unpushed work and uncommitted patches to review by hand: ~/restore-git/git/"
EOF
}

phase_services() {
  remote <<'EOF' || die "tailscale is not up on the server: run 'sudo tailscale up' there, and remove the old node in the Tailscale admin first so the name is free" 65
tailscale status >/dev/null 2>&1
EOF
  remote "TS=$TAILNET_NAME" "N8N=$N8N_VERSION" "DPORT=$DISPATCH_FUNNEL_PORT" <<'EOF'
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080 >/dev/null
sudo tailscale serve --bg --https=6080 http://127.0.0.1:6080 >/dev/null
[ -n "$DPORT" ] && sudo tailscale funnel --bg --https=8443 "http://127.0.0.1:$DPORT" >/dev/null
if [ -n "$N8N" ]; then
  d=~/services/n8n; mkdir -p "$d"
  # The encryption key protects every saved n8n credential: create once, never rotate.
  [ -f "$d/.env" ] || printf 'N8N_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" > "$d/.env"
  chmod 600 "$d/.env"
  cat > "$d/docker-compose.yml" <<YML
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:$N8N
    restart: unless-stopped
    ports: ["127.0.0.1:5678:5678"]
    env_file: .env
    environment:
      N8N_HOST: $TS
      N8N_PROTOCOL: https
      N8N_EDITOR_BASE_URL: https://$TS:5678/
      WEBHOOK_URL: https://$TS:10000/
      GENERIC_TIMEZONE: America/Los_Angeles
    volumes: ["n8n_data:/home/node/.n8n"]
volumes:
  n8n_data:
YML
  (cd "$d" && sg docker -c "docker compose up -d" >/dev/null)
  # Editor: tailnet only. Webhooks: the only public path.
  sudo tailscale serve --bg --https=5678 http://127.0.0.1:5678 >/dev/null
  sudo tailscale funnel --bg --https=10000 --set-path=/webhook http://127.0.0.1:5678/webhook >/dev/null
fi
if [ -f ~/.config/systemd/user/gg-dispatch-runner.service ] && [ -d ~/Projects/gg-all-projects ]; then
  set +u; . ~/.nvm/nvm.sh; set -u
  (cd ~/Projects/gg-all-projects && pnpm install --frozen-lockfile >/dev/null)
  systemctl --user daemon-reload
  systemctl --user enable --now gg-dispatch-runner
fi
sudo tailscale serve status
EOF
  if [ -n "$N8N_VERSION" ]; then
    mkdir -p "$B/services"
    ssh -o BatchMode=yes "$ALIAS" 'cat ~/services/n8n/.env' > "$B/services/n8n.env" && chmod 600 "$B/services/n8n.env"
    echo "n8n encryption key saved to $B/services/n8n.env"
  fi
}

phase_check() {
  remote "U=$SERVER_USER" <<'EOF'
set +e
ok() { if eval "$2" >/dev/null 2>&1; then echo "  ok      $1"; else echo "  MISSING $1"; fi; }
ok "sudo without password"        "sudo -n true"
ok "root login disabled"          "sudo sshd -T | grep -x 'permitrootlogin no'"
ok "password login disabled"      "sudo sshd -T | grep -x 'passwordauthentication no'"
ok "firewall on"                  "sudo ufw status | grep -q 'Status: active'"
ok "fail2ban running"             "systemctl is-active fail2ban"
ok "auto security updates"        "systemctl is-enabled unattended-upgrades"
ok "docker running"               "systemctl is-active docker"
ok "in docker group"              "id -nG | grep -qw docker"
ok "tailscale up"                 "tailscale status"
ok "code-server running"          "systemctl is-active code-server@$U"
ok "dispatch runner running"      "systemctl --user is-active gg-dispatch-runner"
ok "n8n running"                  "sg docker -c 'docker ps' | grep -q n8n"
ok "crontab restored"             "crontab -l | grep -q backup-memgraph"
ok "claude installed"             "test -x ~/.local/bin/claude"
ok "node via nvm"                 "test -s ~/.nvm/nvm.sh"
ok "gh logged in"                 "gh auth status"
ok "CFN runtime links"            "{ ~/Projects/claude-flow-novice-src/.claude/cfn-scripts/link-global-config.sh --check || true; } | grep -x 'runtime dirs: OK (14 of 14 linked)'"
for d in ~/Projects/*/; do echo "  repo    $(basename "$d") $(git -C "$d" branch --show-current 2>/dev/null)"; done
echo "Not automated: fireside services (docker compose up + memgraph restore, see backup-memgraph.sh), MDTWII (mdtwii-95)."
EOF
}

case "$PHASE" in
  list-home) list_home ;;
  list-projects) list_projects ;;
  *) "phase_$PHASE" ;;
esac
