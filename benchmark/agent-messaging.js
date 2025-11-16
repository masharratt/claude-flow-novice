#!/usr/bin/env node

/**
 * Test 5: Agent-to-Agent Messaging Test
 *
 * Simulates agents communicating back and forth like humans in Slack.
 * Tests multi-turn conversations, message routing reliability, and latency.
 *
 * This validates the persistent agent architecture where agents maintain
 * context across multiple message exchanges.
 *
 * Usage:
 *   node agent-messaging.js [--target ws://localhost:8080] [--agents 10] [--conversations 5]
 *
 * Patterns tested:
 *   1. Direct conversation (Agent A <-> Agent B)
 *   2. Group conversation (Agent A -> B -> C -> A)
 *   3. Parallel conversations (Multiple simultaneous threads)
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Configuration
const TARGET = process.argv.find((arg, i) => process.argv[i - 1] === '--target') || 'ws://localhost:8080';
const NUM_AGENTS = parseInt(process.argv.find((arg, i) => process.argv[i - 1] === '--agents') || '10');
const NUM_CONVERSATIONS = parseInt(process.argv.find((arg, i) => process.argv[i - 1] === '--conversations') || '5');
const RESULTS_DIR = path.join(__dirname, 'results');

// Statistics
const stats = {
  totalMessages: 0,
  successfulMessages: 0,
  failedMessages: 0,
  conversationTurns: [],
  messageLatencies: [],
  conversationDurations: [],
  errors: []
};

console.log('========================================');
console.log('Test 5: Agent-to-Agent Messaging');
console.log('========================================');
console.log(`Target: ${TARGET}`);
console.log(`Agents: ${NUM_AGENTS}`);
console.log(`Conversations: ${NUM_CONVERSATIONS}`);
console.log('========================================\n');

/**
 * Agent class - represents a persistent agent with conversation memory
 */
class Agent {
  constructor(id, target) {
    this.id = id;
    this.target = target;
    this.ws = null;
    this.connected = false;
    this.conversationMemory = new Map(); // conversationId -> messages
    this.pendingMessages = new Map(); // messageId -> metadata
    this.messageHandlers = [];
  }

  /**
   * Connect to message bus
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const url = `${this.target}/${this.id}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log(`[CONNECT] ${this.id}`);
        this.connected = true;
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          console.error(`[ERROR] ${this.id}: Failed to parse message`, err);
        }
      });

      this.ws.on('close', () => {
        console.log(`[DISCONNECT] ${this.id}`);
        this.connected = false;
      });

      this.ws.on('error', (err) => {
        console.error(`[ERROR] ${this.id}:`, err.message);
        stats.errors.push({ agent: this.id, error: err.message });
        reject(err);
      });

      // Wait for welcome message
      const welcomeHandler = (msg) => {
        if (msg.type === 'welcome') {
          resolve();
        }
      };

      this.messageHandlers.push(welcomeHandler);

      // Timeout
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  /**
   * Handle incoming message
   */
  handleMessage(message) {
    // Call all registered handlers
    for (const handler of this.messageHandlers) {
      handler(message);
    }

    // Store routed messages in conversation memory
    if (message.routed_by === 'message-bus' && message.payload?.conversation_id) {
      const convId = message.payload.conversation_id;
      if (!this.conversationMemory.has(convId)) {
        this.conversationMemory.set(convId, []);
      }
      this.conversationMemory.get(convId).push({
        from: message.from,
        payload: message.payload,
        received_at: Date.now()
      });
    }

    // Handle acknowledgments
    if (message.ack && message.message_id) {
      const pending = this.pendingMessages.get(message.message_id);
      if (pending) {
        const latency = Date.now() - pending.sent_at;
        stats.messageLatencies.push(latency);
        stats.successfulMessages++;
        this.pendingMessages.delete(message.message_id);
      }
    }

    // Handle errors
    if (message.error) {
      stats.failedMessages++;
      stats.errors.push({ agent: this.id, error: message.error });
    }
  }

  /**
   * Send message to another agent
   */
  sendMessage(toAgentId, conversationId, payload) {
    if (!this.connected) {
      throw new Error('Agent not connected');
    }

    const messageId = `msg-${this.id}-${Date.now()}-${Math.random()}`;
    const message = {
      from: this.id,
      to: toAgentId,
      payload: {
        conversation_id: conversationId,
        ...payload
      },
      sent_at: Date.now(),
      id: messageId
    };

    this.ws.send(JSON.stringify(message));
    this.pendingMessages.set(messageId, { sent_at: Date.now(), to: toAgentId });
    stats.totalMessages++;

    return messageId;
  }

