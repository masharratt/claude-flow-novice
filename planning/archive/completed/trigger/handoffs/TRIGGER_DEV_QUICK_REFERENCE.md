# trigger.dev Migration: Quick Reference

**Bookmark this page** for fast access to key information during execution.

---

## Key Documents

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **[TRIGGER_DEV_MIGRATION_PLAN.md](./TRIGGER_DEV_MIGRATION_PLAN.md)** | Complete technical specification | 45 min |
| **[TRIGGER_DEV_MIGRATION_EXECUTIVE_SUMMARY.md](./TRIGGER_DEV_MIGRATION_EXECUTIVE_SUMMARY.md)** | High-level overview & decision criteria | 15 min |
| **[TRIGGER_DEV_MIGRATION_CHECKLIST.md](./TRIGGER_DEV_MIGRATION_CHECKLIST.md)** | Phase-by-phase execution checklist | 5 min (reference) |
| **This Document** | Quick reference & fast answers | 10 min |

---

## Quick Answers

### "What's changing?"
**Redis BLPOP coordination → trigger.dev webhooks**

| Aspect | Before | After |
|--------|--------|-------|
| Coordination | Redis BLPOP blocking | Webhook event listeners |
| Agent Spawning | CLI spawn → wait on Redis | Job creation → webhook handler |
| Result Collection | Redis HGETALL | Webhook aggregation |
| Visibility | Console logs | trigger.dev dashboard |
| Cost | Higher | 95% cheaper |

### "How long will this take?"
**25 days with 2-3 person team** (or 18 days with 4 people)

### "Is it risky?"
**Medium-High risk**, but well-mitigated because:
- No existing users to break
- Comprehensive testing planned (67+ tests)
- Clear rollback procedures for Phase 0-3
- Proven technologies (trigger.dev is production-ready)

### "What gets deleted?"
**~10,854 LOC across 60+ files:**
- All Redis coordination code (entire directories)
- coordination-wait.ts & coordination-signal.ts
- Task Mode (deprecated, incompatible with async)
- Shell orchestrator (orchestrate.sh)

### "What gets created?"
**~2,000 LOC of new code:**
- 4 core workflows
- 6-8 jobs
- 3-4 webhooks
- 6-8 utilities
- 67+ tests

---

## Architecture Quick View

### BEFORE (v3.9.9)
```
┌─────────────────┐
│   Orchestrator  │
└────────┬────────┘
         │ SPAWN AGENTS
         ▼
    ┌─────────────┐
    │ 3x Agents   │ (parallel)
    └────┬────┬───┘
         │LPUSH │LPUSH
         ▼      ▼
    ┌──────────────┐
    │ Redis List   │ (BLPOP blocking)
    └──────┬───────┘
           │ Orchestrator wakes
           ▼
      COLLECT RESULTS
           │
        [GATE CHECK]
           │
    ┌──────┴──────┐
    │ PASS │ FAIL │
    └──────┴──────┘
        LOOP 2/PO or Retry
```

### AFTER (v4.0.0)
```
┌─────────────────────────────────────┐
│ CFN Loop Workflow (trigger.dev)      │
├─────────────────────────────────────┤
│                                     │
│  SPAWN AGENTS ──┐                   │
│    (parallel)   │                   │
│                 ▼                   │
│  Agents Send Webhooks ──────┐       │
│                              │       │
│  WEBHOOK HANDLERS ◄──────────┘       │
│    (aggregate results)               │
│                 │                   │
│         [GATE CHECK] ◄────────┐      │
│                │              │      │
│         ┌──────┴──────┐      │      │
│         │ PASS │ FAIL │      │      │
│         └──────┴──────┘      │      │
│            LOOP 2   │ Retry ──┴─┐   │
│          (parallel)       ┌────┘   │
│             │            │        │
│    [CONSENSUS] ◄──────┘        │
│             │                   │
│        [PO DECISION]            │
│             │                   │
│      PROCEED/ITERATE/ABORT      │
│                                 │
└─────────────────────────────────┘
```

---

## File Map: What to Create/Delete/Modify

