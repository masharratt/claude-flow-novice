---
name: cfn-ops
description: "Operations-design phase. Design the production surface UP FRONT: threat model (STRIDE), observability (logs/metrics/traces), rollout (flags/canary), success metrics/KPIs, failure modes (FMEA), capacity/cost, rollback rehearsal, runbook. Use in cfn-megaplan for beta+ tiers so 'how it runs in prod and how we know it worked' is designed, not review-checkboxed."
version: 1.0.0
tags: [planning, operations, observability, threat-model, rollout, canary, metrics, rollback, runbook, megaplan]
status: production
---

# CFN Ops Skill (MegaPlan Operations-Design Phase)

**Purpose:** Design the operational surface of a feature BEFORE it ships, not after it breaks. Threat model, observability, rollout, success metrics, failure modes, capacity/cost, rollback, runbook — authored as design artifacts, not caught as review checkboxes. This is the "blind past merge" fix (PLANNING_PIPELINE_GAPS root cause 3): a plan must think through how the thing runs in production and how we will know it worked.

**Phase:** Operations-design. DAG level 6 in `cfn-megaplan`. Runs in parallel with `cfn-design` and `cfn-test-plan`.

**Owns gaps:** G10 (threat model), G11 (observability), G12 (rollout), G14 (failure-mode), G18 (success metrics), G23 (capacity/infra), G27 (rollback rehearsal), G28 (runbook), G31 (cost model).

## When to Use

- Auto-invoked by `cfn-megaplan` at L6 for **beta** and **enterprise** tiers.
- **mvp tier SKIPS this phase entirely.** The orchestrator does not spawn cfn-ops at mvp (mvp profile sets `ops` to `light` with everything dropped, and proves correctness only — no ops surface). If you are reading this at mvp, stop: ops design is out of scope for a throwaway.
- Standalone for ops review of an existing feature heading to production.

Active for beta+ is gated by **tier**, not a build flag. It always runs at beta+ even for a pure-backend feature, because every feature has a production surface (logs, rollout, failure behavior, rollback).

## Input

Required:
- `planning/<slug>/SPEC_<slug>.md` — success criteria, NFRs, audience.
- `planning/<slug>/ARCH_<slug>.md` — components, integration points, failure-mode inventory, cross-cutting (observability/auth hooks), data-flow diagram.

Conditional:
- `planning/<slug>/DATA_<slug>.md` — present only if the build has a `db` flag. Source for tables touched, RLS, PII, retention (feeds threat model + rollback + capacity).

Refuse to run if SPEC or ARCH is missing or still `draft` with unresolved `[OPEN]` items. Ops design built on an unstable arch is wasted.

## Tier directives (what the orchestrator passes)

The orchestrator passes `Tier`, `Directive`, `extras`, `drops`. Resolve each protocol phase against the tier:

| Phase | mvp | beta (light core) | enterprise (full) |
|---|:--:|---|---|
| 1. Threat model | SKIP | beta floor: EVERY externally-reachable data-flow edge gets >=1 STRIDE row with at minimum S, T, and I evaluated; any skipped category gets "n/a: <reason>" (reason required) | full STRIDE: every data-flow, all 6 categories, control + residual risk |
| 2. Observability | SKIP | full: decision-point log lines + metrics + the on-call query | full + dashboards + alert thresholds |
| 3. Rollout | SKIP | flags: feature flag + staged % | flags + canary (wire `cfn-canary`) + canary criteria |
| 4. Success metrics / KPIs | SKIP | full: prod-acceptance metrics | full + per-segment + guardrail metrics |
| 5. Failure-mode / degradation | SKIP | light: per critical dep, name dep-down behavior + timeout | full FMEA: severity x likelihood x detection, circuit breakers |
| 6. Rollback rehearsal | SKIP | full: tested undo steps | full + dry-run evidence |
| 7. Capacity / infra / cost | SKIP | beta floor: >=1 named-constant budget row, plus the `--budget` row whenever an LLM is in the loop | full: topology, scaling, cost-per-call, token model |
| 8. Runbook / on-call | SKIP | light: symptoms → first action | full on-call doc with escalation |

beta `extras`: `observability, rollout, metrics, rollback_rehearsal`. beta `drops`: `threat_full, capacity_full, runbook_full` (these run light, not off). enterprise `extras`: `threat, observability, rollout, canary, metrics, failure_mode, rollback_rehearsal, capacity, cost_model, runbook` (all full).

