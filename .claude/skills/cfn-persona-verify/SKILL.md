---
name: cfn-persona-verify
description: "Role-coherence gate. Drives the running app as a named role, using that project's local role-<slug> skills as ground truth, and flags capabilities the role should have but cannot reach (and denied ones it can). Catches the class no mechanical gate catches: correct, coherent, tests green, and nonsense for the person using it. Observe-only by default; writes are opt-in per capability and may only touch rows the pass created. Emits a cfn-vote-implement manifest. Never auto-fixes and never rewrites role docs."
version: 1.0.0
tags: [persona, role, verification, playwright, gate, ux]
status: beta
---

# CFN Persona Verify

**Purpose:** Drive the running app as a named role doing that role's actual job, and report where the implementation stops making sense from inside that role's head. Findings route through `/cfn-vote-implement`. This skill never auto-fixes code and never rewrites a role doc.

Status is `beta`: the protocol is unproven against a live app. The role-doc schema is enforced mechanically (`validate-role-skills.sh`, 21 controls). The walk itself is not.

## The gap this fills

| Gate | Question it answers |
|------|--------------------|
| `verifiable-done` (Bar A) | Is every acceptance criterion executable? |
| `haiku-executable` (Bar B) | Is every step unambiguous? |
| `cfn-loop-task` verification | Does the code do what the plan said? |
| **this skill** | **Does the result make sense to the person using it?** |

Every gate above compares the implementation to the plan. None compare the implementation to the role's reality. The failure class here is a build that is correct, coherent, mechanically green, and still wrong for the actor: a manager with no way to approve their staff's work, an approver who can approve their own submission, a coordinator whose landing page is a dead end.

This is the verify-time counterpart to `cfn-spec` 1b (Interaction Intent Walk). 1b catches intent drift while planning. This catches it after it ships.

## Protocol owns procedure, projects own content

This skill is global and symlinked. It holds zero role knowledge. Role knowledge is per-project ground truth and lives in the project at `.claude/skills/role-<slug>/SKILL.md`.

The seam between them is `ROLE_SKILL_SCHEMA.md`, a required-section contract. Same pattern as SPEC 1a: one side declares the contract, the other fills it, neither owns both.

```
GLOBAL (this skill, symlinked)        PROJECT (never symlinked)
  how to discover roles          -->    .claude/skills/role-manager/SKILL.md
  how to drive the app                  .claude/skills/role-staff/SKILL.md
  how to classify a mismatch            .claude/skills/role-cdrc/SKILL.md
  manifest + report format
  the role-doc schema contract
```

A `## How to verify` section inside a role doc is this protocol, copy-pasted. That is the duplication this skill deletes; the validator rejects it.

## Step 1: Discover

1. Enumerate `.claude/skills/role-*/SKILL.md` in the current project.
2. Validate them: `./.claude/skills/cfn-persona-verify/validate-role-skills.sh`. Any violation exits `3`. Do not verify against a doc that failed the schema.
3. Where `planning/SPEC_*.md` has a `1a. Actors` section, use it as the actor list and resolve each actor to the role doc whose frontmatter `actor:` matches verbatim. Report, do not guess:
   - Actor in 1a with no role skill: gap. That actor cannot be verified.
   - Role skill matching no 1a actor: dead doc. Flag for deletion or for a missing 1a row.
4. Where no SPEC exists, the role docs are the actor list. Scoping comes from `--ref` instead (Step 2).

## Step 2: Scope

Run only roles the change touches. Not every role, every time.

- **With a SPEC:** an actor is in scope if its 1a `Touches (FR ids)` intersects the FR ids the change implements. Automatic.
- **Without a SPEC:** pass the refs in play (`--ref PR4,C8`). A role is in scope if any of its capability rows cite one.

Name every skipped role and why. A silently skipped role reads as a passing role.

## Step 3: Check freshness before trusting the doc

