---
name: cfn-data
description: "Forward database / data-layer design phase of the MegaPlan pipeline. Designs schema, indexes, RLS, migration up+down, lifecycle, concurrency, and privacy FORWARD instead of tracing them backward at review time. Emits the field-bindings table that cfn-ux consumes to derive UI controls. Use after cfn-spec + cfn-decide when the build touches a database."
version: 1.1.0
tags: [planning, megaplan, database, schema, rls, migration, data-layer, field-bindings]
status: production
---

# CFN Data Skill (MegaPlan DAG Level 4)

**Purpose:** Design the data layer forward. Schema, indexes, RLS, migration up/down, lifecycle, concurrency, and privacy are *authored here at plan time*, not traced backward by `cfn-plan-review` after the build is wrong. This phase also produces the **field-bindings table** that `cfn-ux` reads to pick the correct control for every field (the source-of-truth that kills the dropdown-class bug).

**Phase:** `data` — DAG level 4. Conditional on the `db` build flag. Agent: `database-architect`.

**Why forward, not backward:** Review-time dependency tracing finds problems after the schema is poured. Designing the schema, its access policy, and its lifecycle up front means the implementer cannot wire a table with no RLS, an unscoped delete, or a migration that cannot roll back. Design is cheaper than catch.

## When to Use

- The spec sets the `db` build flag (touches a table, schema, or persisted state).
- Auto-invoked by `cfn-megaplan` at level 4, after `spec` and `decide` return.
- Standalone for forward data-layer design of a new feature that persists anything.

Skip only when: no new or changed persisted state (pure compute, pure UI, read-only against an existing locked schema with no new query pattern).

## Input

Required:
- `planning/SPEC_<slug>.md` — entities, success criteria, query patterns, NFRs.
- `planning/DECISIONS_<slug>.md` — storage/tradeoff decisions already locked by `cfn-decide`.

Refuse to run if `SPEC_<slug>.md` is missing or in `draft` status with unresolved `[OPEN]` gaps on the data model.

## Orchestrator contract

`cfn-megaplan` passes:

```
Tier: <mvp|beta|enterprise>   Directive: <full|light>
Include extras: <...>   Omit: <drops>
Floor (forced on, never skip): rls, auth_boundaries, secrets_handling, no_unscoped_delete, pii_if_present
```

Tier resolution for this phase:

| Tier | Active phases | Dropped |
|---|---|---|
| mvp | schema, field-bindings, indexes, RLS+auth (floor), migration up/down | lifecycle, multi_tenancy, concurrency |
| beta | mvp set + lifecycle + concurrency/idempotency | multi_tenancy |
| enterprise | beta set + multi_tenancy + compliance + retention | — |

**Floor override is absolute.** A `light` (mvp) run still authors an RLS policy per new table, names the auth boundary, and routes secrets correctly. `pii_if_present` forces the privacy section on even at mvp when the data is personal or financial. No tier knob and no user downgrade disables a floor item.

## Security FLOOR (never scales down)

These hold at every tier. They come from the user's global CLAUDE.md and are non-negotiable.

1. **RLS per new table, in the same migration.** Every `CREATE TABLE` is followed by `ENABLE ROW LEVEL SECURITY` and at least one explicit policy. Default-deny: no permissive policy means no access. Author an explicit allow for each role that needs it.
2. **No unscoped DELETE/TRUNCATE.** Every delete carries a `WHERE` that targets only the intended rows. Test cleanup identifies its rows by marker convention (test URLs contain `example.com`, slugs start with `test-workspace-`, emails match `test-%@integration.test`). Never `TRUNCATE` and never disable FK checks (`session_replication_role`) to dodge cleanup ordering.
3. **Explicit schema qualification.** Every table reference is `schema.table` (e.g. `public.users`). Never rely on `search_path`.
4. **Reversible migrations.** Every migration has a `down` direction, OR documents in one line why it is irreversible (data-destroying backfill, type narrowing with loss).
5. **Schema-sync close-out.** The plan ends with `~/.claude/skills/supabase-schema-sync/execute.sh` so agent context reflects the new schema.
6. **PII is a floor item.** If the data is personal or financial, retention policy + access controls are forced on even at mvp.

