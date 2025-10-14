/**
 * Event Store Service Usage Examples
 * 
 * Demonstrates how to use the EventStoreService for various use cases
 */

import { eventStoreService } from './event-store.js';

/**
 * Example 1: Basic Event Storage
 */
async function basicEventStorage() {
  console.log('=== Basic Event Storage Example ===');
  
  // Initialize the service
  await eventStoreService.initialize();
  
  // Store a simple event
  const eventId = await eventStoreService.storeEvent({
    timestamp: new Date(),
    phaseId: 'cfn-phase-1',
    agentId: 'architect-agent-1',
    eventType: 'task_completed',
    payload: {
      taskId: 'task-123',
      duration: 1500,
      confidence: 0.85,
      output: 'Architecture design completed'
    },
    metadata: {
      version: '1.0',
      environment: 'development'
    }
  });
  
  console.log(`Stored event with ID: ${eventId}`);
  
  // Retrieve the event
  const events = await eventStoreService.queryEvents({ limit: 1 });
  console.log('Retrieved event:', events.events[0]);
}

/**
 * Example 2: Batch Event Storage
 */
async function batchEventStorage() {
  console.log('\n=== Batch Event Storage Example ===');
  
  // Store multiple events at once
  const events = [
    {
      timestamp: new Date(Date.now() - 5000), // 5 seconds ago
      phaseId: 'cfn-phase-1',
      agentId: 'coder-agent-1',
      eventType: 'file_modified',
      payload: {
        filePath: '/src/components/Button.tsx',
        changes: 15,
        linesAdded: 10,
        linesRemoved: 5
      }
    },
    {
      timestamp: new Date(Date.now() - 3000), // 3 seconds ago
      phaseId: 'cfn-phase-1',
      agentId: 'tester-agent-1',
      eventType: 'test_executed',
      payload: {
        testFile: '/tests/Button.test.tsx',
        result: 'passed',
        duration: 120
      }
    },
    {
      timestamp: new Date(Date.now() - 1000), // 1 second ago
      phaseId: 'cfn-phase-1',
      agentId: 'analyst-agent-1',
      eventType: 'quality_check',
      payload: {
        metrics: {
          coverage: 92,
          complexity: 8,
          maintainability: 'A'
        }
      }
    }
  ];
  
  const eventIds = await eventStoreService.storeEvents(events);
  console.log(`Stored ${eventIds.length} events in batch`);
}

/**
 * Example 3: Advanced Querying
 */
async function advancedQuerying() {
  console.log('\n=== Advanced Querying Example ===');
  
  // Query events by phase
  const phaseEvents = await eventStoreService.getEventsByPhaseId('cfn-phase-1', 10);
  console.log(`Found ${phaseEvents.length} events for phase cfn-phase-1`);
  
  // Query events by agent
  const agentEvents = await eventStoreService.getEventsByAgentId('architect-agent-1', 5);
  console.log(`Found ${agentEvents.length} events for architect-agent-1`);
  
  // Query events by type
  const completedTasks = await eventStoreService.getEventsByType('task_completed', 5);
  console.log(`Found ${completedTasks.length} completed tasks`);
  
  // Query with date range
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentEvents = await eventStoreService.getEventsByDateRange(oneHourAgo, now, 20);
  console.log(`Found ${recentEvents.length} events in the last hour`);
  
  // Complex query with multiple filters
  const filteredEvents = await eventStoreService.queryEvents({
    phaseId: 'cfn-phase-1',
    eventType: 'file_modified',
    limit: 10,
    offset: 0
  });
  console.log(`Found ${filteredEvents.total} file modification events in phase 1`);
}

/**
 * Example 4: Pagination
 */
async function paginationExample() {
  console.log('\n=== Pagination Example ===');
  
  let page = 1;
  const pageSize = 5;
  let hasMore = true;
  
  while (hasMore) {
    const result = await eventStoreService.queryEvents({
      limit: pageSize,
      offset: (page - 1) * pageSize
    });
    
    console.log(`Page ${page}: ${result.events.length} events (Total: ${result.total})`);
    
    // Process events on this page
    result.events.forEach(event => {
      console.log(`  - ${event.eventType} by ${event.agentId} at ${event.timestamp.toISOString()}`);
    });
    
    hasMore = result.hasMore;
    page++;
  }
}

