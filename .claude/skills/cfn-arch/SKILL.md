---
name: cfn-arch
description: "SPARC Architecture phase. Define component boundaries, interface contracts, integration points, DRY reuse BEFORE implementation. Use after cfn-spec and cfn-pseudo to lock structure, catch integration mismatches early."
version: 1.0.0
tags: [planning, sparc, architecture, contracts, components, integration]
status: production
---

# CFN Arch Skill (SPARC Phase 3)

**Purpose:** Convert pseudocode operations into a concrete component design with interface contracts. Catches integration mismatches, missing shared types, and DRY violations BEFORE the implementer wires them wrong.

**Phase:** Architecture (SPARC step 3 of 3 used by `/cfn-spa-plan`).

## When to Use

- After `cfn-spec` and `cfn-pseudo` artifacts exist
- Auto-invoked by `/cfn-spa-plan` orchestrator
- Standalone for architecture review of existing systems

Skip only for: tasks confined to a single existing function with no new interface.

## Input

Required:
- `planning/SPEC_<task>.md`
- `planning/PSEUDO_<task>.md`

Refuse to run if either missing or in `draft` status with unresolved gaps.

## Protocol

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

Group operations into components/modules. Each component has:
- **Name** (kebab-case, matches file/dir)
- **Responsibility** (one sentence, single responsibility principle)
- **Owns** (which operations from PSEUDO)
- **Owns data** (which entities/tables)
- **Does NOT own** (explicit non-responsibilities to prevent scope creep)

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

### Step 3: Data Flow Diagram

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

### Step 4: Integration Points & External Contracts

For every external system (DB, third-party API, queue, cache):
- **System name + version**
- **Contract** (schema, OpenAPI link, or interface)
- **Auth mechanism**
- **Retry policy** (retries, backoff, idempotency key)
- **Timeout** (connect + read)
- **Circuit breaker** (threshold, recovery)
- **Failure mode** (cross-reference PSEUDO Step 5)

### Step 5: Storage & Schema

For every entity that persists:
- **Table/collection name** (with schema qualification, e.g. `public.users`)
- **Columns** with types, nullable, defaults, constraints
- **Indexes** with justification (which query uses each)
- **RLS policy** (REQUIRED for new tables — see global CLAUDE.md)
- **Migration filename** (NNNN_descriptive_name.sql)

### Step 6: Cross-Cutting Concerns

Address each explicitly:
- **AuthN:** how identity is established (cross-reference NFRs in SPEC)
- **AuthZ:** permission checks per operation (table: operation x role)
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

### Step 8: Deployment & Rollout

- New env vars / secrets needed (and where set)
- Feature flag (yes/no, name, default)
- Backwards compatibility plan (if changing existing contract)
- Rollback procedure

### Step 9: State Machines (gap G17)

For every stateful entity in scope, design the lifecycle AT PLAN TIME (not at commit time when `readme/state-machines.md` is updated). For each entity:
- **States** — enumerate every valid state.
- **Transitions** — `from -> to`, the trigger, and the guard condition.
- **Illegal transitions** — states that must be rejected (these become edge-case tests).
- **Diagram** — mermaid or ASCII.

```
Entity: booking
States: draft -> pending -> confirmed -> cancelled | completed
Transition: pending -> confirmed  trigger: payment_ok  guard: seat still available
Illegal: completed -> pending (reject), cancelled -> confirmed (reject)
```

The commit-time `readme/state-machines.md` update is then a copy of this section, not a fresh design.

### Step 10: Error Taxonomy (gap G25 — `error_taxonomy` extra, beta+)

When the orchestrator passes the `error_taxonomy` extra, define a single cross-surface error contract so every component returns the same shape and codes, sourced from one file:
- **Error code enum** — one canonical list (`INVALID_X`, `NOT_FOUND`, `FORBIDDEN`, ...), single source-of-truth path.
- **Shape** — the typed error object every boundary returns (reuse the Step 2 contract style).
- **Mapping** — which operation raises which code, and the HTTP status each maps to.

Skip for `mvp` (light arch drops this extra).

### Under cfn-megaplan: division of labor

When run inside `cfn-megaplan`, defer detail to the dedicated phases to avoid duplication (DRY):
- **Storage (Step 5)** → hand to `cfn-data` when the `db` flag is set; arch keeps only the component-level data ownership, cfn-data owns schema/index/RLS/migration detail.
- **Deployment + observability + failure mitigation (Steps 6-8)** → hand to `cfn-ops` for beta+ tiers; arch keeps the failure *inventory*, cfn-ops owns the mitigation *design* (circuit breakers, rollout, runbook).
- Standalone (no megaplan), arch covers all ten steps itself.

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
### <component-name>
- Responsibility:
- Owns operations:
- Owns data:
- Does NOT own:

## 2. Interface Contracts
```typescript
interface ...
```

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
```

## Handoff

This artifact + SPEC + PSEUDO form the complete SPA bundle. Hand off to `/write-plan` which converts SPA into implementation roadmap + agent dispatch.

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

- Previous phases: `cfn-spec`, `cfn-pseudo`
- Orchestrator: `cfn-spa-plan`
- Downstream: `/write-plan` consumes ARCH + SPEC + PSEUDO
- Post-plan: `/cfn-plan-review` validates against codebase
