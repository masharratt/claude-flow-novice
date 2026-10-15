# PLAN: Move the Contabo VPS from EU to US West (fresh start)

**Status:** draft, 2026-10-15. Wipe is gated on mdtwii-95 sending "MDTWII clear to wipe".

## Goal

Rebuild the server in US West with all our setup and the data that is not on GitHub. Reclone code
from GitHub. Leave out gg-app and nitpicky (user, 2026-10-15) and add them later if needed.

## What lives only on the server (must be backed up)

| Item | Size | Notes |
|------|------|-------|
| Dotfiles: `.bashrc`, `.profile`, `.zshrc`, `.tmux.conf`, `.gitconfig`, `.gitconfig-gg-michael` | KB | tmux layout, `work` picker, TZ, git identity split |
| `~/.local/bin/{work,tmux-task-picker,signin-browser}` | KB | own scripts; the rest of ~/.local/bin is reinstallable |
| `~/.claude/` server wrapper `CLAUDE.md`, `settings*.json`, `server-hooks/` (lockout guard + 44-case test) | KB | lockout guard exists ONLY on the server |
| `~/.claude/projects/` (session history + memory per project) | check | optional, but cheap |
| `~/.config/chrome-signed` | 430 MB | signed-in profile; Google may re-challenge from the new location |
| `~/.config/code-server`, code-server systemd override | KB | |
| `~/.config/systemd/user/gg-dispatch-runner.service` + `~/.config/gg-dispatch-runner/env` (secrets) | KB | Slack-to-Claude runner, running now from `~/projects-gg/gg-all-projects` |
| `~/.vnc`, `.docker/config.json`, `.fly`, `.supabase`, `.codex` config | KB | logins inside may need redoing anyway |
| All `.env*` / secrets in every kept project | KB | NOT in git. Fireside alone has ~30, plus `observability/config/*/secrets/`, `mac/Config/Secrets.xcconfig` |
| fireside `eval/kinship-private/`, `.backups/`, `.artifacts/` | check | private eval data is not in git |
| fireside Memgraph graph (prod data, see below) | ~70 KB tar | fresh backup taken at cutover |
| fireside Grafana / Prometheus / Alertmanager volumes | ~600 MB total Docker volumes | dashboards may be provisioned from git; history optional |
| `~/backups/memgraph/` | 84 KB | |
| MDTWII `ghidra/` analysis projects | 7.3 GB | mdtwii-95 backs this up to the Mac |
| MDTWII lane branches WS445, WS449 | small | mdtwii-95 brings them to the Mac |
| crontab (1 line: fireside memgraph backup) | | |

**Not copied:** MDTWII build caches `~/.cache/mdtwii-target-*` (~240 GB), MDTWII `game/` (22 GB, re-copy from Mac/Steam) and `extracted/` (rebuildable), `node_modules`, `target/`, `dist/`, Docker images, `~/partial-copies`, gg-app, nitpicky.

## Fireside-family findings (production impact)

1. **`fireside-memgraph` is the production graph database.** Prod api-core reaches it through the Cloudflare tunnel container `fireside-memgraph-tunnel`. Moving the server takes the family graph offline between "stop on old" and "start on new".
2. **The tunnel follows its token, not the IP.** Starting the same tunnel container on the new server reconnects it, with no DNS change. The token is already in the fireside `.env` files that get copied.
3. **The weekly backup cron is broken.** The Oct 12 run failed with `Permission denied` because `backup-memgraph.sh` lost its executable bit. The only good backup is the manual one from Oct 11. Fix: `chmod +x` and add a regression check. Do this now, separately from the move.
4. Other fireside containers: Redis (restart policy `no`, cache only), a test DB, and the monitoring stack (Prometheus, Grafana, Alertmanager, blackbox, uptime probe). The monitoring stack also watches the dailyx sites.

## Phases

### 0. Now, before anything moves
- Fix the fireside backup cron (finding 3) and run one backup by hand. Done 2026-10-15: 275 nodes, cron now runs the script via /bin/bash, and the script is committed as 100755 (fireside 1e0763039).
- Fireside has no customers yet (user, 2026-10-15), so graph downtime is acceptable. The monitoring stack (Grafana, Prometheus, Alertmanager) is rebuilt by fireside from its repo; its history is not needed. The monitoring volumes are in the bundle anyway (41 MB), but restoring them is optional.

### 1. Back up (Claude, read-only on the server)
- Bundle everything in the table into `~/vps-backup-2026-10-<dd>/` on the Mac, with a manifest that lists every file and a checksum.
- Final Memgraph backup, taken last, right before the wipe. After it, stop memgraph so nothing writes to the graph.
- Export the crontab, user systemd units, ufw rules, fail2ban jail, unattended-upgrades config and installed-package list (`apt-mark showmanual`).
- Gate: the manifest checks clean on the Mac, and the user eyeballs the `.env` count for each project.

### 2. Wait for mdtwii-95
- mdtwii-95 drains its lanes and the gate-batch31 job, pulls branches and ghidra, then sends "MDTWII clear to wipe".
- Until then: do not touch tmux `fleet-main`, vps.sh jobs or `/tmp/mdtwii-slot-*.lock`.

