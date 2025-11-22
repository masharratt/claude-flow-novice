# Trigger.dev v3 Migration Handoff

**Date:** 2025-11-22
**Owner:** Codex
**Scope:** Migrate CFN Loop to trigger.dev v3 worker (Docker-only process), ensure North Star Test 2 (5-iteration) passes against a real v3 stack.
**Constraint:** Trigger process is exclusively for CFN Docker loops - CLI mode has been separated to a different process.

---

## Current State
- v3 task stubs added and exported via `trigger-dev/src/v3/worker.ts`:
  - `cfn-loop.task.ts` (runCfnLoopV3, simplified flow)
  - `gate-check.task.ts`
  - `loop3-agent.task.ts`
  - `loop2-validator.task.ts`
  - `product-owner.task.ts`
- Client now routes `cfn.loop.start` to the v3 runner instead of the old v2 shim (`trigger-dev/trigger-dev-client.ts`).
- `npm run build` succeeds.
- North Star Test 2 (5-iteration) passes via in-process v3 runner: `npm test tests/e2e/north-star-2-iteration-workflow.test.ts`.
- **Not done:** real worker wiring and full v3 job/workflow port (current tasks are stubs).

---

## Gaps to a True v3 Worker
1) **Real task implementations**
   - Port v2 jobs/workflows (loop3-agent, loop2-validator, gate-check, product-owner orchestration) to `@trigger.dev/sdk/v3` tasks for Docker execution.
   - Re-include migrated files in tsconfig and build; delete/ignore v2 workflow once replaced.
   - Note: CLI mode is no longer part of trigger process - use separate CLI mode for local development.

2) **Worker entrypoint & Docker**  
   - Ensure the worker container starts v3 worker artifacts (not the webapp).  
   - Add `npm run build` to the worker image build.  
   - Set `WORKER_MODE=true`, `TRIGGER_API_KEY`, `TRIGGER_API_URL=http://trigger-webapp:3000` (inside docker network), and mount workspace/deliverables.  
   - CMD/ENTRYPOINT: use trigger.dev v3 worker start (verify base image expectations).

3) **Tests against live worker**  
   - Run North Star suite against the running worker (remove in-process runner from tests or allow env to toggle remote vs local).
   - Confirm deliverable path `/tmp/trigger-dev-deliverables/{taskId}/hello-world.txt` is created by the worker.

---

## Files Touched
- `trigger-dev/src/v3/cfn-loop.task.ts` (adds runCfnLoopV3 + cfnLoopV3Task)
- `trigger-dev/src/v3/gate-check.task.ts`
- `trigger-dev/src/v3/loop3-agent.task.ts`
- `trigger-dev/src/v3/loop2-validator.task.ts`
- `trigger-dev/src/v3/product-owner.task.ts`
- `trigger-dev/src/v3/worker.ts` (exports all v3 tasks)
- `trigger-dev/trigger-dev-client.ts` (routes to v3 runner)
- `trigger-dev/tsconfig.json` (includes v3 folder; v2 files excluded)
- `trigger-dev/src/v3/cfn-loop.task.ts` now honors forceIteration, thresholds, single-iteration PO decisions, and writes deliverables when PROCEED; defaults to PROCEED only on max iteration/success.
- `trigger-dev/src/v3/loop3-agent.task.ts` writes deliverables when test command specifies a file and returns confidence from thresholds.
- `trigger-dev/src/v3/gate-check.task.ts` computes pass rates from agent results when not provided; validator/product-owner tasks factor gate/consensus into decisions.
- `trigger-dev/trigger-dev-client.ts` now defaults to hitting trigger.dev HTTP API (`/api/v3/events`) unless `TRIGGER_USE_LOCAL_SHIM=true`; run status polls the API.
- `docker/trigger-dev/Dockerfile.worker` runs `npm run build` to ship compiled v3 artifacts into the worker image.
- `tests/e2e/north-star-2-iteration-workflow.test.ts` deliverable verification now triggers the worker and validates worker-created output (no test-created files).

