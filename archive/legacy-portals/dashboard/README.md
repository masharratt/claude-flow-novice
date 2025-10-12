# Fleet Dashboard Components

Real-time fleet monitoring dashboard components for claude-flow-novice. Provides comprehensive visualization of fleet metrics, swarm status, and system performance with WebSocket and HTTP polling fallback.

## Features

- **Real-time Updates**: 1-second refresh interval for metrics
- **WebSocket + HTTP Polling**: Automatic fallback for reliability
- **React Components**: Reusable, embeddable dashboard widgets
- **TypeScript**: Full type safety
- **Responsive Design**: Mobile and desktop support
- **Security**: CSP headers, authentication support, rate limiting
- **Standalone Server**: Built-in Express server for quick deployment

## Installation

```bash
npm install claude-flow-novice
```

## Quick Start

### Option 1: Use Pre-built Components (React)

```tsx
import { FleetDashboard } from 'claude-flow-novice/dashboard';
import 'claude-flow-novice/dashboard/dashboard.css';

function App() {
  return (
    <FleetDashboard
      config={{
        serverUrl: 'http://localhost:3001',
        refreshInterval: 1000
      }}
      layout="grid"
      autoConnect={true}
    />
  );
}
```

### Option 2: Use Individual Components

```tsx
import {
  FleetOverview,
  SwarmVisualization,
  PerformanceChart,
  AlertsPanel,
  useFleetDashboard
} from 'claude-flow-novice/dashboard';

function CustomDashboard() {
  const { client, connectionStatus, latestMetrics } = useFleetDashboard({
    serverUrl: 'http://localhost:3001'
  });

  return (
    <div>
      <FleetOverview client={client} detailed />
      <PerformanceChart client={client} height={300} metrics={['cpu', 'memory']} />
      <SwarmVisualization client={client} maxSwarms={10} />
      <AlertsPanel client={client} filterSeverity="all" />
    </div>
  );
}
```

### Option 3: Standalone Dashboard Server

```bash
# Start dashboard server
npx claude-flow-novice dashboard --port 3001

# Or programmatically
```

```typescript
import { DashboardServer } from 'claude-flow-novice/dashboard';

const server = new DashboardServer({
  port: 3001,
  metricsInterval: 1000,
  enableAuth: false
});

await server.start();
```

### Option 4: Client-Only Integration

```typescript
import { FleetDashboardClient } from 'claude-flow-novice/dashboard';

const client = new FleetDashboardClient({
  serverUrl: 'http://localhost:3001',
  refreshInterval: 1000,
  debug: true
});

// Connect to server
await client.connect();

// Listen for metrics
client.on('metrics', (data) => {
  console.log('Fleet metrics:', data);
});

// Listen for alerts
client.on('alert', (alert) => {
  console.log('Alert:', alert);
});

// Get latest metrics
const metrics = client.getLatestMetrics();

// Get metrics history
const history = client.getMetricsHistory(60); // Last 60 data points
```

## Components

### FleetDashboard

Complete dashboard with all features.

```tsx
<FleetDashboard
  config={{
    serverUrl: 'http://localhost:3001',
    refreshInterval: 1000,
    authToken: 'your-token'
  }}
  layout="grid" // 'grid' | 'vertical' | 'horizontal'
  autoConnect={true}
  showChart={true}
  showAlerts={true}
/>
```

### FleetOverview

System-level metrics and fleet summary.

```tsx
<FleetOverview
  client={client}
  detailed={true}
  className="custom-class"
/>
```

### SwarmVisualization

Individual swarm status and metrics.

```tsx
<SwarmVisualization
  client={client}
  maxSwarms={10}
  activeOnly={false}
  className="custom-class"
/>
```

### PerformanceChart

Real-time performance visualization.

```tsx
<PerformanceChart
  client={client}
  height={300}
  timeWindow={60} // seconds
  metrics={['cpu', 'memory', 'network']}
/>
```

### AlertsPanel

System alerts and notifications.

```tsx
<AlertsPanel
  client={client}
  maxAlerts={10}
  filterSeverity="all" // 'all' | 'info' | 'warning' | 'critical'
/>
```

## Client API

### FleetDashboardClient

```typescript
// Create client
const client = new FleetDashboardClient(config);

// Connect
await client.connect();

// Disconnect
client.disconnect();

// Get status
const status = client.getConnectionStatus();

// Get latest metrics
const metrics = client.getLatestMetrics();

// Get history
const history = client.getMetricsHistory(count);

// Force refresh
await client.refresh();

// Update config
client.updateConfig({ refreshInterval: 2000 });

// Events
client.on('connected', (data) => {});
client.on('disconnected', (data) => {});
client.on('metrics', (data) => {});
client.on('alert', (alert) => {});
client.on('statusChange', (status) => {});
client.on('error', (error) => {});
```