## Protocol

### Step 1: Schema design

For every entity that persists, define:

- **Table name, schema-qualified** (`public.enrollments`).
- **Columns:** name, type, nullable, default, constraint. Cite the spec criterion each column serves.
- **Primary key** and **foreign keys** (schema-qualified target, on-delete behavior: `CASCADE` / `RESTRICT` / `SET NULL`, justified).
- **Check constraints, uniqueness, enums.** Prefer a DB-level constraint over app-level validation (build-ladder rung 4: native platform feature).
- **Enum columns:** trace every value through all consumers (DB constraint, serializer, API handler, UI renderer). A new enum value here is a code change in the same commit.

Pull the actual current schema before designing against it. Do not design from memory. Use `./.claude/skills/db-query/execute.sh` or the db-query SKILL to dump existing tables this feature touches.

### Step 2: Field-bindings table (the cfn-ux feed)

This is the load-bearing output of this phase. `cfn-ux` reads it to derive the control for every user-editable field; it cannot guess control types correctly without it.

**Completeness rule:** Emit a row for EVERY column of every new/changed table except surrogate PKs and audit columns (id, created_at, updated_at). Set UI access to editable/readonly/none; each `none` needs a one-line justification. Over-inclusion is free; omission is the dropdown bug.

**Closed vocabulary (binding kinds):** the canonical nine tokens are `FK | enum | lookup | boolean | date | timestamp | free-text | numeric | multi-FK`. These nine tokens are the closed vocabulary; emit no other value. cfn-ux matches the Binding kind cell byte-for-byte against its derivation map; an unmatched token routes back here as a cfn-data defect.

Binding kinds and the control they imply downstream:

| Binding kind | Means | cfn-ux derives |
|---|---|---|
| FK | foreign key to one row in another table | select / combobox (search if >20 rows), value ∈ table |
| enum | constrained to a fixed value set | select, or radio if ≤4 |
| lookup | reference/dimension table (small, stable) | select |
| boolean | true/false | toggle / checkbox |
| date | date, no time component | date picker, range validation |
| timestamp | date + time | datetime picker, range validation |
| free-text | unconstrained string | input / textarea, length + pattern |
| numeric | number with range | stepper / slider, min/max |
| multi-FK | many rows in another table (join table) | tag / chip multiselect |

Table format (required in the artifact, 8 columns, pinned):

```
| Field | Type | Binding kind | Source table/enum | Required | Options/rows (count or est.) | Range/length | UI access |
| course_id | uuid | FK | public.courses | yes | 12 rows | - | editable |
| status | text | enum | enrollment_status | yes | 4 values | - | readonly |
| notes | text | free-text | - | no | - | <=500 chars | editable |
```

Options/rows for FK/lookup: run a COUNT(*) via db-query or state the spec estimate; never leave blank. Range/length: copy the CHECK/length constraint from Step 1; `-` only if genuinely unconstrained.

Consumer (cfn-ux section 1) matches this table byte-for-byte; unmatched values route back as producer defects.

### Step 3: Index design

For every index, name the query pattern from the spec that justifies it. No speculative indexes.

- Index FKs used in joins or filtered lookups.
- Index columns in `WHERE`, `ORDER BY`, and `GROUP BY` on hot paths named in the spec.
- Composite indexes ordered by selectivity; state the query they serve.
- Partial / unique indexes where the constraint or query warrants.

```
| Index                          | Columns              | Serves query                          |
|--------------------------------|----------------------|---------------------------------------|
| idx_enrollments_course         | course_id            | list enrollments for a course (SPEC AC-4) |
| uq_enrollments_user_course     | user_id, course_id   | enforce one enrollment per user/course |
```

### Step 4: RLS + auth boundary (FLOOR)

