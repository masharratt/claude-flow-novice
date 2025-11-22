# Sprint 3.2 State Architecture Summary

**Agent**: state-architect
**Confidence**: 0.88
**Sprint**: 3.2 - Feature Views (Agents, Hierarchy, Performance)

---

## Architecture Overview

Designed comprehensive state management architecture for three feature views, leveraging existing Zustand stores from Sprint 1.3 with targeted extensions for real-time WebSocket integration and optimized data flow.

---

## Store Updates

### 1. agentStore Extensions

**Existing Capabilities** (Sprint 1.3):
- Agent CRUD operations
- Automatic hierarchy building
- Selection state management
- 1-hour localStorage persistence with TTL
- Immer middleware, DevTools integration

**New State Additions**:
```typescript
interface AgentStoreExtensions {
  // Filters for Agents view
  filters: {
    searchTerm: string;
    statusFilter: Agent['status'][] | 'all';
    typeFilter: string[] | 'all';
    capabilitiesFilter: string[];
  };

  // Display preferences
  viewMode: 'list' | 'grid';
  sortConfig: { field: string; order: 'asc' | 'desc' };

  // Hierarchy state
  selectedNodeId: string | null;
  expandedNodes: Set<string>;
}
```

**New Actions**:
- `setFilters(filters)` - Update filter criteria
- `spawnAgent(payload)` - Optimistic spawn with API call
- `terminateAgent(agentId, reason?)` - Optimistic terminate
- `toggleNode(nodeId)` - Expand/collapse hierarchy node
- `setSortConfig(field, order)` - Update sort configuration

**New Selectors**:
- `getFilteredAgents()` - Apply search, status, type, capabilities filters
- `getSortedAgents()` - Sort filtered agents by config
- `getHierarchyStats()` - Compute depth, total nodes, leaf nodes

**WebSocket Integration**:
```typescript
// Agents.tsx
useEffect(() => {
  const unsubscribe = wsClient.subscribe('agent:update', (payload) => {
    agentStore.updateAgent(payload.id, payload.updates);
  });
  return () => unsubscribe();
}, []);

// Hierarchy.tsx
useEffect(() => {
  const unsubscribe = wsClient.subscribe('hierarchy:change', (payload) => {
    agentStore.setAgents(payload.agents); // Full rebuild
  });
  return () => unsubscribe();
}, []);
```

---

### 2. metricsStore Extensions

**Existing Capabilities** (Sprint 1.3):
- System and agent metrics tracking
- 100-point history with auto-pruning
- Trend analysis (increasing/decreasing/stable)
- sessionStorage persistence
- Immer middleware with Map/Set support

**New State Additions**:
```typescript
interface MetricsStoreExtensions {
  // Time range selection
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d';

  // Chart configuration
  chartConfig: {
    cpuChartType: 'line' | 'area';
    memoryChartType: 'line' | 'area';
    agentsChartType: 'bar' | 'stacked-bar';
    eventsChartType: 'line' | 'area';
    showLegend: boolean;
    showGrid: boolean;
  };

  // Real-time toggle
  realTimeEnabled: boolean;
}
```

**New Actions**:
- `setTimeRange(range)` - Update time range, trigger historical fetch
- `setChartConfig(config)` - Update chart display preferences
- `exportMetrics(config)` - Export to CSV/JSON
- `fetchHistoricalData(range)` - GET /api/metrics/history?range={range}

**New Selectors**:
- `getMetricsForTimeRange()` - Filter metrics by current time range
- `getAggregatedMetrics()` - Compute avg/max/min for time range
- `getChartData(chartType)` - Transform to chart-ready format with sampling (>200 points)

**WebSocket Integration**:
```typescript
// Performance.tsx
useEffect(() => {
  if (!realTimeEnabled) return;

  const unsubscribe = wsClient.subscribe('metrics:update', (payload) => {
    metricsStore.setSystemMetrics(payload.system);
    Object.entries(payload.agents).forEach(([id, metrics]) => {
      metricsStore.setAgentMetrics(id, metrics);
    });
  });

  return () => unsubscribe();
}, [realTimeEnabled]);
```

---

### 3. uiStore Extensions

**Existing Capabilities** (Sprint 1.3):
- Theme management (light/dark)
- Layout preferences (sidebar, header, footer)
- View-specific settings
- Permanent localStorage persistence

**New View Settings**:
```typescript
interface UIStoreExtensions {
  views: {
    agents: {
      searchTerm: string;
      statusFilter: Agent['status'][] | 'all';
      typeFilter: string[] | 'all';
      capabilitiesFilter: string[];
      // ... existing viewMode, sortBy, sortOrder
    };
    hierarchy: {
      expandedNodes: string[];
      selectedNodeId: string | null;
      showMetadata: boolean;
      exportFormat: 'json' | 'csv';
    };
    performance: {
      cpuChartType: 'line' | 'area';
      memoryChartType: 'line' | 'area';
      agentsChartType: 'bar' | 'stacked-bar';
      eventsChartType: 'line' | 'area';
      showLegend: boolean;
      showGrid: boolean;
      realTimeEnabled: boolean;
      // ... existing chartType, timeRange, autoRefresh
    };
  };
}
```

