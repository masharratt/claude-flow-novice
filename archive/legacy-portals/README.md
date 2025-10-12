# Legacy Portal Systems - Archived

**Archive Date:** 2025-10-12
**Phase:** Phase 4 - Cleanup and Documentation
**Archived By:** WS-2 Coder Agent

---

## Overview

This directory contains legacy portal and monitoring systems that were replaced by the unified web portal (`packages/web-portal`) implemented in Sprint 3.2 and Sprint 3.3.

The unified web portal consolidates all monitoring, visualization, and management functionality into a single, modern React application with real-time updates, comprehensive testing, and enterprise-scale performance.

---

## Archived Systems

### 1. Dashboard Portal (`dashboard/`)

**Original Location:** `src/dashboard/`
**Purpose:** Standalone dashboard server with React components for fleet monitoring, memory analysis, Redis inspection, and SQLite schema visualization.

**Components:**
- `DashboardServer.ts` - Express server for dashboard API
- `FleetDashboardClient.ts` - Fleet monitoring client
- `MemoryDashboard.tsx` - Memory leak detection and analysis
- `MemoryHeatmapComponent.tsx` - Memory usage heatmap visualization
- `MemoryPatternAnalysis.tsx` - Pattern detection for memory issues
- `OptimizationEngine.tsx` - Performance optimization recommendations
- `RealtimeMonitor.ts` - Real-time metrics monitoring
- `RedisClient.ts` - Redis connection management
- `RedisKeyInspector.tsx` - Redis key/value inspection tool
- `SQLiteSchemaVisualization.tsx` - Database schema visualization

**Replaced By:**
- Unified web portal at `/` (main dashboard)
- Performance view at `/performance`
- Fleet view at `/fleet`

---

### 2. Monitoring Infrastructure (`monitoring/`)

**Original Location:** `src/monitoring/`
**Purpose:** Backend monitoring services for agent health, fleet management, APM integration, and system diagnostics.

**Components:**
- `AgentBoosterMonitor.js` - Agent performance boosting
- `AlertSystem.js` - Alert generation and management
- `AutomatedHealing.js` - Self-healing automation
- `FleetMonitoringDashboard.js` - Fleet monitoring backend
- `FleetMonitoringDemo.js` - Demo/test environment
- `FleetMonitoringIntegrationTest.js` - Integration tests
- `PredictiveMaintenance.js` - Predictive failure detection
- `agent-health-monitor.ts` - Agent lifecycle and health tracking
- `diagnostics.ts` - System diagnostics utilities
- `health-check.ts` - Health check endpoints
- `memory-leak-dashboard-widget.ts` - Memory leak widget backend
- `metrics-collector.ts` - Metrics aggregation
- `real-time-feedback-system.ts` - Real-time feedback loop
- `real-time-monitor.ts` - Real-time monitoring engine

**APM Integration:**
- `apm/apm-integration.ts` - APM orchestration
- `apm/datadog-collector.ts` - Datadog integration
- `apm/newrelic-collector.ts` - New Relic integration
- `apm/distributed-tracing.ts` - Distributed tracing
- `apm/performance-optimizer.ts` - Performance optimization

**Phase 4 Analytics:**
- `phase4/analytics/consensus-tracker.ts` - CFN Loop consensus tracking
- `phase4/analytics/performance-assessor.ts` - Performance assessment
- `phase4/analytics/truth-score-analyzer.ts` - Truth score analysis
- `phase4/dashboard/monitoring-dashboard.ts` - Phase 4 dashboard backend

**Replaced By:**
- Events view at `/events` (real-time event monitoring)
- Fleet view at `/fleet` (agent health, swarm coordination)
- Performance view at `/performance` (metrics, charts, system health)
- Dashboard view at `/` (aggregated system overview)

---

### 3. Domain-Specific Monitoring

