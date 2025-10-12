/**
 * Test Fixtures for Events View
 * Provides mock event data for testing timeline, filters, and real-time updates
 */

import type { Event, EventSeverity, EventType } from '../../shared/stores/eventsStore';

export const mockEventTypes: EventType[] = [
  'agent.lifecycle',
  'agent.complete',
  'cfn.loop.phase.start',
  'cfn.loop.phase.complete',
  'system.error',
  'system.warning',
];

export const mockEventSeverities: EventSeverity[] = ['info', 'warning', 'error', 'critical'];

// Generate realistic timestamp spread over past 7 days
const generateTimestamp = (daysAgo: number, hoursOffset: number = 0): number => {
  const now = Date.now();
  const offset = daysAgo * 24 * 60 * 60 * 1000 + hoursOffset * 60 * 60 * 1000;
  return now - offset;
};

/**
 * Small set of events for basic tests
 */
export const mockEventsBasic: Event[] = [
  {
    id: 'event-001',
    type: 'agent.lifecycle',
    severity: 'info',
    message: 'Agent coder-001 spawned successfully',
    agentId: 'agent-001',
    timestamp: generateTimestamp(0, 1),
    metadata: { action: 'spawn', status: 'success' },
  },
  {
    id: 'event-002',
    type: 'agent.complete',
    severity: 'info',
    message: 'Agent coder-001 completed task with confidence 0.88',
    agentId: 'agent-001',
    timestamp: generateTimestamp(0, 2),
    metadata: { confidence: 0.88, tasksCompleted: 1 },
  },
  {
    id: 'event-003',
    type: 'system.error',
    severity: 'error',
    message: 'Database connection timeout after 30s',
    timestamp: generateTimestamp(0, 3),
    metadata: { errorCode: 'DB_TIMEOUT', duration: 30000 },
  },
  {
    id: 'event-004',
    type: 'cfn.loop.phase.start',
    severity: 'info',
    message: 'Starting CFN Loop Phase 3: Implementation',
    timestamp: generateTimestamp(1, 2),
    metadata: { phase: 3, loop: 'Loop 3', target: 'authentication' },
  },
  {
    id: 'event-005',
    type: 'system.warning',
    severity: 'warning',
    message: 'Redis memory usage at 85%',
    timestamp: generateTimestamp(2, 4),
    metadata: { memoryUsage: 0.85, threshold: 0.9 },
  },
];

/**
 * Large set of events for virtual scrolling and filter tests (100+ events)
 */
