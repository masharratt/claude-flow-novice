/**
 * CFN Loop Memory Pattern Validator Tests
 *
 * Tests for ACL correctness, TTL validation, encryption requirements,
 * and memory key format validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const VALIDATOR_PATH = path.resolve(__dirname, '../../config/hooks/post-edit-cfn-loop-memory.cjs');
const TEST_FILES_DIR = path.resolve(__dirname, '../fixtures/cfn-memory');

describe('CFN Loop Memory Validator', () => {
  beforeEach(() => {
    // Ensure test fixtures directory exists
    if (!fs.existsSync(TEST_FILES_DIR)) {
      fs.mkdirSync(TEST_FILES_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test files
    if (fs.existsSync(TEST_FILES_DIR)) {
      fs.rmSync(TEST_FILES_DIR, { recursive: true, force: true });
    }
  });

  describe('ACL Validation', () => {
    it('should pass valid Loop 3 memory with ACL 1 (Private)', () => {
      const testFile = createTestFile('valid-loop3.ts', `
        async function storeLoop3Data() {
          await sqlite.memoryAdapter.set('cfn/phase-auth/loop3/agent-coder-1', {
            confidence: 0.85,
            files: ['auth.js']
          }, {
            aclLevel: 1,
            ttl: 2592000,
            encrypted: true
          });
        }
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail Loop 3 memory with wrong ACL level', () => {
      const testFile = createTestFile('invalid-loop3-acl.ts', `
        async function storeLoop3Data() {
          await sqlite.memoryAdapter.set('cfn/phase-auth/loop3/agent-coder-1', {
            confidence: 0.85
          }, {
            aclLevel: 3, // Wrong! Should be 1
            ttl: 2592000
          });
        }
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'acl_mismatch',
            severity: 'error',
            expected: expect.objectContaining({ acl: 1, name: 'Private' }),
            actual: expect.objectContaining({ acl: 3 })
          })
        ])
      );
    });

    it('should pass valid Loop 2 memory with ACL 3 (Swarm)', () => {
      const testFile = createTestFile('valid-loop2.ts', `
        async function storeLoop2Validation() {
          await memory.set('cfn/phase-auth/loop2/consensus', {
            score: 0.92,
            validators: ['reviewer-1', 'security-1']
          }, {
            aclLevel: 3,
            ttl: 7776000
          });
        }
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass valid Loop 4 memory with ACL 4 (Project)', () => {
      const testFile = createTestFile('valid-loop4.ts', `
        async function storeLoop4Decision() {
          await sqlite.memoryAdapter.set('cfn/phase-auth/loop4/decision', {
            decision: 'PROCEED',
            confidence: 0.90
          }, {
            aclLevel: 4,
            ttl: 31536000
          });
        }
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('TTL Validation', () => {
    it('should fail Loop 3 with incorrect TTL', () => {
      const testFile = createTestFile('invalid-loop3-ttl.ts', `
        await memory.set('cfn/phase-auth/loop3/results', data, {
          aclLevel: 1,
          ttl: 7776000, // Wrong! Should be 2592000 (30 days)
          encrypted: true
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'ttl_mismatch',
            expected: expect.objectContaining({ ttl: 2592000, days: 30 }),
            actual: expect.objectContaining({ ttl: 7776000, days: 90 })
          })
        ])
      );
    });

    it('should fail Loop 4 with non-compliant TTL (compliance critical)', () => {
      const testFile = createTestFile('invalid-loop4-ttl.ts', `
        await sqlite.memoryAdapter.set('cfn/phase-auth/loop4/decision', decision, {
          aclLevel: 4,
          ttl: 2592000 // Wrong! Compliance requires 31536000 (365 days)
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'ttl_mismatch',
            severity: 'error', // Error for compliance-critical data
            recommendation: expect.stringContaining('compliance requirement')
          })
        ])
      );
    });

    it('should allow TTL tolerance (±10%)', () => {
      const testFile = createTestFile('ttl-tolerance.ts', `
        await memory.set('cfn/phase-auth/loop3/data', data, {
          aclLevel: 1,
          ttl: 2650000, // 2592000 + 2.2% (within 10% tolerance)
          encrypted: true
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(true);
    });
  });

  describe('Encryption Validation', () => {
    it('should fail Loop 3 memory without encryption', () => {
      const testFile = createTestFile('loop3-no-encryption.ts', `
        await sqlite.memoryAdapter.set('cfn/phase-auth/loop3/sensitive', data, {
          aclLevel: 1,
          ttl: 2592000,
          encrypted: false // Wrong! Loop 3 requires encryption
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'encryption_missing',
            severity: 'error',
            recommendation: expect.stringContaining('must be encrypted')
          })
        ])
      );
    });

    it('should warn when encryption status is unknown', () => {
      const testFile = createTestFile('encryption-unknown.ts', `
        await memory.set('cfn/phase-auth/loop3/data', data, {
          aclLevel: 1,
          ttl: 2592000
          // No encryption flag specified
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'encryption_unknown',
            severity: 'warning'
          })
        ])
      );
    });
  });

  describe('Memory Key Format Validation', () => {
    it('should pass valid phase-loop key format', () => {
      const testFile = createTestFile('valid-key-format.ts', `
        await memory.set('cfn/phase-auth/loop3/agent-results', data, {
          aclLevel: 1,
          ttl: 2592000,
          encrypted: true
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(true);
    });

    it('should pass valid metadata key format', () => {
      const testFile = createTestFile('valid-metadata-key.ts', `
        await sqlite.memoryAdapter.set('cfn/phase-auth/metadata', metadata, {
          aclLevel: 4,
          ttl: 15552000
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(true);
    });

    it('should pass valid sprint key format', () => {
      const testFile = createTestFile('valid-sprint-key.ts', `
        await memory.set('cfn/sprint-user-mgmt/coordination', data, {
          aclLevel: 5,
          ttl: 31536000
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(true);
    });

    it('should fail invalid key format', () => {
      const testFile = createTestFile('invalid-key-format.ts', `
        await memory.set('cfn/invalid/format/here', data, {
          aclLevel: 1,
          ttl: 2592000
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'invalid_key_format',
            severity: 'error',
            recommendation: expect.stringContaining('CFN Loop format')
          })
        ])
      );
    });
  });

  describe('Pattern Detection', () => {
    it('should detect memory.set() pattern', () => {
      const testFile = createTestFile('pattern-memory-set.ts', `
        await memory.set('cfn/phase-auth/loop3/data', data, {
          aclLevel: 1,
          ttl: 2592000,
          encrypted: true
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.validationCount).toBe(1);
    });

    it('should detect sqlite.memoryAdapter.set() pattern', () => {
      const testFile = createTestFile('pattern-sqlite.ts', `
        await sqlite.memoryAdapter.set('cfn/phase-auth/loop2/consensus', data, {
          aclLevel: 3,
          ttl: 7776000
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.validationCount).toBe(1);
    });

    it('should detect object pattern', () => {
      const testFile = createTestFile('pattern-object.ts', `
        const memoryConfig = {
          key: 'cfn/phase-auth/loop4/decision',
          aclLevel: 4,
          ttl: 31536000,
          data: { decision: 'PROCEED' }
        };
      `);

      const result = runValidator(testFile, true);
      expect(result.validationCount).toBeGreaterThan(0);
    });

    it('should handle multiple memory operations', () => {
      const testFile = createTestFile('multiple-operations.ts', `
        // Loop 3 private data
        await memory.set('cfn/phase-auth/loop3/agent-1', data1, {
          aclLevel: 1,
          ttl: 2592000,
          encrypted: true
        });

        // Loop 2 validation
        await sqlite.memoryAdapter.set('cfn/phase-auth/loop2/consensus', data2, {
          aclLevel: 3,
          ttl: 7776000
        });

        // Loop 4 decision
        await memory.set('cfn/phase-auth/loop4/decision', data3, {
          aclLevel: 4,
          ttl: 31536000
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.validationCount).toBe(3);
      expect(result.valid).toBe(true);
    });
  });

  describe('Skip Conditions', () => {
    it('should skip files without CFN memory patterns', () => {
      const testFile = createTestFile('no-cfn-patterns.ts', `
        function regularFunction() {
          const data = { value: 123 };
          return data;
        }
      `);

      const result = runValidator(testFile, true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('No CFN Loop memory patterns detected');
    });

    it('should skip non-existent files gracefully', () => {
      const result = runValidator('/nonexistent/file.ts', true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('File not found');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed valid and invalid operations', () => {
      const testFile = createTestFile('mixed-operations.ts', `
        // Valid Loop 3
        await memory.set('cfn/phase-auth/loop3/valid', data1, {
          aclLevel: 1,
          ttl: 2592000,
          encrypted: true
        });

        // Invalid Loop 3 - wrong ACL
        await memory.set('cfn/phase-auth/loop3/invalid-acl', data2, {
          aclLevel: 3, // Wrong!
          ttl: 2592000,
          encrypted: true
        });

        // Invalid Loop 4 - wrong TTL
        await sqlite.memoryAdapter.set('cfn/phase-auth/loop4/invalid-ttl', data3, {
          aclLevel: 4,
          ttl: 2592000 // Wrong! Should be 31536000
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(false);
      expect(result.validationCount).toBe(3);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });

    it('should provide detailed recommendations', () => {
      const testFile = createTestFile('detailed-recommendations.ts', `
        await memory.set('cfn/phase-auth/loop3/data', data, {
          aclLevel: 4,
          ttl: 31536000
        });
      `);

      const result = runValidator(testFile, true);
      expect(result.valid).toBe(false);
      expect(result.violations[0].recommendation).toBeDefined();
      expect(result.violations[0].recommendation).toContain('Loop 3');
    });
  });

  describe('Performance', () => {
    it('should complete validation in under 1 second', () => {
      const testFile = createTestFile('performance-test.ts', `
        ${'await memory.set("cfn/phase-auth/loop3/data", {}, { aclLevel: 1, ttl: 2592000, encrypted: true });'.repeat(50)}
      `);

      const result = runValidator(testFile, true);
      const executionTime = parseInt(result.executionTime.replace('ms', ''));
      expect(executionTime).toBeLessThan(1000);
    });
  });
});

/**
 * Helper Functions
 */

function createTestFile(filename: string, content: string): string {
  const filePath = path.join(TEST_FILES_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function runValidator(filePath: string, json = false): any {
  try {
    const flags = json ? '--json' : '';
    const output = execSync(`node ${VALIDATOR_PATH} ${filePath} ${flags}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    return json ? JSON.parse(output) : output;
  } catch (error: any) {
    // Validator exits with code 1 on validation failure
    if (error.stdout) {
      const output = error.stdout.toString();
      return json ? JSON.parse(output) : output;
    }
    throw error;
  }
}