### 3. New server in US West
- The user triggers Contabo "Change region > New Deployment" to US West, Ubuntu 24.04. This is the wipe.
- Note the new IP. Update the Mac `~/.ssh/config` HostName (the user does this, since Claude can't write ~/.ssh) and Termius on the phone.

### 4. Rebuild (scripted, re-runnable)

Script: `.claude/cfn-scripts/vps-rebuild.sh vps ~/vps-backup-2026-10-15 <phase>`. Phases run in order: bootstrap, harden, packages, home, tools, repos, services, check. Run `plan` first to see them. Settings live in the bundle's `rebuild.conf`, not in this repo. Tests: `tests/test-vps-rebuild.sh`. Phases 4 to 8 below are what the script covers.
- Hardening: user `michael` + passwordless sudo, key-only ssh, root key-only, ufw (ssh only), fail2ban, unattended-upgrades.
- Tools: nvm Node 26 + pnpm, rustup stable + clippy, cargo-nextest, mold, uv, flyctl, gh, Claude Code, codex, Docker + compose, tmux, fzf, Chrome + Playwright deps, TigerVNC + openbox + noVNC, code-server 4.141, bubblewrap + socat, Tailscale.
- MDTWII extras: JDK 21.0.12.1, Ghidra 12.1.4 (restore +x on the decompiler and sleigh binaries), the `# MDTWII-tools` bashrc block.
- Restore the backup bundle. Run `link-global-config.sh --force` from claude-flow-novice-src.

### 5. Logins (the user)
- `gh auth login` for masharratt and gg-michael, `claude`, `codex`, `tailscale up`, `flyctl auth`.
- Re-sign-in Chrome if Google asks.

### 6. Projects
- Clone from GitHub: claude-flow-novice-src, fireside-family, daily-drones, fruit-fly, gg-all-projects, openwa, ai-video-test, gg-dispatch.
- MDTWII: `fleet host-setup vps` recreates the bare repo and fleet clone; mdtwii-95 drives this.
- Drop the `.env` files back in place from the bundle.

### 7. Fireside cutover
- The final Memgraph backup was taken in phase 1, just before the wipe.
- New server: restore per the restore steps in `backup-memgraph.sh` (memgraph-user ownership, or it segfaults). Start memgraph, the tunnel and the monitoring stack.
- Verify: node count matches the backup log, prod api-core's graph calls work, and Prometheus targets are up.

### 8. Services and schedules
- crontab line (with the fixed script), gg-dispatch-runner user service, code-server, `tailscale serve` routes (code-server and noVNC).
- gg-dispatch-runner stays single-user (the user's own seat only). Opening it to the team on one login breaks Claude Code's "each end user must authenticate with their own credentials" rule. Team access is deferred (user, 2026-10-15); options are official Claude in Slack, or per-person sign-in on the server.
- **New: n8n** (user, 2026-10-15). Docker compose under `~/services/n8n`, bound to 127.0.0.1. Editor reached via `tailscale serve` (tailnet only). Incoming webhooks use Tailscale Funnel on port 10000, limited to the `/webhook` path, so the editor is never public. This is the same mechanism the dispatch runner already uses on 8443, and simpler than a Cloudflare tunnel. Pinned to n8n 2.41.4 (newest release at least two weeks old). `N8N_ENCRYPTION_KEY` is generated once and copied back into the bundle as `services/n8n.env`, or saved credentials become unreadable after a restore. TODO: add the n8n volume to a backup cron.
- Cap MDTWII build caches (`~/.cache/mdtwii-target-*`) at a size agreed with mdtwii-95. They filled ~240 GB of the old 387 GB disk.

### 9. Cleanup
- Tailscale: remove the old `vps` node so the new one takes the `vps` name.
- Update the `contabo-vps` memory: new IP, region, date.

## Assumptions (testable)

- Contabo US West offers the same plan size (12 cores, 47 GB). Check this, along with any location fee, before ordering.
- The fireside tunnel token is in a fireside `.env` file, or in compose read from `.env`, so copying the `.env` files recreates the tunnel.
- Prod api-core keeps working while Memgraph is unreachable for a few minutes (graph calls fail, nothing crashes). Confirm with fireside before the cutover.
- No other external service points at the old server IP (in the `contabo-vps` memory, kept out of this public repo). Grep the kept repos and the Cloudflare/Fly configs before cutover.
- 301 GB of the 338 GB used sits under /home, and ~240 GB of that is MDTWII cache. So the backup bundle is ~10 GB, mostly ghidra and the Chrome profile.

## Decisions

1. **Wipe and rebuild in place** (user, 2026-10-15). Free, and everything is down from the wipe until phase 7 ends, including the fireside prod graph. Consequences:
   - There is no old server to fall back on, so the phase 1 manifest gate is the only safety net. Nothing gets wiped until it passes.
   - The final Memgraph backup must be taken right before the wipe, not at "cutover".
   - Tell fireside users the graph will be down for a few hours.
   - Fly apps run in sjc and iad, so a US West server sits closer to the sjc ones.
