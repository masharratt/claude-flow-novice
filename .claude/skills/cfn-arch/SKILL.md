---
name: cfn-arch
description: "SPARC Architecture phase. Define component boundaries, interface contracts, integration points, DRY reuse BEFORE implementation. Use after cfn-spec and cfn-pseudo to lock structure, catch integration mismatches early."
version: 1.1.0
tags: [planning, sparc, architecture, contracts, components, integration]
status: production
---

# CFN Arch Skill (SPARC Phase 3)

**Purpose:** Convert pseudocode operations into a concrete component design with interface contracts. Catches integration mismatches, missing shared types, and DRY violations BEFORE the implementer wires them wrong.

**Phase:** Architecture. DAG level 5 in the canonical `cfn-megaplan` pipeline (after `cfn-data` at level 4, in parallel with `cfn-ux`); megaplan's dependency table is authoritative for scheduling. Hands storage detail to `cfn-data`, ops/deployment to `cfn-ops`, and the route/navigation map to `cfn-ux`. Also SPARC step 3 of 3 in the lighter `cfn-spa-plan` sub-pipeline.

## When to Use

- After `cfn-spec` and `cfn-pseudo` artifacts exist
- Auto-invoked by `/cfn-megaplan` (canonical) and the lighter `/cfn-spa-plan` sub-pipeline
- Standalone for architecture review of existing systems

Skip only for: tasks confined to a single existing function with no new interface.

## Input

Required:
- `planning/SPEC_<task>.md`
- `planning/PSEUDO_<task>.md`

Refuse to run if either missing or in `draft` status with unresolved gaps.

## Protocol

### Step -1: Resolve mode (before any step)

Resolve which steps this run owns BEFORE executing any of them. Under megaplan, dedicated phases own the detail; arch emits "deferred to <phase>" for the skipped parts instead of duplicating them.

| Context | Steps you SKIP (emit "deferred to <phase>" only) |
|---|---|
| megaplan + db flag | Step 5 entirely (cfn-data owns schema/index/RLS/migration) |
| megaplan + frontend flag | Step 3 route-map behavior detail (keep route list; cfn-ux owns journeys) |
| megaplan, tier beta+ | Step 6 observability / Step 8 rollout mitigation design (cfn-ops) |
| standalone / cfn-spa-plan | nothing - run all steps |

### Step 0: DRY Audit (MANDATORY)

Before designing anything new, query the codebase for existing capabilities. Use `/codebase-search` for every Operation listed in PSEUDO.

**The build ladder — stop at the first rung that holds.** Run this for every Operation. The disposition (REUSE/EXTEND/NEW) falls out of which rung stops you:

1. **Does this need to exist at all?** Speculative need → cut it, note why in one line. (YAGNI)
2. **Already in this codebase?** A helper, util, type, or pattern that already lives here → REUSE it. Look before you write; re-implementing what sits a few files over is the most common waste.
3. **Stdlib does it?** Use it.
4. **Native platform feature covers it?** DB constraint over app code, CSS over JS, `<input type="date">` over a picker lib.
5. **Already-installed dependency solves it?** Use it. Reusing a vetted dep beats reinventing it.
6. **Can it be one line?** One line.
7. **Minimum NEW code that works?** Write it. Justify why nothing above fit.
8. **Only then — add a NEW dependency.** Last resort, and gated:
   - **Trivial functionality** (a few lines)? Do NOT add a dep — rung 7 wins. (left-pad / event-stream were trivial deps that should have been a few lines.)
   - **Security-sensitive** (crypto, auth, JWT/token parsing, HTML/SQL sanitization, parsing untrusted input)? A widely-audited dep WINS — never hand-roll these. Rolling your own is the dangerous path, not the lazy one.
   - **Pin with a cooldown.** Adopt a release only after a supply-chain cooldown (~90 days old) so a compromised or malicious publish has time to be caught and yanked — don't be patient-zero. Then move the pin forward progressively, only as far as you need.
   - **CVE override.** The cooldown does NOT apply to security patches. If a newer release fixes a known vulnerability in your pinned version, take it immediately. An age-pin requires `npm audit` / Dependabot watching the pinned version, or "old and stable" silently rots into "old and vulnerable."

The ladder shortens the solution, never the reading: climb it only after you understand the task and trace the real flow end to end.

Categorize each operation by the rung that stopped it:

- **REUSE:** existing module/function does this. Document the path.
- **EXTEND:** existing module covers 80%; small extension needed. Document the extension point.
- **NEW:** no existing solution. Justify why nothing existing fits.