### Create (~25 files)
```
trigger-dev/
├── workflows/
│   ├── cfn-loop.workflow.ts (1,200)
│   ├── loop3-executor.workflow.ts (400)
│   ├── loop2-validator.workflow.ts (350)
│   └── po-decision.workflow.ts (200)
├── jobs/
│   ├── spawn-agent.job.ts (250)
│   ├── agent-executor.job.ts (300)
│   ├── gate-check.job.ts (200)
│   ├── consensus-aggregator.job.ts (200)
│   └── po-decision.job.ts (150)
├── webhooks/
│   ├── agent-completion.webhook.ts (150)
│   ├── validator-completion.webhook.ts (150)
│   └── po-completion.webhook.ts (100)
├── types/
│   ├── cfn-loop-events.ts (200)
│   ├── workflow-context.ts (150)
│   └── trigger-payloads.ts (100)
└── utils/
    ├── test-aggregator.ts (250)
    ├── consensus-calculator.ts (150)
    ├── event-aggregator.ts (150)
    ├── iteration-state-manager.ts (200)
    ├── po-decision-parser.ts (100)
    └── parallel-executor.ts (100)

docker/trigger.dev/
├── docker-compose.yml (100)
├── .env.template (30)
└── init-postgres.sql (50)

docs/
├── TRIGGER_DEV_MIGRATION_PLAN.md ✅
├── TRIGGER_DEV_MIGRATION_EXECUTIVE_SUMMARY.md ✅
├── TRIGGER_DEV_MIGRATION_CHECKLIST.md ✅
├── TRIGGER_DEV_SETUP.md (new)
├── TRIGGER_DEV_ARCHITECTURE.md (new)
├── WEBHOOK_PROTOCOL.md (new)
├── runbooks/
│   ├── TRIGGER_DEV_SETUP.md
│   ├── CFN_LOOP_TROUBLESHOOTING.md
│   └── WEBHOOK_DEBUGGING.md

tests/trigger-dev/
├── workflows.test.ts (300+)
├── jobs.test.ts (250+)
├── webhooks.test.ts (200+)
├── e2e-cfn-loop.test.ts (400+)
├── integration.test.ts (250+)
└── performance.bench.ts (150+)

scripts/
├── trigger-dev-setup.sh
└── trigger-dev-network.sh
```

### Delete (~60+ files, 10,854 LOC)
```
❌ .claude/skills/cfn-coordination/             (entire directory)
❌ .claude/skills/cfn-redis-coordination/       (entire directory)
❌ .claude/skills/cfn-docker-redis-coordination/ (entire directory)
❌ .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh (1,721)
❌ src/cli/coordination-wait.ts (235)
❌ src/cli/coordination-signal.ts (179)
❌ src/coordination/coordination-wrapper.ts (300+)
❌ src/types/coordination.d.ts (50+)
❌ .claude/commands/cfn-loop-task.md
❌ docs/COORDINATION_PROTOCOL.md (old Redis-based)
❌ docs/REDIS_DEPLOYMENT.md
❌ Various test files (redis-specific)
```

### Modify (~15 files)
```
✏️ CLAUDE.md - Remove Redis sections
✏️ .claude/commands/cfn-loop-cli.md - Remove Redis checks
✏️ src/cli/agent-prompt-builder.ts - Add webhook URL injection
✏️ src/cli/agent-executor.ts - Add webhook submission
✏️ src/cli/orchestrator-cli.ts - Remove Redis init
✏️ package.json - Remove redis, add @trigger.dev/sdk
✏️ docker-compose.yml - Remove redis service
✏️ .github/workflows/test.yml - Update Redis startup
✏️ .env - Remove REDIS_* vars
✏️ .env.template - Remove REDIS_* vars
✏️ tsconfig.json - Update if needed
✏️ .gitignore - Update if needed
✏️ Various skill files - Remove Redis references
```

---

## Phase Timeline

```
Week 1
├─ Mon-Tue:  Phase 0 - Infrastructure Setup
├─ Wed-Fri:  Phase 1 - Core Workflows (overlap with Phase 0)
│
Week 2
├─ Mon-Wed:  Phase 2 - Agent Spawning
├─ Thu-Fri:  Phase 3 - Coordination (start early)
│
Week 3
├─ Mon-Wed:  Phase 3 - Coordination (continue)
├─ Thu-Fri:  Phase 4 - Deprecation & Removal
│
Week 4
├─ Mon-Thu:  Phase 5 - Testing & Validation
├─ Fri:      Phase 6 - Documentation (overlap)
│
Week 5 (Overflow)
├─ Mon-Wed:  Phase 6 - Documentation & Cleanup
├─ Thu-Fri:  Buffer/Contingency
```

---

## Key Decisions & Trade-Offs

| Decision | Trade-Off | Why Chosen |
|----------|-----------|-----------|
| Full migration vs incremental | No backward compatibility | Cleaner architecture, no legacy code |
| webhook-based vs polling | Slightly more complex | Lower latency, higher reliability |
| Self-hosted trigger.dev vs cloud | More ops overhead | Full control, no vendor lock-in |
| Complete Redis removal vs dual-mode | More risk | Cleaner codebase, easier maintenance |
| 2-3 person team | Longer timeline | Parallel phases, manageable scope |

---

## Success Metrics

### Speed
- **Agent spawn time:** < 5 seconds (was 8-10s with Redis latency)
- **Webhook delivery:** < 2 seconds
- **Full loop (MVP):** < 600 seconds (same or better)

### Reliability
- **Webhook delivery rate:** > 99.9%
- **Agent completion rate:** > 99%
- **Event ordering:** 100% correct sequence

### Cost
- **Per-iteration savings:** 95% (from $0.15 → $0.054)
- **Annual savings:** ~$30K+ at scale

### Quality
- **Test coverage:** ≥85%
- **E2E test pass rate:** 100%
- **Zero regressions:** 100%

---

## Potential Issues & Solutions