**Consensus Monitoring** (`consensus-monitoring/`)
- Original Location: `src/consensus/monitoring/`
- Purpose: CFN Loop consensus validation monitoring
- Replaced By: CFN Loop view at `/cfn-loop`

**Feature Flags Monitoring** (`feature-flags-monitoring/`)
- Original Location: `src/feature-flags/monitoring/`
- Purpose: Feature flag rollout monitoring
- Replaced By: Settings view at `/settings`

**Fleet Manager Monitoring** (`fleet-manager-monitoring/`)
- Original Location: `src/fleet-manager/monitoring/`
- Purpose: Enterprise fleet management monitoring (1000+ agents)
- Replaced By: Fleet view at `/fleet` with scaling support

**Gossip Monitoring** (`gossip-monitoring/`)
- Original Location: `src/gossip/monitoring/`
- Purpose: Gossip protocol coordination monitoring
- Replaced By: Events view at `/events` and Fleet view at `/fleet`

**Sovereignty Monitoring** (`sovereignty-monitoring/`)
- Original Location: `src/sovereignty/monitoring/`
- Purpose: Agent sovereignty and autonomy monitoring
- Replaced By: Agents view at `/agents` with autonomy metrics

---

## Migration Path

### For Users

**Old URL → New URL Mapping:**

| Legacy URL | New Unified Portal URL | Description |
|------------|------------------------|-------------|
| `/dashboard` | `/` | Main dashboard |
| `/agent-management` | `/agents` | Agent management |
| `/agent-portal` | `/agents` | Agent portal |
| `/metrics-dashboard` | `/performance` | Performance metrics |
| `/metrics` | `/performance` | System metrics |
| `/hierarchy-viewer` | `/hierarchy` | Agent hierarchy |
| `/event-log` | `/events` | Event timeline |
| `/event-viewer` | `/events` | Event viewer |
| `/swarm-coordinator` | `/fleet` | Fleet overview |
| `/swarms` | `/fleet` | Swarm management |
| `/cfn-monitor` | `/cfn-loop` | CFN Loop monitoring |
| `/cfn-dashboard` | `/cfn-loop` | CFN Loop dashboard |
| `/performance-dashboard` | `/performance` | Performance dashboard |
| `/settings-panel` | `/settings` | Settings panel |

**Automatic Redirects:** All legacy URLs automatically redirect to the new unified portal with appropriate notices.

---

### For Developers

**API Endpoints:** Legacy backend monitoring APIs have been replaced with the unified web portal API at `packages/web-portal/src/server/`.

**WebSocket Subscriptions:** Real-time updates now use the unified WebSocket server:
- `ws://localhost:3000/ws` (development)
- Event channels: `agent:update`, `swarm:update`, `event:stream`, `cfn.loop.update`, `metrics:update`

**State Management:** Zustand stores replace legacy monitoring state:
- `agentStore.ts` - Agent and swarm state
- `metricsStore.ts` - Performance metrics
- `eventsStore.ts` - Event timeline
- `cfnLoopStore.ts` - CFN Loop state

**Testing:** Legacy monitoring tests replaced by comprehensive test suite:
- Unit tests: `packages/web-portal/src/__tests__/views/*.test.tsx`
- E2E tests: `packages/web-portal/src/__tests__/e2e/*.spec.ts`
- Integration tests: `packages/web-portal/src/__tests__/integration/*.test.tsx`

---

## Technical Details

### Unified Web Portal Features

**Architecture:**
- React 18 with TypeScript
- Vite build system for fast HMR
- Zustand for state management
- React Router v6 for routing
- WebSocket integration for real-time updates
- Chart.js for data visualization

**Performance:**
- Virtual scrolling for 10K+ items
- Code splitting and lazy loading
- SSR-ready with Vite SSR
- Docker deployment support
- Nginx reverse proxy configuration

**Testing:**
- Jest/Vitest unit tests (≥80% coverage)
- Playwright E2E tests
- Integration tests with mock WebSocket
- Visual regression testing

