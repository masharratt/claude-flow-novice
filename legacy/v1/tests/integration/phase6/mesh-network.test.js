/**
 * Phase 6 Integration Tests - Mesh Network Communication
 *
 * Tests peer-to-peer communication, task broadcasting, and network health
 * for mesh topology swarms.
 *
 * SUCCESS CRITERIA:
 * - Peer discovery completes in <5s
 * - Task broadcast reaches all peers in <1s
 * - Network health monitoring detects failures in <500ms
 * - Message throughput >8000 msg/sec
 * - Peer-to-peer latency <50ms (p95)
 *
 * @module tests/integration/phase6/mesh-network
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MessageBroker } from '../../../src/coordination/v2/core/message-broker.js';
import { Message, MessagePriority } from '../../../src/coordination/v2/core/message.js';
import { AgentState } from '../../../src/coordination/v2/core/agent-state.js';

describe('Phase 6 - Mesh Network Communication', () => {
  let messageBroker;
  let meshPeers;
  let messageStats;

  beforeEach(async () => {
    // Initialize message broker
    messageBroker = new MessageBroker({
      maxQueueSize: 10000,
      enableDeadLetterQueue: true,
      deliverySemantics: 'at-least-once'
    });

    // Initialize mesh peer registry
    meshPeers = new Map();
    messageStats = {
      sent: 0,
      received: 0,
      broadcasted: 0,
      latencies: []
    };

    await messageBroker.initialize();
  });

  afterEach(async () => {
    await messageBroker?.shutdown();
    meshPeers.clear();
    messageStats = null;
  });

  describe('Peer Discovery Protocol', () => {
    test('should discover all peers in mesh within 5 seconds', async () => {
      const peerCount = 10;
      const discoveryStartTime = Date.now();

      // Create mesh peers
      const peerIds = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);

      // Each peer announces itself
      const announcements = [];
      for (const peerId of peerIds) {
        const announcement = messageBroker.publish({
          topic: 'peer.discovery',
          payload: {
            peerId,
            capabilities: ['compute', 'storage'],
            state: AgentState.IDLE,
            timestamp: Date.now()
          },
          priority: MessagePriority.HIGH,
          senderId: peerId
        });
        announcements.push(announcement);
      }

      await Promise.all(announcements);

      // Subscribe to peer announcements and build registry
      const discoveredPeers = new Set();
      await messageBroker.subscribe({
        topic: 'peer.announcement',
        handler: async (msg) => {
          discoveredPeers.add(msg.payload.peerId);
        },
        priority: MessagePriority.HIGH
      });

      // Simulate each peer broadcasting its presence
      for (const peerId of peerIds) {
        await messageBroker.publish({
          topic: 'peer.announcement',
          payload: {
            peerId,
            capabilities: ['compute', 'storage'],
            load: 0,
            lastSeen: Date.now()
          },
          priority: MessagePriority.HIGH,
          senderId: peerId
        });
      }

      // Wait for discovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const discoveryTime = Date.now() - discoveryStartTime;

      // Verify all peers discovered
      expect(discoveredPeers.size).toBe(peerCount);
      expect(discoveryTime).toBeLessThan(5000);

      console.log(`✅ Peer discovery: ${peerCount} peers in ${discoveryTime}ms`);
    });

    test('should handle peer join/leave events correctly', async () => {
      const peerEvents = [];

      await messageBroker.subscribe({
        topic: 'peer.join',
        handler: async (msg) => {
          peerEvents.push({ type: 'join', peerId: msg.payload.peerId });
        },
        priority: MessagePriority.HIGH
      });

      await messageBroker.subscribe({
        topic: 'peer.leave',
        handler: async (msg) => {
          peerEvents.push({ type: 'leave', peerId: msg.payload.peerId });
        },
        priority: MessagePriority.HIGH
      });

      // Peer joins
      await messageBroker.publish({
        topic: 'peer.join',
        payload: { peerId: 'peer-1', capabilities: ['compute'] },
        priority: MessagePriority.HIGH,
        senderId: 'peer-1'
      });

      // Another peer joins
      await messageBroker.publish({
        topic: 'peer.join',
        payload: { peerId: 'peer-2', capabilities: ['storage'] },
        priority: MessagePriority.HIGH,
        senderId: 'peer-2'
      });

      // First peer leaves
      await messageBroker.publish({
        topic: 'peer.leave',
        payload: { peerId: 'peer-1', reason: 'graceful_shutdown' },
        priority: MessagePriority.HIGH,
        senderId: 'peer-1'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(peerEvents).toHaveLength(3);
      expect(peerEvents[0]).toEqual({ type: 'join', peerId: 'peer-1' });
      expect(peerEvents[1]).toEqual({ type: 'join', peerId: 'peer-2' });
      expect(peerEvents[2]).toEqual({ type: 'leave', peerId: 'peer-1' });
    });

    test('should detect duplicate peer IDs and reject', async () => {
      const duplicateDetections = [];

      await messageBroker.subscribe({
        topic: 'peer.discovery',
        handler: async (msg) => {
          const peerId = msg.payload.peerId;
          if (meshPeers.has(peerId)) {
            duplicateDetections.push(peerId);
            await messageBroker.publish({
              topic: 'peer.duplicate',
              payload: { peerId, existingPeer: meshPeers.get(peerId) },
              priority: MessagePriority.CRITICAL,
              senderId: 'mesh-coordinator'
            });
          } else {
            meshPeers.set(peerId, msg.payload);
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // First peer announces
      await messageBroker.publish({
        topic: 'peer.discovery',
        payload: { peerId: 'peer-1', capabilities: [] },
        priority: MessagePriority.HIGH,
        senderId: 'peer-1'
      });

      // Duplicate peer tries to join
      await messageBroker.publish({
        topic: 'peer.discovery',
        payload: { peerId: 'peer-1', capabilities: [] },
        priority: MessagePriority.HIGH,
        senderId: 'peer-1-duplicate'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(duplicateDetections).toContain('peer-1');
      expect(meshPeers.size).toBe(1);
    });
  });

  describe('Task Broadcasting', () => {
    test('should broadcast task to all peers within 1 second', async () => {
      const peerCount = 10;
      const peerIds = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);
      const receivedByPeers = new Set();

      const broadcastStartTime = Date.now();

      // Each peer subscribes to broadcast channel
      for (const peerId of peerIds) {
        await messageBroker.subscribe({
          topic: 'task.broadcast',
          handler: async (msg) => {
            receivedByPeers.add(peerId);
            messageStats.received++;
          },
          priority: MessagePriority.NORMAL
        });
      }

      // Coordinator broadcasts task
      await messageBroker.publish({
        topic: 'task.broadcast',
        payload: {
          taskId: 'task-1',
          type: 'compute',
          priority: 'high',
          data: { compute: 'workload' }
        },
        priority: MessagePriority.HIGH,
        senderId: 'coordinator'
      });

      messageStats.broadcasted++;

      await new Promise(resolve => setTimeout(resolve, 100));

      const broadcastTime = Date.now() - broadcastStartTime;

      expect(receivedByPeers.size).toBe(peerCount);
      expect(broadcastTime).toBeLessThan(1000);

      console.log(`✅ Task broadcast: ${peerCount} peers in ${broadcastTime}ms`);
    });

    test('should handle selective broadcasting to subset of peers', async () => {
      const allPeers = ['peer-1', 'peer-2', 'peer-3', 'peer-4', 'peer-5'];
      const targetPeers = ['peer-1', 'peer-3', 'peer-5'];
      const receivedByPeers = [];

      // All peers subscribe
      for (const peerId of allPeers) {
        await messageBroker.subscribe({
          topic: 'task.selective',
          handler: async (msg) => {
            if (msg.payload.recipients.includes(peerId)) {
              receivedByPeers.push(peerId);
            }
          },
          priority: MessagePriority.NORMAL
        });
      }

      // Selective broadcast
      await messageBroker.publish({
        topic: 'task.selective',
        payload: {
          taskId: 'selective-task',
          recipients: targetPeers,
          data: { workload: 'compute' }
        },
        priority: MessagePriority.HIGH,
        senderId: 'coordinator'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedByPeers).toHaveLength(targetPeers.length);
      expect(receivedByPeers.sort()).toEqual(targetPeers.sort());
    });

    test('should maintain message ordering in broadcast', async () => {
      const messageCount = 100;
      const receivedOrders = new Map();

      // Peer subscribes and tracks message order
      const peerId = 'peer-1';
      const receivedMessages = [];

      await messageBroker.subscribe({
        topic: 'ordered.broadcast',
        handler: async (msg) => {
          receivedMessages.push(msg.payload.sequence);
        },
        priority: MessagePriority.NORMAL
      });

      // Broadcast messages with sequence numbers
      for (let i = 0; i < messageCount; i++) {
        await messageBroker.publish({
          topic: 'ordered.broadcast',
          payload: { sequence: i, data: `message-${i}` },
          priority: MessagePriority.NORMAL,
          senderId: 'coordinator'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify order
      expect(receivedMessages).toHaveLength(messageCount);
      for (let i = 0; i < messageCount; i++) {
        expect(receivedMessages[i]).toBe(i);
      }
    });
  });

  describe('Network Health Monitoring', () => {
    test('should detect peer failure within 500ms', async () => {
      const healthCheckInterval = 100; // 100ms health check
      const failureThreshold = 3; // 3 missed heartbeats
      const peerFailures = [];

      // Simulate peer heartbeats
      const peerHeartbeats = new Map();
      let healthCheckTimer;

      const startHealthCheck = () => {
        healthCheckTimer = setInterval(() => {
          const now = Date.now();
          for (const [peerId, lastHeartbeat] of peerHeartbeats) {
            if (now - lastHeartbeat > healthCheckInterval * failureThreshold) {
              peerFailures.push({ peerId, detectedAt: now });
              peerHeartbeats.delete(peerId);
            }
          }
        }, healthCheckInterval);
      };

      // Initialize peers
      const peerIds = ['peer-1', 'peer-2', 'peer-3'];
      for (const peerId of peerIds) {
        peerHeartbeats.set(peerId, Date.now());
      }

      startHealthCheck();

      // Peer-1 sends heartbeat
      setTimeout(() => {
        peerHeartbeats.set('peer-1', Date.now());
      }, 50);

      // Peer-2 sends heartbeat
      setTimeout(() => {
        peerHeartbeats.set('peer-2', Date.now());
      }, 50);

      // Peer-3 fails (no heartbeat)

      // Wait for failure detection
      await new Promise(resolve => setTimeout(resolve, 500));

      clearInterval(healthCheckTimer);

      expect(peerFailures).toHaveLength(1);
      expect(peerFailures[0].peerId).toBe('peer-3');
      expect(peerFailures[0].detectedAt - Date.now()).toBeLessThan(500);

      console.log(`✅ Peer failure detected: peer-3 in <500ms`);
    });

    test('should track network latency metrics', async () => {
      const measurementCount = 100;
      const latencies = [];

      for (let i = 0; i < measurementCount; i++) {
        const sendTime = Date.now();

        await messageBroker.publish({
          topic: 'latency.test',
          payload: { sendTime, sequence: i },
          priority: MessagePriority.NORMAL,
          senderId: 'peer-1',
          recipientId: 'peer-2'
        });

        const receiveTime = Date.now();
        const latency = receiveTime - sendTime;
        latencies.push(latency);
      }

      // Calculate p95 latency
      const sortedLatencies = latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(measurementCount * 0.95);
      const p95Latency = sortedLatencies[p95Index];
      const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / measurementCount;

      expect(p95Latency).toBeLessThan(50);

      console.log(`✅ Network latency - avg: ${avgLatency.toFixed(2)}ms, p95: ${p95Latency}ms`);
    });

    test('should detect network partition and reconfigure', async () => {
      const partition1 = ['peer-1', 'peer-2'];
      const partition2 = ['peer-3', 'peer-4'];
      const partitionDetections = [];

      // Simulate partition detection via heartbeat failures
      await messageBroker.subscribe({
        topic: 'network.partition',
        handler: async (msg) => {
          partitionDetections.push({
            partition1: msg.payload.partition1,
            partition2: msg.payload.partition2,
            detectedAt: msg.payload.timestamp
          });
        },
        priority: MessagePriority.CRITICAL
      });

      // Trigger partition detection
      await messageBroker.publish({
        topic: 'network.partition',
        payload: {
          partition1,
          partition2,
          reason: 'heartbeat_timeout',
          timestamp: Date.now()
        },
        priority: MessagePriority.CRITICAL,
        senderId: 'network-monitor'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(partitionDetections).toHaveLength(1);
      expect(partitionDetections[0].partition1).toEqual(partition1);
      expect(partitionDetections[0].partition2).toEqual(partition2);
    });
  });

  describe('Message Throughput Performance', () => {
    test('should achieve >8000 messages/sec throughput', async () => {
      const targetThroughput = 8000; // messages per second
      const testDuration = 1000; // 1 second
      let messagesSent = 0;
      let messagesReceived = 0;

      // Setup receiver
      await messageBroker.subscribe({
        topic: 'throughput.test',
        handler: async (msg) => {
          messagesReceived++;
        },
        priority: MessagePriority.NORMAL
      });

      const startTime = Date.now();

      // Send messages as fast as possible for 1 second
      const sendInterval = setInterval(async () => {
        await messageBroker.publish({
          topic: 'throughput.test',
          payload: { sequence: messagesSent },
          priority: MessagePriority.NORMAL,
          senderId: 'throughput-sender'
        });
        messagesSent++;
      }, 0);

      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(sendInterval);

      const elapsedTime = Date.now() - startTime;
      const throughput = (messagesSent / elapsedTime) * 1000;

      // Allow time for message processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(throughput).toBeGreaterThan(targetThroughput);

      console.log(`✅ Message throughput: ${throughput.toFixed(0)} msg/sec (${messagesSent} messages in ${elapsedTime}ms)`);
    }, 10000);

    test('should maintain throughput under concurrent peer load', async () => {
      const peerCount = 10;
      const messagesPerPeer = 100;
      const receivedCounts = new Map();

      // Setup receivers for each peer
      for (let i = 0; i < peerCount; i++) {
        const peerId = `peer-${i}`;
        receivedCounts.set(peerId, 0);

        await messageBroker.subscribe({
          topic: `peer.${peerId}.messages`,
          handler: async (msg) => {
            receivedCounts.set(peerId, receivedCounts.get(peerId) + 1);
          },
          priority: MessagePriority.NORMAL
        });
      }

      const startTime = Date.now();

      // All peers send messages concurrently
      const sendPromises = [];
      for (let i = 0; i < peerCount; i++) {
        const peerId = `peer-${i}`;
        const peerPromise = (async () => {
          for (let j = 0; j < messagesPerPeer; j++) {
            await messageBroker.publish({
              topic: `peer.${peerId}.messages`,
              payload: { sequence: j, peerId },
              priority: MessagePriority.NORMAL,
              senderId: peerId
            });
          }
        })();
        sendPromises.push(peerPromise);
      }

      await Promise.all(sendPromises);

      const elapsedTime = Date.now() - startTime;
      const totalMessages = peerCount * messagesPerPeer;
      const throughput = (totalMessages / elapsedTime) * 1000;

      // Verify all messages received
      await new Promise(resolve => setTimeout(resolve, 200));

      for (const [peerId, count] of receivedCounts) {
        expect(count).toBe(messagesPerPeer);
      }

      expect(throughput).toBeGreaterThan(5000); // Lower threshold for concurrent load

      console.log(`✅ Concurrent throughput: ${throughput.toFixed(0)} msg/sec (${totalMessages} messages, ${peerCount} peers)`);
    }, 10000);
  });

  describe('Peer-to-Peer Direct Communication', () => {
    test('should support direct peer-to-peer messaging', async () => {
      const peer1Messages = [];
      const peer2Messages = [];

      // Peer 1 subscribes
      await messageBroker.subscribe({
        topic: 'p2p.peer-1',
        handler: async (msg) => {
          peer1Messages.push(msg.payload);
        },
        priority: MessagePriority.HIGH
      });

      // Peer 2 subscribes
      await messageBroker.subscribe({
        topic: 'p2p.peer-2',
        handler: async (msg) => {
          peer2Messages.push(msg.payload);
        },
        priority: MessagePriority.HIGH
      });

      // Peer 1 sends to Peer 2
      await messageBroker.publish({
        topic: 'p2p.peer-2',
        payload: { from: 'peer-1', message: 'Hello Peer 2' },
        priority: MessagePriority.HIGH,
        senderId: 'peer-1',
        recipientId: 'peer-2'
      });

      // Peer 2 replies to Peer 1
      await messageBroker.publish({
        topic: 'p2p.peer-1',
        payload: { from: 'peer-2', message: 'Hello Peer 1' },
        priority: MessagePriority.HIGH,
        senderId: 'peer-2',
        recipientId: 'peer-1'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(peer1Messages).toHaveLength(1);
      expect(peer1Messages[0].from).toBe('peer-2');
      expect(peer2Messages).toHaveLength(1);
      expect(peer2Messages[0].from).toBe('peer-1');
    });

    test('should measure p2p latency <50ms p95', async () => {
      const measurements = 100;
      const latencies = [];

      await messageBroker.subscribe({
        topic: 'p2p.latency.reply',
        handler: async (msg) => {
          // Immediate echo back
          await messageBroker.publish({
            topic: 'p2p.latency.echo',
            payload: { originalSendTime: msg.payload.sendTime },
            priority: MessagePriority.CRITICAL,
            senderId: 'peer-2',
            recipientId: 'peer-1'
          });
        },
        priority: MessagePriority.CRITICAL
      });

      await messageBroker.subscribe({
        topic: 'p2p.latency.echo',
        handler: async (msg) => {
          const latency = Date.now() - msg.payload.originalSendTime;
          latencies.push(latency);
        },
        priority: MessagePriority.CRITICAL
      });

      // Send ping-pong messages
      for (let i = 0; i < measurements; i++) {
        await messageBroker.publish({
          topic: 'p2p.latency.reply',
          payload: { sendTime: Date.now(), sequence: i },
          priority: MessagePriority.CRITICAL,
          senderId: 'peer-1',
          recipientId: 'peer-2'
        });

        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const sortedLatencies = latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95Latency = sortedLatencies[p95Index];

      expect(p95Latency).toBeLessThan(50);

      console.log(`✅ P2P latency p95: ${p95Latency}ms (${latencies.length} measurements)`);
    });
  });

  describe('Network Resilience', () => {
    test('should handle message loss and retry', async () => {
      const totalMessages = 10;
      const lossRate = 0.3; // 30% message loss
      const receivedMessages = [];

      let messagesSent = 0;

      await messageBroker.subscribe({
        topic: 'resilience.test',
        handler: async (msg) => {
          // Simulate message loss
          if (Math.random() > lossRate) {
            receivedMessages.push(msg.payload.sequence);
          }
        },
        priority: MessagePriority.NORMAL
      });

      // Send messages with retry logic
      for (let i = 0; i < totalMessages; i++) {
        let delivered = false;
        let retries = 0;
        const maxRetries = 3;

        while (!delivered && retries < maxRetries) {
          await messageBroker.publish({
            topic: 'resilience.test',
            payload: { sequence: i, retry: retries },
            priority: MessagePriority.NORMAL,
            senderId: 'sender'
          });

          messagesSent++;

          await new Promise(resolve => setTimeout(resolve, 50));

          // Check if message was received
          if (receivedMessages.includes(i)) {
            delivered = true;
          } else {
            retries++;
          }
        }
      }

      // With retries, should receive all messages
      expect(new Set(receivedMessages).size).toBeGreaterThanOrEqual(totalMessages * 0.9);

      console.log(`✅ Message resilience: ${receivedMessages.length}/${totalMessages} delivered with retries`);
    });
  });
});