### Issue: Webhook Not Received
**Root Cause:** Network, signature verification, or handler error
**Check:**
```bash
# 1. Verify webhook endpoint is reachable
curl -X POST http://localhost:3000/webhooks/agent-completion

# 2. Check webhook delivery attempts in trigger.dev
http://localhost:3000/webhooks

# 3. Review agent logs for send errors
docker logs cfn-agent-{agentId}

# 4. Verify signature is correct
# (check agent's TRIGGER_WEBHOOK_TOKEN)
```

### Issue: Workflow Stuck in Pending
**Root Cause:** Event not emitted or listener not waiting
**Check:**
```bash
# 1. Verify event was emitted
http://localhost:3030/api/workflows/{taskId}/events

# 2. Check workflow logs
docker logs trigger-api

# 3. Verify listener is waiting
# (check job definition for await)
```

### Issue: Gate Check Failing Indefinitely
**Root Cause:** Test pass rate below threshold, no improvement
**Check:**
```bash
# 1. View test failures in dashboard
http://localhost:3000/workflows/{taskId}/tests

# 2. Identify failing tests
curl http://localhost:3030/api/tasks/{taskId}/tests

# 3. Check agent output for errors
# (review agent logs and output summary)
```

### Issue: Performance Degradation
**Root Cause:** Additional webhook latency or inefficient event handling
**Check:**
```bash
# 1. Run performance benchmarks
npm run test:perf

# 2. Profile webhook processing time
# (add timing logs in webhook handler)

# 3. Check trigger.dev API rate limits
# (verify not hitting limits)
```

---

## Verification Commands

**Quick Health Check:**
```bash
#!/bin/bash
echo "=== trigger.dev Services ==="
docker ps | grep trigger

echo "=== API Health ==="
curl -s http://localhost:3030/health | jq .

echo "=== Dashboard Access ==="
curl -s http://localhost:3000 | head -20

echo "=== Redis References ==="
grep -r "redis" . --exclude-dir=.git --exclude-dir=node_modules | wc -l

echo "=== Tests ==="
npm test -- --run

echo "=== Build ==="
npm run build

echo "=== Summary ==="
echo "All systems green!" # if all above pass
```

---

## Communication Template

**To Team (Daily Standup):**
```
Phase: [X/6]
Status: [On Track | Behind | Blocked]

Completed:
- [checklist items]

Today:
- [planned work]

Blockers:
- [issues]

Confidence: [X%]
```

**To Stakeholders (Weekly):**
```
CFN Loop → trigger.dev Migration (Week X/5)

Progress: X% Complete

Completed Phases:
- ✅ Phase 0-X

Current Phase:
- Phase X: [description]

Next Phase Starts: [date]

Risks:
- [identified risks]

On Track for: [delivery date]
```

---

## Rollback Decision Tree

```
         Migration Started
              │
              ▼
       ┌─────────────┐
       │ Phase 0     │
       │ Complete?   │
       └──────┬──────┘
         Yes  │ No
             ▼
        [Stop & Rollback]
        Infrastructure fails
        → docker-compose down -v

              ▼
       ┌─────────────┐
       │ Phase 1-3   │
       │ Complete?   │
       └──────┬──────┘
         Yes  │ No
             ▼
        [Stop & Rollback]
        Coordination fails
        → git checkout main -- trigger-dev/

              ▼
       ┌─────────────┐
       │ Phase 4     │
       │ Complete?   │
       └──────┬──────┘
         Yes  │ No
             ▼
        ❌ CANNOT ROLLBACK
        Files already deleted!
        → Use backup branch:
           git checkout backup/pre-deprecation-v4.0.0

              ▼
       ┌─────────────┐
       │ Phase 5-6   │
       │ Complete?   │
       └──────┬──────┘
         Yes  │ No
             ▼
        [Restore if needed]
        Tests/docs incomplete
        → git checkout main -- docs/

              ▼
         [COMPLETE]
         v4.0.0 Live
```

---

## Resources

### Internal
- Full Plan: `/docs/TRIGGER_DEV_MIGRATION_PLAN.md`
- Checklist: `/docs/TRIGGER_DEV_MIGRATION_CHECKLIST.md`
- Executive Summary: `/docs/TRIGGER_DEV_MIGRATION_EXECUTIVE_SUMMARY.md`

### External
- trigger.dev Docs: https://trigger.dev/docs
- Docker Docs: https://docs.docker.com
- TypeScript Docs: https://www.typescriptlang.org/docs

### Tools
- Docker Desktop: https://www.docker.com/products/docker-desktop
- VS Code: https://code.visualstudio.com
- Node.js: https://nodejs.org

---

## Emergency Contacts

**If blocked, contact:**
- **Infrastructure Issues:** Infrastructure Lead
- **Workflow/Job Issues:** Backend Lead
- **Test Failures:** QA Lead
- **Critical Blocker:** Project Manager

**Escalation Path:**
1. Team lead → Project manager → CTO

---

## Sign-Off

By reading this document, you understand:
- [ ] The scope of the migration
- [ ] The timeline and effort required
- [ ] The risks and mitigations
- [ ] Your role and responsibilities
- [ ] The success criteria

**Date Reviewed:** _________________

---

**Last Updated:** 2024-11-21
**Version:** 1.0
**Status:** Ready for Execution

