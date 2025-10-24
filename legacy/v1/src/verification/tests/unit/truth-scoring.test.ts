/**
 * Unit Tests for Truth Scoring System
 *
 * Tests the core truth scoring functionality including:
 * - Score calculation algorithms
 * - Evidence validation
 * - Agent reliability tracking
 * - Trend analysis
 */

import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Import the truth scoring system
import TruthScoreCalculator from '../../../../.claude/helpers/truth-score.js';

describe('Truth Scoring System', () => {
  let calculator: any;
  let tempDir: string;
  let originalConfigPath: string;
  let originalMemoryPath: string;

  beforeEach(async () => { try {
    calculator = new TruthScoreCalculator();

    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'truth-scoring-test-'));

    // Override paths to use temp directory
    originalConfigPath = calculator.configPath;
    originalMemoryPath = calculator.memoryPath;

    calculator.configPath = path.join(tempDir, 'verification.json');
    calculator.memoryPath = path.join(tempDir, 'truth-scores');

    await calculator.init();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    // Restore original paths
    calculator.configPath = originalConfigPath;
    calculator.memoryPath = originalMemoryPath;
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Score Calculation', () => {
    jest.setTimeout(10000);
  test('should calculate perfect score with all evidence passing', () => {
      const evidence = {
        test_results: { passed: 10, total: 10 },
        lint_results: { errors: 0 },
        type_results: { errors: 0 },
        build_results: { success: true },
      };

      const score = calculator.calculateScore(evidence);
      expect(score).toBe(1.0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should calculate partial score with mixed evidence', () => {
      const evidence = {
        test_results: { passed: 8, total: 10 }, // 80% pass rate
        lint_results: { errors: 2 }, // Failed
        type_results: { errors: 0 }, // Passed
        build_results: { success: true }, // Passed
      };

      const score = calculator.calculateScore(evidence);

      // Expected: (0.8 * 0.4) + (0 * 0.2) + (1 * 0.2) + (1 * 0.2) = 0.72
      expect(score).toBe(0.72);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle missing evidence gracefully', () => {
      const evidence = {
        test_results: { passed: 5, total: 10 },
        // Missing other evidence types
      };

      const score = calculator.calculateScore(evidence);

      // Only test weight should contribute: 0.5 * 0.4 = 0.2
      expect(score).toBe(0.2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle zero total tests', () => {
      const evidence = {
        test_results: { passed: 0, total: 0 },
        lint_results: { errors: 0 },
        type_results: { errors: 0 },
        build_results: { success: true },
      };

      const score = calculator.calculateScore(evidence);

      // Test score should be 0/1 = 0, others pass: 0 + 0.2 + 0.2 + 0.2 = 0.6
      expect(score).toBe(0.6);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should round scores to two decimal places', () => {
      const evidence = {
        test_results: { passed: 1, total: 3 }, // 0.333...
        lint_results: { errors: 0 },
        type_results: { errors: 0 },
        build_results: { success: true },
      };

      const score = calculator.calculateScore(evidence);

      // Expected: (0.333... * 0.4) + 0.6 = 0.733..., rounded to 0.73
      expect(score).toBe(0.73);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Claim vs Reality Comparison', () => {
    jest.setTimeout(10000);
  test('should identify accurate claims', () => {
      const claim = {
        tests_pass: true,
        no_lint_errors: true,
        no_type_errors: true,
        builds_successfully: true,
      };

      const reality = {
        tests_pass: true,
        lint_errors: 0,
        type_errors: 0,
        build_success: true,
      };

      const comparison = calculator.compareClaimToReality(claim, reality);

      expect(comparison.discrepancies).toHaveLength(0);
      expect(comparison.truth_score).toBe(1.0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should detect false claims about test results', () => {
      const claim = {
        tests_pass: true,
        no_lint_errors: true,
      };

      const reality = {
        tests_pass: false,
        lint_errors: 0,
      };

      const comparison = calculator.compareClaimToReality(claim, reality);

      expect(comparison.discrepancies).toContain('Claimed tests pass but they fail');
      expect(comparison.truth_score).toBe(0.5); // 1 out of 2 claims accurate
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should detect false claims about lint errors', () => {
      const claim = {
        tests_pass: true,
        no_lint_errors: true,
        no_type_errors: true,
      };

      const reality = {
        tests_pass: true,
        lint_errors: 5,
        type_errors: 0,
      };

      const comparison = calculator.compareClaimToReality(claim, reality);

      expect(comparison.discrepancies).toContain('Claimed no lint errors but found 5');
      expect(comparison.truth_score).toBeCloseTo(0.67, 2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should detect multiple false claims', () => {
      const claim = {
        tests_pass: true,
        no_lint_errors: true,
        no_type_errors: true,
        builds_successfully: true,
      };

      const reality = {
        tests_pass: false,
        lint_errors: 3,
        type_errors: 2,
        build_success: false,
      };

      const comparison = calculator.compareClaimToReality(claim, reality);

      expect(comparison.discrepancies).toHaveLength(4);
      expect(comparison.truth_score).toBe(0.0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Truth Score Storage', () => {
    jest.setTimeout(10000);
  test('should store truth score with metadata', async () => { try {
      const agentId = 'test-agent';
      const taskId = 'task-123';
      const score = 0.85;
      const evidence = { test_results: { passed: 8, total: 10 } };

      const filepath = await calculator.storeTruthScore(agentId, taskId, score, evidence);

      expect(filepath).toContain(`${agentId}_${taskId}`);

      // Verify file exists and contains correct data
      const fileContent = await fs.readFile(filepath, 'utf8');
      const data = JSON.parse(fileContent);

      expect(data.agent_id).toBe(agentId);
      expect(data.task_id).toBe(taskId);
      expect(data.truth_score).toBe(score);
      expect(data.evidence).toEqual(evidence);
      expect(data.threshold).toBe(calculator.config.truth_threshold);
      expect(data.passed).toBe(score >= calculator.config.truth_threshold);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should create memory directory if it does not exist', async () => { try {
      const agentId = 'test-agent';
      const taskId = 'task-456';

      // Ensure directory doesn't exist
      await fs.rm(calculator.memoryPath, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await calculator.storeTruthScore(agentId, taskId, 0.9, {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Directory should now exist
      const stats = await fs.stat(calculator.memoryPath);
      expect(stats.isDirectory()).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Agent History Tracking', () => {
    beforeEach(async () => { try {
      // Create test history files
      await fs.mkdir(calculator.memoryPath, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const testData = [
        { agent_id: 'agent-1', task_id: 'task-1', truth_score: 0.9, timestamp: 1000, passed: true },
        {
          agent_id: 'agent-1',
          task_id: 'task-2',
          truth_score: 0.7,
          timestamp: 2000,
          passed: false,
        },
        {
          agent_id: 'agent-1',
          task_id: 'task-3',
          truth_score: 0.95,
          timestamp: 3000,
          passed: true,
        },
        {
          agent_id: 'agent-2',
          task_id: 'task-4',
          truth_score: 0.6,
          timestamp: 4000,
          passed: false,
        },
      ];

      for (const data of testData) {
        const filename = `${data.agent_id}_${data.task_id}_${data.timestamp}.json`;
        await fs.writeFile(
          path.join(calculator.memoryPath, filename),
          JSON.stringify(data, null, 2),
        );
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should retrieve agent history in chronological order', async () => { try {
      const history = await calculator.getAgentHistory('agent-1');

      expect(history).toHaveLength(3);
      expect(history[0].timestamp).toBe(3000); // Most recent first
      expect(history[1].timestamp).toBe(2000);
      expect(history[2].timestamp).toBe(1000);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should limit history results', async () => { try {
      const history = await calculator.getAgentHistory('agent-1', 2);

      expect(history).toHaveLength(2);
      expect(history[0].timestamp).toBe(3000);
      expect(history[1].timestamp).toBe(2000);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return empty array for non-existent agent', async () => { try {
      const history = await calculator.getAgentHistory('non-existent-agent');

      expect(history).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Agent Reliability Calculation', () => {
    beforeEach(async () => { try {
      // Create comprehensive test data for reliability calculation
      await fs.mkdir(calculator.memoryPath, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const scores = [0.9, 0.8, 0.85, 0.75, 0.9, 0.95, 0.7, 0.85, 0.8, 0.9];
      const threshold = calculator.config.truth_threshold;

      for (let i = 0; i < scores.length; i++) {
        const data = {
          agent_id: 'reliability-agent',
          task_id: `task-${i}`,
          truth_score: scores[i],
          timestamp: 1000 + i * 1000,
          passed: scores[i] >= threshold,
        };

        const filename = `reliability-agent_task-${i}_${data.timestamp}.json`;
        await fs.writeFile(
          path.join(calculator.memoryPath, filename),
          JSON.stringify(data, null, 2),
        );
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should calculate agent reliability metrics', async () => { try {
      const reliability = await calculator.calculateAgentReliability('reliability-agent');

      expect(reliability.reliability).toBeGreaterThan(0.8);
      expect(reliability.pass_rate).toBeGreaterThan(0.7);
      expect(reliability.sample_size).toBe(10);
      expect(['improving', 'declining', 'stable']).toContain(reliability.trend);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle agent with no history', async () => { try {
      const reliability = await calculator.calculateAgentReliability('new-agent');

      expect(reliability.reliability).toBe(1.0);
      expect(reliability.sample_size).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Trend Analysis', () => {
    jest.setTimeout(10000);
  test('should detect improving trend', () => {
      const history = [
        { truth_score: 0.9 },
        { truth_score: 0.85 },
        { truth_score: 0.9 },
        { truth_score: 0.7 },
        { truth_score: 0.75 },
        { truth_score: 0.65 },
      ];

      const trend = calculator.calculateTrend(history);
      expect(trend).toBe('improving');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should detect declining trend', () => {
      const history = [
        { truth_score: 0.6 },
        { truth_score: 0.65 },
        { truth_score: 0.7 },
        { truth_score: 0.85 },
        { truth_score: 0.9 },
        { truth_score: 0.95 },
      ];

      const trend = calculator.calculateTrend(history);
      expect(trend).toBe('declining');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should detect stable trend', () => {
      const history = [
        { truth_score: 0.8 },
        { truth_score: 0.82 },
        { truth_score: 0.78 },
        { truth_score: 0.81 },
        { truth_score: 0.79 },
        { truth_score: 0.8 },
      ];

      const trend = calculator.calculateTrend(history);
      expect(trend).toBe('stable');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle insufficient data', () => {
      const history = [{ truth_score: 0.8 }];

      const trend = calculator.calculateTrend(history);
      expect(trend).toBe('insufficient_data');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Report Generation', () => {
    beforeEach(async () => { try {
      // Create test data for multiple agents
      await fs.mkdir(calculator.memoryPath, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const testAgents = [
        { id: 'agent-high', scores: [0.9, 0.95, 0.85, 0.9] },
        { id: 'agent-medium', scores: [0.75, 0.8, 0.7, 0.85] },
        { id: 'agent-low', scores: [0.6, 0.55, 0.65, 0.7] },
      ];

      for (const agent of testAgents) {
        for (let i = 0; i < agent.scores.length; i++) {
          const data = {
            agent_id: agent.id,
            task_id: `task-${i}`,
            truth_score: agent.scores[i],
            timestamp: 1000 + i * 1000,
            passed: agent.scores[i] >= calculator.config.truth_threshold,
          };

          const filename = `${agent.id}_task-${i}_${data.timestamp}.json`;
          await fs.writeFile(
            path.join(calculator.memoryPath, filename),
            JSON.stringify(data, null, 2),
          );
        }
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should generate JSON report', async () => { try {
      const report = await calculator.generateReport('json');

      expect(report.generated_at).toBeDefined();
      expect(report.total_verifications).toBe(12);
      expect(Object.keys(report.agents)).toHaveLength(3);

      const highAgent = report.agents['agent-high'];
      expect(highAgent.total_tasks).toBe(4);
      expect(highAgent.average_truth_score).toBeGreaterThan(0.85);
      expect(highAgent.pass_rate).toBeGreaterThan(0.75);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should generate markdown report', async () => { try {
      const report = await calculator.generateReport('markdown');

      expect(typeof report).toBe('string');
      expect(report).toContain('# Truth Score Report');
      expect(report).toContain('## Agent Performance');
      expect(report).toContain('| Agent | Tasks | Avg Truth Score | Pass Rate | Trend |');
      expect(report).toContain('agent-high');
      expect(report).toContain('agent-medium');
      expect(report).toContain('agent-low');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include trend indicators in markdown', async () => { try {
      const report = await calculator.generateReport('markdown');

      // Check for trend emoji indicators
      expect(report).toMatch(/[📈📉➡️]/);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Configuration Management', () => {
    jest.setTimeout(10000);
  test('should use default config when file does not exist', async () => { try {
      const newCalculator = new TruthScoreCalculator();
      newCalculator.configPath = path.join(tempDir, 'non-existent.json');

      await newCalculator.init();

      expect(newCalculator.config.enabled).toBe(false);
      expect(newCalculator.config.mode).toBe('passive');
      expect(newCalculator.config.truth_threshold).toBe(0.8);
      expect(newCalculator.config.weights.tests).toBe(0.4);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should load custom config from file', async () => { try {
      const customConfig = {
        enabled: true,
        mode: 'active',
        truth_threshold: 0.9,
        weights: {
          tests: 0.5,
          lint: 0.25,
          types: 0.15,
          build: 0.1,
        },
      };

      await fs.writeFile(calculator.configPath, JSON.stringify(customConfig, null, 2));

      const newCalculator = new TruthScoreCalculator();
      newCalculator.configPath = calculator.configPath;
      await newCalculator.init();

      expect(newCalculator.config.enabled).toBe(true);
      expect(newCalculator.config.mode).toBe('active');
      expect(newCalculator.config.truth_threshold).toBe(0.9);
      expect(newCalculator.config.weights.tests).toBe(0.5);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Edge Cases and Error Handling', () => {
    jest.setTimeout(10000);
  test('should handle malformed evidence data', () => {
      const evidence = {
        test_results: null,
        lint_results: undefined,
        type_results: 'invalid',
        build_results: { success: 'maybe' },
      };

      // Should not throw and should handle gracefully
      expect(() => calculator.calculateScore(evidence)).not.toThrow();

      const score = calculator.calculateScore(evidence);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle very large numbers in evidence', () => {
      const evidence = {
        test_results: { passed: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER },
        lint_results: { errors: Number.MAX_SAFE_INTEGER },
        type_results: { errors: 0 },
        build_results: { success: true },
      };

      const score = calculator.calculateScore(evidence);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle empty memory directory gracefully', async () => { try {
      const emptyCalculator = new TruthScoreCalculator();
      emptyCalculator.memoryPath = path.join(tempDir, 'empty-memory');

      const history = await emptyCalculator.getAgentHistory('any-agent');
      expect(history).toEqual([]);

      const reliability = await emptyCalculator.calculateAgentReliability('any-agent');
      expect(reliability.reliability).toBe(1.0);
      expect(reliability.sample_size).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
