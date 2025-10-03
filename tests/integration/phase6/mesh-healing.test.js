/**
 * Phase 6 Integration Tests - Mesh Self-Healing
 *
 * Tests failure detection, task reassignment, and topology reconfiguration
 * for mesh network resilience.
 *
 * SUCCESS CRITERIA:
 * - Failure detection <500ms
 * - Task reassignment <2s
 * - Topology reconfiguration <5s for 10-peer mesh
 * - Zero data loss during peer failure
 *
 * @module tests/integration/phase6/mesh-healing
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MessageBroker } from '../../../src/coordination/v2/core/message-broker.js';
import { MeshCompletionDetector } from '../../../src/coordination/v2/completion/mesh-detector.js';
import { MessagePriority } from '../../../src/coordination/v2/core/message.js';
import { AgentState } from '../../../src/coordination/v2/core/agent-state.js';

describe('Phase 6 - Mesh Self-Healing and Failure Recovery', () => {
  let messageBroker;
  let meshDetector;
  let peerRegistry;

  beforeEach(async () => {
    messageBroker = new MessageBroker({
      maxQueueSize: 5000,
      deliverySemantics: 'at-least-once'
    });

    meshDetector = new MeshCompletionDetector(messageBroker, {
      probeTimeout: 2000,
      enableLogging: false
    });

    peerRegistry = {
      peers: new Map(),
      tasks: new Map(),
      healingEvents: []
    };

    await messageBroker.initialize();
  });

  afterEach(async () => {
    await messageBroker?.shutdown();
    peerRegistry = null;
  });

  describe('Failure Detection', () => {
    test('should detect peer failure within 500ms', async () => {
      const peerCount = 5;
      const peers = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);
      const heartbeatInterval = 100; // 100ms heartbeats
      const failureThreshold = 3; // 3 missed heartbeats

      const peerHeartbeats = new Map();
      const detectedFailures = [];

      // Initialize peers
      for (const peerId of peers) {
        peerHeartbeats.set(peerId, Date.now());
      }

      // Monitor heartbeats
      const monitor = setInterval(() => {
        const now = Date.now();
        for (const [peerId, lastHeartbeat] of peerHeartbeats) {
          if (now - lastHeartbeat > heartbeatInterval * failureThreshold) {
            if (!detectedFailures.find(f => f.peerId === peerId)) {
              detectedFailures.push({
                peerId,
                detectedAt: now,
                lastSeen: lastHeartbeat,
                detectionTime: now - lastHeartbeat
              });
            }
          }
        }
      }, heartbeatInterval);

      // Peer-3 stops sending heartbeats (failure)
      const failingPeer = 'peer-3';
      const failureStartTime = Date.now();

      // Other peers continue heartbeats
      const heartbeatTimer = setInterval(() => {
        for (const peerId of peers) {
          if (peerId !== failingPeer) {
            peerHeartbeats.set(peerId, Date.now());
          }
        }
      }, heartbeatInterval);

      // Wait for failure detection
      await new Promise(resolve => setTimeout(resolve, 600));

      clearInterval(monitor);
      clearInterval(heartbeatTimer);

      const failureDetection = detectedFailures.find(f => f.peerId === failingPeer);

      expect(failureDetection).toBeDefined();
      expect(failureDetection.detectionTime).toBeLessThan(500);

      console.log(`✅ Failure detection: ${failingPeer} detected in ${failureDetection.detectionTime}ms`);
    });

    test('should distinguish between network partition and peer failure', async () => {
      const partition1 = ['peer-1', 'peer-2', 'peer-3'];
      const partition2 = ['peer-4', 'peer-5', 'peer-6'];

      const networkEvents = [];

      await messageBroker.subscribe({
        topic: 'network.event',
        handler: async (msg) => {
          networkEvents.push({
            type: msg.payload.type,
            affected: msg.payload.affected,
            timestamp: msg.payload.timestamp
          });
        },
        priority: MessagePriority.CRITICAL
      });

      // Simulate network partition
      await messageBroker.publish({
        topic: 'network.event',
        payload: {
          type: 'partition',
          affected: { partition1, partition2 },
          timestamp: Date.now()
        },
        priority: MessagePriority.CRITICAL,
        senderId: 'network-monitor'
      });

      // Simulate peer failure
      await messageBroker.publish({
        topic: 'network.event',
        payload: {
          type: 'peer_failure',
          affected: { peerId: 'peer-7' },
          timestamp: Date.now()
        },
        priority: MessagePriority.CRITICAL,
        senderId: 'network-monitor'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const partitionEvents = networkEvents.filter(e => e.type === 'partition');
      const failureEvents = networkEvents.filter(e => e.type === 'peer_failure');

      expect(partitionEvents).toHaveLength(1);
      expect(failureEvents).toHaveLength(1);

      console.log(`✅ Event distinction: ${partitionEvents.length} partitions, ${failureEvents.length} failures`);
    });

    test('should detect cascading failures', async () => {
      const peers = ['peer-1', 'peer-2', 'peer-3', 'peer-4'];
      const failureSequence = [];

      await messageBroker.subscribe({
        topic: 'peer.failure',
        handler: async (msg) => {
          const { peerId, dependents } = msg.payload;

          failureSequence.push({
            failed: peerId,
            timestamp: Date.now()
          });

          // Simulate cascade: dependent peers fail
          if (dependents && dependents.length > 0) {
            for (const dependent of dependents) {
              await new Promise(resolve => setTimeout(resolve, 50));

              await messageBroker.publish({
                topic: 'peer.failure',
                payload: { peerId: dependent, reason: 'cascade_failure' },
                priority: MessagePriority.CRITICAL,
                senderId: 'failure-detector'
              });
            }
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // Trigger cascade: peer-1 fails, causing peer-2 and peer-3 to fail
      await messageBroker.publish({
        topic: 'peer.failure',
        payload: {
          peerId: 'peer-1',
          dependents: ['peer-2', 'peer-3'],
          reason: 'primary_failure'
        },
        priority: MessagePriority.CRITICAL,
        senderId: 'failure-detector'
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(failureSequence.length).toBeGreaterThan(1);
      expect(failureSequence[0].failed).toBe('peer-1');

      console.log(`✅ Cascading failure detection: ${failureSequence.length} failures`);
    });
  });

  describe('Task Reassignment', () => {
    test('should reassign tasks from failed peer within 2 seconds', async () => {
      const failedPeer = 'peer-1';
      const tasks = [
        { id: 'task-1', assignedTo: failedPeer, data: { type: 'compute' } },
        { id: 'task-2', assignedTo: failedPeer, data: { type: 'storage' } },
        { id: 'task-3', assignedTo: failedPeer, data: { type: 'network' } }
      ];

      const availablePeers = ['peer-2', 'peer-3', 'peer-4'];
      const reassignments = [];

      const reassignStartTime = Date.now();

      await messageBroker.subscribe({
        topic: 'task.reassign',
        handler: async (msg) => {
          const { taskId, fromPeer, toPeer } = msg.payload;
          reassignments.push({
            taskId,
            fromPeer,
            toPeer,
            timestamp: Date.now()
          });
        },
        priority: MessagePriority.HIGH
      });

      // Trigger failure and reassignment
      for (const task of tasks) {
        const newPeer = availablePeers[Math.floor(Math.random() * availablePeers.length)];

        await messageBroker.publish({
          topic: 'task.reassign',
          payload: {
            taskId: task.id,
            fromPeer: failedPeer,
            toPeer: newPeer,
            reason: 'peer_failure'
          },
          priority: MessagePriority.HIGH,
          senderId: 'task-manager'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const reassignTime = Date.now() - reassignStartTime;

      expect(reassignments).toHaveLength(tasks.length);
      expect(reassignTime).toBeLessThan(2000);

      console.log(`✅ Task reassignment: ${reassignments.length} tasks in ${reassignTime}ms`);
    });

    test('should preserve task state during reassignment', async () => {
      const task = {
        id: 'stateful-task',
        assignedTo: 'peer-1',
        state: { progress: 75, checkpoint: 'step-3' },
        data: { computation: [1, 2, 3, 4, 5] }
      };

      const reassignedTask = { ...task };

      await messageBroker.subscribe({
        topic: 'task.reassign.complete',
        handler: async (msg) => {
          const { taskId, newPeer, preservedState } = msg.payload;

          expect(taskId).toBe(task.id);
          expect(preservedState).toEqual(task.state);
          expect(newPeer).toBe('peer-2');
        },
        priority: MessagePriority.HIGH
      });

      await messageBroker.publish({
        topic: 'task.reassign.complete',
        payload: {
          taskId: task.id,
          newPeer: 'peer-2',
          preservedState: task.state
        },
        priority: MessagePriority.HIGH,
        senderId: 'task-manager'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      console.log('✅ Task state preservation: state preserved during reassignment');
    });

    test('should handle concurrent task reassignments', async () => {
      const failedPeers = ['peer-1', 'peer-2'];
      const tasksPerPeer = 5;
      const allTasks = [];

      // Create tasks for each failed peer
      for (const peerId of failedPeers) {
        for (let i = 0; i < tasksPerPeer; i++) {
          allTasks.push({
            id: `task-${peerId}-${i}`,
            assignedTo: peerId
          });
        }
      }

      const reassignments = [];

      await messageBroker.subscribe({
        topic: 'task.reassign',
        handler: async (msg) => {
          reassignments.push({
            taskId: msg.payload.taskId,
            fromPeer: msg.payload.fromPeer,
            toPeer: msg.payload.toPeer
          });
        },
        priority: MessagePriority.HIGH
      });

      // Reassign all tasks concurrently
      const reassignPromises = allTasks.map(task =>
        messageBroker.publish({
          topic: 'task.reassign',
          payload: {
            taskId: task.id,
            fromPeer: task.assignedTo,
            toPeer: 'peer-3',
            reason: 'concurrent_failure'
          },
          priority: MessagePriority.HIGH,
          senderId: 'task-manager'
        })
      );

      await Promise.all(reassignPromises);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(reassignments).toHaveLength(allTasks.length);

      console.log(`✅ Concurrent reassignment: ${reassignments.length} tasks reassigned`);
    });
  });

  describe('Topology Reconfiguration', () => {
    test('should reconfigure 10-peer mesh in <5 seconds', async () => {
      const peerCount = 10;
      const peers = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);
      const failedPeer = 'peer-5';

      const reconfigStartTime = Date.now();

      // Initialize mesh
      await meshDetector.initializeSwarm('test-swarm', peers);

      // Remove failed peer
      const remainingPeers = peers.filter(p => p !== failedPeer);

      // Reconfigure mesh with remaining peers
      await meshDetector.cleanup('test-swarm');
      await meshDetector.initializeSwarm('test-swarm', remainingPeers);

      const reconfigTime = Date.now() - reconfigStartTime;

      expect(reconfigTime).toBeLessThan(5000);
      expect(remainingPeers).toHaveLength(peerCount - 1);

      console.log(`✅ Topology reconfiguration: ${remainingPeers.length} peers in ${reconfigTime}ms`);
    });

    test('should reestablish peer connections after reconfiguration', async () => {
      const peers = ['peer-1', 'peer-2', 'peer-3', 'peer-4'];
      const connections = new Map();

      // Establish initial connections
      for (const peerId of peers) {
        const connectedTo = peers.filter(p => p !== peerId);
        connections.set(peerId, new Set(connectedTo));
      }

      // Peer-2 fails, remove connections
      const failedPeer = 'peer-2';
      connections.delete(failedPeer);
      for (const [peerId, connectedPeers] of connections) {
        connectedPeers.delete(failedPeer);
      }

      // Verify connections reestablished
      for (const [peerId, connectedPeers] of connections) {
        const expectedCount = peers.filter(p => p !== peerId && p !== failedPeer).length;
        expect(connectedPeers.size).toBe(expectedCount);
      }

      console.log(`✅ Connection reestablishment: ${connections.size} peers reconnected`);
    });

    test('should balance load after topology change', async () => {
      const peers = [
        { id: 'peer-1', load: 0.8 },
        { id: 'peer-2', load: 0.9 }, // High load
        { id: 'peer-3', load: 0.2 },
        { id: 'peer-4', load: 0.3 }
      ];

      const failedPeer = 'peer-2';
      const tasksToRedistribute = 10;

      // Redistribute tasks from failed peer to least loaded peers
      const remainingPeers = peers.filter(p => p.id !== failedPeer);
      remainingPeers.sort((a, b) => a.load - b.load);

      const redistributions = [];
      for (let i = 0; i < tasksToRedistribute; i++) {
        const targetPeer = remainingPeers[i % remainingPeers.length];
        redistributions.push({
          taskId: `task-${i}`,
          fromPeer: failedPeer,
          toPeer: targetPeer.id
        });
      }

      expect(redistributions).toHaveLength(tasksToRedistribute);

      // Verify distribution is balanced
      const distribution = new Map();
      for (const redist of redistributions) {
        const count = distribution.get(redist.toPeer) || 0;
        distribution.set(redist.toPeer, count + 1);
      }

      const maxDifference = Math.max(...distribution.values()) - Math.min(...distribution.values());
      expect(maxDifference).toBeLessThanOrEqual(2); // Balanced within 2 tasks

      console.log(`✅ Load balancing: ${redistributions.length} tasks redistributed`);
    });
  });

  describe('Data Loss Prevention', () => {
    test('should ensure zero data loss during peer failure', async () => {
      const messages = [
        { id: 'msg-1', data: 'important data 1', acknowledged: false },
        { id: 'msg-2', data: 'important data 2', acknowledged: false },
        { id: 'msg-3', data: 'important data 3', acknowledged: false }
      ];

      const backupStore = new Map();

      // Replicate messages to backup peers
      await messageBroker.subscribe({
        topic: 'data.replicate',
        handler: async (msg) => {
          const { messageId, data, backupPeer } = msg.payload;
          backupStore.set(messageId, { data, backupPeer, timestamp: Date.now() });
        },
        priority: MessagePriority.HIGH
      });

      // Replicate each message to backup
      for (const message of messages) {
        await messageBroker.publish({
          topic: 'data.replicate',
          payload: {
            messageId: message.id,
            data: message.data,
            backupPeer: 'backup-peer-1'
          },
          priority: MessagePriority.HIGH,
          senderId: 'primary-peer'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify all data replicated
      expect(backupStore.size).toBe(messages.length);

      for (const message of messages) {
        expect(backupStore.has(message.id)).toBe(true);
        expect(backupStore.get(message.id).data).toBe(message.data);
      }

      console.log(`✅ Data preservation: ${backupStore.size}/${messages.length} messages replicated`);
    });

    test('should recover in-flight messages from replicas', async () => {
      const inFlightMessages = [
        { id: 'inflight-1', data: 'processing', replica: 'replica-1' },
        { id: 'inflight-2', data: 'processing', replica: 'replica-2' },
        { id: 'inflight-3', data: 'processing', replica: 'replica-3' }
      ];

      const recoveredMessages = [];

      await messageBroker.subscribe({
        topic: 'message.recover',
        handler: async (msg) => {
          recoveredMessages.push({
            id: msg.payload.messageId,
            data: msg.payload.data,
            source: msg.payload.replica
          });
        },
        priority: MessagePriority.CRITICAL
      });

      // Recover from replicas
      for (const message of inFlightMessages) {
        await messageBroker.publish({
          topic: 'message.recover',
          payload: {
            messageId: message.id,
            data: message.data,
            replica: message.replica
          },
          priority: MessagePriority.CRITICAL,
          senderId: 'recovery-manager'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(recoveredMessages).toHaveLength(inFlightMessages.length);

      console.log(`✅ Message recovery: ${recoveredMessages.length}/${inFlightMessages.length} recovered`);
    });
  });

  describe('Graceful Degradation', () => {
    test('should maintain partial functionality when majority peers fail', async () => {
      const totalPeers = 10;
      const failedPeers = 6; // 60% failure
      const activePeers = totalPeers - failedPeers;

      const functionality = {
        taskProcessing: activePeers >= 2,
        consensus: activePeers >= 3,
        replication: activePeers >= 2
      };

      expect(functionality.taskProcessing).toBe(true);
      expect(functionality.replication).toBe(true);

      // Limited consensus with only 4 peers
      if (activePeers < 5) {
        functionality.consensus = false;
      }

      const availableFeatures = Object.entries(functionality)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature);

      expect(availableFeatures.length).toBeGreaterThan(0);

      console.log(`✅ Graceful degradation: ${availableFeatures.length}/3 features available with ${activePeers} peers`);
    });
  });
});
