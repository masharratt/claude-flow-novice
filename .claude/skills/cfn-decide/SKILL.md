---
name: cfn-decide
description: "DECISIONS phase. Extract every meaningful tradeoff fork from the spec, force blocking forks to the user before the plan locks, write a decision register, score design alternatives, and append resolved decisions to the decision log so future plans can query them. Use after cfn-spec, in parallel with cfn-pseudo."
version: 1.0.0
tags: [planning, megaplan, decisions, tradeoffs, decision-log, alternatives]
status: production
---

# CFN Decide Skill (MegaPlan DECISIONS Phase)

**Purpose:** Surface the tradeoff forks hidden in a spec and resolve them BEFORE the plan locks. Every meaningful fork (auth method, sync vs async, storage, build-vs-buy, data model, UX pattern, third-party vs native) gets named, classified, and either recommended or pushed to the user. Resolved decisions are written to the decision log so future plans stop re-litigating settled questions.

**Phase:** DECISIONS. DAG level 3. Runs in parallel with `cfn-pseudo`. Always active (not conditional). Consumes the spec, feeds `cfn-data`, `cfn-arch`, and `/write-plan`.

**Closes the loop:** the decision log is currently queried at plan entry (cfn-megaplan Step 0, cfn-plan-review Phase 1) but never written during planning. This phase is the writer.

## When to Use

- Any MegaPlan run (orchestrator spawns it at L3, always).
- Standalone: a spec exists and you need to lock tradeoff decisions before writing the plan.
- Re-run when the spec changes a fork (new storage target, new auth requirement).

Skip only if the orchestrator's tier profile sets `decide` to `skip` (it does not in any shipped tier).

## Input

`planning/SPEC_<slug>.md` (required). Read it fully before extracting forks. If multiple `SPEC_*.md` exist, use the one whose slug matches; never regenerate the slug differently.

Optional context the orchestrator may pass: prior decision-log hits for these entities (inject as "prior resolution" rows, status RESOLVED, so you do not re-ask a settled fork).

## Output

1. `planning/DECISIONS_<slug>.md` — the decision register (table + any alternatives panel).
2. Structured records written to the decision-log SQLite store via `record.sh` for every RESOLVED decision (see Phase 5).

## Tier behavior (from orchestrator Directive)

| Tier | Directive | Behavior |
|---|---|---|
| mvp | `light` | Blocking forks ONLY. Drop the alternatives panel and all non-blocking forks. Register holds blocking rows only. |
| beta | `full` | All forks, blocking and non-blocking. No alternatives panel. |
| enterprise | `full` + extras `[alternatives_panel]` | All forks PLUS Phase 4 alternatives panel on the single biggest design fork. |

The orchestrator passes `Directive:` and `Include extras:`. Honor them. `drops` may list `alternatives_panel` and `non_blocking_forks` for `light`.

## Global rule (non-negotiable)

Decisions surfaced via `AskUserQuestion` (the orchestrator makes the actual call; you produce the payloads) MUST:

- Be ONE decision per question. Never bundle two forks into one question.
- Use plain English. No jargon, no internal acronyms in the question or options.
- Flag the best long-term-maintenance option `(Recommended)`. Best for maintenance, not the quick fix.
- Only surface forks with MEANINGFUL consequence. Do not ask "should I commit" or "tabs or spaces".
- Order of implementation is NOT a user decision. You decide it. Never surface it.

## Protocol

### Phase 1: Fork extraction

Scan the spec for decision points. Walk these categories explicitly:

| Category | Look for in spec | Tie-in |
|---|---|---|
| Auth method | login, session, token, role, permission FRs/NFRs | floor: auth_boundaries |
| Sync vs async | "immediately", queue, background job, webhook, long-running | concurrency design (cfn-data/arch) |
| Storage choice | persisted state, table, cache, blob, file | cfn-data |
| Build vs buy / lib vs hand-roll | parsing, crypto, date math, validation, any "system SHALL compute" | **cfn-arch build ladder** (YAGNI -> reuse -> stdlib -> native -> installed dep -> one line -> new dep last) |
| Data model | entity shape, relationships, normalization, enum vs lookup | cfn-data |
| UX pattern | how a user performs an action, control choice, flow shape | cfn-ux affordance map |
| Third-party vs native | external API vs platform primitive, vendor lock-in | build ladder + cost/provider rules |

For each fork found, classify:

