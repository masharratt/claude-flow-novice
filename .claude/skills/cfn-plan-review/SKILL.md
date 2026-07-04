---
name: cfn-plan-review
description: "Post-planning completeness review. Extracts assumptions, traces dependencies, analyzes blast radius, checks alpha-readiness, surfaces gaps before implementation. Use after writing any plan that touches data, APIs, or shared state."
version: 1.1.0
tags: [planning, review, completeness, dependencies, alpha-readiness]
status: production
---

# CFN Plan Review

**Purpose:** Catch what plans miss. Plans fail when they scope from the task description instead of from the system. This skill forces investigation of what the plan takes for granted.

## When to Use

Invoked internally by `cfn-megaplan` (the canonical planning pipeline) at its plan-review step, after `/write-plan`. Run it standalone only when iterating on an existing plan, or after the lighter `/cfn-spa-plan` + `/write-plan` path. Run after any plan is written and before implementation begins. Especially critical for:
- Database migrations or schema changes
- Cross-project data movement
- API contract changes
- Service decomposition or consolidation
- Any plan where "just move X" is the framing

## Protocol

### Phase 0: DRY & Modularity Check

Before reviewing completeness, apply the DRY and modularity rules from `~/.claude/rules/code-quality.md` (DRY & Modularity section) to the plan:

- Does the plan introduce logic that already exists elsewhere?
- Does it touch 8+ files? If so, pause and verify minimum viable scope.
- Are there shared types, schemas, or constants that need a single source of truth?
- Does any multi-file feature have a shared orchestrator, or are there multiple entry points?

**New dependency audit** (apply the `cfn-arch` build ladder rung 8):
- Does the plan add a NEW dependency? If so, could stdlib, a native platform feature, or a few lines do it instead? Trivial functionality must not pull a dep.
- Security carve-out: if the dep covers crypto/auth/parsing/sanitization, a vetted dep is correct — flag any plan that hand-rolls these instead.
- Is the dep version pinned with a supply-chain cooldown (~90 days old), and is there a CVE-watch (`npm audit`/Dependabot) so a known vuln overrides the cooldown? A new dep with no pin/cooldown/watch is a finding.

Surface any violations as numbered findings in Phase 6. Do not duplicate the rules here. Consult `code-quality.md` and `cfn-arch` directly.

### Phase 1: Assumption Extraction

Before extracting assumptions, query the decision log for prior plans involving the same entities: `~/.claude/skills/decision-log/query.sh '<entity-names>' 5 <project>` (conversation FTS) and `~/.claude/skills/decision-log/decisions.sh search '<entity-names>'` (structured register of RESOLVED forks). Prior failed assumptions and settled decisions from past plans should be checked first — do not re-open a fork already marked RESOLVED unless it is `superseded`.

Read the plan and extract every implicit assumption into an explicit, testable statement.

Common hidden assumptions:
- "This entity is self-contained" (it almost never is)
- "Nothing else reads/writes this table" (check for views, functions, cron jobs, other services)
- "The schema matches what I expect" (dump it and verify)
- "This API is only called by one consumer" (grep for the endpoint across all projects)
- "The data fits in memory / can be migrated in one pass" (check row counts)
- "Existing data is clean and consistent" (check for nulls, orphans, constraint violations)
- "My custom header reaches the backend" (check proxy/gateway header whitelists; Next.js catch-all routes, nginx, and API gateways silently strip unknown headers)

Output format:
```
## Assumptions
1. [UNTESTED] Listings table has no FK dependencies on other tables
2. [UNTESTED] No other service writes to the golfer_profiles table
3. [VERIFIED] The target database already has the uuid-ossp extension
```

Each assumption is UNTESTED until explicitly verified by querying the system.

**Verification is mandatory, not optional.** Before Phase 6, every assumption must be resolved to VERIFIED or FAILED by running a command, or escalated:

```
| # | Assumption | Verify command (executed) | Evidence (paste actual output line) | Verdict |
```

An assumption left UNTESTED is itself a numbered Phase 6 finding ("could not verify: <why>"). A review containing any UNTESTED assumption cannot report "Alpha-ready: YES". Same rule for Phase 2: every dependency row cites the query/grep output that proved it; a dependency graph with no pasted evidence is an invalid review.

### Phase 2: Dependency Trace

For every entity the plan touches (table, API, module, config), trace dependencies in both directions:

