# Zustand State Management Stores

Comprehensive state management for the unified web portal using Zustand with middleware.

## Store Overview

### 1. Agent Store (`agentStore.ts`)
Manages agent lifecycle, hierarchy, and selection state.

**Features:**
- Agent CRUD operations with immutable updates
- Agent hierarchy building and depth calculation
- Selection management
- localStorage persistence with 1-hour TTL
- Immer middleware for immutable state updates
- DevTools integration

**State:**
```typescript
{
  agents: Agent[]
  selectedAgentId: string | null
  hierarchy: AgentHierarchy | null
  loading: boolean
  error: string | null
}
```

**Usage:**
```typescript
import { useAgentStore, agentSelectors } from '@/shared/stores';

// In component
const agents = useAgentStore(state => state.agents);
const addAgent = useAgentStore(state => state.addAgent);

// Computed selectors
const activeAgents = useAgentStore(agentSelectors.getActiveAgents);
const avgConfidence = useAgentStore(agentSelectors.getAverageConfidence);
```

**Coverage:** 94.73%

---

### 2. Metrics Store (`metricsStore.ts`)
Tracks system and agent performance metrics with trend analysis.

**Features:**
- System metrics (CPU, memory, disk, network)
- Per-agent metrics tracking
- Historical data with automatic pruning (max 100 entries)
- Trend analysis (increasing/decreasing/stable)
- sessionStorage persistence (volatile)
- Map/Set support via Immer enableMapSet()

**State:**
```typescript
{
  systemMetrics: SystemMetrics | null
  agentMetrics: Map<string, AgentMetrics>
  history: {
    system: SystemMetrics[]
    agents: Map<string, AgentMetrics[]>
    maxHistory: number
  }
  loading: boolean
  error: string | null
}
```

**Usage:**
```typescript
import { useMetricsStore, metricsSelectors } from '@/shared/stores';

// System metrics
const cpuUsage = useMetricsStore(state => state.systemMetrics?.cpu);
const setMetrics = useMetricsStore(state => state.setSystemMetrics);

// Trend analysis
const memoryTrend = useMetricsStore(metricsSelectors.getMemoryTrend);
const avgCpu = useMetricsStore(metricsSelectors.getAverageCPU);
const topPerformers = useMetricsStore(state =>
  metricsSelectors.getTopPerformers(state, 5)
);
```

**Coverage:** 85.26%

---

### 3. Events Store (`eventsStore.ts`)
Real-time event stream with filtering, pagination, and auto-pruning.

**Features:**
- Event buffering (max 1000 events)
- Auto-pruning of old events
- Multi-criteria filtering (type, severity, agent, time, read status)
- Pagination with configurable page size
- No persistence (real-time only)
- Read/unread tracking

**State:**
```typescript
{
  events: Event[]
  filters: EventFilters
  pagination: EventPagination
  maxEvents: number
  loading: boolean
  error: string | null
}
```

**Usage:**
```typescript
import { useEventsStore, eventsSelectors } from '@/shared/stores';

// Add events
const addEvent = useEventsStore(state => state.addEvent);
addEvent({
  type: 'agent.spawned',
  severity: 'info',
  message: 'Agent spawned successfully',
  agentId: 'agent-1'
});

// Filtering
const setFilters = useEventsStore(state => state.setFilters);
setFilters({ types: ['agent.spawned'], severities: ['error'] });

// Pagination
const events = useEventsStore(eventsSelectors.getPaginatedEvents);
const unreadCount = useEventsStore(eventsSelectors.getUnreadCount);
```

**Coverage:** 98.25%

---

### 4. UI Store (`uiStore.ts`)
User interface preferences and layout state.

**Features:**
- Theme management (dark/light)
- Layout controls (sidebar, header, footer, compact mode)
- Notification settings
- View-specific settings (dashboard, agents, metrics, events)
- localStorage persistence (permanent)
- Perfect TypeScript type safety

**State:**
```typescript
{
  theme: 'light' | 'dark'
  activeView: ViewType
  notifications: NotificationSettings
  layout: LayoutSettings
  views: ViewSettings
  loading: boolean
}
```

