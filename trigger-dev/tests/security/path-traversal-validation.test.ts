/**
 * Security Test: Path Traversal Vulnerability (CVSS 9.1)
 *
 * Target: taskId validation in cfn-deliverable and test utilities
 * Vulnerability: Unsanitized taskId in file path construction
 * Attack Vector: Malicious taskId like "../../etc/passwd"
 * Impact: Arbitrary file write/read outside intended directory
 *
 * TDD Protocol: All tests MUST FAIL before fix, PASS after fix
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { validateTaskId, sanitizeTaskId } from '../../src/utils/path-validation';

/**
 * Construct safe deliverable path
 * MUST validate taskId before path construction
 */
export function getDeliverablePath(taskId: string, filename: string): string {
  // Validate taskId BEFORE path construction
  validateTaskId(taskId);

  // Validate filename to prevent subdirectory traversal
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error(`Invalid filename: contains unsafe characters. Got: ${filename}`);
  }

  const baseDir = '/tmp/trigger-dev-deliverables';
  return path.join(baseDir, taskId, filename);
}

describe('Security: Path Traversal Prevention', () => {
  describe('validateTaskId', () => {
    it('should accept valid taskIds with alphanumeric characters', () => {
      expect(() => validateTaskId('task-123')).not.toThrow();
      expect(() => validateTaskId('backend_developer')).not.toThrow();
      expect(() => validateTaskId('CFN123ABC')).not.toThrow();
      expect(() => validateTaskId('task')).not.toThrow();
    });

    it('should accept valid taskIds with hyphens and underscores', () => {
      expect(() => validateTaskId('task-id-1')).not.toThrow();
      expect(() => validateTaskId('task_id_1')).not.toThrow();
      expect(() => validateTaskId('task-id_123')).not.toThrow();
    });

    it('should reject taskId with path traversal attempt (..)', () => {
      expect(() => validateTaskId('../../etc/passwd')).toThrow(
        'Invalid taskId format: contains unsafe characters'
      );
      expect(() => validateTaskId('..')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('../../../root')).toThrow(
        'Invalid taskId format: contains unsafe characters'
      );
    });

    it('should reject taskId with forward slash (directory separator)', () => {
      expect(() => validateTaskId('task/name')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('/tmp/evil')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('task/id')).toThrow('Invalid taskId format: contains unsafe characters');
    });

    it('should reject taskId with backslash (Windows directory separator)', () => {
      expect(() => validateTaskId('task\\name')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('..\\..\\windows\\system32')).toThrow(
        'Invalid taskId format: contains unsafe characters'
      );
    });

    it('should reject taskId with null byte injection', () => {
      expect(() => validateTaskId('task\x00name')).toThrow('Invalid taskId format: contains unsafe characters');
    });

    it('should reject taskId with special shell characters', () => {
      expect(() => validateTaskId('task;rm -rf /')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('$(cat /etc/passwd)')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('`whoami`')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('task | cat /etc/passwd')).toThrow(
        'Invalid taskId format: contains unsafe characters'
      );
    });

    it('should reject empty taskId', () => {
      expect(() => validateTaskId('')).toThrow('Invalid taskId: expected non-empty string');
      expect(() => validateTaskId('')).toThrow('non-empty');
    });

    it('should reject non-string taskId', () => {
      expect(() => validateTaskId(null as any)).toThrow('Invalid taskId: expected non-empty string');
      expect(() => validateTaskId(undefined as any)).toThrow('Invalid taskId: expected non-empty string');
      expect(() => validateTaskId(123 as any)).toThrow('Invalid taskId: expected non-empty string');
    });

    it('should reject taskId exceeding maximum length', () => {
      const longTaskId = 'a'.repeat(256);
      expect(() => validateTaskId(longTaskId)).toThrow('exceeds maximum length (255 chars)');
    });

    it('should accept taskId at maximum safe length', () => {
      const maxTaskId = 'a'.repeat(255);
      expect(() => validateTaskId(maxTaskId)).not.toThrow();
    });

    it('should reject taskId with dot (hidden files)', () => {
      expect(() => validateTaskId('.bashrc')).toThrow('Invalid taskId format: contains unsafe characters');
      expect(() => validateTaskId('task.id')).toThrow('Invalid taskId format: contains unsafe characters');
    });

    it('should reject taskId with percent encoding', () => {
      expect(() => validateTaskId('task%2e%2e')).toThrow('Invalid taskId format: contains unsafe characters');
    });
  });

  describe('sanitizeTaskId', () => {
    it('should remove special characters but preserve safe ones', () => {
      expect(sanitizeTaskId('task-123')).toBe('task-123');
      expect(sanitizeTaskId('task_id')).toBe('task_id');
    });

    it('should remove path traversal characters', () => {
      expect(sanitizeTaskId('../../task')).toBe('task');
      expect(sanitizeTaskId('../task')).toBe('task');
    });

    it('should remove directory separators', () => {
      expect(sanitizeTaskId('task/id')).toBe('taskid');
      expect(sanitizeTaskId('task\\id')).toBe('taskid');
    });

    it('should handle shell injection attempts', () => {
      const result = sanitizeTaskId('$(rm -rf /)');
      expect(result).toBe('rm-rf'); // Preserves hyphens which are safe
    });
  });

  describe('getDeliverablePath', () => {
    it('should construct valid path for safe taskId', () => {
      const result = getDeliverablePath('task-123', 'output.txt');
      expect(result).toBe('/tmp/trigger-dev-deliverables/task-123/output.txt');
    });

    it('should reject malicious taskId in path construction', () => {
      expect(() => getDeliverablePath('../../etc/passwd', 'exploit.txt')).toThrow(
        'Invalid taskId format'
      );
    });

    it('should reject malicious filename in path construction', () => {
      expect(() => getDeliverablePath('task-123', '../../../etc/passwd')).toThrow('Invalid filename');
      expect(() => getDeliverablePath('task-123', 'file/../../evil.txt')).toThrow('Invalid filename');
    });

    it('should normalize the path correctly', () => {
      const result = getDeliverablePath('my-task', 'results.json');
      expect(result).toBe('/tmp/trigger-dev-deliverables/my-task/results.json');
    });

    it('should prevent absolute path bypass', () => {
      expect(() => getDeliverablePath('task-123', '/etc/passwd')).toThrow('Invalid filename');
    });
  });

  describe('Real-world attack scenarios', () => {
    it('Scenario 1: Arbitrary file write to /etc/passwd', () => {
      expect(() => getDeliverablePath('../../etc', 'passwd')).toThrow('Invalid taskId format');
    });

    it('Scenario 2: Escape to parent directory', () => {
      expect(() => getDeliverablePath('../../../root/.ssh/id_rsa', 'key')).toThrow('Invalid taskId format');
    });

    it('Scenario 3: Symlink creation for privilege escalation', () => {
      expect(() => getDeliverablePath('../../../var/www/html', 'shell.php')).toThrow('Invalid taskId format');
    });

    it('Scenario 4: Database file overwrite', () => {
      expect(() => getDeliverablePath('../../var/lib/mysql', 'users.db')).toThrow('Invalid taskId format');
    });

    it('Scenario 5: Config file injection', () => {
      expect(() => getDeliverablePath('../../../etc/nginx', 'nginx.conf')).toThrow('Invalid taskId format');
    });

    it('Scenario 6: Encoded path traversal (percent encoding)', () => {
      expect(() => validateTaskId('%2e%2e%2fetc%2fpasswd')).toThrow('Invalid taskId format');
    });

    it('Scenario 7: URL encoding evasion', () => {
      expect(() => validateTaskId('task%20name')).toThrow('Invalid taskId format');
    });

    it('Scenario 8: Unicode normalization attack', () => {
      expect(() => validateTaskId('task\u2215name')).toThrow('Invalid taskId format');
    });
  });
});
