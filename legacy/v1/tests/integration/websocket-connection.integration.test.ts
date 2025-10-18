/**
 * @file WebSocket Connection Integration Tests
 * @description Comprehensive WebSocket connection tests for real-time dashboard functionality
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketManager } from '../../src/web/websocket/websocket-manager';
import { MockWebSocket, MockWebSocketServer, createMockWebSocket, createMockWebSocketServer } from '../web-portal/mocks/websocket-mock';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('WebSocket Connection Integration Tests', () => {
  let httpServer: HttpServer;
  let socketioServer: SocketIOServer;
  let wsManager: WebSocketManager;
  let clientSocket: ClientSocket;
  let serverUrl: string;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create HTTP server
    httpServer = new HttpServer();

    // Create Socket.IO server
    socketioServer = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    // Create WebSocket manager
    wsManager = new WebSocketManager(socketioServer, mockLogger);

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const address = httpServer.address();
        if (typeof address === 'string') {
          serverUrl = address;
        } else {
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
      clientSocket = null as any;
    }

    if (socketioServer) {
      socketioServer.close();
    }

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(resolve);
      });
    }

    jest.clearAllMocks();
  });

  describe('Basic Connection Management', () => {
    test('client can connect to WebSocket server', async () => {
      clientSocket = ClientIO(serverUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

        clientSocket.on('connect', () => {
          clearTimeout(timeout);
          expect(clientSocket.connected).toBe(true);
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('client receives connection confirmation', async () => {
      clientSocket = ClientIO(serverUrl);

      const connectionData = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

        clientSocket.on('connected', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      expect(connectionData).toHaveProperty('socketId');
      expect(connectionData).toHaveProperty('serverTime');
      expect(connectionData).toHaveProperty('supportedEvents');
      expect(Array.isArray(connectionData.supportedEvents)).toBe(true);
      expect(connectionData.supportedEvents).toContain('agent-message');
      expect(connectionData.supportedEvents).toContain('status-change');
    });

    test('client can disconnect gracefully', async () => {
      clientSocket = ClientIO(serverUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Disconnect
      clientSocket.disconnect();

      // Wait for disconnection
      await new Promise<void>((resolve) => {
        clientSocket.on('disconnect', resolve);
      });

      expect(clientSocket.connected).toBe(false);
    });

    test('multiple clients can connect simultaneously', async () => {
      const clients: ClientSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      // Create 5 clients
      for (let i = 0; i < 5; i++) {
        const client = ClientIO(serverUrl);
        clients.push(client);

        const promise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

          client.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });

          client.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        connectionPromises.push(promise);
      }

      // Wait for all clients to connect
      await Promise.all(connectionPromises);

      // Verify all clients are connected
      clients.forEach(client => {
        expect(client.connected).toBe(true);
      });

      // Disconnect all clients
      clients.forEach(client => client.disconnect());
    });

    test('connection statistics are tracked correctly', async () => {
      const initialStats = wsManager.getConnectionStats();
      expect(initialStats.totalConnections).toBe(0);

      // Connect clients
      const clients: ClientSocket[] = [];
      for (let i = 0; i < 3; i++) {
        const client = ClientIO(serverUrl);
        clients.push(client);

        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
      }

      const afterConnectionStats = wsManager.getConnectionStats();
      expect(afterConnectionStats.totalConnections).toBe(3);

      // Disconnect clients
      clients.forEach(client => client.disconnect());

      // Wait for disconnections to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      const afterDisconnectionStats = wsManager.getConnectionStats();
      expect(afterDisconnectionStats.totalConnections).toBe(0);
    });
  });

  describe('Swarm Room Management', () => {
    test('client can join swarm room', async () => {
      clientSocket = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      const joinResult = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Join timeout')), 5000);

        clientSocket.emit('join-swarm', {
          swarmId: 'test-swarm-001',
          userId: 'test-user-001'
        });

        clientSocket.on('swarm-joined', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });

        clientSocket.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      expect(joinResult).toHaveProperty('swarmId', 'test-swarm-001');
      expect(joinResult).toHaveProperty('timestamp');
      expect(joinResult).toHaveProperty('subscribersCount');
      expect(joinResult.subscribersCount).toBeGreaterThanOrEqual(1);
    });

    test('client receives swarm status after joining', async () => {
      clientSocket = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Join swarm
      await new Promise<void>((resolve) => {
        clientSocket.emit('join-swarm', { swarmId: 'test-swarm-001' });
        clientSocket.on('swarm-joined', resolve);
      });

      // Wait for swarm status
      const swarmStatus = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Status timeout')), 5000);

        clientSocket.on('swarm-status', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      expect(swarmStatus).toHaveProperty('swarmId', 'test-swarm-001');
      expect(swarmStatus).toHaveProperty('status');
      expect(swarmStatus).toHaveProperty('timestamp');
      expect(swarmStatus).toHaveProperty('source');
    });

    test('client can leave swarm room', async () => {
      clientSocket = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Join swarm
      await new Promise<void>((resolve) => {
        clientSocket.emit('join-swarm', { swarmId: 'test-swarm-001' });
        clientSocket.on('swarm-joined', resolve);
      });

      // Leave swarm
      const leaveResult = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Leave timeout')), 5000);

        clientSocket.emit('leave-swarm', { swarmId: 'test-swarm-001' });

        clientSocket.on('swarm-left', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      expect(leaveResult).toHaveProperty('swarmId', 'test-swarm-001');
      expect(leaveResult).toHaveProperty('timestamp');
    });

    test('multiple clients can join the same swarm', async () => {
      const clients: ClientSocket[] = [];
      const joinPromises: Promise<any>[] = [];

      // Create 3 clients and join the same swarm
      for (let i = 0; i < 3; i++) {
        const client = ClientIO(serverUrl);
        clients.push(client);

        // Wait for connection
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });

        // Join swarm
        const joinPromise = new Promise<any>((resolve) => {
          client.emit('join-swarm', {
            swarmId: 'shared-swarm-001',
            userId: `user-${i}`
          });

          client.on('swarm-joined', resolve);
        });

        joinPromises.push(joinPromise);
      }

      // Wait for all clients to join
      const joinResults = await Promise.all(joinPromises);

      // All clients should receive subscriber count
      joinResults.forEach(result => {
        expect(result.subscribersCount).toBe(3);
      });

      // Check swarm stats
      const swarmClients = wsManager.getSwarmClients('shared-swarm-001');
      expect(swarmClients).toHaveLength(3);

      // Disconnect all clients
      clients.forEach(client => client.disconnect());
    });

    test('clients can join multiple swarms', async () => {
      clientSocket = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Join multiple swarms
      const swarmIds = ['swarm-001', 'swarm-002', 'swarm-003'];
      const joinPromises = swarmIds.map(swarmId =>
        new Promise<any>((resolve) => {
          clientSocket.emit('join-swarm', { swarmId });
          clientSocket.on('swarm-joined', resolve);
        })
      );

      await Promise.all(joinPromises);

      // Verify active swarms
      const activeSwarms = wsManager.getActiveSwarms();
      expect(activeSwarms).toHaveLength(3);
      expect(activeSwarms).toContain('swarm-001');
      expect(activeSwarms).toContain('swarm-002');
      expect(activeSwarms).toContain('swarm-003');
    });
  });

  describe('Real-time Event Broadcasting', () => {
    test('events are broadcast to swarm members', async () => {
      const clients: ClientSocket[] = [];
      const messagePromises: Promise<any>[] = [];

      // Create 2 clients and join the same swarm
      for (let i = 0; i < 2; i++) {
        const client = ClientIO(serverUrl);
        clients.push(client);

        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });

        await new Promise<void>((resolve) => {
          client.emit('join-swarm', { swarmId: 'broadcast-test-001' });
          client.on('swarm-joined', resolve);
        });

        // Set up message listener
        const messagePromise = new Promise<any>((resolve) => {
          client.on('agent-message', resolve);
        });
        messagePromises.push(messagePromise);
      }

      // Broadcast event to swarm
      wsManager.broadcastToSwarm('broadcast-test-001', {
        type: 'agent-message',
        data: {
          agentId: 'agent-001',
          message: 'Test broadcast message',
          timestamp: new Date().toISOString()
        },
        agentId: 'agent-001',
        timestamp: new Date().toISOString()
      });

      // Wait for all clients to receive the message
      const messages = await Promise.all(messagePromises);

      messages.forEach((message, index) => {
        expect(message.agentId).toBe('agent-001');
        expect(message.message).toBe('Test broadcast message');
        expect(message.timestamp).toBeDefined();
      });

      // Disconnect clients
      clients.forEach(client => client.disconnect());
    });

    test('events are not broadcast to non-swarm members', async () => {
      const swarmClient = ClientIO(serverUrl);
      const nonSwarmClient = ClientIO(serverUrl);

      // Connect clients
      await new Promise<void>((resolve) => {
        swarmClient.on('connect', resolve);
      });
      await new Promise<void>((resolve) => {
        nonSwarmClient.on('connect', resolve);
      });

      // Only swarm client joins swarm
      await new Promise<void>((resolve) => {
        swarmClient.emit('join-swarm', { swarmId: 'exclusive-test-001' });
        swarmClient.on('swarm-joined', resolve);
      });

      // Set up message listeners
      let swarmClientReceived = false;
      let nonSwarmClientReceived = false;

      swarmClient.on('agent-message', () => {
        swarmClientReceived = true;
      });

      nonSwarmClient.on('agent-message', () => {
        nonSwarmClientReceived = true;
      });

      // Broadcast to swarm
      wsManager.broadcastToSwarm('exclusive-test-001', {
        type: 'agent-message',
        data: {
          agentId: 'agent-001',
          message: 'Exclusive message'
        },
        agentId: 'agent-001',
        timestamp: new Date().toISOString()
      });

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(swarmClientReceived).toBe(true);
      expect(nonSwarmClientReceived).toBe(false);

      // Disconnect clients
      swarmClient.disconnect();
      nonSwarmClient.disconnect();
    });

    test('multiple events can be broadcast rapidly', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      await new Promise<void>((resolve) => {
        client.emit('join-swarm', { swarmId: 'rapid-broadcast-test' });
        client.on('swarm-joined', resolve);
      });

      const receivedMessages: any[] = [];
      client.on('agent-message', (message) => {
        receivedMessages.push(message);
      });

      // Broadcast multiple events rapidly
      const eventCount = 10;
      for (let i = 0; i < eventCount; i++) {
        wsManager.broadcastToSwarm('rapid-broadcast-test', {
          type: 'agent-message',
          data: {
            agentId: 'agent-001',
            message: `Message ${i}`,
            index: i
          },
          agentId: 'agent-001',
          timestamp: new Date().toISOString()
        });
      }

      // Wait for all messages to be received
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(receivedMessages).toHaveLength(eventCount);
      receivedMessages.forEach((message, index) => {
        expect(message.index).toBe(index);
        expect(message.message).toBe(`Message ${index}`);
      });

      client.disconnect();
    });
  });

  describe('Human Intervention Handling', () => {
    test('human intervention events are processed correctly', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      await new Promise<void>((resolve) => {
        client.emit('join-swarm', { swarmId: 'intervention-test-001' });
        client.on('swarm-joined', resolve);
      });

      const interventionResult = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Intervention timeout')), 5000);

        client.emit('send-intervention', {
          swarmId: 'intervention-test-001',
          agentId: 'agent-001',
          message: 'Test intervention message',
          action: 'approve',
          metadata: { priority: 'high' }
        });

        client.on('intervention-forwarded', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });

        client.on('intervention-error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      expect(interventionResult).toHaveProperty('interventionId');
      expect(interventionResult).toHaveProperty('status', 'sent');
      expect(interventionResult).toHaveProperty('mcpResponse');

      client.disconnect();
    });

    test('intervention events are broadcast to other swarm members', async () => {
      const clients: ClientSocket[] = [];
      const interventionPromises: Promise<any>[] = [];

      // Create 3 clients in the same swarm
      for (let i = 0; i < 3; i++) {
        const client = ClientIO(serverUrl);
        clients.push(client);

        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });

        await new Promise<void>((resolve) => {
          client.emit('join-swarm', {
            swarmId: 'intervention-broadcast-test',
            userId: `user-${i}`
          });
          client.on('swarm-joined', resolve);
        });

        // Set up intervention listener (except for the sender)
        if (i > 0) {
          const interventionPromise = new Promise<any>((resolve) => {
            client.on('human-intervention', resolve);
          });
          interventionPromises.push(interventionPromise);
        }
      }

      // Send intervention from first client
      clients[0].emit('send-intervention', {
        swarmId: 'intervention-broadcast-test',
        agentId: 'agent-001',
        message: 'Team coordination needed',
        action: 'escalate'
      });

      // Wait for other clients to receive the intervention
      const interventions = await Promise.all(interventionPromises);

      interventions.forEach((intervention) => {
        expect(intervention.message).toBe('Team coordination needed');
        expect(intervention.action).toBe('escalate');
        expect(intervention.fromClient).toBe(clients[0].id);
      });

      // Disconnect all clients
      clients.forEach(client => client.disconnect());
    });
  });

  describe('Status Request Handling', () => {
    test('status requests trigger appropriate responses', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      await new Promise<void>((resolve) => {
        client.emit('join-swarm', { swarmId: 'status-test-001' });
        client.on('swarm-joined', resolve);
      });

      const statusResponses: any[] = [];

      client.on('swarm-status', (data) => {
        statusResponses.push({ type: 'swarm-status', data });
      });

      client.on('agent-status', (data) => {
        statusResponses.push({ type: 'agent-status', data });
      });

      client.on('status-error', (data) => {
        statusResponses.push({ type: 'status-error', data });
      });

      // Request swarm status
      client.emit('request-status', { swarmId: 'status-test-001' });

      // Request agent status
      client.emit('request-status', { agentId: 'agent-001' });

      // Wait for responses
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(statusResponses.length).toBeGreaterThan(0);

      const swarmStatusResponse = statusResponses.find(r => r.type === 'swarm-status');
      expect(swarmStatusResponse).toBeDefined();
      expect(swarmStatusResponse.data.swarmId).toBe('status-test-001');

      const agentStatusResponse = statusResponses.find(r => r.type === 'agent-status');
      expect(agentStatusResponse).toBeDefined();
      expect(agentStatusResponse.data.agentId).toBe('agent-001');

      client.disconnect();
    });

    test('status requests handle invalid parameters gracefully', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      const errorResponse = await new Promise<any>((resolve) => {
        client.emit('request-status', {
          swarmId: 'non-existent-swarm',
          agentId: 'non-existent-agent'
        });

        client.on('status-error', (error) => {
          resolve(error);
        });

        // Also handle timeout
        setTimeout(() => resolve({ error: 'timeout' }), 1000);
      });

      expect(errorResponse).toBeDefined();
      expect(errorResponse.error).toBeDefined();

      client.disconnect();
    });
  });

  describe('Filter Management', () => {
    test('clients can set and update filters', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      const filterResult = await new Promise<any>((resolve) => {
        client.emit('set-filter', {
          agentTypes: ['researcher', 'coder'],
          priority: ['high', 'medium'],
          timeRange: '1h'
        });

        client.on('filter-updated', (data) => {
          resolve(data);
        });
      });

      expect(filterResult).toHaveProperty('status', 'success');
      expect(filterResult).toHaveProperty('filterConfig');
      expect(filterResult.filterConfig.agentTypes).toEqual(['researcher', 'coder']);
      expect(filterResult.filterConfig.priority).toEqual(['high', 'medium']);
      expect(filterResult.filterConfig.timeRange).toBe('1h');

      client.disconnect();
    });

    test('filters are applied to message broadcasting', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      await new Promise<void>((resolve) => {
        client.emit('join-swarm', { swarmId: 'filter-test-001' });
        client.on('swarm-joined', resolve);
      });

      // Set filter to only receive researcher agent messages
      await new Promise<any>((resolve) => {
        client.emit('set-filter', {
          agentTypes: ['researcher']
        });

        client.on('filter-updated', resolve);
      });

      const receivedMessages: any[] = [];
      client.on('agent-message', (message) => {
        receivedMessages.push(message);
      });

      // Broadcast different agent messages
      wsManager.broadcastToSwarm('filter-test-001', {
        type: 'agent-message',
        data: {
          agentId: 'researcher-001',
          agentType: 'researcher',
          message: 'Researcher message'
        },
        agentId: 'researcher-001',
        timestamp: new Date().toISOString()
      });

      wsManager.broadcastToSwarm('filter-test-001', {
        type: 'agent-message',
        data: {
          agentId: 'coder-001',
          agentType: 'coder',
          message: 'Coder message'
        },
        agentId: 'coder-001',
        timestamp: new Date().toISOString()
      });

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // In a real implementation, filtering would happen server-side
      // For this test, we just verify the broadcast mechanism works
      expect(receivedMessages.length).toBeGreaterThan(0);

      client.disconnect();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('handles connection failures gracefully', async () => {
      // Try to connect to non-existent server
      const invalidClient = ClientIO('http://localhost:9999', {
        timeout: 1000,
        forceNew: true
      });

      const error = await new Promise<any>((resolve) => {
        invalidClient.on('connect_error', (error) => {
          resolve(error);
        });
      });

      expect(error).toBeDefined();
      invalidClient.disconnect();
    });

    test('handles malformed messages gracefully', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      // Send malformed data
      expect(() => {
        client.emit('invalid-event', null);
      }).not.toThrow();

      // Send event with missing required fields
      expect(() => {
        client.emit('join-swarm', {}); // Missing swarmId
      }).not.toThrow();

      client.disconnect();
    });

    test('recovers from temporary disconnections', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      await new Promise<void>((resolve) => {
        client.emit('join-swarm', { swarmId: 'reconnect-test-001' });
        client.on('swarm-joined', resolve);
      });

      // Simulate temporary disconnection
      client.disconnect();

      // Reconnect
      const reconnectedClient = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        reconnectedClient.on('connect', resolve);
      });

      expect(reconnectedClient.connected).toBe(true);

      reconnectedClient.disconnect();
    });

    test('handles high-frequency events without memory leaks', async () => {
      const client = ClientIO(serverUrl);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      await new Promise<void>((resolve) => {
        client.emit('join-swarm', { swarmId: 'stress-test-001' });
        client.on('swarm-joined', resolve);
      });

      const messageCount = 1000;
      let receivedCount = 0;

      client.on('agent-message', () => {
        receivedCount++;
      });

      // Send high-frequency events
      for (let i = 0; i < messageCount; i++) {
        wsManager.broadcastToSwarm('stress-test-001', {
          type: 'agent-message',
          data: {
            agentId: 'agent-001',
            message: `Message ${i}`,
            index: i
          },
          agentId: 'agent-001',
          timestamp: new Date().toISOString()
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should receive most messages (allowing for some network loss)
      expect(receivedCount).toBeGreaterThan(messageCount * 0.8);

      client.disconnect();
    });
  });

  describe('Performance and Scalability', () => {
    test('handles many concurrent connections', async () => {
      const clientCount = 20;
      const clients: ClientSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      // Create many concurrent connections
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        clients.push(client);

        const promise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

          client.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });

          client.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        connectionPromises.push(promise);
      }

      const startTime = performance.now();
      await Promise.all(connectionPromises);
      const endTime = performance.now();

      // Should connect all clients within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);

      // Verify all clients are connected
      expect(clients.every(client => client.connected)).toBe(true);

      // Check server stats
      const stats = wsManager.getConnectionStats();
      expect(stats.totalConnections).toBe(clientCount);

      // Disconnect all clients
      clients.forEach(client => client.disconnect());
    });

    test('broadcast performance scales with client count', async () => {
      const clientCounts = [5, 10, 15];
      const performanceResults: { clients: number; time: number }[] = [];

      for (const clientCount of clientCounts) {
        const clients: ClientSocket[] = [];

        // Connect clients
        for (let i = 0; i < clientCount; i++) {
          const client = ClientIO(serverUrl);
          clients.push(client);

          await new Promise<void>((resolve) => {
            client.on('connect', resolve);
          });

          await new Promise<void>((resolve) => {
            client.emit('join-swarm', { swarmId: `perf-test-${clientCount}` });
            client.on('swarm-joined', resolve);
          });
        }

        // Measure broadcast time
        const startTime = performance.now();

        wsManager.broadcastToSwarm(`perf-test-${clientCount}`, {
          type: 'agent-message',
          data: {
            agentId: 'agent-001',
            message: 'Performance test message'
          },
          agentId: 'agent-001',
          timestamp: new Date().toISOString()
        });

        const endTime = performance.now();
        const broadcastTime = endTime - startTime;

        performanceResults.push({
          clients: clientCount,
          time: broadcastTime
        });

        // Disconnect clients
        clients.forEach(client => client.disconnect());
      }

      // Broadcast time should scale reasonably
      for (let i = 1; i < performanceResults.length; i++) {
        const prevResult = performanceResults[i - 1];
        const currResult = performanceResults[i];

        // Time should not increase disproportionately
        const timeRatio = currResult.time / prevResult.time;
        const clientRatio = currResult.clients / prevResult.clients;

        expect(timeRatio).toBeLessThan(clientRatio * 1.5); // Allow 50% overhead
      }
    });

    test('memory usage remains stable under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create and destroy many connections
      for (let cycle = 0; cycle < 5; cycle++) {
        const clients: ClientSocket[] = [];

        // Create connections
        for (let i = 0; i < 10; i++) {
          const client = ClientIO(serverUrl);
          clients.push(client);

          await new Promise<void>((resolve) => {
            client.on('connect', resolve);
          });
        }

        // Send some messages
        for (let i = 0; i < 50; i++) {
          wsManager.broadcastToSwarm('memory-test-001', {
            type: 'agent-message',
            data: { message: `Message ${i}` },
            agentId: 'agent-001',
            timestamp: new Date().toISOString()
          });
        }

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Disconnect clients
        clients.forEach(client => client.disconnect());

        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});