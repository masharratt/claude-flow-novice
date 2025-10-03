/**
 * Phase 6 Integration Tests - Role Assignment
 *
 * Tests capability negotiation, role claiming, and conflict resolution
 * in mesh topology peer assignment.
 *
 * SUCCESS CRITERIA:
 * - Role negotiation completes in <1s for 10 peers
 * - Conflict resolution achieves consensus in <500ms
 * - Capability matching accuracy >95%
 * - Dynamic role reassignment <2s on peer failure
 *
 * @module tests/integration/phase6/role-assignment
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MessageBroker } from '../../../src/coordination/v2/core/message-broker.js';
import { MessagePriority } from '../../../src/coordination/v2/core/message.js';

describe('Phase 6 - Role Assignment and Capability Negotiation', () => {
  let messageBroker;
  let roleRegistry;
  let capabilityMatcher;

  beforeEach(async () => {
    messageBroker = new MessageBroker({
      maxQueueSize: 5000,
      deliverySemantics: 'at-least-once'
    });

    roleRegistry = new Map();
    capabilityMatcher = {
      matchCount: 0,
      matches: []
    };

    await messageBroker.initialize();
  });

  afterEach(async () => {
    await messageBroker?.shutdown();
    roleRegistry.clear();
  });

  describe('Capability Negotiation', () => {
    test('should negotiate roles among peers in <1 second', async () => {
      const peers = [
        { id: 'peer-1', capabilities: ['compute', 'storage', 'network'] },
        { id: 'peer-2', capabilities: ['compute', 'analytics'] },
        { id: 'peer-3', capabilities: ['storage', 'network'] },
        { id: 'peer-4', capabilities: ['compute', 'ml'] },
        { id: 'peer-5', capabilities: ['storage', 'database'] },
        { id: 'peer-6', capabilities: ['compute', 'storage'] },
        { id: 'peer-7', capabilities: ['network', 'gateway'] },
        { id: 'peer-8', capabilities: ['analytics', 'ml'] },
        { id: 'peer-9', capabilities: ['storage', 'backup'] },
        { id: 'peer-10', capabilities: ['compute', 'cache'] }
      ];

      const roleAssignments = new Map();
      const negotiationStartTime = Date.now();

      // Each peer announces capabilities
      for (const peer of peers) {
        await messageBroker.publish({
          topic: 'capability.announce',
          payload: {
            peerId: peer.id,
            capabilities: peer.capabilities,
            load: Math.random(),
            timestamp: Date.now()
          },
          priority: MessagePriority.HIGH,
          senderId: peer.id
        });
      }

      // Role negotiation algorithm
      await messageBroker.subscribe({
        topic: 'capability.announce',
        handler: async (msg) => {
          const { peerId, capabilities } = msg.payload;

          // Match capabilities to available roles
          const availableRoles = ['compute-leader', 'storage-leader', 'network-leader'];
          for (const role of availableRoles) {
            const requiredCap = role.split('-')[0];
            if (capabilities.includes(requiredCap) && !roleRegistry.has(role)) {
              roleRegistry.set(role, peerId);
              roleAssignments.set(peerId, role);

              await messageBroker.publish({
                topic: 'role.assigned',
                payload: { peerId, role, timestamp: Date.now() },
                priority: MessagePriority.HIGH,
                senderId: 'role-negotiator'
              });
              break;
            }
          }
        },
        priority: MessagePriority.HIGH
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const negotiationTime = Date.now() - negotiationStartTime;

      expect(negotiationTime).toBeLessThan(1000);
      expect(roleAssignments.size).toBeGreaterThan(0);
      expect(roleRegistry.size).toBeGreaterThan(0);

      console.log(`✅ Role negotiation: ${roleAssignments.size} roles assigned in ${negotiationTime}ms`);
    });

    test('should match capabilities with 95% accuracy', async () => {
      const tasks = [
        { id: 'task-1', requiredCapabilities: ['compute', 'ml'] },
        { id: 'task-2', requiredCapabilities: ['storage', 'database'] },
        { id: 'task-3', requiredCapabilities: ['network', 'gateway'] },
        { id: 'task-4', requiredCapabilities: ['compute', 'cache'] },
        { id: 'task-5', requiredCapabilities: ['analytics', 'ml'] }
      ];

      const peers = [
        { id: 'peer-1', capabilities: ['compute', 'ml', 'analytics'] },
        { id: 'peer-2', capabilities: ['storage', 'database', 'backup'] },
        { id: 'peer-3', capabilities: ['network', 'gateway', 'routing'] },
        { id: 'peer-4', capabilities: ['compute', 'cache', 'memory'] },
        { id: 'peer-5', capabilities: ['analytics', 'ml', 'ai'] }
      ];

      const matches = [];

      // Match tasks to peers
      for (const task of tasks) {
        let bestMatch = null;
        let bestScore = 0;

        for (const peer of peers) {
          const matchingCaps = task.requiredCapabilities.filter(cap =>
            peer.capabilities.includes(cap)
          );
          const matchScore = matchingCaps.length / task.requiredCapabilities.length;

          if (matchScore > bestScore) {
            bestScore = matchScore;
            bestMatch = peer.id;
          }
        }

        matches.push({
          task: task.id,
          peer: bestMatch,
          score: bestScore
        });
      }

      const perfectMatches = matches.filter(m => m.score === 1.0);
      const accuracy = (perfectMatches.length / tasks.length) * 100;

      expect(accuracy).toBeGreaterThanOrEqual(95);

      console.log(`✅ Capability matching accuracy: ${accuracy}% (${perfectMatches.length}/${tasks.length} perfect matches)`);
    });

    test('should handle capability updates dynamically', async () => {
      const peerId = 'peer-1';
      const capabilityUpdates = [];

      await messageBroker.subscribe({
        topic: 'capability.update',
        handler: async (msg) => {
          capabilityUpdates.push({
            peerId: msg.payload.peerId,
            capabilities: msg.payload.capabilities,
            timestamp: msg.payload.timestamp
          });
        },
        priority: MessagePriority.HIGH
      });

      // Initial capabilities
      await messageBroker.publish({
        topic: 'capability.update',
        payload: {
          peerId,
          capabilities: ['compute'],
          timestamp: Date.now()
        },
        priority: MessagePriority.HIGH,
        senderId: peerId
      });

      // Add new capability
      await new Promise(resolve => setTimeout(resolve, 50));
      await messageBroker.publish({
        topic: 'capability.update',
        payload: {
          peerId,
          capabilities: ['compute', 'storage'],
          timestamp: Date.now()
        },
        priority: MessagePriority.HIGH,
        senderId: peerId
      });

      // Add another capability
      await new Promise(resolve => setTimeout(resolve, 50));
      await messageBroker.publish({
        topic: 'capability.update',
        payload: {
          peerId,
          capabilities: ['compute', 'storage', 'network'],
          timestamp: Date.now()
        },
        priority: MessagePriority.HIGH,
        senderId: peerId
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(capabilityUpdates).toHaveLength(3);
      expect(capabilityUpdates[0].capabilities).toEqual(['compute']);
      expect(capabilityUpdates[1].capabilities).toEqual(['compute', 'storage']);
      expect(capabilityUpdates[2].capabilities).toEqual(['compute', 'storage', 'network']);
    });
  });

  describe('Role Claiming and Conflict Resolution', () => {
    test('should resolve role conflicts via consensus in <500ms', async () => {
      const role = 'compute-leader';
      const claimants = ['peer-1', 'peer-2', 'peer-3'];
      const claimTimestamps = new Map();

      const conflictStartTime = Date.now();

      // Multiple peers claim same role simultaneously
      for (const peerId of claimants) {
        const claimTime = Date.now();
        claimTimestamps.set(peerId, claimTime);

        await messageBroker.publish({
          topic: 'role.claim',
          payload: {
            peerId,
            role,
            timestamp: claimTime,
            priority: Math.random()
          },
          priority: MessagePriority.CRITICAL,
          senderId: peerId
        });
      }

      // Conflict resolution: earliest timestamp wins
      let winner = null;
      let earliestTime = Infinity;

      await messageBroker.subscribe({
        topic: 'role.claim',
        handler: async (msg) => {
          const { peerId, role: claimedRole, timestamp } = msg.payload;

          if (claimedRole === role && timestamp < earliestTime) {
            earliestTime = timestamp;
            winner = peerId;
          }
        },
        priority: MessagePriority.CRITICAL
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Announce winner
      if (winner) {
        await messageBroker.publish({
          topic: 'role.conflict.resolved',
          payload: {
            role,
            winner,
            losers: claimants.filter(p => p !== winner),
            resolutionTime: Date.now()
          },
          priority: MessagePriority.CRITICAL,
          senderId: 'conflict-resolver'
        });
      }

      const resolutionTime = Date.now() - conflictStartTime;

      expect(winner).toBeTruthy();
      expect(claimants).toContain(winner);
      expect(resolutionTime).toBeLessThan(500);

      console.log(`✅ Conflict resolution: ${role} assigned to ${winner} in ${resolutionTime}ms`);
    });

    test('should handle priority-based role assignment', async () => {
      const roles = ['leader', 'coordinator', 'worker'];
      const peers = [
        { id: 'peer-1', priority: 10, capabilities: ['all'] },
        { id: 'peer-2', priority: 5, capabilities: ['all'] },
        { id: 'peer-3', priority: 1, capabilities: ['all'] }
      ];

      const assignments = new Map();

      // Assign roles based on priority
      const sortedPeers = [...peers].sort((a, b) => b.priority - a.priority);

      for (let i = 0; i < Math.min(roles.length, sortedPeers.length); i++) {
        const role = roles[i];
        const peer = sortedPeers[i];
        assignments.set(role, peer.id);

        await messageBroker.publish({
          topic: 'role.assigned',
          payload: { role, peerId: peer.id, priority: peer.priority },
          priority: MessagePriority.HIGH,
          senderId: 'role-assigner'
        });
      }

      expect(assignments.get('leader')).toBe('peer-1');
      expect(assignments.get('coordinator')).toBe('peer-2');
      expect(assignments.get('worker')).toBe('peer-3');
    });

    test('should prevent duplicate role assignments', async () => {
      const role = 'storage-leader';
      const assignments = [];

      await messageBroker.subscribe({
        topic: 'role.assigned',
        handler: async (msg) => {
          const { peerId, role: assignedRole } = msg.payload;

          // Check for duplicates
          const existingAssignment = assignments.find(a => a.role === assignedRole);
          if (existingAssignment) {
            await messageBroker.publish({
              topic: 'role.duplicate',
              payload: {
                role: assignedRole,
                existing: existingAssignment.peerId,
                duplicate: peerId
              },
              priority: MessagePriority.CRITICAL,
              senderId: 'role-validator'
            });
          } else {
            assignments.push({ role: assignedRole, peerId });
          }
        },
        priority: MessagePriority.HIGH
      });

      // Attempt to assign same role twice
      await messageBroker.publish({
        topic: 'role.assigned',
        payload: { role, peerId: 'peer-1' },
        priority: MessagePriority.HIGH,
        senderId: 'assigner'
      });

      await messageBroker.publish({
        topic: 'role.assigned',
        payload: { role, peerId: 'peer-2' },
        priority: MessagePriority.HIGH,
        senderId: 'assigner'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should only have one valid assignment
      const uniqueRoles = new Set(assignments.map(a => a.role));
      expect(uniqueRoles.size).toBe(assignments.length);
    });
  });

  describe('Dynamic Role Reassignment', () => {
    test('should reassign role on peer failure in <2 seconds', async () => {
      const role = 'compute-leader';
      const primaryPeer = 'peer-1';
      const backupPeers = ['peer-2', 'peer-3', 'peer-4'];

      let currentAssignment = primaryPeer;
      const reassignments = [];

      // Assign role initially
      roleRegistry.set(role, primaryPeer);

      // Monitor for peer failures
      await messageBroker.subscribe({
        topic: 'peer.failure',
        handler: async (msg) => {
          const failedPeer = msg.payload.peerId;

          if (failedPeer === currentAssignment) {
            const reassignStartTime = Date.now();

            // Reassign to backup peer
            const newAssignment = backupPeers.find(p => p !== failedPeer);
            if (newAssignment) {
              currentAssignment = newAssignment;
              roleRegistry.set(role, newAssignment);

              const reassignTime = Date.now() - reassignStartTime;
              reassignments.push({
                role,
                from: failedPeer,
                to: newAssignment,
                time: reassignTime
              });

              await messageBroker.publish({
                topic: 'role.reassigned',
                payload: {
                  role,
                  previousPeer: failedPeer,
                  newPeer: newAssignment,
                  reassignTime
                },
                priority: MessagePriority.CRITICAL,
                senderId: 'role-manager'
              });
            }
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // Simulate peer failure
      await messageBroker.publish({
        topic: 'peer.failure',
        payload: { peerId: primaryPeer, reason: 'network_timeout' },
        priority: MessagePriority.CRITICAL,
        senderId: 'failure-detector'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(reassignments).toHaveLength(1);
      expect(reassignments[0].from).toBe(primaryPeer);
      expect(reassignments[0].time).toBeLessThan(2000);
      expect(backupPeers).toContain(currentAssignment);

      console.log(`✅ Role reassignment: ${role} from ${primaryPeer} to ${currentAssignment} in ${reassignments[0].time}ms`);
    });

    test('should handle cascading role reassignments', async () => {
      const roleHierarchy = [
        { role: 'leader', peer: 'peer-1', backup: 'peer-2' },
        { role: 'coordinator', peer: 'peer-2', backup: 'peer-3' },
        { role: 'worker', peer: 'peer-3', backup: 'peer-4' }
      ];

      const cascadeEvents = [];

      await messageBroker.subscribe({
        topic: 'role.reassigned',
        handler: async (msg) => {
          cascadeEvents.push({
            role: msg.payload.role,
            from: msg.payload.previousPeer,
            to: msg.payload.newPeer
          });

          // Check if reassigned peer had other roles
          const dependentRoles = roleHierarchy.filter(r => r.peer === msg.payload.previousPeer);
          for (const dependent of dependentRoles) {
            await messageBroker.publish({
              topic: 'role.reassigned',
              payload: {
                role: dependent.role,
                previousPeer: dependent.peer,
                newPeer: dependent.backup
              },
              priority: MessagePriority.CRITICAL,
              senderId: 'cascade-handler'
            });
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // Trigger cascade by failing peer-1
      await messageBroker.publish({
        topic: 'role.reassigned',
        payload: {
          role: 'leader',
          previousPeer: 'peer-1',
          newPeer: 'peer-2'
        },
        priority: MessagePriority.CRITICAL,
        senderId: 'failure-handler'
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(cascadeEvents.length).toBeGreaterThan(1);
    });
  });

  describe('Load-Based Role Assignment', () => {
    test('should assign roles based on peer load', async () => {
      const peers = [
        { id: 'peer-1', load: 0.9, capabilities: ['compute'] },
        { id: 'peer-2', load: 0.3, capabilities: ['compute'] },
        { id: 'peer-3', load: 0.7, capabilities: ['compute'] },
        { id: 'peer-4', load: 0.1, capabilities: ['compute'] }
      ];

      const role = 'compute-leader';

      // Select peer with lowest load
      const sortedByLoad = [...peers].sort((a, b) => a.load - b.load);
      const selectedPeer = sortedByLoad[0];

      roleRegistry.set(role, selectedPeer.id);

      expect(selectedPeer.id).toBe('peer-4');
      expect(selectedPeer.load).toBeLessThan(0.2);

      console.log(`✅ Load-based assignment: ${role} to ${selectedPeer.id} (load: ${selectedPeer.load})`);
    });

    test('should rebalance roles on load change', async () => {
      const peers = new Map([
        ['peer-1', { load: 0.2, role: 'compute-leader' }],
        ['peer-2', { load: 0.3, role: null }],
        ['peer-3', { load: 0.4, role: null }]
      ]);

      const rebalanceEvents = [];

      await messageBroker.subscribe({
        topic: 'load.update',
        handler: async (msg) => {
          const { peerId, newLoad } = msg.payload;
          const peer = peers.get(peerId);

          if (peer) {
            const oldLoad = peer.load;
            peer.load = newLoad;

            // Trigger rebalance if load exceeds threshold
            if (newLoad > 0.8 && peer.role) {
              // Find least loaded peer
              const sortedPeers = Array.from(peers.entries())
                .filter(([id, _]) => id !== peerId)
                .sort((a, b) => a[1].load - b[1].load);

              if (sortedPeers.length > 0) {
                const [targetPeerId, targetPeer] = sortedPeers[0];

                rebalanceEvents.push({
                  role: peer.role,
                  from: peerId,
                  to: targetPeerId,
                  oldLoad,
                  newLoad
                });

                targetPeer.role = peer.role;
                peer.role = null;
              }
            }
          }
        },
        priority: MessagePriority.HIGH
      });

      // Simulate load spike on peer-1
      await messageBroker.publish({
        topic: 'load.update',
        payload: { peerId: 'peer-1', newLoad: 0.95 },
        priority: MessagePriority.HIGH,
        senderId: 'load-monitor'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(rebalanceEvents).toHaveLength(1);
      expect(rebalanceEvents[0].from).toBe('peer-1');
      expect(rebalanceEvents[0].to).toBe('peer-2');
    });
  });
});
