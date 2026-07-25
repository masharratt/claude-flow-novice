#!/usr/bin/env node

/**
 * Persistent Agent Spawner
 * Spawns agents using child_process.fork() for IPC testing
 *
 * Usage: node persistent-spawner.js <agent_count> <message_count>
 */

const { fork } = require('child_process');
const path = require('path');

const AGENT_COUNT = parseInt(process.argv[2]) || 10;
const MESSAGE_COUNT = parseInt(process.argv[3]) || 100;

const agents = [];
let messagesAcked = 0;

// Spawn agents with IPC channels
for (let i = 0; i < AGENT_COUNT; i++) {
  const agent = fork(
    path.join(__dirname, 'persistent-agent.js'),
    [`agent-${i}`],
    { silent: true }
  );

  agent.on('message', (msg) => {
    if (msg.type === 'ack') {
      messagesAcked++;
    }
  });

  agents.push(agent);
}

// Allow agents to start
setTimeout(() => {
  const startTime = Date.now();

  // Send messages to agents (round-robin)
  for (let i = 0; i < MESSAGE_COUNT; i++) {
    const targetAgent = agents[i % AGENT_COUNT];
    targetAgent.send({ id: i, payload: { iteration: i } });
  }

  // Wait for all acks
  const checkInterval = setInterval(() => {
    if (messagesAcked >= MESSAGE_COUNT) {
      clearInterval(checkInterval);
      const duration = Date.now() - startTime;

      // Print results as JSON for shell consumption
      console.log(JSON.stringify({
        agent_count: AGENT_COUNT,
        message_count: MESSAGE_COUNT,
        messages_acked: messagesAcked,
        duration_ms: duration,
        avg_latency_ms: duration / MESSAGE_COUNT
      }));

      // Cleanup
      agents.forEach(agent => agent.kill('SIGTERM'));
      process.exit(0);
    }
  }, 10);

  // Timeout after 30 seconds
  setTimeout(() => {
    console.error(`Timeout: Only ${messagesAcked}/${MESSAGE_COUNT} messages acked`);
    agents.forEach(agent => agent.kill('SIGTERM'));
    process.exit(1);
  }, 30000);
}, 100);