For each new table, author the policy in the migration:

- **The role set comes from SPEC §1a Actor Inventory, verbatim.** Its Actor names are the `Principal/role` values below and its `Trust boundary` column names where each principal's identity is established. Do not invent a role here: `cfn-arch` §6 builds its AuthZ matrix from the same §1a table at L5, and a role set invented independently at L4 does not have to agree with it. An actor that needs data access but has no policy — or a policy naming a principal absent from §1a — is a defect; route back to `cfn-spec`. §1a is required whenever `db: yes` precisely so this floor has a source.
- **State the auth boundary.** Who is the principal? (`auth.uid()`, a service role, a tenant claim.) Where is identity established (§1a `Trust boundary`; cross-reference SPEC NFRs and `cfn-arch` AuthN)?
- **Default-deny.** `ENABLE ROW LEVEL SECURITY` with no policy = no access. List each policy as an explicit allow.
- **One policy per operation/role** (SELECT/INSERT/UPDATE/DELETE). Name the `USING` and `WITH CHECK` predicate.
- **Every §1a actor is accounted for per table:** an explicit allow policy, or an explicit note that it has no access to that table. An `anonymous` actor in §1a with no stated policy is the exact path to an accidental permissive read.
- Service-role writes that bypass RLS must be named explicitly and justified. §1a `Kind = service` enumerates the candidates; a service actor bypassing RLS with no justification here is a floor violation.

Emit the per-operation policy table (pinned shape, required in the artifact):

```
| Table | Operation | Principal/role | USING | WITH CHECK |
```

Completeness rule: every new table x each of SELECT/INSERT/UPDATE/DELETE gets a row; intentionally-disallowed operations get an explicit `(no policy - default-deny)` row; a missing row is a floor violation.

### Step 5: Migration up / down

- **Up:** ordered so FK targets exist before referencing tables. CREATE TABLE -> constraints -> indexes -> ENABLE RLS -> policies, per table.
- **Down:** exact reverse, or a one-line note on why it is irreversible.
- **In-flight data during cutover:** if the migration changes an existing table, state what happens to existing rows mid-deploy. Backfill order, default for the new column, whether the old code path still works against the new schema (expand/contract). A non-null column added to a populated table needs a default or a backfill step, not a bare `ADD COLUMN NOT NULL`.
- **Migration filename:** `NNNN_descriptive_name.sql`.
- **Rehearsal invocation (reversible migrations):** name the exact command that proves up+down round-trips, verbatim:

  ```
  CFN_SCRATCH_DATABASE_URL=<scratch> ./.claude/skills/cfn-migration-rehearsal/execute.sh --up <NNNN.up.sql> --down <NNNN.down.sql>
  ```

  `cfn-ops` Phase 6 and `cfn-test-plan` Phase 3 cite this line verbatim as executable rollback evidence. An irreversible migration names its one-line reason instead of this command; it is never rehearsed.

### Step 6: Concurrency / idempotency (beta+ extra — G13, G47)

Drop at mvp unless the concurrency is inherent to the feature. Otherwise design:

- **Double-submit / retries:** idempotency key (natural unique constraint or explicit key column) so a retried write does not duplicate.
- **Ordering:** does write order matter? If so, name the ordering guarantee (sequence, timestamp, version column).
- **Locks:** optimistic (version column, compare-and-set) vs pessimistic (`SELECT ... FOR UPDATE`). State which and why. Prefer optimistic unless contention is proven.
- **Race windows:** name the check-then-act gaps and how a constraint or lock closes each.

Emit the pinned concurrency-control table (required in the artifact; one row per control):

```
| CC-id | Mechanism (idempotency-key|unique-constraint|optimistic-lock|pessimistic-lock|ordering) | Entity (schema.table) | Race scenario closed (double-submit|parallel-write|retry-refire|check-then-act) | Enforcement (exact DDL/stmt from §1/§5) | Expected conflict behavior (decidable: 409 DUPLICATE, second write rejected, idempotent 200) |
```

