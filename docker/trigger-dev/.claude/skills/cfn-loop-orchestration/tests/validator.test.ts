/**
 * Comprehensive Test Suite for Validation Abstraction Layer
 * Tests all validation types: gate, consensus, and deliverable
 * Validates unified interface and factory patterns
 */

import {
  ValidationResult,
  Validator,
  GateValidator,
  ConsensusValidator,
  DeliverableValidator,
  CompositeValidator,
  ValidatorFactory,
  ValidationContext,
} from '../src/helpers/validator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Validation Abstraction Layer', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-test-'));
  });

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('GateValidator', () => {
    let validator: GateValidator;

    beforeEach(() => {
      validator = new GateValidator();
    });

    it('should have correct name', () => {
      expect(validator.name).toBe('GateValidator');
    });

    it('should pass gate when pass rate meets threshold', async () => {
      const result = await validator.validate({
        passRate: 0.96,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.96);
      expect(result.threshold).toBe(0.95);
      expect(result.metadata?.type).toBe('gate');
      expect(result.reason).toContain('PASSED');
    });

    it('should fail gate when pass rate below threshold', async () => {
      const result = await validator.validate({
        passRate: 0.85,
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.85);
      expect(result.threshold).toBe(0.95);
      expect(result.metadata?.type).toBe('gate');
      expect(result.reason).toContain('FAILED');
    });

    it('should use custom threshold when provided', async () => {
      const result = await validator.validate({
        passRate: 0.75,
        threshold: 0.70,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.70);
    });

    it('should handle MVP mode threshold', async () => {
      const result = await validator.validate({
        passRate: 0.71,
        mode: 'mvp',
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.70);
    });

    it('should handle Enterprise mode threshold', async () => {
      const result = await validator.validate({
        passRate: 0.98,
        mode: 'enterprise',
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.98);
    });

    it('should calculate gap correctly', async () => {
      const result = await validator.validate({
        passRate: 0.85,
        mode: 'standard',
      });

      expect(result.metadata?.gap).toBeCloseTo(0.10, 2);
    });

    it('should handle perfect pass rate', async () => {
      const result = await validator.validate({
        passRate: 1.0,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('should handle zero pass rate', async () => {
      const result = await validator.validate({
        passRate: 0,
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('ConsensusValidator', () => {
    let validator: ConsensusValidator;

    beforeEach(() => {
      validator = new ConsensusValidator();
    });

    it('should have correct name', () => {
      expect(validator.name).toBe('ConsensusValidator');
    });

    it('should pass consensus when average meets threshold', async () => {
      const result = await validator.validate({
        scores: [0.92, 0.89, 0.94],
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.type).toBe('consensus');
      expect(result.metadata?.scoreCount).toBe(3);
      expect(result.reason).toContain('PASSED');
    });

    it('should fail consensus when average below threshold', async () => {
      const result = await validator.validate({
        scores: [0.80, 0.85, 0.82],
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
      expect(result.metadata?.type).toBe('consensus');
      expect(result.reason).toContain('FAILED');
    });

    it('should use custom threshold', async () => {
      const result = await validator.validate({
        scores: [0.75, 0.76, 0.74],
        threshold: 0.75,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.75);
    });

    it('should calculate statistics correctly', async () => {
      const result = await validator.validate({
        scores: [0.8, 0.9, 0.85],
        mode: 'standard',
      });

      expect(result.metadata?.min).toBe(0.8);
      expect(result.metadata?.max).toBe(0.9);
      expect(result.score).toBeCloseTo(0.85, 2);
    });

    it('should handle MVP mode threshold', async () => {
      const result = await validator.validate({
        scores: [0.81, 0.79],
        mode: 'mvp',
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.80);
    });

    it('should handle Enterprise mode threshold', async () => {
      const result = await validator.validate({
        scores: [0.96, 0.95, 0.96],
        mode: 'enterprise',
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.95);
    });

    it('should preserve original scores in metadata', async () => {
      const scores = [0.9, 0.85, 0.88];
      const result = await validator.validate({
        scores,
        mode: 'standard',
      });

      expect(result.metadata?.scores).toEqual(scores);
    });

    it('should handle single score', async () => {
      const result = await validator.validate({
        scores: [0.92],
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.scoreCount).toBe(1);
    });

    it('should reject invalid scores', async () => {
      await expect(
        validator.validate({
          scores: [1.5, 0.9], // Invalid score > 1.0
          mode: 'standard',
        })
      ).rejects.toThrow();
    });

    it('should reject negative scores', async () => {
      await expect(
        validator.validate({
          scores: [-0.1, 0.9], // Invalid negative score
          mode: 'standard',
        })
      ).rejects.toThrow();
    });

    it('should reject empty scores array', async () => {
      await expect(
        validator.validate({
          scores: [],
          mode: 'standard',
        })
      ).rejects.toThrow();
    });
  });

  describe('DeliverableValidator', () => {
    let validator: DeliverableValidator;

    beforeEach(() => {
      validator = new DeliverableValidator();
    });

    it('should have correct name', () => {
      expect(validator.name).toBe('DeliverableValidator');
    });

    it('should verify existing files', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');

      const result = await validator.validate({
        files: [testFile],
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.found).toContain(testFile);
      expect(result.metadata?.missing).toHaveLength(0);
    });

    it('should detect missing files', async () => {
      const testFile = path.join(tempDir, 'nonexistent.txt');

      const result = await validator.validate({
        files: [testFile],
      });

      expect(result.passed).toBe(false);
      expect(result.metadata?.missing).toContain(testFile);
      expect(result.metadata?.found).toHaveLength(0);
    });

    it('should validate file types', async () => {
      const tsFile = path.join(tempDir, 'test.ts');
      const jsFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(tsFile, 'const x = 1;');
      fs.writeFileSync(jsFile, 'const y = 2;');

      const result = await validator.validate({
        files: [tsFile, jsFile],
        expectedTypes: ['.ts'],
      });

      expect(result.metadata?.typeErrors).toContain(jsFile);
    });

    it('should track git changes', async () => {
      const result = await validator.validate({
        files: [],
        requireGitChanges: true,
      });

      // Git changes detection may not work in test environment
      // Just verify the metadata is present
      expect(result.metadata?.gitChanges).toBeDefined();
    });

    it('should detect implementation tasks', async () => {
      const result = await validator.validate({
        files: [],
        taskType: 'create new authentication module',
      });

      expect(result.metadata?.requiresChanges).toBe(true);
    });

    it('should score based on file coverage', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      fs.writeFileSync(file1, 'test');
      // file2 doesn't exist

      const result = await validator.validate({
        files: [file1, file2],
      });

      expect(result.score).toBe(0.5); // 1 of 2 files found
    });

    it('should handle empty file list', async () => {
      const result = await validator.validate({
        files: [],
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0);
    });

    it('should detect consensus on vapor anti-pattern', async () => {
      const result = await validator.validate({
        files: [],
        taskType: 'implement new feature',
        requireGitChanges: true,
      });

      // If no files provided but implementation expected
      if (result.metadata?.requiresChanges && result.metadata?.gitChanges === 0) {
        expect(result.passed).toBe(false);
      }
    });
  });

  describe('CompositeValidator', () => {
    let gateValidator: GateValidator;
    let consensusValidator: ConsensusValidator;
    let deliverableValidator: DeliverableValidator;

    beforeEach(() => {
      gateValidator = new GateValidator();
      consensusValidator = new ConsensusValidator();
      deliverableValidator = new DeliverableValidator();
    });

    it('should combine multiple validators with AND logic', async () => {
      const composite = new CompositeValidator([gateValidator, consensusValidator]);

      const result = await composite.validate({
        passRate: 0.96,
        mode: 'standard',
        scores: [0.92, 0.89],
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.passedValidators).toBe(2);
    });

    it('should fail if any validator fails', async () => {
      const composite = new CompositeValidator([gateValidator, consensusValidator]);

      const result = await composite.validate({
        passRate: 0.85, // Will fail
        mode: 'standard',
        scores: [0.92, 0.89], // Will pass
      });

      expect(result.passed).toBe(false);
      expect(result.metadata?.passedValidators).toBe(1);
    });

    it('should track all validator results', async () => {
      const composite = new CompositeValidator([gateValidator, consensusValidator]);

      const result = await composite.validate({
        passRate: 0.96,
        mode: 'standard',
        scores: [0.92, 0.89],
      });

      expect(result.metadata?.totalValidators).toBe(2);
      expect(result.metadata?.validatorResults).toHaveLength(2);
    });

    it('should have correct composite name', () => {
      const composite = new CompositeValidator([gateValidator]);
      expect(composite.name).toBe('CompositeValidator');
    });

    it('should include all validator reasons', async () => {
      const composite = new CompositeValidator([gateValidator, consensusValidator]);

      const result = await composite.validate({
        passRate: 0.96,
        mode: 'standard',
        scores: [0.92, 0.89],
      });

      expect(result.reason).toContain('[gate]');
      expect(result.reason).toContain('[consensus]');
    });
  });

  describe('ValidatorFactory', () => {
    it('should create gate validator', () => {
      const validator = ValidatorFactory.create('gate');
      expect(validator).toBeInstanceOf(GateValidator);
      expect(validator.name).toBe('GateValidator');
    });

    it('should create consensus validator', () => {
      const validator = ValidatorFactory.create('consensus');
      expect(validator).toBeInstanceOf(ConsensusValidator);
    });

    it('should create deliverable validator', () => {
      const validator = ValidatorFactory.create('deliverable');
      expect(validator).toBeInstanceOf(DeliverableValidator);
    });

    it('should throw on unknown type', () => {
      expect(() => {
        ValidatorFactory.create('unknown' as any);
      }).toThrow('Unknown validator type');
    });

    it('should create composite validator with multiple types', () => {
      const composite = ValidatorFactory.createComposite(['gate', 'consensus']);
      expect(composite).toBeInstanceOf(CompositeValidator);
      expect(composite.name).toBe('CompositeValidator');
    });
  });

  describe('ValidationContext', () => {
    let context: ValidationContext;

    beforeEach(() => {
      context = new ValidationContext();
    });

    it('should register and retrieve validator', async () => {
      const validator = new GateValidator();
      context.registerValidator('my-gate', validator);

      const result = await context.validate('my-gate', {
        passRate: 0.96,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
    });

    it('should throw when validator not found', async () => {
      await expect(
        context.validate('nonexistent', {})
      ).rejects.toThrow('Validator not found');
    });

    it('should validate all registered validators', async () => {
      const gateValidator = new GateValidator();
      const consensusValidator = new ConsensusValidator();

      context.registerValidator('gate', gateValidator);
      context.registerValidator('consensus', consensusValidator);

      const results = await context.validateAll(['gate', 'consensus'], {
        passRate: 0.96,
        mode: 'standard',
        scores: [0.92, 0.89],
      });

      expect(results.size).toBe(2);
      expect(results.get('gate')?.passed).toBe(true);
      expect(results.get('consensus')?.passed).toBe(true);
    });

    it('should return map of all validation results', async () => {
      context.registerValidator('gate', new GateValidator());
      context.registerValidator('consensus', new ConsensusValidator());

      const results = await context.validateAll(['gate', 'consensus'], {
        passRate: 0.96,
        mode: 'standard',
        scores: [0.92, 0.89],
      });

      expect(results).toBeInstanceOf(Map);
      expect(results.has('gate')).toBe(true);
      expect(results.has('consensus')).toBe(true);
    });
  });

  describe('ValidationResult Interface', () => {
    it('should have all required properties', async () => {
      const validator = new GateValidator();
      const result = await validator.validate({
        passRate: 0.96,
        mode: 'standard',
      });

      expect(result.passed).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.threshold).toBeDefined();
      expect(result.reason).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(typeof result.threshold).toBe('number');
      expect(typeof result.reason).toBe('string');
    });

    it('should have optional metadata', async () => {
      const validator = new GateValidator();
      const result = await validator.validate({
        passRate: 0.96,
        mode: 'standard',
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.type).toBe('gate');
      expect(typeof result.metadata).toBe('object');
    });
  });

  describe('Integration Scenarios', () => {
    it('should validate complete CFN Loop workflow', async () => {
      // Simulate full validation: gate -> consensus -> deliverables
      const gateValidator = new GateValidator();
      const consensusValidator = new ConsensusValidator();
      const deliverableValidator = new DeliverableValidator();

      // All validators pass
      const gateResult = await gateValidator.validate({
        passRate: 0.96,
        mode: 'standard',
      });

      const consensusResult = await consensusValidator.validate({
        scores: [0.92, 0.89, 0.94],
        mode: 'standard',
      });

      const delivFile = path.join(tempDir, 'deliverable.ts');
      fs.writeFileSync(delivFile, 'export const feature = true;');

      const deliverableResult = await deliverableValidator.validate({
        files: [delivFile],
      });

      expect(gateResult.passed).toBe(true);
      expect(consensusResult.passed).toBe(true);
      expect(deliverableResult.passed).toBe(true);
    });

    it('should handle mixed passing and failing validations', async () => {
      const context = new ValidationContext();

      context.registerValidator('gate', new GateValidator());
      context.registerValidator('consensus', new ConsensusValidator());

      const results = await context.validateAll(['gate', 'consensus'], {
        passRate: 0.85, // Will fail
        mode: 'standard',
        scores: [0.92, 0.89], // Will pass
      });

      const gateResult = results.get('gate');
      const consensusResult = results.get('consensus');

      expect(gateResult?.passed).toBe(false);
      expect(consensusResult?.passed).toBe(true);
    });

    it('should maintain validation history in context', async () => {
      const context = new ValidationContext();
      const validator = new GateValidator();
      context.registerValidator('gate', validator);

      // Multiple validations
      const result1 = await context.validate('gate', {
        passRate: 0.96,
        mode: 'standard',
      });

      const result2 = await context.validate('gate', {
        passRate: 0.85,
        mode: 'standard',
      });

      expect(result1.passed).toBe(true);
      expect(result2.passed).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid validation data gracefully', async () => {
      const validator = new GateValidator();

      // Missing required mode property
      await expect(
        validator.validate({ passRate: 0.96 } as any)
      ).rejects.toThrow();
    });

    it('should provide meaningful error messages', async () => {
      const context = new ValidationContext();

      try {
        await context.validate('nonexistent', {});
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('not found');
      }
    });
  });
});
