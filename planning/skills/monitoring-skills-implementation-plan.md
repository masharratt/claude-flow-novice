# Monitoring Skills Implementation Plan

**Created:** 2025-10-19
**Priority:** Immediate (Next Sprint)
**Status:** Ready for CFN Loop Execution

---

## Executive Summary

Implement skill wrappers for existing monitoring infrastructure to provide agent-accessible programmatic interfaces. Current status: 2/5 monitoring features exist (Web Portal v3.0.0 + Transparency Middleware) but lack skill wrappers (0% skills coverage).

**Target:** Increase Monitoring skills coverage from 0/5 (0%) to 2/5 (40%)

---

## Sprint 1: Web Portal Skills Wrapper

### Objective
Create `.claude/skills/web-portal/` skill wrapper for programmatic access to Web Portal v3.0.0 monitoring capabilities.

### Deliverables

1. **SKILL.md** (Primary Documentation)
   - Skill overview and purpose
   - 9 view interfaces (Dashboard, Agents, Hierarchy, Performance, Events, Fleet, CFN Loop, Intervention, Settings)
   - WebSocket integration patterns
   - Metrics retrieval methods
   - Real-time monitoring capabilities

2. **invoke-portal-start.sh**
   - Start web portal server on configurable port (default: 3001)
   - Health check validation
   - Redis connection verification
   - Return server URL and status

3. **invoke-portal-metrics.sh**
   - Retrieve current metrics via API
   - Support filtering by: agent, timeframe, view
   - JSON/table output formats
   - Cache metrics with TTL

4. **invoke-portal-dashboard.sh**
   - Fetch dashboard summary data
   - Active agents count
   - System health status
   - Recent events summary
   - Performance metrics

5. **invoke-portal-agents.sh**
   - List all agents with status
   - Filter by: status (active/idle/failed), type, swarm
   - Hierarchy visualization data
   - Agent performance metrics

6. **invoke-portal-events.sh**
   - Query event timeline
   - Filter by: type, agent, timeframe, severity
   - Pagination support
   - Event correlation data

7. **invoke-portal-stop.sh**
   - Graceful shutdown of portal server
   - Close WebSocket connections
   - Cleanup resources

8. **test-web-portal-skill.sh**
   - Comprehensive test suite (8+ tests)
   - Server lifecycle (start/stop)
   - Metrics retrieval
   - Agent status queries
   - Event timeline queries
   - WebSocket connectivity
   - Error handling
   - Performance benchmarks

### Acceptance Criteria
- ✅ All 8 invoke scripts operational
- ✅ Test suite passes 8/8 tests
- ✅ `/launch-web-dashboard` slash command integration
- ✅ Documentation complete with examples
- ✅ Error handling and graceful degradation

### Estimated Complexity
- **Lines of Code:** ~1,200 (SKILL.md: 400, scripts: 700, tests: 100)
- **Effort:** 4-6 hours
- **Dependencies:** Existing web portal v3.0.0, Redis, Express

---

## Sprint 2: Transparency Middleware Skills Wrapper

### Objective
Create `.claude/skills/transparency-middleware/` skill wrapper for real-time agent activity observation and performance monitoring.

### Deliverables

1. **SKILL.md** (Primary Documentation)
   - Transparency levels (minimal/detailed/verbose/debug)
   - Message filtering patterns
   - Context-aware observation
   - Performance impact monitoring
   - Redis pub/sub integration

2. **invoke-transparency-init.sh**
   - Initialize transparency middleware
   - Configure transparency level
   - Set up message filters
   - Enable performance monitoring
   - Return initialization status

3. **invoke-transparency-observe.sh**
   - Subscribe to agent activity stream
   - Filter by: agent, type, severity, pattern
   - Real-time or batch mode
   - JSON/text output formats

4. **invoke-transparency-metrics.sh**
   - Retrieve transparency performance metrics
   - Message generation rate
   - Filtering efficiency
   - Overhead percentage
   - Queue statistics

5. **invoke-transparency-filter.sh**
   - Add/remove message filters
   - List active filters
   - Test filter patterns
   - Filter priority management

6. **invoke-transparency-level.sh**
   - Get/set transparency level (minimal/detailed/verbose/debug)
   - Impact assessment for level changes
   - Per-agent level configuration

7. **invoke-transparency-stop.sh**
   - Graceful shutdown
   - Flush message queue
   - Unsubscribe from Redis channels
   - Cleanup resources

8. **test-transparency-skill.sh**
   - Comprehensive test suite (10+ tests)
   - Initialization and configuration
   - Message observation and filtering
   - Transparency level changes
   - Performance metrics
   - Redis pub/sub integration
   - Multi-agent scenarios
   - Overhead measurement
   - Graceful shutdown
   - Error handling

### Acceptance Criteria
- ✅ All 8 invoke scripts operational
- ✅ Test suite passes 10/10 tests
- ✅ Integration with existing transparency-middleware.ts
- ✅ Documentation complete with examples
- ✅ Performance overhead < 5%

### Estimated Complexity
- **Lines of Code:** ~1,400 (SKILL.md: 500, scripts: 750, tests: 150)
- **Effort:** 5-7 hours
- **Dependencies:** `src/coordination/transparency-middleware.ts`, Redis

