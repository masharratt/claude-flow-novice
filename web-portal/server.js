#!/usr/bin/env node
/**
 * Claude Flow Novice - Web Portal WebSocket Server
 *
 * Features:
 * - Real-time agent message streaming
 * - CFN Loop violation monitoring
 * - Swarm status updates
 * - Redis pub/sub integration
 *
 * Port: 3001 (WebSocket + REST API)
 * Redis: localhost:6379
 */

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Redis clients
const redis = new Redis(REDIS_PORT, REDIS_HOST);
const redisSub = new Redis(REDIS_PORT, REDIS_HOST);

// Parse JSON bodies
app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'build')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST API endpoint for violation alerts (called by monitor script)
app.post('/api/violations', (req, res) => {
  const violation = req.body;

  console.log(`[Violation] ${violation.severity}: ${violation.violation_type}`);
  console.log(`  Task: ${violation.task_id}`);
  console.log(`  Description: ${violation.description}`);

  // Broadcast to all connected clients
  io.emit('cfn-violation', violation);

  res.json({ status: 'received', timestamp: new Date().toISOString() });
});

// REST API endpoint for fetching recent violations
app.get('/api/violations', async (req, res) => {
  try {
    const taskId = req.query.task_id;
    const limit = parseInt(req.query.limit || '50');

    // Fetch from Redis list (violations are stored by monitor script)
    const key = taskId
      ? `violations:${taskId}:history`
      : 'violations:all:history';

    const violations = await redis.lrange(key, 0, limit - 1);
    const parsed = violations.map(v => {
      try {
        return JSON.parse(v);
      } catch (e) {
        return null;
      }
    }).filter(v => v !== null);

    res.json({ violations: parsed, count: parsed.length });
  } catch (error) {
    console.error('[API] Error fetching violations:', error);
    res.status(500).json({ error: 'Failed to fetch violations' });
  }
});

// REST API endpoint for acknowledging violations
app.post('/api/violations/:violationId/acknowledge', async (req, res) => {
  try {
    const { violationId } = req.params;
    const { acknowledgedBy } = req.body;

    const ackKey = `violation:${violationId}:acknowledged`;
    await redis.set(ackKey, JSON.stringify({
      acknowledgedBy,
      timestamp: new Date().toISOString()
    }));

    // Broadcast acknowledgment
    io.emit('violation-acknowledged', {
      violationId,
      acknowledgedBy,
      timestamp: new Date().toISOString()
    });

    res.json({ status: 'acknowledged' });
  } catch (error) {
    console.error('[API] Error acknowledging violation:', error);
    res.status(500).json({ error: 'Failed to acknowledge violation' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected:', socket.id);

  // Send connection confirmation
  socket.emit('connection-status', {
    connected: true,
    timestamp: new Date().toISOString(),
    server: 'claude-flow-novice-portal'
  });

  // Handle swarm subscription
  socket.on('subscribe-swarm', async (swarmId) => {
    console.log(`[WebSocket] Client ${socket.id} subscribed to swarm: ${swarmId}`);
    socket.join(`swarm:${swarmId}`);

    // Send current swarm metadata
    try {
      const metadata = await redis.hgetall(`swarm:${swarmId}:metadata`);
      socket.emit('swarm-metadata', metadata);

      // Send current status
      const status = await redis.get(`swarm:${swarmId}:status`);
      if (status) {
        socket.emit('swarm-status', { swarmId, status });
      }

      // Send existing violations for this swarm
      const violations = await redis.lrange(`violations:${swarmId}:history`, 0, 49);
      const parsed = violations.map(v => {
        try {
          return JSON.parse(v);
        } catch (e) {
          return null;
        }
      }).filter(v => v !== null);

      if (parsed.length > 0) {
        socket.emit('historical-violations', { swarmId, violations: parsed });
      }
    } catch (error) {
      console.error(`[WebSocket] Error fetching swarm data:`, error);
    }
  });

  // Handle unsubscribe
  socket.on('unsubscribe-swarm', (swarmId) => {
    console.log(`[WebSocket] Client ${socket.id} unsubscribed from swarm: ${swarmId}`);
    socket.leave(`swarm:${swarmId}`);
  });

  // Handle violation acknowledgment
  socket.on('acknowledge-violation', async (data) => {
    const { violationId, acknowledgedBy } = data;

    try {
      const ackKey = `violation:${violationId}:acknowledged`;
      await redis.set(ackKey, JSON.stringify({
        acknowledgedBy,
        timestamp: new Date().toISOString()
      }));

      // Broadcast to all clients
      io.emit('violation-acknowledged', {
        violationId,
        acknowledgedBy,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[WebSocket] Error acknowledging violation:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('[WebSocket] Client disconnected:', socket.id);
  });
});

// Subscribe to Redis pub/sub channels
console.log('[Redis] Subscribing to channels...');

// Subscribe to global violations channel
redisSub.subscribe('cfn:violations:all', (err) => {
  if (err) {
    console.error('[Redis] Failed to subscribe to cfn:violations:all:', err);
  } else {
    console.log('[Redis] Subscribed to cfn:violations:all');
  }
});

// Subscribe to agent messages
redisSub.subscribe('agent:messages', (err) => {
  if (err) {
    console.error('[Redis] Failed to subscribe to agent:messages:', err);
  } else {
    console.log('[Redis] Subscribed to agent:messages');
  }
});

// Subscribe to swarm status updates
redisSub.psubscribe('swarm:*:status', (err) => {
  if (err) {
    console.error('[Redis] Failed to subscribe to swarm:*:status:', err);
  } else {
    console.log('[Redis] Subscribed to swarm:*:status');
  }
});

// Handle Redis messages
redisSub.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message);

    if (channel === 'cfn:violations:all') {
      // CFN violation detected
      console.log(`[Redis→WS] Broadcasting CFN violation: ${data.violation_type}`);
      io.emit('cfn-violation', data);

      // Store in Redis for history
      const historyKey = `violations:${data.task_id}:history`;
      redis.lpush(historyKey, message);
      redis.ltrim(historyKey, 0, 99); // Keep last 100
      redis.expire(historyKey, 86400); // 24 hour TTL

      // Also store in global history
      redis.lpush('violations:all:history', message);
      redis.ltrim('violations:all:history', 0, 499); // Keep last 500
    } else if (channel === 'agent:messages') {
      // Agent message
      console.log(`[Redis→WS] Broadcasting agent message from: ${data.agentId || 'unknown'}`);
      io.emit('agent-message', data);
    }
  } catch (error) {
    console.error('[Redis] Error parsing message:', error);
  }
});

// Handle pattern-subscribed messages (swarm status updates)
redisSub.on('pmessage', (pattern, channel, message) => {
  try {
    // Extract swarm ID from channel: swarm:SWARM_ID:status
    const match = channel.match(/swarm:(.+):status/);
    if (match) {
      const swarmId = match[1];
      console.log(`[Redis→WS] Swarm status update: ${swarmId} → ${message}`);

      // Broadcast to clients subscribed to this swarm
      io.to(`swarm:${swarmId}`).emit('swarm-status', {
        swarmId,
        status: message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[Redis] Error handling pmessage:', error);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...');

  // Close WebSocket connections
  io.close(() => {
    console.log('[WebSocket] All connections closed');
  });

  // Close Redis connections
  await redis.quit();
  await redisSub.quit();
  console.log('[Redis] Connections closed');

  // Close HTTP server
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log('=== Claude Flow Novice Web Portal ===');
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[WebSocket] Ready for connections`);
  console.log(`[Redis] Connected to ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`[Portal] http://localhost:${PORT}`);
  console.log('');
});