**Recommendation**: Consolidate filter state from agentStore to uiStore for better separation of concerns (data vs UI preferences).

---

### 4. eventsStore (No Changes)

**Existing Capabilities** (Sprint 1.3):
- Event stream management (1000 max)
- Event filtering and pagination
- Auto-pruning by count and age
- No persistence (real-time only)

**WebSocket Integration** (already implemented):
- Subscribe to `event:stream` in Dashboard and Events views
- Real-time event stream with no throttling

---

## WebSocket Subscriptions

| Event | Payload Type | Handler | Subscribers | Throttle |
|-------|-------------|---------|-------------|----------|
| `agent:update` | `{ id: string; updates: Partial<Agent> }` | `agentStore.updateAgent()` | Agents.tsx, Dashboard.tsx | None |
| `hierarchy:change` | `{ agents: Agent[]; action: 'spawn' \| 'terminate' \| 'update' }` | `agentStore.setAgents()` | Hierarchy.tsx | 500ms debounce |
| `metrics:update` | `{ system: SystemMetrics; agents: {...} }` | `metricsStore.setSystemMetrics()` | Performance.tsx, Dashboard.tsx | 5000ms (5s) |
| `event:stream` | `Omit<Event, 'id' \| 'timestamp'>` | `eventsStore.addEvent()` | Events.tsx, Dashboard.tsx | None |

**Subscription Lifecycle**:
```typescript
useEffect(() => {
  const unsubscribe = wsClient.subscribe(event, handler);
  return () => unsubscribe(); // Cleanup on unmount
}, [dependencies]);
```

---

## Data Flow Patterns

### Pattern 1: Initial Load
```
Component Mount
  ↓
Check Store Cache (agentStore: 1h TTL, metricsStore: sessionStorage)
  ↓
Fetch from API if stale/missing (GET /api/agents, GET /api/metrics)
  ↓
Update Store (setAgents, setSystemMetrics)
  ↓
Subscribe to WebSocket
  ↓
Render with subscribeWithSelector (granular updates)
```

### Pattern 2: Real-Time Update
```
WebSocket Event (agent:update)
  ↓
Handler: agentStore.updateAgent()
  ↓
Store Notifies Subscribers (Zustand subscription)
  ↓
Only Affected Selectors Re-render
  ↓
Immer Ensures Immutable Updates
```

### Pattern 3: Optimistic Update
```
User Action (spawn agent)
  ↓
Immediately Update Store (id: 'temp-${Date.now()}')
  ↓
Component Re-renders (optimistic state)
  ↓
Background API Call (POST /api/agents)
  ↓
Success: Replace temp with real ID | Error: Revert + show notification
```

### Pattern 4: WebSocket Confirmation
```
Optimistic Update Completes
  ↓
Server Broadcasts WebSocket Event (agent:update)
  ↓
Store Receives Event
  ↓
Deduplicate by ID (update already exists)
  ↓
No Unnecessary Re-render
```

### Pattern 5: Historical Data Fetch
```
User Changes Time Range (Performance view)
  ↓
Update metricsStore.timeRange
  ↓
Trigger fetchHistoricalData(range)
  ↓
GET /api/metrics/history?range={range}
  ↓
Merge with Existing History (MAX_HISTORY=100)
  ↓
Selector Recomputes (getChartData)
  ↓
Charts Re-render
```

### Pattern 6: Filter & Sort
```
User Updates Filter (search, status, type)
  ↓
Update uiStore.views.agents.filters
  ↓
Selector: getFilteredAgents() recomputes (O(n) filter)
  ↓
Selector: getSortedAgents() recomputes (O(n log n) sort)
  ↓
Component Re-renders (only if filtered/sorted data changed)
```

---

## Performance Optimizations

### 1. Selector Memoization
**Technique**: Use Zustand `subscribeWithSelector` middleware
**Benefit**: Components only re-render when subscribed slice changes
**Example**: `useAgentStore(state => state.agents)` only re-renders when agents array changes

### 2. Computed Selectors
**Technique**: Memoize expensive computations (filter, sort, aggregate)
**Benefit**: O(n) or O(n log n) operations run only when dependencies change
**Example**: `getFilteredAgents()` recomputes only when agents or filters change

### 3. WebSocket Throttling
**Technique**: Throttle high-frequency events (metrics:update)
**Benefit**: Prevent excessive re-renders
**Example**: metrics:update throttled to 5000ms (5 seconds)

### 4. Virtual Scrolling
**Technique**: Use react-window for large lists (1000+ agents)
**Benefit**: Render only visible items (O(1) DOM nodes)
**Example**: AgentList with 1000 agents → render only ~20 visible items

### 5. Data Sampling
**Technique**: Limit chart data points to 200 for 30d range (720 points)
**Benefit**: Prevent chart rendering lag
**Example**: `getChartData()` samples every 4th point if >200 points

### 6. Shallow Equality
**Technique**: Use shallow comparison for object/array props
**Benefit**: Prevent re-renders when object reference changes but content is same
**Example**: `React.memo(AgentCard, (prev, next) => prev.agent.id === next.agent.id)`

