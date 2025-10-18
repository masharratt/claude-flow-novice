# Agent Lifecycle Transparency Dashboard

A comprehensive React-based web dashboard for real-time monitoring and visualization of agent lifecycle transparency. Built with TypeScript, React, and Tailwind CSS.

## Features

### 🌳 Real-time Agent Hierarchy Visualization
- Interactive tree components showing agent relationships
- Multi-level hierarchy display with parent-child relationships
- Expandable/collapsible nodes with performance metrics
- Real-time updates as agents are spawned/terminated

### 📊 Agent Status Monitoring
- Live agent status cards with detailed information
- Progress tracking and resource usage monitoring
- Error tracking with severity levels
- Configurable refresh intervals and filters

### 📈 Performance Metrics Dashboard
- Real-time charts and graphs for performance data
- Token usage tracking and optimization insights
- Execution time analytics and trend analysis
- Historical data visualization

### ⏰ Event Streaming Timeline
- Real-time event stream with filtering capabilities
- Categorized events (spawned, paused, terminated, etc.)
- Searchable timeline with severity indicators
- Export functionality for audit trails

### 🎯 Resource Usage Gauges
- Visual gauges for memory, CPU, network, and disk usage
- Threshold-based alerting with color-coded indicators
- Trend analysis and efficiency metrics
- Real-time monitoring with customizable thresholds

### 🔌 WebSocket Integration
- Real-time updates via WebSocket connections
- Automatic reconnection with exponential backoff
- Subscription-based event handling
- Connection status monitoring

## Architecture

### Component Structure
```
src/web/dashboard/
├── components/
│   ├── AgentHierarchyTree.tsx    # Interactive hierarchy visualization
│   ├── AgentStatusMonitor.tsx    # Status monitoring dashboard
│   ├── PerformanceMetricsChart.tsx # Performance charts and graphs
│   ├── EventTimeline.tsx         # Event streaming timeline
│   └── ResourceGauges.tsx        # Resource usage gauges
├── hooks/
│   └── useWebSocket.ts           # WebSocket integration hook
├── types.ts                      # TypeScript type definitions
├── Dashboard.tsx                 # Main dashboard component
├── index.ts                      # Module exports
└── README.md                     # This file
```

### Key Technologies
- **React 18+**: Modern React with hooks and concurrent features
- **TypeScript**: Full type safety and IntelliSense support
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **Socket.IO**: Real-time WebSocket communication
- **HTML5 Canvas**: Custom chart rendering without external dependencies

## Installation

### Prerequisites
- Node.js 16+
- React 18+
- TypeScript 4.5+

### Install Dependencies
```bash
npm install react react-dom typescript
npm install socket.io-client lucide-react
npm install -D tailwindcss postcss autoprefixer
```

### Setup Tailwind CSS
```bash
npx tailwindcss init -p
```

## Usage

### Basic Dashboard
```tsx
import React from 'react';
import { Dashboard } from './src/web/dashboard';

function App() {
  return (
    <div className="App">
      <Dashboard
        apiUrl="/api"
        wsUrl="ws://localhost:3000"
        config={{
          refreshInterval: 5000,
          autoRefresh: true,
          maxEvents: 1000
        }}
      />
    </div>
  );
}
```

### Individual Components
```tsx
import { AgentHierarchyTree, AgentStatusMonitor } from './src/web/dashboard';

function CustomDashboard() {
  return (
    <div className="grid grid-cols-2 gap-6">
      <AgentHierarchyTree
        agents={agentData}
        onAgentSelect={(agentId) => console.log('Selected:', agentId)}
      />
      <AgentStatusMonitor
        statuses={statusData}
        onAgentSelect={(agentId) => console.log('Selected:', agentId)}
      />
    </div>
  );
}
```