Compare the role doc's most recent ISO date against the change under review. A role doc older than the subsystem it describes is a finding in its own right, not a silent assumption. Report it; do not let it quietly become the baseline.

## Step 4: Drive

Log in per `## Access`. Do that role's actual job. Not a feature-by-feature click-through: walk the job the `## Capabilities` table describes, in the order a real person would.

Read `## Known-state exceptions` first, before filing anything. It is the list of things that look like bugs and are not.

For each capability row:

| `Expect` | Check |
|---|---|
| `reachable` | Navigate to `Entry point`. Locate `Expected affordance`. Determine whether `Observable outcome` is reachable. |
| `denied` | Attempt to reach it by any path available to this role, including direct URL. Expect failure. |

`## Allowed` and `## Denied` are prose and are the decision record, not the checklist. Read them for the why, especially when deciding whether a mismatch is a bug or a superseded decision (Step 6). The table is what you drive.

## Step 5: Execution safety

`observe` is the default and attempts no writes. It covers the primary case: a manager who navigates to the expenses queue and finds no Approve control on a submitted expense is a finding, established without writing anything.

`seeded` attempts a write, under one invariant:

> **The pass may only act on rows it created itself.**

**Any row that could write must be `seeded`, including a `denied` row.** This is the rule that is easy to get backwards, and getting it backwards is how a verification pass damages real data. Checking that a manager cannot approve their own expense, by really attempting it against a pre-existing expense, means that if the block is broken you just approved a real person's real expense. That is the exact moment the check existed to protect you. Seeded, a broken block approves the pass's own throwaway row and you get the finding with no damage.

Safety comes from the marker invariant, not from the environment. A seeded row is safe even against production, because the pass only ever touches rows it made. An `observe` row is safe anywhere by construction. This skill therefore places no restriction on the target host, and verifying against a real deployment (where the real roles and real data live) stays viable.

Seed recipes declare `Marker`, `Create`, and `Cleanup`; the validator enforces that cleanup is scoped to the marker and rejects unscoped `DELETE`, any `TRUNCATE`, and FK-check disabling. Always clean up what you created, including on failure.

`cfn: seeded execution trusts the project's marker convention. Upgrade trigger: a dedicated test tenant per project, if marker collisions with real data ever appear.`

## Step 6: Classify every mismatch

An unclassified mismatch is what teaches people to ignore the gate. Every finding is exactly one of three:

| Classification | Meaning | Route |
|---|---|---|
| `implementation-wrong` | Doc is current, ref is in this change, app does not match. | Manifest -> `/cfn-vote-implement` |
| `doc-stale` | App is right, role doc describes a superseded decision. | Doc-update proposal -> user. Never auto-written. |
| `not-yet-built` | Capability's ref is not in this change. Absence is expected. | Report only. Optional `docs/BACKLOG.md` note. |

The `not-yet-built` bucket is load-bearing. Without it, the first run on any mature project reports every unbuilt feature as a regression and the gate is unusable on day one. The `Ref` column is what separates the buckets, which is why `ROLE_SKILL_SCHEMA.md` forbids an empty one.

Distinguishing `implementation-wrong` from `doc-stale` is what `## Allowed` prose is for. If the app grants something the doc denies, but the doc's entry predates the PR that granted it, the doc is stale and the finding inverts.

## Step 7: Outcomes per capability

| Outcome | Meaning |
|---------|---------|
| `pass` | `reachable` row: affordance present, enabled, outcome reachable. |
| `denied-ok` | `denied` row: correctly unreachable by every attempted path. |
| `fail` | `reachable` row unreachable, or `denied` row reachable. Becomes a finding, classified per Step 6. |
| `blocked` | The check could not run. No seed data, login failed, entry point 404s for an unrelated reason. |

`blocked` is a first-class outcome and is never reported as `pass`. A pass that had nothing to click proves nothing. Report every `blocked` with the reason.

## Outputs

Two artifacts, deliberately separate.

