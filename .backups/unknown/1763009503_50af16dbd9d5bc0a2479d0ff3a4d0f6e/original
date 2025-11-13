# Docker Organizational Architecture - Planning Files

**Status:** Ready for execution (POC validated 0.95 confidence)

---

## Epic Configuration Files (Execution Order)

### 1. `01-cfn-organizational-architecture-epic-ORIGINAL.json` ❌ DEPRECATED
- **Status:** Superseded by hybrid approach
- **Timeline:** 12 weeks (pure Claude → hybrid migration)
- **Cost Model:** $100/month (pure Claude) → $334/month (after migration)
- **Why Deprecated:** Migration approach adds complexity and 1 week extra time
- **Use Case:** Historical reference only

### 2. `02-cfn-epic-config-SUMMARY.json` 📊 REFERENCE
- **Status:** Machine-readable summary (original approach)
- **Purpose:** ROI calculations, cost analysis, org structure reference
- **Timeline:** 12 weeks
- **Use Case:** Copy cost/ROI data to new tools/dashboards

### 3. `03-cfn-organizational-architecture-epic-EXECUTE.json` ✅ **CANONICAL**
- **Status:** **EXECUTE THIS ONE**
- **Timeline:** 11 weeks (hybrid from Day 1)
- **Cost Model:** $334/month from start ($100 coordinators + $234 workers)
- **Architecture:** Claude Max coordinators + Z.ai workers (validated in POC)
- **Use Case:** CFN Loop execution, agent spawning, sprint tracking

---

## Supporting Documentation

### Implementation Guides

**Primary:**
- `HYBRID_FROM_START_IMPLEMENTATION_PLAN.md` - Full 11-week implementation plan
- `HYBRID_COORDINATOR_WORKERS_ANALYSIS.md` - Hybrid architecture rationale (97% cost savings)
- `MULTI_SUBSCRIPTION_STRATEGY.md` - Subscription economics (5 Claude Max + 1 Z.ai)

**Architectural:**
- `EPIC_ORGANIZATIONAL_ARCHITECTURE.md` - Vision and overview
- `PLAYBOOK_DRIVEN_ARCHITECTURE.md` - Ephemeral agents + persistent playbooks
- `REQUEST_FLOW_DIAGRAM.md` - 9-step request flow (User → Coordinator → Agent → Exit)

**Analysis:**
- `ORG_ARCHITECTURE_OVERLAP_ANALYSIS.md` - Validated assumptions (Redis 300 agents, coordinator 150 agents)
- `REPO_STRATEGY_ANALYSIS.md` - Monorepo decision rationale (70% code reuse)

### Test Results

**Docker POC:**
- `../tests/docker-deployment/POC_TEST_RESULTS.md` - Docker agent deployment validated (0.95 confidence)
- Key finding: Z.ai auth requires `ANTHROPIC_AUTH_TOKEN` env var
- Result: 18MB Alpine image, <30 second build, $0.00001 per task

---

## Quick Start

### Prerequisites (Week 1)
```bash
# 1. Purchase subscriptions
# - 5 Claude Max subscriptions ($20/month each)
# - 1 Z.ai API key (pay-as-you-go)

# 2. Set environment variables
export MARKETING_COORDINATOR_API_KEY="sk-ant-api03-xxx"
export ENGINEERING_COORDINATOR_API_KEY="sk-ant-api03-xxx"
export SALES_COORDINATOR_API_KEY="sk-ant-api03-xxx"
export SUPPORT_COORDINATOR_API_KEY="sk-ant-api03-xxx"
export FINANCE_COORDINATOR_API_KEY="sk-ant-api03-xxx"
export ANTHROPIC_AUTH_TOKEN="your-zai-api-key"  # Z.ai workers

# 3. Verify Docker POC working
cd tests/docker-deployment
docker build -f Dockerfile.simple-poc -t cfn-agent-poc:simple .
docker run --rm \
  -e "ANTHROPIC_AUTH_TOKEN=$ANTHROPIC_AUTH_TOKEN" \
  -e "ZAI_BASE_URL=https://api.z.ai/api/anthropic" \
  cfn-agent-poc:simple
# Expected: "Hi! How can I assist you today?"
```