export const mockEventsLarge: Event[] = [
  ...mockEventsBasic,
  // Agent lifecycle events (20 events)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `event-lifecycle-${i}`,
    type: 'agent.lifecycle' as EventType,
    severity: (i % 4 === 0 ? 'warning' : 'info') as EventSeverity,
    message: `Agent ${i % 2 === 0 ? 'spawned' : 'terminated'}: agent-${String(i).padStart(3, '0')}`,
    agentId: `agent-${String(i).padStart(3, '0')}`,
    timestamp: generateTimestamp(i % 7, i % 24),
    metadata: {
      action: i % 2 === 0 ? 'spawn' : 'terminate',
      agentType: ['coder', 'tester', 'reviewer', 'security'][i % 4],
    },
  })),
  // Agent completion events (20 events)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `event-complete-${i}`,
    type: 'agent.complete' as EventType,
    severity: (i % 10 === 0 ? 'warning' : 'info') as EventSeverity,
    message: `Agent agent-${String(i).padStart(3, '0')} completed with confidence ${(0.7 + i * 0.01).toFixed(2)}`,
    agentId: `agent-${String(i).padStart(3, '0')}`,
    timestamp: generateTimestamp(i % 7, (i + 5) % 24),
    metadata: {
      confidence: 0.7 + i * 0.01,
      tasksCompleted: i + 1,
      duration: 1000 + i * 500,
    },
  })),
  // CFN Loop events (20 events)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `event-cfn-${i}`,
    type: (i % 2 === 0 ? 'cfn.loop.phase.start' : 'cfn.loop.phase.complete') as EventType,
    severity: 'info' as EventSeverity,
    message: `CFN Loop ${i % 2 === 0 ? 'started' : 'completed'} Phase ${(i % 4) + 1}`,
    timestamp: generateTimestamp(i % 7, (i + 10) % 24),
    metadata: {
      phase: (i % 4) + 1,
      loop: `Loop ${(i % 3) + 1}`,
      confidence: i % 2 === 0 ? undefined : 0.8 + i * 0.005,
    },
  })),
  // System errors (15 events)
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `event-error-${i}`,
    type: 'system.error' as EventType,
    severity: (i % 5 === 0 ? 'critical' : 'error') as EventSeverity,
    message: [
      'Database connection failed',
      'Redis connection timeout',
      'WebSocket disconnected',
      'API rate limit exceeded',
      'Memory allocation failed',
    ][i % 5],
    timestamp: generateTimestamp(i % 7, (i + 15) % 24),
    metadata: {
      errorCode: ['DB_CONN', 'REDIS_TIMEOUT', 'WS_DISCONNECT', 'RATE_LIMIT', 'MEM_ALLOC'][i % 5],
      retryCount: i % 3,
    },
  })),
  // System warnings (15 events)
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `event-warning-${i}`,
    type: 'system.warning' as EventType,
    severity: 'warning' as EventSeverity,
    message: [
      'High CPU usage detected',
      'Memory usage above 80%',
      'Disk space running low',
      'Network latency increased',
      'Agent response time slow',
    ][i % 5],
    timestamp: generateTimestamp(i % 7, (i + 20) % 24),
    metadata: {
      value: 80 + i,
      threshold: 90,
      unit: ['%', '%', 'GB', 'ms', 'ms'][i % 5],
    },
  })),
];

/**
 * Events filtered by category for filter tests
 */
export const mockEventsAgentLifecycle = mockEventsLarge.filter((e) => e.type === 'agent.lifecycle');
export const mockEventsAgentComplete = mockEventsLarge.filter((e) => e.type === 'agent.complete');
export const mockEventsCFNLoop = mockEventsLarge.filter((e) => e.type.startsWith('cfn.loop'));
export const mockEventsSystemError = mockEventsLarge.filter((e) => e.type === 'system.error');

/**
 * Events filtered by severity for filter tests
 */
export const mockEventsInfo = mockEventsLarge.filter((e) => e.severity === 'info');
export const mockEventsWarning = mockEventsLarge.filter((e) => e.severity === 'warning');
export const mockEventsError = mockEventsLarge.filter((e) => e.severity === 'error');
export const mockEventsCritical = mockEventsLarge.filter((e) => e.severity === 'critical');

/**
 * Events for date range filter tests
 */
export const mockEventsToday = mockEventsLarge.filter((e) => e.timestamp >= Date.now() - 24 * 60 * 60 * 1000);
export const mockEventsLast7Days = mockEventsLarge.filter((e) => e.timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000);

/**
 * Events for search tests
 */
export const mockEventsWithAgent001 = mockEventsLarge.filter((e) => e.agentId === 'agent-001' || e.message.includes('agent-001'));

/**
 * Real-time event update payloads for WebSocket tests
 */
export const mockWebSocketEventUpdate = {
  type: 'agent.lifecycle',
  severity: 'info',
  message: 'New agent spawned via WebSocket',
  agentId: 'agent-websocket-001',
  metadata: { action: 'spawn', source: 'websocket' },
};

export const mockWebSocketErrorEvent = {
  type: 'system.error',
  severity: 'critical',
  message: 'Critical system failure via WebSocket',
  metadata: { errorCode: 'CRITICAL_FAIL', immediate: true },
};

/**
 * Helper to generate custom event
 */
export const createMockEvent = (overrides: Partial<Event> = {}): Event => ({
  id: `event-${Date.now()}`,
  type: 'agent.lifecycle',
  severity: 'info',
  message: 'Mock event message',
  timestamp: Date.now(),
  metadata: {},
  ...overrides,
});