**Security floor (never scales down, from megaplan floor):** regardless of tier, if the feature serves HTTP, the rollout MUST confirm security headers (HSTS, CSP, X-Frame-Options) are applied via the shared middleware, not per-route. If the feature calls any LLM in a loop, capacity MUST name a `--budget=<usd>` cap. Anthropic API calls are banned in project code — if the design references an LLM provider, it must not be `anthropic:*` (per global CLAUDE.md replacement map). Flag any violation as `[OPEN]`.

## Protocol

### Phase 1: Threat model (beta light / enterprise full STRIDE) — G10

Walk each data-flow edge from the ARCH data-flow diagram. For each, enumerate the relevant STRIDE categories and name the **control** that mitigates each. Security stops being a checklist and becomes a per-edge design.

STRIDE = Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.

Output table (one row per threat, grouped by data-flow):

```
| Data flow                  | STRIDE | Threat                              | Control                                         | Residual |
|----------------------------|--------|-------------------------------------|-------------------------------------------------|----------|
| Client -> POST /api/orders | S      | Forged caller identity              | JWT verify in shared auth middleware            | low      |
| Client -> POST /api/orders | T      | Tampered order total in transit     | TLS + server recomputes total from line items   | low      |
| Client -> POST /api/orders | I      | Order leaks across tenants          | RLS policy tenant_id = auth.tenant (DATA phase)  | low      |
| Client -> POST /api/orders | D      | Flood of order writes               | Per-tenant rate limit 100/min (ARCH §6)         | med      |
| Worker -> Postgres         | R      | No audit of who changed status      | append-only status_events row per transition    | low      |
```

beta floor: EVERY externally-reachable data-flow edge gets >=1 STRIDE row, and S, T, and I are each evaluated per edge at minimum. A category skipped on an edge gets an explicit "n/a: <reason>" cell; the reason is required, never blank. enterprise: every edge, all 6 categories, plus residual risk and an owner for any `med`/`high` residual.

Cross-reference: HTTP edges must confirm the security-headers middleware (HSTS/CSP/X-Frame-Options). DB edges must reference the RLS policy from `DATA_<slug>.md`. Never hand-roll auth/crypto/token parsing here — point at the vetted middleware.

### Phase 2: Observability design (beta+) — G11

Design what gets emitted at every decision point so an on-call engineer can answer "what happened" without redeploying. Logging is designed here, not added later.

**Log lines at decision points.** For each branch where the system makes a consequential choice (auth allow/deny, gate pass/fail, retry, abort, fallback fired, payment captured), specify the exact structured log line. Every line carries correlation IDs: `request_id`, the primary `entity_id`, and `tenant_id` where multi-tenant.

Log-line spec format (each line carries `OBS-id`, `criticality`, and `verify`):

```
OBS-id: OBS-1
event: auth.deny
level: warn
criticality: alert
verify: required
when: JWT verify fails OR tenant mismatch on POST /api/orders
fields: { request_id, user_id, tenant_id, reason: "expired"|"tenant_mismatch"|"missing", route }
PII: user_id only (no email/token in line) — redact token as [REDACTED]
```

Enumerate at minimum: every allow/deny, every gate pass/fail, every retry+abort, every fallback/degradation trigger, every external-call failure.

**Metrics.** Name each metric, its type (counter/gauge/histogram), labels, the SLO it serves, and its `OBS-id`, `criticality`, and `verify`:

```
| OBS-id | Metric                      | Type      | Labels            | SLO / use                        | Criticality (alert|slo|core-signal|diagnostic) | Verify (required | exempt: <reason>) |
|--------|-----------------------------|-----------|-------------------|----------------------------------|-----------------------------------------------|--------------------------------------|
| OBS-2  | orders_created_total        | counter   | tenant, status    | success-rate KPI (Phase 4)       | slo                                           | required                             |
| OBS-3  | order_write_latency_seconds | histogram | route             | p95 < 300ms                      | slo                                           | required                             |
| OBS-4  | order_dep_down_total        | counter   | dep               | alert when > 0 over 5m           | alert                                         | required                             |
| OBS-5  | order_debug_trace           | counter   | route             | dev diagnostics only             | diagnostic                                    | exempt: debug log, owes no test      |
```

**Criticality rule (verbatim):** verify-required iff the signal backs an alert threshold or on-call query, defines a Phase 4 KPI/guardrail, or is the runtime-observed signal of a [core] FR. Debug logs never owe tests.

Ops names signals (`OBS-n`), never AC ids: `cfn-test-plan` Phase 3 maps each `verify: required` OBS-n to an AC that asserts the signal fires for the test's own input. `OBS-id` is the greppable token and the key behind Bar A counters `obs_required_total/obs_required_mapped`.

**Traces.** Name the span boundaries for the primary flow (entry span → external-call child spans) so a slow request is attributable to a stage.

