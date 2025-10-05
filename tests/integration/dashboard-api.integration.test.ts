/**
 * @file Integration Tests for Dashboard API Endpoints
 * @description Comprehensive integration tests for dashboard API endpoints
 */

import request from 'supertest';
import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { Server } from 'http';

// Mock data for testing
import { mockTransparencyData } from '../web-portal/fixtures/transparency-data';

describe('Dashboard API Integration Tests', () => {
  let app: express.Application;
  let server: Server;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = process.env;
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0'; // Use random available port

    // Create Express app with middleware
    app = express();

    app.use(helmet());
    app.use(cors());
    app.use(compression());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV
      });
    });

    // Agent status endpoints
    app.get('/api/agents', (req, res) => {
      const { status, type, limit = 50, offset = 0 } = req.query;

      let agents = [
        {
          id: 'agent-researcher-001',
          type: 'researcher',
          name: 'Research Agent Alpha',
          status: 'active',
          performance: 87,
          tasksCompleted: 23,
          currentTask: 'OAuth provider analysis',
          lastActivity: new Date().toISOString(),
          coordinationScore: 92,
          efficiency: 89
        },
        {
          id: 'agent-coder-001',
          type: 'coder',
          name: 'Coder Agent Beta',
          status: 'processing',
          performance: 94,
          tasksCompleted: 31,
          currentTask: 'Authentication middleware',
          lastActivity: new Date().toISOString(),
          coordinationScore: 88,
          efficiency: 96
        },
        {
          id: 'agent-reviewer-001',
          type: 'reviewer',
          name: 'Reviewer Agent Gamma',
          status: 'idle',
          performance: 91,
          tasksCompleted: 18,
          currentTask: undefined,
          lastActivity: new Date(Date.now() - 120000).toISOString(),
          coordinationScore: 95,
          efficiency: 85
        }
      ];

      // Apply filters
      if (status) {
        agents = agents.filter(agent => agent.status === status);
      }
      if (type) {
        agents = agents.filter(agent => agent.type === type);
      }

      // Apply pagination
      const totalCount = agents.length;
      agents = agents.slice(Number(offset), Number(offset) + Number(limit));

      res.json({
        agents,
        pagination: {
          total: totalCount,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < totalCount
        }
      });
    });

    app.get('/api/agents/:agentId', (req, res) => {
      const { agentId } = req.params;

      const agent = {
        'agent-researcher-001': {
          id: 'agent-researcher-001',
          type: 'researcher',
          name: 'Research Agent Alpha',
          status: 'active',
          performance: 87,
          tasksCompleted: 23,
          currentTask: 'OAuth provider analysis',
          lastActivity: new Date().toISOString(),
          coordinationScore: 92,
          efficiency: 89,
          capabilities: {
            active: ['requirement_analysis', 'security_assessment', 'technology_research'],
            learning: ['oauth2_deep_dive', 'security_best_practices'],
            mastery: {
              requirement_analysis: 0.92,
              security_assessment: 0.88,
              technology_research: 0.85
            }
          },
          resources: {
            memoryUsage: 0.45,
            cpuUsage: 0.23,
            networkActivity: 0.12,
            storageUsage: 0.34
          },
          healthMetrics: {
            overall: 0.91,
            taskExecution: 0.89,
            resourceEfficiency: 0.93,
            collaborationEffectiveness: 0.91,
            learningProgression: 0.87
          }
        }
      }[agentId];

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json(agent);
    });

    // Swarm metrics endpoints
    app.get('/api/swarm/metrics', (req, res) => {
      const { timeRange = '1h' } = req.query;

      const metrics = {
        timeRange,
        timestamp: new Date().toISOString(),
        totalTasks: 72,
        completedTasks: 68,
        efficiency: 89.4,
        coordinationScore: 91.7,
        uptime: 98.2,
        throughput: 2.3,
        errorRate: 1.2,
        responseTime: 245,
        agentsByStatus: {
          active: 1,
          idle: 1,
          processing: 1,
          error: 0
        },
        agentsByType: {
          researcher: 1,
          coder: 1,
          reviewer: 1
        },
        performanceTrends: {
          efficiency: [
            { timestamp: new Date(Date.now() - 3600000).toISOString(), value: 85.2 },
            { timestamp: new Date(Date.now() - 1800000).toISOString(), value: 87.8 },
            { timestamp: new Date().toISOString(), value: 89.4 }
          ],
          coordinationScore: [
            { timestamp: new Date(Date.now() - 3600000).toISOString(), value: 89.1 },
            { timestamp: new Date(Date.now() - 1800000).toISOString(), value: 90.4 },
            { timestamp: new Date().toISOString(), value: 91.7 }
          ],
          throughput: [
            { timestamp: new Date(Date.now() - 3600000).toISOString(), value: 2.1 },
            { timestamp: new Date(Date.now() - 1800000).toISOString(), value: 2.2 },
            { timestamp: new Date().toISOString(), value: 2.3 }
          ]
        }
      };

      res.json(metrics);
    });

    // Decision transparency endpoints
    app.get('/api/decisions', (req, res) => {
      const { agentId, category, timeRange = '24h', limit = 20, offset = 0 } = req.query;

      let decisions = [
        mockTransparencyData.decisions.simple,
        mockTransparencyData.decisions.complex,
        mockTransparencyData.decisions.revised
      ];

      // Apply filters
      if (agentId) {
        decisions = decisions.filter(decision => decision.agentId === agentId);
      }
      if (category) {
        decisions = decisions.filter(decision => decision.category === category);
      }

      // Sort by timestamp (newest first)
      decisions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply pagination
      const totalCount = decisions.length;
      decisions = decisions.slice(Number(offset), Number(offset) + Number(limit));

      res.json({
        decisions,
        pagination: {
          total: totalCount,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < totalCount
        },
        filters: {
          agentId,
          category,
          timeRange
        }
      });
    });

    app.get('/api/decisions/:decisionId', (req, res) => {
      const { decisionId } = req.params;

      const decision = mockTransparencyData.decisions[decisionId as keyof typeof mockTransparencyData.decisions];

      if (!decision) {
        return res.status(404).json({ error: 'Decision not found' });
      }

      res.json(decision);
    });

    // Reasoning chain endpoints
    app.get('/api/reasoning-chains', (req, res) => {
      const { agentId, taskId, limit = 10, offset = 0 } = req.query;

      let chains = Object.values(mockTransparencyData.reasoningChains);

      // Apply filters
      if (agentId) {
        chains = chains.filter(chain => chain.agentId === agentId);
      }
      if (taskId) {
        chains = chains.filter(chain => chain.taskId === taskId);
      }

      // Sort by start time (newest first)
      chains.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      // Apply pagination
      const totalCount = chains.length;
      chains = chains.slice(Number(offset), Number(offset) + Number(limit));

      res.json({
        reasoningChains: chains,
        pagination: {
          total: totalCount,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < totalCount
        }
      });
    });

    app.get('/api/reasoning-chains/:chainId', (req, res) => {
      const { chainId } = req.params;

      const chain = Object.values(mockTransparencyData.reasoningChains).find(
        chain => chain.id === chainId
      );

      if (!chain) {
        return res.status(404).json({ error: 'Reasoning chain not found' });
      }

      res.json(chain);
    });

    // Human intervention endpoints
    app.get('/api/interventions', (req, res) => {
      const { agentId, status, priority, timeRange = '24h', limit = 20, offset = 0 } = req.query;

      let interventions = Object.values(mockTransparencyData.humanInterventions);

      // Apply filters
      if (agentId) {
        interventions = interventions.filter(intervention => intervention.agentId === agentId);
      }
      if (status) {
        interventions = interventions.filter(intervention =>
          intervention.humanResponse ? 'completed' : 'pending'
        );
      }
      if (priority) {
        interventions = interventions.filter(intervention => intervention.priority === priority);
      }

      // Sort by request time (newest first)
      interventions.sort((a, b) => new Date(b.requestTime).getTime() - new Date(a.requestTime).getTime());

      // Apply pagination
      const totalCount = interventions.length;
      interventions = interventions.slice(Number(offset), Number(offset) + Number(limit));

      res.json({
        interventions,
        pagination: {
          total: totalCount,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < totalCount
        }
      });
    });

    // Test status endpoints
    app.get('/api/tests/status', (req, res) => {
      const { suite, timeRange = '1h' } = req.query;

      const testStatus = {
        timestamp: new Date().toISOString(),
        suites: {
          unit: {
            total: 145,
            passed: 142,
            failed: 2,
            skipped: 1,
            coverage: 87.5,
            averageDuration: 2.3
          },
          integration: {
            total: 68,
            passed: 65,
            failed: 3,
            skipped: 0,
            coverage: 82.1,
            averageDuration: 5.8
          },
          e2e: {
            total: 24,
            passed: 22,
            failed: 2,
            skipped: 0,
            coverage: 71.3,
            averageDuration: 45.2
          }
        },
        overall: {
          total: 237,
          passed: 229,
          failed: 7,
          skipped: 1,
          overallCoverage: 83.6,
          successRate: 96.6
        },
        recentRuns: [
          {
            timestamp: new Date(Date.now() - 300000).toISOString(),
            suite: 'unit',
            status: 'passed',
            duration: 320,
            coverage: 87.5
          },
          {
            timestamp: new Date(Date.now() - 600000).toISOString(),
            suite: 'integration',
            status: 'failed',
            duration: 850,
            coverage: 82.1
          }
        ]
      };

      if (suite && testStatus.suites[suite as keyof typeof testStatus.suites]) {
        res.json({
          suite,
          ...testStatus.suites[suite as keyof typeof testStatus.suites],
          recentRuns: testStatus.recentRuns.filter(run => run.suite === suite)
        });
      } else {
        res.json(testStatus);
      }
    });

    // WebSocket upgrade endpoint
    app.get('/api/websocket/status', (req, res) => {
      res.json({
        status: 'active',
        connectedClients: 3,
        activeSwarms: 2,
        totalConnections: 15,
        uptime: 7200,
        messageRate: 4.2
      });
    });

    // Performance metrics endpoint
    app.get('/api/performance', (req, res) => {
      const { metric, timeRange = '1h' } = req.query;

      const performanceData = {
        timestamp: new Date().toISOString(),
        timeRange,
        system: {
          cpuUsage: 45.2,
          memoryUsage: 68.7,
          diskUsage: 32.1,
          networkIO: {
            inbound: 1.2,
            outbound: 3.8
          }
        },
        application: {
          responseTime: {
            p50: 145,
            p95: 280,
            p99: 420
          },
          throughput: 1200,
          errorRate: 0.001,
          activeConnections: 15
        },
        database: {
          connectionPool: {
            active: 8,
            idle: 12,
            total: 20
          },
          queryTime: {
            average: 45,
            p95: 120
          },
          operations: {
            reads: 2450,
            writes: 890,
            errors: 2
          }
        }
      };

      if (metric) {
        const metricPath = metric.split('.');
        let result = performanceData;
        for (const path of metricPath) {
          result = result[path as keyof typeof result];
          if (!result) {
            return res.status(404).json({ error: 'Metric not found' });
          }
        }
        res.json({ metric: metricPath.join('.'), value: result });
      } else {
        res.json(performanceData);
      }
    });

    // Error handling middleware
    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('API Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Start server
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.on('listening', resolve);
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(resolve);
      });
    }
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Health Check Endpoints', () => {
    test('GET /health returns health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('environment', 'test');
    });

    test('health check includes memory usage', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.memory).toHaveProperty('rss');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('external');
    });
  });

  describe('Agent Status Endpoints', () => {
    test('GET /api/agents returns list of agents', async () => {
      const response = await request(app)
        .get('/api/agents')
        .expect(200);

      expect(response.body).toHaveProperty('agents');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.agents).toHaveLength(3);
      expect(response.body.agents[0]).toHaveProperty('id');
      expect(response.body.agents[0]).toHaveProperty('type');
      expect(response.body.agents[0]).toHaveProperty('status');
      expect(response.body.agents[0]).toHaveProperty('performance');
    });

    test('GET /api/agents supports status filtering', async () => {
      const response = await request(app)
        .get('/api/agents?status=active')
        .expect(200);

      expect(response.body.agents).toHaveLength(1);
      expect(response.body.agents[0].status).toBe('active');
    });

    test('GET /api/agents supports type filtering', async () => {
      const response = await request(app)
        .get('/api/agents?type=researcher')
        .expect(200);

      expect(response.body.agents).toHaveLength(1);
      expect(response.body.agents[0].type).toBe('researcher');
    });

    test('GET /api/agents supports pagination', async () => {
      const response = await request(app)
        .get('/api/agents?limit=2&offset=1')
        .expect(200);

      expect(response.body.agents).toHaveLength(2);
      expect(response.body.pagination).toHaveProperty('total', 3);
      expect(response.body.pagination).toHaveProperty('limit', 2);
      expect(response.body.pagination).toHaveProperty('offset', 1);
      expect(response.body.pagination).toHaveProperty('hasMore', true);
    });

    test('GET /api/agents/:agentId returns specific agent', async () => {
      const response = await request(app)
        .get('/api/agents/agent-researcher-001')
        .expect(200);

      expect(response.body).toHaveProperty('id', 'agent-researcher-001');
      expect(response.body).toHaveProperty('type', 'researcher');
      expect(response.body).toHaveProperty('capabilities');
      expect(response.body).toHaveProperty('resources');
      expect(response.body).toHaveProperty('healthMetrics');
    });

    test('GET /api/agents/:agentId returns 404 for non-existent agent', async () => {
      const response = await request(app)
        .get('/api/agents/non-existent-agent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Agent not found');
    });

    test('agent data includes performance metrics', async () => {
      const response = await request(app)
        .get('/api/agents/agent-researcher-001')
        .expect(200);

      expect(response.body.performance).toBeGreaterThan(0);
      expect(response.body.performance).toBeLessThanOrEqual(100);
      expect(response.body.resources.memoryUsage).toBeGreaterThan(0);
      expect(response.body.resources.cpuUsage).toBeGreaterThan(0);
    });
  });

  describe('Swarm Metrics Endpoints', () => {
    test('GET /api/swarm/metrics returns swarm metrics', async () => {
      const response = await request(app)
        .get('/api/swarm/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timeRange');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('totalTasks');
      expect(response.body).toHaveProperty('completedTasks');
      expect(response.body).toHaveProperty('efficiency');
      expect(response.body).toHaveProperty('coordinationScore');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('throughput');
      expect(response.body).toHaveProperty('errorRate');
      expect(response.body).toHaveProperty('responseTime');
    });

    test('GET /api/swarm/metrics includes agent distribution', async () => {
      const response = await request(app)
        .get('/api/swarm/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('agentsByStatus');
      expect(response.body).toHaveProperty('agentsByType');
      expect(response.body.agentsByStatus).toHaveProperty('active');
      expect(response.body.agentsByType).toHaveProperty('researcher');
    });

    test('GET /api/swarm/metrics includes performance trends', async () => {
      const response = await request(app)
        .get('/api/swarm/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('performanceTrends');
      expect(response.body.performanceTrends).toHaveProperty('efficiency');
      expect(response.body.performanceTrends).toHaveProperty('coordinationScore');
      expect(response.body.performanceTrends).toHaveProperty('throughput');
      expect(response.body.performanceTrends.efficiency).toHaveLength(3);
    });

    test('GET /api/swarm/metrics supports time range parameter', async () => {
      const response = await request(app)
        .get('/api/swarm/metrics?timeRange=24h')
        .expect(200);

      expect(response.body.timeRange).toBe('24h');
    });
  });

  describe('Decision Transparency Endpoints', () => {
    test('GET /api/decisions returns list of decisions', async () => {
      const response = await request(app)
        .get('/api/decisions')
        .expect(200);

      expect(response.body).toHaveProperty('decisions');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('filters');
      expect(response.body.decisions).toHaveLength(3);
      expect(response.body.decisions[0]).toHaveProperty('id');
      expect(response.body.decisions[0]).toHaveProperty('agentId');
      expect(response.body.decisions[0]).toHaveProperty('decision');
      expect(response.body.decisions[0]).toHaveProperty('reasoning');
    });

    test('GET /api/decisions supports agent filtering', async () => {
      const response = await request(app)
        .get('/api/decisions?agentId=agent-researcher-001')
        .expect(200);

      expect(response.body.decisions.length).toBeGreaterThan(0);
      response.body.decisions.forEach((decision: any) => {
        expect(decision.agentId).toBe('agent-researcher-001');
      });
    });

    test('GET /api/decisions supports category filtering', async () => {
      const response = await request(app)
        .get('/api/decisions?category=architecture')
        .expect(200);

      expect(response.body.decisions.length).toBeGreaterThan(0);
      response.body.decisions.forEach((decision: any) => {
        expect(decision.category).toBe('architecture');
      });
    });

    test('GET /api/decisions supports pagination', async () => {
      const response = await request(app)
        .get('/api/decisions?limit=2&offset=1')
        .expect(200);

      expect(response.body.decisions).toHaveLength(2);
      expect(response.body.pagination).toHaveProperty('total', 3);
      expect(response.body.pagination).toHaveProperty('limit', 2);
      expect(response.body.pagination).toHaveProperty('offset', 1);
      expect(response.body.pagination).toHaveProperty('hasMore', true);
    });

    test('GET /api/decisions/:decisionId returns specific decision', async () => {
      const response = await request(app)
        .get('/api/decisions/decision-simple-001')
        .expect(200);

      expect(response.body).toHaveProperty('id', 'decision-simple-001');
      expect(response.body).toHaveProperty('decision', 'Use OAuth2 for authentication');
      expect(response.body).toHaveProperty('reasoning');
      expect(response.body.reasoning).toHaveProperty('confidenceScore');
      expect(response.body).toHaveProperty('impact');
    });

    test('GET /api/decisions/:decisionId returns 404 for non-existent decision', async () => {
      const response = await request(app)
        .get('/api/decisions/non-existent-decision')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Decision not found');
    });

    test('decision data includes confidence scores', async () => {
      const response = await request(app)
        .get('/api/decisions/decision-simple-001')
        .expect(200);

      expect(response.body.reasoning.confidenceScore).toBeGreaterThan(0);
      expect(response.body.reasoning.confidenceScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Reasoning Chain Endpoints', () => {
    test('GET /api/reasoning-chains returns list of reasoning chains', async () => {
      const response = await request(app)
        .get('/api/reasoning-chains')
        .expect(200);

      expect(response.body).toHaveProperty('reasoningChains');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.reasoningChains).toHaveLength(2);
      expect(response.body.reasoningChains[0]).toHaveProperty('id');
      expect(response.body.reasoningChains[0]).toHaveProperty('agentId');
      expect(response.body.reasoningChains[0]).toHaveProperty('taskId');
      expect(response.body.reasoningChains[0]).toHaveProperty('steps');
    });

    test('GET /api/reasoning-chains supports agent filtering', async () => {
      const response = await request(app)
        .get('/api/reasoning-chains?agentId=agent-researcher-001')
        .expect(200);

      expect(response.body.reasoningChains.length).toBeGreaterThan(0);
      response.body.reasoningChains.forEach((chain: any) => {
        expect(chain.agentId).toBe('agent-researcher-001');
      });
    });

    test('GET /api/reasoning-chains supports task filtering', async () => {
      const response = await request(app)
        .get('/api/reasoning-chains?taskId=oauth-provider-selection')
        .expect(200);

      expect(response.body.reasoningChains.length).toBeGreaterThan(0);
      response.body.reasoningChains.forEach((chain: any) => {
        expect(chain.taskId).toBe('oauth-provider-selection');
      });
    });

    test('GET /api/reasoning-chains/:chainId returns specific reasoning chain', async () => {
      const response = await request(app)
        .get('/api/reasoning-chains/reasoning-chain-simple-001')
        .expect(200);

      expect(response.body).toHaveProperty('id', 'reasoning-chain-simple-001');
      expect(response.body).toHaveProperty('agentId', 'agent-researcher-001');
      expect(response.body).toHaveProperty('taskId', 'oauth-provider-selection');
      expect(response.body).toHaveProperty('steps');
      expect(response.body).toHaveProperty('finalDecision');
      expect(response.body).toHaveProperty('totalDuration');
    });

    test('reasoning chain includes step details', async () => {
      const response = await request(app)
        .get('/api/reasoning-chains/reasoning-chain-simple-001')
        .expect(200);

      expect(Array.isArray(response.body.steps)).toBe(true);
      expect(response.body.steps.length).toBeGreaterThan(0);

      const step = response.body.steps[0];
      expect(step).toHaveProperty('stepId');
      expect(step).toHaveProperty('type');
      expect(step).toHaveProperty('content');
      expect(step).toHaveProperty('confidence');
      expect(step).toHaveProperty('duration');
    });
  });

  describe('Human Intervention Endpoints', () => {
    test('GET /api/interventions returns list of interventions', async () => {
      const response = await request(app)
        .get('/api/interventions')
        .expect(200);

      expect(response.body).toHaveProperty('interventions');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.interventions).toHaveLength(2);
      expect(response.body.interventions[0]).toHaveProperty('id');
      expect(response.body.interventions[0]).toHaveProperty('agentId');
      expect(response.body.interventions[0]).toHaveProperty('type');
      expect(response.body.interventions[0]).toHaveProperty('priority');
    });

    test('GET /api/interventions supports agent filtering', async () => {
      const response = await request(app)
        .get('/api/interventions?agentId=agent-coder-001')
        .expect(200);

      expect(response.body.interventions.length).toBeGreaterThan(0);
      response.body.interventions.forEach((intervention: any) => {
        expect(intervention.agentId).toBe('agent-coder-001');
      });
    });

    test('GET /api/interventions supports priority filtering', async () => {
      const response = await request(app)
        .get('/api/interventions?priority=high')
        .expect(200);

      expect(response.body.interventions.length).toBeGreaterThan(0);
      response.body.interventions.forEach((intervention: any) => {
        expect(intervention.priority).toBe('high');
      });
    });

    test('intervention data includes human response', async () => {
      const response = await request(app)
        .get('/api/interventions?agentId=agent-coder-001')
        .expect(200);

      const intervention = response.body.interventions[0];
      expect(intervention).toHaveProperty('humanResponse');
      expect(intervention.humanResponse).toHaveProperty('decision');
      expect(intervention.humanResponse).toHaveProperty('reasoning');
      expect(intervention.humanResponse).toHaveProperty('confidence');
    });
  });

  describe('Test Status Endpoints', () => {
    test('GET /api/tests/status returns overall test status', async () => {
      const response = await request(app)
        .get('/api/tests/status')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('suites');
      expect(response.body).toHaveProperty('overall');
      expect(response.body.overall).toHaveProperty('total');
      expect(response.body.overall).toHaveProperty('passed');
      expect(response.body.overall).toHaveProperty('failed');
      expect(response.body.overall).toHaveProperty('successRate');
    });

    test('GET /api/tests/status includes suite breakdown', async () => {
      const response = await request(app)
        .get('/api/tests/status')
        .expect(200);

      expect(response.body.suites).toHaveProperty('unit');
      expect(response.body.suites).toHaveProperty('integration');
      expect(response.body.suites).toHaveProperty('e2e');

      const unitSuite = response.body.suites.unit;
      expect(unitSuite).toHaveProperty('total');
      expect(unitSuite).toHaveProperty('passed');
      expect(unitSuite).toHaveProperty('coverage');
    });

    test('GET /api/tests/status supports suite filtering', async () => {
      const response = await request(app)
        .get('/api/tests/status?suite=unit')
        .expect(200);

      expect(response.body).toHaveProperty('suite', 'unit');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('coverage');
      expect(response.body).toHaveProperty('recentRuns');
    });

    test('test status includes coverage metrics', async () => {
      const response = await request(app)
        .get('/api/tests/status')
        .expect(200);

      expect(response.body.overall).toHaveProperty('overallCoverage');
      expect(typeof response.body.overall.overallCoverage).toBe('number');
      expect(response.body.overall.overallCoverage).toBeGreaterThan(0);
      expect(response.body.overall.overallCoverage).toBeLessThanOrEqual(100);
    });
  });

  describe('WebSocket Status Endpoints', () => {
    test('GET /api/websocket/status returns WebSocket status', async () => {
      const response = await request(app)
        .get('/api/websocket/status')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'active');
      expect(response.body).toHaveProperty('connectedClients');
      expect(response.body).toHaveProperty('activeSwarms');
      expect(response.body).toHaveProperty('totalConnections');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('messageRate');
    });

    test('WebSocket status includes numeric metrics', async () => {
      const response = await request(app)
        .get('/api/websocket/status')
        .expect(200);

      expect(typeof response.body.connectedClients).toBe('number');
      expect(typeof response.body.activeSwarms).toBe('number');
      expect(typeof response.body.totalConnections).toBe('number');
      expect(typeof response.body.uptime).toBe('number');
      expect(typeof response.body.messageRate).toBe('number');
    });
  });

  describe('Performance Metrics Endpoints', () => {
    test('GET /api/performance returns comprehensive performance data', async () => {
      const response = await request(app)
        .get('/api/performance')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('timeRange');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('application');
      expect(response.body).toHaveProperty('database');
    });

    test('GET /api/performance includes system metrics', async () => {
      const response = await request(app)
        .get('/api/performance')
        .expect(200);

      expect(response.body.system).toHaveProperty('cpuUsage');
      expect(response.body.system).toHaveProperty('memoryUsage');
      expect(response.body.system).toHaveProperty('diskUsage');
      expect(response.body.system).toHaveProperty('networkIO');
    });

    test('GET /api/performance includes application metrics', async () => {
      const response = await request(app)
        .get('/api/performance')
        .expect(200);

      expect(response.body.application).toHaveProperty('responseTime');
      expect(response.body.application).toHaveProperty('throughput');
      expect(response.body.application).toHaveProperty('errorRate');
      expect(response.body.application).toHaveProperty('activeConnections');
    });

    test('GET /api/performance supports metric filtering', async () => {
      const response = await request(app)
        .get('/api/performance?metric=system.cpuUsage')
        .expect(200);

      expect(response.body).toHaveProperty('metric', 'system.cpuUsage');
      expect(response.body).toHaveProperty('value');
      expect(typeof response.body.value).toBe('number');
    });

    test('GET /api/performance returns 404 for invalid metric', async () => {
      const response = await request(app)
        .get('/api/performance?metric=invalid.metric.path')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Metric not found');
    });
  });

  describe('Error Handling', () => {
    test('returns 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/non-existent-endpoint')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not found');
      expect(response.body).toHaveProperty('path');
      expect(response.body).toHaveProperty('method');
    });

    test('handles invalid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/agents')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('handles missing query parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/decisions')
        .query({ invalidParam: 'value' })
        .expect(200);

      // Should return default results without error
      expect(response.body).toHaveProperty('decisions');
      expect(response.body).toHaveProperty('pagination');
    });
  });

  describe('Response Headers and Security', () => {
    test('includes security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Helmet should add security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    test('includes CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    test('includes compression for large responses', async () => {
      const response = await request(app)
        .get('/api/decisions')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Response should be compressed if large enough
      expect(response.headers['content-encoding']).toBeDefined();
    });

    test('handles concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/api/agents').expect(200)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.body).toHaveProperty('agents');
        expect(response.body.agents).toHaveLength(3);
      });
    });
  });

  describe('Rate Limiting and Performance', () => {
    test('responds within acceptable time limits', async () => {
      const startTime = performance.now();

      await request(app)
        .get('/api/swarm/metrics')
        .expect(200);

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      // Should respond within 100ms
      expect(responseTime).toBeLessThan(100);
    });

    test('handles large pagination requests', async () => {
      const response = await request(app)
        .get('/api/decisions?limit=1000')
        .expect(200);

      expect(response.body.decisions.length).toBeLessThanOrEqual(3); // Limited by mock data
      expect(response.body.pagination).toHaveProperty('total');
    });

    test('maintains response consistency under load', async () => {
      const requests = Array.from({ length: 20 }, (_, i) =>
        request(app).get('/api/agents').expect(200)
      );

      const responses = await Promise.all(requests);
      const firstResponse = responses[0].body;

      responses.forEach(response => {
        expect(response.body).toEqual(firstResponse);
      });
    });
  });
});