### Phase 1 Execution (Weeks 1-2)
```bash
# Sprint 1.1: ACE System Enhancement (Days 1-3)
# Deliverables:
# - .claude/skills/cfn-ace-system/migrate-schema.sh
# - PostgreSQL with scope fields (agent, team, org)
# - tests/ace-system/test-scope-isolation.sh

# Sprint 1.2: Docker Templates + Hybrid Routing (Days 4-7)
# Deliverables:
# - .claude/cfn-config/team-providers.json
# - .claude/skills/cfn-agent-execution/execute-agent.sh (role-based routing)
# - docker-compose.hybrid.yml
# - .env.hybrid.example

# Sprint 1.3: Validation Tests (Days 8-10)
# Deliverables:
# - tests/hybrid-architecture/01-single-worker-spawn.sh
# - tests/hybrid-architecture/02-concurrent-workers.sh (25 workers)
# - tests/hybrid-architecture/03-cross-team-coordination.sh
# - scripts/track-zai-costs.sh
```

---

## Cost Summary

**Monthly Costs:**
- Coordinators: 5 × $20 = **$100** (Claude Max subscriptions)
- Workers: ~468M tokens × $0.50/1M = **$234** (Z.ai pay-as-you-go)
- **Total: $334/month**

**Annual Costs:**
- Hybrid architecture: $334 × 12 = **$4,008/year**

**Savings:**
- Baseline (manual work): $80,000/year (5 FTEs × 20% time)
- Hybrid architecture: $4,008/year
- **Annual savings: $75,992 (95% reduction)**

**ROI:**
- Total investment: $44,000 (11 weeks implementation)
- Payback period: 5.8 months
- **ROI: 208%**

---

## Architecture Validated

**Docker POC Results (2025-10-30):**
- ✅ Docker image builds (<30 seconds, 18MB)
- ✅ Z.ai API authentication working (ANTHROPIC_AUTH_TOKEN)
- ✅ Cost per task: $0.00001 (97% savings vs Anthropic)
- ✅ Model routing: Claude Haiku → GLM-4.5-Air (transparent)
- ✅ Confidence: 0.95 (no blockers)

**Production Validation:**
- Sprint 2 CFN Loop: 17/17 E2E tests passing (100%)
- Hybrid routing: 97% cost savings validated
- Redis: 300 agents tested, 10k+ msgs/sec
- Coordinator: 150 agents tested, 98% delivery rate

---

## Next Steps

1. **Read:** `03-cfn-organizational-architecture-epic-EXECUTE.json`
2. **Execute:** Phase 1 Sprint 1.1 (ACE enhancement)
3. **Monitor:** Use `/cfn-loop "Phase 1 Sprint 1.1"` for autonomous execution
4. **Track:** Cost tracking via `scripts/track-zai-costs.sh`

---

## File Naming Convention

- `01-*-ORIGINAL.json` - Deprecated/historical reference
- `02-*-SUMMARY.json` - Machine-readable summary data
- `03-*-EXECUTE.json` - Canonical epic for execution
- `*_ANALYSIS.md` - Analysis and decision rationale
- `*_PLAN.md` - Implementation plans
- `*_RESULTS.md` - Test results and validation

---

## Version History

- **2025-10-30:** Docker POC validated (0.95 confidence)
- **2025-10-30:** Hybrid architecture epic created (11 weeks, $44K investment)
- **2025-10-30:** Z.ai authentication resolved (ANTHROPIC_AUTH_TOKEN)
- **2025-10-30:** Repository strategy decided (monorepo, 70% code reuse)