No-concurrency builds emit a single `N/A: <reason>` row. The Expected conflict behavior cell is a decidable claim about what the loser of the race observes (409 DUPLICATE, second write rejected, idempotent 200), never "handled safely".

**Self-check:** every CC row's Enforcement object must already appear in §1 (schema) or §5 (migration). A control citing a constraint or lock statement absent from §1/§5 is an incomplete artifact; fix it before returning.

CC-id is the greppable token `cfn-test-plan` consumes to drive one race-closing test per row, and the key behind Bar A coverage counters `cc_total/cc_mapped`.

### Step 7: Data lifecycle (beta+ extra — G19)

Drop at mvp. Otherwise design the full lifecycle:

- **Seed:** reference/lookup rows the feature needs to function on day one.
- **Backfill:** how existing rows acquire values for new columns. Batched, idempotent, resumable.
- **Retention:** how long rows live, what triggers expiry.
- **Cleanup:** scoped deletes only (`WHERE` targeting expired/test rows). Name the marker convention for test data. Never unscoped.

### Step 8: Privacy / PII / compliance (G22 — FLOOR if `pii` flag)

Forced on when the data is personal or financial, regardless of tier.

- **Classify:** list every column that is PII or financial.
- **Retention policy:** how long PII is kept, deletion trigger (account close, legal window).
- **Access controls:** which roles read PII, masking/redaction at the boundary, audit of access.
- **Enterprise compliance extra:** legal retention windows, right-to-erasure path, data-residency note.

### Step 9: Multi-tenancy isolation (enterprise extra — G33)

Drop below enterprise. Otherwise:

- **Isolation model:** row-level (tenant_id column + RLS predicate) vs schema-per-tenant vs database-per-tenant. State which and why.
- **Tenant key:** where the tenant id comes from (JWT claim, session), how RLS enforces it on every table.
- **Cross-tenant leak prevention:** every tenant-scoped table's RLS predicate includes the tenant key. No query path bypasses it.

### Step 10: Schema-sync (FLOOR close-out)

The plan's final data step:

```bash
~/.claude/skills/supabase-schema-sync/execute.sh
```

Run after the migration applies so the db-query skill and agent context reflect the new schema.

## Output

Write to: `planning/DATA_<slug>.md`

Template:

```markdown
# Data Layer: <task>

**Date:** <YYYY-MM-DD>
**Spec:** planning/SPEC_<slug>.md
**Decisions:** planning/DECISIONS_<slug>.md
**Tier:** mvp | beta | enterprise   **Build flags:** db pii?
**Status:** draft | reviewed | locked

## 1. Schema
### Table: public.<name>
- Columns (name, type, null, default, constraint)
- PK / FKs (target, on-delete)
- Constraints / enums

## 2. Field bindings (cfn-ux feed)
| Field | Type | Binding kind | Source table/enum | Required | Options/rows (count or est.) | Range/length | UI access |
(every column of every new/changed table except surrogate PKs and audit columns; Binding kind from the closed nine-token vocabulary. Consumer, cfn-ux section 1, matches this table byte-for-byte; unmatched values route back as producer defects.)

## 3. Indexes
| Index | Columns | Serves query |

## 4. RLS + auth boundary
- Principal / auth boundary
| Table | Operation | Principal/role | USING | WITH CHECK |
(every new table x SELECT/INSERT/UPDATE/DELETE; disallowed operations get an explicit `(no policy - default-deny)` row; a missing row is a floor violation)

## 5. Migration
- Up (ordered)
- Down (or irreversible-why)
- In-flight data during cutover
- Filename: NNNN_*.sql
- Rehearsal invocation (reversible; cited verbatim by cfn-ops Phase 6 + cfn-test-plan Phase 3):
  `CFN_SCRATCH_DATABASE_URL=<scratch> ./.claude/skills/cfn-migration-rehearsal/execute.sh --up <NNNN.up.sql> --down <NNNN.down.sql>`

## 6. Concurrency / idempotency   (beta+; mvp: dropped unless inherent)
| CC-id | Mechanism (idempotency-key|unique-constraint|optimistic-lock|pessimistic-lock|ordering) | Entity (schema.table) | Race scenario closed (double-submit|parallel-write|retry-refire|check-then-act) | Enforcement (exact DDL/stmt from §1/§5) | Expected conflict behavior (decidable: 409 DUPLICATE, second write rejected, idempotent 200) |
(no-concurrency builds emit a single `N/A: <reason>` row; every CC Enforcement object appears in §1 or §5; CC-id is the greppable token cfn-test-plan consumes and the Bar A `cc_total/cc_mapped` key)

## 7. Lifecycle   (beta+; mvp: dropped)
- Seed / backfill / retention / scoped cleanup

## 8. Privacy / PII / compliance   (floor if PII present)
- Classified columns / retention / access controls

## 9. Multi-tenancy   (enterprise only)

## 10. Schema-sync
~/.claude/skills/supabase-schema-sync/execute.sh
```

