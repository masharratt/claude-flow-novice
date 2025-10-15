/**
 * Collaboration Dashboard Integration for Cross-Agent Monitoring
 * Phase 4: System Architect Component - Real-time Dashboard Integration
 * 
 * This module provides the dashboard integration layer for the collaboration tracking
 * and analytics system, exposing real-time metrics and insights via REST API and WebSocket.
 */

const express = require('express');
const { Server } = require('ws');
const http = require('http');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const CrossAgentCollaborationTracker = require('./collaboration-tracking');
const CollaborationAnalyticsEngine = require('./collaboration-analytics');

class CollaborationDashboard {
  constructor(port = 3001, redisConfig = {}) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new Server({ server: this.server });
    
    // Initialize collaboration components
    this.tracker = new CrossAgentCollaborationTracker(redisConfig);
    this.analytics = new CollaborationAnalyticsEngine(this.tracker, redisConfig);
    
    // Dashboard state
    this.connectedClients = new Set();
    this.dashboardCache = new Map();
    this.realtimeUpdates = true;
    
    this.initializeDashboard();
  }

  /**
   * Initialize the dashboard server and middleware
   */
  async initializeDashboard() {
    try {
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();
      this.setupEventHandlers();
      
      // Start server
      this.server.listen(this.port, () => {
        console.log(`Collaboration Dashboard running on port ${this.port}`);
      });

      // Initialize analytics
      await this.analytics.performComprehensiveAnalysis();
      
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: process.env.DASHBOARD_ORIGIN || 'http://localhost:3000',
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    const router = express.Router();

    // Health check
    router.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // Dashboard overview
    router.get('/overview', async (req, res) => {
      try {
        const overview = await this.getDashboardOverview();
        res.json(overview);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Real-time metrics
    router.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.tracker.getCollaborationMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Analytics data
    router.get('/analytics', async (req, res) => {
      try {
        const analytics = await this.analytics.getAnalysis();
        res.json(analytics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Agent details
    router.get('/agents/:agentId', async (req, res) => {
      try {
        const agentDetails = await this.getAgentDetails(req.params.agentId);
        res.json(agentDetails);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Collaboration history
    router.get('/collaborations', async (req, res) => {
      try {
        const { limit = 50, offset = 0, status = 'all' } = req.query;
        const collaborations = await this.getCollaborationHistory(limit, offset, status);
        res.json(collaborations);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Team performance
    router.get('/teams', async (req, res) => {
      try {
        const teamPerformance = await this.getTeamPerformance();
        res.json(teamPerformance);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Predictions and insights
    router.get('/predictions', async (req, res) => {
      try {
        const predictions = await this.analytics.generatePredictiveInsights();
        res.json(predictions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Recommendations
    router.get('/recommendations', async (req, res) => {
      try {
        const recommendations = await this.analytics.generateOptimizationRecommendations();
        res.json(recommendations);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Performance trends
    router.get('/trends', async (req, res) => {
      try {
        const { timeframe = '24h' } = req.query;
        const trends = await this.getPerformanceTrends(timeframe);
        res.json(trends);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Export data
    router.get('/export/:format', async (req, res) => {
      try {
        const { format } = req.params;
        const data = await this.exportDashboardData(format);
        
        if (format === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename=collaboration-data.json');
          res.json(data);
        } else if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename=collaboration-data.csv');
          res.send(data);
        } else {
          res.status(400).json({ error: 'Unsupported format' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Register new agent
    router.post('/agents', async (req, res) => {
      try {
        const agentConfig = req.body;
        const agent = await this.tracker.registerAgent(agentConfig.id, agentConfig);
        res.json(agent);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Start new collaboration
    router.post('/collaborations', async (req, res) => {
      try {
        const collaborationData = req.body;
        const collaborationId = await this.tracker.trackCollaboration(collaborationData);
        res.json({ collaborationId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Track interaction
    router.post('/interactions', async (req, res) => {
      try {
        const interactionData = req.body;
        const interaction = await this.tracker.trackInteraction(interactionData);
        res.json(interaction);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.use('/api/dashboard', router);

    // Serve static dashboard files (if any)
    this.app.use('/dashboard', express.static('public/dashboard'));
  }

  /**
   * Setup WebSocket for real-time updates
   */
  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('Dashboard client connected');
      this.connectedClients.add(ws);

      // Send initial data
      this.sendInitialData(ws);

      // Handle client messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({ error: error.message }));
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        console.log('Dashboard client disconnected');
        this.connectedClients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });
    });
  }

  /**
   * Setup event handlers for real-time updates
   */
  setupEventHandlers() {
    // Collaboration events
    this.tracker.on('collaborationInitiated', (collaboration) => {
      this.broadcastUpdate({
        type: 'collaboration_initiated',
        data: collaboration,
        timestamp: new Date().toISOString()
      });
    });

    this.tracker.on('collaborationCompleted', (collaboration) => {
      this.broadcastUpdate({
        type: 'collaboration_completed',
        data: collaboration,
        timestamp: new Date().toISOString()
      });
    });

    this.tracker.on('interactionTracked', (interaction) => {
      this.broadcastUpdate({
        type: 'interaction_tracked',
        data: interaction,
        timestamp: new Date().toISOString()
      });
    });

    // Analytics events
    this.analytics.on('comprehensiveAnalysis', (analysis) => {
      this.broadcastUpdate({
        type: 'analytics_updated',
        data: analysis,
        timestamp: new Date().toISOString()
      });
    });

    // Periodic updates
    setInterval(() => {
      if (this.realtimeUpdates) {
        this.broadcastMetricsUpdate();
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Get comprehensive dashboard overview
   */
  async getDashboardOverview() {
    const metrics = await this.tracker.getCollaborationMetrics();
    const analytics = await this.analytics.getAnalysis();
    
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalAgents: metrics.overview.totalAgents,
        activeCollaborations: metrics.overview.activeCollaborations,
        totalInteractions: metrics.overview.totalInteractions,
        successRate: metrics.performance.successRate,
        averageResponseTime: metrics.performance.averageResponseTime
      },
      performance: {
        collaborationVelocity: analytics.collaborationEfficiency?.overall?.collaborationVelocity || 0,
        resourceUtilization: analytics.collaborationEfficiency?.overall?.resourceUtilization || 0,
        consensusRate: metrics.performance.consensusRate
      },
      alerts: await this.getActiveAlerts(),
      trends: await this.getRecentTrends()
    };
  }

  /**
   * Get detailed agent information
   */
  async getAgentDetails(agentId) {
    const metrics = await this.tracker.getCollaborationMetrics();
    const agent = metrics.agents[agentId];
    
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return {
      ...agent,
      recentCollaborations: await this.getAgentRecentCollaborations(agentId),
      performanceTrends: await this.getAgentPerformanceTrends(agentId),
      collaborationPatterns: await this.getAgentCollaborationPatterns(agentId)
    };
  }

  /**
   * Get collaboration history with pagination
   */
  async getCollaborationHistory(limit, offset, status) {
    // Implementation would fetch from Redis with pagination
    return {
      collaborations: [],
      total: 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
  }

  /**
   * Get team performance metrics
   */
  async getTeamPerformance() {
    const analytics = await this.analytics.getAnalysis();
    return {
      effectiveTeams: analytics.teamDynamics?.teamFormation || [],
      performanceMetrics: analytics.collaborationEfficiency?.byAgentType || {},
      communicationPatterns: analytics.communicationPatterns || {}
    };
  }

  /**
   * Get performance trends for specified timeframe
   */
  async getPerformanceTrends(timeframe) {
    const timeframes = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    const windowMs = timeframes[timeframe] || timeframes['24h'];
    const now = Date.now();
    const windowStart = now - windowMs;

    return {
      timeframe,
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(now).toISOString(),
      metrics: {
        collaborationRate: await this.getCollaborationRateTrend(windowStart, now),
        successRateTrend: await this.getSuccessRateTrend(windowStart, now),
        responseTimeTrend: await this.getResponseTimeTrend(windowStart, now),
        agentActivityTrend: await this.getAgentActivityTrend(windowStart, now)
      }
    };
  }

  /**
   * Export dashboard data in specified format
   */
  async exportDashboardData(format) {
    const metrics = await this.tracker.getCollaborationMetrics();
    const analytics = await this.analytics.getAnalysis();
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      metrics,
      analytics,
      summary: await this.getDashboardOverview()
    };

    if (format === 'json') {
      return exportData;
    } else if (format === 'csv') {
      return this.convertToCSV(exportData);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Send initial data to newly connected WebSocket client
   */
  async sendInitialData(ws) {
    try {
      const overview = await this.getDashboardOverview();
      const metrics = await this.tracker.getCollaborationMetrics();
      const analytics = await this.analytics.getAnalysis();

      ws.send(JSON.stringify({
        type: 'initial_data',
        data: {
          overview,
          metrics,
          analytics
        }
      }));
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  /**
   * Handle WebSocket messages from clients
   */
  async handleWebSocketMessage(ws, message) {
    switch (message.type) {
      case 'subscribe':
        await this.handleSubscription(ws, message.data);
        break;
      case 'unsubscribe':
        await this.handleUnsubscription(ws, message.data);
        break;
      case 'get_data':
        await this.handleDataRequest(ws, message.data);
        break;
      case 'toggle_realtime':
        this.realtimeUpdates = message.data.enabled;
        break;
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
  }

  /**
   * Broadcast updates to all connected clients
   */
  broadcastUpdate(update) {
    const message = JSON.stringify(update);
    
    this.connectedClients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcast periodic metrics updates
   */
  async broadcastMetricsUpdate() {
    try {
      const metrics = await this.tracker.getCollaborationMetrics();
      
      this.broadcastUpdate({
        type: 'metrics_update',
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error broadcasting metrics update:', error);
    }
  }

  /**
   * Get active alerts and warnings
   */
  async getActiveAlerts() {
    const alerts = [];
    const metrics = await this.tracker.getCollaborationMetrics();

    // Success rate alert
    if (metrics.performance.successRate < 0.8) {
      alerts.push({
        type: 'warning',
        message: 'Collaboration success rate is below 80%',
        severity: 'medium',
        timestamp: new Date().toISOString()
      });
    }

    // Response time alert
    if (metrics.performance.averageResponseTime > 5000) {
      alerts.push({
        type: 'warning',
        message: 'Average response time is above 5 seconds',
        severity: 'high',
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }

  /**
   * Get recent trends for dashboard
   */
  async getRecentTrends() {
    return {
      collaborationActivity: 'increasing',
      performanceLevel: 'stable',
      agentUtilization: 'optimal',
      systemHealth: 'good'
    };
  }

  // Helper methods for data retrieval
  async getAgentRecentCollaborations(agentId) { return []; }
  async getAgentPerformanceTrends(agentId) { return {}; }
  async getAgentCollaborationPatterns(agentId) { return {}; }
  async getCollaborationRateTrend(start, end) { return []; }
  async getSuccessRateTrend(start, end) { return []; }
  async getResponseTimeTrend(start, end) { return []; }
  async getAgentActivityTrend(start, end) { return []; }
  
  async handleSubscription(ws, data) {
    // Handle subscription to specific data types
    console.log('Client subscribed to:', data);
  }

  async handleUnsubscription(ws, data) {
    // Handle unsubscription from specific data types
    console.log('Client unsubscribed from:', data);
  }

  async handleDataRequest(ws, data) {
    // Handle specific data requests
    try {
      let responseData;
      switch (data.type) {
        case 'agent_details':
          responseData = await this.getAgentDetails(data.agentId);
          break;
        case 'collaboration_history':
          responseData = await this.getCollaborationHistory(data.limit, data.offset, data.status);
          break;
        default:
          responseData = { error: 'Unknown data request type' };
      }
      
      ws.send(JSON.stringify({
        type: 'data_response',
        requestId: data.requestId,
        data: responseData
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        requestId: data.requestId,
        error: error.message
      }));
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    // Simple CSV conversion - would be more sophisticated in production
    const headers = ['Metric', 'Value', 'Timestamp'];
    const rows = [
      ['Total Agents', data.metrics.overview.totalAgents, data.exportedAt],
      ['Active Collaborations', data.metrics.overview.activeCollaborations, data.exportedAt],
      ['Success Rate', data.metrics.performance.successRate, data.exportedAt],
      ['Average Response Time', data.metrics.performance.averageResponseTime, data.exportedAt]
    ];

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Gracefully shutdown the dashboard
   */
  async shutdown() {
    console.log('Shutting down Collaboration Dashboard...');
    
    // Close WebSocket connections
    this.connectedClients.forEach(client => {
      client.close();
    });
    
    // Close WebSocket server
    this.wss.close();
    
    // Close HTTP server
    this.server.close();
    
    // Cleanup analytics and tracker
    this.analytics.destroy();
    await this.tracker.destroy();
    
    console.log('Dashboard shutdown complete');
  }
}

module.exports = CollaborationDashboard;