### WebSocket Integration
```tsx
import { useDashboardWebSocket } from './src/web/dashboard';

function RealtimeComponent() {
  const { dashboardState, isConnected, refreshData } = useDashboardWebSocket(
    initialData,
    {
      url: 'ws://localhost:3000',
      autoConnect: true,
      reconnectAttempts: 5
    }
  );

  return (
    <div>
      <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
      <button onClick={refreshData}>Refresh</button>
      {/* Render dashboard components with state */}
    </div>
  );
}
```

## Configuration

### Dashboard Configuration
```typescript
interface DashboardConfig {
  refreshInterval: number;      // Auto-refresh interval in milliseconds
  maxEvents: number;           // Maximum events to keep in memory
  enableAnimations: boolean;   // Enable/disable animations
  theme: 'light' | 'dark';     // Theme mode
  autoRefresh: boolean;        // Enable auto-refresh
}
```

### Resource Thresholds
```typescript
interface ResourceThresholds {
  memory: {
    warning: number;  // Warning threshold (percentage)
    critical: number; // Critical threshold (percentage)
  };
  cpu: {
    warning: number;
    critical: number;
  };
  network: {
    warning: number;  // Warning threshold (milliseconds)
    critical: number; // Critical threshold (milliseconds)
  };
}
```

## API Integration

The dashboard integrates with the transparency system APIs:

### WebSocket Events
- `agent_update`: Agent status changes
- `hierarchy_change`: Hierarchy structure updates
- `metrics_update`: Performance metrics updates
- `event_stream`: Real-time event streaming
- `error`: Error notifications

### REST API Endpoints
- `GET /api/hierarchy`: Get agent hierarchy
- `GET /api/status`: Get agent statuses
- `GET /api/metrics`: Get performance metrics
- `GET /api/events`: Get recent events
- `GET /api/resources`: Get resource usage

## Customization

### Theming
```css
/* Custom theme variables */
:root {
  --dashboard-primary: #3B82F6;
  --dashboard-success: #10B981;
  --dashboard-warning: #F59E0B;
  --dashboard-error: #EF4444;
  --dashboard-background: #F9FAFB;
}
```

### Component Styling
```tsx
// Custom styled component
import { AgentStatusMonitor } from './src/web/dashboard';

function CustomStatusMonitor() {
  return (
    <AgentStatusMonitor
      statuses={statuses}
      className="custom-status-monitor"
      maxCardsPerRow={4}
      showErrorsOnly={false}
    />
  );
}
```

## Performance Considerations

### Optimization Tips
1. **Event Buffering**: Limit the number of events stored in memory
2. **Update Throttling**: Throttle rapid updates to prevent re-renders
3. **Virtual Scrolling**: Use virtual scrolling for large lists
4. **Memoization**: Use React.memo for expensive components
5. **WebSocket Optimization**: Batch multiple updates into single messages

### Memory Management
```typescript
// Configure event retention
const config = {
  maxEvents: 1000,  // Limit events in memory
  refreshInterval: 5000,  // Reasonable refresh rate
  enableAnimations: true  // Disable for low-end devices
};
```

## Troubleshooting

### Common Issues

**WebSocket Connection Failed**
```bash
# Check server is running
npm run dev

# Verify WebSocket URL
console.log('WebSocket URL:', wsUrl);

# Check network connectivity
curl -I http://localhost:3000/api/health
```

**Performance Issues**
```typescript
// Disable animations for performance
const config = {
  enableAnimations: false,
  refreshInterval: 10000  // Slower updates
};
```

**Memory Leaks**
```typescript
// Clean up subscriptions on unmount
useEffect(() => {
  const unsubscribe = subscribe('event', handler);
  return () => unsubscribe();
}, []);
```

## Development

### Component Development
```bash
# Start development server
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests
npm test
```

### Adding New Components
1. Create component in `components/` directory
2. Add TypeScript interfaces in `types.ts`
3. Export from `index.ts`
4. Add tests in `__tests__/` directory

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with tests
4. Ensure TypeScript compilation passes
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.