# Trace: real glm session in the current (deny-list) fence, 2026-11-16

Run: `strace -f -e trace=%file,execve,connect` around `zai-fence.sh claude -p "<create hi.txt, git add, git commit, reply DONE>" --model glm-5.3-flash --permission-mode bypassPermissions` in a throwaway git repo. Result: DONE, commit made. Raw trace (125k lines) and the
payload-only summary (paths used after the claude exec, by prefix) are kept in the session
scratchpad (`saved/strace-glm.txt`, `saved/strace-payload.txt`), not in git.

## Needed (succeeded, payload only)

- `/usr/bin`, `/usr/lib`, `/usr/share`, `/usr/local` (8 stats), `/lib/x86_64-linux-gnu`, `/bin/sh`, `/bin/bash`
- `/etc`: ld.so.cache, localtime, nsswitch.conf, hosts, host.conf, gai.conf, resolv.conf, passwd, os-release, gnutls/config, ssl/certs, ssl/openssl.cnf, profile.d (login shell), machine-id (optional)
- execs: bash, sh, cat, curl (a hook), date, dirname, env, find, git, grep, jq, locale, mkdir, node (plugin hooks + npx), readlink, sed, stat, timeout, tr, uname; all in /usr/bin. `rg` is the claude binary itself (argv0).
- `~/.local/bin/claude` -> `~/.local/share/claude/versions/<v>`
- `~/.claude`: CLAUDE.md, RTK.md, rules, references, agents, skills, commands, hooks, helpers, core, cfn-*, prompts, plugins (1507 opens: plugin hooks), settings.json, plus state (session-env, shell-snapshots, sessions, statsig, debug, logs, paste-cache, state, projects, todos, telemetry, cache)
- `~/.claude-tmp/claude-1000/...` (Claude's own tmp), `~/.gitconfig`, `~/.config/git`
- `/opt/claude-org-plugins` (org plugins, read)

## Seen but NOT needed (to be absent)

- `~/.claude.json` written via tmp+rename (failed EROFS today; harmless) -> private home fixes it
- MCP servers launched from host `~/.claude.json`: `npx @modelcontextprotocol/server-sequential-thinking`, `npx @playwright/mcp@latest` (npm registry traffic 104.16.x.34) -> dropped (generated config has no mcpServers)
- `/mnt/c/...` PATH probing (Windows PATH entries), `~/.cargo/bin`, `~/.fly/bin`, `~/.hyperframes-whisper` -> absent
- `/etc/claude-code/*` managed settings (absent on host too), `/etc/gitconfig` (absent)
- Readable today and must not be: `~/.claude/settings.local.json*`, `~/.claude/history.jsonl` probes, `decision-log.db`, `decisions.db`, `stats-cache.json`, `remote-settings.json`, `~/projects/claude-flow-novice` beyond the runtime links

## Network (connect)

- 10.255.255.254:53 (WSL DNS), z.ai (47.251.x.x), npm registry (MCP npx), 160.79.104.10 / 34.149.66.165 (Anthropic/telemetry endpoints, some failed), `/var/run/nscd/socket` (absent, fine)
- With the broker only `api.z.ai:443` is reachable; DNS is done host-side by the broker.
