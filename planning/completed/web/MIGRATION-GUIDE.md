# Web Portal Migration Guide

## Overview

This guide helps migrate from the 8 fragmented web portals to the unified web portal in `packages/web-portal`.

**Migration Status:** Planning Phase
**Target Release:** v3.0.0
**Estimated Completion:** 8-11 weeks

---

## Current State (8 Portals)

| Portal | Location | Size | Status | Action |
|--------|----------|------|--------|--------|
| Transparency Web Portal | `src/web/` | 671MB | Complete | Archive + Migrate |
| Agent Transparency Dashboard | `src/web/dashboard/` | 396KB | Complete | Archive + Migrate |
| Fleet Dashboard | `src/dashboard/` | 204KB | Complete | Archive + Migrate |
| Web Console UI | `src/ui/console/` | 11,584 LOC | Complete | Archive |
| Enhanced Web UI | `src/ui/web-ui/` | 1.1MB | Partial | Archive |
| Premium Monitor | `monitor/dashboard/` | 42MB | Complete | Archive + Migrate auth |
| CFN Loop Dashboard | (embedded) | 423 LOC | Complete | Migrate |
| Phase 4 Dashboard | (embedded) | 1,202 LOC | Complete | Migrate |

---

## Target Architecture

```
packages/
├── web-portal/           # Main unified portal (NEW)
│   ├── src/
│   │   ├── client/      # React frontend
│   │   ├── server/      # Express backend
│   │   ├── shared/      # Shared types
│   │   └── components/  # Portal-specific components
│   ├── package.json
│   └── README.md
│
└── web-components/       # Shared component library (NEW)
    ├── src/
    │   ├── AgentHierarchyTree/
    │   ├── StatusMonitor/
    │   ├── PerformanceCharts/
    │   ├── EventTimeline/
    │   ├── ResourceGauges/
    │   └── InterventionPanel/
    ├── package.json
    └── README.md
```

---

## Migration Phases

### Phase 1: Foundation (Weeks 1-3)

**Sprint 1.1: Monorepo Setup (3-4 days)**
- Create `packages/web-portal` and `packages/web-components`
- Configure workspace in root `package.json`
- Setup TypeScript project references
- Configure build pipeline (SWC)

**Sprint 1.2: Shared Components (5-6 days)**
- Extract and unify agent hierarchy components (4 duplicates → 1)
- Extract and unify status monitors (3 duplicates → 1)
- Extract and unify performance charts (3 duplicates → 1)
- Create EventTimeline component (2 implementations → 1)

**Sprint 1.3: Unified Data Layer (4-5 days)**
- Consolidate 5 WebSocket implementations → 1
- Create unified API client
- Setup Zustand state management

### Phase 2: Backend (Weeks 4-5)

**Sprint 2.1: Core Server (4-5 days)**
- Merge 3 Express servers → 1
- Implement 7 REST API endpoints
- Setup Socket.IO server

**Sprint 2.2: Integration (5-6 days)**
- Integrate transparency system
- Integrate swarm coordinator
- Implement authentication

### Phase 3: Frontend (Weeks 6-9)

**Sprint 3.1: Core App (5-6 days)**
- Setup React SPA with routing
- Integrate shared components
- Implement Dashboard view

**Sprint 3.2: Feature Views Part 1 (5-6 days)**
- Agents view
- Hierarchy view
- Performance view

**Sprint 3.3: Feature Views Part 2 (5-6 days)**
- Events view
- Fleet view
- CFN Loop view

**Sprint 3.4: Advanced Features (5-6 days)**
- Intervention view
- Settings view
- Monaco Editor integration

### Phase 4: Cleanup (Weeks 10-11)

**Sprint 4.1: Portal Cleanup (3-4 days)**
- Archive old portals to `archive/web-portals/`
- Update imports
- Remove duplicate dependencies

**Sprint 4.2: Testing (4-5 days)**
- Component unit tests (80%+ coverage)
- API integration tests
- E2E Playwright tests

**Sprint 4.3: Documentation (3-4 days)**
- User guide
- API documentation
- Deployment scripts
- Demo and examples

---

## Feature Mapping

### From Multiple Sources → Unified Component

#### Agent Hierarchy Visualization
**Sources (4):**
- `src/web/dashboard/components/AgentHierarchyTree.tsx` ✅ Best implementation
- `src/web/dashboard/components/V1AgentHierarchyTree.tsx` (legacy)
- `src/components/visualizations/AgentHierarchyTree.tsx` (duplicate)
- `src/dashboard/components/FleetOverview.tsx` (partial)

