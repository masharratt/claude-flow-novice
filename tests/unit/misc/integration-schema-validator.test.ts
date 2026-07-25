/**
 * Integration Schema Validator Tests
 *
 * Task: P2-3.2 - JSON Schema Validation Enforcement
 * TDD Approach: Tests written FIRST before implementation
 *
 * Coverage:
 * - 47 integration points across 6 categories
 * - Schema validation and error reporting
 * - Schema versioning and migration
 * - Performance (<50ms validation)
 * - Middleware integration
 */

import { IntegrationSchemaValidator } from '../src/lib/integration-schema-validator';
import { StandardError, ErrorCode } from '../src/lib/errors';
import path from 'path';
import fs from 'fs/promises';

describe('IntegrationSchemaValidator', () => {
  let validator: IntegrationSchemaValidator;

  beforeEach(async () => {
    validator = new IntegrationSchemaValidator({
      schemaPath: path.join(__dirname, '../schemas/integration-points'),
      enableCache: true,
      strictMode: true,
    });
    await validator.initialize();
  });

  afterEach(async () => {
    await validator.shutdown();
  });

  describe('Initialization', () => {
    it('should load all 47 integration point schemas', async () => {
      const schemas = await validator.listSchemas();
      expect(schemas.length).toBe(47);
    });

    it('should validate schema directory structure', async () => {
      const categories = await validator.getCategories();
      expect(categories).toEqual([
        'database-handoffs',
        'file-operations',
        'cfn-loop-communication',
        'phase4-workflow',
        'api-layer',
        'data-format-transformations',
      ]);
    });

    it('should throw error if schema directory does not exist', async () => {
      const invalidValidator = new IntegrationSchemaValidator({
        schemaPath: '/invalid/path',
      });

      await expect(invalidValidator.initialize()).rejects.toThrow(StandardError);
    });

    it('should support custom schema paths', async () => {
      const customValidator = new IntegrationSchemaValidator({
        schemaPath: path.join(__dirname, '../schemas/custom'),
      });

      expect(customValidator.getConfig().schemaPath).toContain('custom');
    });
  });

  describe('Category 1: Database Handoffs (9 points)', () => {
    describe('1.1 Phase 4 → Skills DB: Pattern Deployment', () => {
      const schemaId = 'database-handoffs/pattern-deployment';

      it('should validate valid pattern deployment data', async () => {
        const validData = {
          pattern_id: 'skill-001',
          skill_name: 'test-skill',
          version: '1.0.0',
          content_path: '/path/to/skill.md',
          content_hash: 'abc123def456',
          approved_at: '2025-11-16T12:00:00Z',
          metadata: {
            author: 'system',
            tags: ['automation', 'testing'],
          },
        };

        await expect(
          validator.validate(validData, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should reject invalid data with clear error messages', async () => {
        const invalidData = {
          pattern_id: 123, // Should be string
          skill_name: '', // Should not be empty
        };

        await expect(
          validator.validate(invalidData, schemaId, '1.0.0')
        ).rejects.toThrow(StandardError);

        try {
          await validator.validate(invalidData, schemaId, '1.0.0');
        } catch (error) {
          expect(error).toBeInstanceOf(StandardError);
          expect((error as StandardError).code).toBe(ErrorCode.VALIDATION_FAILED);
          expect((error as StandardError).message).toContain('pattern_id');
          expect((error as StandardError).context?.errors).toBeDefined();
        }
      });

      it('should validate required fields', async () => {
        const missingRequired = {
          skill_name: 'test-skill',
          // Missing pattern_id, version, content_path
        };

        await expect(
          validator.validate(missingRequired, schemaId, '1.0.0')
        ).rejects.toThrow(/required/i);
      });

      it('should validate nested metadata structure', async () => {
        const invalidMetadata = {
          pattern_id: 'skill-001',
          skill_name: 'test-skill',
          version: '1.0.0',
          content_path: '/path/to/skill.md',
          content_hash: 'abc123',
          metadata: 'invalid', // Should be object
        };

        await expect(
          validator.validate(invalidMetadata, schemaId, '1.0.0')
        ).rejects.toThrow(/metadata.*object/i);
      });
    });

    describe('1.2 Phase 4 → Phase 4 (Dual Logging): Execution Metrics', () => {
      const schemaId = 'database-handoffs/execution-metrics';

      it('should validate execution metrics', async () => {
        const validMetrics = {
          execution_id: 'exec-12345',
          skill_id: 'skill-001',
          execution_time_ms: 1250,
          cost_usd: 0.045,
          tokens_avoided: 15000,
          status: 'success',
          timestamp: '2025-11-16T12:00:00Z',
        };

        await expect(
          validator.validate(validMetrics, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should validate numeric ranges', async () => {
        const invalidMetrics = {
          execution_id: 'exec-12345',
          skill_id: 'skill-001',
          execution_time_ms: -100, // Negative not allowed
          cost_usd: 0.045,
          tokens_avoided: 15000,
          status: 'success',
        };

        await expect(
          validator.validate(invalidMetrics, schemaId, '1.0.0')
        ).rejects.toThrow(/execution_time_ms.*positive/i);
      });

      it('should validate enum values for status', async () => {
        const invalidStatus = {
          execution_id: 'exec-12345',
          skill_id: 'skill-001',
          execution_time_ms: 1250,
          cost_usd: 0.045,
          tokens_avoided: 15000,
          status: 'invalid_status', // Not in enum
        };

        await expect(
          validator.validate(invalidStatus, schemaId, '1.0.0')
        ).rejects.toThrow(/status.*success|failure|timeout/i);
      });
    });

    // Additional database handoff tests for points 1.3-1.9
    it('should have schemas for all 9 database handoff points', async () => {
      const dbSchemas = await validator.listSchemas('database-handoffs');
      expect(dbSchemas.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('Category 2: File Operations (11 points)', () => {
    describe('2.1 Pre-Edit Backup Hook', () => {
      const schemaId = 'file-operations/pre-edit-backup';

      it('should validate backup metadata', async () => {
        const validBackup = {
          file_path: '/home/user/src/file.ts',
          backup_path: '/home/user/.backups/agent-123/20251116/file.ts',
          agent_id: 'agent-123',
          timestamp: '2025-11-16T12:00:00Z',
          file_hash: 'sha256:abc123',
          file_size: 1024,
        };

        await expect(
          validator.validate(validBackup, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should validate file paths are absolute', async () => {
        const relativePathBackup = {
          file_path: 'relative/path/file.ts', // Should be absolute
          backup_path: '/home/user/.backups/file.ts',
          agent_id: 'agent-123',
          timestamp: '2025-11-16T12:00:00Z',
          file_hash: 'sha256:abc123',
          file_size: 1024,
        };

        await expect(
          validator.validate(relativePathBackup, schemaId, '1.0.0')
        ).rejects.toThrow(/absolute.*path/i);
      });
    });

    describe('2.4 Agent Outputs to /tmp/', () => {
      const schemaId = 'file-operations/agent-output';

      it('should validate agent output format', async () => {
        const validOutput = {
          agent_id: 'agent-123',
          task_id: 'task-456',
          output_path: '/tmp/agent-123-output.json',
          confidence: 0.85,
          deliverables: [
            { type: 'file', path: '/path/to/deliverable.ts' },
            { type: 'documentation', path: '/docs/guide.md' },
          ],
          timestamp: '2025-11-16T12:00:00Z',
        };

        await expect(
          validator.validate(validOutput, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should validate confidence score range (0.0-1.0)', async () => {
        const invalidConfidence = {
          agent_id: 'agent-123',
          task_id: 'task-456',
          output_path: '/tmp/output.json',
          confidence: 1.5, // Out of range
          deliverables: [],
        };

        await expect(
          validator.validate(invalidConfidence, schemaId, '1.0.0')
        ).rejects.toThrow(/confidence.*0.*1/i);
      });
    });

    it('should have schemas for all 11 file operation points', async () => {
      const fileSchemas = await validator.listSchemas('file-operations');
      expect(fileSchemas.length).toBeGreaterThanOrEqual(11);
    });
  });

  describe('Category 3: CFN Loop Communication (8 points)', () => {
    describe('3.1 Main Chat → Coordinator: CLI Mode Spawning', () => {
      const schemaId = 'cfn-loop-communication/cli-mode-spawn';

      it('should validate coordinator spawn message', async () => {
        const validSpawn = {
          command: 'spawn-coordinator',
          task_id: 'task-123',
          task_description: 'Implement feature X',
          mode: 'standard',
          iteration: 1,
          gate_threshold: 0.75,
          consensus_threshold: 0.90,
          max_iterations: 10,
        };

        await expect(
          validator.validate(validSpawn, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should validate mode enum values', async () => {
        const invalidMode = {
          command: 'spawn-coordinator',
          task_id: 'task-123',
          task_description: 'Implement feature X',
          mode: 'invalid-mode', // Should be mvp/standard/enterprise
        };

        await expect(
          validator.validate(invalidMode, schemaId, '1.0.0')
        ).rejects.toThrow(/mode.*mvp|standard|enterprise/i);
      });
    });

    describe('3.4 Coordinator → Orchestrator: Broadcast Messages', () => {
      const schemaId = 'cfn-loop-communication/broadcast-message';

      it('should validate broadcast message format', async () => {
        const validBroadcast = {
          message_id: 'msg-123',
          task_id: 'task-456',
          iteration: 2,
          message_type: 'context',
          content: {
            previous_attempts: ['attempt1', 'attempt2'],
            feedback: 'Consider edge case X',
          },
          timestamp: '2025-11-16T12:00:00Z',
        };

        await expect(
          validator.validate(validBroadcast, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });
    });

    it('should have schemas for all 8 CFN loop communication points', async () => {
      const cfnSchemas = await validator.listSchemas('cfn-loop-communication');
      expect(cfnSchemas.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Category 4: Phase 4 Workflow (7 points)', () => {
    describe('4.1 Pattern Detection → Skill Generation', () => {
      const schemaId = 'phase4-workflow/pattern-to-skill';

      it('should validate pattern detection output', async () => {
        const validPattern = {
          pattern_id: 'pattern-123',
          pattern_type: 'code-generation',
          frequency: 5,
          confidence: 0.82,
          template: 'skill-template.md',
          variables: {
            skill_name: 'auto-generated-skill',
            description: 'Auto-detected pattern',
          },
          detected_at: '2025-11-16T12:00:00Z',
        };

        await expect(
          validator.validate(validPattern, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should validate frequency is positive integer', async () => {
        const invalidFrequency = {
          pattern_id: 'pattern-123',
          pattern_type: 'code-generation',
          frequency: 0, // Should be >= 1
          confidence: 0.82,
        };

        await expect(
          validator.validate(invalidFrequency, schemaId, '1.0.0')
        ).rejects.toThrow(/frequency.*positive/i);
      });
    });

    it('should have schemas for all 7 Phase 4 workflow points', async () => {
      const phase4Schemas = await validator.listSchemas('phase4-workflow');
      expect(phase4Schemas.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('Category 5: API Layer (7 points)', () => {
    describe('5.1 SkillLoader TypeScript API', () => {
      const schemaId = 'api-layer/skillloader-request';

      it('should validate skill load request', async () => {
        const validRequest = {
          agent_type: 'backend-developer',
          context_tags: ['database', 'api'],
          max_skills: 10,
          cache_ttl: 3600,
          include_metadata: true,
        };

        await expect(
          validator.validate(validRequest, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should validate max_skills range', async () => {
        const tooManySkills = {
          agent_type: 'backend-developer',
          max_skills: 1000, // Exceeds reasonable limit
        };

        await expect(
          validator.validate(tooManySkills, schemaId, '1.0.0')
        ).rejects.toThrow(/max_skills.*limit/i);
      });
    });

    it('should have schemas for all 7 API layer points', async () => {
      const apiSchemas = await validator.listSchemas('api-layer');
      expect(apiSchemas.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('Category 6: Data Format Transformations (5 points)', () => {
    describe('6.1 JSON → YAML → Shell Variables', () => {
      const schemaId = 'data-format-transformations/config-transform';

      it('should validate config transformation', async () => {
        const validConfig = {
          source_format: 'json',
          target_format: 'yaml',
          data: {
            database: {
              host: 'localhost',
              port: 5432,
            },
          },
          preserve_types: true,
        };

        await expect(
          validator.validate(validConfig, schemaId, '1.0.0')
        ).resolves.not.toThrow();
      });

      it('should validate format enum values', async () => {
        const invalidFormat = {
          source_format: 'xml', // Not supported
          target_format: 'yaml',
          data: {},
        };

        await expect(
          validator.validate(invalidFormat, schemaId, '1.0.0')
        ).rejects.toThrow(/source_format.*json|yaml|shell/i);
      });
    });

    it('should have schemas for all 5 data format transformation points', async () => {
      const formatSchemas = await validator.listSchemas('data-format-transformations');
      expect(formatSchemas.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Schema Versioning', () => {
    it('should support multiple schema versions', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';

      const v1Available = await validator.hasSchema(schemaId, '1.0.0');
      expect(v1Available).toBe(true);
    });

    it('should default to latest version if not specified', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const validData = {
        pattern_id: 'skill-001',
        skill_name: 'test-skill',
        version: '1.0.0',
        content_path: '/path/to/skill.md',
        content_hash: 'abc123',
      };

      // Should use latest version automatically
      await expect(
        validator.validate(validData, schemaId)
      ).resolves.not.toThrow();
    });

    it('should throw error for non-existent version', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const data = { pattern_id: 'test' };

      await expect(
        validator.validate(data, schemaId, '99.0.0')
      ).rejects.toThrow(/version.*not found/i);
    });

    it('should list all available versions for a schema', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const versions = await validator.getVersions(schemaId);

      expect(versions).toBeInstanceOf(Array);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions).toContain('1.0.0');
    });
  });

  describe('Schema Migration', () => {
    it('should migrate data from v1.0.0 to v2.0.0', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';

      const v1Data = {
        pattern_id: 'skill-001',
        skill_name: 'test-skill',
        version: '1.0.0',
        content_path: '/path/to/skill.md',
      };

      const migrated = await validator.migrate(v1Data, schemaId, '1.0.0', '2.0.0');

      expect(migrated).toBeDefined();
      // v2.0.0 might add new required fields with defaults
      expect(migrated.version).toBe('1.0.0'); // Data version unchanged
    });

    it('should apply migration transformations', async () => {
      const schemaId = 'database-handoffs/execution-metrics';

      const oldData = {
        execution_id: 'exec-123',
        skill_id: 'skill-001',
        duration_ms: 1250, // Old field name
        cost_cents: 4.5, // Old unit (cents → USD)
      };

      const migrated = await validator.migrate(oldData, schemaId, '1.0.0', '1.1.0');

      expect(migrated.execution_time_ms).toBe(1250); // Renamed field
      expect(migrated.cost_usd).toBe(0.045); // Converted unit
    });

    it('should throw error for incompatible migration', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';

      const data = {
        pattern_id: 'test',
      };

      // Cannot migrate breaking changes without data
      await expect(
        validator.migrate(data, schemaId, '1.0.0', '3.0.0')
      ).rejects.toThrow(/migration.*incompatible/i);
    });

    it('should support custom migration functions', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';

      const customMigration = async (data: any) => {
        return {
          ...data,
          migrated: true,
          migration_date: new Date().toISOString(),
        };
      };

      validator.registerMigration(schemaId, '1.0.0', '1.1.0', customMigration);

      const data = { pattern_id: 'test' };
      const migrated = await validator.migrate(data, schemaId, '1.0.0', '1.1.0');

      expect(migrated.migrated).toBe(true);
      expect(migrated.migration_date).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should validate in <50ms per request', async () => {
      const schemaId = 'database-handoffs/execution-metrics';
      const validData = {
        execution_id: 'exec-12345',
        skill_id: 'skill-001',
        execution_time_ms: 1250,
        cost_usd: 0.045,
        tokens_avoided: 15000,
        status: 'success',
      };

      const startTime = Date.now();
      await validator.validate(validData, schemaId, '1.0.0');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });

    it('should load schemas in <100ms with caching', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';

      const startTime = Date.now();
      await validator.getSchema(schemaId, '1.0.0');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should cache schemas for repeated validations', async () => {
      const schemaId = 'database-handoffs/execution-metrics';
      const validData = {
        execution_id: 'exec-12345',
        skill_id: 'skill-001',
        execution_time_ms: 1250,
        cost_usd: 0.045,
        tokens_avoided: 15000,
        status: 'success',
      };

      // First validation (cold cache)
      await validator.validate(validData, schemaId, '1.0.0');

      // Second validation (should use cache)
      const startTime = Date.now();
      await validator.validate(validData, schemaId, '1.0.0');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10); // Much faster with cache
    });

    it('should handle 1000 concurrent validations', async () => {
      const schemaId = 'database-handoffs/execution-metrics';
      const validData = {
        execution_id: 'exec-12345',
        skill_id: 'skill-001',
        execution_time_ms: 1250,
        cost_usd: 0.045,
        tokens_avoided: 15000,
        status: 'success',
      };

      const promises = Array.from({ length: 1000 }, (_, i) =>
        validator.validate(
          { ...validData, execution_id: `exec-${i}` },
          schemaId,
          '1.0.0'
        )
      );

      const startTime = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete 1000 validations in reasonable time
      expect(duration).toBeLessThan(5000); // <5s for 1000 validations
    });
  });

  describe('Error Reporting', () => {
    it('should provide detailed error messages', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const invalidData = {
        pattern_id: 123, // Should be string
        skill_name: '', // Should not be empty
        version: 'invalid', // Should match semver pattern
      };

      try {
        await validator.validate(invalidData, schemaId, '1.0.0');
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardError);
        const standardError = error as StandardError;

        expect(standardError.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(standardError.context?.errors).toBeInstanceOf(Array);
        expect(standardError.context?.errors.length).toBeGreaterThan(0);

        // Check error details
        const errors = standardError.context?.errors;
        expect(errors.some((e: any) => e.path.includes('pattern_id'))).toBe(true);
        expect(errors.some((e: any) => e.path.includes('skill_name'))).toBe(true);
        expect(errors.some((e: any) => e.path.includes('version'))).toBe(true);
      }
    });

    it('should include schema ID and version in error context', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const invalidData = { invalid: 'data' };

      try {
        await validator.validate(invalidData, schemaId, '1.0.0');
      } catch (error) {
        const standardError = error as StandardError;
        expect(standardError.context?.schemaId).toBe(schemaId);
        expect(standardError.context?.version).toBe('1.0.0');
      }
    });

    it('should provide suggestions for common mistakes', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const typoData = {
        patern_id: 'skill-001', // Typo: should be pattern_id
        skill_name: 'test-skill',
      };

      try {
        await validator.validate(typoData, schemaId, '1.0.0');
      } catch (error) {
        const standardError = error as StandardError;
        expect(standardError.message).toMatch(/pattern_id.*required/i);
        // Should suggest similar field names
        expect(standardError.context?.suggestions).toContain('pattern_id');
      }
    });
  });

  describe('Batch Validation', () => {
    it('should validate batch of records', async () => {
      const schemaId = 'database-handoffs/execution-metrics';

      const batch = Array.from({ length: 10 }, (_, i) => ({
        execution_id: `exec-${i}`,
        skill_id: 'skill-001',
        execution_time_ms: 1000 + i * 100,
        cost_usd: 0.045,
        tokens_avoided: 15000,
        status: 'success',
      }));

      const results = await validator.validateBatch(batch, schemaId, '1.0.0');

      expect(results.valid).toBe(true);
      expect(results.totalRecords).toBe(10);
      expect(results.validRecords).toBe(10);
      expect(results.invalidRecords).toBe(0);
    });

    it('should report errors for invalid records in batch', async () => {
      const schemaId = 'database-handoffs/execution-metrics';

      const batch = [
        {
          execution_id: 'exec-1',
          skill_id: 'skill-001',
          execution_time_ms: 1000,
          cost_usd: 0.045,
          tokens_avoided: 15000,
          status: 'success',
        },
        {
          execution_id: 'exec-2',
          skill_id: 'skill-001',
          execution_time_ms: -100, // Invalid
          cost_usd: 0.045,
          tokens_avoided: 15000,
          status: 'success',
        },
      ];

      const results = await validator.validateBatch(batch, schemaId, '1.0.0');

      expect(results.valid).toBe(false);
      expect(results.totalRecords).toBe(2);
      expect(results.validRecords).toBe(1);
      expect(results.invalidRecords).toBe(1);
      expect(results.errors[0].index).toBe(1);
      expect(results.errors[0].errors).toBeDefined();
    });

    it('should stop on first error if failFast is enabled', async () => {
      const schemaId = 'database-handoffs/execution-metrics';

      const batch = Array.from({ length: 100 }, (_, i) => ({
        execution_id: `exec-${i}`,
        skill_id: 'skill-001',
        execution_time_ms: i === 5 ? -100 : 1000, // Error at index 5
        cost_usd: 0.045,
        tokens_avoided: 15000,
        status: 'success',
      }));

      const results = await validator.validateBatch(batch, schemaId, '1.0.0', {
        failFast: true,
      });

      expect(results.valid).toBe(false);
      expect(results.errors.length).toBe(1);
      expect(results.errors[0].index).toBe(5);
    });
  });

  describe('Integration with StandardError', () => {
    it('should throw StandardError with VALIDATION_FAILED code', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const invalidData = { invalid: 'data' };

      await expect(
        validator.validate(invalidData, schemaId, '1.0.0')
      ).rejects.toThrow(StandardError);

      try {
        await validator.validate(invalidData, schemaId, '1.0.0');
      } catch (error) {
        expect((error as StandardError).code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });

    it('should include validation errors in context', async () => {
      const schemaId = 'database-handoffs/pattern-deployment';
      const invalidData = { pattern_id: 123 };

      try {
        await validator.validate(invalidData, schemaId, '1.0.0');
      } catch (error) {
        const standardError = error as StandardError;
        expect(standardError.context).toBeDefined();
        expect(standardError.context?.errors).toBeInstanceOf(Array);
        expect(standardError.context?.schemaId).toBe(schemaId);
        expect(standardError.context?.version).toBe('1.0.0');
      }
    });
  });
});

describe('Schema Validation Middleware', () => {
  // Middleware tests will be added once middleware is implemented
  it('should validate request body against schema', () => {
    // TODO: Implement middleware tests
  });

  it('should validate response body against schema', () => {
    // TODO: Implement middleware tests
  });

  it('should return 400 for invalid requests', () => {
    // TODO: Implement middleware tests
  });
});
