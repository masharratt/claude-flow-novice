# Swarm Visualization System

A comprehensive real-time visualization system for AI swarm coordination with interactive UI components, WebSocket integration, and Redis-based coordination.

## Overview

The Swarm Visualization System provides real-time monitoring and interaction capabilities for AI agent swarms. It features:

- **Real-time Dashboard**: Live swarm status with agent and task monitoring
- **Network Topology**: Interactive visualization of agent relationships and task assignments
- **Performance Metrics**: Detailed analytics and historical data tracking
- **WebSocket Integration**: Live updates with 1-second refresh intervals
- **Redis Coordination**: Scalable pub/sub messaging for distributed systems

## Components

### Core Components

#### `SwarmVisualizationDashboard`
Main dashboard component providing an overview of swarm status, agents, tasks, and key metrics.

**Features:**
- Real-time agent status monitoring
- Task progress tracking
- Interactive agent and task details
- Performance metrics display
- Connection status indicator

**Props:**
```typescript
interface SwarmVisualizationDashboardProps {
  swarmId?: string;
  className?: string;
}
```

#### `SwarmNetworkTopology`
Interactive network visualization showing agent relationships and task flow.

**Features:**
- Force-directed, hierarchical, and circular layouts
- Interactive node selection and details
- Animated connection indicators
- Zoom and pan controls
- Real-time position updates

**Props:**
```typescript
interface SwarmNetworkTopologyProps {
  agents: AgentNode[];
  tasks: TaskNode[];
  onAgentClick?: (agent: AgentNode) => void;
  onTaskClick?: (task: TaskNode) => void;
  width?: number;
  height?: number;
  className?: string;
  realtime?: boolean;
}
```

#### `SwarmPerformanceMetrics`
Comprehensive performance analytics with charts and historical data.

**Features:**
- Timeline charts for metrics over time
- Resource usage monitoring
- Quality metrics tracking
- Export functionality
- Customizable time ranges

**Props:**
```typescript
interface SwarmPerformanceMetricsProps {
  metrics: PerformanceMetrics[];
  historicalData?: PerformanceMetrics[];
  timeRange?: '1m' | '5m' | '15m' | '1h' | 'all';
  refreshInterval?: number;
  className?: string;
}
```

### Hooks

#### `useSwarmRealtimeData`
Custom hook for WebSocket-based real-time data synchronization.

**Features:**
- Automatic connection management
- Reconnection logic with exponential backoff
- Message parsing and state updates
- Heartbeat monitoring

**Usage:**
```typescript
const {
  agents,
  tasks,
  metrics,
  isConnected,
  lastUpdate,
  connectionError,
  reconnect,
  sendMessage
} = useSwarmRealtimeData({
  swarmId: 'your-swarm-id',
  websocketUrl: 'ws://localhost:8080',
  enableReconnect: true
});
```

### WebSocket Server

#### `SwarmWebSocketServer`
WebSocket server handling real-time client connections and Redis coordination.

**Features:**
- Multi-swarm support
- Redis pub/sub integration
- Connection lifecycle management
- Event broadcasting
- Performance monitoring

**Usage:**
```typescript
import { getSwarmWebSocketServer } from './swarmWebSocketServer';

const server = getSwarmWebSocketServer(8080);
await server.start();
```

## Installation and Setup

### Prerequisites

- Node.js 18+
- Redis server
- TypeScript (for development)

### Dependencies

```bash
npm install ws redis lucide-react recharts
npm install -D @types/ws @types/node ts-node
```

### Starting the System

1. **Start Redis Server:**
   ```bash
   redis-server
   ```

2. **Start WebSocket Server:**
   ```bash
   npm run swarm:visualization
   # or for development with auto-reload:
   npm run swarm:visualization:dev
   ```

3. **Start Event Publisher (Optional):**
   ```bash
   ts-node src/scripts/publishSwarmEvents.ts --swarm-id your-swarm-id
   ```

4. **Start Frontend:**
   ```bash
   npm run dev
   ```

## Usage

### Basic Dashboard

```typescript
import SwarmVisualizationDashboard from '@/components/SwarmVisualizationDashboard';

function App() {
  return (
    <SwarmVisualizationDashboard
      swarmId="my-swarm"
      className="w-full h-screen"
    />
  );
}
```

### Custom Network Topology

