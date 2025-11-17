#!/usr/bin/env node

/**
 * Persistent Agent Helper
 * Used by spawn-cost.sh to test persistent agent messaging patterns
 */

const agentId = process.argv[2] || 'agent-unknown';
let messageCount = 0;

// Handle incoming messages via IPC
process.on('message', (msg) => {
  messageCount++;
  // Simulate minimal work
  const result = Math.random() * 100;

  // Send acknowledgement
  if (process.send) {
    process.send({ type: 'ack', id: msg.id, result });
  }
});

// Respond to SIGTERM gracefully
process.on('SIGTERM', () => {
  console.log(`Agent ${agentId} processed ${messageCount} messages`);
  process.exit(0);
});

// Keep alive
process.stdin.resume();
console.log(`Agent ${agentId} started (PID: ${process.pid})`);