- **BLOCKING** — the plan cannot proceed without resolving it. Different choices produce materially different architecture, data model, or component contracts. cfn-data / cfn-arch would build the wrong thing if left open.
- **non-blocking** — a default is safe; the choice is reversible cheaply later. Record it RESOLVED with your recommendation as the rationale; do not ask the user.

**Blocking litmus (mechanical).** Classify BLOCKING iff reversing the choice later would require ANY of:

- a schema migration,
- a change to an API contract another component consumes,
- edits in 3+ files,
- re-doing work from a downstream phase (data/arch/ux).

If none apply, it is non-blocking: pick the recommendation and RESOLVE it yourself.

**Per-category completeness.** Emit one register row per category in the Phase 1 table even when the row is `no fork found`. A category with no row means it was not walked, and the register is rejected.

**Zero-fork sanity check.** A spec with `db: yes` or `frontend: yes` build flags that yields zero forks is suspicious; re-walk the category table before returning.

Security carve-out: a build-vs-buy fork touching crypto, auth, token/JWT parsing, or input sanitization is NOT a real fork. The audited dependency wins. Record it RESOLVED, rationale "security floor, never hand-roll", do not surface.

### Phase 2: Decision register

Write the register as a table in `planning/DECISIONS_<slug>.md`:

| id | decision | options | tradeoff (plain English) | recommendation | status | rationale |
|----|----------|---------|--------------------------|----------------|--------|-----------|

Rules:
- `id` = `D-1`, `D-2`, ... stable across re-runs.
- `status` = `OPEN` (blocking, needs user) or `RESOLVED` (you decided, or user answered, or prior-log hit).
- Every RESOLVED row MUST have a non-empty `rationale`. A resolution with no rationale is rejected.
- `recommendation` names one option and why it is best for long-term maintenance.
- Blocking forks start `OPEN`. Non-blocking forks start `RESOLVED` with recommendation = choice.
- In `light` tier, non-blocking rows are dropped entirely (not written).

### Phase 3: User surfacing (produce AskUserQuestion payloads)

For every `OPEN` (blocking) decision, emit one `AskUserQuestion` payload. The orchestrator batches and calls them; you only build the payloads.

Payload per decision:

```
question: "<plain-English fork, no jargon>"
header:   "<short label, e.g. Storage>"
options:
  - label: "<option A>"        description: "<plain-English consequence>"
  - label: "<option B> (Recommended)"  description: "<why best long-term>"
  - label: "<option C>"        description: "<consequence>"
```

One decision per payload. The `(Recommended)` flag goes on the best long-term-maintenance option. After the orchestrator returns answers, flip each answered row to `RESOLVED`, set `rationale` to "user chose <option>: <one-line reason>".

If a fork is blocking but you have a genuinely dominant recommendation with no real tradeoff (escape hatch), resolve it yourself, mark RESOLVED, state the rationale, and do not surface. Reserve user questions for forks with real consequence.

### Phase 4: Alternatives panel (enterprise extra only)

Run only when `Include extras:` contains `alternatives_panel`. Pick the SINGLE biggest design fork (widest blast radius across data + arch). Lay out 2-3 whole approaches end to end. Score each:

| Approach | Effort (1-5) | Risk (1-5) | Maintainability (1-5) | Net | Notes |
|---|:--:|:--:|:--:|:--:|---|

- Effort/Risk: lower is better. Maintainability: higher is better. `Net` = maintainability - risk - effort (rank only, not gospel).
- Recommend one approach. Then graft the best ideas from the runners-up into it explicitly ("take X's retry model, keep Y's schema").
- The recommended approach becomes (or updates) the corresponding `D-n` row in the register.

### Phase 5: Decision-log write (closes the loop)

Two sinks, both written. They serve different readers and neither is optional.

**Sink 1, repo artifact (`planning/DECISIONS_<slug>.md`):** produced in Phase 2, updated by Phase 4 when the alternatives panel runs. Versioned with the code, survives forever, human-readable. This is the canonical register.

**Sink 2 — structured decision store (`decision-log` SQLite):** for EVERY `RESOLVED` decision, call the structured write API so future plans query settled forks across sessions, separate from conversation noise.

```bash
DL="${HOME}/.claude/skills/decision-log"
# one call per resolved decision; --blocking when the fork blocked the build
"$DL/record.sh" --slug "<slug>" --id "D-1" \
  --title "<decision, one line>" \
  --chosen "<chosen option>" \
  --rationale "<why, plain English>" \
  --alternatives "<rejected options + one-line why-not each>" \
  [--blocking] [--supersede D-0]
# project + timestamp auto-derive (git toplevel basename, UTC now).
```

