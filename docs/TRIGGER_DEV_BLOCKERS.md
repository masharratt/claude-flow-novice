# trigger.dev Migration: Runtime Blockers

Items that require runtime testing with actual trigger.dev infrastructure.

## Phase 0: Infrastructure

| Blocker | File | Description |
|---------|------|-------------|
| Image pull | docker-compose.yml | GHCR image availability: `ghcr.io/triggerdotdev/trigger.dev:latest` |
| Health checks | docker-compose.yml | Actual endpoint responses for `/healthz` |
| DB migrations | setup script | trigger.dev auto-migration on first start |
| Port availability | docker-compose.yml | 5432, 6379, 9000, 9001, 8123, 3040 |
| Network DNS | docker-compose.yml | Service discovery within trigger-cfn-network |

## Phase 1: Workflows

| Blocker | File | Description |
|---------|------|-------------|
| Job registration | cfn-loop.workflow.ts | `task.define()` runtime behavior |
| Batch trigger | cfn-loop.workflow.ts | `task.batchTrigger()` parallel execution |
| Result aggregation | gate-check.job.ts | Job output collection patterns |
| Workflow state | cfn-loop.workflow.ts | Iteration state persistence |

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
