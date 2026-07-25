/**
 * Test 2: k6 Load Test for WebSocket Message Bus
 *
 * Tests message routing throughput and latency under various connection loads.
 *
 * Usage:
 *   k6 run load-test.js                           # Default: 100 agents, Node.js server
 *   k6 run load-test.js -e TARGET=ws://localhost:8081/ws  # Test Rust implementation
 *   k6 run load-test.js -e AGENTS=500             # Test with 500 concurrent agents
 *   k6 run load-test.js -e DURATION=5m            # Run for 5 minutes
 *
 * Note: Rust server expects route /ws/:agent_id, so TARGET must include /ws base path
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const messagesRouted = new Counter('messages_routed');
const messagesFailed = new Counter('messages_failed');
const messageLatency = new Trend('message_latency_ms');
const ackLatency = new Trend('ack_latency_ms');

// Configuration from environment variables
const TARGET = __ENV.TARGET || 'ws://localhost:8080';
const MAX_AGENTS = (() => {
  const parsed = parseInt(__ENV.AGENTS || '100', 10);
  // Validate and enforce minimum of 1
  if (isNaN(parsed) || parsed < 1) {
    console.warn(`Invalid AGENTS value '${__ENV.AGENTS}', using default: 100`);
    return 100;
  }
  return Math.floor(parsed);
})();
const TEST_DURATION = __ENV.DURATION || '2m';

// Test stages: ramp up, steady state, ramp down
export const options = {
  stages: [
    { duration: '30s', target: Math.floor(MAX_AGENTS * 0.2) },   // Ramp to 20%
    { duration: '30s', target: Math.floor(MAX_AGENTS * 0.5) },   // Ramp to 50%
    { duration: '30s', target: MAX_AGENTS },                     // Ramp to 100%
    { duration: TEST_DURATION, target: MAX_AGENTS },             // Hold at 100%
    { duration: '30s', target: Math.floor(MAX_AGENTS * 0.5) },   // Ramp down to 50%
    { duration: '30s', target: 0 },                              // Ramp down to 0
  ],
  thresholds: {
    'message_latency_ms': ['p(95)<500'], // 95% of messages routed in <500ms
    'ack_latency_ms': ['p(95)<100'],     // 95% of acks received in <100ms
    'ws_connecting': ['p(95)<1000'],     // 95% of connections established in <1s
  },
};

export default function () {
  const agentId = `agent-${__VU}`;
  const url = `${TARGET}/${agentId}`;

  const response = ws.connect(url, {}, function (socket) {
    // Track connection success
    const connectSuccess = check(socket, {
      'Connected successfully': (s) => s !== null,
    });

    if (!connectSuccess) {
      messagesFailed.add(1);
      return;
    }

    let welcomeReceived = false;
    let messagesReceived = 0;
    let acksReceived = 0;

    // Handle incoming messages
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        // Welcome message
        if (msg.type === 'welcome') {
          welcomeReceived = true;
          check(msg, {
            'Welcome contains agent_id': (m) => m.agent_id === agentId,
            'Welcome contains timestamp': (m) => m.timestamp > 0,
          });
        }
        // Acknowledgment message
        else if (msg.ack) {
          acksReceived++;
          const now = Date.now();
          if (msg.routed_at) {
            const latency = now - msg.routed_at;
            ackLatency.add(latency);
          }
        }
        // Routed message (from another agent)
        else if (msg.routed_by === 'message-bus') {
          messagesReceived++;
          const now = Date.now();

          // Calculate end-to-end latency if sent_at is present
          if (msg.sent_at) {
            const latency = now - msg.sent_at;
            messageLatency.add(latency);
          }

          messagesRouted.add(1);
        }
        // Error message
        else if (msg.error) {
          messagesFailed.add(1);
          check(msg, {
            'Error message contains description': (m) => m.error.length > 0,
          });
        }
      } catch (e) {
        messagesFailed.add(1);
      }
    });

    socket.on('error', (e) => {
      messagesFailed.add(1);
    });

    // Wait for welcome message
    let waited = 0;
    while (!welcomeReceived && waited < 5000) {
      sleep(0.1);
      waited += 100;
    }

    if (!welcomeReceived) {
      socket.close();
      return;
    }

    // Simulate agent-to-agent messaging patterns
    const patterns = [
      sendBroadcastPattern,
      sendTargetedPattern,
      sendRoundRobinPattern,
    ];

    // Randomly select a messaging pattern
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    pattern(socket, agentId);

    // Keep connection open for some time
    sleep(Math.random() * 5 + 5); // 5-10 seconds

    socket.close();
  });

  check(response, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });

  sleep(1);
}

/**
 * Broadcast pattern: Send messages to multiple random agents
 */