**Usage:**
```typescript
import { useUIStore, uiSelectors } from '@/shared/stores';

// Theme
const theme = useUIStore(state => state.theme);
const toggleTheme = useUIStore(state => state.toggleTheme);

// Layout
const sidebarCollapsed = useUIStore(state => state.layout.sidebarCollapsed);
const toggleSidebar = useUIStore(state => state.toggleSidebar);

// Computed selectors
const isDark = useUIStore(uiSelectors.isDarkTheme);
const shouldRefresh = useUIStore(uiSelectors.shouldAutoRefresh);
```

**Coverage:** 100%

---

## Store Provider

### Setup
Wrap your app with `StoreProvider` to enable automatic hydration:

```tsx
import { StoreProvider } from '@/shared/stores';

function App() {
  return (
    <StoreProvider onHydrated={() => console.log('Stores ready')}>
      <YourApp />
    </StoreProvider>
  );
}
```

### Hydration Hook
Wait for stores to hydrate before rendering:

```tsx
import { useStoreHydration } from '@/shared/stores';

function MyComponent() {
  const isHydrated = useStoreHydration();

  if (!isHydrated) {
    return <LoadingSpinner />;
  }

  return <YourComponent />;
}
```

### HOC Wrapper
```tsx
import { withStoreHydration } from '@/shared/stores';

const MyComponent = withStoreHydration(
  YourComponent,
  LoadingComponent
);
```

---

## Persistence Strategy

| Store | Storage | TTL | Partialize |
|-------|---------|-----|------------|
| Agent | localStorage | 1 hour | agents, selectedAgentId |
| Metrics | sessionStorage | Session | all |
| Events | none | - | - |
| UI | localStorage | Permanent | theme, notifications, layout, views |

---

## Middleware Stack

All stores use:
1. **Immer** - Immutable state updates with Map/Set support
2. **Persist** - Storage with custom TTL and partialize
3. **DevTools** - Redux DevTools integration (dev only)

---

## Test Coverage

| Store | Lines | Branches | Functions |
|-------|-------|----------|-----------|
| agentStore.ts | 94.73% | 85.45% | 90.9% |
| metricsStore.ts | 85.26% | 68.33% | 90% |
| eventsStore.ts | 98.25% | 96.05% | 100% |
| uiStore.ts | 100% | 100% | 100% |

**Total:** 115 tests passing

---

## Best Practices

### 1. Use Selectors
```typescript
// ✅ Good - uses selector
const activeAgents = useAgentStore(agentSelectors.getActiveAgents);

// ❌ Bad - inline selector (causes re-renders)
const activeAgents = useAgentStore(state =>
  state.agents.filter(a => a.status === 'active')
);
```

### 2. Batch Updates
```typescript
// ✅ Good - single update
useAgentStore.setState(state => ({
  agents: newAgents,
  loading: false,
  error: null
}));

// ❌ Bad - multiple updates
useAgentStore.getState().setAgents(newAgents);
useAgentStore.getState().setLoading(false);
useAgentStore.getState().setError(null);
```

### 3. Cleanup on Unmount
```typescript
useEffect(() => {
  // Component logic

  return () => {
    // Clear volatile data
    useEventsStore.getState().clearEvents();
  };
}, []);
```

---

## Performance

- **Immer:** ~2x slower than manual updates, but prevents bugs
- **Persist:** Debounced writes to storage (throttled)
- **DevTools:** Disabled in production automatically
- **Selectors:** Memoized and optimized for re-render prevention

---

## Migration from Redux

```typescript
// Redux
const dispatch = useDispatch();
const agents = useSelector(state => state.agents.list);
dispatch(addAgent(newAgent));

// Zustand
const { agents, addAgent } = useAgentStore();
addAgent(newAgent);
```

---

## Troubleshooting

### Stores not hydrating
Check that `StoreProvider` wraps your app at the root level.

### Type errors with Immer
Ensure `enableMapSet()` is called before creating stores with Map/Set.

### Persistence not working
Verify storage quota and check browser console for quota errors.

### DevTools not showing
Only available in development mode (`process.env.NODE_ENV === 'development'`).

---

## Architecture Decisions

1. **Why Zustand over Redux?**
   - Simpler API, less boilerplate, better TypeScript support
   - No context providers needed
   - Smaller bundle size (~1KB vs ~20KB)

2. **Why Immer middleware?**
   - Prevents accidental mutations
   - Cleaner update syntax
   - Map/Set support

3. **Why multiple stores?**
   - Separation of concerns
   - Independent persistence strategies
   - Easier testing and debugging

4. **Why computed selectors?**
   - Prevent re-renders
   - Reusable logic
   - Performance optimization
