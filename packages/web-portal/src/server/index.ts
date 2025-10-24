import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Import routes
import agentsRouter from './api/agents';
import coordinatorRouter from './api/coordinator';

// Import Redis client and SwarmAdapter
import { redisClientService } from './services/redis-client';
import { WebSocketServer } from './websocket/SocketIOServer';
import SwarmAdapter from './websocket/integrations/SwarmAdapter';

// Import CFN Metrics Client
import { CFNMetricsClient } from '../api/cfn-metrics';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? false
      : ["http://localhost:3001", "http://localhost:3000", "http://localhost:8080"],
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (exclude high-frequency endpoints)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => {
    // Exempt CFN metrics endpoints from rate limiting (auto-refresh every 2s)
    return req.path.startsWith('/cfn-metrics');
  }
});
app.use('/api', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes (must come before static files)
app.use('/api/agents', agentsRouter);
app.use('/api/coordinator', coordinatorRouter);

// Dashboard stats endpoint (temporary mock data)
app.get('/api/dashboard/stats', (req, res) => {
  res.json({
    activeAgents: 0,
    completedAgents: 0,
    failedAgents: 0,
    totalCost: 0,
    totalTokens: 0,
    averageConfidence: 0,
    systemStatus: 'operational'
  });
});

// CFN Loop Metrics endpoints
app.get('/api/cfn-metrics/latest', async (req, res) => {
  try {
    if (!cfnMetricsClient) {
      // Return mock data if client not initialized
      return res.json({
        taskId: 'demo-task-001',
        iteration: 2,
        maxIterations: 10,
        loop3Confidence: [0.85, 0.82, 0.88],
        loop2Consensus: 0.90,
        productOwnerDecision: 'PENDING',
        status: 'running',
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        agents: {
          loop3: ['coder-1', 'researcher-1', 'devops-1'],
          loop2: ['reviewer-1', 'tester-1'],
          productOwner: 'product-owner-1'
        }
      });
    }

    const metrics = await cfnMetricsClient.getLatestMetrics();

    if (!metrics) {
      // Return mock data if no active tasks
      return res.json({
        taskId: 'demo-task-001',
        iteration: 2,
        maxIterations: 10,
        loop3Confidence: [0.85, 0.82, 0.88],
        loop2Consensus: 0.90,
        productOwnerDecision: 'PENDING',
        status: 'running',
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        agents: {
          loop3: ['coder-1', 'researcher-1', 'devops-1'],
          loop2: ['reviewer-1', 'tester-1'],
          productOwner: 'product-owner-1'
        }
      });
    }

    res.json(metrics);
  } catch (error) {
    console.error('[CFN Metrics] Error fetching latest metrics:', error);
    res.status(500).json({ error: 'Failed to fetch CFN Loop metrics' });
  }
});

app.get('/api/cfn-metrics/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!cfnMetricsClient) {
      // Return mock data if client not initialized
      return res.json({
        taskId,
        iteration: 2,
        maxIterations: 10,
        loop3Confidence: [0.85, 0.82, 0.88],
        loop2Consensus: 0.90,
        productOwnerDecision: 'PENDING',
        status: 'running',
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        agents: {
          loop3: ['coder-1', 'researcher-1', 'devops-1'],
          loop2: ['reviewer-1', 'tester-1'],
          productOwner: 'product-owner-1'
        }
      });
    }

    const metrics = await cfnMetricsClient.getMetrics(taskId);

    if (!metrics) {
      return res.status(404).json({
        error: 'Task not found',
        message: `No CFN Loop metrics found for task ID: ${taskId}`
      });
    }

    res.json(metrics);
  } catch (error) {
    console.error('[CFN Metrics] Error fetching task metrics:', error);
    res.status(500).json({ error: 'Failed to fetch CFN Loop metrics' });
  }
});

// Serve static files from client build
app.use(express.static('dist/client'));

// Handle client-side routing (must be last)
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'dist/client' });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-agents-view', () => {
    socket.join('agents-view');
    console.log(`Client ${socket.id} joined agents view`);
  });

  socket.on('join-dashboard', () => {
    socket.join('dashboard');
    console.log(`Client ${socket.id} joined dashboard`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Broadcast function for agent updates
export const broadcastAgentUpdate = (agentData: any) => {
  io.to('agents-view').emit('agent-update', agentData);
};

// Broadcast function for dashboard metrics updates
export const broadcastMetricsUpdate = (metricsData: any) => {
  io.to('dashboard').emit('metrics-update', metricsData);
};

// Broadcast function for activity updates
export const broadcastActivityUpdate = (activity: any) => {
  io.to('dashboard').emit('activity-update', activity);
};

const PORT = process.env.PORT || 8080;

// Initialize Redis client, SwarmAdapter, and CFN Metrics Client
let swarmAdapter: SwarmAdapter | null = null;
let cfnMetricsClient: CFNMetricsClient | null = null;

async function initializeServices() {
  try {
    console.log('[Server] Initializing Redis client...');
    await redisClientService.connect();
    console.log('[Server] Redis client connected');

    // Initialize CFN Metrics Client with Redis connection
    console.log('[Server] Initializing CFN Metrics Client...');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    cfnMetricsClient = new CFNMetricsClient(redisUrl);
    await cfnMetricsClient.connect();
    console.log('[Server] CFN Metrics Client connected');

    // Create WebSocket server wrapper (if using unified SocketIOServer)
    // Note: Using basic Socket.IO for now, upgrade to WebSocketServer if needed
    const wsServer = {
      emitHierarchyChange: (event: any) => {
        io.to('hierarchy').emit('hierarchy_change', event);
      },
      emitAgentUpdate: (agentId: string, data: any) => {
        io.to('agents-view').emit('agent_update', { agentId, ...data });
      },
      emitMetricsUpdate: (data: any) => {
        io.to('dashboard').emit('metrics_update', data);
      }
    } as any;

    // Initialize SwarmAdapter (disable event storage to avoid recursion bug)
    console.log('[Server] Initializing SwarmAdapter...');
    swarmAdapter = new SwarmAdapter(wsServer, { enableEventStorage: false });

    // Subscribe to Redis pub/sub for CLI agent coordination
    await swarmAdapter.subscribeToSwarmCoordinator();
    console.log('[Server] SwarmAdapter subscribed to Redis events');

  } catch (error) {
    console.error('[Server] Failed to initialize services:', error);
    console.error('[Server] Server will continue without Redis integration');
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('\n[Server] Shutting down gracefully...');

  try {
    // Shutdown SwarmAdapter
    if (swarmAdapter) {
      await swarmAdapter.shutdown();
    }

    // Disconnect CFN Metrics Client
    if (cfnMetricsClient) {
      console.log('[Server] Disconnecting CFN Metrics Client...');
      await cfnMetricsClient.disconnect();
    }

    // Disconnect Redis
    await redisClientService.disconnect();

    // Close HTTP server
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);

  } catch (error) {
    console.error('[Server] Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 Web Portal Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🌐 Client served at: http://localhost:${PORT}`);

  // Initialize services after server starts
  await initializeServices();
});

export default app;