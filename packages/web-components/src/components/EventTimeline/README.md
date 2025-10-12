# EventTimeline Component

Consolidated event timeline component with search, filters, virtual scrolling, and export capabilities.

## Features

- **Search Events**: Full-text search across event titles, descriptions, and metadata
- **Category Filters**: Filter by agent, system, error, warning, success, info
- **Severity Filters**: Filter by info, warning, error, success severity levels
- **Agent Filters**: Filter events by specific agent IDs
- **Virtual Scrolling**: Efficiently render 1000+ events using react-window
- **Real-time Event Stream**: Auto-refresh support for live event updates
- **Export**: Export filtered events to JSON or CSV format
- **Event Details**: Toggle detailed metadata visibility
- **Event Statistics**: Real-time statistics display (total, errors, success, agents)

## Installation

```bash
npm install @claude-flow-novice/web-components react-window
```

## Dependencies

- React 18.3.1+
- Material-UI v6.1.7+
- react-window 1.8.10+

## Basic Usage

```tsx
import { EventTimeline, TimelineEvent } from '@claude-flow-novice/web-components';

const events: TimelineEvent[] = [
  {
    id: 'event-1',
    timestamp: new Date(),
    type: 'spawned',
    category: 'agent',
    title: 'Agent spawned',
    description: 'Agent coder-1 spawned at level 1',
    agentId: 'coder-1',
    severity: 'info',
    metadata: {
      level: 1,
      priority: 5,
    },
  },
  // ... more events
];

function App() {
  return (
    <EventTimeline
      events={events}
      maxEvents={1000}
      enableSearch
      showFilters
      enableVirtualScrolling
      enableExport
    />
  );
}
```

## Advanced Usage

### With Event Selection

```tsx
<EventTimeline
  events={events}
  onEventSelect={(eventId) => {
    console.log('Selected event:', eventId);
    // Handle event selection
  }}
/>
```

### With Custom Filters

```tsx
<EventTimeline
  events={events}
  filter={{
    categories: ['error', 'warning'],
    severities: ['error'],
    agentIds: ['coder-1', 'coder-2'],
    searchQuery: 'authentication',
    timeRange: {
      start: new Date('2025-10-11T00:00:00Z'),
      end: new Date('2025-10-11T23:59:59Z'),
    },
  }}
/>
```

### With Auto-Refresh

```tsx
<EventTimeline
  events={events}
  autoRefresh
  refreshInterval={5000} // 5 seconds
/>
```

### Without Virtual Scrolling (for small event lists)

```tsx
<EventTimeline
  events={events}
  enableVirtualScrolling={false}
  maxEvents={50}
/>
```

### Custom Styling

```tsx
<EventTimeline
  events={events}
  className="custom-timeline"
  style={{ height: '800px' }}
  virtualScrollHeight={700}
  itemHeight={150}
/>
```

## Props

### EventTimelineProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `events` | `TimelineEvent[]` | **required** | Array of timeline events to display |
| `onEventSelect` | `(eventId: string) => void` | `undefined` | Callback when an event is selected |
| `maxEvents` | `number` | `1000` | Maximum number of events to display |
| `autoRefresh` | `boolean` | `true` | Enable auto-refresh timer |
| `refreshInterval` | `number` | `5000` | Auto-refresh interval in milliseconds |
| `showFilters` | `boolean` | `true` | Show filter controls |
| `enableSearch` | `boolean` | `true` | Enable search functionality |
| `enableVirtualScrolling` | `boolean` | `true` | Enable virtual scrolling for performance |
| `enableExport` | `boolean` | `true` | Enable JSON/CSV export buttons |
| `virtualScrollHeight` | `number` | `600` | Height of virtual scroll container (px) |
| `itemHeight` | `number` | `120` | Height of each event item (px) |
| `filter` | `EventFilter` | `undefined` | Initial filter configuration |
| `className` | `string` | `undefined` | Custom CSS class |
| `style` | `React.CSSProperties` | `undefined` | Custom inline styles |

### TimelineEvent

```typescript
interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: string;
  category: EventCategory; // 'agent' | 'system' | 'error' | 'warning' | 'success' | 'info'
  title: string;
  description?: string;
  agentId?: string;
  severity?: EventSeverity; // 'info' | 'warning' | 'error' | 'success'
  metadata?: Record<string, any>;
}
```

### EventFilter

```typescript
interface EventFilter {
  categories?: EventCategory[];
  severities?: EventSeverity[];
  agentIds?: string[];
  searchQuery?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
}
```

## Performance

- **Virtual Scrolling**: Handles 1000+ events efficiently using react-window
- **Optimized Filtering**: useMemo for filtered event calculations
- **Event Statistics**: Memoized statistics calculations
- **Auto-refresh**: Configurable refresh interval with cleanup

## Accessibility

- Keyboard navigation support
- ARIA labels for all interactive elements
- Semantic HTML structure
- Screen reader friendly

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Examples

See the test file (`EventTimeline.test.tsx`) for comprehensive usage examples.

## Migration from Dashboard/Frontend

This component consolidates the EventTimeline implementations from:
- `src/web/dashboard/components/EventTimeline.tsx` (with filters)
- `src/web/frontend/components/EventTimeline.tsx` (with search)

**Breaking Changes:**
- Event type changed from `AgentLifecycleEvent` to `TimelineEvent`
- Added `category` field (required)
- Renamed `eventType` to `type`
- Changed icon imports from lucide-react to @mui/icons-material

## License

MIT