**Inbound (what does this entity need to exist?):**
- FK references to other tables
- Required lookup/reference data
- Config values, environment variables
- Shared types or schemas it imports
- Services it calls

**Outbound (what depends on this entity?):**
- Other tables with FKs pointing here
- Views, functions, triggers that reference it
- Services that query or subscribe to it
- Cron jobs, pipelines, background workers
- Frontend code that renders its data
- API consumers (internal and external)

**Code-entity trace commands (run these, paste hit counts as evidence):**
- FIRST, always: `/codebase-search "<symbol or endpoint>" --top 10` (mandatory before any grep)
- Fallback importers trace: `grep -rn "from ['\"].*<module>" src/`
- Endpoint consumers: grep the endpoint path across ALL consumer projects, not just this repo
- Config: grep for the env var name across code AND deploy config (fly.toml, Dockerfile, .env.example)

Zero hits is a result to record, not a step to skip. Every dependency row in the graph cites its hit count or query output.

**For API/HTTP changes, also check the request path:**
- Does the request pass through a reverse proxy, API gateway, or frontend proxy before reaching the backend? (e.g., Next.js catch-all route, nginx, Cloudflare Workers)
- Does the proxy have a header whitelist? Custom auth headers (X-Research-Key, X-Custom-Auth, etc.) are silently stripped by proxies that only forward known headers. This causes 401s that are impossible to reproduce when testing the backend directly.
- Are there middleware layers (CORS, CSRF, auth) mounted at the router level in server.ts that don't appear in the route file itself? Check `app.use()` calls, not just per-route middleware.

For database operations, the investigation MUST include:
```sql
-- Trace FKs pointing TO this table
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE confrelid = 'target_table'::regclass;

-- Trace FKs pointing FROM this table
SELECT confrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'target_table'::regclass AND contype = 'f';

-- Check for views referencing this table
SELECT viewname FROM pg_views
WHERE definition LIKE '%target_table%';

-- Check for functions referencing this table
SELECT proname FROM pg_proc
WHERE prosrc LIKE '%target_table%';
```

Output format:
```
## Dependency Graph: listings

### Needs (inbound)
- golfer_profiles (FK: listings.golfer_id -> golfer_profiles.id)
- courses (FK: listings.course_id -> courses.id)
- listing_types (FK: listings.type_id -> listing_types.id)
- pricing_tiers (referenced in listings.compute_price())

### Needed By (outbound)
- listing_images (FK: listing_images.listing_id -> listings.id)
- bookings (FK: bookings.listing_id -> listings.id)
- search_index (materialized view, refreshes from listings)
- daily-seo cron job (reads listings for sitemap generation)
```

### Phase 3: Blast Radius

Answer: "If we ship exactly this plan and nothing else, what breaks?"

For each dependency found in Phase 2, evaluate:
1. Is it covered by the plan? (explicitly handled)
2. Is it out of scope but safe? (no impact from this change)
3. Is it a gap? (will break if not addressed)

Output format:
```
## Blast Radius

### Covered by plan
- listings table migration [Phase 2 of plan]
- listing_images migration [Phase 3 of plan]

### Safe (no action needed)
- search_index view (will be recreated in target DB)

### GAPS (will break)
- golfer_profiles table NOT in migration plan but listings FK requires it
- pricing_tiers NOT in plan but listings.compute_price() references it
- bookings table NOT in plan but has FK to listings
```

### Phase 4: Edge Cases

Surface scenarios the plan does not address:
- What happens to in-flight data during migration? (rows written between snapshot and cutover)
- What happens to orphaned records? (FKs that reference deleted rows)
- What is the rollback path if migration fails halfway?
- Are there data volume concerns? (100 rows vs 10M rows changes the approach)
- Are there ordering constraints? (table A must exist before table B due to FKs)
- Does the plan assume downtime? If not, how is consistency maintained?

### Phase 5: Alpha Readiness Check

Whatever the plan implements MUST be at least alpha-ready when merged. Alpha-ready = could ship to real users behind a feature flag without on-call paging or data loss. Score the plan against the same 8 dimensions used by `cfn-alpha-launch`. Each dimension is PASS, GAP, or N/A. Any GAP becomes a numbered finding in Phase 6.

**Hard requirements (any miss = BLOCKER):**