## Server API

### DashboardServer

```typescript
const server = new DashboardServer({
  port: 3001,
  cors: true,
  corsOrigin: '*',
  metricsInterval: 1000,
  enableAuth: false,
  authTokens: ['token1', 'token2'],
  securityHeaders: true,
  staticDir: './public'
});

await server.start();
await server.stop();

// Get instances
const metricsCollector = server.getMetricsCollector();
const alertManager = server.getAlertManager();
```

## HTTP API Endpoints

### GET /health

Health check endpoint.

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 1234,
  "timestamp": "2025-10-09T...",
  "connectedClients": 5
}
```

### GET /api/metrics

Get latest metrics.

```bash
curl http://localhost:3001/api/metrics
```

Response:
```json
{
  "timestamp": "2025-10-09T...",
  "system": {
    "cpu": { "usage": 45.2, "cores": 24 },
    "memory": { "total": 62, "used": 32.5, "percent": 52.4 }
  },
  "swarms": {
    "swarm-1": {
      "name": "Test Swarm",
      "status": "active",
      "agents": 5,
      "tasks": 10,
      "progress": 0.75
    }
  }
}
```

### GET /api/swarms

Get swarm metrics only.

### GET /api/alerts

Get active alerts.

### POST /api/alerts/:id/acknowledge

Acknowledge an alert.

## WebSocket Events

### Server → Client

- `metrics`: Real-time metrics update
- `alert`: New alert notification
- `recommendation`: System recommendation

### Client → Server

- `refresh`: Request immediate metrics update
- `subscribe`: Subscribe to specific channels

## Configuration

### Dashboard Config

```typescript
interface DashboardConfig {
  serverUrl?: string;           // Default: window.location.origin
  refreshInterval?: number;     // Default: 1000ms
  timeout?: number;             // Default: 5000ms
  maxRetries?: number;          // Default: 3
  authToken?: string;           // Optional
  autoReconnect?: boolean;      // Default: true
  debug?: boolean;              // Default: false
}
```

### Server Config

```typescript
interface DashboardServerConfig {
  port?: number;                // Default: 3001
  cors?: boolean;               // Default: true
  corsOrigin?: string;          // Default: '*'
  metricsInterval?: number;     // Default: 1000ms
  enableAuth?: boolean;         // Default: false
  authTokens?: string[];        // Required if enableAuth=true
  securityHeaders?: boolean;    // Default: true
  staticDir?: string;           // Optional
}
```

## Styling

The dashboard uses CSS custom properties for theming:

```css
:root {
  --dashboard-bg: #0a0e1a;
  --dashboard-card-bg: #141824;
  --dashboard-text: #ffffff;
  --dashboard-text-secondary: #aaaaaa;
  --dashboard-success: #00ff88;
  --dashboard-warning: #ffaa00;
  --dashboard-critical: #ff3b30;
  --dashboard-info: #00d4ff;
}
```

Override these variables to customize the theme.

## Security

### Content Security Policy

The server includes strict CSP headers:

- `script-src`: Self + Chart.js CDN
- `connect-src`: Self + WebSocket
- `frame-src`: None
- `object-src`: None

### Authentication

Enable authentication by providing tokens:

```typescript
const server = new DashboardServer({
  enableAuth: true,
  authTokens: ['secret-token-1', 'secret-token-2']
});
```

Client usage:

```typescript
const client = new FleetDashboardClient({
  authToken: 'secret-token-1'
});
```

## Performance

- **Metrics Collection**: 1-second interval
- **WebSocket Updates**: Real-time push
- **HTTP Polling**: Automatic fallback with exponential backoff
- **Memory**: Keeps last 300 data points (5 minutes)
- **Chart Performance**: Optimized with `update('none')` for smooth real-time rendering

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Dependencies

- `socket.io-client`: WebSocket client
- `chart.js`: Performance charts (lazy loaded)
- `react`: UI components

Server dependencies:
- `express`: HTTP server
- `socket.io`: WebSocket server

## Examples

See `/examples` directory for:
- Basic React integration
- Next.js integration
- Standalone server deployment
- Custom theming
- Authentication setup

## License

MIT

## Support

Issues: https://github.com/your-org/claude-flow-novice/issues
Docs: https://docs.claude-flow-novice.dev