---

## CFN Loop Execution Plan

### Loop Structure

**Mode:** Standard
- Gate threshold: ≥0.75 (agent self-confidence)
- Consensus threshold: ≥0.90 (validator team)
- Max Loop 3 iterations: 10
- Max Loop 2 iterations: 10

### Sprint 1: Web Portal Skills

**Loop 3 Agents (Parallel Implementation):**
1. `researcher` - Analyze web portal architecture, identify integration points
2. `backend-dev` - Implement invoke scripts and skill wrapper
3. `devops-engineer` - Create deployment scripts, testing infrastructure

**Loop 2 Validators (Consensus):**
1. `reviewer` - Code quality, patterns, best practices
2. `tester` - Test coverage, edge cases, integration tests
3. `security-specialist` - Security review, input validation
4. `architect` - Design coherence, maintainability

**Loop 4 Product Owner:**
- Auto-decision (PROCEED/DEFER/ESCALATE)
- Backlog management for enhancements

### Sprint 2: Transparency Middleware Skills

**Loop 3 Agents (Parallel Implementation):**
1. `researcher` - Analyze transparency middleware, Redis integration patterns
2. `backend-dev` - Implement invoke scripts and skill wrapper
3. `devops-engineer` - Performance testing, overhead measurement

**Loop 2 Validators (Consensus):**
1. `reviewer` - Code quality, patterns, best practices
2. `tester` - Test coverage, performance benchmarks
3. `security-specialist` - Security review, data filtering
4. `architect` - Design coherence, skill consistency

**Loop 4 Product Owner:**
- Auto-decision (PROCEED/DEFER/ESCALATE)
- Final verification and handoff

---

## Success Metrics

### Sprint 1 (Web Portal Skills)
- ✅ 8 invoke scripts operational
- ✅ 8/8 tests passing
- ✅ Skills coverage: Monitoring 0/5 → 1/5 (20%)
- ✅ Overall skills coverage: 26/60 → 27/60 (43% → 45%)

### Sprint 2 (Transparency Middleware Skills)
- ✅ 8 invoke scripts operational
- ✅ 10/10 tests passing
- ✅ Skills coverage: Monitoring 1/5 → 2/5 (40%)
- ✅ Overall skills coverage: 27/60 → 28/60 (45% → 47%)

### Overall Impact
- ✅ Monitoring skills coverage: 0% → 40% (+40 percentage points)
- ✅ Overall skills coverage: 43% → 47% (+4 percentage points)
- ✅ Agent-accessible monitoring infrastructure
- ✅ Real-time observability for CFN Loop operations

---

## Dependencies

### Technical Dependencies
- ✅ Existing: `packages/web-portal/` v3.0.0 (188 files)
- ✅ Existing: `src/coordination/transparency-middleware.ts` (580 lines)
- ✅ Existing: Redis coordination infrastructure
- ✅ Existing: Express backend
- ✅ Existing: Socket.IO WebSocket

### Skill Dependencies
- ✅ `.claude/skills/redis-coordination/` (for pub/sub patterns)
- ✅ `.claude/skills/agent-spawning/` (for agent metadata)
- ⚠️ New: Web Portal skill wrapper (Sprint 1)
- ⚠️ New: Transparency Middleware skill wrapper (Sprint 2)

---

## Risk Assessment

### Low Risk
- ✅ Code already exists and operational
- ✅ No breaking changes to existing systems
- ✅ Skill wrapper pattern well-established (ACE v1.0.0)

### Medium Risk
- ⚠️ Web Portal startup/shutdown automation
- ⚠️ WebSocket connection management in skills
- ⚠️ Performance overhead from transparency observation

### Mitigation Strategies
1. **Startup/Shutdown:** Implement robust health checks, process management
2. **WebSocket:** Use connection pooling, automatic reconnection
3. **Performance:** Implement caching, batch operations, configurable sampling

---

## Next Steps

1. **Execute CFN Loop Sprint 1:** `/cfn-loop-sprints "Monitoring Skills - Web Portal Wrapper" --max-loop2=10`
2. **Verify Sprint 1:** Test suite validation, integration testing
3. **Execute CFN Loop Sprint 2:** `/cfn-loop-sprints "Monitoring Skills - Transparency Middleware Wrapper" --max-loop2=10`
4. **Verify Sprint 2:** Test suite validation, performance benchmarks
5. **Update Documentation:** FEATURES_MATRIX.md, CLAUDE.md skills references

---

## Future Enhancements (Backlog)

### Sprint 3 (Future): Real-Time Monitoring Skills
- Create dedicated `src/monitoring/` infrastructure
- Implement distributed tracing wrapper
- Health check orchestration skill

### Sprint 4 (Future): Phase 4 Analytics Skills
- Create `src/analytics/` infrastructure
- Consensus tracking skill wrapper
- Performance assessment tools
- Truth score analysis

---

## References

- **FEATURES_MATRIX.md:** Monitoring section (lines 108-132)
- **Existing Code:** `packages/web-portal/` (188 files)
- **Existing Code:** `src/coordination/transparency-middleware.ts` (580 lines)
- **Pattern Reference:** `.claude/skills/ace-system/` v1.0.0
- **CFN Loop Docs:** `CLAUDE.md` sections 4-5
