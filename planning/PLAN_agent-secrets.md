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

### Access model
- **Projects** group secrets by purpose: `cfn-infra`, `gg-ops`, `fireside`, `shared-team` (for
  teammates' agents later). Environments `dev` / `prod` inside each.
- **Machine identities**, one per machine per owner: `michael-mac`, `michael-vps`, `michael-desk`,
  later `steve-mac`. Universal Auth: a client id plus a client secret issued once, exchanged for a
  short-lived access token. Each identity is added only to the projects and environments it needs,
  read-only by default.
- **Per-machine credential file** `~/.config/cfn-secrets/env` (chmod 600, same handling as the
  mailbox login): `INFISICAL_API_URL`, `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`. Copied by
  hand, never by mail.
- **Revocation:** delete or rotate one identity's client secret; nothing else changes.
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
3. **Projects and identities**: create the four projects, three machine identities, read-only roles.
   Move the first real secrets in (start with ones agents need today; list to be agreed). Remove
   those values from `.env` files only after the agents use the Infisical path successfully.
4. **CFN integration (TDD in this repo)**:
   - `cfn-secrets` skill: `secrets.sh run <project> <env> -- <cmd>` (thin wrapper over
     `infisical run` that reads `~/.config/cfn-secrets/env`), `secrets.sh doctor`, `secrets.sh list
     <project> <env>` (key names only, never values).
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
  can read what `michael-vps` is allowed, so keep that identity's projects minimal.

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