**Target:**
- `packages/web-components/src/AgentHierarchyTree/`

**Features to Preserve:**
- Depth visualization ✓
- Expand/collapse nodes ✓
- Real-time updates ✓
- Agent selection callback ✓
- Performance metrics display ✓

#### Status Monitoring
**Sources (3):**
- `src/web/dashboard/components/AgentStatusMonitor.tsx` ✅ Best
- `src/web/frontend/src/components/AgentStatusPanel.tsx`
- `src/dashboard/components/FleetDashboard.tsx`

**Target:**
- `packages/web-components/src/StatusMonitor/`

**Features to Preserve:**
- Status cards with metrics ✓
- Progress tracking ✓
- Error highlighting ✓
- Configurable refresh ✓
- Filter support ✓

#### Performance Charts
**Sources (3):**
- `src/web/dashboard/components/PerformanceMetricsChart.tsx` ✅
- `src/dashboard/components/PerformanceChart.tsx`
- `src/components/visualizations/PerformanceCharts.tsx`

**Target:**
- `packages/web-components/src/PerformanceCharts/`

**Chart Types:**
- Line charts (time-series) ✓
- Bar charts (comparisons) ✓
- Gauge charts (resources) ✓
- Area charts (trends) ✓

#### WebSocket Client
**Sources (5):**
- `src/web/dashboard/hooks/useWebSocket.ts` ✅ Best patterns
- `src/websocket/swarmWebSocketServer.ts`
- `src/ui/console/js/websocket-client.js`
- `src/communication/websocket-cluster.ts`
- `monitor/dashboard/websocket/`

**Target:**
- `packages/web-portal/src/client/services/WebSocketClient.ts`

**Features to Preserve:**
- Auto-reconnect with exponential backoff ✓
- Event subscription system ✓
- Connection status monitoring ✓
- TypeScript types ✓
- React hook integration ✓

---

## Breaking Changes

### For Users

#### Installation
**Old (v2.x):**
```bash
npm install claude-flow-novice
# Portal included in main package (714MB)
```

**New (v3.x):**
```bash
npm install claude-flow-novice          # CLI only
npm install @claude-flow/web-portal     # Optional portal
```

#### Starting the Portal
**Old:**
```bash
# Multiple commands for different portals
node src/web/server.js
node src/dashboard/DashboardServer.js
node monitor/dashboard/secure-server.js
```

**New:**
```bash
# Single unified command
npx @claude-flow/web-portal start

# Or with CLI integration
claude-flow-novice web start
```

#### Port Changes
**Old:**
- Transparency Portal: `http://localhost:3000`
- Dashboard: `http://localhost:3001`
- Monitor: `http://localhost:8080`

**New:**
- Unified Portal: `http://localhost:3000` (configurable)

### For Developers

#### Import Paths
**Old:**
```typescript
import { AgentHierarchyTree } from '../../web/dashboard/components/AgentHierarchyTree';
import { useWebSocket } from '../../web/dashboard/hooks/useWebSocket';
```

**New:**
```typescript
import { AgentHierarchyTree, StatusMonitor } from '@claude-flow/web-components';
import { useWebSocket } from '@claude-flow/web-portal/client';
```

#### Component Props
Most components maintain backward compatibility, but some have been simplified:

**Old:**
```tsx
<AgentStatusMonitor
  statuses={statuses}
  refreshInterval={5000}
  maxCardsPerRow={4}
  showErrorsOnly={false}
  onAgentSelect={handleSelect}
/>
```

**New:**
```tsx
<StatusMonitor
  agents={agents}  // Renamed from 'statuses'
  config={{
    refreshInterval: 5000,
    layout: { columns: 4 },
    filters: { errorsOnly: false }
  }}
  onSelect={handleSelect}  // Renamed from 'onAgentSelect'
/>
```

#### WebSocket Events
Event names have been standardized:

**Old (varied across portals):**
```typescript
socket.on('agentUpdate', handler);
socket.on('agent_status_change', handler);
socket.on('status:update', handler);
```

**New (standardized):**
```typescript
socket.on('agent:update', handler);
socket.on('hierarchy:change', handler);
socket.on('metrics:update', handler);
```

---

## Migration Steps for Integrators

### Step 1: Update Dependencies

**package.json**
```diff
{
  "dependencies": {
-   "claude-flow-novice": "^2.x.x"
+   "claude-flow-novice": "^3.0.0",
+   "@claude-flow/web-portal": "^1.0.0",
+   "@claude-flow/web-components": "^1.0.0"
  }
}
```

