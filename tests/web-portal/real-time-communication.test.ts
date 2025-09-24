/**
 * @file Real-time Communication Tests
 * @description Tests for WebSocket messaging, agent broadcasting, and human intervention delivery
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { WebSocket, WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { RealTimeCommunicationService } from '../../src/services/real-time-communication';
import { MessageRouter } from '../../src/services/message-router';
import { AgentMessageBroadcaster } from '../../src/services/agent-message-broadcaster';
import { HumanInterventionHandler } from '../../src/services/human-intervention-handler';
import { mockWebSocketMessages } from './fixtures/websocket-messages';
import { createMockWebSocket, createMockWebSocketServer } from './mocks/websocket-mock';

describe('Real-time Communication Tests', () => {
  let communicationService: RealTimeCommunicationService;
  let messageRouter: MessageRouter;
  let agentBroadcaster: AgentMessageBroadcaster;
  let interventionHandler: HumanInterventionHandler;
  let mockServer: WebSocketServer;
  let mockClients: WebSocket[];
  let eventBus: EventEmitter;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    mockServer = createMockWebSocketServer();
    mockClients = [];

    // Initialize services
    messageRouter = new MessageRouter({
      eventBus,
      filteringRules: {
        agentMessages: ['info', 'warning', 'error', 'progress'],
        humanInterventions: ['request', 'approval', 'decision'],
        systemEvents: ['swarm_status', 'agent_spawn', 'task_complete']
      }
    });

    agentBroadcaster = new AgentMessageBroadcaster({
      eventBus,
      messageTypes: {
        progress: { priority: 'high', persistent: true },
        status: { priority: 'medium', persistent: false },
        error: { priority: 'critical', persistent: true }
      }
    });

    interventionHandler = new HumanInterventionHandler({
      eventBus,
      timeoutSettings: {
        default: 30000, // 30 seconds
        critical: 120000, // 2 minutes
        optional: 10000 // 10 seconds
      }
    });

    communicationService = new RealTimeCommunicationService({
      server: mockServer,
      messageRouter,
      agentBroadcaster,
      interventionHandler,
      eventBus
    });

    await communicationService.initialize();
  });

  afterEach(async () => {
    await communicationService.shutdown();
    mockClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });
    jest.clearAllMocks();
  });

  describe('Agent Message Broadcasting', () => {
    it('should broadcast agent progress updates to all connected clients', async () => {
      // Create mock clients
      const client1 = createMockWebSocket();
      const client2 = createMockWebSocket();
      mockClients = [client1, client2];

      await communicationService.addClients(mockClients);

      // Emit agent progress message
      const progressMessage = {
        agentId: 'agent-researcher-001',
        agentType: 'researcher',
        messageType: 'progress',
        content: 'Completed initial research phase',
        timestamp: new Date().toISOString(),
        metadata: {
          taskId: 'task-123',
          phase: 'research',
          completion: 0.75,
          nextPhase: 'analysis'
        }
      };

      await agentBroadcaster.broadcastMessage(progressMessage);

      // Verify both clients received the message
      expect(client1.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"progress"')
      );
      expect(client2.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"progress"')
      );

      // Verify message content
      const sentMessage1 = JSON.parse((client1.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage1.data.agentId).toBe('agent-researcher-001');
      expect(sentMessage1.data.metadata.completion).toBe(0.75);
    });

    it('should handle different message priorities correctly', async () => {
      const client = createMockWebSocket();
      mockClients = [client];
      await communicationService.addClients(mockClients);

      // Send low priority message
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-001',
        messageType: 'status',
        content: 'Routine status update',
        priority: 'low'
      });

      // Send high priority message
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-001',
        messageType: 'error',
        content: 'Critical error occurred',
        priority: 'critical'
      });

      // Verify critical message was sent immediately
      expect(client.send).toHaveBeenCalledTimes(2);

      const messages = (client.send as jest.Mock).mock.calls.map(call =>
        JSON.parse(call[0])
      );

      const criticalMessage = messages.find(msg =>
        msg.data.messageType === 'error'
      );
      expect(criticalMessage.priority).toBe('critical');
      expect(criticalMessage.timestamp).toBeDefined();
    });

    it('should persist important messages for reconnecting clients', async () => {
      // Send persistent message with no clients connected
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-coder-001',
        messageType: 'progress',
        content: 'Code compilation completed',
        persistent: true,
        metadata: { taskId: 'compile-task-456' }
      });

      // Connect new client
      const newClient = createMockWebSocket();
      await communicationService.addClient(newClient);

      // Verify client receives persisted messages
      expect(newClient.send).toHaveBeenCalledWith(
        expect.stringContaining('"content":"Code compilation completed"')
      );
    });

    it('should filter messages based on client subscriptions', async () => {
      const client = createMockWebSocket();
      mockClients = [client];

      // Subscribe client to specific message types
      await communicationService.subscribeClient(client.id, {
        messageTypes: ['progress', 'error'],
        agentTypes: ['researcher', 'coder'],
        taskIds: ['task-123']
      });

      // Send matching message
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-researcher-001',
        agentType: 'researcher',
        messageType: 'progress',
        content: 'Research progress',
        taskId: 'task-123'
      });

      // Send non-matching message
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-reviewer-001',
        agentType: 'reviewer',
        messageType: 'status',
        content: 'Review status',
        taskId: 'task-456'
      });

      // Only matching message should be sent
      expect(client.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.data.agentType).toBe('researcher');
    });

    it('should handle agent swarm coordination messages', async () => {
      const client = createMockWebSocket();
      mockClients = [client];
      await communicationService.addClients(mockClients);

      // Simulate swarm coordination message
      const coordinationMessage = {
        swarmId: 'swarm-web-portal-001',
        messageType: 'coordination',
        content: 'Task handoff from researcher to coder',
        agents: {
          from: { id: 'agent-researcher-001', type: 'researcher' },
          to: { id: 'agent-coder-001', type: 'coder' }
        },
        handoffData: {
          research: 'Authentication requirements analysis',
          specifications: ['OAuth2', 'JWT', 'Session management'],
          nextSteps: ['Implement auth middleware', 'Create user routes']
        }
      };

      await agentBroadcaster.broadcastCoordinationMessage(coordinationMessage);

      expect(client.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"coordination"')
      );

      const sentMessage = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.data.agents.from.type).toBe('researcher');
      expect(sentMessage.data.agents.to.type).toBe('coder');
      expect(sentMessage.data.handoffData.nextSteps).toHaveLength(2);
    });
  });

  describe('Human Intervention Delivery', () => {
    it('should deliver intervention requests with timeout handling', async () => {
      const client = createMockWebSocket();
      mockClients = [client];
      await communicationService.addClients(mockClients);

      const interventionRequest = {
        id: 'intervention-001',
        type: 'decision',
        priority: 'high',
        timeout: 30000,
        context: {
          agentId: 'agent-coder-001',
          task: 'Choose database schema approach',
          options: [
            { id: 'option-1', description: 'SQL with migrations' },
            { id: 'option-2', description: 'NoSQL with flexible schema' }
          ]
        },
        message: 'Please choose the database approach for the authentication system'
      };

      const responsePromise = interventionHandler.requestIntervention(interventionRequest);

      // Verify intervention was sent to client
      expect(client.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"intervention_request"')
      );

      const sentMessage = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.data.id).toBe('intervention-001');
      expect(sentMessage.data.context.options).toHaveLength(2);

      // Simulate human response
      const humanResponse = {
        interventionId: 'intervention-001',
        decision: 'option-1',
        reasoning: 'SQL provides better consistency for user authentication',
        timestamp: new Date().toISOString()
      };

      interventionHandler.handleHumanResponse(humanResponse);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.decision).toBe('option-1');
      expect(result.reasoning).toContain('SQL provides better consistency');
    });

    it('should handle intervention timeout gracefully', async () => {
      const client = createMockWebSocket();
      mockClients = [client];
      await communicationService.addClients(mockClients);

      const interventionRequest = {
        id: 'intervention-timeout-001',
        type: 'approval',
        priority: 'medium',
        timeout: 100, // Very short timeout for testing
        fallbackAction: 'proceed_with_default',
        context: {
          agentId: 'agent-reviewer-001',
          task: 'Approve code changes'
        },
        message: 'Please review and approve the authentication middleware'
      };

      const responsePromise = interventionHandler.requestIntervention(interventionRequest);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await responsePromise;
      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.fallbackAction).toBe('proceed_with_default');

      // Verify timeout notification was sent to client
      expect(client.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"intervention_timeout"')
      );
    });

    it('should support different intervention types with appropriate UI', async () => {
      const client = createMockWebSocket();
      mockClients = [client];
      await communicationService.addClients(mockClients);

      // Test multiple intervention types
      const interventions = [
        {
          id: 'intervention-binary-001',
          type: 'binary_choice',
          ui: 'yes_no_buttons',
          message: 'Should we proceed with the current implementation?'
        },
        {
          id: 'intervention-text-001',
          type: 'text_input',
          ui: 'text_field',
          message: 'Please provide the API endpoint URL',
          validation: { pattern: '^https?://.+', required: true }
        },
        {
          id: 'intervention-multi-001',
          type: 'multiple_choice',
          ui: 'radio_buttons',
          message: 'Select the preferred testing framework',
          options: ['Jest', 'Mocha', 'Vitest', 'Jasmine']
        }
      ];

      for (const intervention of interventions) {
        await interventionHandler.requestIntervention(intervention);
      }

      expect(client.send).toHaveBeenCalledTimes(3);

      const sentMessages = (client.send as jest.Mock).mock.calls.map(call =>
        JSON.parse(call[0])
      );

      expect(sentMessages[0].data.ui).toBe('yes_no_buttons');
      expect(sentMessages[1].data.validation.required).toBe(true);
      expect(sentMessages[2].data.options).toContain('Jest');
    });

    it('should queue interventions when human is busy', async () => {
      const client = createMockWebSocket();
      mockClients = [client];
      await communicationService.addClients(mockClients);

      // Send first intervention (human becomes busy)
      const intervention1Promise = interventionHandler.requestIntervention({
        id: 'intervention-queue-001',
        type: 'decision',
        message: 'First intervention request'
      });

      // Send second intervention (should be queued)
      const intervention2Promise = interventionHandler.requestIntervention({
        id: 'intervention-queue-002',
        type: 'approval',
        message: 'Second intervention request'
      });

      // Only first intervention should be sent immediately
      expect(client.send).toHaveBeenCalledTimes(1);

      // Respond to first intervention
      interventionHandler.handleHumanResponse({
        interventionId: 'intervention-queue-001',
        decision: 'approved'
      });

      await intervention1Promise;

      // Now second intervention should be sent
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(client.send).toHaveBeenCalledTimes(2);

      const queuedMessage = JSON.parse((client.send as jest.Mock).mock.calls[1][0]);
      expect(queuedMessage.data.id).toBe('intervention-queue-002');
    });

    it('should support intervention escalation for critical decisions', async () => {
      const client = createMockWebSocket();
      mockClients = [client];
      await communicationService.addClients(mockClients);

      const criticalIntervention = {
        id: 'intervention-critical-001',
        type: 'critical_decision',
        priority: 'critical',
        escalation: {
          enabled: true,
          timeout: 60000, // 1 minute
          recipients: ['admin@example.com', 'lead-dev@example.com'],
          message: 'Critical decision required: Database migration strategy'
        },
        context: {
          impact: 'high',
          reversible: false,
          affectedSystems: ['authentication', 'user-data', 'sessions']
        },
        message: 'Critical: Choose database migration strategy - this cannot be undone'
      };

      interventionHandler.requestIntervention(criticalIntervention);

      expect(client.send).toHaveBeenCalledWith(
        expect.stringContaining('"priority":"critical"')
      );

      const sentMessage = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.data.escalation.enabled).toBe(true);
      expect(sentMessage.data.context.impact).toBe('high');
      expect(sentMessage.data.context.reversible).toBe(false);
    });
  });

  describe('WebSocket Connection Management', () => {
    it('should handle client connections and disconnections', async () => {
      const client1 = createMockWebSocket();
      const client2 = createMockWebSocket();

      // Test connection
      await communicationService.handleClientConnection(client1);
      await communicationService.handleClientConnection(client2);

      expect(communicationService.getConnectedClientsCount()).toBe(2);

      // Test disconnection
      await communicationService.handleClientDisconnection(client1.id);

      expect(communicationService.getConnectedClientsCount()).toBe(1);
    });

    it('should authenticate clients before allowing message routing', async () => {
      const client = createMockWebSocket();

      // Try to add unauthenticated client
      const result = await communicationService.addClient(client, {
        authenticated: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication required');

      // Authenticate client
      const authResult = await communicationService.authenticateClient(client.id, {
        token: 'valid-jwt-token',
        userId: 'user-123',
        permissions: ['view_agents', 'send_interventions']
      });

      expect(authResult.success).toBe(true);
      expect(communicationService.isClientAuthenticated(client.id)).toBe(true);
    });

    it('should handle WebSocket ping/pong for connection health', async () => {
      const client = createMockWebSocket();
      await communicationService.addClient(client);

      // Send ping
      client.emit('ping');

      // Verify pong was sent
      expect(client.pong).toHaveBeenCalled();

      // Test connection health monitoring
      const healthStatus = await communicationService.checkConnectionHealth(client.id);
      expect(healthStatus.isAlive).toBe(true);
      expect(healthStatus.latency).toBeDefined();
    });

    it('should cleanup resources on connection close', async () => {
      const client = createMockWebSocket();
      await communicationService.addClient(client);

      // Subscribe client to messages
      await communicationService.subscribeClient(client.id, {
        messageTypes: ['progress', 'error']
      });

      // Simulate connection close
      client.emit('close');

      // Verify cleanup
      expect(communicationService.getConnectedClientsCount()).toBe(0);
      expect(communicationService.getClientSubscriptions(client.id)).toBeNull();
    });

    it('should handle WebSocket errors gracefully', async () => {
      const client = createMockWebSocket();
      await communicationService.addClient(client);

      const errorHandler = jest.fn();
      communicationService.on('client_error', errorHandler);

      // Simulate WebSocket error
      const error = new Error('Connection lost');
      client.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith({
        clientId: client.id,
        error: error
      });

      // Connection should be cleaned up
      expect(communicationService.getConnectedClientsCount()).toBe(0);
    });
  });

  describe('Message Filtering and Routing', () => {
    it('should route messages based on content filters', async () => {
      const client = createMockWebSocket();
      await communicationService.addClient(client);

      // Set up content-based filter
      await messageRouter.addFilter({
        clientId: client.id,
        type: 'content',
        criteria: {
          keywords: ['authentication', 'security'],
          exclude: ['debug', 'verbose']
        }
      });

      // Send matching message
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-001',
        messageType: 'info',
        content: 'Implementing authentication middleware with security features',
        tags: ['authentication', 'middleware']
      });

      // Send non-matching message
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-002',
        messageType: 'debug',
        content: 'Verbose debugging information',
        tags: ['debug', 'internal']
      });

      // Only matching message should be routed
      expect(client.send).toHaveBeenCalledTimes(1);

      const sentMessage = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.data.content).toContain('authentication');
    });

    it('should support regex-based message filtering', async () => {
      const client = createMockWebSocket();
      await communicationService.addClient(client);

      await messageRouter.addFilter({
        clientId: client.id,
        type: 'regex',
        criteria: {
          patterns: ['/error|fail|exception/i', '/task.*complete/i'],
          mode: 'include'
        }
      });

      const testMessages = [
        { content: 'Task research completed successfully' }, // Match
        { content: 'Error in database connection' },        // Match
        { content: 'Normal progress update' },              // No match
        { content: 'Exception caught in auth module' }      // Match
      ];

      for (const msg of testMessages) {
        await agentBroadcaster.broadcastMessage({
          agentId: 'agent-001',
          messageType: 'info',
          content: msg.content
        });
      }

      // 3 messages should match the regex patterns
      expect(client.send).toHaveBeenCalledTimes(3);
    });

    it('should handle message rate limiting', async () => {
      const client = createMockWebSocket();
      await communicationService.addClient(client);

      // Set rate limit
      await communicationService.setClientRateLimit(client.id, {
        maxMessages: 5,
        timeWindow: 1000 // 1 second
      });

      // Send messages rapidly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          agentBroadcaster.broadcastMessage({
            agentId: 'agent-001',
            messageType: 'info',
            content: `Message ${i}`
          })
        );
      }

      await Promise.all(promises);

      // Only 5 messages should be sent due to rate limiting
      expect(client.send).toHaveBeenCalledTimes(5);

      // Wait for rate limit to reset
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Send one more message
      await agentBroadcaster.broadcastMessage({
        agentId: 'agent-001',
        messageType: 'info',
        content: 'Message after rate limit reset'
      });

      // This should be sent now
      expect(client.send).toHaveBeenCalledTimes(6);
    });

    it('should support priority-based message routing', async () => {
      const client = createMockWebSocket();
      await communicationService.addClient(client);

      // Set priority filter (only high and critical)
      await messageRouter.addFilter({
        clientId: client.id,
        type: 'priority',
        criteria: {
          minPriority: 'high',
          allowedPriorities: ['high', 'critical']
        }
      });

      const messages = [
        { content: 'Low priority update', priority: 'low' },
        { content: 'Medium priority notification', priority: 'medium' },
        { content: 'High priority alert', priority: 'high' },
        { content: 'Critical system error', priority: 'critical' }
      ];

      for (const msg of messages) {
        await agentBroadcaster.broadcastMessage({
          agentId: 'agent-001',
          messageType: 'info',
          content: msg.content,
          priority: msg.priority
        });
      }

      // Only high and critical priority messages should be sent
      expect(client.send).toHaveBeenCalledTimes(2);

      const sentMessages = (client.send as jest.Mock).mock.calls.map(call =>
        JSON.parse(call[0])
      );

      expect(sentMessages[0].data.priority).toBe('high');
      expect(sentMessages[1].data.priority).toBe('critical');
    });
  });
});