## Example (excerpt)

```sql
-- 0042_create_enrollments.sql  (up)
CREATE TABLE public.enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','active','completed','cancelled')),
  starts_on   date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_enrollments_user_course
  ON public.enrollments (user_id, course_id);          -- one enrollment per user/course
CREATE INDEX idx_enrollments_course
  ON public.enrollments (course_id);                   -- SPEC AC-4: list by course

-- RLS (FLOOR): default-deny, owner-scoped
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrollments_select_own ON public.enrollments
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY enrollments_insert_own ON public.enrollments
  FOR INSERT WITH CHECK (user_id = auth.uid());
```

```sql
-- 0042_create_enrollments.sql  (down)
DROP TABLE IF EXISTS public.enrollments;   -- indexes + policies drop with the table
```

RLS per-operation table (note the two explicit default-deny rows):

```
| Table              | Operation | Principal/role             | USING                | WITH CHECK           |
|--------------------|-----------|----------------------------|----------------------|----------------------|
| public.enrollments | SELECT    | authenticated (auth.uid()) | user_id = auth.uid() | -                    |
| public.enrollments | INSERT    | authenticated (auth.uid()) | -                    | user_id = auth.uid() |
| public.enrollments | UPDATE    | (no policy - default-deny) | -                    | -                    |
| public.enrollments | DELETE    | (no policy - default-deny) | -                    | -                    |
```

Field bindings emitted for cfn-ux (8 columns; every non-audit, non-PK column of the new table appears):

```
| Field      | Type | Binding kind | Source table/enum        | Required | Options/rows (count or est.) | Range/length | UI access |
|------------|------|--------------|--------------------------|----------|------------------------------|--------------|-----------|
| user_id    | uuid | FK           | public.users             | yes      | n/a (server-set)             | -            | none (set from auth.uid(); never user-picked) |
| course_id  | uuid | FK           | public.courses           | yes      | 12 rows (COUNT via db-query) | -            | editable  |
| status     | text | enum         | enrollment_status (CHECK)| yes      | 4 values                     | -            | readonly  |
| starts_on  | date | date         | -                        | yes      | -                            | within course schedule window | editable |
```

Scoped test cleanup (never unscoped):

```sql
DELETE FROM public.enrollments
WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE 'test-%@integration.test');
```

## Self-check (before returning)

Before returning: every new table appears in sections 1, 2, 3, 4 AND 5; counts must match. A table present in section 1 (schema) but missing from field bindings, indexes, the RLS per-operation table, or the migration is an incomplete artifact; fix it before returning.

## Return to orchestrator

- Artifact path: `planning/DATA_<slug>.md`
- 3-line summary (tables created, RLS posture, migration reversibility)
- `[OPEN]` items needing a user decision (ambiguous retention window, unclear tenant key, FK on-delete ambiguity)

## Review Mode (audit implemented code)