**1. Manifest** (`implementation-wrong` findings only), at `<project-root>/.cfn-cache/manifests/cfn-persona-verify-<ns>.json`, in the shared `cfn-vote-implement` schema:

```json
{
  "review_id": "persona-verify-<ns>",
  "source": "cfn-persona-verify",
  "generated_at": "ISO-8601",
  "status": "pending_review",
  "actors_checked": ["manager", "staff"],
  "actors_skipped": [{"actor": "board", "reason": "no ref overlap with this change"}],
  "suggestions": [
    {
      "id": "S001",
      "category": "missing-capability",
      "tag": "fix",
      "one_liner": "manager: no Approve affordance on a submitted expense (E1)",
      "title": "Manager cannot approve a staff expense",
      "description": "role-manager declares 'Approve a staff expense' at the Expenses queue, reaching status submitted -> approved. Drove as manager: submitted rows render, no Approve control present or reachable by any path.",
      "files": ["role-manager :: Capabilities :: Approve a staff expense", "E1"],
      "impact": "high",
      "effort": "medium",
      "suggested_approach": "Entry point resolves and lists submitted rows, so this is a missing affordance rather than a routing fault. See role-manager ## Allowed for the decision record.",
      "status": "pending",
      "related_suggestions": []
    }
  ]
}
```

Mapping: `fail` on a `reachable` row -> `category: missing-capability`, `tag: fix`. `fail` on a `denied` row -> `category: privilege-leak`, `tag: block`. Friction or coherence gaps with no correctness impact -> `tag: harden`. Stale-doc and not-yet-built findings never enter the manifest.

**2. Doc-update proposals** (`doc-stale` findings), surfaced via `AskUserQuestion`, batched 4 per call. Each proposes a dated entry for the role doc's `## Allowed` or `## Denied` prose. The user accepts or rejects. This skill never writes to a role doc.

The propose-never-write rule is the point. Auto-writing observed behavior into ground truth is how a bug becomes "working as designed" permanently. Those entries are human calls with dates and PR refs, and they stay that way.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | All in-scope capabilities passed. No manifest. |
| 1 | Findings. Manifest emitted, or doc proposals surfaced, or both. |
| 2 | Usage error: no role docs found, or no in-scope role resolved. |
| 3 | A role doc failed `ROLE_SKILL_SCHEMA.md` validation. |
| 4 | Runtime error: browser launch, login, or navigation failure. |

## Rules

- Local only. Not CI, not a GitHub Action.
- Never auto-fix. Findings route through `/cfn-vote-implement`.
- Never write to a role doc. Propose, and let the owner decide.
- Never act on a row the pass did not create.
- Never report `blocked` as `pass`.
- Read `## Known-state exceptions` before filing any finding.
- Never invent an actor or a capability. If no role doc declares it, it is not checked.
- `block`-tagged findings are merge blockers regardless of vote outcome.

## Usage

```bash
# validate the project's role docs against the schema first
./.claude/skills/cfn-persona-verify/validate-role-skills.sh

# spec-backed project: scoping is automatic from SPEC 1a
/cfn-persona-verify --fr FR-12,FR-13

# no spec: name the refs in play
/cfn-persona-verify --ref PR4,C8

# route findings through voting
/cfn-vote-implement latest
```

The walk is invoked as a skill, not a script: it needs judgment. Only the schema check is a script.

## Related

- `ROLE_SKILL_SCHEMA.md`: the contract each project's `role-<slug>` skill must satisfy, and the migration steps for an existing doc.
- `cfn-spec` 1a Actors: the actor inventory this skill resolves against where a spec exists.
- `cfn-spec` 1b Interaction Intent Walk: the plan-time counterpart to this check.
- `/cfn-vote-implement`: votes on and routes the findings. Never implement them manually.
- `cfn-a11y-gate`, `cfn-security-review`: same emit-manifest, never-auto-fix flow.
