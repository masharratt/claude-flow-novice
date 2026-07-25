/**
 * Unit Tests for CFN Validator
 *
 * Comprehensive test coverage for validation functionality:
 * - Deliverable validation
 * - Success criteria checking
 * - Gate threshold validation
 * - Consensus validation
 * - Vapor detection
 *
 * @module tests/validator
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CFNValidator } from '../src/validator';
import { SuccessCriteria } from '../src/types';

describe('CFNValidator', () => {
  let validator: CFNValidator;
  let tempDir: string;

  beforeEach(() => {
    validator = new CFNValidator({
      mode: 'standard',
      taskId: 'test-task',
    });

    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfn-validator-test-'));
  });

  afterEach(() => {
    // Cleanup temporary files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ===== DELIVERABLE VALIDATION TESTS =====

  describe('validateDeliverables', () => {
    it('should validate that files exist', async () => {
      // Create test files
      const file1 = path.join(tempDir, 'file1.js');
      const file2 = path.join(tempDir, 'file2.ts');
      fs.writeFileSync(file1, 'console.log("test");');
      fs.writeFileSync(file2, 'const x = 1;');

      const result = await validator.validateDeliverables([file1, file2]);

      expect(result.allExist).toBe(true);
      expect(result.existingFiles).toBe(2);
      expect(result.missingFiles).toBe(0);
      expect(result.totalFiles).toBe(2);
      expect(result.deliverables).toHaveLength(2);
      expect(result.deliverables[0].exists).toBe(true);
      expect(result.deliverables[1].exists).toBe(true);
    });

    it('should detect missing files', async () => {
      const file1 = path.join(tempDir, 'exists.js');
      const file2 = path.join(tempDir, 'missing.js');
      fs.writeFileSync(file1, 'code');

      const result = await validator.validateDeliverables([file1, file2]);

      expect(result.allExist).toBe(false);
      expect(result.existingFiles).toBe(1);
      expect(result.missingFiles).toBe(1);
      expect(result.deliverables[0].exists).toBe(true);
      expect(result.deliverables[1].exists).toBe(false);
    });

    it('should capture file size and timestamps', async () => {
      const filePath = path.join(tempDir, 'sized-file.txt');
      const content = 'This is test content';
      fs.writeFileSync(filePath, content);

      const result = await validator.validateDeliverables([filePath]);

      expect(result.deliverables[0].sizeBytes).toBe(content.length);
      expect(result.deliverables[0].lastModified).toBeDefined();
      expect(result.totalSizeBytes).toBe(content.length);
    });

    it('should detect MIME types', async () => {
      const jsFile = path.join(tempDir, 'test.js');
      const tsFile = path.join(tempDir, 'test.ts');
      const jsonFile = path.join(tempDir, 'test.json');
      fs.writeFileSync(jsFile, '{}');
      fs.writeFileSync(tsFile, '{}');
      fs.writeFileSync(jsonFile, '{}');

      const result = await validator.validateDeliverables([
        jsFile,
        tsFile,
        jsonFile,
      ]);

      expect(result.deliverables[0].mimeType).toBe('application/javascript');
      expect(result.deliverables[1].mimeType).toBe('application/typescript');
      expect(result.deliverables[2].mimeType).toBe('application/json');
    });

    it('should handle empty file list', async () => {
      const result = await validator.validateDeliverables([]);

      expect(result.totalFiles).toBe(0);
      expect(result.existingFiles).toBe(0);
      expect(result.allExist).toBe(true);
    });
  });

  // ===== SUCCESS CRITERIA VALIDATION TESTS =====

  describe('checkSuccessCriteria', () => {
    it('should validate file_exists criteria', async () => {
      const file1 = path.join(tempDir, 'required.js');
      fs.writeFileSync(file1, 'code');

      const criteria: SuccessCriteria[] = [
        {
          description: 'Main file exists',
          type: 'file_exists',
          condition: 'file required.js must exist',
          paths: [file1],
        },
      ];

      const result = await validator.checkSuccessCriteria(criteria);

      expect(result.passed).toBe(true);
      expect(result.passedCount).toBe(1);
      expect(result.details[0].passed).toBe(true);
    });

    it('should fail missing file criteria', async () => {
      const criteria: SuccessCriteria[] = [
        {
          description: 'Missing file',
          type: 'file_exists',
          condition: 'missing file must exist',
          paths: [path.join(tempDir, 'missing.js')],
        },
      ];

      const result = await validator.checkSuccessCriteria(criteria);

      expect(result.passed).toBe(false);
      expect(result.failedCount).toBe(1);
      expect(result.details[0].passed).toBe(false);
    });

    it('should validate multiple criteria', async () => {
      const file1 = path.join(tempDir, 'file1.js');
      const file2 = path.join(tempDir, 'file2.js');
      fs.writeFileSync(file1, 'code');
      fs.writeFileSync(file2, 'code');

      const criteria: SuccessCriteria[] = [
        {
          description: 'File 1',
          type: 'file_exists',
          condition: 'file1 exists',
          paths: [file1],
        },
        {
          description: 'File 2',
          type: 'file_exists',
          condition: 'file2 exists',
          paths: [file2],
        },
      ];

      const result = await validator.checkSuccessCriteria(criteria);

      expect(result.passed).toBe(true);
      expect(result.passedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle mixed pass/fail criteria', async () => {
      const existingFile = path.join(tempDir, 'exists.js');
      const missingFile = path.join(tempDir, 'missing.js');
      fs.writeFileSync(existingFile, 'code');

      const criteria: SuccessCriteria[] = [
        {
          description: 'Existing',
          type: 'file_exists',
          condition: 'exists',
          paths: [existingFile],
        },
        {
          description: 'Missing',
          type: 'file_exists',
          condition: 'missing',
          paths: [missingFile],
        },
      ];

      const result = await validator.checkSuccessCriteria(criteria);

      expect(result.passed).toBe(false);
      expect(result.passedCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });
  });

  // ===== GATE VALIDATION TESTS =====

  describe('validateGatePass', () => {
    it('should pass gate when pass rate exceeds threshold (standard mode)', async () => {
      const result = await validator.validateGatePass(0.96, 'standard');

      expect(result.passed).toBe(true);
      expect(result.passRate).toBe(0.96);
      expect(result.threshold).toBe(0.95);
      expect(result.gap).toBe(0);
    });

    it('should fail gate when pass rate below threshold', async () => {
      const result = await validator.validateGatePass(0.94, 'standard');

      expect(result.passed).toBe(false);
      expect(result.passRate).toBe(0.94);
      expect(result.threshold).toBe(0.95);
      expect(result.gap).toBeCloseTo(0.01, 2);
    });

    it('should use MVP mode threshold (0.70)', async () => {
      const result = await validator.validateGatePass(0.75, 'mvp');

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.70);
    });

    it('should use Enterprise mode threshold (0.98)', async () => {
      const result = await validator.validateGatePass(0.99, 'enterprise');

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.98);
    });

    it('should provide meaningful reason messages', async () => {
      const passResult = await validator.validateGatePass(0.96, 'standard');
      const failResult = await validator.validateGatePass(0.94, 'standard');

      expect(passResult.reason).toContain('PASSED');
      expect(failResult.reason).toContain('FAILED');
    });

    it('should handle edge case: pass rate exactly at threshold', async () => {
      const result = await validator.validateGatePass(0.95, 'standard');

      expect(result.passed).toBe(true);
      expect(result.gap).toBe(0);
    });
  });

  // ===== CONSENSUS VALIDATION TESTS =====

  describe('validateConsensus', () => {
    it('should pass consensus when scores exceed threshold', async () => {
      const scores = [0.96, 0.98, 0.97]; // Average: 0.97

      const result = await validator.validateConsensus(scores, 'standard');

      expect(result.passed).toBe(true);
      expect(result.consensusScore).toBeCloseTo(0.97, 2);
      expect(result.threshold).toBe(0.95);
    });

    it('should fail consensus when average below threshold', async () => {
      const scores = [0.90, 0.92, 0.93]; // Average: 0.92

      const result = await validator.validateConsensus(scores, 'standard');

      expect(result.passed).toBe(false);
      expect(result.consensusScore).toBeCloseTo(0.92, 2);
    });

    it('should handle single validator', async () => {
      const result = await validator.validateConsensus([0.95], 'standard');

      expect(result.passed).toBe(true);
      expect(result.consensusScore).toBe(0.95);
      expect(result.validatorCount).toBe(1);
    });

    it('should handle multiple validators', async () => {
      const scores = [0.96, 0.97, 0.98, 0.99, 0.95];

      const result = await validator.validateConsensus(scores, 'standard');

      expect(result.validatorCount).toBe(5);
      expect(result.scores).toEqual(scores);
    });

    it('should throw error on empty scores', async () => {
      await expect(
        validator.validateConsensus([], 'standard')
      ).rejects.toThrow();
    });
  });

  // ===== VAPOR DETECTION TESTS =====

  describe('detectConsensusOnVapor', () => {
    it('should detect vapor when completion claimed but files missing', async () => {
      const agentOutput = 'Task completed successfully. All files have been created.';
      const deliverables = [
        path.join(tempDir, 'missing1.js'),
        path.join(tempDir, 'missing2.js'),
      ];

      const result = await validator.detectConsensusOnVapor(
        agentOutput,
        deliverables
      );

      expect(result.detected).toBe(true);
      expect(result.claimsCompletion).toBe(true);
      expect(result.deliverablesMissing).toBe(true);
      expect(result.missingDeliverables).toHaveLength(2);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should not detect vapor when files exist', async () => {
      const file1 = path.join(tempDir, 'file1.js');
      fs.writeFileSync(file1, 'code');

      const agentOutput = 'Task completed successfully. Created file1.js';
      const deliverables = [file1];

      const result = await validator.detectConsensusOnVapor(
        agentOutput,
        deliverables
      );

      expect(result.detected).toBe(false);
      expect(result.deliverablesMissing).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should not detect vapor when completion not claimed', async () => {
      const agentOutput = 'Working on the task...';
      const deliverables = [path.join(tempDir, 'missing.js')];

      const result = await validator.detectConsensusOnVapor(
        agentOutput,
        deliverables
      );

      expect(result.detected).toBe(false);
      expect(result.claimsCompletion).toBe(false);
    });

    it('should recognize various completion keywords', async () => {
      const keywords = ['completed', 'done', 'finished', 'success', 'delivered', 'created'];
      const deliverables = [path.join(tempDir, 'missing.js')];

      for (const keyword of keywords) {
        const agentOutput = `Task ${keyword} successfully`;
        const result = await validator.detectConsensusOnVapor(
          agentOutput,
          deliverables
        );
        expect(result.claimsCompletion).toBe(true);
      }
    });

    it('should calculate confidence based on missing file ratio', async () => {
      const deliverables = [
        path.join(tempDir, 'missing1.js'),
        path.join(tempDir, 'missing2.js'),
      ];

      // Create one file
      fs.writeFileSync(deliverables[0], 'code');

      const agentOutput = 'Task completed';
      const result = await validator.detectConsensusOnVapor(
        agentOutput,
        deliverables
      );

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeCloseTo(0.5, 1); // 1/2 files missing
    });

    it('should truncate long agent output for privacy', async () => {
      const longOutput = 'x'.repeat(1000);
      const deliverables = [path.join(tempDir, 'missing.js')];

      const agentOutput = `${longOutput} completed`;
      const result = await validator.detectConsensusOnVapor(
        agentOutput,
        deliverables
      );

      expect(result.agentOutput.length).toBeLessThanOrEqual(500);
    });
  });

  // ===== COMPREHENSIVE VALIDATION TESTS =====

  describe('performValidation', () => {
    it('should validate all aspects together', async () => {
      const file1 = path.join(tempDir, 'file1.js');
      fs.writeFileSync(file1, 'code');

      const result = await validator.performValidation({
        deliverables: [file1],
        passRate: 0.96,
        consensusScores: [0.97, 0.98],
        agentOutput: 'Task completed successfully',
        successCriteria: [
          {
            description: 'File exists',
            type: 'file_exists',
            condition: 'file1 must exist',
            paths: [file1],
          },
        ],
      });

      expect(result.passed).toBe(true);
      expect(result.deliverables?.allExist).toBe(true);
      expect(result.gate?.passed).toBe(true);
      expect(result.consensus?.passed).toBe(true);
      expect(result.successCriteria?.passed).toBe(true);
      expect(result.vapor?.detected).toBe(false);
    });

    it('should fail when vapor is detected', async () => {
      const result = await validator.performValidation({
        deliverables: [path.join(tempDir, 'missing.js')],
        agentOutput: 'Task completed',
      });

      expect(result.passed).toBe(false);
      expect(result.vapor?.detected).toBe(true);
      expect(result.errors).toHaveLength(1);
    });

    it('should collect warnings for missing files', async () => {
      const result = await validator.performValidation({
        deliverables: [
          path.join(tempDir, 'missing1.js'),
          path.join(tempDir, 'missing2.js'),
        ],
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('missing');
    });

    it('should handle partial failures gracefully', async () => {
      const file1 = path.join(tempDir, 'exists.js');
      fs.writeFileSync(file1, 'code');

      const result = await validator.performValidation({
        deliverables: [file1, path.join(tempDir, 'missing.js')],
        passRate: 0.50, // Below standard threshold
      });

      expect(result.passed).toBe(false);
      expect(result.deliverables?.missingFiles).toBe(1);
      expect(result.gate?.passed).toBe(false);
    });
  });

  // ===== EDGE CASES AND ERROR HANDLING =====

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const result = await validator.performValidation({
        consensusScores: [], // Empty scores will cause error
        agentOutput: 'Test',
        deliverables: [],
      });

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include error details in validation result', async () => {
      const result = await validator.performValidation({
        consensusScores: [], // Will error
      });

      expect(result.errors[0]).toBeDefined();
      expect(result.errors[0].code).toBe('CONSENSUS_VALIDATION_FAILED');
    });
  });

  // ===== MODE THRESHOLD TESTS =====

  describe('Mode Thresholds', () => {
    it('should apply MVP threshold (0.70)', async () => {
      const mvpValidator = new CFNValidator({
        mode: 'mvp',
        taskId: 'mvp-test',
      });

      const result = await mvpValidator.validateGatePass(0.72);

      expect(result.threshold).toBe(0.70);
      expect(result.passed).toBe(true);
    });

    it('should apply Standard threshold (0.95)', async () => {
      const result = await validator.validateGatePass(0.96);

      expect(result.threshold).toBe(0.95);
      expect(result.passed).toBe(true);
    });

    it('should apply Enterprise threshold (0.98)', async () => {
      const enterpriseValidator = new CFNValidator({
        mode: 'enterprise',
        taskId: 'enterprise-test',
      });

      const result = await enterpriseValidator.validateGatePass(0.99);

      expect(result.threshold).toBe(0.98);
      expect(result.passed).toBe(true);
    });
  });
});

// Export for test runner
export {};