**The on-call query.** Write the EXACT query an on-call would run for the most likely incident. Not "check the logs" — the literal query:

```
# "orders failing for tenant X in the last 15m"
log query: event="order.write.fail" AND tenant_id="X" AND ts > now-15m
          | stats count by reason
```

This query is part of the deliverable, not a suggestion.

### Phase 3: Rollout (beta flags / enterprise canary) — G12

No feature reaches 100% of traffic on deploy. Design the staged path.

- **Feature flag:** name, default (off), kill-switch owner, where evaluated (server-side). The flag wraps the new code path; old path stays live behind it.
- **Staged percentages:** e.g. internal → 1% → 10% → 50% → 100%, with the dwell time and the go/no-go check at each stage.
- **Canary (enterprise):** wire `cfn-canary` — it polls the deploy URL for 10 minutes post-ship checking errors, latency regression, availability. State the canary pass criteria as binary checks:

```
| Stage | % traffic | Dwell | Promote when (binary)                              |
|-------|-----------|-------|----------------------------------------------------|
| canary| 1%        | 10m   | error_rate < 0.5% AND p95 within 10% of baseline   |
| ramp  | 10%       | 1h    | order_dep_down_total == 0 AND success KPI stable   |
| full  | 100%      | —     | ramp green, no rollback triggered                  |
```

Security floor: confirm the new route serves the shared security-headers middleware BEFORE the canary opens (a flagged route that bypasses middleware is a regression).

### Phase 4: Success metrics / KPIs (beta+) — G18

Tests-pass is not feature-works. Define how we know in PRODUCTION that the feature did its job. Acceptance-in-production, expressed as a measurable query, not prose.

```
| KPI                         | Definition (query)                                  | Target          | Window |
|-----------------------------|-----------------------------------------------------|-----------------|--------|
| Order completion rate       | orders_created_total{status=ok} / attempts          | >= 95%          | 7d     |
| Median time-to-confirm      | histogram_quantile(0.5, order_confirm_latency)      | < 2s            | 24h    |
| Guardrail: error budget     | 5xx on /api/orders / total                          | < 1% (else roll)| 1h     |
```

Each KPI maps back to a SPEC success criterion. If a success criterion has no measurable prod KPI, flag it `[OPEN]` — we would ship blind to whether it worked. enterprise adds per-segment KPIs and explicit guardrail metrics that trigger rollback.

### Phase 5: Failure-mode / degradation (beta light / enterprise FMEA) — G14

For each dependency the feature relies on (from ARCH external integrations + failure-mode inventory), design what happens when it is down or slow. The system must degrade, not collapse.

beta light — name behavior per critical dep:

```
| Dependency   | Down behavior                         | Timeout budget | Fallback                    |
|--------------|---------------------------------------|----------------|-----------------------------|
| Postgres     | reject writes, 503 + Retry-After      | 2s connect/5s  | none (hard dep) — queue?    |
| Payment API  | mark order pending, async retry       | 3s             | retry queue, notify later   |
| Redis cache  | bypass cache, read DB                 | 200ms          | DB read (slower, correct)   |
```

enterprise full FMEA — add columns: Severity (1-5), Likelihood (1-5), Detection (how the observability from Phase 2 catches it), RPN = S×L×(6-D), and a circuit-breaker spec (threshold, open duration, half-open probe) for each external call. Order rows by RPN; anything high gets a designed mitigation, not a TODO.

Timeout budgets must sum to less than the request's overall deadline — state the budget so cascading timeouts can't blow the SLA.

### Phase 6: Rollback rehearsal (beta+ tested) — G27, G50

"Revert the migration" is a wish, not a procedure. Write the actual undo steps AND the evidence they were exercised (dry-run in staging, or a documented reasoning trace if no staging).

**Executable rollback evidence (db flag + reversible migration).** When the `db` build flag is set AND `DATA_<slug>.md` §5 declares a reversible migration, the rehearsal evidence is not reasoning: it is the `cfn-migration-rehearsal` invocation, cited verbatim from DATA §5's line:

```
CFN_SCRATCH_DATABASE_URL=<scratch> ./.claude/skills/cfn-migration-rehearsal/execute.sh --up <NNNN.up.sql> --down <NNNN.down.sql>
```

- Reasoning-only evidence is acceptable ONLY when no scratch DB is possible; state why and emit a WARN row so the gap is visible, never a silent downgrade.
- An irreversible migration carries `n/a: <reason from DATA §5>` (the same one-line reason DATA §5 recorded), not a rehearsal command.
- The rehearsal never runs against `DATABASE_URL` — the skill already refuses any prod look-alike and requires `CFN_SCRATCH_DATABASE_URL`. This is design-side only; the loop executes it.

