#!/usr/bin/env node

/**
 * Test 2: Node.js WebSocket Message Bus
 *
 * Simulates a message routing system for persistent agents communicating like Slack.
 * Measures: throughput, latency, memory usage at various connection counts.
 *
 * Usage: node node-message-bus.js [--port 8080]
 */

const WebSocket = require('ws');
const http = require('http');

const PORT = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1])
  : 8080;

// Agent registry: agentId -> WebSocket
const agents = new Map();

// Statistics
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesRouted: 0,
  messagesFailed: 0,
  startTime: Date.now(),
  latencies: []
};

// Create HTTP server for metrics endpoint
const server = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    const uptime = (Date.now() - stats.startTime) / 1000;
    const memUsage = process.memoryUsage();

    const metrics = {
      uptime_seconds: uptime,
      total_connections: stats.totalConnections,
      active_connections: stats.activeConnections,
      messages_routed: stats.messagesRouted,
      messages_failed: stats.messagesFailed,
      throughput_msg_per_sec: stats.messagesRouted / uptime,
      memory_mb: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      latency_p50: percentile(stats.latencies, 50),
      latency_p95: percentile(stats.latencies, 95),
      latency_p99: percentile(stats.latencies, 99)
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics, null, 2));
  } else if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  // Extract agent ID from URL path (e.g., /agent-123)
  const agentId = req.url.slice(1);

  if (!agentId || agentId === 'favicon.ico') {
    ws.close(1008, 'Invalid agent ID');
    return;
  }

  // Register agent
  agents.set(agentId, ws);
  stats.totalConnections++;
  stats.activeConnections++;

  console.log(`[CONNECT] ${agentId} | Active: ${stats.activeConnections}`);

  // Handle incoming messages
  ws.on('message', (data) => {
    const receiveTime = Date.now();

    try {
      const message = JSON.parse(data.toString());

      // Validate message structure
      if (!message.to || !message.from || !message.payload) {
        stats.messagesFailed++;
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
        return;
      }

      // Route message to target agent
      const targetAgent = agents.get(message.to);

      if (targetAgent && targetAgent.readyState === WebSocket.OPEN) {
        // Add routing metadata
        const routedMessage = {
          ...message,
          routed_at: receiveTime,
          routed_by: 'message-bus'
        };

        targetAgent.send(JSON.stringify(routedMessage));
        stats.messagesRouted++;

        // Track latency (send time to route time)
        if (message.sent_at) {
          const latency = receiveTime - message.sent_at;
          stats.latencies.push(latency);

          // Keep only last 10k latencies to prevent memory bloat
          if (stats.latencies.length > 10000) {
            stats.latencies.shift();
          }
        }

        // Send acknowledgment to sender
        ws.send(JSON.stringify({
          ack: true,
          message_id: message.id,
          routed_at: receiveTime
        }));
      } else {
        stats.messagesFailed++;
        ws.send(JSON.stringify({
          error: 'Agent not found or disconnected',
          target: message.to
        }));
      }
    } catch (err) {
      stats.messagesFailed++;
      console.error(`[ERROR] Failed to process message: ${err.message}`);
      ws.send(JSON.stringify({ error: 'Failed to process message' }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    agents.delete(agentId);
    stats.activeConnections--;
    console.log(`[DISCONNECT] ${agentId} | Active: ${stats.activeConnections}`);
  });

  // Handle errors
  ws.on('error', (err) => {
    console.error(`[ERROR] ${agentId}: ${err.message}`);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    agent_id: agentId,
    timestamp: Date.now()
  }));
});

// Periodic stats logging
setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log(`[STATS] Active: ${stats.activeConnections} | Routed: ${stats.messagesRouted} | Failed: ${stats.messagesFailed} | Mem: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
}, 5000);

// Start server
server.listen(PORT, () => {
  console.log(`Node.js Message Bus running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/agent-{id}`);
  console.log(`Metrics: http://localhost:${PORT}/metrics`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Closing connections...');
  wss.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

// Utility: Calculate percentile
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index] || 0;
}
