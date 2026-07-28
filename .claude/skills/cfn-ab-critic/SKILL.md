---
name: cfn-ab-critic
description: "MUST BE USED when an acceptance criterion carries a `reference` key: blind A/B comparison of the build artifact vs the reference, emits a vote-manifest. Use PROACTIVELY in cfn-loop-task Phase 4 for visual/writing/polish ACs."
version: 1.0.0
tags: [gate, critic, ab-compare, reference, quality]
status: beta
---

# CFN AB Critic

**Purpose:** Compare the build artifact ("ours") against an acceptance criterion's `reference` artifact BLINDLY — labels shuffled so the critic cannot tell which is ours — and emit a vote-manifest consumed by `/cfn-vote-implement`. The executable AC `check` still owns pass/fail; this is an additional quality layer that the AC opts into by carrying a `reference` key (validated by `check-verifiable-static.sh` check 1g).

Status is `beta`: the deterministic machinery (shuffle, manifest shape, routing) is mechanically tested; the LLM judgment step is driven by the agent following this doc and is not unit-testable.

## The gap this fills

| Gate | Question it answers |
|------|--------------------|
| `verifiable-done` (Bar A) + check 1g | Does the AC carry a valid `reference`? |
| the executable `check` | Does the build do what the AC literally said? |
| `cfn-persona-verify` | Does the result make sense to the person using it? |
| **this skill** | **Does the build's artifact actually beat the named reference, when neither is labeled "ours"?** |

The failure class here is a builder grading its own homework: an implementation that meets the letter of the AC but is visibly worse than the reference artifact the AC pointed at. Stripping the "ours" label is what makes the comparison honest — the critic picks the better artifact without knowing which one it produced.

## The blind mechanic (propose-never-write)

This skill runs as a Claude skill, so the LLM IS the critic. The blind is enforced mechanically by how `execute.sh` constructs the prompt and un-shuffles the verdict:

1. **Phase 1 (no verdict yet).** Run `execute.sh`. It computes a deterministic A/B label assignment per AC (see *Determinism* below), prints a prompt that shows ONLY `artifact_A` and `artifact_B` paths, and exits 0 without writing a manifest. The prompt reveals nothing about which side is ours.
2. **You compare.** Using the dispatch table below, ingest both artifacts. Pick the one that better satisfies the AC's quality bar. Produce a verdict per AC: `{raw_winner: "A"|"B"|"tie", confidence: 0..1, biggest_gap: "one sentence"}`.
3. **Phase 2 (commit).** Write the verdicts to a JSON file and re-run `execute.sh --winner-file`. It un-shuffles your raw A/B pick back to `ours`/`reference`/`tie`, emits the manifest, and exits per the routing table.

The propose-never-write rule: this skill NEVER modifies the build artifact. It only emits suggestions. Fixes route through `/cfn-vote-implement`, where the 3-agent vote decides whether they land.

## Invocation

```bash
# Phase 1: emit the blinded prompt
/cfn-ab-critic --ac AC-7,AC-12 [--iteration N] [--verify VERIFY_<slug>.md]

# Phase 2: after you have written verdicts to /tmp/verdicts.json
/cfn-ab-critic --ac AC-7,AC-12 --winner-file /tmp/verdicts.json
```

Arguments:

| Arg | Required | Purpose |
|-----|----------|---------|
| `--ac id,id,...` | yes | Comma-separated AC ids. |
| `--iteration N` | no | Iteration index (default 0). Part of the shuffle seed. |
| `--verify FILE` | no | JSON map `{AC: {reference, ours}}`, or a VERIFY markdown doc using the line grammar `AC-<id>: reference=<path> ours=<path>`. |
| `--ours p1,p2,...` | no | Build artifact paths, parallel to `--ac`. Overrides `--verify`. |
| `--reference r1,r2,...` | no | Reference artifact paths, parallel to `--ac`. Overrides `--verify`. |
| `--threshold 0..1` | no | Confidence threshold (default `0.75`, or `$CFN_AB_CRITIC_THRESHOLD`). |
| `--winner-file FILE` | no | JSON verdict map (phase 2). |
| `--emit-fixture-winner A\|B\|tie` | no | TEST HOOK. Canned raw winner for all ACs; skips the LLM judgment so routing is unit-testable. |
| `--out FILE` | no | Manifest output path (default auto-timestamped). |

Per-AC resolution precedence for artifacts: explicit `--ours` / `--reference` win, else `--verify`, else the AC is recorded `status: blocked` (the run never crashes on a missing artifact).

## Artifact ingest dispatch

Symmetric, by extension. Apply the same dispatch to both `artifact_A` and `artifact_B`.

| Artifact | Tool |
|----------|------|
| `.png` `.jpg` `.jpeg` `.webp` `.gif` | vision: `mcp__zai-mcp-server__analyze_image` (or `mcp__4_5v_mcp__analyze_image`) — non-Anthropic, provider-ban compliant |
| local text / `.html` / `.md` / `.ts` / `.rs` / `.go` / etc. | `Read` |
| remote `http(s)://` HTML | `mcp__web_reader__webReader` |
| `.webm` `.mp4` `.mov` `.avi` `.mkv` | UNSUPPORTED — comparison recorded `status: blocked` with `blocked_reason` |

