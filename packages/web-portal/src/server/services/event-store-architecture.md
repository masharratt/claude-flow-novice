# Event Store Service Architecture

## Overview

The Event Store Service is a high-performance, scalable event storage solution designed for the Claude Flow system. It provides a centralized repository for storing, querying, and managing events with automatic TTL enforcement and flexible filtering capabilities.

## System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Store Service                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Controller    │  │  Integration    │  │  Validation  │ │
│  │   Layer         │  │    Layer        │  │   Middleware │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                      Core Service                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  EventStoreService (Singleton)                          │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │ │
│  │  │   Storage   │  │   Query     │  │    Management   │ │ │
│  │  │   Engine    │  │   Engine    │  │     Layer       │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Database Layer                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              SQLite Database                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │ │
│  │  │     WAL     │  │   Indexes   │  │     TTL         │ │ │
│  │  │     Mode    │  │  (B-Tree)   │  │   Management    │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   API       │    │   Service   │    │  Database   │
│ (Agent/UI)  │───▶│  Layer      │───▶│   Layer     │───▶│   Layer     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       │                   │                   │                   │
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Validation  │    │  Business   │    │   Storage   │    │ Persistence │
│ & Security  │    │   Logic     │    │   Engine    │    │    Layer     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## Database Schema Design

### Event Table Structure

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,                    -- UUID-based event identifier
  timestamp INTEGER NOT NULL,             -- Unix timestamp (milliseconds)
  phase_id TEXT NOT NULL,                 -- CFN phase identifier
  agent_id TEXT NOT NULL,                 -- Agent identifier
  event_type TEXT NOT NULL,               -- Event type/category
  payload TEXT NOT NULL,                  -- JSON payload (stringified)
  metadata TEXT,                          -- Optional metadata (JSON)
  created_at INTEGER DEFAULT (strftime('%s', 'now')) -- Creation timestamp
);
```

### Indexing Strategy

```sql
-- Primary index for timestamp-based queries
CREATE INDEX idx_events_timestamp ON events(timestamp);

-- Foreign key indexes for filtering
CREATE INDEX idx_events_phase_id ON events(phase_id);
CREATE INDEX idx_events_agent_id ON events(agent_id);
CREATE INDEX idx_events_event_type ON events(event_type);

-- Composite indexes for common query patterns
CREATE INDEX idx_events_phase_agent ON events(phase_id, agent_id);
CREATE INDEX idx_events_composite ON events(timestamp, phase_id, agent_id, event_type);
```

## Performance Optimizations

### Database Configuration

```sql
-- Write-Ahead Logging for concurrent access
PRAGMA journal_mode = WAL;

-- Balanced durability and performance
PRAGMA synchronous = NORMAL;

-- In-memory caching
PRAGMA cache_size = 10000;

-- Temporary tables in memory
PRAGMA temp_store = MEMORY;

-- Memory-mapped I/O for large files
PRAGMA mmap_size = 268435456; -- 256MB
```

### Query Optimization

1. **Index Utilization**: All common query patterns are indexed
2. **Prepared Statements**: Parameterized queries prevent SQL injection
3. **Connection Management**: Singleton pattern with connection pooling
4. **Batch Operations**: Transaction-based bulk operations
5. **Pagination**: Efficient LIMIT/OFFSET with cursor-based alternatives

## TTL Management Strategy

### Automatic Cleanup

```typescript
// TTL Configuration
const TTL_DAYS = 7;
const CLEANUP_INTERVAL_HOURS = 1;

// Cleanup Query
DELETE FROM events WHERE timestamp < (current_timestamp - TTL_DAYS * 24 * 60 * 60 * 1000);
```

### Cleanup Process

1. **Scheduled Cleanup**: Hourly cleanup task
2. **Batch Deletion**: Delete in chunks to avoid locking
3. **Performance Monitoring**: Track cleanup duration and impact
4. **Manual Override**: Admin interface for manual cleanup

## API Architecture

### RESTful Endpoints

```
POST   /api/events              # Store single event
POST   /api/events/batch        # Store multiple events
GET    /api/events              # Query events with filters
GET    /api/events/phase/:id    # Get events by phase
GET    /api/events/agent/:id    # Get events by agent
GET    /api/events/stats        # Get statistics
DELETE /api/events/:id          # Delete event
```

### Request/Response Patterns

```typescript
// Event Storage Request
interface EventStoreRequest {
  timestamp?: Date;
  phaseId: string;
  agentId: string;
  eventType: string;
  payload: any;
  metadata?: Record<string, any>;
}

