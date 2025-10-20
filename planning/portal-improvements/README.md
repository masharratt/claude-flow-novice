# React Web Portal Integration - Epic Configuration

**Epic ID:** `epic-react-portal-integration`
**Status:** Planned
**Duration:** 8-10 weeks
**Source:** `docs/WEB_PORTAL_HANDOFF.md`

---

## Overview

This epic covers the integration of a production-ready **React + TypeScript web portal** (6,550 lines across 9 components) into the Claude Flow Novice system. The portal provides four core capabilities:

1. **Human-in-the-Loop Interventions** - Direct agent control (9 intervention types)
2. **Real-Time Visualizations** - Live swarm metrics and agent monitoring
3. **Transparency Insights** - Agent decision tracking and reasoning analysis
4. **Message Streaming** - Advanced message filtering and threading (10k+ messages)

## Epic Structure

### 10 Phases

| Phase | Name | Duration | Status | Dependencies |
|-------|------|----------|--------|--------------|
| 0 | Current State Assessment | 1 week | Pending | None |
| 1 | Backend API & WebSocket | 2 weeks | Pending | Phase 0 |
| 2 | Core React Components | 2 weeks | Pending | Phase 1 |
| 3 | Advanced Components | 2 weeks | Pending | Phase 2 |
| 4 | Testing & QA | 1.5 weeks | Pending | Phase 3 |
| 5 | Deployment | 1 week | Pending | Phase 4 |
| 6 | Technical Debt | 1.5 weeks | Pending | Phase 5 |
| 7 | Enhanced Analytics | 3 weeks | Future (Q4 2025) | Phase 6 |
| 8 | Advanced Visualizations | 4 weeks | Future (Q1 2026) | Phase 7 |
| 9 | AI-Powered Insights | 4 weeks | Future (Q2 2026) | Phase 8 |
| 10 | Collaboration Features | 4 weeks | Future (Q3 2026) | Phase 9 |

**Phases 0-6:** Core implementation (8-10 weeks)
**Phases 7-10:** Future enhancements (15+ weeks)

## Key Components to Integrate

| Component | Lines | Purpose |
|-----------|-------|---------|
| TransparencyInsights | 956 | Decision tracking & analysis |
| SwarmDashboard | 759 | Real-time monitoring |
| FilterControls | 729 | Multi-dimensional filtering |
| AccessibilityEnhancements | 686 | WCAG 2.1 AA compliance |
| MessageViewer | 660 | Message streaming (10k+) |
| MCPIntegrationPanel | 618 | MCP command execution |
| PerformanceOptimizer | 559 | Performance monitoring |
| AgentStatusPanel | 558 | Agent sidebar |
| InterventionPanel | 480 | Human control interface |

**Total:** 6,550 lines

## Technology Stack

**Frontend:**
- React 18 + TypeScript
- Material-UI (MUI) v6
- Zustand (state management)
- React Query (data fetching)
- Socket.IO client
- Recharts + MUI X-Charts
- Fuse.js (fuzzy search)
- React Window (virtual scrolling)

**Backend Requirements:**
- 14 REST API endpoints
- WebSocket server (Socket.IO)
- Redis pub/sub for real-time events
- Security layer (rate limiting, CSRF, input validation)

**Testing:**
- Jest + React Testing Library
- Playwright (E2E)
- Accessibility testing (axe DevTools)
- Performance benchmarking

**DevOps:**
- Docker + nginx
- GitHub Actions (CI/CD)
- Monitoring & logging

## Execution Guide

### Phase 0: Assessment (Week 1)

**Goal:** Understand current state and plan integration strategy

**Tasks:**
1. Document current vanilla portal features (10 tabs, 1300 lines)
2. Conduct gap analysis: vanilla vs React
3. Design integration strategy: (A) Replace, (B) Hybrid, (C) Gradual
4. Audit backend API readiness (14 endpoints, WebSocket)
5. Create migration plan with rollback strategy

**Output:** Integration strategy document, migration plan, risk assessment

**Command:**
```bash
/cfn-loop-epic "React Portal Integration" --phase=0-assessment
```

### Phase 1: Backend Foundation (Weeks 2-3)

**Goal:** Implement backend APIs and WebSocket infrastructure

**Critical Tasks:**
- ✅ Implement 14 REST endpoints
- ✅ WebSocket server with 8 event types
- ✅ Redis pub/sub integration
- ✅ Security layer (rate limiting, validation)

**Validation:**
```bash
# Test REST endpoints
curl http://localhost:3000/api/agents
curl http://localhost:3000/api/messages
curl http://localhost:3000/api/decisions

# Test WebSocket
wscat -c ws://localhost:3000

# Check Redis subscription
redis-cli psubscribe "swarm:*:*"
```

