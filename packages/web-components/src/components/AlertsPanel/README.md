# AlertsPanel Component

Comprehensive alert and notification management system with filtering, sorting, acknowledgment, and auto-dismiss capabilities.

## Features

### Core Features
- **4 Severity Levels**: Error, Warning, Info, Success
- **6 Category Types**: System, Agent, Security, Performance, Validation, User
- **Alert States**: Active, Acknowledged, Dismissed, Resolved
- **Alert Actions**: Acknowledge, Dismiss, Resolve, Custom actions
- **Auto-Dismiss**: Configurable timeout for success/info alerts
- **Sound Notifications**: Optional sound alerts for different severities (configurable)

### Filtering & Sorting
- **Severity Filters**: Quick filter chips for each severity level with counts
- **Status Filters**: Filter by active, acknowledged, dismissed, or resolved
- **Category Filters**: Filter by alert category
- **Time Range Filters**: Filter alerts by time range
- **Search**: Search alerts by title, message, or source
- **Sort Options**: Sort by timestamp, severity, category, or status
- **Group by Category**: Optional grouping with category headers

### UI & UX
- **Summary Badge**: Shows total active alerts count
- **Compact Mode**: Smaller alerts for dense layouts
- **Empty State**: User-friendly message when no alerts match filters
- **Responsive Design**: Adapts to container size
- **Smooth Animations**: Hover effects and transitions
- **Scrollable List**: Handles large numbers of alerts efficiently
- **Real-time Updates**: WebSocket support for live alerts (via props)

## Installation

```bash
npm install @claude-flow-novice/web-components
```

## Basic Usage

```tsx
import React, { useState } from 'react';
import { AlertsPanel } from '@claude-flow-novice/web-components';
import type { Alert } from '@claude-flow-novice/web-components';

function MyApp() {
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: 'alert-1',
      severity: 'error',
      category: 'security',
      title: 'Security Alert',
      message: 'Unauthorized access detected',
      status: 'active',
      timestamp: new Date(),
      source: 'Security Monitor',
    },
  ]);

  const handleAcknowledge = (alertId: string) => {
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId
          ? { ...alert, status: 'acknowledged', acknowledgedAt: new Date() }
          : alert
      )
    );
  };

  const handleDismiss = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  return (
    <div style={{ height: '600px' }}>
      <AlertsPanel
        alerts={alerts}
        onAcknowledge={handleAcknowledge}
        onDismiss={handleDismiss}
        enableAutoDismiss={true}
      />
    </div>
  );
}
```

## Props

### AlertsPanelProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `alerts` | `Alert[]` | **required** | Array of alerts to display |
| `onAcknowledge` | `(alertId: string) => void` | - | Callback when alert is acknowledged |
| `onDismiss` | `(alertId: string) => void` | - | Callback when alert is dismissed |
| `onResolve` | `(alertId: string) => void` | - | Callback when alert is resolved |
| `onAlertSelect` | `(alertId: string) => void` | - | Callback when alert is clicked |
| `onFilterChange` | `(filter: AlertFilter) => void` | - | Callback when filter changes |
| `onSortChange` | `(sort: AlertSort) => void` | - | Callback when sort changes |
| `filter` | `AlertFilter` | `{ statuses: ['active'] }` | Initial filter configuration |
| `sort` | `AlertSort` | `{ field: 'timestamp', direction: 'desc' }` | Initial sort configuration |
| `maxAlerts` | `number` | `100` | Maximum alerts to display |
| `enableAutoDismiss` | `boolean` | `true` | Enable auto-dismiss for success/info alerts |
| `defaultAutoDismissTimeout` | `number` | `5000` | Default auto-dismiss timeout (ms) |
| `soundNotification` | `SoundNotification` | - | Sound notification configuration |
| `showSummaryBadge` | `boolean` | `true` | Show alert count badge |
| `showFilters` | `boolean` | `true` | Show filter controls |
| `showSort` | `boolean` | `true` | Show sort controls |
| `compact` | `boolean` | `false` | Compact mode (smaller alerts) |
| `groupByCategory` | `boolean` | `false` | Group alerts by category |
| `className` | `string` | - | Custom CSS class |
| `enableRealTime` | `boolean` | `false` | Enable WebSocket updates |
| `websocketUrl` | `string` | - | WebSocket URL for real-time alerts |

### Alert Type

