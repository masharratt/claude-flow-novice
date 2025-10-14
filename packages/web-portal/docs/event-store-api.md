# Event Store Service API Documentation

## Overview

The Event Store Service provides a high-performance, scalable solution for storing and querying events in the Claude Flow system. It features automatic TTL management, flexible querying capabilities, and optimized performance for real-time applications.

## Features

- **7-day TTL**: Automatic cleanup of expired events
- **SQLite Storage**: High-performance database with WAL mode for concurrency
- **Flexible Querying**: Filter by phaseId, agentId, event type, and date ranges
- **Batch Operations**: Efficient bulk storage and retrieval
- **Real-time Support**: WebSocket integration for live event streaming
- **Statistics**: Comprehensive event analytics and monitoring

## Quick Start

```typescript
import { eventStoreService } from './services/event-store.js';

// Initialize the service
await eventStoreService.initialize();

// Store an event
const eventId = await eventStoreService.storeEvent({
  timestamp: new Date(),
  phaseId: 'cfn-phase-1',
  agentId: 'architect-agent-1',
  eventType: 'task_completed',
  payload: {
    taskId: 'task-123',
    confidence: 0.85,
    output: 'Architecture design completed'
  }
});

// Query events
const events = await eventStoreService.queryEvents({
  phaseId: 'cfn-phase-1',
  limit: 10
});
```

## API Reference

### EventData Interface

```typescript
interface EventData {
  id?: string;                    // Auto-generated unique identifier
  timestamp: Date;               // Event timestamp
  phaseId: string;               // CFN phase identifier
  agentId: string;               // Agent identifier
  eventType: string;             // Event type/category
  payload: any;                  // Event payload data
  metadata?: Record<string, any>; // Optional metadata
}
```

### EventQueryFilters Interface

```typescript
interface EventQueryFilters {
  phaseId?: string;              // Filter by phase ID
  agentId?: string;              // Filter by agent ID
  eventType?: string;            // Filter by event type
  startDate?: Date;              // Filter by start date
  endDate?: Date;                // Filter by end date
  limit?: number;                // Maximum results (default: 100)
  offset?: number;               // Pagination offset (default: 0)
}
```

### EventQueryResult Interface

```typescript
interface EventQueryResult {
  events: EventData[];           // Event results
  total: number;                 // Total matching events
  hasMore: boolean;              // Whether more results are available
}
```

## Core Methods

### storeEvent(event)

Stores a single event in the database.

**Parameters:**
- `event: Omit<EventData, 'id'>` - Event data without ID

**Returns:** `Promise<string>` - Generated event ID

**Example:**
```typescript
const eventId = await eventStoreService.storeEvent({
  timestamp: new Date(),
  phaseId: 'cfn-phase-1',
  agentId: 'architect-agent-1',
  eventType: 'architecture_decision',
  payload: {
    decision: 'use_microservices',
    rationale: 'scalability_requirements',
    confidence: 0.9
  }
});
```

### storeEvents(events)

Stores multiple events in a single transaction.

**Parameters:**
- `events: Omit<EventData, 'id'>[]` - Array of event data

**Returns:** `Promise<string[]>` - Array of generated event IDs

**Example:**
```typescript
const eventIds = await eventStoreService.storeEvents([
  {
    timestamp: new Date(),
    phaseId: 'cfn-phase-1',
    agentId: 'coder-agent-1',
    eventType: 'file_created',
    payload: { filePath: '/src/components/Button.tsx' }
  },
  {
    timestamp: new Date(),
    phaseId: 'cfn-phase-1',
    agentId: 'tester-agent-1',
    eventType: 'test_executed',
    payload: { testFile: '/tests/Button.test.tsx', result: 'passed' }
  }
]);
```

### queryEvents(filters)

Queries events with optional filters and pagination.

**Parameters:**
- `filters: EventQueryFilters` - Query filters and pagination options

**Returns:** `Promise<EventQueryResult>` - Query results with pagination

**Example:**
```typescript
const result = await eventStoreService.queryEvents({
  phaseId: 'cfn-phase-1',
  agentId: 'architect-agent-1',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  limit: 50,
  offset: 0
});

console.log(`Found ${result.total} events, showing ${result.events.length}`);
```

### getEventsByPhaseId(phaseId, limit?)

Convenience method to get events by phase ID.

**Parameters:**
- `phaseId: string` - Phase identifier
- `limit?: number` - Maximum results (default: 100)

**Returns:** `Promise<EventData[]>` - Array of events

### getEventsByAgentId(agentId, limit?)

Convenience method to get events by agent ID.

**Parameters:**
- `agentId: string` - Agent identifier
- `limit?: number` - Maximum results (default: 100)

**Returns:** `Promise<EventData[]>` - Array of events

### getEventsByType(eventType, limit?)

Convenience method to get events by type.

**Parameters:**
- `eventType: string` - Event type
- `limit?: number` - Maximum results (default: 100)

**Returns:** `Promise<EventData[]>` - Array of events

### getEventsByDateRange(startDate, endDate, limit?)

Convenience method to get events within date range.

**Parameters:**
- `startDate: Date` - Start date (inclusive)
- `endDate: Date` - End date (inclusive)
- `limit?: number` - Maximum results (default: 100)

**Returns:** `Promise<EventData[]>` - Array of events

### getRecentEvents(limit?)

Gets the most recent events.

**Parameters:**
- `limit?: number` - Maximum results (default: 50)

**Returns:** `Promise<EventData[]>` - Array of recent events

### getStatistics()

Returns comprehensive statistics about the event store.

**Returns:** `Promise<Statistics>` - Event store statistics

