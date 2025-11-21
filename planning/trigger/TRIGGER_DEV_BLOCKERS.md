# trigger.dev Migration: Runtime Blockers

Items that require runtime testing with actual trigger.dev infrastructure.

## Phase 0: Infrastructure ✅ COMPLETE (2025-11-21)

| Blocker | File | Status | Notes |
|---------|------|--------|-------|
| Image pull | docker-compose.yml | ✅ | `ghcr.io/triggerdotdev/trigger.dev:latest` pulled successfully |
| Health checks | docker-compose.yml | ✅ | All 6 services healthy (postgres, redis, minio, clickhouse, webapp, worker) |
| DB migrations | setup script | ✅ | Auto-migration on first start worked |
| Port availability | docker-compose.yml | ✅ | Adjusted: Redis→6380, Minio→9010, Clickhouse native→9020 |
| Network DNS | docker-compose.yml | ✅ | Service discovery working via `trigger-cfn-network` |
| Host connectivity | docker-compose.yml | ✅ | Added `extra_hosts: host.docker.internal:host-gateway` |
| Job registration | Next.js test app | ✅ | CLI registered endpoint via `host.docker.internal:3000` |
| Job execution | trigger.dev dashboard | ✅ | Example job ran successfully |

**Test App:** `/mnt/c/Users/masha/Documents/trigger-test-app`
**Dashboard:** http://localhost:3040

## Phase 1: Workflows ✅ COMPLETE (2025-11-21)

| Blocker | File | Status | Notes |
|---------|------|--------|-------|
| Job registration | jobs/cfn-loop.ts | ✅ | v2 `defineJob()` with eventTrigger works |
| Batch trigger | cfn-loop.ts | ✅ | Sequential agent triggering via `io.sendEvent()` |
| Result aggregation | cfn-loop.ts | ✅ | In-workflow aggregation with confidence scoring |
| Workflow state | cfn-loop.ts | ✅ | Iteration loop with gate check logic |

**Jobs registered:** cfn-agent, cfn-gate-check, cfn-loop-workflow, example-job
**SDK version:** @trigger.dev/sdk@2.3.18 (v2 API - v4 incompatible with self-hosted)

## Phase 2: Integration

| Blocker | File | Description |
|---------|------|-------------|
| Webhook HMAC | trigger-dev-webhooks.ts | Signature verification with real payloads |
| API retry | trigger-dev-client.ts | Exponential backoff behavior |
| Run polling | trigger-dev-client.ts | `getRunStatus()` polling intervals |
| Cancel propagation | trigger-dev-client.ts | `cancelRun()` effect on running jobs |

## Phase 3: Task Mode

| Blocker | File | Description |
|---------|------|-------------|
| Agent spawn | task-mode-adapter.ts | `execSync(npx claude-flow-novice...)` in Node.js |
| Timeout handling | task-mode-adapter.ts | 30s default timeout behavior |
| Memory fallback | task-mode-adapter.ts | Auto-detection when TRIGGER_API_URL unset |

## Validation Commands

Once infrastructure is running:

```bash
# Test trigger.dev API
curl http://localhost:3040/api/v1/health

# Test webhook endpoint
curl -X POST http://localhost:3000/webhooks/agent-complete \
  -H "Content-Type: application/json" \
  -H "X-Trigger-Signature: <hmac>" \
  -d '{"runId":"test","agentId":"test","taskId":"test"}'

# Run TypeScript tests
cd trigger-dev && npm test

# Validate workflow registration
npx trigger.dev dev
```

## Estimated Runtime Testing Effort

| Phase | Tests | Estimated Time |
|-------|-------|----------------|
| Infrastructure | 5 | 2 hours |
| Workflows | 10 | 4 hours |
| Integration | 8 | 3 hours |
| Task Mode | 4 | 2 hours |
| **Total** | **27** | **11 hours** |