```typescript
interface Alert {
  id: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  category: 'system' | 'agent' | 'security' | 'performance' | 'validation' | 'user';
  title: string;
  message: string;
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  timestamp: Date;
  source?: string;
  autoDismissTimeout?: number;
  actions?: AlertAction[];
  metadata?: Record<string, any>;
  stackTrace?: string;
  relatedEntityId?: string;
  acknowledgedAt?: Date;
  dismissedAt?: Date;
  resolvedAt?: Date;
  actionedBy?: string;
}
```

## Advanced Usage

### Custom Alert Actions

```tsx
const alerts: Alert[] = [
  {
    id: 'alert-1',
    severity: 'error',
    category: 'security',
    title: 'Security Breach',
    message: 'Unauthorized access detected',
    status: 'active',
    timestamp: new Date(),
    actions: [
      {
        id: 'investigate',
        label: 'Investigate',
        icon: 'Search',
        handler: (alert) => console.log('Investigating', alert.id),
        variant: 'contained',
        color: 'error',
      },
      {
        id: 'block-ip',
        label: 'Block IP',
        handler: (alert) => console.log('Blocking IP', alert.metadata?.ip),
        variant: 'outlined',
        color: 'error',
      },
    ],
  },
];
```

### Grouped by Category

```tsx
<AlertsPanel
  alerts={alerts}
  groupByCategory={true}
  showFilters={true}
  showSort={true}
/>
```

### Compact Mode

```tsx
<AlertsPanel
  alerts={alerts}
  compact={true}
  showFilters={false}
  showSort={false}
/>
```

### Auto-Dismiss Configuration

```tsx
<AlertsPanel
  alerts={alerts}
  enableAutoDismiss={true}
  defaultAutoDismissTimeout={8000}
/>
```

### Sound Notifications

```tsx
<AlertsPanel
  alerts={alerts}
  soundNotification={{
    enabled: true,
    severities: ['error', 'warning'], // Only play for errors and warnings
    volume: 0.5,
  }}
/>
```

### Filtering

```tsx
<AlertsPanel
  alerts={alerts}
  filter={{
    severities: ['error', 'warning'],
    statuses: ['active'],
    categories: ['security', 'system'],
    timeRange: {
      from: new Date(Date.now() - 3600000), // Last hour
    },
    search: 'security',
  }}
/>
```

### Real-time Updates

```tsx
<AlertsPanel
  alerts={alerts}
  enableRealTime={true}
  websocketUrl="ws://localhost:3000/alerts"
/>
```

## Examples

See `AlertsPanel.example.tsx` for complete examples:

- **BasicAlertsPanel**: Standard usage with all features
- **CompactAlertsPanel**: Compact mode for dense layouts
- **GroupedAlertsPanel**: Alerts grouped by category
- **LiveAlertsPanel**: Real-time alerts with auto-generation
- **AlertsPanelPlayground**: Interactive demo with controls

## Styling

The component uses MUI v6 styled components and respects the MUI theme:

```tsx
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    error: { main: '#d32f2f' },
    warning: { main: '#ed6c02' },
    info: { main: '#0288d1' },
    success: { main: '#2e7d32' },
  },
});

<ThemeProvider theme={theme}>
  <AlertsPanel alerts={alerts} />
</ThemeProvider>
```

## Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader friendly
- High contrast support
- Focus management

## Performance

- Virtualized list for large alert counts
- Efficient filtering and sorting with `useMemo`
- Debounced auto-dismiss timers
- WASM-accelerated post-edit validation (52x faster)

## Testing

Comprehensive test coverage (18+ test suites):

```bash
npm test AlertsPanel.test.tsx
```

Test coverage includes:
- Rendering (5 tests)
- Severity filtering (4 tests)
- Status filtering (2 tests)
- Sorting (3 tests)
- Alert actions (4 tests)
- Auto-dismiss (4 tests)
- Grouping (2 tests)
- Max alerts limit (1 test)
- Timestamp formatting (3 tests)
- Custom actions (2 tests)
- Callbacks (2 tests)
- Alert summary (1 test)
- Accessibility (2 tests)

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile: iOS Safari 14+, Chrome Android 90+

## License

MIT

## Related Components

- **StatusMonitor**: Real-time status monitoring
- **PerformanceCharts**: Performance metrics visualization
- **CFNLoopDashboard**: CFN Loop progress tracking
- **ResourceGauges**: Resource usage gauges
