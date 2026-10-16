# PLAN: Agent mailbox (sessions message each other across machines and accounts)

**Status:** 2026-10-16. Stages 1-4 built and live on the Mac and the VPS (commits 4da59370,
f23dd449, 19640dac, d0fc1b8d): core, hooks with trust tiers, watcher with send-later and bounce.
Stage 4b (hardening from the Operations review, below) built and tested offline 2026-10-16, not yet
deployed: existing ACL users need `~claim:<owner>:*` added before send-later works live.
Next: stage 5 (fleet, all workers).
Design history: v3 (2026-10-15) applied 16 findings from an independent design review.
- **Hosted on Upstash, fixed $10/month plan** (user, 2026-10-15): 250 MB, unlimited commands, so
  mail checks are not rationed. Replaces the earlier self-hosted-on-the-VPS design.
- v3 adds: project addresses, rooms, send-later, bounce and expiry, trust tiers, loop controls, and
  the coordinator-versus-mesh analysis (user asked, 2026-10-15).

## Goal

Let any Claude Code session message any other session, wherever it runs: Mac sessions, server
(VPS) sessions, fleet workers, and later another person's agents (Steve). Today sessions only
reach peers on the same machine, and server workers report back only when the Mac polls
(`fleet watch` / `fleet sync`).

## Why one hosted Redis

- **Upstash** (user's choice): reachable from anywhere over TLS with a password, so the Mac, the
  server and Steve's machine all use the same Redis with no tunnel, no firewall change and no
  Tailscale access for Steve. Keeps working while the server is down or rebuilt.
- The old Redis coordination (archived in `.archive/cfn-redis-coordination-legacy/`, replaced by
  trigger.dev in 2024-11) hurt because every machine and Docker network had its own Redis and its
  own `REDIS_HOST` default of `localhost`. Fix: **exactly one Redis, and no default.** The address
  comes from one config file; if it is missing, every command fails loudly instead of quietly
  talking to some other Redis.
- Each person's agents run on their own Claude subscription and sign-in, which is the shape the
  Claude Code terms require (see the gg-all-projects team-access decision doc). The mailbox only
  moves text between them.
- QStash (Upstash's HTTP queue) was considered and rejected: it delivers by calling a public URL,
  and sessions have none. Redis lets every machine connect out and collect its own mail.
- Trade-offs accepted: messages sit with a third party, and the endpoint is on the public internet
  behind TLS and per-person passwords.

## Upstash facts (checked 2026-10-15)

- Fixed plan $10/month, 250 MB, unlimited commands (per Upstash's 2026 blog; confirm on the live
  pricing page at sign-up).
- Blocking reads (`XREAD BLOCK`, `XREADGROUP BLOCK`) are documented for normal Redis (TCP)
  connections; Upstash's REST SDKs do not support blocking. **We use `redis-cli --tls` over TCP,
  never REST.**
- `ACL SETUSER` with key patterns (`~pattern`) and command lists is supported. Separate read and
  write key patterns (`%R~`/`%W~`) are **not confirmed**, so the design below does not need them.
- Region: the US West region closest to the VPS.
- **Live probe, 2026-10-15 (database `daring-redfish-152663`, Redis 8.4.0): passed.** Streams,
  `EXPIRE`, consumer groups (`XGROUP`/`XREADGROUP`/`XPENDING`/`XAUTOCLAIM`/`XINFO`) and
  `XREAD BLOCK` (woke on new entry) all work over TLS with `redis-cli`. ACL: `~mbx:*:from:steve`
  let a test user write `mbx:michael:me:from:steve` and `mbx:michael:p:proj:from:steve`, and gave
  NOPERM on forging `...:from:michael`, reading `...:from:michael`, the suffix trick
  `...:from:steve:x`, and `FLUSHALL`. `%R~`/`%W~` is a syntax error (not supported; not needed).
- **Upstash ACL passwords must come from `ACL GENTOKEN <user>`**; `ACL SETUSER <user> on >pass`
  rejects any other password. User creation = GENTOKEN, then SETUSER with that token.
- The connection URL Upstash shows is `redis://...`; TLS is required, so use `rediss://` or `--tls`.

## Coordinator (queen) versus message-anyone (mesh)

**The transport is the same for both.** A message is a message; Redis does not care who is allowed
to talk to whom. What changes between the two styles is everything around the transport:

| Concern | Coordinator (queen) | Message-anyone (mesh) |
|---------|--------------------|------------------------|
| Who may send to whom | Workers talk only to their coordinator | Any session to any session |
| Authority | Workers may act on coordinator instructions (it holds the user's plan) | A peer's message is a request, never an order |
| Conflicting work | Coordinator hands out work and file claims, so no two agents edit the same thing | Two agents can both "fix" the same thing; needs announce-before-you-touch |
| Loops and floods | Impossible by shape (star, not web) | A asks B, B asks A, forever; needs hop and rate limits |
| Who sees the whole picture | The coordinator | Nobody, unless there is a shared log |
| Single point of failure | The coordinator (and its context window filling up) | None |
| Discovery | Coordinator knows its workers | Needs a directory: who is live, what each one does |
| Injection blast radius | One trusted sender per worker | Every peer is a possible source |

**Where each fits:**
- **Fleet (MDTWII and similar): coordinator.** It already works this way (master plus roster plus
  claims). The mailbox only replaces polling: workers send reports to their master's address, the
  master sends instructions to the worker's address. Nothing about fleet authority changes.
- **gg-all-projects: mesh, with guardrails.** Several long-lived sessions each own an area (n8n,
  dispatch runner, gg-app, research), and today they already message each other ad hoc, for example
  the firewall requests on 2026-10-15. That is mesh. It works because each session owns a separate
  area and asks the user before anything outward-facing. The mailbox should keep that shape and add
  the controls below, not force a coordinator onto it.
- **Across people (Steve): coordinator at the border.** Steve's agents may not message any of the
  user's sessions directly. Each person publishes a small set of public addresses (default: their
  personal inbox and one liaison project). Everything else from outside is bounced. Inside each
  person's own world, mesh or coordinator as they like.

**Decision for the build:** the mailbox is a neutral transport with a policy layer. Policy is set by
sender and address, not by a global mode: same-owner mail is "teammate", fleet-master mail to its
own workers is "coordinator", other-owner mail is "outside". Support for both styles costs little
extra; the controls that mesh needs (hop limits, rate limits, rooms, a log) are cheap and also make
the coordinator style safer.

## Addresses

| Address | Example | Who receives | Use for |
|---------|---------|--------------|---------|
| Session | `michael/s/mdtwii-95` | That one live session | Live back-and-forth |
| Project | `michael/p/fireside-family` | Exactly one live session working in that project (whichever picks it up first) | Anything that must get through, reminders, requests to "whoever is on X" |
| Room | `michael/r/gg-all-projects` | Every subscribed session, each gets its own copy | "I'm restarting n8n, hold off", status broadcasts |
| Person | `michael/me` | The user: shown at the start of the user's next session on any machine, later also pushed to phone/Slack | Bounces nobody else can take, cross-person mail, "tell Michael" |

- **Session names change on restart** (`claude-flow-novice-src-58` versus `-8a`), so a session
  address dies with its session. Project and person addresses survive restarts. Agents should send
  to the project address unless they are in a live conversation.
- A session joins its project address and its project's room automatically at SessionStart
  (project = the git repo folder name). Other rooms by `/mail join <room>`.
- Directory: `dir:<owner>` hash, field = session address,
  value = `{host, project, tmux_target, rooms, last_seen, summary}` where `summary` is the session's
  current task line (from `cfn-task`). Written at SessionStart and at most once a minute.
  `/mail who` lists sessions seen in the last 30 minutes. Same-owner only; other people's sessions
  are not visible (their public addresses come from config).

## Keys and sender verification

- Every inbox is split by the sender's owner:
  `mbx:<to-owner>:<kind>:<name>:from:<sender-owner>` (kind = s, p, r, me).
- ACL per person (no read/write split needed):
  - `michael`: `~mbx:michael:*` (read his own mail), `~mbx:*:from:michael` (send to anyone),
    `~dir:michael`, `~seen:michael:*`, `~due:michael`, `~log:michael`, `~lock:michael:*`,
    `~rate:michael:*`, `~done:michael:*`.
  - `steve`: the same with his name.
  - Commands allowed: `+ping +xadd +xread +xreadgroup +xack +xautoclaim +xclaim +xpending +xinfo
    +xgroup +xrange +xlen +xdel +xtrim +hset +hget +hgetall +hdel +zadd +zrangebyscore +zrem +get
    +set +del +expire +incr`. No
    `KEYS`, `SCAN`, `FLUSH*`, `CONFIG`, `ACL` or scripting.
- **The sender's owner cannot be forged:** Steve's login can only write keys ending `:from:steve`.
  The session part inside an owner is self-declared; within one person's machines that is trusted.
- Steve can read the copies of what he sent (they sit in keys he may write), and nothing else.
- Accepted limit: because `~` grants read and write together, a sender can also delete or trim
  its own sent copies in the other person's inbox. It cannot touch anyone else's mail or the
  receiver's read markers (those sit under `seen:<receiver>`).
- Names (owner, project, room, session) allow only `[a-z0-9-]`. The tier is computed from the key
  the receiver built itself, never by parsing a key name it found.

## Messages

- Redis Streams, one per inbox key above, capped `MAXLEN ~ 500` per key.
- Fields: `id`, `from` (full address), `to`, `kind`, `body` (cap 4 KB), `sent_at`, `thread`,
  `hops`, `reply_to`, optional `deliver_at`, optional `expires_at`.
- Message kinds:
  - `ask`: a reply is expected.
  - `fyi`: information only. Delivered on the next turn; never wakes an idle session.
  - `reply`: answers an `ask`.
  - `reminder`: send-later mail; wakes the receiver when it lands.
  - `bounce`: undelivered notice. Never bounced again and never wakes anyone.
- Compact JSON only (`jq -c`): the old system lost a day to pretty-printed JSON breaking writes.
- Every send also appends a one-line record to the sender's `log:<owner>` stream (MAXLEN 10,000),
  so the user can see all agent traffic in one place (`/mail log`).

## Delivery lifecycle

- **Session and room mail:** each reading session keeps its own last-seen id per inbox key, in
  Redis at `seen:<owner>:<reader-session>:<inbox-key-hash>`, so room subscribers do not mark mail
  read for each other and split inboxes (one key per sender owner) each have their own marker. A
  new subscriber starts at the newest message.
- **Receivers read only keys they build themselves** from their own addresses and their contacts
  list. Keys an outsider invents are never read, and every `XADD` also sets an expiry (30 days), so
  junk keys age out without needing `SCAN`.
- **Project mail:** a Redis consumer group per project inbox. One live session in the project takes
  the message; it is acknowledged only after it was put into that session's turn. If that session
  dies before acknowledging, the watcher hands the message to another live session in the project
  after 10 minutes (`XAUTOCLAIM`). So exactly one session handles it, and a crash does not lose it.
  Groups are created at id `0` when a project address is first joined. Hooks read the session's
  pending (claimed but unacknowledged) entries first, then new ones, so reassigned mail is seen.
  Unread detection for bounces uses `XPENDING` and the group's position (`XINFO`).
- **Send later:** `/mail send <to> --at "tomorrow 9am" "..."` puts the message in `due:<owner>` (a
  sorted set by delivery time, UTC epoch seconds). The sender's owner's watcher moves it into the
  inbox at that time; it removes the entry (`ZREM`) first and only the watcher whose remove
  succeeded delivers, so two machines never deliver it twice.
  Survives restarts on both sides. Reminders go to project addresses by default.
- **Bounce:** unread or unacknowledged mail is returned to the sender as a `bounce` after 24 hours
  (session mail) or 7 days (project mail). If the sender's address is dead too, the bounce goes to
  the sender's person inbox (`michael/me`). Nothing is dropped silently. Message age comes from the
  Redis stream id (server time), not from machine clocks.
- **Expiry:** session inboxes whose session has not been seen for 7 days are deleted after their
  unread mail is bounced. Rooms keep the last 500 messages. Person inboxes are not capped (`MAXLEN` applies to session, project and room inboxes only), so
  unread mail to the user is never trimmed.
- Who runs this: the watcher on any of the owner's machines. Lifecycle jobs take a short lock
  (`SET lock:<owner>:lifecycle NX EX 60`, left to expire; no scripting). Each bounce is also made
  safe to repeat with a per-message marker (`SET done:<owner>:<msg-id> NX EX 604800`): only the job
  that sets it sends the bounce.

## Trust tiers (what an agent may do with a message)

| Tier | When | Agent may |
|------|------|-----------|
| Coordinator | Fleet worker receiving from the master named in its brief, and the message carries the per-run secret from that brief | Act on it as its brief allows (same as today's `fleet nudge`) |
| Teammate | Same owner, any other session | Treat it like the built-in cross-session messages: a request it may act on within its own permissions; never grants new permissions, never counts as the user's approval, never leads to pushes, deletes, firewall or account changes without asking the user |
| Outside | Different owner | Information only. Summarise and show the user; take no action on it without the user's say-so |

- The hook adds a header to every delivered message naming its tier, sender and thread, and the
  matching rule. Tests assert the header is always present and the tier is computed from the key
  (`from:<owner>`), never from the message body.
- An outside message to a non-public address is refused when it is sent: the sender's
  `mailbox.sh` checks its contacts list of public addresses. If one is written anyway, the receiver
  never reads that key (it builds its own keys), so it is never delivered.
- **The coordinator tier cannot be claimed by name alone.** The session part of an address is
  self-declared, so any of the user's sessions could call itself the fleet master. Coordinator mail
  must carry a per-run secret that `fleet spawn` writes into the worker's brief; without it the
  message is "teammate".
- **The header is not the only guard for outside mail** (before phase 7). Sessions often run with
  permission checks bypassed, and a teammate could pass outside text along as its own. So a
  session that has been shown outside mail is marked "tainted" for the rest of the turn, and a
  PreToolUse guard (like night mode's) asks the user before risky tools: push, delete, network
  changes, firewall, sending mail onward.

## Loop and flood controls (needed for mesh, cheap for everyone)

- `hops` increases on every reply in a thread; a thread stops at 20 hops (send refuses, tells the
  agent to ask the user).
- Rate limit per sender-receiver pair: 10 messages per 10 minutes, enforced on send and again on
  receive.
- `fyi` and `bounce` never wake an idle session and never expect replies; agents are told not to
  reply to `fyi` unless they have new information.
- Acknowledgement-only replies ("got it", "thanks") are discouraged in the skill text; the watcher
  never wakes a session for a `reply` whose body is under 40 characters.
- Rooms: max 30 messages per room per hour from one session.

## Sending: `/mail` skill plus `mailbox.sh`

- `mailbox.sh send <to> [--kind ask|fyi] [--at <time>] [--thread <id>] "<text>"`
- `mailbox.sh read`, `who`, `log`, `join <room>`, `leave <room>`, `doctor`.
- A skill `cfn-mailbox` wraps it for agents and says when to use project versus session addresses.
- Prints the message id on success; on failure a plain error naming the cause (no config, Upstash
  unreachable, auth refused, unknown or non-public address, body too long, hop or rate limit).
- **Same machine, live session, quick question:** the built-in cross-session messages keep working
  and are fine. Use the mailbox for anything cross-machine, cross-person, to a project or room, or
  sent later.

## Receiving: hooks

- `UserPromptSubmit`: read all of the session's inboxes (session, project group, rooms, and the
  person inbox if this is a session the user is typing in); add unread mail as `additionalContext`
  with the tier headers (template: `.claude/hooks/cfn-night-mode-inject.sh`).
- `PostToolUse`: same, throttled to one check per 15 seconds per session, so mail reaches a busy
  agent mid-turn. **Skipped inside helpers (subagents):** the hook checks only when its input has no
  `agent_id`, so a helper can never take and acknowledge project mail meant for the main session.
- `Stop`: if `ask` or `reminder` mail arrived during the turn, block the stop once so the agent
  reads it before going idle. Never blocks when `stop_hook_active` is set, so it cannot loop.
- At most 20 messages per injection; the rest wait for the next check.
- Hooks must never break a session: 2-second timeout; on any error they stay silent and write one
  line to a local log.

## Waking idle sessions: `mailbox-watch`

- One watcher per machine (Mac and server): blocking reads across the inboxes of sessions registered
  on that machine (two connections: one for plain inboxes and rooms, one for project groups, since
  one blocking call cannot mix the two). When an idle tmux-hosted session gets `ask` or `reminder` mail, it types
  "You have mail: run /mail read" into the pane, the same way as `fleet nudge` (`cmd-nudge.sh`).
- Also runs the lifecycle jobs (send-later, bounce, expiry, project reassignment).
- Sessions not in tmux get their mail on their next turn. That is a known limit.

## Config (the local-versus-cloud fix)

- One file per machine: `~/.config/cfn-mailbox/env` (chmod 600) with `MAILBOX_HOST`,
  `MAILBOX_PORT`, `MAILBOX_USER`, `MAILBOX_PASS`, `MAILBOX_OWNER`, and `MAILBOX_PUBLIC` (the
  addresses outsiders may reach, default `me`). No defaults in code; TLS always on.
- `MAILBOX_CONTACTS` lists other people's public addresses (no cross-person directory reads).
- `mailbox.sh doctor` prints which Redis it is talking to (host, never the password), the owner,
  round-trip time and whether auth works.
- The admin (default) Upstash credential stays with the user only, in claude-flow-novice-src `.env`
  as `UPSTASH_MAILBOX_ADMIN_URL`. Agents never use it; it is only for creating ACL users.

## Phases

1. **Core (TDD).** `mailbox.sh` send/read/who/log/doctor, address parsing, key building, the config
   loader, hop and rate limits. Unit tests use a fake `redis-cli` on PATH that records commands.
   One live check (doctor plus a send/read round trip on `test:` keys deleted by name afterwards)
   runs only when the config exists; otherwise it prints SKIP with the reason and its own exit code.
   Probe the ACL design live: create a throwaway user with the `from:` pattern and assert it cannot
   read another owner's inbox or write a key not ending in its own `from:`.
2. **Setup on both machines.** Config on the Mac and the VPS; `redis-tools` from apt on the VPS
   (added to `vps-rebuild.sh` packages and `check`).
3. **Hooks and trust tiers.** Inbox checks, tier headers, directory heartbeat. Tests feed hook JSON
   on stdin and assert output shape, tier from key, and the header on every message.
4. **Watcher and lifecycle.** Wake idle sessions, project groups with reassignment, send-later,
   bounce, expiry, lifecycle lock. Systemd user service on the VPS; manual start on the Mac (a
   LaunchAgent would need the user's approval). Tests with a fake tmux and a fake clock.
4b. **Hardening (from the gg-all-projects Operations review, 2026-10-16; see that section). Done
   2026-10-16 (offline suites green, including all three run concurrently).**
   Receiver-side public-address policy, verified routing fields, stable message ids with receiver
   de-duplication, crash-safe send-later and bounce, spool trimmed only by the process that prints,
   watcher-typed prompts never clear the taint flag, private spool files. Adversarial tests:
   direct Redis injection to a private address, forged `from`/`to`, process death between claim
   and write, write succeeded but the reply was lost, kill between inner and outer hook output.
5. **Fleet, all workers at once (user, 2026-10-16: one path for every worker, for consistency and
   faster iteration; models need the internet anyway).** See "Stage 5 design" below.
   Fleet workers on every machine report and receive instructions through the mailbox. Roster,
   brief and handoff files stay the record of truth; mail carries short messages that point at
   them. The old routes (ssh polling of server workers, tmux nudges and same-machine session
   messages to Mac workers) are removed once the mailbox path is green.
6. **gg-all-projects (mesh).** Room `michael/r/gg-all-projects`, project addresses for each area,
   and a short note in that repo on when to use which. Watch the log for a week for loops.
7. **Steve (outside).** His ACL user, his public addresses, a one-page setup for his machine, and a
   test exchange: his agent to `michael/me` delivered, his agent to a non-public address bounced.

## Stage 5 design (fleet, all workers)

- **Role names.** `mailbox.sh claim <name>`: a session takes a stable address (for example
  `michael/s/mdtwii-master`) that survives restarts. Stored as `alias:<owner>:<name>` =
  `{session_id, host, claimed_at}` with a heartbeat; refused while another live session holds it
  (seen in the last 10 minutes); `release` gives it up. The hook reads the local alias for its
  session id, so the claimed name is used for reading, sending and the directory.
- **Worker names include the project:** `<project>-<ws>` (`mdtwii-ws445`), set by `fleet spawn`
  via `MAILBOX_SESSION`, because WS ids repeat across projects.
- **Coordinator secret.** `fleet spawn` generates a per-run secret, writes it only into the
  worker's brief, and keeps it in the roster run dir. Coordinator messages carry it in a field;
  the receiving hook compares it with the brief's copy and only then labels the message
  `coordinator`. Without it the message is `teammate`. Never logged or echoed in mail text.
- **Message types (kind stays the same; a `fleet` field names the type):** worker to master:
  `status`, `handoff` (points at `handoffs/<file>`), `claim-request`, `done`, `blocked`; master to
  worker: `assign`, `answer`, `stop`. Bodies are short and name files, never paste them.
- **Coordinator authority is fleet-internal.** It lets a worker act within its brief, as today. It
  is not human approval and never authorizes anything outside the brief (no push, no deploy, no
  spending beyond the brief).
- **Fallback.** If Upstash is unreachable, `fleet watch` reports `MAILBOX-DOWN` and the master can
  still read roster and handoff files directly; nothing in the files depends on mail.
- **Cross-project.** Any project's sessions can reach any other project's: project address
  (`michael/p/claude-flow-novice-src`, exactly one live session there takes it), a claimed role
  name, or the project room. Same-owner mail is `teammate`: a request, never permission. The
  skill says to use the project address unless in a live back-and-forth.
- **Tests:** claim and release races, role mail surviving a session restart, worker names unique
  across projects, coordinator label only with the right secret, a forged coordinator message
  labelled teammate, fleet roster updated from mail, `MAILBOX-DOWN` fallback.

## Operations integration review (gg-all-projects, 2026-10-16)

Source: `~/Projects/gg-all-projects/planning/agent-inbox/MAILBOX-INTEGRATION-REVIEW.md` (a Codex
review of d0fc1b8d). Every code-level claim was checked against the source and holds. Split:

**CFN builds (stage 4b, done 2026-10-16):**
1. **Receiver-side public addresses.** `MAILBOX_PUBLIC` is loaded but never enforced on read: read,
   group setup, the watcher and lifecycle build outside-owner keys for every address. One shared
   receiver policy: outside owners' keys are built only for the receiving owner's public addresses.
   Messages whose `to` does not match the key, or whose `from` owner differs from the key's
   `from:<owner>`, are quarantined (logged with metadata only, never shown to a model).
2. **Stable message ids.** Every message gets a `msg_id` (random, set by the sender, unchanged on
   retry). Receivers drop a `msg_id` they already delivered (local delivered-set per session, kept
   7 days). Delivery is "at least once, shown once"; the docs stop implying exactly-once.
3. **Crash-safe send-later.** Replace remove-then-deliver with claim-then-deliver:
   `SET claim:<owner>:<msg_id> <host> NX EX 120`, XADD with the stored `msg_id`, then ZREM. A crash
   anywhere repeats the XADD, which the receiver de-duplicates.
4. **Crash-safe bounce.** Write the bounce first (with its own stable `msg_id`), then set the done
   marker; a repeat is de-duplicated by the receiver.
5. **Hook output window.** The inner process no longer trims the spool; it returns the rendered
   ids, and the outer process trims only after it has printed.
6. **Taint survives watcher prompts.** A prompt that equals the watcher's nudge text does not clear
   the taint flag; only a human-typed prompt does.
7. **Private local files.** Cache dir 700, spool and state files 600.
8. **Docs:** the hook guard is advisory, not an access boundary; mail delivery is not acceptance of
   work; never put secrets, cookies, tokens or private source in mail; the public-address rule is
   enforced by the receiver (SKILL.md "Who may write to which address").

**How 4b was built (for the next reader):** one receiver policy, `receiver_keys` in `mailbox.sh`,
used by read, join, the watcher's nudge pass and the bounce scans (expiry cleanup still deletes
every owner's copy). Quarantine reasons are `to-mismatch` and `from-owner-mismatch`. `msg_id` is 16
hex from `/dev/urandom`; send-later members store it at `send --at` time (members queued earlier
get a stable `l-<cksum>` id); bounces use `b-<cksum of key|id>`. The ACL gains `~claim:<owner>:*`.
The hook sources `mailbox.sh` for `NUDGE_TEXT`, `CACHE_DIR` and `ensure_cache_dir`. The hook's
fallback watchdog now uses the wall clock, which was the likely cause of the 12 s timing failure.

**Operations builds (gg-all-projects), not CFN:** approvals, standing permissions, budgets, the
versioned assignment envelope, durable request/outbox/inbox receipts, identity mapping from mailbox
owner to Operations account, and private result access. The mailbox only carries an opaque
assignment reference and wakes the recipient; Operations re-checks permission at launch, at each
tool boundary and at result retrieval. Delegated product work runs in the restricted Operations
runner, not in a general mailbox session.

**Agreed limits (documented, not fixed):** sessions of one owner share one Redis login, so they are
not separate secure identities; a sender can delete its own sent copies; consumer groups give
at-least-once delivery, not exactly-once execution.

## Before building

- The user creates the Upstash account (fixed $10/month plan) and one database in US West, and puts
  the admin URL in `.env`.
- No firewall change is needed on the VPS (all traffic is outbound to Upstash).

## Assumptions (testable)

- `redis-cli --tls` from Homebrew (Mac) and Ubuntu `redis-tools` (VPS) both connect to Upstash.
- Upstash supports `XREAD BLOCK`, consumer groups (`XREADGROUP`, `XACK`, `XAUTOCLAIM`) and sorted
  sets over TCP with `redis-cli`.
- Upstash ACL key patterns with a mid-pattern wildcard (`~mbx:*:from:steve`) fence writes and reads
  as expected, and the wildcard matches across `:` separators (phase 1 probe).
- Hook input includes `agent_id` when the hook fires inside a subagent, and `stop_hook_active` on
  Stop.
- The $10 fixed plan really has unlimited commands (check the pricing page at sign-up).
- `UserPromptSubmit` and `PostToolUse` can return `additionalContext`, and a `Stop` hook can block
  once with a reason, in the Claude Code version installed on both machines.
- A hook check to Upstash US West adds under 300 ms p95 to a turn from the Mac and the VPS.
- Fleet worker sessions on the VPS run in tmux, so the watcher can wake them.
- `cfn-task` gives each session a current-task line usable as the directory summary.

## Risks

- **Prompt injection between people:** the tier is computed from the key, not the text, and outside
  mail is information only. Tests assert both.
- **Teammate overreach in mesh:** a same-owner peer asks for something risky. Same rule as built-in
  cross-session messages: requests never grant permissions and never count as the user's approval.
- **Loops:** hop limit, rate limits, and no wake for `fyi`/`bounce`/short replies.
- **Password leak:** anyone with a person's mailbox password can send as that person. Passwords
  live only in the chmod-600 config and are rotated with `ACL SETUSER` if exposed.
- **Upstash down:** hooks degrade silently, `doctor` says why, fleet keeps polling.
- **Mail flood:** per-inbox cap (500), body cap (4 KB), at most 20 messages per injection.

## Not in scope

- Real-time chat UI and Slack bridge (person-inbox push to phone/Slack is a later add-on).
- Messaging sessions that are not running Claude Code.