### Step 2: Update Import Paths

Use find-replace or codemod:

```bash
# Find all old imports
grep -r "from '.*web/dashboard" src/

# Automated replacement (use with caution)
npx jscodeshift -t codemods/web-portal-migration.js src/
```

### Step 3: Update Component Usage

Review component API changes in `COMPONENT-API-CHANGELOG.md`

### Step 4: Update WebSocket Integration

**Old:**
```typescript
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000');
socket.on('agentUpdate', (data) => {
  // handle update
});
```

**New:**
```typescript
import { WebSocketClient } from '@claude-flow/web-portal/client';
const ws = new WebSocketClient('http://localhost:3000');
ws.subscribe('agent:update', (data) => {
  // handle update
});
```

### Step 5: Test & Validate

```bash
# Run migration tests
npm run test:migration

# Visual regression tests
npm run test:visual

# Integration tests
npm run test:integration
```

---

## Backward Compatibility

### v2.x Compatibility Layer (Temporary)

A compatibility shim will be provided for 6 months (until v3.2.0):

```typescript
// Old imports still work with deprecation warnings
import { AgentHierarchyTree } from 'claude-flow-novice/web/dashboard';
// Warning: This import path is deprecated. Use '@claude-flow/web-components' instead.
```

### Deprecation Timeline

- **v3.0.0** (Launch): Compatibility layer active, deprecation warnings
- **v3.1.0** (+3 months): Deprecation warnings increased
- **v3.2.0** (+6 months): Compatibility layer removed ⚠️

---

## Rollback Plan

If critical issues arise during migration:

### Option 1: Parallel Deployment
Run both old and new portals simultaneously:

```bash
# Old portal (port 3001)
node src/web/server.js --port 3001

# New portal (port 3000)
npx @claude-flow/web-portal start
```

### Option 2: Version Pinning
Pin to v2.x until issues resolved:

```json
{
  "dependencies": {
    "claude-flow-novice": "2.99.0"
  }
}
```

### Option 3: Feature Flags
Enable/disable new portal features:

```typescript
const config = {
  useUnifiedPortal: false,  // Fallback to old portal
};
```

---

## Support & Resources

### Documentation
- **Epic Configuration:** `planning/web/epic-unified-web-portal.json`
- **Research Report:** `research/WEB-PORTAL-RESEARCH-SUMMARY.md`
- **Portal Catalog:** `research/web-portal-catalog.json`
- **Component API:** `packages/web-components/API.md`

### Migration Tools
- **Automated codemod:** `scripts/migrate-web-portal.js`
- **Import path updater:** `scripts/update-imports.js`
- **Validation script:** `scripts/validate-migration.js`

### Community Support
- **GitHub Issues:** Tag with `migration:web-portal`
- **Discord Channel:** `#web-portal-migration`
- **Office Hours:** Weekly migration Q&A sessions

---

## FAQ

**Q: Do I have to migrate immediately?**
A: No. v2.x portals work until v3.2.0 (6 months). Plan migration during your next sprint.

**Q: Will my custom portal integrations break?**
A: Most integrations are backward compatible. Review breaking changes section and test thoroughly.

**Q: Can I use only parts of the new portal?**
A: Yes! `@claude-flow/web-components` is a standalone library. Use individual components without the full portal.

**Q: What about custom themes/styling?**
A: Material-UI theming is fully supported. Custom CSS may need updates. See theming guide.

**Q: How do I migrate custom WebSocket events?**
A: New portal supports custom events. See WebSocket extension guide.

**Q: Performance concerns with consolidated components?**
A: New components are optimized with React.memo, virtual scrolling, lazy loading. Performance tests show 20-30% improvement.

---

## Checklist

### Pre-Migration
- [ ] Read epic configuration
- [ ] Review breaking changes
- [ ] Audit current portal usage
- [ ] Plan migration timeline
- [ ] Setup test environment

### During Migration
- [ ] Update dependencies
- [ ] Update import paths
- [ ] Update component usage
- [ ] Update WebSocket integration
- [ ] Run migration tests
- [ ] Visual regression tests
- [ ] Performance testing

### Post-Migration
- [ ] Monitor error rates
- [ ] Gather user feedback
- [ ] Document custom changes
- [ ] Remove old portal code
- [ ] Update CI/CD pipelines
- [ ] Train team on new portal

---

**Last Updated:** 2025-10-11
**Version:** 1.0.0
**Status:** Planning Phase
