# role-&lt;slug&gt; Skill Schema

The contract every project-local role skill must satisfy so `cfn-persona-verify` can drive it.

This file is the seam between the global protocol and per-project ground truth. The protocol is symlinked and knows no roles. Role docs are project-local and never symlinked, because a role is ground truth about one shipped app.

Validated mechanically by `validate-role-skills.sh`. A role doc that fails validation is not verified against; the pass exits `3`.

## Design rule: add the table, keep the prose

This schema is deliberately additive. It adopts the section vocabulary already in use (`## Allowed`, `## Denied`, `## Landing + shell`) rather than renaming things to suit itself, and it does not ask you to convert prose into tables.

That is not politeness, it is correctness. A real `## Allowed` entry reads:

> **Edit a SUBMITTED report (PR3 / 0110):** operators may re-open and re-save an already-submitted report; CDRC users get a read-only gate. G5 decided staff is IN, so the TS predicate (`isAdmin`) and the DB gate (`trg_report_submitted_lock`'s `is_admin()`) are the same set. A narrower TS check would make the trigger the real, broader boundary.

No table holds that, and the reasoning is the most valuable thing in the doc. `## Allowed` and `## Denied` stay prose and stay the record. The new `## Capabilities` table holds only what a machine must drive: where to go, what to look for, what counts as success.

## Location and naming

```
<project>/.claude/skills/role-<slug>/SKILL.md
```

One role per file. A file describing four roles cannot be scoped per change, cannot be validated, and rots as a unit. Split it.

`role-<slug>` is the convention, not `persona-*`. A role doc is content, not a verb. `persona-*` names read as an action, which is what invited the procedure to be copy-pasted into each of them. That duplication is what this schema ends.

## Frontmatter

```yaml
---
name: role-manager
actor: manager          # the join key; matches a SPEC 1a actor name verbatim where a spec exists
kind: human-role        # human-role | service | system
version: 1.0.0
status: production
---
```

`actor` binds this doc to the thing the pass is scoping over. A mismatch means the role is silently never checked, so the validator treats it as fatal.

## Required sections

| Section | Holds | Status |
|---------|-------|--------|
| `## Access` | How to authenticate, by env var name only | new |
| `## Capabilities` | The check table (below) | new |
| `## Allowed` | Decision record: what they can do, dated, with refs and rationale | existing, unchanged |
| `## Denied` | Decision record: what they must not do, and why | existing, normalized from `## Denied / special` |
| `## Landing + shell` | Landing page, nav order, identity chrome | existing, unchanged |
| `## Known-state exceptions` | Expected oddities in real data | new |

`## Seed recipes` is required only when a capability declares `Execute: seeded`.

`## Related role skills` is optional and untouched.

`## How to verify` is **removed**. Its generic half ("log in, drive with Playwright") is the global protocol's job now, and its role-specific half becomes the `## Capabilities` table. That section is the duplication this skill exists to delete.

### Why `## Known-state exceptions` is mandatory

It is the section that stops the gate crying wolf, and an empty one is a valid answer (`None known.`). Real example, currently buried inside a `## Allowed` entry:

> 18 of 28 prod cases have no OCA number, so a queue of stalled, un-backfilled cases may render ENTIRELY as `--`. That is the decision working as designed, NOT a defect. The remedy is an OCA backfill, not a code change.

Without that line hoisted somewhere the protocol reads first, every run files the same non-bug. A gate that emits false findings gets ignored, which is the rot the `cfn:` marker convention exists to prevent.

## The capability table

Capabilities cannot be prose. "Manager approves staff work" is unverifiable: an agent that fails to find approval has proven nothing, because it may simply have looked in the wrong place. Absence must be falsifiable, which is the same medicine Bar A applies to acceptance criteria.

```markdown
## Capabilities

| Capability | Entry point | Expected affordance | Observable outcome | Ref | Expect | Execute |
|---|---|---|---|---|---|---|
| Approve staff expense | Expenses queue | "Approve" on a submitted expense | status submitted -> approved | E1 | reachable | observe |
| Approve own expense | Expenses queue | none offered | action rejected, expense stays unapproved | E4 | denied | seeded |
| See File # as case identity | Cases list | first column header reads "File #" | no NYSC-### rendered as identity | PR4 | reachable | observe |
```

| Column | Rule |
|--------|------|
| `Capability` | What this role does, in their words. |
| `Entry point` | A nav path or route. NOT a CSS selector. Selectors rot in a week and duplicate the test plan. The entry point is the user's mental model and is stable. |
| `Expected affordance` | The control, described by what it does. The pass locates it. `none offered` for a denied row. |
| `Observable outcome` | A state change or a rendered fact. Stable and checkable, unlike a selector. |
| `Ref` | Any stable project ref: `FR-12`, `PR4`, `C8`, `E4`, `0111`. Scopes the run and separates `not-yet-built` from a real regression. |
| `Expect` | `reachable` or `denied`. |
| `Execute` | `observe` (default) or `seeded`. |

Naming an entry point is what converts "I did not see approval" from noise into evidence. The doc said where to look; the pass looked there; the control was absent. That is a finding.

### Ref

Any stable id the project already uses. Where a SPEC with an actor inventory exists, use its `FR-<n>` ids and scoping is automatic, because the pass reads the actor's `Touches (FR ids)` from SPEC 1a. Where it does not, use PR numbers or internal codes and tell the pass which refs are in play (`--ref PR4,C8`).

The column's job is to answer one question: is this capability part of what we are building right now? A PR ref answers that as well as an FR id does. What it must never be is empty, because an empty ref is what turns every unbuilt feature into a reported regression on the first run.

### Expect: reachable vs denied

`reachable` is the ordinary case: the control should be there.

`denied` inverts the check. The pass actively tries to reach the capability by any path available to the role and expects to fail. This catches the self-approval class, which no mechanical gate catches and which persona passes are genuinely good at.

## Execute: observe vs seeded

`observe` attempts no writes. It checks whether the affordance is present, enabled, and the outcome reachable. It catches the missing-capability class, which is the main reason this gate exists. It cannot catch a control that looks right and is broken underneath. That gap belongs to the plan's executable checks.

`seeded` attempts a write, under one invariant:

> **The pass may only act on rows it created itself.**

**Any row that could write must be `seeded`, including a `denied` row.** This is the rule that makes a denied-check safe, and it is easy to get backwards. Consider checking that a manager cannot approve their own expense. Run it `observe` and you only learn the button is hidden. Run it as a real attempt against a pre-existing expense and, if the block is broken, you just approved a real person's real expense. That is the exact moment the check was supposed to protect you. Run it `seeded` and a broken block approves the pass's own throwaway row, and you get the finding with no damage.

Safety here comes from the marker invariant, not from the environment. A seeded row is safe even against production, because the pass only ever touches rows it made. An `observe` row is safe anywhere by construction. This is why the schema places no restriction on the target host.

## Seed recipes

Required when any capability is `seeded`.

```markdown
## Seed recipes

### Approve own expense (E4)

- **Marker:** expense description contains `integration-test`
- **Create:** log in as this manager, submit an expense through the UI with the marker in its description
- **Cleanup:** as the same manager, withdraw the expense via the UI
```

| Field | Requirement |
|-------|-------------|
| `Marker` | The project's test-data convention. Every seeded row carries it. |
| `Create` | Preferably through the app as a real actor, not direct SQL. |
| `Cleanup` | Must reference the marker. |

Cleanup rules, enforced by the validator:

- Prefer the app's own affordance over SQL.
- SQL cleanup must be scoped to the marker. Unscoped `DELETE` and any `TRUNCATE` are rejected.
- Never disable FK checks (`session_replication_role = 'replica'`) to fix cleanup ordering. If ordering is a problem, the cleanup is too broad.
- A capability that cannot be cleaned up cannot be `seeded`. Leave it `observe` and accept the weaker check.

## Access

Credentials by env var name only. Never a literal secret. Role docs are committed.

```markdown
## Access

- Login: `/login`
- Account: `$NYSDRA_TEST_MANAGER_EMAIL` / `$NYSDRA_TEST_MANAGER_PASSWORD`
- Target: `$APP_BASE_URL`
```

## Dates and freshness

The protocol's freshness check (Step 3) reads any ISO date (`YYYY-MM-DD`) in the doc, so existing inline dating works as-is and needs no new section:

> **Case identity = OCA "File #" on operator surfaces too (2026-07-16, PR4):** manager no longer sees the internal `NYSC-###` as a case identity. Supersedes the 2026-07-10 audience-split rule.

Dates drive freshness. Content is what separates `implementation-wrong` from `doc-stale`: if the app grants a capability the doc denies, but the doc predates the PR that granted it, the doc is stale and the finding inverts.

A doc with no date anywhere fails validation, because the freshness check has nothing to compare against.

## Migration from an existing role doc

Per doc, mechanical:

1. Add `actor:` and `kind:` to frontmatter.
2. Add `## Access`.
3. Extract `## How to verify` into the `## Capabilities` table, one numbered step to one row. The steps already carry entry points and outcomes; they just need columns.
4. Hoist any "this is working as designed, not a defect" note out of `## Allowed` into `## Known-state exceptions`.
5. Rename `## Denied / special` to `## Denied`.
6. Delete `## How to verify`.

`## Allowed`, `## Denied` prose, `## Landing + shell`, and `## Related role skills` are not touched.

## Related

- `cfn-persona-verify/SKILL.md`: the protocol that consumes this contract.
- `cfn-spec` 1a Actors: the source of `actor` and, where a spec exists, the FR linkage.
- `validate-role-skills.sh`: makes this schema mechanical.
