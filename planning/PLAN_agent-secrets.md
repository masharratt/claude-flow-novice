# Plan: agent secrets and team passwords

**Status:** draft for the user's approval, 2026-10-16. Nothing bought or installed yet.
**Related:** `planning/PLAN_agent-mailbox.md` (mail carries references, never secrets),
`.claude/skills/cfn-mailbox/SKILL.md` ("Never send secrets by mail").

## Goal

Agents on every machine (Mac, VPS, WSL desktop, later teammates' machines) can use API keys and
tokens without the value ever entering a model's context, a mail body, a transcript or a repo. People
on the team share ordinary logins through a normal password manager. The two never mix: no agent can
reach a person's passwords.

## Decisions (user, 2026-10-16)

- Open source, self-hosted for agent secrets (no 1Password or Bitwarden today).
- Separate from the agent VPS: the VPS runs agents with broad shell access, so a secrets store there
  is one prompt injection away from all secrets.
- People's passwords: a tool with a UI; may extend to the team. Not API keys.
- Teammates' agents may later get scoped access.

## Design

| Use | Tool | Where | Who |
|-----|------|-------|-----|
| Agent secrets (API keys, tokens, deploy credentials) | **Infisical** (open source, MIT core) | New small dedicated server, Tailscale only | Agents via machine identities; Michael via web UI |
| Team passwords (human logins) | **Bitwarden Teams** (hosted, ~$4/user/month, verify on bitwarden.com/pricing) | Bitwarden cloud | People only; no agent identities |
| Telling an agent which secret to use | Agent mailbox | Existing | "use `DEPLOY_TOKEN` from project `gg-ops`, env `prod`" |

### Why hosted Bitwarden for people but self-hosted Infisical for agents
- A people password manager that goes down or loses its database locks the team out of everything;
  Bitwarden's cloud carries that risk for $4/user. Self-hosted Vaultwarden is free but makes us the
  on-call for it.
- Losing the agent secrets store is recoverable: every key can be re-issued at its provider. That
  makes self-hosting acceptable there.

### How an agent uses a secret (the core rule)
1. Mail or a brief names the secret by reference: project, environment, key name.
2. The agent runs the command through Infisical: `infisical run --projectId <id> --env prod -- <cmd>`.
   The CLI fetches the value with the machine's identity and injects it into that one process's
   environment. The model sees only the command and its output.
3. Never `infisical secrets get --plain`, `infisical export` to stdout, `echo $SECRET`, `env`, or
   writing values into files. A PreToolUse guard enforces this (Phase 4).

### Access model: per-project logins (user, 2026-10-16)
An agent working in one repo can read only that repo's secrets. The server enforces it, so it holds
even when the agent is tricked.
- **One Infisical project per repo**: `mdtwii`, `gg-all-projects`, `fireside-family`,
  `claude-flow-novice-src`, ... (named after the repo folder, the same name the mailbox uses for the
  project). Environments `dev` / `prod` inside each. Plus `shared-team` later for teammates' agents.
- **One machine identity per project per machine**: `mdtwii-mac`, `mdtwii-vps`, `gg-all-projects-desk`.
  Universal Auth: a client id plus a client secret issued once, exchanged for a short-lived access
  token. Each identity is a member of exactly its own project, read-only by default. Only machines
  that work on a project get an identity for it.
- **A project that genuinely needs another project's secret** gets an explicit second grant on that
  one environment, recorded in the project's notes in Infisical; never a broad identity.
- **Per-project credential file** `~/.config/cfn-secrets/<project>.env` (chmod 600, same handling as
  the mailbox login): `INFISICAL_API_URL`, `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`,
  `INFISICAL_PROJECT_ID`. Copied by hand, never by mail. The wrapper picks the file from the repo it
  runs in (git main-checkout folder name, the mailbox's `mailbox_project_name`); the agent never
  chooses.
- **Revocation:** delete or rotate one identity's client secret (for example "MDTWII on the VPS");
  nothing else changes.

### Local isolation (the part the server cannot enforce)
All of one person's agents on a machine run as the same OS user, so without more an MDTWII agent
could read `gg-all-projects.env` and use that identity. Per-project scoping is only as strong as the
fence around those files:
1. **Claude sandbox read-deny (everyday sessions):** each project's sandbox settings deny reading
   every `~/.config/cfn-secrets/*.env` except its own. Generated per project by `secrets.sh fence`
   (same idea as `zai-fence.sh` / `readonly-data.sh`). Gap: a session with the sandbox turned off,
   or a command the user runs unsandboxed, is not fenced.
2. **Fleet workers on the VPS:** already run in a `systemd-run` scope with their own settings; the
   spawn passes only that project's credential file into the worker (bind or copy into its private
   outbox dir, deny the rest). Strong for fleet work.
3. **Separate OS user per project (strongest, optional):** for a project whose secrets are high
   value, run its agents as their own Unix user that owns only its file. Clumsy for daily work; use
   only where warranted.
- **Audit:** Infisical's audit log records each read with the identity that made it.
- **Teammates' agents (later):** a separate identity per person, added only to `shared-team`. Their
  machines reach the server through a Tailscale share of that one host (no public port) or, if that is
  too awkward, a public HTTPS endpoint behind SSO; decide at that stage.

### Server
- New VPS, separate provider account or at least a separate host: **4 vCPU / 8 GB recommended,
  2 vCPU / 4 GB minimum** (Infisical's official figures, covering Infisical, Postgres and Redis).
  Roughly $8 to $15/month depending on provider (to confirm when choosing).
- Ubuntu LTS, hardened like the agent VPS (`contabo-vps` memory: ufw default deny, ssh keys only),
  Docker + Compose, Infisical's official compose file.
- **No public ports at all.** Tailscale on the host; the UI and API reachable only on the tailnet via
  `tailscale serve` with HTTPS.
- Nothing else runs on it: no agents, no Claude Code, no n8n.
- Backups: nightly encrypted `pg_dump` plus the `ENCRYPTION_KEY` / `AUTH_SECRET` stored separately
  (offline, in Bitwarden under Michael's account). A backup without the key is useless, the key
  without the backup is useless; keep them apart. Restore rehearsed once before relying on it.
- Updates: monthly image update window; Infisical security releases applied promptly.

## Phases

1. **Choose and buy the server** (user decision: provider and size). Harden, Tailscale, Docker.
2. **Install Infisical** from the official compose file; set `SITE_URL` to the tailnet name; create
   Michael's admin account with MFA; store the instance keys offline.
3. **Projects and identities**: one project per repo that has agent secrets, one read-only identity per
   project per machine that works on it.
   Move the first real secrets in (start with ones agents need today; list to be agreed). Remove
   those values from `.env` files only after the agents use the Infisical path successfully.
4. **CFN integration (TDD in this repo)**:
   - `cfn-secrets` skill: `secrets.sh run <env> -- <cmd>` (thin wrapper over `infisical run`; the
     project and its credential file come from the repo it runs in, never an argument),
     `secrets.sh doctor`, `secrets.sh list <env>` (key names only, never values), `secrets.sh fence`
     (writes the per-project sandbox read-deny for the other projects' credential files).
   - Fleet spawn on the VPS hands a worker only its own project's credential file.
   - PreToolUse guard: deny Bash commands that would print a value (`infisical secrets get`,
     `infisical export` without `--output-file` to a 600 temp file, `--plain`, `printenv`/`env` inside
     `secrets.sh run`, `echo $` of a known injected key). Test with each pattern.
   - Mailbox: add a `secret_ref` convention to SKILL.md; the mailbox hook flags mail bodies that look
     like credentials (high-entropy tokens, `sk-`, `ghp_`, `xox` prefixes) and quarantines them.
   - Install on Mac, VPS and desktop.
5. **Backups and restore drill**; write the runbook.
6. **Bitwarden Teams for people** (independent of 1-5): create the organization, invite the team,
   collections per area. No machine access.
7. **Teammates' agents (later)**: per-person identity on `shared-team`, network access decision,
   one-page setup like the mailbox's "Setting up another machine".

## Assumptions (testable)

- A Claude Code sandbox `denyRead` entry for `~/.config/cfn-secrets/<other>.env` blocks reads by
  every tool and Bash command in that session (check with `cat` and the Read tool).
- `infisical run` injects values only into the child process and prints nothing by itself (check
  with a dummy secret and a command that prints nothing).
- Universal Auth access tokens are short-lived and the client secret can be rotated without
  recreating the identity.
- Infisical's self-hosted core includes machine identities, projects, environments and audit logs
  without a paid licence (confirm against the current licence page; some features such as advanced
  audit retention may be Enterprise-only).
- The CLI works on macOS, Ubuntu and WSL.
- Tailscale serve gives the Infisical UI a valid HTTPS certificate on the tailnet name.

## Risks

- **Risk:** every agent secret sits on one server, so a compromise of it exposes all of them if it is
  reachable or its admin login leaks. Mitigation: no public ports, nothing else on the host, MFA,
  read-only scoped identities, audit log review.
- **Risk:** a model prints a secret anyway (an injected value echoed by a script it runs). The guard
  catches the common patterns, not all; output of arbitrary programs can still contain a value.
  Rotate any value that appears in a transcript.
- **Risk:** losing the instance encryption key makes the backups unreadable. Store it offline in two
  places.
- **Risk:** the agent VPS can still reach the secrets server over Tailscale. A tricked agent there
  can read what its project's VPS identity allows, so only projects that run on the VPS get one.
- **Risk:** per-project scoping leaks if an agent reads another project's credential file. The
  sandbox fence closes that for sandboxed sessions and fleet workers; unsandboxed commands are not
  fenced. High-value projects can move to a separate OS user.

## Not in scope

- Human passwords for agents, ever.
- Secrets in mail bodies, ever.
- High availability for Infisical (single server, restore from backup is the recovery plan).

## Sources (checked 2026-10-16)

- Infisical Docker Compose deployment (requirements 2 CPU / 4 GB minimum, 4 CPU / 8 GB recommended;
  compose template described as a proof of concept, not HA):
  https://infisical.com/docs/self-hosting/deployment-options/docker-compose
- Infisical machine identities and Universal Auth (client id + client secret, short-lived access
  token): https://infisical.com/docs/documentation/platform/identities/universal-auth
- Bitwarden Teams price (third-party reports of $4/user/month annual; confirm on bitwarden.com):
  https://www.capterra.com/p/210695/Bitwarden/pricing/