**Example:**
```typescript
const stats = await eventStoreService.getStatistics();
console.log({
  totalEvents: stats.totalEvents,
  uniquePhases: stats.uniquePhases,
  uniqueAgents: stats.uniqueAgents,
  oldestEvent: stats.oldestEvent,
  newestEvent: stats.newestEvent
});
```

### deleteEvent(eventId)

Deletes a specific event by ID.

**Parameters:**
- `eventId: string` - Event identifier

**Returns:** `Promise<boolean>` - Whether the event was deleted

## REST API Endpoints

### Store Single Event

```
POST /api/events
Content-Type: application/json

{
  "timestamp": "2024-01-01T12:00:00Z",
  "phaseId": "cfn-phase-1",
  "agentId": "architect-agent-1",
  "eventType": "task_completed",
  "payload": {
    "taskId": "task-123",
    "confidence": 0.85
  },
  "metadata": {
    "source": "web-portal"
  }
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "evt_1704110400000_abc123def",
  "message": "Event stored successfully"
}
```

### Store Multiple Events

```
POST /api/events/batch
Content-Type: application/json

{
  "events": [
    {
      "phaseId": "cfn-phase-1",
      "agentId": "coder-agent-1",
      "eventType": "file_modified",
      "payload": {"filePath": "/src/app.ts"}
    },
    {
      "phaseId": "cfn-phase-1",
      "agentId": "tester-agent-1",
      "eventType": "test_executed",
      "payload": {"testFile": "/tests/app.test.ts"}
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "eventIds": ["evt_1704110400001_abc456def", "evt_1704110400002_abc789def"],
  "count": 2,
  "message": "2 events stored successfully"
}
```

### Query Events

```
GET /api/events?phaseId=cfn-phase-1&agentId=architect-agent-1&limit=10&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "evt_1704110400000_abc123def",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "phaseId": "cfn-phase-1",
      "agentId": "architect-agent-1",
      "eventType": "task_completed",
      "payload": {"taskId": "task-123"},
      "metadata": {"source": "web-portal"}
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 10,
    "offset": 0,
    "hasMore": false
  }
}
```

### Get Statistics

```
GET /api/events/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEvents": 1250,
    "uniquePhases": 15,
    "uniqueAgents": 8,
    "uniqueEventTypes": 25,
    "oldestEvent": "2024-01-01T10:00:00.000Z",
    "newestEvent": "2024-01-01T15:30:00.000Z"
  }
}
```

## CFN Loop Integration

### Storing CFN Loop Events

```typescript
import { cfnLoopAdapter } from './services/event-store.integration.js';

await cfnLoopAdapter.storeCFNLoopEvent({
  phaseId: 'cfn-phase-2',
  agentId: 'architect-agent-2',
  loopNumber: 3,
  loopType: 'implementation',
  eventType: 'architecture_decision',
  payload: {
    decision: 'use_microservices_pattern',
    rationale: 'scalability_requirements'
  },
  confidence: 0.9,
  duration: 45000
});
```

### Getting CFN Loop Status

```typescript
const status = await cfnLoopAdapter.getCFNLoopStatus('cfn-phase-2');
console.log({
  totalEvents: status.totalEvents,
  implementationEvents: status.implementationEvents,
  validationEvents: status.validationEvents,
  coordinationEvents: status.coordinationEvents,
  lastEvent: status.lastEvent
});
```

## Performance Considerations

### Database Optimization

The Event Store uses SQLite with the following optimizations:

- **WAL Mode**: Enables concurrent reads and writes
- **Indexing**: Optimized indexes for common query patterns
- **Connection Pooling**: Efficient database connection management
- **Memory Mapping**: 256MB memory-mapped I/O for performance

### Query Performance

- Use specific filters rather than retrieving all events
- Implement pagination for large result sets
- Consider date range filtering for historical queries
- Use indexed fields (phaseId, agentId, eventType) in WHERE clauses

### TTL Management

- Events are automatically deleted after 7 days
- Cleanup runs every hour
- Manual cleanup can be triggered with `cleanupExpiredEvents()`

## Error Handling

The service includes comprehensive error handling:

```typescript
try {
  const eventId = await eventStoreService.storeEvent(eventData);
  console.log('Event stored:', eventId);
} catch (error) {
  console.error('Failed to store event:', error.message);
  // Handle error appropriately
}
```

Common error scenarios:
- Invalid event data (missing required fields)
- Database connection issues
- Malformed JSON in payload
- Query parameter validation errors

## Testing

The service includes comprehensive tests:

```bash
# Run event store tests
npm run test:services

# Run specific test file
npm run test event-store.test.ts

# Run with coverage
npm run test:coverage
```

## Security Considerations

- Input validation for all API endpoints
- SQL injection prevention through parameterized queries
- Payload size limits to prevent storage abuse
- Access control through existing authentication middleware

## Monitoring and Observability

### Statistics

Use the `getStatistics()` method to monitor:
- Total event count
- Storage usage trends
- Agent and phase activity
- Event type distribution

### Performance Metrics

Monitor:
- Query response times
- Batch operation throughput
- Database size growth
- TTL cleanup effectiveness

### Health Checks

The service provides health status through:
- Database connectivity checks
- Performance threshold monitoring
- Error rate tracking
- Resource utilization metrics

## Migration and Backup

### Database Schema

The events table schema:

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  phase_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### Backup Strategy

- Regular database file backups
- Export critical events before TTL expiration
- Archive historical data for compliance
- Monitor storage usage and cleanup effectiveness

## Best Practices

1. **Event Design**: Keep payloads focused and relevant
2. **Query Optimization**: Use specific filters and pagination
3. **Error Handling**: Implement comprehensive error handling
4. **Monitoring**: Track performance and storage metrics
5. **Testing**: Include performance tests for large datasets
6. **Security**: Validate all inputs and implement access controls
7. **Documentation**: Document custom event types and schemas