/**
 * @file Test Server for Web Portal E2E Testing
 * @description Mock web server for testing portal functionality
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';

export class WebPortalTestServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private port: number = 3000;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: true,
      credentials: true
    }));
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../fixtures/static')));
  }

  private setupRoutes() {
    // Authentication routes
    this.app.post('/api/auth/login', (req, res) => {
      const { username, password } = req.body;
      if (username === 'test-admin' && password === 'test-password') {
        res.json({
          success: true,
          token: 'test-jwt-token',
          user: {
            id: 'test-user-1',
            username: 'test-admin',
            role: 'admin',
            permissions: ['read', 'write', 'admin']
          }
        });
      } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    });

    this.app.post('/api/auth/logout', (req, res) => {
      res.json({ success: true });
    });

    // Dashboard routes
    this.app.get('/api/dashboard/stats', (req, res) => {
      res.json({
        swarms: {
          active: 2,
          total: 3,
          health: 'good'
        },
        agents: {
          active: 5,
          idle: 2,
          busy: 3,
          total: 10
        },
        tasks: {
          pending: 8,
          running: 4,
          completed: 25,
          failed: 1
        },
        system: {
          uptime: 86400000,
          memory: '2.1GB',
          cpu: '45%'
        }
      });
    });

    // Swarm management routes
    this.app.get('/api/swarms', (req, res) => {
      res.json([
        {
          id: 'test-swarm-1',
          name: 'Development Swarm',
          topology: 'hierarchical',
          status: 'active',
          agents: [
            { id: 'agent-1', type: 'researcher', status: 'active' },
            { id: 'agent-2', type: 'coder', status: 'idle' },
            { id: 'agent-3', type: 'tester', status: 'busy' }
          ],
          metrics: {
            tasksCompleted: 15,
            avgResponseTime: 1.2,
            successRate: 0.94
          }
        },
        {
          id: 'test-swarm-2',
          name: 'Analysis Swarm',
          topology: 'mesh',
          status: 'idle',
          agents: [
            { id: 'agent-4', type: 'analyzer', status: 'idle' },
            { id: 'agent-5', type: 'reviewer', status: 'idle' }
          ],
          metrics: {
            tasksCompleted: 8,
            avgResponseTime: 2.1,
            successRate: 0.88
          }
        }
      ]);
    });

    this.app.post('/api/swarms', (req, res) => {
      const { name, topology, agentTypes } = req.body;
      const newSwarm = {
        id: `swarm-${Date.now()}`,
        name,
        topology,
        status: 'initializing',
        agents: [],
        createdAt: new Date().toISOString()
      };
      res.json(newSwarm);
    });

    // Agent management routes
    this.app.get('/api/agents', (req, res) => {
      const { swarmId } = req.query;
      let agents = [
        {
          id: 'agent-1',
          type: 'researcher',
          status: 'active',
          swarmId: 'test-swarm-1',
          capabilities: ['research', 'analysis'],
          currentTask: 'task-1',
          metrics: {
            tasksCompleted: 5,
            avgExecutionTime: 45.2,
            successRate: 0.96
          }
        },
        {
          id: 'agent-2',
          type: 'coder',
          status: 'idle',
          swarmId: 'test-swarm-1',
          capabilities: ['coding', 'implementation'],
          currentTask: null,
          metrics: {
            tasksCompleted: 8,
            avgExecutionTime: 32.1,
            successRate: 0.92
          }
        },
        {
          id: 'agent-3',
          type: 'tester',
          status: 'busy',
          swarmId: 'test-swarm-1',
          capabilities: ['testing', 'validation'],
          currentTask: 'task-3',
          metrics: {
            tasksCompleted: 12,
            avgExecutionTime: 28.5,
            successRate: 0.89
          }
        }
      ];

      if (swarmId) {
        agents = agents.filter(agent => agent.swarmId === swarmId);
      }

      res.json(agents);
    });

    // Task management routes
    this.app.get('/api/tasks', (req, res) => {
      res.json([
        {
          id: 'task-1',
          description: 'Research API patterns for authentication service',
          status: 'in-progress',
          agentId: 'agent-1',
          swarmId: 'test-swarm-1',
          priority: 'high',
          progress: 65,
          startedAt: new Date(Date.now() - 1800000).toISOString(),
          estimatedCompletion: new Date(Date.now() + 600000).toISOString()
        },
        {
          id: 'task-2',
          description: 'Implement JWT authentication middleware',
          status: 'pending',
          agentId: 'agent-2',
          swarmId: 'test-swarm-1',
          priority: 'high',
          progress: 0,
          dependencies: ['task-1']
        },
        {
          id: 'task-3',
          description: 'Write integration tests for auth flow',
          status: 'in-progress',
          agentId: 'agent-3',
          swarmId: 'test-swarm-1',
          priority: 'medium',
          progress: 30,
          startedAt: new Date(Date.now() - 900000).toISOString()
        }
      ]);
    });

    // Human intervention routes
    this.app.get('/api/interventions', (req, res) => {
      res.json([
        {
          id: 'intervention-1',
          type: 'decision-required',
          agentId: 'agent-1',
          taskId: 'task-1',
          question: 'Should we use OAuth 2.0 or custom JWT implementation?',
          options: [
            { id: 'oauth2', label: 'OAuth 2.0', pros: ['Standard', 'Secure'], cons: ['Complex setup'] },
            { id: 'jwt', label: 'Custom JWT', pros: ['Simple', 'Lightweight'], cons: ['Custom implementation'] }
          ],
          priority: 'high',
          createdAt: new Date(Date.now() - 300000).toISOString(),
          status: 'pending'
        }
      ]);
    });

    this.app.post('/api/interventions/:id/respond', (req, res) => {
      const { id } = req.params;
      const { decision, reason } = req.body;

      // Simulate processing the intervention
      setTimeout(() => {
        this.io.emit('intervention-resolved', {
          id,
          decision,
          reason,
          resolvedAt: new Date().toISOString()
        });
      }, 1000);

      res.json({ success: true, id, status: 'processing' });
    });

    // MCP integration routes
    this.app.get('/api/mcp/tools', (req, res) => {
      res.json([
        {
          name: 'swarm_init',
          description: 'Initialize a new swarm with specified topology',
          parameters: {
            topology: { type: 'string', enum: ['mesh', 'hierarchical', 'ring', 'star'] },
            maxAgents: { type: 'number', default: 5 }
          },
          status: 'available'
        },
        {
          name: 'agent_spawn',
          description: 'Spawn a new agent in the swarm',
          parameters: {
            type: { type: 'string', enum: ['researcher', 'coder', 'tester', 'reviewer'] },
            capabilities: { type: 'array' }
          },
          status: 'available'
        },
        {
          name: 'task_orchestrate',
          description: 'Orchestrate a task across the swarm',
          parameters: {
            task: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
          },
          status: 'available'
        }
      ]);
    });

    this.app.post('/api/mcp/tools/:toolName', (req, res) => {
      const { toolName } = req.params;
      const { parameters } = req.body;

      // Simulate tool execution
      const response = {
        toolName,
        parameters,
        result: `Tool ${toolName} executed successfully`,
        executionTime: Math.random() * 1000 + 500,
        status: 'success',
        timestamp: new Date().toISOString()
      };

      res.json(response);
    });

    // Transparency and logging routes
    this.app.get('/api/transparency/audit-log', (req, res) => {
      const { agentId, taskId, startDate, endDate } = req.query;

      res.json([
        {
          id: 'log-1',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          agentId: 'agent-1',
          taskId: 'task-1',
          action: 'task-started',
          details: {
            task: 'Research API patterns',
            reasoning: 'High priority authentication requirement',
            context: { previousTasks: [], dependencies: [] }
          }
        },
        {
          id: 'log-2',
          timestamp: new Date(Date.now() - 1500000).toISOString(),
          agentId: 'agent-1',
          taskId: 'task-1',
          action: 'research-progress',
          details: {
            findings: ['OAuth 2.0 standard', 'JWT lightweight option'],
            progress: 45,
            nextSteps: ['Compare security implications', 'Evaluate implementation complexity']
          }
        }
      ]);
    });

    // Test data management routes
    this.app.post('/api/test-data/:type', (req, res) => {
      const { type } = req.params;
      console.log(`Creating test data for type: ${type}`);
      res.json({ success: true, created: req.body });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Serve the main application
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../fixtures/static/index.html'));
    });
  }

  private setupWebSocket() {
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: true,
        credentials: true
      }
    });

    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Send initial data
      socket.emit('dashboard-stats', {
        agents: 10,
        swarms: 2,
        activeTasks: 4
      });

      // Simulate real-time updates
      const intervals = [];

      // Agent status updates
      intervals.push(setInterval(() => {
        socket.emit('agent-status-update', {
          agentId: `agent-${Math.floor(Math.random() * 5) + 1}`,
          status: ['active', 'idle', 'busy'][Math.floor(Math.random() * 3)],
          timestamp: new Date().toISOString()
        });
      }, 2000));

      // Task progress updates
      intervals.push(setInterval(() => {
        socket.emit('task-progress-update', {
          taskId: `task-${Math.floor(Math.random() * 3) + 1}`,
          progress: Math.floor(Math.random() * 100),
          timestamp: new Date().toISOString()
        });
      }, 3000));

      // Agent messaging simulation
      intervals.push(setInterval(() => {
        const messages = [
          'Starting research phase...',
          'Found relevant documentation',
          'Analyzing security implications',
          'Requesting human input on approach',
          'Implementing solution...',
          'Running validation tests',
          'Task completed successfully'
        ];

        socket.emit('agent-message', {
          agentId: `agent-${Math.floor(Math.random() * 3) + 1}`,
          message: messages[Math.floor(Math.random() * messages.length)],
          type: 'info',
          timestamp: new Date().toISOString()
        });
      }, 4000));

      // Handle client events
      socket.on('subscribe-to-swarm', (swarmId) => {
        socket.join(`swarm-${swarmId}`);
        socket.emit('subscribed', { swarmId });
      });

      socket.on('subscribe-to-agent', (agentId) => {
        socket.join(`agent-${agentId}`);
        socket.emit('subscribed', { agentId });
      });

      socket.on('human-intervention-response', (data) => {
        console.log('Human intervention response:', data);
        socket.broadcast.emit('intervention-resolved', data);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        intervals.forEach(interval => clearInterval(interval));
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.server.listen(this.port, (error: any) => {
        if (error) {
          reject(error);
        } else {
          console.log(`🌐 Web Portal Test Server running on http://localhost:${this.port}`);
          resolve();
        }
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 Web Portal Test Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}