Video and remote non-HTML artifacts are blocked in v1 rather than compared badly. A blocked comparison is recorded, never crashes the run, and contributes to exit code 4 when every comparison is blocked.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Clean: every comparison won by ours at confidence >= threshold. No suggestions. (Also returned in phase 1, where it means "blinded prompt emitted, awaiting verdicts".) |
| 1 | Findings: one or more suggestions emitted. |
| 2 | Usage error (bad CLI args). |
| 3 | Schema violation: winner-file `raw_winner` not `A`/`B`/`tie`, or `confidence` out of `[0,1]`. |
| 4 | Blocked: every comparison blocked (missing / unreadable / unsupported artifact). Manifest still emitted with the blocked records. |

`blocked` is a first-class outcome and is never reported as success. Per-AC blocks go into `comparisons[]` with a named `blocked_reason`; they never crash the whole run.

## Manifest schema

Emitted at `<project-root>/.cfn-cache/manifests/cfn-ab-critic-<nanosecond-timestamp>.json`, in the shared `cfn-vote-implement` suggestion shape. The discovery glob in `/cfn-vote-implement` already lists `cfn-ab-critic-*.json`.

```json
{
  "review_id": "ab-critic-<ns>",
  "source": "cfn-ab-critic",
  "generated_at": "<ISO-8601>",
  "status": "pending_review",
  "comparisons": [
    {"ac_id":"AC-7","ours_artifact":"<path>","reference_artifact":"<path>",
     "label_assignment":{"A":"ours","B":"reference"},
     "raw_winner":"A","winner":"ours","confidence":0.72,
     "biggest_gap":"<one sentence>","status":"compared"}
  ],
  "suggestions": [
    {"id":"S001","category":"reference-gap","tag":"polish",
     "one_liner":"<imperative>","title":"<...>","description":"<...>",
     "files":["AC-7"],"impact":"medium","effort":"medium",
     "suggested_approach":"<critic fix>","status":"pending"}
  ]
}
```

- `comparisons[]` is ALWAYS emitted (audit record, including blocked ones).
- `label_assignment` records which side was ours, so a reviewer can re-derive the shuffle and confirm the blind was not gamed.
- A suggestion is emitted ONLY when `winner != "ours"` OR `confidence < threshold`. When all pass: `suggestions: []`, exit 0.
- `confidence` is asserted to lie in `[0,1]`; out-of-range verdicts exit 3.

The `suggestions[]` field set is the folk-defined shared shape owned by `cfn-dry-review/SKILL.md` and consumed by `cfn-vote-implement/SKILL.md` (3/3, 2/3, 1/3, 0/3 routing). For the canonical field list (`id, category, tag, one_liner, title, description, files, impact, effort, suggested_approach, status`), reference those two files — this skill mirrors it exactly and does not redefine it.

# cfn: suggestion schema copied (N+1)th time across producers; extract shared suggestion-schema.md when a 2nd drift bug lands

### Tag routing

| Condition | `tag` | `impact` |
|-----------|-------|----------|
| `winner == reference` AND `confidence >= 0.9` | `block` | `high` (merge-blocker regardless of vote, mirroring `cfn-persona-verify`'s block rule) |
| `winner == reference` AND `confidence >= threshold` | `fix` | `medium` (reference clearly beat ours = behavior likely off) |
| `winner == reference` (low conf), `tie`, or `winner == ours` with `confidence < threshold` | `polish` | `medium` (or `low` when ours still won) |

## Determinism and audit trail

The A/B assignment is a pure SHA-256 derivative of `(ac_id, iteration)` — no `$RANDOM`, no `Math.random`, no wall-clock seeding:

```
HASH = sha256(ac_id "|" iteration)   # first 16 hex chars
ASSIGNMENT = (0xHASH[0:8]) % 2       # 0 -> A=ours,B=reference ; 1 -> A=reference,B=ours
```

Same `(ac_id, iteration)` ALWAYS reproduces the assignment. `lib/shuffle.sh` is sourceable so any reviewer can re-derive it:

```bash
source .claude/skills/cfn-ab-critic/lib/shuffle.sh
label_assignment AC-7 0     # -> A=ours,B=reference
```

Because the assignment is reproducible, the value recorded in `comparisons[].label_assignment` is a real audit trail, not a claim. A reviewer re-runs the helper and confirms the manifest did not quietly swap labels to make "ours" win.

## Rules

- Never let the builder grade itself. The phase-1 prompt reveals ONLY `artifact_A` / `artifact_B`.
- Never modify the build artifact. Propose, and let `/cfn-vote-implement` route the fix.
- Never report `blocked` as success.
- `block`-tagged findings are merge blockers regardless of vote outcome (same rule as `cfn-persona-verify`).
- Confidence outside `[0,1]` is a schema violation (exit 3), not a salvageable verdict.

## v1 limitations

- Auto-wiring into the `cfn-loop-task` gate table lands in a follow-up; today invocation is manual via `/cfn-ab-critic`.
- `--verify` markdown parsing reads only the simple `AC-<id>: reference=<path> ours=<path>` line grammar. The JSON map form is the contract; richer verify docs should emit a JSON sidecar.
- Remote non-HTML artifacts and video are blocked, not compared.

## Related

- `check-verifiable-static.sh` check 1g: the `reference` key contract this skill consumes.
- `cfn-persona-verify/SKILL.md`: structural sibling — same propose-never-write flow, same manifest-then-vote shape, same `blocked` is never `pass` rule.
- `cfn-dry-review/SKILL.md`: the canonical suggestion field set this skill mirrors.
- `/cfn-vote-implement`: consumes this manifest (discovery glob `cfn-ab-critic-*.json` is already listed).