Output table:
```
| Operation       | Disposition | Existing Path                  | Notes                |
|-----------------|-------------|--------------------------------|----------------------|
| validateUser    | REUSE       | src/lib/validators/user.ts:42  | Already exists       |
| persistUser     | EXTEND      | src/repos/user-repo.ts         | Add bulkInsert method|
| sendWelcomeMail | NEW         | -                              | No mailer exists yet |
```

If `NEW` count > 50% of operations, pause: scope may be wrong or reuse search insufficient.

### Step 1: Component Decomposition

**Composition root (REQUIRED, name once).** Before listing components, name the file(s) where components are actually constructed and dependency-injected into the running process — the file(s) `cfn-test-plan` Phase 3 will grep to prove each component is wired (e.g. `src/index.ts`, `src/daemon.ts`). This is the file the production entrypoint calls through; not a test harness, not a direct-module caller. One line per entrypoint process:

```
Composition root(s):
- src/index.ts        (HTTP + poll-loop daemon entrypoint)
```

A build with more than one runtime process (e.g. an API server and a separate worker daemon) names one composition root per process. Every component in the table below is checked against ONE of these files by Bar A's `wiring_total`/`wiring_mapped` coverage counter — a component with no composition root it is constructed in is an unwired orphan by definition, this is exactly the class of miss recorded in `/home/masha/projects/daily-agents/planning/ROOTCAUSE_mpa_thread_wiring_gap.md`.

Group operations into components/modules. Each component has:
- **Name** (kebab-case, matches file/dir)
- **Responsibility** (one sentence, single responsibility principle)
- **Owns** (which operations from PSEUDO)
- **Owns data** (which entities/tables)
- **Does NOT own** (explicit non-responsibilities to prevent scope creep)

Grouping procedure (mechanical, apply in order):
1. One component per persisted entity: owns its table + all ops whose primary write target is that table.
2. One component per external system (mailer, payment, queue adapter).
3. An op writing 2+ entities' tables = a workflow component named after the task, which CALLS the entity components, never duplicates them.
4. Read-only cross-entity queries live with the entity they return.
5. A component owning >7 operations must be split; state the split axis.

### Step 2: Interface Contracts

For every boundary between components (or with external services), define a typed contract. Use TypeScript interfaces or Zod schemas. No loose objects.

Format:
```typescript
// Component boundary: UserController -> UserService
interface CreateUserRequest {
  email: string;       // RFC 5322 valid
  displayName: string; // 1-50 chars, trimmed
}

interface CreateUserResponse {
  userId: string;
  createdAt: string;   // ISO 8601 UTC
}

interface CreateUserError {
  code: 'INVALID_EMAIL' | 'DUPLICATE_EMAIL' | 'INTERNAL';
  message: string;
}
```

Rules:
- Every cross-component call has a contract
- Every contract is named and reusable (no anonymous shapes)
- Error shapes are typed, not strings
- Shared contracts live in a single source-of-truth file. State the path.

**Core-FR Dependency Interfaces (REQUIRED when any component maps to a `core_fr`).** For every component that implements a SPEC `core_fr`, name the typed interface at the composition root through which it is injected, and state whether that dependency is required or optional:

```
| Component | core_fr | Dependency interface (file:Symbol) | Optionality | DECISIONS ref (if optional) |
|---|---|---|---|---|
| ThreadManager | FR-20 | src/poll-loop.ts:PollLoopDeps | required | - |
```

Rule: a component mapped to a `core_fr` MUST be `required` here — a `?` on that property in the composition root's dependency type is what lets the process compile and run with the mechanism silently absent (this is precisely what shipped MP-A's dead thread manager, see `/home/masha/projects/daily-agents/planning/ROOTCAUSE_mpa_thread_wiring_gap.md`). `optional` is only acceptable with a filled DECISIONS ref (a `D-n` row from `planning/DECISIONS_<slug>.md` naming the ceiling and the upgrade trigger) — an inline code comment does not satisfy this column; leaving it blank on an `optional` row is a defect Bar B rejects.