// Event Query Response
interface EventQueryResponse {
  success: boolean;
  data: EventData[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

## Integration Architecture

### CFN Loop Integration

```typescript
// CFN Event Adapter
class CFNLoopEventAdapter {
  async storeCFNLoopEvent(params: {
    phaseId: string;
    agentId: string;
    loopNumber: number;
    loopType: 'implementation' | 'validation' | 'coordination';
    eventType: string;
    payload: any;
    confidence?: number;
    duration?: number;
  }): Promise<string>;
  
  async getCFNLoopStatus(phaseId: string): Promise<CFNLoopStatus>;
}
```

### WebSocket Integration

```typescript
// Real-time Event Streaming
class EventStoreWebSocketAdapter {
  subscribeToPhaseEvents(phaseId: string, callback: Function): Function;
  subscribeToAgentEvents(agentId: string, callback: Function): Function;
  storeAndNotify(event: EventData): Promise<string>;
}
```

## Security Architecture

### Input Validation

1. **Schema Validation**: Joi-based request validation
2. **Payload Size Limits**: Prevent storage abuse
3. **SQL Injection Prevention**: Parameterized queries
4. **Rate Limiting**: API endpoint protection
5. **Authentication**: API key-based access control

### Data Protection

```typescript
// Security Measures
- Input sanitization and validation
- Payload size limits (1MB single, 512KB batch)
- SQL injection prevention
- Rate limiting (1000 requests/15min)
- API key authentication
- Request/response logging
```

## Scalability Architecture

### Horizontal Scaling

1. **Database Sharding**: Partition by phaseId for large deployments
2. **Read Replicas**: Separate read/write database instances
3. **Connection Pooling**: Efficient database connection management
4. **Caching Layer**: Redis for frequently accessed data

### Performance Monitoring

```typescript
// Metrics Collection
interface EventStoreMetrics {
  storageLatency: number;
  queryLatency: number;
  throughput: number;
  errorRate: number;
  databaseSize: number;
  indexEfficiency: number;
  ttlCleanupDuration: number;
}
```

## Error Handling Architecture

### Error Categories

1. **Validation Errors**: Invalid input data
2. **Database Errors**: Connection issues, constraints
3. **Performance Errors**: Timeouts, resource limits
4. **Business Logic Errors**: Invalid operations

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;
  message: string;
  details?: ValidationError[];
  timestamp: string;
  requestId: string;
}
```

## Testing Architecture

### Test Categories

1. **Unit Tests**: Individual method testing
2. **Integration Tests**: API endpoint testing
3. **Performance Tests**: Load and stress testing
4. **Database Tests**: Schema and query validation

### Test Coverage

```typescript
// Test Coverage Areas
- Event storage and retrieval
- Query filtering and pagination
- TTL cleanup functionality
- Error handling scenarios
- Performance benchmarks
- Security validation
- Integration with other services
```

## Monitoring and Observability

### Health Checks

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: DatabaseHealth;
  performance: PerformanceMetrics;
  storage: StorageMetrics;
  lastCleanup: Date;
}
```

### Logging Strategy

1. **Structured Logging**: JSON format for consistency
2. **Log Levels**: Debug, Info, Warn, Error
3. **Correlation IDs**: Request tracking
4. **Performance Logging**: Query timing and throughput
5. **Error Logging**: Detailed error context

## Deployment Architecture

### Environment Configuration

```typescript
// Configuration Management
interface EventStoreConfig {
  database: {
    path: string;
    walMode: boolean;
    cacheSize: number;
    mmapSize: number;
  };
  ttl: {
    days: number;
    cleanupIntervalHours: number;
  };
  performance: {
    maxBatchSize: number;
    maxPayloadSize: number;
    connectionTimeout: number;
  };
  security: {
    enableAuth: boolean;
    rateLimiting: RateLimitConfig;
  };
}
```

### Container Deployment

```dockerfile
# Docker Configuration
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

## Future Enhancements

### Planned Features

1. **Event Sourcing**: Immutable event log support
2. **Snapshot Support**: Periodic state snapshots
3. **Event Replay**: Event replay functionality
4. **Multi-tenancy**: Tenant isolation support
5. **Analytics**: Advanced event analytics
6. **Streaming**: Real-time event streaming

### Scalability Improvements

1. **Distributed Storage**: Multi-node database clustering
2. **Event Partitioning**: Advanced partitioning strategies
3. **Caching**: Multi-level caching architecture
4. **Load Balancing**: Request distribution
5. **Auto-scaling**: Dynamic resource allocation

## Best Practices

### Development Guidelines

1. **Event Design**: Keep events focused and immutable
2. **Schema Evolution**: Version event schemas carefully
3. **Testing**: Comprehensive test coverage
4. **Documentation**: Clear API documentation
5. **Monitoring**: Proactive performance monitoring

### Operational Guidelines

1. **Backup Strategy**: Regular database backups
2. **Monitoring**: Alert on performance degradation
3. **Maintenance**: Regular cleanup and optimization
4. **Security**: Regular security audits
5. **Capacity Planning**: Monitor storage growth

This architecture provides a robust, scalable foundation for event storage in the Claude Flow system, with clear separation of concerns, comprehensive error handling, and extensive monitoring capabilities.