**Command:**
```bash
/cfn-loop-epic "React Portal Integration" --phase=1-foundation
```

### Phase 2: Core Components (Weeks 4-5)

**Goal:** Integrate 4 largest React components

**Components:**
1. SwarmDashboard (759 lines) - Real-time monitoring
2. TransparencyInsights (956 lines) - Decision tracking
3. FilterControls (729 lines) - Multi-dimension filtering
4. AccessibilityEnhancements (686 lines) - WCAG compliance

**Setup:**
```bash
cd web-portal/
npm install
npm run dev
```

**Validation:**
- ✅ Real-time metrics updating every 1 second
- ✅ Decision timeline showing live data
- ✅ Filters working (agent, type, priority, keyword)
- ✅ WCAG 2.1 AA compliance (axe DevTools: 0 violations)

**Command:**
```bash
/cfn-loop-epic "React Portal Integration" --phase=2-core-components
```

### Phase 3: Advanced Components (Weeks 6-7)

**Goal:** Integrate remaining 5 components

**Components:**
1. MessageViewer (660 lines) - Virtual scrolling, threading
2. InterventionPanel (480 lines) - 9 intervention types
3. MCPIntegrationPanel (618 lines) - MCP commands
4. AgentStatusPanel (558 lines) - Agent sidebar
5. PerformanceOptimizer (559 lines) - Performance monitoring

**Validation:**
- ✅ Message viewer handles 10,000+ messages smoothly
- ✅ All 9 intervention types functional
- ✅ MCP commands executable from UI
- ✅ Agent sidebar shows real-time status

**Command:**
```bash
/cfn-loop-epic "React Portal Integration" --phase=3-advanced-components
```

### Phase 4: Testing & QA (Week 8, days 1-3)

**Goal:** Comprehensive testing and performance optimization

**Test Suites:**
```bash
# Unit tests
npm test -- --coverage

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Accessibility audit
npm run test:a11y

# Performance benchmarking
npm run benchmark
```

**Targets:**
- ✅ Test coverage ≥80%
- ✅ Bundle size <3MB gzipped
- ✅ WebSocket latency <50ms
- ✅ WCAG 2.1 AA (0 violations)
- ✅ 10,000+ message capacity

**Command:**
```bash
/cfn-loop-epic "React Portal Integration" --phase=4-testing-qa
```

### Phase 5: Deployment (Week 8, days 4-5)

**Goal:** Production deployment with monitoring

**Steps:**
```bash
# Build Docker image
docker build -t claude-flow-portal .

# Deploy to staging
docker-compose up -d staging

# Run smoke tests
npm run test:smoke

# Deploy to production
docker-compose up -d production
```

**Validation:**
- ✅ Zero downtime deployment
- ✅ All health checks passing
- ✅ Monitoring operational
- ✅ Rollback plan tested

**Command:**
```bash
/cfn-loop-epic "React Portal Integration" --phase=5-deployment
```

### Phase 6: Technical Debt (Weeks 9-10)

**Goal:** Address technical debt and optimize

**Tasks:**
1. Extract shared types to @types package
2. Consolidate WebSocket logic into custom hook
3. Improve error boundary hierarchy
4. Increase test coverage to 90%
5. Optimize bundle size (<2MB gzipped)

**Command:**
```bash
/cfn-loop-epic "React Portal Integration" --phase=6-technical-debt
```

## Future Enhancements (Phases 7-10)

### Phase 7: Enhanced Analytics (Q4 2025)
- Historical performance reports (24h, 7d, 30d)
- Trend analysis and forecasting
- Anomaly detection
- Custom dashboard builder

### Phase 8: Advanced Visualizations (Q1 2026)
- 3D agent network graph (Three.js)
- Real-time heatmaps
- Coordination flow diagram (Sankey)
- Interactive timeline

### Phase 9: AI-Powered Insights (Q2 2026)
- Predictive intervention suggestions
- Pattern recognition engine
- Automated feedback generation
- Performance recommendations

### Phase 10: Collaboration Features (Q3 2026)
- Multi-user access (10+ concurrent)
- Role-based permissions (4 roles)
- Intervention approval workflows
- Team notifications (Slack, Discord, email)

## Success Criteria

**Phase 0-6 Completion:**
- ✅ All 9 React components integrated
- ✅ Real-time WebSocket communication established
- ✅ Human interventions routing to agents
- ✅ Decision transparency tracking operational
- ✅ Performance targets met (10k+ messages, <100ms latency)
- ✅ WCAG 2.1 AA compliance maintained
- ✅ Test coverage ≥80%
- ✅ Production deployment successful