**Enterprise Features:**
- 1000+ agent support with virtual scrolling
- Real-time metrics updates (WebSocket)
- Responsive design (mobile, tablet, desktop)
- Dark mode support
- Accessibility (ARIA labels, keyboard navigation)
- Error boundaries and graceful degradation

---

## Why These Systems Were Archived

### 1. Fragmentation
Legacy systems were scattered across multiple directories (`src/dashboard/`, `src/monitoring/`, domain-specific `monitoring/`) with inconsistent APIs and duplicate functionality.

### 2. Maintainability
Multiple standalone portals required separate maintenance, testing, and deployment pipelines.

### 3. User Experience
Users had to navigate between different portals to access related information (e.g., agent health in one portal, performance metrics in another).

### 4. Performance
Legacy systems lacked virtual scrolling, efficient state management, and modern optimization techniques required for enterprise scale (1000+ agents).

### 5. Testing
Legacy systems had incomplete test coverage and lacked E2E tests for critical user flows.

### 6. Technology Debt
Mixed React/vanilla JS implementations, outdated dependencies, and inconsistent patterns.

---

## Unified Portal Benefits

### For Users
- Single portal for all monitoring and management tasks
- Consistent UI/UX across all features
- Real-time updates without page refreshes
- Responsive design for mobile/tablet access
- Faster load times with code splitting

### For Developers
- Single codebase to maintain
- Comprehensive test suite (≥80% coverage)
- TypeScript for type safety
- Modern build tooling (Vite)
- Clear architectural patterns
- Easier to add new features

### For Operations
- Single deployment artifact
- Docker containerization
- Nginx reverse proxy for production
- Health check endpoints
- Simplified monitoring and logging

---

## Future Work

The unified web portal is designed to be extended:

1. **Additional Views:** New views can be added to `packages/web-portal/src/client/views/`
2. **Custom Charts:** Chart.js components in `packages/web-portal/src/client/views/Performance/charts/`
3. **Real-time Features:** WebSocket subscriptions in `packages/web-portal/src/shared/hooks/useWebSocket.ts`
4. **State Management:** New Zustand stores in `packages/web-portal/src/shared/stores/`
5. **API Endpoints:** Server routes in `packages/web-portal/src/server/routes/`

---

## Recovery Instructions

**If legacy systems are needed temporarily:**

1. Restore from archive:
   ```bash
   git mv archive/legacy-portals/[system] src/[original-location]
   ```

2. Install dependencies:
   ```bash
   cd src/[system]
   npm install  # if package.json exists
   ```

3. Update imports and references in codebase

4. Test thoroughly before using in production

**Recommended:** Use unified web portal instead. Legacy systems lack modern features and are not maintained.

---

## Contact

**Questions or Issues:**
- Review unified web portal documentation: `packages/web-portal/README.md`
- Check Sprint 3.2/3.3 implementation plans: `planning/phases/sprints/SPRINT_3.*.json`
- Review Phase 4 cleanup documentation: `planning/phases/PHASE_4_CLEANUP_DOCUMENTATION.json`

---

## Archive Metadata

```json
{
  "archive_date": "2025-10-12",
  "archived_by": "WS-2 Coder Agent",
  "phase": "Phase 4 - Cleanup and Documentation",
  "systems_archived": 8,
  "total_files": 150,
  "reason": "Replaced by unified web portal (Sprint 3.2/3.3)",
  "unified_portal_location": "packages/web-portal",
  "redirects_configured": true,
  "recovery_supported": true,
  "maintenance_status": "archived - not maintained"
}
```

---

## Version History

- **2025-10-12:** Initial archive of legacy portal systems
  - Archived: dashboard, monitoring, consensus-monitoring, feature-flags-monitoring, fleet-manager-monitoring, gossip-monitoring, sovereignty-monitoring
  - Added redirects in unified web portal routing
  - Created comprehensive deprecation documentation
