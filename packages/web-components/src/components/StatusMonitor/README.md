# StatusMonitor Component

Unified status monitoring component for agents, tasks, and processes. Consolidates features from 3 duplicate implementations across the codebase.

## Features

### Core Features
- **Status Cards**: Display items in color-coded cards with status indicators
- **Progress Indicators**: Visual progress bars for in-progress items
- **Error Highlighting**: Prominent display of errors with severity badges
- **Filter Functionality**: Filter by status type, health, connection status, or search
- **Sort Controls**: Sort by name, status, health, progress, or last activity
- **Real-time Updates**: WebSocket support for live status updates
- **Summary Statistics**: Aggregate metrics across all items

### Material-UI v6 Components
- Card and Chip components for status display
- Emotion-based styling system
- Responsive grid layout
- Theme-aware color schemes

## Installation

```bash
npm install @claude-flow-novice/web-components
```

## Basic Usage

```typescript
import { StatusMonitor, StatusItem } from '@claude-flow-novice/web-components/components/StatusMonitor';

const items: StatusItem[] = [
  {
    id: 'agent-1',
    name: 'Processing Agent',
    status: 'active',
    health: 95,
    progress: 75,
    activity: 'Processing batch job',
    lastActivity: new Date(),
    resources: {
      cpu: 45,
      memory: 60,
    },
    metrics: {
      tokensUsed: 1500,
      efficiency: 0.85,
    },
  },
];

function MyComponent() {
  return (
    <StatusMonitor
      items={items}
      onItemSelect={(id) => console.log('Selected:', id)}
      onRefresh={() => console.log('Refreshing...')}
      showSummary
      showFilters
      maxCardsPerRow={3}
    />
  );
}
```

## Advanced Usage

### With Real-time Updates

```typescript
<StatusMonitor
  items={items}
  enableRealTime
  websocketUrl="ws://localhost:3000/status"
  autoRefresh
  refreshInterval={5000}
/>
```

### With Custom Filters

```typescript
<StatusMonitor
  items={items}
  filter={{
    statuses: ['error', 'paused'],
    minHealth: 50,
    errorsOnly: true,
  }}
  sort={{
    field: 'health',
    direction: 'desc',
  }}
/>
```

### Compact Mode

```typescript
<StatusMonitor
  items={items}
  compact
  maxCardsPerRow={4}
  showSummary={false}
/>
```

## Props

### StatusMonitorProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `StatusItem[]` | required | Array of status items to display |
| `selectedId` | `string` | - | ID of currently selected item |
| `onItemSelect` | `(id: string) => void` | - | Callback when item is selected |
| `onRefresh` | `(id?: string) => void` | - | Callback for refresh action |
| `autoRefresh` | `boolean` | `true` | Enable auto-refresh |
| `refreshInterval` | `number` | `5000` | Auto-refresh interval (ms) |
| `filter` | `StatusFilter` | - | Initial filter configuration |
| `sort` | `StatusSort` | `{ field: 'name', direction: 'asc' }` | Initial sort configuration |
| `maxCardsPerRow` | `1 \| 2 \| 3 \| 4` | `3` | Maximum cards per row |
| `showSummary` | `boolean` | `true` | Show summary statistics |
| `showFilters` | `boolean` | `true` | Show filter controls |
| `showSort` | `boolean` | `true` | Show sort controls |
| `compact` | `boolean` | `false` | Compact mode (smaller cards) |
| `className` | `string` | `''` | Custom CSS class |
| `websocketUrl` | `string` | - | WebSocket URL for real-time updates |
| `enableRealTime` | `boolean` | `false` | Enable real-time updates |

### StatusItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | Unique identifier |
| `name` | `string` | ✓ | Display name |
| `status` | `StatusType` | ✓ | Current status |
| `health` | `number` | ✓ | Health percentage (0-100) |
| `progress` | `number` | ✓ | Progress percentage (0-100) |
| `lastActivity` | `Date` | ✓ | Last activity timestamp |
| `activity` | `string` | - | Current activity description |
| `connectionStatus` | `ConnectionStatus` | - | Connection status |
| `lastHeartbeat` | `Date` | - | Last heartbeat timestamp |
| `estimatedCompletion` | `Date` | - | Estimated completion time |
| `metrics` | `object` | - | Performance metrics |
| `resources` | `object` | - | Resource usage |
| `currentTask` | `object` | - | Current task/message |
| `errors` | `StatusError[]` | - | Recent errors |

### StatusType

```typescript
type StatusType = 'idle' | 'active' | 'busy' | 'paused' | 'error' | 'terminated' | 'offline';
```

## Styling

### Custom Theme

```typescript
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    success: { main: '#4caf50' },
    warning: { main: '#ff9800' },
    error: { main: '#f44336' },
  },
});

<ThemeProvider theme={theme}>
  <StatusMonitor items={items} />
</ThemeProvider>
```

### Custom Styles

```typescript
import { StatusCard } from '@claude-flow-novice/web-components/components/StatusMonitor';

const CustomCard = styled(StatusCard)(({ theme }) => ({
  borderRadius: 8,
  boxShadow: theme.shadows[2],
}));
```

## Migration Guide

### From AgentStatusMonitor.tsx

```typescript
// Old
<AgentStatusMonitor
  statuses={statusRecord}
  onAgentSelect={handleSelect}
  filterByState={['active', 'error']}
/>

// New
<StatusMonitor
  items={Object.values(statusRecord)}
  onItemSelect={handleSelect}
  filter={{ statuses: ['active', 'error'] }}
/>
```

### From AgentStatusPanel.tsx

```typescript
// Old
<AgentStatusPanel
  agents={agentList}
  selectedAgent={selectedId}
  onSendIntervention={handleIntervention}
/>

// New
<StatusMonitor
  items={agentList}
  selectedId={selectedId}
  onItemSelect={handleSelect}
  // Note: Intervention actions moved to parent component
/>
```

### From FleetDashboard.tsx

```typescript
// Old
<FleetDashboard
  config={dashboardConfig}
  autoConnect
  showAlerts
/>

// New
<StatusMonitor
  items={fleetItems}
  enableRealTime
  websocketUrl={config.websocketUrl}
  showSummary
/>
```

## Features Consolidated

### From AgentStatusMonitor.tsx
- ✓ Status cards with color-coded borders
- ✓ Progress bars with color indicators
- ✓ Metrics grid (CPU, Memory, Tokens)
- ✓ Error highlighting with severity badges
- ✓ Summary statistics
- ✓ Auto-refresh functionality
- ✓ Filter and sort controls

### From AgentStatusPanel.tsx
- ✓ Agent type differentiation
- ✓ Health bars with percentages
- ✓ Resource usage display
- ✓ Real-time WebSocket updates
- ✓ Search functionality
- ✓ Connection status indicators

### From FleetDashboard.tsx
- ✓ Connection management
- ✓ Event handling patterns
- ✓ Client integration structure
- ✓ Error state display
- ✓ Loading states

## Testing

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusMonitor } from './StatusMonitor';

test('displays status items', () => {
  const items = [
    { id: '1', name: 'Agent 1', status: 'active', health: 90, progress: 50, lastActivity: new Date() },
  ];

  render(<StatusMonitor items={items} />);
  expect(screen.getByText('Agent 1')).toBeInTheDocument();
});

test('filters by status', () => {
  render(<StatusMonitor items={items} filter={{ statuses: ['error'] }} />);
  expect(screen.queryByText('Active Agent')).not.toBeInTheDocument();
});
```

## Performance

- **Optimized rendering**: Uses `useMemo` for filtering and sorting
- **Event batching**: WebSocket updates are batched
- **Responsive grid**: Automatic layout adjustment
- **Lazy evaluation**: Summary statistics calculated on demand

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Color contrast meets WCAG AA standards

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT
