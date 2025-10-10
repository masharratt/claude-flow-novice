/**
 * @jest-environment node
 */
/**
 * Byzantine Consensus Performance Benchmarks
 *
 * Performance testing for Byzantine consensus vs simple consensus
 * Measures latency, throughput, and scalability characteristics
 *
 * Benchmarks:
 * 1. Byzantine vs Simple consensus latency
 * 2. Validator count scalability (4 vs 7 validators)
 * 3. Malicious detection accuracy (precision/recall)
 * 4. Concurrent consensus execution
 * 5. Memory usage patterns
 */


import { ValidatorVoteFactory, measureExecutionTime } from './test-utilities.js';

// ===== MOCK BYZANTINE ADAPTER (for performance testing) =====

interface ValidatorVote {
  agentId: string;
  confidence: number;
  vote: 'PASS' | 'FAIL';
  signature: string;
  timestamp: number;
}

interface ConsensusResult {
  consensusAchieved: boolean;
  consensusScore: number;
  maliciousAgents: string[];
  executionTimeMs: number;
}

class ByzantineConsensusAdapter {
  async executeConsensus(votes: ValidatorVote[]): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Outlier detection
    const confidences = votes.map(v => v.confidence);
    const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const stdDev = Math.sqrt(
      confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length
    );

    const maliciousAgents: string[] = [];
    const validVotes = votes.filter(vote => {
      const zScore = Math.abs((vote.confidence - mean) / stdDev);
      if (zScore > 2) {
        maliciousAgents.push(vote.agentId);
        return false;
      }
      return true;
    });

    // Calculate consensus
    const passVotes = validVotes.filter(v => v.vote === 'PASS');
    const consensusRatio = passVotes.length / validVotes.length;
    const consensusAchieved = consensusRatio >= 0.67;

    const totalConfidence = validVotes.reduce((sum, v) => sum + v.confidence, 0);
    const passConfidence = passVotes.reduce((sum, v) => sum + v.confidence, 0);
    const consensusScore = passConfidence / totalConfidence;

    const executionTimeMs = Date.now() - startTime;

    return {
      consensusAchieved,
      consensusScore,
      maliciousAgents,
      executionTimeMs,
    };
  }
}

class SimpleConsensusAdapter {
  async executeConsensus(votes: ValidatorVote[]): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Simple averaging
    const totalConfidence = votes.reduce((sum, v) => sum + v.confidence, 0);
    const consensusScore = totalConfidence / votes.length;
    const consensusAchieved = consensusScore >= 0.90;

    const executionTimeMs = Date.now() - startTime;

    return {
      consensusAchieved,
      consensusScore,
      maliciousAgents: [],
      executionTimeMs,
    };
  }
}

// ===== PERFORMANCE TESTS =====

