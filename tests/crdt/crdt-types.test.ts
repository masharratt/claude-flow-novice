/**
 * CRDT Types Test Suite
 * Comprehensive tests for all CRDT implementations
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GCounter, ORSet, LWWRegister, VerificationCRDT } from '../../src/crdt/types.js';

describe('CRDT Types', () => {
  describe('GCounter', () => {
    let counter1: GCounter;
    let counter2: GCounter;
    const replicationGroup = ['node1', 'node2', 'node3'];

    beforeEach(() => {
      counter1 = new GCounter('node1', replicationGroup);
      counter2 = new GCounter('node2', replicationGroup);
    });

    it('should initialize with zero values for all nodes', () => {
      expect(counter1.value()).toBe(0);
      expect(counter2.value()).toBe(0);
    });

    it('should increment counter correctly', () => {
      counter1.increment(5);
      expect(counter1.value()).toBe(5);

      counter1.increment(3);
      expect(counter1.value()).toBe(8);
    });

    it('should throw error on negative increment', () => {
      expect(() => counter1.increment(-1)).toThrow('G-Counter only supports positive increments');
    });

    it('should merge states correctly', () => {
      counter1.increment(10);
      counter2.increment(5);

      const changed = counter1.merge(counter2);
      expect(changed).toBe(true);
      expect(counter1.value()).toBe(15);

      // Merging again should not change anything
      const unchangedMerge = counter1.merge(counter2);
      expect(unchangedMerge).toBe(false);
    });

    it('should compare states correctly', () => {
      counter1.increment(5);
      counter2.increment(3);

      const comparison1 = counter1.compare(counter2);
      expect(comparison1).toBe('CONCURRENT');

      const counter3 = new GCounter('node3', replicationGroup);
      counter3.increment(8);

      const comparison2 = counter3.compare(counter1);
      expect(comparison2).toBe('CONCURRENT');
    });

    it('should serialize and deserialize correctly', () => {
      counter1.increment(10);
      const serialized = counter1.serialize();
      const deserialized = GCounter.deserialize(serialized);

      expect(deserialized.value()).toBe(10);
      expect(deserialized.nodeId).toBe('node1');
    });

    it('should handle concurrent increments correctly', () => {
      // Simulate concurrent operations
      counter1.increment(5);
      counter2.increment(3);

      const counter1Copy = GCounter.deserialize(counter1.serialize());
      const counter2Copy = GCounter.deserialize(counter2.serialize());

      // Both merge each other's changes
      counter1Copy.merge(counter2Copy);
      counter2Copy.merge(counter1Copy);

      expect(counter1Copy.value()).toBe(8);
      expect(counter2Copy.value()).toBe(8);
    });
  });

  describe('OR-Set', () => {
    let orSet1: ORSet<string>;
    let orSet2: ORSet<string>;

    beforeEach(() => {
      orSet1 = new ORSet<string>('node1');
      orSet2 = new ORSet<string>('node2');
    });

    it('should add and check elements correctly', () => {
      orSet1.add('apple');
      orSet1.add('banana');

      expect(orSet1.has('apple')).toBe(true);
      expect(orSet1.has('banana')).toBe(true);
      expect(orSet1.has('cherry')).toBe(false);

      const values = orSet1.values();
      expect(values.has('apple')).toBe(true);
      expect(values.has('banana')).toBe(true);
      expect(values.size).toBe(2);
    });

    it('should remove elements correctly', () => {
      orSet1.add('apple');
      orSet1.add('banana');

      expect(orSet1.remove('apple')).toBe(true);
      expect(orSet1.has('apple')).toBe(false);
      expect(orSet1.has('banana')).toBe(true);

      expect(orSet1.remove('cherry')).toBe(false);
    });

    it('should handle add-wins semantics', () => {
      // Add element in both sets
      orSet1.add('apple');
      orSet2.add('apple');

      // Remove from one
      orSet1.remove('apple');

      // Merge - element should still exist (add-wins)
      orSet1.merge(orSet2);
      expect(orSet1.has('apple')).toBe(true);
    });

    it('should merge correctly', () => {
      orSet1.add('apple');
      orSet1.add('banana');
      orSet2.add('cherry');
      orSet2.add('date');

      const changed = orSet1.merge(orSet2);
      expect(changed).toBe(true);

      const values = orSet1.values();
      expect(values.size).toBe(4);
      expect(values.has('apple')).toBe(true);
      expect(values.has('cherry')).toBe(true);
    });

    it('should serialize and deserialize correctly', () => {
      orSet1.add('apple');
      orSet1.add('banana');
      orSet1.remove('banana');

      const serialized = orSet1.serialize();
      const deserialized = ORSet.deserialize<string>(serialized);

      expect(deserialized.has('apple')).toBe(true);
      expect(deserialized.has('banana')).toBe(false);
      expect(deserialized.values().size).toBe(1);
    });

    it('should handle concurrent add/remove correctly', () => {
      // Concurrent add
      orSet1.add('apple');
      orSet2.add('apple');

      // Concurrent remove on one side
      orSet1.remove('apple');

      // After merge, element should exist (bias towards adds)
      orSet1.merge(orSet2);
      expect(orSet1.has('apple')).toBe(true);
    });
  });

  describe('LWW-Register', () => {
    let register1: LWWRegister<string>;
    let register2: LWWRegister<string>;

    beforeEach(() => {
      register1 = new LWWRegister<string>('node1');
      register2 = new LWWRegister<string>('node2');
    });

    it('should set and get values correctly', () => {
      register1.set('hello');
      expect(register1.get()).toBe('hello');

      register1.set('world');
      expect(register1.get()).toBe('world');
    });

    it('should handle last-writer-wins semantics', () => {
      const now = Date.now();
      register1.set('first', now);
      register1.set('second', now + 1000);

      expect(register1.get()).toBe('second');
    });

    it('should merge based on timestamp', () => {
      const now = Date.now();
      register1.set('older', now);
      register2.set('newer', now + 1000);

      register1.merge(register2);
      expect(register1.get()).toBe('newer');
    });

    it('should use node ID as tiebreaker', () => {
      const now = Date.now();
      register1.set('node1-value', now);
      register2.set('node2-value', now); // Same timestamp

      // node2 > node1 lexicographically, so node2 should win
      register1.merge(register2);
      expect(register1.get()).toBe('node2-value');
    });

    it('should serialize and deserialize correctly', () => {
      register1.set('test-value');
      const serialized = register1.serialize();
      const deserialized = LWWRegister.deserialize<string>(serialized);

      expect(deserialized.get()).toBe('test-value');
      expect(deserialized.nodeId).toBe('node1');
    });
  });

  describe('VerificationCRDT', () => {
    let verification1: VerificationCRDT;
    let verification2: VerificationCRDT;

    beforeEach(() => {
      verification1 = new VerificationCRDT('node1');
      verification2 = new VerificationCRDT('node2');
    });

    it('should initialize with default values', () => {
      const report = verification1.toReport();
      expect(report.status).toBe('partial');
      expect(report.nodeId).toBe('node1');
      expect(report.conflicts).toEqual([]);
    });

    it('should update status correctly', () => {
      verification1.updateStatus('passed');
      expect(verification1.toReport().status).toBe('passed');
    });

    it('should handle metrics correctly', () => {
      verification1.updateMetric('performance', 95, ['node1', 'node2']);
      verification1.updateMetric('reliability', 88, ['node1', 'node2']);

      const report = verification1.toReport();
      expect(report.metrics.get('performance')).toBe(95);
      expect(report.metrics.get('reliability')).toBe(88);
    });

    it('should track conflicts correctly', () => {
      verification1.addConflict('timing-mismatch');
      verification1.addConflict('environment-diff');

      const report = verification1.toReport();
      expect(report.conflicts).toContain('timing-mismatch');
      expect(report.conflicts).toContain('environment-diff');
      expect(report.conflicts.length).toBe(2);
    });

    it('should merge verification states correctly', () => {
      verification1.updateStatus('passed');
      verification1.updateMetric('performance', 90, ['node1', 'node2']);
      verification1.addConflict('conflict-1');

      verification2.updateStatus('failed');
      verification2.updateMetric('performance', 85, ['node1', 'node2']);
      verification2.addConflict('conflict-2');

      const changed = verification1.merge(verification2);
      expect(changed).toBe(true);

      const report = verification1.toReport();
      expect(report.metrics.get('performance')).toBe(175); // Sum from G-Counter
      expect(report.conflicts.length).toBe(2); // Union from OR-Set
    });

    it('should serialize and deserialize correctly', () => {
      verification1.updateStatus('passed');
      verification1.updateMetric('score', 95, ['node1']);
      verification1.addConflict('test-conflict');
      verification1.updateMetadata('environment', 'production');

      const serialized = verification1.serialize();
      const deserialized = VerificationCRDT.deserialize(serialized);

      const originalReport = verification1.toReport();
      const deserializedReport = deserialized.toReport();

      expect(deserializedReport.status).toBe(originalReport.status);
      expect(deserializedReport.conflicts).toEqual(originalReport.conflicts);
      expect(deserializedReport.metadata.environment).toBe('production');
    });

    it('should handle complex merge scenarios', () => {
      // Create complex state in verification1
      verification1.updateStatus('passed');
      verification1.updateMetric('cpu', 75, ['node1', 'node2']);
      verification1.updateMetric('memory', 60, ['node1', 'node2']);
      verification1.addConflict('cpu-spike');
      verification1.updateMetadata('version', '1.0.0');

      // Create different state in verification2
      verification2.updateStatus('partial');
      verification2.updateMetric('cpu', 80, ['node1', 'node2']);
      verification2.updateMetric('disk', 45, ['node1', 'node2']);
      verification2.addConflict('memory-leak');
      verification2.updateMetadata('version', '1.0.1');
      verification2.updateMetadata('environment', 'staging');

      // Merge
      verification1.merge(verification2);
      const report = verification1.toReport();

      // Check merged results
      expect(report.metrics.get('cpu')).toBe(155); // 75 + 80
      expect(report.metrics.get('memory')).toBe(60); // Only in verification1
      expect(report.metrics.get('disk')).toBe(45); // Only in verification2
      expect(report.conflicts).toContain('cpu-spike');
      expect(report.conflicts).toContain('memory-leak');
      expect(report.metadata.version).toBe('1.0.1'); // LWW - later timestamp
      expect(report.metadata.environment).toBe('staging');
    });
  });

  describe('CRDT Integration Tests', () => {
    it('should maintain consistency across multiple nodes', async () => {
      const nodes = ['node1', 'node2', 'node3'];
      const counters = nodes.map(nodeId => new GCounter(nodeId, nodes));

      // Simulate concurrent operations
      counters[0].increment(10);
      counters[1].increment(5);
      counters[2].increment(8);

      // All-to-all merge
      for (let i = 0; i < counters.length; i++) {
        for (let j = 0; j < counters.length; j++) {
          if (i !== j) {
            counters[i].merge(counters[j]);
          }
        }
      }

      // All counters should have the same final value
      const expectedValue = 10 + 5 + 8;
      counters.forEach(counter => {
        expect(counter.value()).toBe(expectedValue);
      });
    });

    it('should handle network partition scenarios', () => {
      // Simulate network partition
      const partition1 = [new ORSet<string>('node1'), new ORSet<string>('node2')];
      const partition2 = [new ORSet<string>('node3'), new ORSet<string>('node4')];

      // Operations in partition 1
      partition1[0].add('item1');
      partition1[1].add('item2');
      partition1[0].merge(partition1[1]);
      partition1[1].merge(partition1[0]);

      // Operations in partition 2
      partition2[0].add('item3');
      partition2[1].add('item1'); // Duplicate
      partition2[0].merge(partition2[1]);
      partition2[1].merge(partition2[0]);

      // Heal partition - merge across partitions
      partition1[0].merge(partition2[0]);
      const finalSet = partition1[0].values();

      expect(finalSet.size).toBe(3);
      expect(finalSet.has('item1')).toBe(true);
      expect(finalSet.has('item2')).toBe(true);
      expect(finalSet.has('item3')).toBe(true);
    });

    it('should maintain causal consistency', () => {
      const register1 = new LWWRegister<string>('node1');
      const register2 = new LWWRegister<string>('node2');

      const baseTime = Date.now();

      // Causally ordered updates
      register1.set('version1', baseTime);
      register1.set('version2', baseTime + 1000);
      register1.set('version3', baseTime + 2000);

      register2.set('concurrent-update', baseTime + 1500);

      // Merge - latest timestamp should win
      register1.merge(register2);
      expect(register1.get()).toBe('version3'); // Latest timestamp

      // Reverse merge
      register2.merge(register1);
      expect(register2.get()).toBe('version3'); // Should converge
    });

    it('should handle high-frequency operations', () => {
      const counter = new GCounter('node1', ['node1']);
      const iterations = 1000;

      // High-frequency increments
      for (let i = 0; i < iterations; i++) {
        counter.increment(1);
      }

      expect(counter.value()).toBe(iterations);

      // Serialize/deserialize should maintain consistency
      const serialized = counter.serialize();
      const deserialized = GCounter.deserialize(serialized);
      expect(deserialized.value()).toBe(iterations);
    });
  });
});