| Area | Requirement | Check |
|------|-------------|-------|
| **test** | TDD plan present | Each implementation step names the failing test written first. Bug fixes name the reproducing test. |
| **test** | Regression coverage | Edge cases from Phase 4 each map to a test (unit, integration, or e2e). |
| **security** | RLS on new tables | Every new Supabase table has a Row Level Security policy in the same migration. |
| **security** | Auth boundaries | New endpoints state the auth check (Clerk session, API key, public). No "TBD auth". |
| **security** | No secrets in code | Plan does not hardcode tokens, keys, or DB URLs. Secrets routed via Fly secrets or env. |
| **security** | Headers + RLS audit | New HTTP routes inherit HSTS/CSP/X-Frame-Options via shared middleware; not bypassed. |
| **backend** | Error handling at boundaries | External API calls, DB queries, and user input have explicit error paths. |
| **backend** | No unscoped DELETE/TRUNCATE | Any DELETE in test setup/teardown or migration has WHERE clause targeting test rows only. |
| **frontend** | UI verification step | If frontend touched, plan includes Playwright or manual browser check (golden path + 1 edge case). |
| **architect** | Rollback path | Plan states how to undo if alpha users hit a blocker (revert migration, feature flag off, redeploy prior tag). |
| **supabase** | Migration reversibility | New migrations have `down` direction OR explicitly documented why they cannot be rolled back. |
| **supabase** | Schema sync step | Plan ends with `~/.claude/skills/supabase-schema-sync/execute.sh` after any migration. |
| **contract** | Inter-service typing | Cross-service calls (API, trigger payload, queue message) define a shared Zod schema or TS interface. |
| **contract** | Enum completeness | New enum values traced through ALL consumers (DB, switch/match, serializers, UI). |
| **consistency** | Canonical constants | No hardcoded path/schema/limit strings duplicated across files; routed through shared config. |
| **consistency** | Doc updates | Plan includes updates to `readme/feature-status.md` and `readme/state-machines.md` if entity is stateful. |

**Deployment readiness (Fly.io specific):**

- Static-export apps (Next.js export, Expo web): all `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` env vars added as Docker build args in `fly.toml` AND `ARG`/`ENV` in Dockerfile.
- SSR/ISR apps: env vars added as Fly secrets via `fly secrets set`.
- Plan includes post-deploy verification: `curl` of key page (not just `/health`) confirms real content renders.
- If touching blog/SEO: plan includes GSC validation timing (no "Validate Fix" same day as deploy).

**Observability:**

- Decision points (auth allow/deny, gate pass/fail, retry vs abort) have a log line with enough context to debug a paged incident.
- Errors include the entity ID, the request ID, and the user/tenant ID where available.
- Plan names the dashboard or log query someone on-call would run to see if this feature is healthy.

**Anti-patterns that auto-fail this phase:**

- "We'll add tests after"
- "Auth will be added later"
- "RLS in a follow-up migration"
- "Will document once stable"
- "Skip rollback path, we'll redeploy"
- Any Anthropic API call in project code (BANNED per `~/.claude/CLAUDE.md`)
- `claude -p` invocation without `--budget` cap or `unset ANTHROPIC_API_KEY`

Output format:
```
## Alpha Readiness Check

| Area | Status | Notes |
|------|--------|-------|
| test | GAP | No failing test specified for new pricing logic |
| security | PASS | RLS policy in same migration, auth via Clerk session |
| backend | GAP | External Stripe call has no error handler |
| frontend | N/A | Backend-only change |
| architect | PASS | Rollback = feature flag off + revert migration 0123 |
| supabase | GAP | Migration missing schema-sync step |
| contract | PASS | Shared Zod schema in packages/contracts |
| consistency | GAP | Doc updates missing |

**Alpha-ready: NO** (4 gaps blocking)
```

### Phase 5.5: Plan Judge (gap G35 — enterprise tier only)

Completeness (Phases 1-5) checks whether the plan covers the system. The judge checks whether the *chosen approach* is the right one. Run only when invoked at `enterprise` tier (or on explicit request).

Spawn a small panel (2-3) of independent reviewers, each with a distinct lens — maintainability, simplicity (could a smaller approach hit the same acceptance criteria?), and risk. Each scores the plan's approach 1-5 and names one concretely better alternative if it exists. If a majority scores ≤3 or all three name the same alternative, surface "approach may be wrong" as a Phase 6 finding with the alternative. This is the design-altitude check completeness cannot give.