```typescript
import SwarmNetworkTopology from '@/components/SwarmNetworkTopology';

function TopologyView() {
  const [selectedAgent, setSelectedAgent] = useState(null);

  return (
    <SwarmNetworkTopology
      agents={agents}
      tasks={tasks}
      onAgentClick={setSelectedAgent}
      width={1200}
      height={600}
      realtime={true}
    />
  );
}
```

### Performance Monitoring

```typescript
import SwarmPerformanceMetrics from '@/components/SwarmPerformanceMetrics';

function MetricsView() {
  return (
    <SwarmPerformanceMetrics
      metrics={currentMetrics}
      historicalData={historicalData}
      timeRange="5m"
      refreshInterval={1000}
    />
  );
}
```

## Redis Integration

The system uses Redis pub/sub for scalable event coordination:

### Channels

- `swarm:phase-6:visualization` - Main visualization events
- `swarm:updates` - General swarm updates
- `swarm:visualization-server` - Server status events

### Event Types

- `swarm-started` - Swarm initialization
- `agent-spawned` - New agent creation
- `agent-updated` - Agent status changes
- `task-created` - New task assignment
- `task-updated` - Task progress updates
- `consensus-reached` - Decision consensus
- `metrics-update` - Performance metrics

### Publishing Events

```typescript
import SwarmEventPublisher from './scripts/publishSwarmEvents';

const publisher = new SwarmEventPublisher('swarm-id');
await publisher.start();

// Publish custom event
await publisher.publishEvent('custom-event', {
  data: 'event payload'
});
```

## Configuration

### Environment Variables

```bash
# WebSocket Configuration
WS_PORT=8080
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8080

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
ENABLE_REDIS_COORDINATION=true

# Logging
LOG_LEVEL=info
```

### Component Configuration

```typescript
// Visualization settings
const settings: VisualizationSettings = {
  theme: 'light',
  layout: 'force',
  showLabels: true,
  showConnections: true,
  animationSpeed: 1.0,
  updateFrequency: 1000,
  maxDataPoints: 100,
  colorScheme: 'default'
};
```

## Performance Considerations

### WebSocket Optimization

- Connection pooling for multiple clients
- Message batching for high-frequency updates
- Automatic reconnection with exponential backoff
- Connection health monitoring

### Redis Optimization

- Connection pooling for pub/sub
- Event message size optimization
- Channel partitioning for large deployments
- Event TTL management

### Frontend Optimization

- Canvas-based rendering for network topology
- Virtual scrolling for large data sets
- Debounced state updates
- Memoized component rendering

## Monitoring and Debugging

### WebSocket Connection Status

```typescript
const { isConnected, connectionError, reconnect } = useSwarmRealtimeData();

// Monitor connection
useEffect(() => {
  if (!isConnected) {
    console.error('WebSocket disconnected:', connectionError);
  }
}, [isConnected, connectionError]);
```

### Redis Monitoring

```bash
# Monitor Redis activity
redis-cli monitor

# Check visualization channels
redis-cli pubsub channels swarm:*
```

### Performance Metrics

The system tracks:
- Connection latency
- Message throughput
- Memory usage
- CPU utilization
- Error rates

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check if WebSocket server is running
   - Verify port configuration
   - Check firewall settings

2. **Redis Connection Issues**
   - Ensure Redis server is running
   - Verify connection parameters
   - Check Redis memory limits

3. **Performance Issues**
   - Monitor message frequency
   - Check data payload sizes
   - Verify client-side rendering performance

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
```

## API Reference

### WebSocket Messages

#### Client → Server

```typescript
// Subscribe to swarm
{
  type: 'subscribe-to-swarm',
  swarmId: 'swarm-id'
}

// Request full sync
{
  type: 'request-full-sync',
  swarmId: 'swarm-id'
}

// Heartbeat
{
  type: 'ping',
  timestamp: '2023-10-08T19:15:00.000Z'
}
```

#### Server → Client

```typescript
// Initial data
{
  type: 'initial-data',
  swarmId: 'swarm-id',
  data: {
    agents: Agent[],
    tasks: Task[],
    metrics: SwarmMetrics
  }
}

// Agent update
{
  type: 'agent-status-change',
  agentId: 'agent-1',
  updates: {
    status: 'processing',
    confidence: 0.92
  }
}

// Task update
{
  type: 'task-status-change',
  taskId: 'task-1',
  updates: {
    progress: 75,
    status: 'in-progress'
  }
}
```

## Contributing

1. Follow the existing code style
2. Add TypeScript types for new features
3. Include performance considerations
4. Test with multiple clients
5. Update documentation

## License

MIT License - see LICENSE file for details.