**Do not conflate a widened seam with an omittable component.** Making a *call-site parameter* optional for backward compatibility (e.g. `postCard(msg, opts?.thread)` so existing callers keep compiling) is a different decision from making the *composition-root dependency* optional (e.g. `deps.thread?:` on the daemon's own construction). The first says "this call site tolerates no-thread"; the second says "the daemon may run with the component never built at all." Record them as separate rows if both exist — do not let a documented seam-widening decision stand in for authorization to omit the component's construction.

This table is the file:Symbol list `cfn-test-plan` Phase 3 turns into `WIRE-n` rows and Bar B's optional-DI static assist (`bars/check-haiku-static.sh`) scopes its grep to — components not listed here are components the mechanical assist cannot check, so list every `core_fr` component.

### Step 3: Data Flow Diagram (route-map behavior detail SKIPPED under megaplan+frontend - see Step -1; keep the route list)

ASCII or mermaid. Show how data moves between components for the primary happy path AND at least one failure path.

```
Client --POST /users--> UserController
                            |
                            v validate
                       UserService --insert--> UserRepo --SQL--> Postgres
                            |
                            v emit
                       EventBus --queue--> WelcomeMailer
```

**Route / navigation map (when a frontend exists).** Arch owns the screen *structure*; `cfn-ux` owns the in-flow navigation *behavior*. Define here:
- **Routes** — the URL/route for each screen (`/courses/:id/book`), and which are public vs auth-gated.
- **Deep-linking** — which screens are directly addressable (bookmarkable / shareable) and what state they need from the URL (params, query) vs from a load.
- **Screen graph** — how screens connect (which links/redirects lead where), so `cfn-ux` maps journeys onto a real route structure instead of inventing one.
- **Redirects / guards** — unauthenticated access to a gated route → where it lands (login, preserving return intent).

`cfn-ux` Phase 3b consumes this map for cross-screen journeys; do not duplicate journey behavior here.

### Step 4: Integration Points & External Contracts

For every external system (DB, third-party API, queue, cache):
- **System name + version**
- **Contract** (schema, OpenAPI link, or interface)
- **Auth mechanism**
- **Retry policy** (retries, backoff, idempotency key)
- **Timeout** (connect + read)
- **Circuit breaker** (threshold, recovery)
- **Failure mode** (cross-reference PSEUDO Step 5)

### Step 5: Storage & Schema (SKIP under megaplan+db - see Step -1)

For every entity that persists:
- **Table/collection name** (with schema qualification, e.g. `public.users`)
- **Columns** with types, nullable, defaults, constraints
- **Indexes** with justification (which query uses each)
- **RLS policy** (REQUIRED for new tables — see global CLAUDE.md)
- **Migration filename** (NNNN_descriptive_name.sql)

### Step 6: Cross-Cutting Concerns (observability deferred to cfn-ops under megaplan beta+ - see Step -1)

Address each explicitly:
- **AuthN:** how identity is established (cross-reference NFRs in SPEC)
- **AuthZ matrix (REQUIRED table - cfn-ux 3d consumes this verbatim):** `| Operation | <role-1> | <role-2> | ... |` with cells from {allow, deny-role, deny-state}. **Columns are the Actor names from SPEC §1a Actor Inventory, verbatim — do not invent, rename, or merge roles here.** Include every `human-role` and `service` actor; a `system` actor gets a column when any PSEUDO operation is reachable by it. An actor in §1a with no column, or a column naming a role absent from §1a, is a defect: route back to `cfn-spec` rather than inventing the role set (`cfn-data` §4 derives its RLS `Principal/role` from the same §1a table at L4, one level ahead of this phase — two independently invented role sets do not have to agree, and the RLS policy is a floor item). Every PSEUDO operation gets a row. No blank cells. Consumer (cfn-ux 3d) matches this table byte-for-byte; unmatched values route back as producer defects.
- **Observability:** log events, metrics, traces emitted
- **Rate limiting:** per-endpoint limits
- **Caching:** what is cached, where, TTL, invalidation trigger
- **Secrets:** which credentials needed, where stored (Fly secrets, env, vault)

### Step 7: Failure Mode Inventory

For each component, list how it can fail and what depends on it:
```
Component: UserRepo
  Failures: DB unreachable, constraint violation, connection pool exhausted
  Blast radius: All write paths blocked; reads can fall back to read replica
  Mitigation: Health check + circuit breaker; queue retries with backoff
```

This is a mini blast-radius analysis — `cfn-plan-review` will do a deeper one post-plan.

### Step 8: Deployment & Rollout (rollout mitigation design deferred to cfn-ops under megaplan beta+ - see Step -1)

- New env vars / secrets needed (and where set)
- Feature flag (yes/no, name, default)
- Backwards compatibility plan (if changing existing contract)
- Rollback procedure

### Step 9: State Machines (gap G17, G48)

For every stateful entity in scope, design the lifecycle AT PLAN TIME (not at commit time when `readme/state-machines.md` is updated). Emit TWO pinned tables that share ONE SM-id space (SM-1, SM-2, ... number continuously across both tables, never restart):

Valid transitions:
```
| SM-id | Entity | From | To | Trigger | Guard |
```

Illegal transitions:
```
| SM-id | Entity | From | To (illegal) | Rejection behavior (exact error code/HTTP status/exception) |
```

**Completeness rule:** every non-adjacent state pair (any From/To that is not already a valid-transition row) must appear as an illegal-transition row OR be marked `unreachable by construction: <why>`. A pair that is neither a valid row, an illegal row, nor explicitly unreachable is an incomplete artifact.

SM-id is the greppable token `cfn-test-plan` consumes: valid rows drive the trigger and assert the persisted state flip; illegal rows attempt the transition and assert the exact rejection. It is also the key behind Bar A counters `sm_total/sm_mapped`.

Add a **diagram** (mermaid or ASCII) alongside the tables. The commit-time `readme/state-machines.md` update is then a copy of this section, not a fresh design.

### Step 10: Error Taxonomy (gap G25 — `error_taxonomy` extra, beta+)

When the orchestrator passes the `error_taxonomy` extra, define a single cross-surface error contract so every component returns the same shape and codes, sourced from one file:
- **Error code enum** — one canonical list (`INVALID_X`, `NOT_FOUND`, `FORBIDDEN`, ...), single source-of-truth path.
- **Shape** — the typed error object every boundary returns (reuse the Step 2 contract style).
- **Mapping** — which operation raises which code, and the HTTP status each maps to.

Skip for `mvp` (light arch drops this extra).

### Under cfn-megaplan: division of labor (rationale only - Step -1 is the operative skip table)

When run inside `cfn-megaplan`, defer detail to the dedicated phases to avoid duplication (DRY):
- **Storage (Step 5)** → hand to `cfn-data` when the `db` flag is set; arch keeps only the component-level data ownership, cfn-data owns schema/index/RLS/migration detail.
- **Route / navigation map (Step 3)** → hand to `cfn-ux` when the `frontend` flag is set; arch keeps the route structure, cfn-ux owns in-flow navigation behavior and journeys.
- **Deployment + observability + failure mitigation (Steps 6-8)** → hand to `cfn-ops` for beta+ tiers; arch keeps the failure *inventory*, cfn-ops owns the mitigation *design* (circuit breakers, rollout, runbook).
- Standalone (no megaplan, e.g. under `cfn-spa-plan`), arch covers all ten steps itself.

## Output

Write to: `planning/ARCH_<sanitized-task-name>.md`

Template:
```markdown
# Architecture: <task>

**Date:** <YYYY-MM-DD>
**Spec:** planning/SPEC_<task>.md
**Pseudo:** planning/PSEUDO_<task>.md
**Status:** draft | reviewed | locked

## 0. DRY Audit
| Operation | Disposition | Existing Path | Notes |

## 1. Components
Composition root(s):
- <file>   (<process/entrypoint description>)

### <component-name>
- Responsibility:
- Owns operations:
- Owns data:
- Does NOT own:

## 2. Interface Contracts
```typescript
interface ...
```

Core-FR Dependency Interfaces (only when a component maps to a `core_fr`):
| Component | core_fr | Dependency interface (file:Symbol) | Optionality | DECISIONS ref (if optional) |

## 3. Data Flow
(diagram)

## 4. External Integrations
### <system-name>
- Version, auth, retry, timeout, circuit breaker, failure mode

## 5. Storage
### Table: <name>
- Columns, indexes, RLS, migration

## 6. Cross-Cutting
- AuthN/AuthZ/Observability/Rate-limit/Cache/Secrets

## 7. Failure Modes
| Component | Failures | Blast Radius | Mitigation |

## 8. Deployment
- Env vars, feature flag, compatibility, rollback

## 9. State Machines
Valid transitions:
| SM-id | Entity | From | To | Trigger | Guard |
Illegal transitions:
| SM-id | Entity | From | To (illegal) | Rejection behavior (exact error code/HTTP status/exception) |
(one shared SM-id space across both tables; every non-adjacent state pair is a valid row, an illegal row, or `unreachable by construction: <why>`; SM-id is the greppable token cfn-test-plan consumes and the Bar A `sm_total/sm_mapped` key; include a diagram)

## 10. Error Taxonomy   (beta+; `error_taxonomy` extra)
- Canonical error-code enum (single source-of-truth path)
- Typed error shape (reuse §2 contract style)
- Mapping: operation -> code -> HTTP status
```

### Output example: course booking (excerpt, continues the shared cfn-data / cfn-ux / cfn-design example)

Components (grouping procedure applied):
- `booking` (entity, rule 1): owns `public.enrollments` + createBooking / cancelBooking (primary write target: enrollments).
- `course` (entity, rules 1 + 4): owns `public.courses` + the read-only course/capacity queries.
- `book-course` (workflow, rule 3): createBooking writes enrollments AND decrements course seat availability (2+ entity tables), so it is a workflow component named after the task; it CALLS `booking` and `course`, it duplicates neither.

One contract (Step 2):
```typescript
// Component boundary: BookingController -> book-course workflow
interface BookCourseRequest {
  courseId: string;     // uuid, FK public.courses
  sessionDate: string;  // ISO 8601 date
  seats: number;        // 1-8
}
interface BookCourseError {
  code: 'COURSE_FULL' | 'INVALID_DATE' | 'FORBIDDEN' | 'INTERNAL';
  message: string;
}
```

State machine (Step 9; shared SM-id space across both tables):

Valid:

| SM-id | Entity | From | To | Trigger | Guard |
|---|---|---|---|---|---|
| SM-1 | booking | draft | pending | submit | seats requested >= 1 |
| SM-2 | booking | pending | confirmed | payment_ok | seat still available |
| SM-3 | booking | confirmed | completed | session_ends | - |

Illegal:

| SM-id | Entity | From | To (illegal) | Rejection behavior (exact error code/HTTP status/exception) |
|---|---|---|---|---|
| SM-4 | booking | completed | pending | 409 ILLEGAL_TRANSITION |
| SM-5 | booking | cancelled | confirmed | 409 ILLEGAL_TRANSITION |

(draft -> confirmed etc.: `unreachable by construction: payment can only fire from pending`)

AuthZ matrix excerpt (Step 6; cfn-ux 3d consumes verbatim):

| Operation | member | staff | admin |
|---|---|---|---|
| createBooking | allow | allow | allow |
| cancelBooking | deny-state | allow | allow |
| deleteCourse | deny-role | deny-role | allow |

## Handoff

This artifact + SPEC + PSEUDO form the complete SPA bundle. Hand off to `/write-plan` which converts SPA into implementation roadmap + agent dispatch.

## Review Mode (audit implemented code)

Invoked as `cfn-arch --review <path(s)>`. Formalizes the "standalone review of existing systems" use-case into a structured audit. Instead of designing components forward from PSEUDO, it reads shipped code, recovers the actual component boundaries + contracts, and audits them against the same rules (DRY, typed boundaries, retry/timeout on external I/O, RLS, failure handling).

No SPEC/PSEUDO required. Code is the input.

### Steps

1. **Recover components.** Map real modules to responsibilities; flag any with >1 responsibility (SRP) or duplicated logic across modules (DRY — cite both paths).
2. **Contract audit.** Every cross-module / external boundary: is the shape a named type/Zod schema, or a loose/anonymous object? Loose object at a boundary = finding. Error returns typed, or bare strings/throws?
3. **Integration audit.** Every external call (DB, API, queue): retry policy, timeout, circuit breaker present? Missing any = finding (cross-reference the failure inventory).
4. **State + error taxonomy.** Stateful entities with illegal transitions reachable in code (Step 9 rules)? Error codes ad-hoc per call site instead of one canonical enum (Step 10)?
5. **Defer** storage detail to `cfn-data --review` and ops/deployment to a `cfn-ops` review — arch keeps boundaries, contracts, failure inventory.

### Output

Write `planning/AUDIT_ARCH_<slug>.md`: findings table (`file:line | concern | rule | severity | fix`). Empty = PASS, state it. Third leg of the reverse trio after `cfn-data --review` and `cfn-ux --review`.

## Anti-Patterns

- New component when an existing one already does the job (DRY violation)
- Adding a NEW dependency when stdlib, a native platform feature, or a few lines suffice (ladder rung 8)
- Hand-rolling crypto, auth, or input sanitization to dodge a dependency (rung 8 security carve-out — a vetted dep wins)
- Adopting a dependency release with no cooldown, or pinning to an old release without watching it for CVEs
- Anonymous types/shapes at component boundaries
- External integration without retry/timeout/circuit breaker policy
- Database table without RLS policy
- Skipping failure mode inventory because "happy path is what matters"
- Inventing new shared types instead of reusing existing ones

## Related

- Canonical orchestrator: `cfn-megaplan` (runs arch at DAG level 5; its dependency table is authoritative for scheduling; hands storage→`cfn-data`, ops→`cfn-ops`, route-map→`cfn-ux`)
- Previous phases: `cfn-spec`, `cfn-pseudo`; parallel: `cfn-ux`; upstream data: `cfn-data`
- Lighter orchestrator: `cfn-spa-plan`
- Downstream: `/write-plan` consumes ARCH + SPEC + PSEUDO
- Post-plan: `/cfn-plan-review` validates against codebase (invoked internally by `cfn-megaplan`)
