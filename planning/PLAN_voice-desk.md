# PLAN: Voice desk (Claude app voice mode talks to a standing Claude Code session on the VPS)

**Status:** 2026-11-10. v2 after two independent reviews (Fable 5.2, Sol 6.1; both "build after
fixes") and user decisions. Approved to build.
**Builds on:** `planning/PLAN_agent-mailbox.md` (stage 6, gg-all-projects mesh) and the
gg-all-projects dispatch runner (`~/Projects/gg-all-projects/docs/operations/claude-dispatch.md`).

## Goal

From voice mode in the Claude app, Michael can:

1. Ask a question about gg-all-projects or the business VPS and hear an answer a few minutes later.
2. Hand off work and hear back when it is done.
3. Reach the other long-lived gg sessions through one front desk.

Everything past the first hop is the mailbox. The only new non-mailbox piece is a thin door on
the existing runner, because the Claude app and n8n cannot speak the mailbox protocol.

## User decisions (2026-11-10)

1. **Voice powers:** read, test, message other sessions, and code changes as pull requests into main
   (dev is retired; decided 2026-11-11 in the gg-all-projects VPS session). The desk never merges.
   Merging, deploying, production database, secrets and firewall wait for Michael at a keyboard.
2. **How the desk gets work done:** it coordinates. It may launch subagents, open new tmux worker
   sessions (cfn-tmux-agents) and assign work to existing sessions by mail. Workers change code only
   on branches in their own worktrees and open PRs into main; Michael merges. (This replaces the v1 "always the
   dispatch runner" recommendation; the Operations-runner rule from the mailbox plan is knowingly
   relaxed for the desk, which is Michael's own coordinator, not a delegated product runner.)
3. **Relay:** add a voice door to the existing dispatch runner (no new always-on service, no new
   mailbox login, no mailbox password in n8n). The desk is started by hand in tmux.
4. **Keep `dispatch_claude_code`.** It is the only path that works when the VPS is down (both reviews).

## Design

```
Claude app (voice)
   │  MCP tools: desk_send, desk_check          (personal connector, its own bearer token)
   ▼
n8n workflow "Voice desk MCP"
   │  HTTPS + bearer secret VOICE_DESK_TOKEN    (separate from every dispatch secret)
   ▼
dispatch runner on the VPS: POST /voice/send, POST /voice/check
   │  mailbox.sh as session "voice" (VPS login, MAILBOX_SESSION=voice)
   ▼
mailbox ──► michael/s/gg-desk ──watcher wakes pane──► desk session (tmux "gg-desk")
                 ▲                                      ├─ subagents
                 │                                      ├─ tmux workers (worktrees, PRs into main)
                 └── michael/s/voice ◄── replies ───────└─ mail to other gg sessions
```

### Runner door (gg-all-projects `scripts/dispatch-runner/`)

- `POST /voice/send` body `{text, request_id}`. Bearer check (timing-safe compare). `text` 1..4000
  chars. `request_id` (from n8n `$execution.id`) becomes `--msg-id`, so a retried call delivers once.
  Runs `mailbox.sh send michael/s/gg-desk --kind ask` with argv (never a shell string).
- `POST /voice/check` body `{}`. Reads new mail for `michael/s/voice`, **appends it to a local log
  file before answering** (`~/.local/state/gg-voice/replies.jsonl`, 600), then returns the newest
  5 replies from the last 24 h with age ("4 min ago"), plus desk health from
  `tmux has-session -t gg-desk`. Re-reading is fine for voice; a lost HTTP response never loses a reply.
- Both routes are off unless `VOICE_DESK_TOKEN` is set. Wrong or missing token: 401, nothing run.
- Health wording: "The desk is not running" when the tmux session is gone, never inferred from heartbeat
  (heartbeat only refreshes on hook events, so an idle desk looks dead: `mailbox-watch.sh:197`).

### Desk session

- `scripts/voice-desk/start-desk.sh` opens tmux session `gg-desk` in the human checkout and runs
  `claude` with the desk instructions (`scripts/voice-desk/DESK.md`) appended to its system prompt
  and the desk settings file (`scripts/voice-desk/settings.json`).
- The session itself runs `mailbox.sh claim gg-desk` as its first act (a claim by the launcher would
  bind the name to the wrong holder: `mailbox.sh:218-223`). Restart path: `release gg-desk`, then relaunch.
- Replies to `michael/s/voice` only, `--kind reply`, under ~80 words, plain English, no paths or code
  (it is read aloud). Long results go to a file under `planning/desk/` and the reply says so. Sends a
  short "on it" reply first for anything that takes more than a minute.
- Mail from `michael/s/voice` is **teammate tier** (both reviews: the bearer token does not prove it was
  Michael speaking, and any of Michael's sessions can send as `voice`). No new tier.
- Settings deny list (advisory, not an access boundary; both reviews): `git push` to main/dev,
  `git merge`, `gh pr merge`, deploy CLIs (`fly deploy`, `vercel`, `supabase db push`, `pnpm ship`),
  `psql`. DESK.md states the same limits in words.
- Tests that touch a database run only in a worktree with no `.env` (test DB safety: assume `.env`
  is production).
- `cfn: no daily auto-reset yet; add a 04:00 save-state-and-restart when context fills during a normal day`.

### n8n workflow "Voice desk MCP"

- MCP Server Trigger, bearer auth (new token, connector added as **personal**, not organization).
- Two HTTP Request tools to `http://172.18.0.1:8790/voice/send` and `/voice/check` (the existing
  `gg-runner-relay.service` socat relay from the n8n docker network to the runner), header auth
  credential holding `VOICE_DESK_TOKEN`. Not the Funnel URL: n8n runs on the same VPS, the Funnel
  name resolves to the tailnet IP inside the container and 8443 is bound to tailscale0 only, so a
  hairpin can never connect (found live 2026-11-11; dispatch and the Sentry investigator already use
  the relay).
- Tool descriptions tell voice mode: send, then come back later and check; read replies aloud as given.
- Repo copy `scripts/n8n/voice-desk-mcp.json`, row in `docs/operations/n8n-map.md`.

## Stages

1. **Runner door, test first.** Unit tests: 401 on missing/wrong token; routes off when token unset;
   oversized text 400; send passes argv with `--msg-id`; duplicate `request_id` sends once at the
   mailbox level; check persists before answering; a second check returns the same replies; health
   says "not running" when tmux has no `gg-desk`.
2. **Desk files.** `start-desk.sh`, `DESK.md`, `settings.json`. Shellcheck clean.
3. **n8n workflow** created and saved to the repo.
4. **Deploy (asks Michael first):** push gg-all-projects, pull on the VPS, set `VOICE_DESK_TOKEN` in
   the runner env, restart the runner once, start the desk over ssh.
5. **Live checks:** (a) from the Mac, mail `michael/s/gg-desk` an ask, get a reply in under 3 min;
   (b) curl `/voice/send` then `/voice/check` with the token; (c) Michael adds the connector in the
   Claude app and asks by voice.
6. **Week of use**, then decide on daily reset and whether voice should reach other people's sessions.

## Assumptions (testable)

| # | Assumption | Check |
|---|------------|-------|
| A1 | n8n reaches the Funnel URL (it already calls `/dispatch` there) | Stage 5b from n8n |
| A2 | The runner's user can run `mailbox.sh` and `tmux` with the VPS mailbox env | Stage 4, `mailbox.sh doctor` as that user |
| A3 | The watcher wakes the `gg-desk` pane | Stage 5a |
| A4 | Voice mode on the phone can call a personal custom connector | Stage 5c |
| A5 | Mail to `michael/s/voice` (no live session) is not bounced back before it is read | Stage 5b; if it bounces, the door heartbeats `voice` on each check |

## Risks

- **Risk:** Anyone with the connector token can steer the desk, if they get the token. Limits are
  advisory, so the real guard is the token plus "PRs only, nothing merges without Michael".
- **Risk:** The desk shares the Linux user with the runner and can read the runner's secrets file and
  the checkout's `.env`. Accepted for now; `cfn:` upgrade trigger is a separate Linux user if the desk
  ever takes mail from anyone but Michael.
- **Risk:** The desk silently stops. `desk_check` reports tmux liveness, so voice tells you.
- **Risk:** Cost of long subagent or worker runs. DESK.md caps workers at 3 at once.

## Review findings and how v2 answers them

| Finding (reviewer) | v2 |
|--------------------|----|
| Voice tier spoofable; login cannot be limited to two keys (both) | Dropped the tier and the new login; voice is teammate |
| Connector is org-wide, static token (Fable) | Personal connector, own token |
| Deny list not enforceable (both) | Kept, labelled advisory; real guard is PR-only plus token |
| `/dispatch` needs Slack fields, opens PRs into main (both) | Desk no longer uses `/dispatch`; workers open PRs into main, Michael merges |
| `read` consumes mail, reply can be lost (both) | Door persists before answering, re-returns last 24 h |
| Heartbeat misreports idle desk (both) | Health from tmux |
| HMAC replay (both) | Bearer plus `request_id` as `msg_id` |
| Launcher claim binds wrong holder (Fable) | Session claims itself |

## Not in scope

Spoken audio streaming, phone push notifications, other people using the desk, Operations approvals.