Rules:
- Write AFTER user answers return, so user-chosen options are captured, not recommendations.
- `--blocking` for forks that were pushed to the user (the OPEN rows). Omit for self-resolved.
- Re-running is safe: `record.sh` upserts on `(project, slug, decision_id)`, no duplicates.
- If a later plan reverses a decision, the new record uses `--supersede <old-id>` so the old one is marked `superseded`, not deleted (audit trail preserved).

Readers: `cfn-megaplan` Step 0 and `cfn-plan-review` Phase 1 query both — the FTS message index (conversation context) AND `decisions.sh search "<entities>"` / `decisions.sh list --slug <slug>` (the structured register). Settled forks surface as RESOLVED prior-resolution rows so they are not re-asked.

## Concrete example register

`planning/DECISIONS_realtime_notifications.md` (beta tier, `full`):

| id | decision | options | tradeoff | recommendation | status | rationale |
|----|----------|---------|----------|----------------|--------|-----------|
| D-1 | How are notifications delivered to the browser | WebSocket; Server-Sent Events; short polling | WebSocket is two-way but needs sticky sessions and more infra. SSE is one-way, simpler, reconnects natively. Polling is trivial but laggy and chatty. | SSE (Recommended) | OPEN | needs user: infra appetite vs latency |
| D-2 | Where unread-state is stored | Postgres column; Redis; in-memory | Postgres survives restarts and is queryable. Redis is fast but another dependency. In-memory loses state on deploy. | Postgres | RESOLVED | non-blocking, spec already requires a notifications table; reuse it |
| D-3 | Markdown sanitizer for notification body | hand-roll regex; `dompurify` | hand-roll risks XSS holes | `dompurify` | RESOLVED | security floor, never hand-roll sanitization |
| D-4 | Delivery timing | send inline on event; queue + worker | inline is simple but blocks the request and drops on crash | queue + worker | OPEN | needs user: added worker infra vs reliability |

Footer: `Log: planning/DECISIONS_<slug>.md (repo) + decision-log SQLite via record.sh (RESOLVED rows D-2, D-3). Query: decisions.sh list --slug <slug>.`

AskUserQuestion payloads produced: D-1 and D-4 only (the two OPEN rows), one question each, SSE and queue flagged `(Recommended)`.

## Return to orchestrator

```
artifact: planning/DECISIONS_<slug>.md
summary (3 lines):
  - <N> forks extracted (<b> blocking, <n> non-blocking); <r> resolved, <o> open
  - alternatives panel: <ran on D-x | skipped (tier)>
  - decision log: <k> RESOLVED records written via record.sh (SQLite) + register in planning/DECISIONS_<slug>.md
needs user: [D-1, D-4]   # the OPEN blocking decisions, with their AskUserQuestion payloads attached
```

If `needs user` is non-empty, the orchestrator must call `AskUserQuestion` and feed answers back before advancing past L3.

## Anti-Patterns

- **Bundling decisions** — two forks in one question. One decision per question, always.
- **Asking trivial decisions** — "should I commit", "tabs vs spaces", order of implementation. Only meaningful forks reach the user. You decide implementation order.
- **Deciding silently on a meaningful fork** — picking WebSocket vs SSE yourself when it materially changes infra. Blocking forks go to the user.
- **Never writing the log** — leaving the loop open. Every RESOLVED decision is appended. This is the whole point of the phase.
- **RESOLVED with no rationale** — a resolution must say why. Empty rationale is rejected.
- **Hand-rolling security to avoid a dependency** — crypto/auth/JWT/sanitization forks are not forks. The audited dep wins, RESOLVED.
- **Running the alternatives panel outside enterprise** — it is an enterprise extra. Do not add it to mvp/beta.
- **Flagging the quick-fix option as Recommended** — the flag is for long-term maintenance, not speed.

## Related

- Upstream: `cfn-spec` (produces the SPEC input)
- Parallel: `cfn-pseudo` (same DAG level)
- Downstream: `cfn-data`, `cfn-arch` (consume resolved decisions), `/write-plan`
- Build ladder reference: `cfn-arch` (build-vs-buy fork classification)
- Log consumers: `cfn-plan-review` Phase 1, `cfn-megaplan` Step 0 (query prior resolutions)
- Orchestrator: `cfn-megaplan` (spawns this at L3)
- Backlog: `docs/PLANNING_PIPELINE_GAPS.md` (G04, G24, decision-log write loop)
