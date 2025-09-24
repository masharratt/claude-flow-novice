/**
 * @file Mock Services for Testing
 * @description Mock external services and dependencies
 */

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';

export class MockServices {
  private app: express.Application;
  private server: any;
  private port: number = 4000;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: true,
      credentials: true
    }));
    this.app.use(express.json());

    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`Mock Service: ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'mock-services',
        timestamp: new Date().toISOString()
      });
    });

    // Shutdown endpoint
    this.app.post('/api/shutdown', (req, res) => {
      res.json({ success: true, message: 'Shutting down mock services' });
      setTimeout(() => {
        this.stop();
      }, 1000);
    });

    // Test database endpoints
    this.app.post('/api/test-db/reset', (req, res) => {
      console.log('Mock: Resetting test database');
      res.json({ success: true, message: 'Test database reset' });
    });

    this.app.get('/api/test-db/status', (req, res) => {
      res.json({
        status: 'healthy',
        collections: {
          users: 1,
          swarms: 2,
          agents: 3,
          tasks: 3,
          interventions: 1,
          audit_logs: 2
        }
      });
    });

    // Mock external API endpoints
    this.app.post('/api/external/validate-token', (req, res) => {
      const { token } = req.body;

      if (token === 'test-jwt-token') {
        res.json({
          valid: true,
          user: {
            id: 'test-user-1',
            username: 'test-admin',
            role: 'admin'
          }
        });
      } else {
        res.status(401).json({
          valid: false,
          error: 'Invalid token'
        });
      }
    });

    // Mock MCP service endpoints
    this.app.post('/api/mcp/execute', (req, res) => {
      const { toolName, parameters } = req.body;

      // Simulate execution delay
      setTimeout(() => {
        res.json({
          success: true,
          toolName,
          parameters,
          result: `Mock execution of ${toolName}`,
          executionTime: Math.random() * 1000 + 500,
          timestamp: new Date().toISOString()
        });
      }, Math.random() * 2000 + 500);
    });

    // Mock agent coordination endpoints
    this.app.post('/api/coordination/status', (req, res) => {
      res.json({
        coordinator: 'active',
        agents: {
          active: 3,
          idle: 2,
          busy: 1
        },
        swarms: {
          active: 2,
          total: 3
        },
        lastUpdate: new Date().toISOString()
      });
    });

    this.app.post('/api/coordination/task', (req, res) => {
      const { task, priority } = req.body;

      res.json({
        taskId: `mock-task-${Date.now()}`,
        status: 'queued',
        assignedAgent: 'mock-agent-1',
        estimatedCompletion: new Date(Date.now() + 60000).toISOString()
      });
    });

    // Mock real-time event simulation
    this.app.post('/api/simulate/events', (req, res) => {
      const { eventType, count = 1 } = req.body;

      console.log(`Mock: Simulating ${count} events of type ${eventType}`);

      // This would trigger WebSocket events in a real implementation
      res.json({
        success: true,
        eventsSimulated: count,
        eventType
      });
    });

    // Mock error scenarios
    this.app.post('/api/simulate/error', (req, res) => {
      const { errorType } = req.body;

      switch (errorType) {
        case 'timeout':
          // Don't respond - simulate timeout
          return;

        case 'server-error':
          res.status(500).json({
            error: 'Simulated server error',
            code: 'MOCK_ERROR'
          });
          break;

        case 'network-error':
          res.status(503).json({
            error: 'Service unavailable',
            code: 'NETWORK_ERROR'
          });
          break;

        default:
          res.status(400).json({
            error: 'Unknown error type',
            code: 'UNKNOWN_ERROR'
          });
      }
    });

    // Mock webhook endpoints
    this.app.post('/api/webhooks/agent-update', (req, res) => {
      const { agentId, status, message } = req.body;

      console.log(`Mock Webhook: Agent ${agentId} status: ${status}`);

      res.json({
        received: true,
        agentId,
        status,
        processedAt: new Date().toISOString()
      });
    });

    this.app.post('/api/webhooks/task-update', (req, res) => {
      const { taskId, progress, status } = req.body;

      console.log(`Mock Webhook: Task ${taskId} progress: ${progress}%`);

      res.json({
        received: true,
        taskId,
        progress,
        status,
        processedAt: new Date().toISOString()
      });
    });

    // Mock analytics endpoints
    this.app.get('/api/analytics/performance', (req, res) => {
      res.json({
        period: '24h',
        metrics: {
          avgResponseTime: 245,
          throughput: 1250,
          errorRate: 0.02,
          systemLoad: 0.65
        },
        trends: {
          responseTime: 'stable',
          throughput: 'increasing',
          errorRate: 'decreasing'
        }
      });
    });

    this.app.get('/api/analytics/usage', (req, res) => {
      res.json({
        period: '24h',
        usage: {
          totalRequests: 15420,
          uniqueUsers: 23,
          peakHour: '14:00',
          avgSessionDuration: 1800
        }
      });
    });

    // Mock configuration endpoints
    this.app.get('/api/config/features', (req, res) => {
      res.json({
        features: {
          realTimeUpdates: true,
          humanIntervention: true,
          mcpIntegration: true,
          transparencyLogging: true,
          performanceMonitoring: true
        }
      });
    });

    this.app.post('/api/config/features', (req, res) => {
      const { features } = req.body;

      console.log('Mock: Updating feature configuration', features);

      res.json({
        success: true,
        updatedFeatures: features,
        appliedAt: new Date().toISOString()
      });
    });

    // Mock stress test endpoints
    this.app.post('/api/stress-test/start', (req, res) => {
      const { duration = 30, intensity = 'medium' } = req.body;

      console.log(`Mock: Starting stress test - Duration: ${duration}s, Intensity: ${intensity}`);

      res.json({
        testId: `stress-test-${Date.now()}`,
        status: 'running',
        startTime: new Date().toISOString(),
        estimatedEndTime: new Date(Date.now() + duration * 1000).toISOString()
      });
    });

    this.app.get('/api/stress-test/:testId/status', (req, res) => {
      const { testId } = req.params;

      res.json({
        testId,
        status: 'completed',
        results: {
          totalRequests: 10000,
          successRate: 0.98,
          avgResponseTime: 120,
          peakResponseTime: 450,
          errorsEncountered: 200
        }
      });
    });

    // Default 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Mock service endpoint not found',
        path: req.path,
        method: req.method
      });
    });

    // Error handler
    this.app.use((error: any, req: any, res: any, next: any) => {
      console.error('Mock Service Error:', error);
      res.status(500).json({
        error: 'Mock service internal error',
        message: error.message
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (error: any) => {
        if (error) {
          reject(error);
        } else {
          console.log(`🔧 Mock Services running on http://localhost:${this.port}`);
          process.env.MOCK_SERVICES_PID = process.pid.toString();
          resolve();
        }
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 Mock Services stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Simulate real-time events for testing
   */
  public simulateEvents(eventType: string, count: number = 1): void {
    console.log(`Simulating ${count} ${eventType} events`);

    // In a real implementation, this would trigger WebSocket events
    // For now, just log the simulation
  }

  /**
   * Get service status
   */
  public getStatus(): any {
    return {
      status: 'running',
      port: this.port,
      uptime: process.uptime(),
      pid: process.pid
    };
  }

  /**
   * Simulate network conditions
   */
  public simulateNetworkConditions(condition: 'slow' | 'intermittent' | 'timeout'): void {
    console.log(`Simulating network condition: ${condition}`);

    // Add middleware for network simulation
    this.app.use((req, res, next) => {
      switch (condition) {
        case 'slow':
          setTimeout(next, Math.random() * 3000 + 1000);
          break;

        case 'intermittent':
          if (Math.random() > 0.7) {
            return res.status(503).json({ error: 'Service intermittently unavailable' });
          }
          next();
          break;

        case 'timeout':
          // Don't call next() - simulates timeout
          return;

        default:
          next();
      }
    });
  }
}