function sendBroadcastPattern(socket, agentId) {
  const messageCount = Math.floor(Math.random() * 5) + 5; // 5-10 messages

  for (let i = 0; i < messageCount; i++) {
    // Pick random target agent
    const targetVU = Math.floor(Math.random() * MAX_AGENTS) + 1;
    const targetAgent = `agent-${targetVU}`;

    sendMessage(socket, agentId, targetAgent, {
      pattern: 'broadcast',
      index: i,
      total: messageCount,
    });

    sleep(Math.random() * 0.5 + 0.1); // 100-600ms between messages
  }
}

/**
 * Targeted pattern: Send multiple messages to same agent (conversation)
 */
function sendTargetedPattern(socket, agentId) {
  // Pick one target agent for conversation
  const targetVU = Math.floor(Math.random() * MAX_AGENTS) + 1;
  const targetAgent = `agent-${targetVU}`;

  const messageCount = Math.floor(Math.random() * 10) + 10; // 10-20 messages

  for (let i = 0; i < messageCount; i++) {
    sendMessage(socket, agentId, targetAgent, {
      pattern: 'targeted',
      index: i,
      total: messageCount,
      conversation_id: `conv-${agentId}-${targetAgent}`,
    });

    sleep(Math.random() * 0.3 + 0.05); // 50-350ms between messages (rapid conversation)
  }
}

/**
 * Round-robin pattern: Send messages to sequential agents
 */
function sendRoundRobinPattern(socket, agentId) {
  const messageCount = Math.floor(Math.random() * 8) + 8; // 8-16 messages

  for (let i = 0; i < messageCount; i++) {
    // Round-robin through agents
    const targetVU = ((__VU + i) % MAX_AGENTS) + 1;
    const targetAgent = `agent-${targetVU}`;

    sendMessage(socket, agentId, targetAgent, {
      pattern: 'round-robin',
      index: i,
      total: messageCount,
    });

    sleep(Math.random() * 0.4 + 0.1); // 100-500ms between messages
  }
}

/**
 * Send a message through the WebSocket
 */
function sendMessage(socket, from, to, payload) {
  const message = {
    from: from,
    to: to,
    payload: payload,
    sent_at: Date.now(),
    id: `msg-${from}-${Date.now()}-${Math.random()}`,
  };

  try {
    socket.send(JSON.stringify(message));
  } catch (e) {
    messagesFailed.add(1);
  }
}

/**
 * Setup: Print test configuration
 */
export function setup() {
  console.log('========================================');
  console.log('WebSocket Message Bus Load Test');
  console.log('========================================');
  console.log(`Target: ${TARGET}`);
  console.log(`Max Agents: ${MAX_AGENTS}`);
  console.log(`Test Duration: ${TEST_DURATION}`);
  console.log('========================================');
}

/**
 * Teardown: Fetch and print final metrics
 */
export function teardown(data) {
  console.log('========================================');
  console.log('Test Complete - Fetching Metrics...');
  console.log('========================================');

  // Note: k6 doesn't support HTTP requests in teardown
  // Metrics must be fetched manually:
  // curl http://localhost:8080/metrics (Node.js)
  // curl http://localhost:8081/metrics (Rust)
}