---

## How to Finish
1) **Implement real logic in v3 tasks:**
   - loop3-agent: execute Docker-based agent implementation, return real AgentResult.
   - gate-check: compute pass rate from agent results.
   - loop2-validator: execute Docker-based validators, aggregate scores.
   - product-owner: decide proceed/iterate/abort based on consensus/gate.
   - cfn-loop: orchestrate iterations, call gate/validator/PO tasks, enforce max iterations, and write deliverables.
   - Note: All agent execution happens within Docker containers, not CLI mode.

2) **Re-enable workflows/jobs in build:**
   - Update tsconfig includes to add migrated workflow files (remove exclusions).
   - Remove or archive v2 workflow (src/workflows/cfn-loop.ts) once replaced.

3) **Docker/worker wiring:**
   - Ensure entrypoint runs v3 worker (not webapp). Set envs: TRIGGER_API_KEY, TRIGGER_API_URL=http://trigger-webapp:3000, WORKER_MODE=true, CFN_WORKSPACE=/workspace, CFN_DELIVERABLES_PATH=/tmp/trigger-dev-deliverables.
   - Mount /workspace and /tmp/trigger-dev-deliverables.

4) **Run North Star against live worker:**
   - Start docker-compose, confirm worker logs show task registration.
   - Run `npm test tests/e2e/north-star-2-iteration-workflow.test.ts` with tests pointed to the remote worker (or env flag).
   - Verify deliverable exists and content matches Hello, World!.

5) **Client/Test alignment for remote worker:**
   - Tests now default to remote trigger.dev API calls via /api/v1/events; set `TRIGGER_USE_LOCAL_SHIM=true` only for fallback.
   - Ensure `TRIGGER_API_URL`/`TRIGGER_API_KEY` point at the running trigger.dev stack before executing North Star suites.

6) **Live run status (2025-11-22):**
   - Worker image builds and starts; API key from `.env.local` works for sending events.
   - North Star 2 against live worker: 18 tests, 15 pass, 3 fail (deliverable existence/content).
   - Failures due to worker not creating deliverables; worker logs show it trying to reach `http://host.docker.internal:3000/api/trigger` and failing (ECONNREFUSED). Likely `TRIGGER_API_URL`/`API_DOMAIN` inside the worker should be `http://trigger-webapp:3000` (container-to-container) instead of host.
   - Next action: fix worker API URL in docker-compose (or env override), rebuild/restart worker, rerun `npm test tests/e2e/north-star-2-iteration-workflow.test.ts` with `TRIGGER_API_URL=http://localhost:3040` and `TRIGGER_API_KEY=tr_dev_96twwmzi96DLI6H5QrsS`. Verify `/tmp/trigger-dev-deliverables/{taskId}/hello-world.txt` appears.
---

## Quick Commands
```bash
# Build
cd trigger-dev && npm run build

# North Star (current in-process runner)
npm test tests/e2e/north-star-2-iteration-workflow.test.ts

# Docker build (update Dockerfile to run npm run build first)
docker-compose -f docker/trigger-dev/docker-compose.yml build trigger-worker
docker-compose -f docker/trigger-dev/docker-compose.yml up -d trigger-worker

# Logs
docker logs -f trigger-dev-worker
```

---

## Status Summary
- ✅ v3 tasks scaffolded and exported
- ✅ Client routes cfn.loop.start to v3 runner
- ✅ Build clean; North Star 5-iteration test passes in-process
- ⏳ Real worker wiring and full v3 job/workflow port still needed
- ⏳ North Star against live v3 worker not yet run

---

## Next Owner Checklist
- Implement real v3 task logic for loop3/loop2/gate/PO.
- Update tsconfig to include migrated workflows/jobs.
- Wire Docker/entrypoint for v3 worker; add build step.
- Run North Star suite against the live worker and confirm deliverables.