Invoked as `cfn-data --review [<migration-dir>|<model-path>|--live]`. Reads the SHIPPED schema instead of designing forward, then audits it against the same floor and emits the real field-bindings table for `cfn-ux --review` to consume.

No SPEC/DECISIONS required. Schema is the input. Source priority: `--live` (pull actual schema via `./.claude/skills/db-query/execute.sh` or the supabase-schema-sync output — read-only, never mutate) > migration files > ORM models.

### Steps

1. **Dump the real schema.** Every table in scope: columns (type, nullable, default), constraints, FKs (both directions), indexes, RLS state + policies, triggers.
2. **Floor audit** (these are violations, not suggestions):
   - **RLS** — any table with no `ENABLE ROW LEVEL SECURITY` + policy. HIGH.
   - **Unscoped delete risk** — any function/trigger/migration with `DELETE`/`TRUNCATE` lacking a row-targeting `WHERE`, or `session_replication_role='replica'`. HIGH.
   - **PII unguarded** — columns matching email/name/phone/address/token with no stated handling. HIGH if present.
   - **Schema-qualification** — queries relying on `search_path` default instead of explicit schema. MED.
3. **Integrity audit:** FK columns without an FK constraint; nullable columns the app treats as non-null at the boundary; aggregate results (`MAX`/`COUNT`) consumed without null/cast handling. MED.
4. **Index audit:** query patterns (from the calling code, if provided) with no supporting index; unused indexes. LOW/MED.
5. **Migration reversibility:** migrations with no `down` / rollback. MED.
6. **Emit real field-bindings.** Same table shape as forward Step 2 — but derived from the actual schema. This is the source of truth `cfn-ux --review` reads so the UI audit is not guessing.

### Output

Write `planning/AUDIT_DATA_<slug>.md`: a floor/integrity findings table (`object | issue | severity | fix`) PLUS the recovered field-bindings table (so the trio chains). Empty findings = PASS, state it.

```
| object | issue | severity | fix |
|--------|-------|----------|-----|
| public.bookings | no RLS policy | HIGH | enable RLS + owner policy in a migration |
| fn cleanup_old() | DELETE without WHERE | HIGH | scope to test/expired rows only |
```

Read-only: this mode never writes to the database and never proposes a destructive migration without the global DELETE/TRUNCATE approval protocol.

## Anti-Patterns

- **Table without RLS.** A `CREATE TABLE` with no `ENABLE ROW LEVEL SECURITY` + policy in the same migration. Floor violation.
- **Unscoped DELETE/TRUNCATE.** Any delete without a `WHERE` that targets only intended rows. Wipes production. Disabling FK checks to dodge cleanup ordering is the same sin.
- **search_path reliance.** Bare `users` instead of `public.users`. Schema must be explicit on every reference.
- **Irreversible migration with no note.** A migration lacking a `down` direction and lacking the one-line reason it cannot have one.
- **Tracing deps at review instead of designing here.** Leaving schema/lifecycle/concurrency for `cfn-plan-review` to discover backward. This phase exists to design them forward.
- **Field omitted from the bindings table.** A UI-touched field not listed means cfn-ux guesses the control. That is the dropdown bug.
- **New enum value in the type only.** Adding a value without tracing it through DB constraint, serializer, API handler, and UI renderer.
- **Speculative index.** An index with no named query from the spec to justify it.
- **ADD COLUMN NOT NULL on a populated table** with no default or backfill step.

## Related

- Upstream: `cfn-spec` (entities, query patterns), `cfn-decide` (storage decisions)
- Orchestrator: `cfn-megaplan` (level 4, conditional on `db`)
- Downstream: `cfn-ux` (reads field bindings), `cfn-arch` (consumes schema), `/write-plan` (synthesizes), `cfn-plan-review` (Bar B)
- Floor close-out: `~/.claude/skills/supabase-schema-sync/execute.sh`
- DB access: `./.claude/skills/db-query/execute.sh`
- Backlog: `docs/PLANNING_PIPELINE_GAPS.md` (G05, G13, G19, G22, G33)