This is the ops-side meaning of the existing `rollback_rehearsal` profile token (G50) — no new ops token is added; the token's meaning is extended here. Phase 2's OBS work is likewise the extended meaning of the existing `observability` token (G49).

```
Trigger: guardrail error budget breached (Phase 4) OR canary fails (Phase 3).
Steps (tested):
  1. Flip feature flag `orders_v2` -> off (instant; no deploy). Verifies: old path serves, new code dormant.
  2. If schema changed: run down-migration NNNN_orders_v2_down.sql. Pre-checked: down migration is reversible, drops only new columns, touches no existing rows (WHERE-scoped, no unscoped DELETE).
  3. Confirm: orders_created_total resumes on old path; error budget recovers within 5m.
Data safety: down-migration MUST NOT drop columns with data the old path needs. If new rows were written under the new schema, state the reconciliation step.
Rehearsal evidence: dry-run in staging on <date> / OR reasoning trace why each step is safe.
```

Floor: any rollback that touches the DB inherits the test-database safety rules — scoped operations only, no unscoped DELETE/TRUNCATE, trace the FK cascade. A rollback that wipes data is worse than the bug.

### Phase 7: Capacity / infra / cost (enterprise; beta light) — G23, G31

enterprise — full:
- **Topology:** where it runs (which app/worker), what it talks to, scaling unit (per-request, per-worker).
- **Scaling:** expected RPS, the bottleneck resource (DB connections, CPU, memory), autoscale trigger and ceiling. Resource budgets are named constants in shared config, not magic numbers.
- **Cost-per-call:** infra cost + LLM token cost if the path calls a model. State the model, tokens-per-call estimate, and price (from `~/.claude/model-pricing.md`). Anthropic providers are banned — if an LLM is in the loop it routes to the allowed provider (e.g. `xai:grok-4-1-fast-non-reasoning`), never `anthropic:*`.
- **Budget cap:** any long-running or batch pipeline that bills API MUST declare `--budget=<usd>` and refuse to start without it (cost-safety floor). State the cap.

```
| Resource          | Budget / cap                  | Bottleneck at       | Cost/call            |
|-------------------|-------------------------------|---------------------|----------------------|
| DB pool           | 20 conns (shared config const)| ~400 RPS            | —                    |
| LLM summarize     | --budget=5.00 per batch       | provider rate limit | ~$0.002 (grok-4-1)   |
```

beta floor — name at least one budget row whose value is a named constant in shared config (cite the constant name, not a magic number), plus the `--budget=<usd>` row whenever an LLM is in the loop. A beta Phase 7 with zero budget rows, or an LLM in the loop with no `--budget` row, is incomplete. Skip full topology.

### Phase 8: Runbook / on-call (beta light / enterprise full) — G28

How a human operates this feature after merge.

beta light — symptom → first action table:

```
| Symptom                          | First action                                      |
|----------------------------------|---------------------------------------------------|
| Orders failing, error budget red | Flip flag orders_v2 off (Phase 6 step 1)          |
| Latency p95 spiking              | Check order_write_latency by route; check DB pool |
| Payment dep down alert           | Confirm retry queue draining; no manual replay    |
```

enterprise — full on-call doc: each alert → owner, escalation path, the Phase 2 query to confirm, the Phase 6 rollback trigger, and a "do NOT do" list (e.g. do not replay payment retries manually). Reference the relevant `cfn-canary` run and dashboards.

## Output

**Artifact location.** Every artifact of one plan lives in that plan's own directory, `planning/<slug>/`. Under `/cfn-megaplan`, `/cfn-megaplan-lite`, or `/cfn-spa-plan` the orchestrator hands you the exact path plus a `Plan dir:` line — write there, and read the input paths it gives you verbatim. Invoked standalone, read with `.claude/skills/cfn-megaplan/lib/plan-paths.sh resolve <slug> <basename>` (per-plan dir first, legacy flat `planning/` second) and write to `planning/<slug>/`. Never split one plan across two locations.

Write to: `planning/<slug>/OPS_<slug>.md`

Template (include only the phases active for the tier; mark skipped phases `N/A (tier)`):