## Key Risks & Mitigation

### Risk 1: Large Bundle Size (5MB gzipped)
**Mitigation:** Code splitting, lazy loading, tree shaking. Target: <3MB in Phase 4, <2MB in Phase 6.

### Risk 2: Backend API Gaps
**Mitigation:** Phase 1 focuses entirely on backend foundation. Complete before React integration.

### Risk 3: WebSocket Scalability
**Mitigation:** Connection pooling, load balancing, Redis pub/sub. Load testing in Phase 4.

### Risk 4: User Disruption
**Mitigation:** Hybrid approach - keep vanilla portal available as fallback during transition.

### Risk 5: Maintenance Complexity
**Mitigation:** Comprehensive documentation, testing (≥80%), knowledge transfer sessions.

## Metrics & KPIs

| Metric | Target | Current | Measurement |
|--------|--------|---------|-------------|
| Test Coverage | ≥80% | ~40% | Jest coverage report |
| Bundle Size | <3MB | ~5MB | Webpack Bundle Analyzer |
| Load Time | <3s | TBD | Lighthouse |
| WS Latency | <50ms | TBD | Performance monitoring |
| Accessibility | WCAG 2.1 AA | TBD | axe DevTools |
| Message Capacity | 10,000+ | 10,000 | Load testing |
| Concurrent Users | 100+ | 100 agents | Load testing |
| Security | 0 critical | TBD | Security audit |

## Resource Allocation

| Role | Count | Allocation | Phases |
|------|-------|------------|--------|
| Architect | 1 | 50% | 0, 1, 5, 6 |
| React Frontend Engineer | 2 | 100% | 2, 3, 6, 7-10 |
| Backend Developer | 2 | 75% | 1, 9, 10 |
| DevOps Engineer | 1 | 50% | 1, 4, 5 |
| Tester (QA) | 1 | 75% | 2-4, 6 |
| Accessibility Advocate | 1 | 25% | 2, 4 |
| Security Specialist | 1 | 25% | 1, 4 |
| Technical Writer | 1 | 25% | 5 |

**Total Team:** ~6-8 people (FTE equivalent: 4.5)

## Integration Patterns

### Pattern 1: Replace Vanilla Portal
**Pros:** Clean slate, full React features, no dual maintenance
**Cons:** Higher risk, larger bundle, longer migration

### Pattern 2: Hybrid Approach (Recommended)
**Pros:** Gradual migration, fallback option, reduced risk
**Cons:** Dual maintenance during transition

**Implementation:**
```bash
# Vanilla portal (default): http://localhost:3456
# React portal (opt-in): http://localhost:3457

# Link from vanilla to React portal
<a href="http://localhost:3457">Launch Advanced Portal (Beta)</a>
```

### Pattern 3: Tab-by-Tab Migration
**Pros:** Incremental, lowest risk, mixed architecture
**Cons:** Complex integration, longest timeline

## Related Documentation

- **Source:** `docs/WEB_PORTAL_HANDOFF.md` (Complete technical handoff, 1645 lines)
- **Current Portal:** `scripts/simple-portal-server.cjs` (Vanilla implementation, 1300+ lines)
- **React Codebase:** `web-portal/src/` (To be migrated from `legacy/v1/src/web/frontend/`)
- **API Spec:** To be created in Phase 1

## Questions & Decisions

### Q1: Which integration pattern should we use?
**Options:** (A) Replace, (B) Hybrid, (C) Tab-by-tab
**Recommendation:** Hybrid approach (Pattern 2) - provides fallback and gradual migration
**Decision Maker:** Architect + Product Owner
**Due:** End of Phase 0

### Q2: What is the bundle size threshold for viability?
**Consideration:** Current vanilla portal is 300KB. React portal is 5MB gzipped.
**Target:** <3MB in Phase 4, <2MB in Phase 6
**Decision Point:** If bundle optimization fails in Phase 6, reconsider integration strategy

### Q3: Should we maintain both portals long-term?
**Options:** (A) Sunset vanilla after 3 months, (B) Keep both indefinitely
**Recommendation:** Evaluate user adoption after Phase 5, decide in Phase 6
**Decision Maker:** Product Owner

## Contact & Support

**Epic Owner:** Architecture Team
**Technical Lead:** React Frontend Engineer
**Stakeholders:** Frontend Team, Backend Team, DevOps Team

**Channels:**
- Planning: `planning/portal-improvements/`
- Documentation: `docs/WEB_PORTAL_HANDOFF.md`
- Issues: GitHub Issues with tag `epic:react-portal`
- Discussions: Weekly sync meetings

---

**Last Updated:** 2025-10-20
**Next Review:** End of Phase 0 (Week 1)