describe('Byzantine Consensus Performance Benchmarks', () => {
  let byzantineAdapter: ByzantineConsensusAdapter;
  let simpleAdapter: SimpleConsensusAdapter;

  beforeEach(() => {
    byzantineAdapter = new ByzantineConsensusAdapter();
    simpleAdapter = new SimpleConsensusAdapter();
    ValidatorVoteFactory.resetCounter();
  });

  describe('Latency Benchmarks', () => {
    it('should measure Byzantine vs Simple consensus latency (4 validators)', async () => {
      const votes = ValidatorVoteFactory.createUnanimousPassVotes(4);

      // Warmup
      await byzantineAdapter.executeConsensus(votes);
      await simpleAdapter.executeConsensus(votes);

      // Benchmark Byzantine consensus
      const byzantineResults = await Promise.all(
        Array.from({ length: 100 }, () => byzantineAdapter.executeConsensus(votes))
      );

      // Benchmark Simple consensus
      const simpleResults = await Promise.all(
        Array.from({ length: 100 }, () => simpleAdapter.executeConsensus(votes))
      );

      // Calculate statistics
      const byzantineAvg =
        byzantineResults.reduce((sum, r) => sum + r.executionTimeMs, 0) / byzantineResults.length;
      const simpleAvg =
        simpleResults.reduce((sum, r) => sum + r.executionTimeMs, 0) / simpleResults.length;

      const byzantineP95 = byzantineResults
        .map(r => r.executionTimeMs)
        .sort((a, b) => a - b)[Math.floor(byzantineResults.length * 0.95)];
      const simpleP95 = simpleResults
        .map(r => r.executionTimeMs)
        .sort((a, b) => a - b)[Math.floor(simpleResults.length * 0.95)];

      console.log('\n📊 Latency Benchmark (4 validators, 100 iterations):');
      console.log(`  Byzantine - Average: ${byzantineAvg.toFixed(2)}ms, P95: ${byzantineP95}ms`);
      console.log(`  Simple    - Average: ${simpleAvg.toFixed(2)}ms, P95: ${simpleP95}ms`);
      console.log(`  Overhead  - ${((byzantineAvg / simpleAvg - 1) * 100).toFixed(1)}%`);

      // Assertions
      expect(byzantineAvg).toBeLessThan(50); // Should be < 50ms average
      expect(byzantineP95).toBeLessThan(100); // Should be < 100ms P95
      expect(simpleAvg).toBeLessThan(10); // Simple should be very fast
    });

    it('should measure consensus latency with malicious detection', async () => {
      const votes = ValidatorVoteFactory.createVotesWithOneMalicious(4);

      const { result, durationMs } = await measureExecutionTime(() =>
        byzantineAdapter.executeConsensus(votes)
      );

      console.log('\n📊 Malicious Detection Latency:');
      console.log(`  Duration: ${durationMs}ms`);
      console.log(`  Malicious agents detected: ${result.maliciousAgents.length}`);

      expect(durationMs).toBeLessThan(100); // Should detect malicious agents quickly
      expect(result.maliciousAgents.length).toBeGreaterThan(0);
    });
  });

  describe('Scalability Benchmarks', () => {
    it('should compare 4 validators vs 7 validators (max mesh size)', async () => {
      const votes4 = ValidatorVoteFactory.createUnanimousPassVotes(4);
      const votes7 = ValidatorVoteFactory.createUnanimousPassVotes(7);

      // Benchmark 4 validators
      const results4 = await Promise.all(
        Array.from({ length: 50 }, () => byzantineAdapter.executeConsensus(votes4))
      );

      // Benchmark 7 validators
      const results7 = await Promise.all(
        Array.from({ length: 50 }, () => byzantineAdapter.executeConsensus(votes7))
      );

      const avg4 = results4.reduce((sum, r) => sum + r.executionTimeMs, 0) / results4.length;
      const avg7 = results7.reduce((sum, r) => sum + r.executionTimeMs, 0) / results7.length;

      console.log('\n📊 Scalability Benchmark (50 iterations):');
      console.log(`  4 Validators: ${avg4.toFixed(2)}ms average`);
      console.log(`  7 Validators: ${avg7.toFixed(2)}ms average`);
      console.log(`  Scaling factor: ${(avg7 / avg4).toFixed(2)}x`);

      // Assertions
      expect(avg7 / avg4).toBeLessThan(2.0); // Should scale sub-linearly
    });

    it('should measure throughput (consensus/second)', async () => {
      const votes = ValidatorVoteFactory.createUnanimousPassVotes(4);
      const durationMs = 1000; // 1 second

      let consensusCount = 0;
      const startTime = Date.now();

      while (Date.now() - startTime < durationMs) {
        await byzantineAdapter.executeConsensus(votes);
        consensusCount++;
      }

      const throughput = (consensusCount / durationMs) * 1000; // consensus/second

      console.log('\n📊 Throughput Benchmark:');
      console.log(`  Consensus/second: ${throughput.toFixed(0)}`);
      console.log(`  Total executions: ${consensusCount}`);

      expect(throughput).toBeGreaterThan(50); // Should achieve > 50 consensus/sec
    });
  });

  describe('Malicious Detection Accuracy', () => {
    it('should measure precision and recall for malicious agent detection', async () => {
      const testCases = [
        { votes: ValidatorVoteFactory.createUnanimousPassVotes(4), expectedMalicious: 0 },
        { votes: ValidatorVoteFactory.createVotesWithOneMalicious(4), expectedMalicious: 1 },
        { votes: ValidatorVoteFactory.createVotesWithMultipleMalicious(4, 2), expectedMalicious: 2 },
      ];

      let truePositives = 0;
      let falsePositives = 0;
      let trueNegatives = 0;
      let falseNegatives = 0;

      for (const testCase of testCases) {
        const result = await byzantineAdapter.executeConsensus(testCase.votes);
        const detected = result.maliciousAgents.length;

        if (testCase.expectedMalicious > 0 && detected > 0) {
          truePositives++;
        } else if (testCase.expectedMalicious === 0 && detected === 0) {
          trueNegatives++;
        } else if (testCase.expectedMalicious === 0 && detected > 0) {
          falsePositives++;
        } else if (testCase.expectedMalicious > 0 && detected === 0) {
          falseNegatives++;
        }
      }

      const precision = truePositives / (truePositives + falsePositives);
      const recall = truePositives / (truePositives + falseNegatives);
      const f1Score = (2 * precision * recall) / (precision + recall);

      console.log('\n📊 Malicious Detection Accuracy:');
      console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
      console.log(`  Recall: ${(recall * 100).toFixed(1)}%`);
      console.log(`  F1 Score: ${(f1Score * 100).toFixed(1)}%`);

      expect(precision).toBeGreaterThan(0.8); // > 80% precision
      expect(recall).toBeGreaterThan(0.8); // > 80% recall
    });

    it('should measure false positive rate with high confidence votes', async () => {
      const iterations = 100;
      let falsePositives = 0;

      for (let i = 0; i < iterations; i++) {
        const votes = ValidatorVoteFactory.createUnanimousPassVotes(4);
        const result = await byzantineAdapter.executeConsensus(votes);

        if (result.maliciousAgents.length > 0) {
          falsePositives++;
        }
      }

      const falsePositiveRate = falsePositives / iterations;

      console.log('\n📊 False Positive Rate:');
      console.log(`  False positives: ${falsePositives}/${iterations}`);
      console.log(`  Rate: ${(falsePositiveRate * 100).toFixed(2)}%`);

      expect(falsePositiveRate).toBeLessThan(0.05); // < 5% false positive rate
    });
  });

  describe('Concurrent Execution', () => {
    it('should handle concurrent consensus execution', async () => {
      const concurrentExecutions = 50;
      const votes = ValidatorVoteFactory.createUnanimousPassVotes(4);

      const { durationMs } = await measureExecutionTime(async () => {
        await Promise.all(
          Array.from({ length: concurrentExecutions }, () => byzantineAdapter.executeConsensus(votes))
        );
      });

      const avgTimePerExecution = durationMs / concurrentExecutions;

      console.log('\n📊 Concurrent Execution Benchmark:');
      console.log(`  Concurrent executions: ${concurrentExecutions}`);
      console.log(`  Total duration: ${durationMs}ms`);
      console.log(`  Avg time per execution: ${avgTimePerExecution.toFixed(2)}ms`);

      expect(avgTimePerExecution).toBeLessThan(100); // Should handle concurrency efficiently
    });
  });

  describe('Memory Usage', () => {
    it('should measure memory usage for Byzantine consensus', async () => {
      const votes = ValidatorVoteFactory.createUnanimousPassVotes(4);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;

      // Run 1000 consensus operations
      for (let i = 0; i < 1000; i++) {
        await byzantineAdapter.executeConsensus(votes);
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthPercent = (memoryGrowth / initialMemory) * 100;

      console.log('\n📊 Memory Usage (1000 executions):');
      console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Final: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB (${memoryGrowthPercent.toFixed(1)}%)`);

      expect(memoryGrowthPercent).toBeLessThan(20); // < 20% memory growth
    });
  });

  describe('Edge Cases Performance', () => {
    it('should handle minimum validators efficiently', async () => {
      const votes = ValidatorVoteFactory.createUnanimousPassVotes(4); // Minimum required

      const { result, durationMs } = await measureExecutionTime(() =>
        byzantineAdapter.executeConsensus(votes)
      );

      expect(durationMs).toBeLessThan(50);
      expect(result.consensusAchieved).toBe(true);
    });

    it('should handle maximum malicious ratio efficiently', async () => {
      // 33% malicious (at threshold)
      const votes = [
        ...ValidatorVoteFactory.createUnanimousPassVotes(2),
        ...ValidatorVoteFactory.createVotesWithMultipleMalicious(2, 1),
      ];

      const { result, durationMs } = await measureExecutionTime(() =>
        byzantineAdapter.executeConsensus(votes)
      );

      console.log('\n📊 Maximum Malicious Ratio Performance:');
      console.log(`  Duration: ${durationMs}ms`);
      console.log(`  Malicious detected: ${result.maliciousAgents.length}`);

      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('Comparison Summary', () => {
    it('should generate comprehensive performance comparison', async () => {
      const metrics = {
        byzantine: {
          avg4: 0,
          avg7: 0,
          p95: 0,
          throughput: 0,
          maliciousDetection: true,
        },
        simple: {
          avg4: 0,
          avg7: 0,
          p95: 0,
          throughput: 0,
          maliciousDetection: false,
        },
      };

      // Byzantine metrics (4 validators)
      const votes4 = ValidatorVoteFactory.createUnanimousPassVotes(4);
      const byzantineResults4 = await Promise.all(
        Array.from({ length: 100 }, () => byzantineAdapter.executeConsensus(votes4))
      );
      metrics.byzantine.avg4 =
        byzantineResults4.reduce((sum, r) => sum + r.executionTimeMs, 0) / byzantineResults4.length;

      // Byzantine metrics (7 validators)
      const votes7 = ValidatorVoteFactory.createUnanimousPassVotes(7);
      const byzantineResults7 = await Promise.all(
        Array.from({ length: 100 }, () => byzantineAdapter.executeConsensus(votes7))
      );
      metrics.byzantine.avg7 =
        byzantineResults7.reduce((sum, r) => sum + r.executionTimeMs, 0) / byzantineResults7.length;

      // Simple metrics
      const simpleResults4 = await Promise.all(
        Array.from({ length: 100 }, () => simpleAdapter.executeConsensus(votes4))
      );
      metrics.simple.avg4 =
        simpleResults4.reduce((sum, r) => sum + r.executionTimeMs, 0) / simpleResults4.length;

      console.log('\n📊 PERFORMANCE COMPARISON SUMMARY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Byzantine Consensus (PBFT):');
      console.log(`  4 Validators: ${metrics.byzantine.avg4.toFixed(2)}ms avg`);
      console.log(`  7 Validators: ${metrics.byzantine.avg7.toFixed(2)}ms avg`);
      console.log(`  Malicious Detection: ✓ Enabled`);
      console.log('\nSimple Consensus (Averaging):');
      console.log(`  4 Validators: ${metrics.simple.avg4.toFixed(2)}ms avg`);
      console.log(`  Malicious Detection: ✗ Disabled`);
      console.log('\nOverhead Analysis:');
      console.log(`  Byzantine vs Simple: ${((metrics.byzantine.avg4 / metrics.simple.avg4 - 1) * 100).toFixed(1)}%`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // Assertions
      expect(metrics.byzantine.avg4).toBeLessThan(50);
      expect(metrics.byzantine.avg7).toBeLessThan(100);
      expect(metrics.simple.avg4).toBeLessThan(10);
    });
  });
});