```markdown
# Operations Design: <task>

**Date:** <YYYY-MM-DD>
**Tier:** beta | enterprise
**Spec:** planning/<slug>/SPEC_<slug>.md
**Arch:** planning/<slug>/ARCH_<slug>.md
**Data:** planning/<slug>/DATA_<slug>.md (if db)
**Status:** draft | reviewed | locked

## 1. Threat Model (STRIDE)
| Data flow | STRIDE | Threat | Control | Residual |

## 2. Observability
### Log lines (decision points)
<event specs; each carries OBS-id, criticality (alert|slo|core-signal|diagnostic), verify (required | exempt: <reason>)>
### Metrics
| OBS-id | Metric | Type | Labels | SLO/use | Criticality (alert|slo|core-signal|diagnostic) | Verify (required | exempt: <reason>) |
(verify-required iff the signal backs an alert/on-call query, defines a Phase 4 KPI/guardrail, or is the runtime-observed signal of a [core] FR; debug logs never owe tests; OBS-id is the greppable token cfn-test-plan consumes and the Bar A `obs_required_total/obs_required_mapped` key)
### Traces
<span boundaries>
### On-call query
<literal query>

## 3. Rollout
- Feature flag: name, default, kill-switch owner
| Stage | % | Dwell | Promote when (binary) |
- Security headers confirmed via shared middleware: yes/no
- cfn-canary wired (enterprise): yes/no

## 4. Success Metrics / KPIs
| KPI | Definition (query) | Target | Window |

## 5. Failure Modes
| Dependency | Down behavior | Timeout budget | Fallback | (S|L|D|RPN if FMEA) |

## 6. Rollback Rehearsal
- Trigger, tested steps, data safety, rehearsal evidence
- db + reversible: cfn-migration-rehearsal invocation cited verbatim from DATA §5 (executable evidence); no scratch DB -> WARN row + why; irreversible -> `n/a: <reason from DATA §5>`

## 7. Capacity / Cost
| Resource | Budget/cap | Bottleneck | Cost/call |
- --budget cap (if LLM in loop):

## 8. Runbook
| Symptom | First action |

## [OPEN]
<decisions needing the user: unmeasurable success criterion, banned provider, missing budget cap, header bypass>
```

## Handoff

`OPS_<slug>.md` is consumed at L7 by `/write-plan`, which folds rollout/observability/rollback into the implementation roadmap (e.g. the flag wrapper, the log lines, the down-migration become concrete build tasks via its "Ops Integration Tasks" section). Bar A (verifiable-done) turns each KPI and canary criterion into an executable AC. `cfn-plan-review` (L8) blast-radius-checks the ops surface.

## Return (to orchestrator)

Return exactly:
- Artifact path: `planning/<slug>/OPS_<slug>.md`
- A 3-line summary (STRIDE edges covered with row count, flag name + rollout stages, rollback trigger + down-migration named).
- Floors line: STRIDE floor met yes/no (every external edge has >=1 row, S/T/I evaluated), budget floor met yes/no (>=1 named-constant row; `--budget` row present if LLM in loop).
- Any `[OPEN]` items needing a user decision (unmeasurable success criterion, banned provider, missing budget cap, header bypass).

## Anti-Patterns

- **"We'll add monitoring later."** Later means after the incident, blind. Log lines at decision points are designed here or the on-call has nothing.
- **"Rollback = just redeploy / revert the migration."** Untested undo is a wish. Phase 6 requires the actual steps and evidence they work.
- **"No success metric."** If you can't state the prod query that proves it worked, you ship blind and never learn. Every KPI maps to a SPEC criterion.
- **Security headers per-route instead of shared middleware.** HSTS/CSP/X-Frame-Options bypassed on the new route is a regression the rollout must catch BEFORE canary.
- **Threat model as a checkbox** ("security reviewed: yes") instead of a per-data-flow STRIDE table with a named control each.
- **LLM in the loop with no `--budget` cap**, or a path routing to a banned `anthropic:*` provider.
- **Timeout budgets that sum past the request deadline** — cascading timeouts blow the SLA you set in Phase 4.
- **Unscoped DELETE/TRUNCATE in a rollback** — a rollback that wipes data is worse than the bug it undoes.
- **Running ops at mvp.** mvp proves correctness only; the orchestrator does not spawn this phase there.

## Related

- Orchestrator: `cfn-megaplan` (L6, parallel with `cfn-design`, `cfn-test-plan`)
- Upstream inputs: `cfn-spec`, `cfn-arch`, `cfn-data`
- Wires: `cfn-canary` (post-deploy health monitoring, Phase 3)
- Specialists: `security-specialist` / `technical-advisor` (STRIDE, FMEA), `devops-engineer` / `fly-io-specialist` (capacity)
- Gates downstream: Bar A turns KPIs/canary criteria into executable ACs; `cfn-plan-review` blast-radius
- Backlog + rationale: `docs/PLANNING_PIPELINE_GAPS.md` (gaps G10, G11, G12, G14, G18, G23, G27, G28, G31)
