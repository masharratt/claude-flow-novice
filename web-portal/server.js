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

// ... [rest of existing code remains the same] ...

// Add pattern subscriptions for our target channels
redisSub.psubscribe('swarm:*', (err) => {
  if (err) {
    console.error('[Redis] Failed to subscribe to swarm:*:', err);
  } else {
    console.log('[Redis] Subscribed to swarm:*');
  }
});

redisSub.psubscribe('screenshot:*', (err) => {
  if (err) {
    console.error('[Redis] Failed to subscribe to screenshot:*:', err);
  } else {
    console.log('[Redis] Subscribed to screenshot:*');
  }
});

redisSub.psubscribe('cfn_loop:*', (err) => {
  if (err) {
    console.error('[Redis] Failed to subscribe to cfn_loop:*:', err);
  } else {
    console.log('[Redis] Subscribed to cfn_loop:*');
  }
});

// Update the pattern message handler
redisSub.on('pmessage', (pattern, channel, message) => {
  try {
    const parsedMessage = JSON.parse(message);

    // Added specific broadcasts for our target channels
    if (channel.startsWith('swarm:')) {
      console.log(`[Redis→WS] Swarm message: ${channel}`);
      io.emit(channel, { channel, ...parsedMessage });
    }

    if (channel.startsWith('screenshot:')) {
      console.log(`[Redis→WS] Screenshot message: ${channel}`);
      io.emit(channel, { channel, ...parsedMessage });
    }

    if (channel.startsWith('cfn_loop:')) {
      console.log(`[Redis→WS] CFN Loop message: ${channel}`);
      io.emit(channel, { channel, ...parsedMessage });
    }

    // Existing swarm status update logic remains the same
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

// ... [rest of existing code remains the same] ...