**Score anchors (each score has a proof obligation):**
- 5 = reviewer cannot name a simpler approach meeting the same ACs
- 4 = a simpler approach exists but loses an explicit AC/NFR (name both the approach and the criterion it loses)
- 3 = a simpler approach meets ALL ACs (impossible to award without naming that approach)
- 2 = the chosen approach fails an AC/NFR as designed (cite the AC/NFR)
- 1 = the approach conflicts with a resolved DECISIONS entry or the security floor (cite the entry/rule)

A score <=3 with no named alternative or citation is invalid and re-runs.

### Phase 5.6: Haiku-Executable Gate (Bar B)

When run inside `cfn-megaplan`, this phase also invokes `bars/haiku-executable.md`: static weasel-word scan, structural scan (every step has file path + signature + control type + error path), branch-coverage scan, then the live haiku probe. Any finding routes to its owning phase (ui_control -> cfn-ux, value source -> cfn-data/cfn-arch, branch -> cfn-pseudo) and that phase re-runs. Re-run until clean. Outside megaplan, run it manually before declaring the plan ready.

### Phase 6: Findings Summary

**Minimum evidence floor.** A valid review contains: >=5 extracted assumptions (or an explicit per-category statement why none applies), >=1 dependency graph with pasted query/grep evidence, and a fully-filled Alpha Readiness table. A zero-gap review must show the executed evidence clearing each hard requirement; "PASS" with an empty Notes cell is invalid.

Present all gaps from Phases 1-5 as numbered questions, one per issue. Each question includes:
- What was found
- Why it matters
- Source phase (assumption / dependency / blast radius / edge case / alpha readiness)
- A recommended action

Format:
```
## Plan Review Findings

1. **golfer_profiles table missing from migration** [Phase 3: blast radius]
   The listings table has an FK to golfer_profiles.id. Migrating listings without golfer_profiles will fail on insert due to FK constraint violation.
   Recommendation: Add golfer_profiles to migration scope, execute before listings.

2. **Assumption untested: no other service writes to listings** [Phase 1: assumption]
   The plan assumes daily-seo is the only writer. If golfer-collective still has write access during migration, data will diverge.
   Recommendation: Verify by checking database connection logs or revoking golfer-collective write access before cutover.

3. **No RLS policy on new pricing_tiers table** [Phase 5: alpha readiness: security]
   Plan creates pricing_tiers without RLS. Per CFN security rules, every new Supabase table requires RLS before deployment.
   Recommendation: Add RLS policy in the same migration. Default-deny + per-tenant allow.

4. **No failing test for compute_price() change** [Phase 5: alpha readiness: test]
   Plan modifies pricing logic but does not name the failing test written first. Per TDD protocol, no implementation without a failing test.
   Recommendation: Add Phase 1.5 to plan: write failing test for new pricing rule before touching production code.
```

## Output

Write to: `planning/REVIEW_<slug>.md` with this required section order:

1. **Assumptions verified table** (| # | Assumption | Verify command (executed) | Evidence | Verdict |)
2. **Dependency Graph** (with pasted query/grep evidence per row)
3. **Blast Radius** (covered / safe / GAPS)
4. **Edge Cases**
5. **Alpha Readiness table** (fully filled, no empty Notes cells)
6. **Findings** (numbered, each tagged BLOCKER / GAP / NOTE)

## Return (to orchestrator)

Return exactly:
- Artifact path: `planning/REVIEW_<slug>.md`
- Finding count by severity: BLOCKER / GAP / NOTE
- Alpha-ready: YES or NO
- List of UNTESTED-assumption findings needing user input (empty list if all verified)

## Integration

- Invoked internally by `cfn-megaplan` (canonical pipeline) at the plan-review step, after `/write-plan`
- Optionally preceded by `cfn-goap-plan` (goal state modeling, A* action sequence) for non-trivial tasks
- Standalone: run after `/write-plan` or any Plan Mode session (including the lighter `/cfn-spa-plan` path)
- Feeds into cfn-investigate if gaps reveal deeper issues
- Log significant findings to cfn-knowledge-base for future reference
- Works with any project type (not database-specific, but database examples are most common)

## What This Skill Does NOT Do

- Does not rewrite the plan. It reviews and surfaces gaps.
- Does not make scope decisions. It presents findings; the user decides.
- Does not run migrations or make changes. It is read-only investigation.