---

## Error Handling

### 1. WebSocket Connection Lost
- WebSocketClient auto-reconnects (exponential backoff)
- Messages queued during disconnection (max 100)
- On reconnect: process queued messages
- Show notification: "Connection lost, reconnecting..."

### 2. API Fetch Failure
- Set `store.loading = false`, `store.error = 'Failed to fetch agents'`
- Show error notification with retry button
- Retry logic: exponential backoff (1s, 2s, 4s, 8s), max 3 retries
- Fallback: use cached data if available

### 3. Optimistic Update Failure
- API call fails (POST /api/agents)
- Remove temporary agent from store
- Show error notification: "Failed to spawn agent: {error}"
- No auto-retry (user can manually retry)

### 4. WebSocket Event Handling Error
- Try-catch in subscription callback
- Log error to console (DevTools)
- Increment `metricsStore.errors` counter
- Show notification: "Failed to process event"
- Continue processing other events (isolation)

### 5. Storage Quota Exceeded
- Catch `QuotaExceededError` on `localStorage.setItem()`
- Clear oldest cached data (agentStore TTL-based cleanup)
- Retry storage operation
- Show notification: "Storage limit reached, clearing cache"
- Fallback: in-memory only (no persistence)

---

## Type Safety

1. **Store Types**: All stores use TypeScript strict mode with explicit types
2. **WebSocket Payloads**: Define payload types for each event (agent:update → `{ id: string; updates: Partial<Agent> }`)
3. **API Responses**: Use React Query with TypeScript generics (`useQuery<Agent[]>`)
4. **Selector Return Types**: Explicitly type selector return values (`getFilteredAgents: (state) => Agent[]`)

---

## Testing Strategy

### 1. Store Unit Tests
**File**: `packages/web-portal/src/shared/stores/__tests__/*.test.ts`
**Coverage**:
- All actions (setAgents, addAgent, spawnAgent, etc.)
- All selectors (getFilteredAgents, getSortedAgents, etc.)
- Persistence (localStorage, sessionStorage)
- Error handling (API failures, storage quota)
- WebSocket integration (mock WebSocketClient)

**Target**: ≥85% lines/functions/branches

### 2. Integration Tests
**File**: `packages/web-portal/src/__tests__/integration/*.test.tsx`
**Coverage**:
- Store + Component integration (useAgentStore in Agents.tsx)
- Store + WebSocket integration (real WebSocketClient)
- Store + API integration (MSW mocked API)
- Optimistic updates (spawn/terminate flow)
- Real-time updates (WebSocket events)

### 3. E2E Tests
**File**: `packages/web-portal/src/__tests__/e2e/*.spec.ts`
**Coverage**:
- User flows (search → filter → spawn → terminate)
- WebSocket real-time updates (agent status changes)
- Performance (time range selector, chart rendering)
- Hierarchy (expand/collapse, export)

---

## Implementation Checklist

| Task | Lines | Dependencies |
|------|-------|--------------|
| Update agentStore.ts (state + actions + selectors) | 230 | None |
| Update metricsStore.ts (state + actions + selectors) | 180 | None |
| Update uiStore.ts (view settings) | 30 | None |
| Implement WebSocket subscriptions (3 views) | 90 | Store updates |
| Add type definitions | 40 | None |
| Write store unit tests | 350 | Store implementations |
| Write integration tests | 100 | Store + WebSocket |
| **Total** | **1020 lines** | **8-10 hours** |

---

## Recommendations

### High Priority
1. **Consolidate UI preferences into uiStore**
   - Move filters, view mode, chart config from agentStore/metricsStore to uiStore
   - Better separation of concerns (data vs UI state)

2. **Implement virtual scrolling for large agent lists**
   - Performance bottleneck with >1000 agents
   - Use react-window in AgentList component

### Medium Priority
3. **Add data sampling for 30d charts**
   - Chart rendering lag with >200 points
   - Sample every 4th point in `getChartData()` selector

4. **Debounce hierarchy:change events**
   - Prevent excessive re-renders during rapid spawn/terminate
   - Add 500ms debounce to handler

### Low Priority
5. **Add WebSocket event replay on reconnection**
   - Prevent missed events during disconnection
   - Server-side: buffer events per client, replay on reconnect

6. **Implement store snapshots for debugging**
   - Time-travel debugging, state inspection
   - Add Zustand DevTools middleware with action logging

---

## Next Steps

1. **react-frontend-engineer** implements store updates and WebSocket subscriptions (8-10h)
2. **tester** creates unit and integration tests (6-8h)
3. Run post-edit hook on all modified files
4. **Loop 2 validation** (reviewer + code-analyzer)
5. **Loop 4 Product Owner decision**

---

## Confidence Score: 0.88

**Reasoning**: Designed comprehensive state management architecture leveraging existing stores with targeted extensions. Architecture maintains efficient re-renders through selector memoization, implements real-time WebSocket subscriptions with automatic cleanup, and follows established patterns from Sprint 1.3. All data flow patterns are well-defined with clear error handling strategies.

**No Blockers**: All dependencies (Sprint 1.3 stores, WebSocketClient) are already implemented and tested.
