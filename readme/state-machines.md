# State Machines

Entity lifecycle documentation for stateful CFN systems.

---

## GOAP Planner

**States:** `planning | plan_found | unreachable`

| From | To | Trigger |
|------|----|---------|
| planning | plan_found | A* finds path to goal |
| planning | unreachable | max_iterations exhausted or no applicable actions |
| plan_found | planning | replanning requested (excluded actions changed) |

---

## Agent Selection (GOAP substitution)

**States:** `selecting | substitute_found | no_substitute`

| From | To | Trigger |
|------|----|---------|
| selecting | substitute_found | planner finds agent with unmet exclusions |
| selecting | no_substitute | all pool agents excluded |
| substitute_found | selecting | substitute also fails to spawn (retry with expanded exclusions) |

---

## Error Recovery (GOAP)

**States:** `error_detected | recovering | resolved | escalated`

| From | To | Trigger |
|------|----|---------|
| error_detected | recovering | planner selects retry_with_backoff, repair_docker_env, or allocate_resources |
| error_detected | escalated | budget exhausted or circuit open |
| recovering | resolved | recovery action succeeds |
| recovering | error_detected | recovery action fails (attempt_count incremented, replanned) |
| recovering | escalated | attempt_count >= max_attempts |

---

## Orchestrator Loop (GOAP-advised)

**States:** `loop3 | gate_check | loop2 | po_decision | complete | aborted`

| From | To | Trigger |
|------|----|---------|
| loop3 | gate_check | all loop3 agents complete |
| gate_check | loop2 | gate passed |
| gate_check | loop3 | gate failed, GOAP says iterate, budget OK |
| gate_check | aborted | gate failed, GOAP says abort (budget exhausted or max iterations) |
| loop2 | po_decision | consensus passed |
| loop2 | loop3 | consensus failed, GOAP says iterate |
| loop2 | aborted | consensus failed, GOAP says abort |
| po_decision | complete | PO returns PROCEED |
| po_decision | loop3 | PO returns ITERATE |
| po_decision | aborted | PO returns ABORT |

---

## Dependency Scheduling

**States:** `pending | schedulable | in_flight | complete | blocked`

| From | To | Trigger |
|------|----|---------|
| pending | schedulable | all upstream deps reach `complete` |
| schedulable | in_flight | executor picks up task |
| in_flight | complete | task execution succeeds |
| in_flight | blocked | upstream task moves to failed |
| pending | blocked | upstream task moves to failed (transitively) |

Task does not have a `failed` state in the scheduler. Failure is recorded externally; scheduler marks all transitive dependents `blocked` and replans the remaining schedulable set.

---

## Video Ingest Run (glm-video-ingest)

**States:** `resolve | download | analyze | render | done | failed`

| From | To | Trigger |
|------|----|---------|
| resolve | download | Loom mp4 URL + transcript resolved (loom type); or input is direct url/file |
| resolve | failed | no Loom video URL (private/unresolvable) |
| download | analyze | bytes fetched for file-needing provider (kimi/gemini); zai skips, sends URL |
| analyze | render | provider returns 200 with non-empty content |
| analyze | analyze | HTTP 429, retry with backoff (kimi/zai, up to 4 attempts) |
| analyze | failed | non-200 after retries, empty content, or expired/invalid key |
| render | done | model output parses as valid JSON; JSON + MD written, usage/cost logged |
| render | failed | model output not valid JSON (raw saved, MD render aborted) |

### Gemini Files API upload (sub-state of `analyze`, gemini provider only)

**States:** `PROCESSING | ACTIVE | FAILED`

| From | To | Trigger |
|------|----|---------|
| PROCESSING | ACTIVE | file processed; generateContent proceeds |
| PROCESSING | FAILED | Gemini rejects/fails processing → run `failed` |

---

## Decision Record (decision-log structured store)

**Entity:** a resolved planning fork, written by `cfn-decide` via `record.sh`, keyed `(project, slug, decision_id)`.

**States:** `proposed | accepted | superseded`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | proposed | record.sh with `--status proposed` | fork surfaced, user not yet answered |
| (none) | accepted | record.sh (default status) | fork resolved (user-answered or self-resolved) |
| proposed | accepted | record.sh upsert, same key, status accepted | answer returned |
| accepted | accepted | record.sh upsert, same key | re-run; in-place update, no duplicate |
| accepted | superseded | newer record.sh with `--supersede <this-id>` | a later plan reverses the decision |
| proposed | superseded | newer record.sh `--supersede <this-id>` | reversed before acceptance |

**Illegal:** `superseded → accepted` (reversal of a reversal must be a NEW decision_id with its own `--supersede`, not a status flip, preserves audit trail). Delete is never used for reversal.

```
proposed ──answer──> accepted ──(--supersede by Dn)──> superseded
   │                                                       ▲
   └──────────────(--supersede by Dn)─────────────────────┘
```

---

## Manifest Suggestion (cfn-vote-implement processing)

**Entity:** a single code-review suggestion inside a `.cfn-cache/manifests/` manifest. Producers: cfn-dry-review, cfn-security-review, cfn-dep-audit, cfn-alpha-launch. Status field tracks resumable processing.

**States:** `pending | implemented | skipped | failed | deferred | rejected`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | pending | manifest emitted by producer skill | not yet voted |
| pending | implemented | 3/3 vote, or product-owner IMPLEMENT, or user Apply; TDD passes | test suite green |
| pending | failed | implementation attempted, test suite breaks | change reverted |
| pending | skipped | 0/3 vote, or user Skip | n/a |
| pending | deferred | product-owner DEFER, or user Defer to backlog | appended to docs/BACKLOG.md |
| pending | rejected | product-owner REJECT (2/3 path) | PO reasoning recorded |

**Routing by tally:** 3/3 → auto-implement (TDD), 2/3 → product-owner agent (IMPLEMENT/DEFER/REJECT), 1/3 → batched user prompt (4 per AskUserQuestion call). 2/3 items never reach the user.

**Illegal:** any transition out of a terminal state (implemented/skipped/failed/deferred/rejected). Re-running the manifest only processes `pending` items; resumability depends on terminal states being final.

```
pending ──3/3 / PO IMPLEMENT / user Apply──> implemented
   ├──── test breaks ────────────────────────> failed
   ├──── 0/3 / user Skip ────────────────────> skipped
   ├──── PO DEFER / user Defer ──────────────> deferred
   └──── PO REJECT ──────────────────────────> rejected
```