  /**
   * Wait for a message in a conversation
   */
  async waitForMessage(conversationId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkMessages = () => {
        const messages = this.conversationMemory.get(conversationId);
        if (messages && messages.length > 0) {
          const latestMessage = messages[messages.length - 1];
          resolve(latestMessage);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for message in conversation ${conversationId}`));
        } else {
          setTimeout(checkMessages, 100);
        }
      };

      checkMessages();
    });
  }

  /**
   * Disconnect from message bus
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

/**
 * Test Pattern 1: Direct Conversation (ping-pong)
 */
async function testDirectConversation(agent1, agent2, conversationId, turns = 5) {
  console.log(`\n[CONVERSATION] Direct: ${agent1.id} <-> ${agent2.id}`);

  const startTime = Date.now();

  for (let turn = 0; turn < turns; turn++) {
    // Agent1 sends to Agent2
    agent1.sendMessage(agent2.id, conversationId, {
      turn,
      message: `Hello from ${agent1.id}, turn ${turn}`,
      timestamp: Date.now()
    });

    // Agent2 waits for message
    const receivedMsg = await agent2.waitForMessage(conversationId);
    console.log(`  Turn ${turn}: ${agent1.id} -> ${agent2.id} (${receivedMsg.payload.message})`);

    // Agent2 responds
    agent2.sendMessage(agent1.id, conversationId, {
      turn,
      message: `Reply from ${agent2.id}, turn ${turn}`,
      in_reply_to: receivedMsg.payload.message,
      timestamp: Date.now()
    });

    // Agent1 waits for response
    const replyMsg = await agent1.waitForMessage(conversationId);
    console.log(`  Turn ${turn}: ${agent2.id} -> ${agent1.id} (${replyMsg.payload.message})`);

    // Brief pause between turns
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const duration = Date.now() - startTime;
  stats.conversationTurns.push(turns);
  stats.conversationDurations.push(duration);

  console.log(`  ✓ Completed ${turns} turns in ${duration}ms`);
}

/**
 * Test Pattern 2: Group Conversation (round-robin)
 */
async function testGroupConversation(agents, conversationId, rounds = 3) {
  console.log(`\n[CONVERSATION] Group: ${agents.map(a => a.id).join(' -> ')}`);

  const startTime = Date.now();

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < agents.length; i++) {
      const currentAgent = agents[i];
      const nextAgent = agents[(i + 1) % agents.length];

      // Send message to next agent
      currentAgent.sendMessage(nextAgent.id, conversationId, {
        round,
        position: i,
        message: `Message from ${currentAgent.id} in round ${round}`,
        timestamp: Date.now()
      });

      // Next agent waits for message
      const receivedMsg = await nextAgent.waitForMessage(conversationId);
      console.log(`  Round ${round}: ${currentAgent.id} -> ${nextAgent.id}`);

      // Brief pause
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  const duration = Date.now() - startTime;
  const totalTurns = rounds * agents.length;
  stats.conversationTurns.push(totalTurns);
  stats.conversationDurations.push(duration);

  console.log(`  ✓ Completed ${totalTurns} turns in ${duration}ms`);
}

/**
 * Test Pattern 3: Parallel Conversations
 */
async function testParallelConversations(agents, numConversations) {
  console.log(`\n[CONVERSATION] Parallel: ${numConversations} simultaneous conversations`);

  const conversations = [];

  for (let i = 0; i < numConversations; i++) {
    const agent1 = agents[i % agents.length];
    const agent2 = agents[(i + 1) % agents.length];
    const conversationId = `parallel-conv-${i}`;

    conversations.push(
      testDirectConversation(agent1, agent2, conversationId, 3)
    );
  }

  await Promise.all(conversations);
  console.log(`  ✓ Completed ${numConversations} parallel conversations`);
}

/**
 * Calculate percentile
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index] || 0;
}

/**
 * Main test execution
 */
async function main() {
  // Ensure results directory exists
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  // Create agents
  console.log('Creating agents...');
  const agents = [];
  for (let i = 0; i < NUM_AGENTS; i++) {
    agents.push(new Agent(`agent-${i}`, TARGET));
  }

  // Connect all agents
  console.log('Connecting agents...');
  try {
    await Promise.all(agents.map(agent => agent.connect()));
    console.log(`✓ All ${NUM_AGENTS} agents connected\n`);
  } catch (err) {
    console.error('Failed to connect agents:', err);
    process.exit(1);
  }

  // Brief pause for stability
  await new Promise(resolve => setTimeout(resolve, 1000));

  const testStartTime = Date.now();

  // Test Pattern 1: Direct conversations
  for (let i = 0; i < NUM_CONVERSATIONS; i++) {
    const agent1 = agents[i % agents.length];
    const agent2 = agents[(i + 1) % agents.length];
    await testDirectConversation(agent1, agent2, `direct-conv-${i}`, 5);
  }

  // Test Pattern 2: Group conversations
  const groupSize = Math.min(4, NUM_AGENTS);
  for (let i = 0; i < Math.min(2, NUM_CONVERSATIONS); i++) {
    const groupAgents = agents.slice(i * groupSize, (i + 1) * groupSize);
    if (groupAgents.length >= 3) {
      await testGroupConversation(groupAgents, `group-conv-${i}`, 2);
    }
  }

  // Test Pattern 3: Parallel conversations
  if (NUM_CONVERSATIONS >= 3) {
    await testParallelConversations(agents, Math.floor(NUM_CONVERSATIONS / 2));
  }

  const testEndTime = Date.now();
  const totalTestDuration = testEndTime - testStartTime;

  // Disconnect agents
  console.log('\nDisconnecting agents...');
  agents.forEach(agent => agent.disconnect());

  // Calculate statistics
  console.log('\n========================================');
  console.log('Results');
  console.log('========================================');

  const avgLatency = stats.messageLatencies.length > 0
    ? stats.messageLatencies.reduce((a, b) => a + b, 0) / stats.messageLatencies.length
    : 0;

  const avgConversationDuration = stats.conversationDurations.length > 0
    ? stats.conversationDurations.reduce((a, b) => a + b, 0) / stats.conversationDurations.length
    : 0;

  const totalTurns = stats.conversationTurns.reduce((a, b) => a + b, 0);

  console.log(`Total Messages: ${stats.totalMessages}`);
  console.log(`Successful: ${stats.successfulMessages}`);
  console.log(`Failed: ${stats.failedMessages}`);
  console.log(`Success Rate: ${((stats.successfulMessages / stats.totalMessages) * 100).toFixed(1)}%`);
  console.log(`Total Errors: ${stats.errors.length}`);
  console.log('');
  console.log(`Total Conversation Turns: ${totalTurns}`);
  console.log(`Avg Conversation Duration: ${avgConversationDuration.toFixed(0)}ms`);
  console.log('');
  console.log('Message Latency:');
  console.log(`  Average: ${avgLatency.toFixed(0)}ms`);
  console.log(`  P50: ${percentile(stats.messageLatencies, 50).toFixed(0)}ms`);
  console.log(`  P95: ${percentile(stats.messageLatencies, 95).toFixed(0)}ms`);
  console.log(`  P99: ${percentile(stats.messageLatencies, 99).toFixed(0)}ms`);
  console.log('');
  console.log(`Total Test Duration: ${(totalTestDuration / 1000).toFixed(1)}s`);

  // Save results
  const resultsFile = path.join(RESULTS_DIR, 'agent-messaging.json');
  const resultsData = {
    config: {
      target: TARGET,
      num_agents: NUM_AGENTS,
      num_conversations: NUM_CONVERSATIONS,
      timestamp: new Date().toISOString()
    },
    summary: {
      total_messages: stats.totalMessages,
      successful_messages: stats.successfulMessages,
      failed_messages: stats.failedMessages,
      success_rate: (stats.successfulMessages / stats.totalMessages) * 100,
      total_errors: stats.errors.length,
      total_conversation_turns: totalTurns,
      avg_conversation_duration_ms: avgConversationDuration,
      avg_message_latency_ms: avgLatency,
      latency_p50_ms: percentile(stats.messageLatencies, 50),
      latency_p95_ms: percentile(stats.messageLatencies, 95),
      latency_p99_ms: percentile(stats.messageLatencies, 99),
      total_test_duration_ms: totalTestDuration
    },
    errors: stats.errors
  };

  fs.writeFileSync(resultsFile, JSON.stringify(resultsData, null, 2));

  console.log('');
  console.log(`Results saved to: ${resultsFile}`);

  // Interpretation
  console.log('\n========================================');
  console.log('Interpretation');
  console.log('========================================');

  const successRate = (stats.successfulMessages / stats.totalMessages) * 100;

  if (successRate >= 95) {
    console.log('✓ Agent-to-agent messaging is reliable (>95% success)');
    console.log('  → Persistent agent architecture is viable');
  } else if (successRate >= 80) {
    console.log('○ Agent-to-agent messaging is moderately reliable (80-95% success)');
    console.log('  → May need retry logic and error handling');
  } else {
    console.log('! Agent-to-agent messaging is unreliable (<80% success)');
    console.log('  → Architecture needs improvement before production');
  }

  const p95Latency = percentile(stats.messageLatencies, 95);
  if (p95Latency < 100) {
    console.log('\n✓ Message latency is excellent (P95 < 100ms)');
    console.log('  → Feels instant, like Slack');
  } else if (p95Latency < 500) {
    console.log('\n○ Message latency is acceptable (P95 < 500ms)');
    console.log('  → Good user experience');
  } else {
    console.log('\n! Message latency is high (P95 > 500ms)');
    console.log('  → May feel sluggish to users');
  }

  if (stats.errors.length === 0) {
    console.log('\n✓ No errors encountered');
    console.log('  → System is stable');
  } else {
    console.log(`\n! ${stats.errors.length} errors encountered`);
    console.log('  → Review error logs');
  }

  console.log('\n========================================\n');

  process.exit(0);
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

// Run the test
main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