/**
 * Example 5: Statistics and Monitoring
 */
async function statisticsExample() {
  console.log('\n=== Statistics Example ===');
  
  const stats = await eventStoreService.getStatistics();
  console.log('Event Store Statistics:');
  console.log(`  Total Events: ${stats.totalEvents}`);
  console.log(`  Unique Phases: ${stats.uniquePhases}`);
  console.log(`  Unique Agents: ${stats.uniqueAgents}`);
  console.log(`  Unique Event Types: ${stats.uniqueEventTypes}`);
  console.log(`  Oldest Event: ${stats.oldestEvent?.toISOString()}`);
  console.log(`  Newest Event: ${stats.newestEvent?.toISOString()}`);
}

/**
 * Example 6: Real-world CFN Loop Integration
 */
async function cfnLoopIntegration() {
  console.log('\n=== CFN Loop Integration Example ===');
  
  const phaseId = 'cfn-phase-2';
  const agentId = 'architect-agent-2';
  
  // Store CFN loop events
  const cfnEvents = [
    {
      timestamp: new Date(),
      phaseId,
      agentId,
      eventType: 'loop_started',
      payload: {
        loopNumber: 3,
        loopType: 'implementation',
        startTime: new Date().toISOString()
      }
    },
    {
      timestamp: new Date(),
      phaseId,
      agentId,
      eventType: 'architecture_decision',
      payload: {
        decision: 'use_microservices_pattern',
        rationale: 'scalability_requirements',
        confidence: 0.9
      }
    },
    {
      timestamp: new Date(),
      phaseId,
      agentId,
      eventType: 'file_created',
      payload: {
        files: [
          'docs/architecture.md',
          'docs/adr/001-microservices.md',
          'src/services/microservice-base.ts'
        ],
        totalFiles: 3
      }
    },
    {
      timestamp: new Date(),
      phaseId,
      agentId,
      eventType: 'loop_completed',
      payload: {
        loopNumber: 3,
        duration: 45000,
        confidence: 0.85,
        success: true,
        filesCreated: 3,
        decisionsMade: 5
      }
    }
  ];
  
  await eventStoreService.storeEvents(cfnEvents);
  
  // Query CFN-specific events
  const phaseEvents = await eventStoreService.queryEvents({
    phaseId,
    limit: 100
  });
  
  console.log(`CFN Phase ${phaseId} Events:`);
  phaseEvents.events.forEach(event => {
    console.log(`  ${event.eventType}: ${JSON.stringify(event.payload)}`);
  });
}

/**
 * Example 7: Error Handling and Resilience
 */
async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===');
  
  try {
    // Try to query with invalid parameters
    const result = await eventStoreService.queryEvents({
      phaseId: 'non-existent-phase',
      limit: 10
    });
    
    console.log(`Query completed gracefully: ${result.total} events found`);
    
    // Try to delete non-existent event
    const deleted = await eventStoreService.deleteEvent('invalid-event-id');
    console.log(`Delete operation result: ${deleted}`);
    
  } catch (error) {
    console.error('Error in event store operations:', error);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await basicEventStorage();
    await batchEventStorage();
    await advancedQuerying();
    await paginationExample();
    await statisticsExample();
    await cfnLoopIntegration();
    await errorHandlingExample();
    
    console.log('\n=== All examples completed successfully ===');
  } catch (error) {
    console.error('Example execution failed:', error);
  } finally {
    // Clean up
    await eventStoreService.close();
  }
}

// Export examples for individual testing
export {
  basicEventStorage,
  batchEventStorage,
  advancedQuerying,
  paginationExample,
  statisticsExample,
  cfnLoopIntegration,
  errorHandlingExample,
  runAllExamples
};

// Run all examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}