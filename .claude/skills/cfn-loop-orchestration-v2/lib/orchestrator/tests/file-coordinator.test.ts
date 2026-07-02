/**
 * FileCoordinator Tests
 * Covers done-signaling, result round-trips, feedback round-trips, and
 * path-traversal sanitization.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileCoordinator } from '../src/coordination/file-coordinator';
import type { WorkerResult, IterationFeedbackData } from '../src/coordination/coordinator';

describe('FileCoordinator', () => {
  let runDir: string;
  let coordinator: FileCoordinator;
  const originalRunDir = process.env.CFN_RUN_DIR;

  beforeEach(() => {
    runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-coordinator-test-'));
    process.env.CFN_RUN_DIR = runDir;
    coordinator = new FileCoordinator();
  });

  afterEach(() => {
    fs.rmSync(runDir, { recursive: true, force: true });
    if (originalRunDir === undefined) {
      delete process.env.CFN_RUN_DIR;
    } else {
      process.env.CFN_RUN_DIR = originalRunDir;
    }
  });

  const sampleResult: WorkerResult = {
    testResult: { pass: 10, fail: 0, skip: 1 },
    confidence: 0.9,
    deliverables: ['src/foo.ts', 'tests/foo.test.ts'],
  };

  const sampleFeedback: IterationFeedbackData = {
    gate_pass_rate: '0.9',
    consensus_average: '0.85',
    reasons: 'looks good',
  };

  describe('baseDir', () => {
    it('returns a path rooted under CFN_RUN_DIR', () => {
      const dir = coordinator.baseDir('task-1');
      expect(dir).toBe(path.join(runDir, 'task-1'));
    });
  });

  describe('signalDone / waitForDone', () => {
    it('resolves with the agent once it signals done', async () => {
      coordinator.signalDone('task-1', 'agent-a');

      const result = await coordinator.waitForDone('task-1', ['agent-a'], 1);

      expect(result).toEqual(['agent-a']);
    });

    it('returns only the subset that signaled before timeout', async () => {
      coordinator.signalDone('task-1', 'agent-a');
      // agent-b never signals

      const result = await coordinator.waitForDone('task-1', ['agent-a', 'agent-b'], 0.5);

      expect(result).toEqual(['agent-a']);
    });

    it('returns an empty array when nobody signals before timeout', async () => {
      const result = await coordinator.waitForDone('task-1', ['agent-a', 'agent-b'], 0.5);

      expect(result).toEqual([]);
    });

    it('resolves early once all agents have signaled, without waiting the full timeout', async () => {
      coordinator.signalDone('task-1', 'agent-a');
      coordinator.signalDone('task-1', 'agent-b');

      const start = Date.now();
      const result = await coordinator.waitForDone('task-1', ['agent-a', 'agent-b'], 5);
      const elapsedMs = Date.now() - start;

      expect(result.sort()).toEqual(['agent-a', 'agent-b']);
      expect(elapsedMs).toBeLessThan(2000);
    });
  });

  describe('setResult / getResult', () => {
    it('round-trips a valid WorkerResult', () => {
      coordinator.setResult('task-1', 'agent-a', sampleResult);

      const result = coordinator.getResult('task-1', 'agent-a');

      expect(result).toEqual(sampleResult);
    });

    it('returns null when the result file is missing', () => {
      const result = coordinator.getResult('task-1', 'nonexistent-agent');

      expect(result).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      const dir = path.join(coordinator.baseDir('task-1'), 'results');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'agent-a.json'), '{not valid json');

      const result = coordinator.getResult('task-1', 'agent-a');

      expect(result).toBeNull();
    });

    it('returns null when confidence is out of [0,1] range', () => {
      const dir = path.join(coordinator.baseDir('task-1'), 'results');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'agent-a.json'),
        JSON.stringify({ ...sampleResult, confidence: 2 })
      );

      const result = coordinator.getResult('task-1', 'agent-a');

      expect(result).toBeNull();
    });

    it('returns null when deliverables is not an array', () => {
      const dir = path.join(coordinator.baseDir('task-1'), 'results');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'agent-a.json'),
        JSON.stringify({ ...sampleResult, deliverables: 'not-an-array' })
      );

      const result = coordinator.getResult('task-1', 'agent-a');

      expect(result).toBeNull();
    });

    it('returns null when testResult.pass/fail are missing or non-numeric', () => {
      const dir = path.join(coordinator.baseDir('task-1'), 'results');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'agent-a.json'),
        JSON.stringify({ ...sampleResult, testResult: { pass: 'ten', fail: 0 } })
      );

      const result = coordinator.getResult('task-1', 'agent-a');

      expect(result).toBeNull();
    });
  });

  describe('writeFeedback / readFeedback', () => {
    it('round-trips valid feedback', () => {
      coordinator.writeFeedback('task-1', 1, sampleFeedback);

      const feedback = coordinator.readFeedback('task-1', 1);

      expect(feedback).toEqual(sampleFeedback);
    });

    it('returns null when feedback file is missing', () => {
      const feedback = coordinator.readFeedback('task-1', 99);

      expect(feedback).toBeNull();
    });
  });

  describe('path-traversal sanitization', () => {
    it('does not allow taskId to escape the run directory', () => {
      const maliciousTaskId = '../../etc/passwd';

      const dir = coordinator.baseDir(maliciousTaskId);

      expect(dir.startsWith(runDir + path.sep) || dir === runDir).toBe(true);
      expect(dir).not.toContain('..');
    });

    it('does not allow agentId to escape the results directory via signalDone', () => {
      const maliciousAgentId = '../../../tmp/evil';

      coordinator.signalDone('task-1', maliciousAgentId);

      const resultsRoot = coordinator.baseDir('task-1');
      // Walk the done dir and confirm every created file lives under resultsRoot.
      const doneDir = path.join(resultsRoot, 'done');
      const entries = fs.readdirSync(doneDir);
      for (const entry of entries) {
        const full = path.join(doneDir, entry);
        expect(full.startsWith(doneDir + path.sep) || full === doneDir).toBe(true);
        expect(entry).not.toContain('..');
        expect(entry).not.toContain('/');
      }

      // Ensure no file was written outside the sandboxed run dir.
      expect(fs.existsSync('/tmp/evil')).toBe(false);
    });

    it('sanitizes a leading-dot agentId so it cannot resolve to a hidden/relative path', () => {
      coordinator.signalDone('task-1', '.hidden');

      const doneDir = path.join(coordinator.baseDir('task-1'), 'done');
      const entries = fs.readdirSync(doneDir);

      expect(entries.length).toBe(1);
      expect(entries[0]?.startsWith('.')).toBe(false);
    });

    it('round-trips a result even when agentId contains traversal sequences', () => {
      const maliciousAgentId = '../../evil-agent';

      coordinator.setResult('task-1', maliciousAgentId, sampleResult);
      const result = coordinator.getResult('task-1', maliciousAgentId);

      expect(result).toEqual(sampleResult);

      const resultsDir = path.join(coordinator.baseDir('task-1'), 'results');
      const entries = fs.readdirSync(resultsDir);
      expect(entries.length).toBe(1);
      expect(entries[0]).not.toContain('..');
    });
  });
});
