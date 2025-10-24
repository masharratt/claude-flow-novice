/**
 * Hybrid Routing Handler Integration Tests
 * Integration tests with real WebSocket server setup
 */

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketServer } from './SocketIOServer';
import { HybridRoutingHandler } from './hybrid-routing-handler';
import type { AgentSpawnedEvent, AgentCompletedEvent, CFNLoop3Event, CFNLoop4Decision } from './hybrid-routing-handler';

describe('HybridRoutingHandler Integration Tests', () => {
  let httpServer: any;
  let wsServer: WebSocketServer;
  let handler: HybridRoutingHandler;
  let clientSocket: ClientSocket;
  let serverIO: SocketIOServer;

  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer();
    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      
      // Create WebSocket server
      wsServer = new WebSocketServer(httpServer, {
        corsOrigin: '*',
        enableDebug: false,
        jwtSecret: 'test-secret',
        eventThrottle: {
          metrics_update: 100,
          agent_update: 50
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      
      // Create hybrid routing handler
      handler = new HybridRoutingHandler(wsServer);
      
      // Connect client
      const clientUrl = `http://localhost:${port}`;
      clientSocket = ClientIO(clientUrl, {
        transports: ['websocket'],
        forceNew: true
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      
      clientSocket.on('connect', () => {
        return;
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterAll((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (wsServer) {
      wsServer.shutdown()await ( => {
        httpServer.close(() => {
          return;
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } else {
      httpServer.close(() => {
        return;
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    }
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  beforeEach(() => {
    handler.clearStorage();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Agent Lifecycle Integration', () => {
    jest.setTimeout(10000);
  test('should broadcast agent:spawned event to connected clients', (done) => {
      const agentData: AgentSpawnedEvent = {
        agentId: 'agent-integration-123',
        agentType: 'backend-dev',
        parentId: 'parent-456',
        swarmId: 'swarm-789',
        task: 'Create comprehensive API endpoints',
        capabilities: ['api-design', 'database', 'testing', 'documentation'],
        resources: {
          cpu: 4,
          memory: 8192,
          storage: 2048
        },
        metadata: {
          priority: 'high',
          deadline: '2024-01-15',
          requirements: ['REST', 'GraphQL', 'WebSocket']
        },
        timestamp: new Date()
      };

      // Listen for agent_update events
      clientSocket.on('agent_update', (data) => {
        if (data.agentId === 'agent-integration-123') {
          expect(data.status).toBe('spawned');
          expect(data.health.cpu).toBe(4);
          expect(data.health.memory).toBe(8192);
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Trigger agent spawn
      handler.agentSpawned(agentData);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should broadcast agent:completed event with confidence metrics', (done) => {
      const completedData: AgentCompletedEvent = {
        agentId: 'agent-integration-456',
        status: 'completed',
        confidence: 0.94,
        cost: {
          compute: 0.042,
          storage: 0.008,
          network: 0.015,
          total: 0.065
        },
        duration: 28000,
        output: {
          endpoints: 12,
          tests: 48,
          documentation: 'complete',
          performance: 'optimized'
        },
        metrics: {
          tasksCompleted: 8,
          quality: 0.96,
          efficiency: 0.91
        },
        timestamp: new Date()
      };

      // Listen for agent_update events
      clientSocket.on('agent_update', (data) => {
        if (data.agentId === 'agent-integration-456') {
          expect(data.status).toBe('completed');
          expect(data.confidence).toBe(0.94);
          expect(data.tasks).toBeDefined();
          expect(data.tasks![0].progress).toBe(100);
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Trigger agent completion
      handler.agentCompleted(completedData);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should broadcast hierarchy change events', (done) => {
      const agentData: AgentSpawnedEvent = {
        agentId: 'agent-hierarchy-123',
        agentType: 'frontend-dev',
        parentId: 'parent-hierarchy-456',
        task: 'Create React components',
        capabilities: ['react', 'typescript', 'styling'],
        resources: { cpu: 2, memory: 4096, storage: 1024 },
        timestamp: new Date()
      };

      // Listen for hierarchy_change events
      clientSocket.on('hierarchy_change', (data) => {
        if (data.agentId === 'agent-hierarchy-123') {
          expect(data.type).toBe('spawn');
          expect(data.parentId).toBe('parent-hierarchy-456');
          expect(data.metadata.agentType).toBe('frontend-dev');
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Trigger agent spawn (should generate hierarchy change)
      handler.agentSpawned(agentData);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('CFN Loop 3 Integration', () => {
    jest.setTimeout(10000);
  test('should broadcast CFN Loop 3 iteration events', (done) => {
      const loop3Data: CFNLoop3Event = {
        phaseId: 'phase-integration-001',
        iteration: 4,
        agentId: 'agent-cfn-123',
        agentType: 'database-specialist',
        task: 'Optimize database queries',
        confidence: 0.82,
        duration: 6200,
        output: {
          queriesOptimized: 15,
          performanceGain: '45%',
          indexesAdded: 8
        },
        timestamp: new Date()
      };

      // Listen for metrics_update events (CFN events trigger metrics updates)
      clientSocket.on('metrics_update', (data) => {
        if (data.agents && data.agents.total >= 0) {
          expect(data.system).toBeDefined();
          expect(data.agents).toBeDefined();
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Trigger CFN Loop 3 iteration
      handler.cfnLoop3Iteration(loop3Data);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should send notifications for high confidence achievements', (done) => {
      const loop3Data: CFNLoop3Event = {
        phaseId: 'phase-high-confidence',
        iteration: 2,
        agentId: 'agent-high-conf',
        agentType: 'security-specialist',
        task: 'Implement security controls',
        confidence: 0.95,
        duration: 4500,
        output: {
          securityTests: 'all-passing',
          vulnerabilities: 'none-found',
          compliance: 'full'
        },
        timestamp: new Date()
      };

      // Listen for notification events
      clientSocket.on('notification', (data) => {
        if (data.title === 'High Confidence Achieved') {
          expect(data.type).toBe('success');
          expect(data.message).toContain('0.95');
          expect(data.action.url).toContain('/phases/phase-high-confidence');
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Trigger high confidence event
      handler.cfnLoop3Iteration(loop3Data);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('CFN Loop 4 Integration', () => {
    jest.setTimeout(10000);
  test('should broadcast PO decision events', (done) => {
      const decisionData: CFNLoop4Decision = {
        phaseId: 'phase-decision-001',
        decisionId: 'decision-integration-123',
        agentId: 'agent-decision-456',
        decisionType: 'approve',
        rationale: 'Excellent implementation that exceeds requirements. Code quality is outstanding with comprehensive test coverage and excellent performance characteristics.',
        criteria: {
          quality: 0.98,
          completeness: 0.95,
          compliance: 0.97,
          performance: 0.94
        },
        metadata: {
          reviewer: 'senior-architect',
          reviewTime: '45min',
          recommendations: 'Consider for template reuse'
        },
        timestamp: new Date()
      };

      // Listen for notification events
      clientSocket.on('notification', (data) => {
        if (data.title.includes('PO Decision')) {
          expect(data.type).toBe('success');
          expect(data.message).toContain('APPROVE');
          expect(data.action.url).toContain('/phases/phase-decision-001/decisions/decision-integration-123');
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Trigger PO decision
      handler.cfnLoop4Decision(decisionData);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle rejection decisions with appropriate notifications', (done) => {
      const decisionData: CFNLoop4Decision = {
        phaseId: 'phase-rejection-001',
        decisionId: 'decision-rejection-123',
        agentId: 'agent-rejection-456',
        decisionType: 'reject',
        rationale: 'Implementation fails to meet critical security requirements and has insufficient test coverage for edge cases.',
        criteria: {
          quality: 0.65,
          completeness: 0.70,
          compliance: 0.45,
          performance: 0.80
        },
        timestamp: new Date()
      };

      // Listen for notification events
      clientSocket.on('notification', (data) => {
        if (data.title.includes('PO Decision') && data.type === 'error') {
          expect(data.message).toContain('REJECT');
          expect(data.action.url).toContain('/phases/phase-rejection-001/decisions/decision-rejection-123');
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Trigger rejection decision
      handler.cfnLoop4Decision(decisionData);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Real-time Event Flow', () => {
    jest.setTimeout(10000);
  test('should handle complete agent lifecycle with CFN events', (done) => {
      let eventsReceived = 0;
      const expectedEvents = 4; // spawned, iteration, completed, decision

      const checkComplete = () => {
        eventsReceived++;
        if (eventsReceived === expectedEvents) {
          return;
        }
      };

      // Set up listeners
      clientSocket.on('agent_update', (data) => {
        if (data.agentId === 'agent-lifecycle-123') {
          checkComplete();
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      clientSocket.on('notification', (data) => {
        if (data.title.includes('Agent Completed') || data.title.includes('PO Decision')) {
          checkComplete();
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      clientSocket.on('metrics_update', () => {
        checkComplete();
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // 1. Spawn agent
      handler.agentSpawned({
        agentId: 'agent-lifecycle-123',
        agentType: 'fullstack-dev',
        task: 'Build complete feature',
        capabilities: ['frontend', 'backend', 'database'],
        resources: { cpu: 4, memory: 8192, storage: 2048 },
        timestamp: new Date()
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // 2. CFN Loop 3 iteration
      setTimeout(() => {
        handler.cfnLoop3Iteration({
          phaseId: 'phase-lifecycle-001',
          iteration: 1,
          agentId: 'agent-lifecycle-123',
          agentType: 'fullstack-dev',
          task: 'Build complete feature',
          confidence: 0.78,
          duration: 12000,
          timestamp: new Date()
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      }, 100);

      // 3. Complete agent
      setTimeout(() => {
        handler.agentCompleted({
          agentId: 'agent-lifecycle-123',
          status: 'completed',
          confidence: 0.91,
          cost: { compute: 0.085, storage: 0.012, network: 0.023, total: 0.120 },
          duration: 35000,
          timestamp: new Date()
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      }, 200);

      // 4. PO decision
      setTimeout(() => {
        handler.cfnLoop4Decision({
          phaseId: 'phase-lifecycle-001',
          decisionId: 'decision-lifecycle-123',
          agentId: 'agent-lifecycle-123',
          decisionType: 'approve',
          rationale: 'Feature implemented successfully with good quality',
          criteria: { quality: 0.90, completeness: 0.88, compliance: 0.92, performance: 0.87 },
          timestamp: new Date()
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      }, 300);
    }, 10000);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Performance and Scalability', () => {
    jest.setTimeout(10000);
  test('should handle high-frequency events without memory leaks', (done) => {
      const eventCount = 50;
      let eventsReceived = 0;

      clientSocket.on('agent_update', () => {
        eventsReceived++;
        if (eventsReceived === eventCount) {
          // Check storage stats to ensure proper cleanup
          const stats = handler.getStorageStats();
          expect(stats.agents).toBe(eventCount);
          expect(stats.agentStatus).toBe(eventCount);
          
          // Verify history is limited
          const history = handler.getLoop3History('phase-performance');
          expect(history.length).toBeLessThanOrEqual(100);
          
          return;
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Generate high-frequency events
      for (let i = 0; i < eventCount; i++) {
        setTimeout(() => {
          handler.agentSpawned({
            agentId: `agent-perf-${i}`,
            agentType: 'test-agent',
            task: `Task ${i}`,
            capabilities: ['test'],
            resources: { cpu: 1, memory: 512, storage: 256 },
            timestamp: new Date()
          } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

          handler.agentCompleted({
            agentId: `agent-perf-${i}`,
            status: 'completed',
            confidence: 0.8 + (i % 20) * 0.01,
            cost: { compute: 0.001, storage: 0.0001, network: 0.0001, total: 0.0012 },
            duration: 1000,
            timestamp: new Date()
          } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

          if (i % 5 === 0) {
            handler.cfnLoop3Iteration({
              phaseId: 'phase-performance',
              iteration: Math.floor(i / 5) + 1,
              agentId: `agent-perf-${i}`,
              agentType: 'test-agent',
              task: `Task ${i}`,
              confidence: 0.8,
              duration: 500,
              timestamp: new Date()
            } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
          }
        }, i * 10); // 10ms intervals
      }
    }, 15000);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});