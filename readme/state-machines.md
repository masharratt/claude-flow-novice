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
