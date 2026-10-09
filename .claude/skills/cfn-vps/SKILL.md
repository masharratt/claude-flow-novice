---
name: cfn-vps
description: "Run builds, tests and long jobs on the user's remote server (VPS) from a local Claude Code session over ssh. Use when asked to build/test/run something 'on the server' or 'on the VPS', to sync a project there after pushing, or to start, check or read a long remote job (a build, render or test run that should survive the laptop sleeping). Host details live only in the user's ~/.ssh/config, never in this skill."
version: 1.0.0
tags: [vps, remote, ssh, build, jobs]
status: dev
---

# cfn-vps

## Purpose
Drive a remote Linux server from the local session: one-shot commands in a project folder, a safe `git pull`, and background jobs that keep running when the connection drops.

## Setup (once per machine)
- An ssh alias for the server in `~/.ssh/config` (default name `vps`) with key login. `ssh vps` must work without a password prompt.
- Projects on the server live in `~/Projects/<name>` (override with `CFN_VPS_PROJECTS`).
- Different alias: set `CFN_VPS_HOST`.
- If you are ALREADY on the server (hostname is the server's, or `~/Projects` is local and there is no `vps` alias), do not use this skill; run commands directly.

## Usage
```bash
VPS="$HOME/.claude/skills/cfn-vps/vps.sh"
"$VPS" check                                   # reachable? OS, load
"$VPS" sync legion-engine                      # git pull --ff-only on the server
"$VPS" run legion-engine -- cargo test -p sim_core
"$VPS" job legion-engine build -- cargo build --release
"$VPS" status build                            # running | done, exit N
"$VPS" log build 100                           # last 100 lines
"$VPS" jobs                                    # every job and its state
```

## Exit codes
- `0` success, `2` bad usage or invalid name, `3` no such project/job, `4` server copy has uncommitted changes (sync refused), `5` a job with that name is still running.
- `run` returns the remote command's own exit code.

## Workflow: build here, build there
1. Commit and push locally (the server pulls from GitHub; it never receives local files).
2. `sync <project>`. Exit 4 means someone edited the server copy: report the listed files to the user, do not discard them.
3. Short commands (under ~2 minutes): `run`. Anything longer: `job`, then poll `status` and read `log`. Jobs survive ssh drops and laptop sleep; they do not survive a server reboot (status says `lost`).

## Rules
- **Sandbox:** the local Bash sandbox blocks ssh (port 22 and `~/.ssh`). Run `vps.sh` with the sandbox disabled; each call is its own approval.
- **Secrets:** never print `.env` files or tokens through `run`. Check for a variable with `grep -c '^NAME=' .env`, not `cat`.
- **Never write the server's address, tailnet name, usernames or keys** into any repo file, commit, log you share, or this skill. Refer to the server only by its alias.
- **Destructive commands** (`rm -rf`, `git reset --hard`, dropping data) follow the same approval rules as local ones. The server's own guard hooks do not see commands sent through ssh.
- **Login-sensitive changes** (ssh config, firewall, user accounts, reboot) need the user's explicit OK first: a mistake can lock everyone out.

## Dependencies
- Local: bash 4+, ssh. Remote: bash, git; nvm/cargo/`~/.local/bin` are loaded automatically when present.

## Tests
`tests/test-cfn-vps.sh` (ssh stubbed; includes a scan that fails if any IP, tailnet name, key or password appears in this folder).
