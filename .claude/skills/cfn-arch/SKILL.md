---
name: cfn-arch
description: "SPARC Architecture phase. Define component boundaries, interface contracts, integration points, and DRY reuse opportunities BEFORE implementation. Use after cfn-spec and cfn-pseudo to lock structural decisions and catch integration mismatches early."
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

Before designing anything new, query the codebase for existing capabilities. Use `/codebase-search` for every Operation listed in PSEUDO. Categorize each operation:

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
