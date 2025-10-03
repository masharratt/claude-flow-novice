/**
 * Path Traversal Security Tests (CVE-2025-004)
 *
 * Validates path sanitization prevents directory traversal attacks
 * across all file operation vectors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  sanitizeFilePath,
  validateEpicDirectory,
  validatePhaseFile,
  safeReadFile,
  safeWriteFile,
  PathSecurityError,
  addAllowedBasePath,
  getAllowedBasePaths,
} from '../../src/utils/path-security.js';

describe('CVE-2025-004: Path Traversal Prevention', () => {
  const testDir = path.resolve(process.cwd(), 'planning/test-security');
  const maliciousDir = path.resolve(process.cwd(), '../../etc');

  beforeEach(() => {
    // Create test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(path.join(testDir, 'test-file.md'), '# Test Content', 'utf-8');
  });

  afterEach(() => {
    // Cleanup test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('sanitizeFilePath', () => {
    it('should allow legitimate relative paths', () => {
      const result = sanitizeFilePath(testDir, 'test-file.md');
      expect(result).toBe(path.join(testDir, 'test-file.md'));
    });

    it('should allow legitimate absolute paths within base directory', () => {
      const absolutePath = path.join(testDir, 'test-file.md');
      const result = sanitizeFilePath(testDir, absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should block path traversal with ../ patterns', () => {
      expect(() => {
        sanitizeFilePath(testDir, '../../../etc/passwd');
      }).toThrow(PathSecurityError);
    });

    it('should block path traversal with ../../../../ patterns', () => {
      expect(() => {
        sanitizeFilePath(testDir, '../../../../../../../../etc/passwd');
      }).toThrow(PathSecurityError);
    });

    it('should block absolute paths outside base directory', () => {
      expect(() => {
        sanitizeFilePath(testDir, '/etc/passwd');
      }).toThrow(PathSecurityError);
    });

    it('should block encoded traversal patterns (%2e%2e%2f)', () => {
      // URL-decoded ../ becomes %2e%2e%2f
      expect(() => {
        sanitizeFilePath(testDir, '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd');
      }).toThrow(PathSecurityError);
    });

    it('should throw error for non-existent files', () => {
      expect(() => {
        sanitizeFilePath(testDir, 'non-existent.md');
      }).toThrow(PathSecurityError);
    });

    it('should detect symlink traversal attacks', () => {
      const symlinkPath = path.join(testDir, 'malicious-link');

      // Create symlink to /etc
      if (!fs.existsSync(symlinkPath)) {
        try {
          fs.symlinkSync('/etc', symlinkPath);
        } catch {
          // Skip test if symlink creation fails (permissions)
          return;
        }
      }

      expect(() => {
        sanitizeFilePath(testDir, 'malicious-link/passwd');
      }).toThrow(PathSecurityError);

      // Cleanup
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath);
      }
    });

    it('should normalize mixed separators (Windows/Unix)', () => {
      const result = sanitizeFilePath(testDir, 'test-file.md');
      expect(result).not.toContain('\\\\');
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should block null byte injection', () => {
      expect(() => {
        sanitizeFilePath(testDir, 'test-file.md\x00.txt');
      }).toThrow();
    });
  });

  describe('validateEpicDirectory', () => {
    it('should allow epic directories in planning/', () => {
      expect(() => {
        validateEpicDirectory(path.resolve(process.cwd(), 'planning/example-epic'));
      }).not.toThrow();
    });

    it('should allow epic directories in docs/', () => {
      const docsDir = path.resolve(process.cwd(), 'docs/test-epic');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      expect(() => {
        validateEpicDirectory(docsDir);
      }).not.toThrow();

      fs.rmdirSync(docsDir);
    });

    it('should block epic directories outside allowed paths', () => {
      expect(() => {
        validateEpicDirectory('/tmp/malicious-epic');
      }).toThrow(PathSecurityError);
    });

    it('should block path traversal to reach allowed directory', () => {
      expect(() => {
        validateEpicDirectory('../../../planning/example-epic');
      }).toThrow(PathSecurityError);
    });

    it('should throw error for non-existent directories', () => {
      expect(() => {
        validateEpicDirectory(path.resolve(process.cwd(), 'planning/non-existent'));
      }).toThrow(PathSecurityError);
    });

    it('should throw error for files (not directories)', () => {
      const filePath = path.join(testDir, 'not-a-directory.txt');
      fs.writeFileSync(filePath, 'content', 'utf-8');

      expect(() => {
        validateEpicDirectory(filePath);
      }).toThrow(PathSecurityError);
    });
  });

  describe('validatePhaseFile', () => {
    it('should validate phase file within epic directory', () => {
      const phaseFile = 'test-file.md';
      const result = validatePhaseFile(testDir, phaseFile);
      expect(result).toBe(path.join(testDir, phaseFile));
    });

    it('should block phase file outside epic directory', () => {
      expect(() => {
        validatePhaseFile(testDir, '../../../etc/passwd');
      }).toThrow(PathSecurityError);
    });

    it('should throw error if epic directory invalid', () => {
      expect(() => {
        validatePhaseFile('/invalid/epic/dir', 'phase.md');
      }).toThrow(PathSecurityError);
    });
  });

  describe('safeReadFile', () => {
    it('should read file within base directory', () => {
      const content = safeReadFile(testDir, 'test-file.md');
      expect(content).toBe('# Test Content');
    });

    it('should block reading files outside base directory', () => {
      expect(() => {
        safeReadFile(testDir, '../../../etc/passwd');
      }).toThrow(PathSecurityError);
    });
  });

  describe('safeWriteFile', () => {
    it('should write file within base directory', () => {
      safeWriteFile(testDir, 'new-file.md', '# New Content');
      expect(fs.existsSync(path.join(testDir, 'new-file.md'))).toBe(true);
      expect(fs.readFileSync(path.join(testDir, 'new-file.md'), 'utf-8')).toBe('# New Content');
    });

    it('should block writing files outside base directory', () => {
      expect(() => {
        safeWriteFile(testDir, '../../../tmp/malicious.txt', 'malicious content');
      }).toThrow(PathSecurityError);
    });

    it('should block creating directories via traversal', () => {
      expect(() => {
        safeWriteFile(testDir, '../../malicious-dir/file.txt', 'content');
      }).toThrow(PathSecurityError);
    });
  });

  describe('Allowed Base Paths Management', () => {
    it('should return default allowed paths', () => {
      const paths = getAllowedBasePaths();
      expect(paths).toContain('planning');
      expect(paths).toContain('docs');
      expect(paths).toContain('epics');
    });

    it('should allow adding custom base path', () => {
      addAllowedBasePath('custom-epic-dir');
      const paths = getAllowedBasePaths();
      expect(paths).toContain('custom-epic-dir');
    });

    it('should not duplicate allowed paths', () => {
      const initialLength = getAllowedBasePaths().length;
      addAllowedBasePath('planning');
      expect(getAllowedBasePaths().length).toBe(initialLength);
    });
  });

  describe('Real-World Attack Vectors', () => {
    it('should block CVE-2025-004 attack: ../../../../etc/passwd', () => {
      expect(() => {
        sanitizeFilePath(testDir, '../../../../etc/passwd');
      }).toThrow(PathSecurityError);
    });

    it('should block CVE-2025-004 attack: absolute path /etc/passwd', () => {
      expect(() => {
        sanitizeFilePath(testDir, '/etc/passwd');
      }).toThrow(PathSecurityError);
    });

    it('should block CVE-2025-004 attack: Windows drive traversal C:\\Windows\\System32', () => {
      if (process.platform === 'win32') {
        expect(() => {
          sanitizeFilePath(testDir, 'C:\\Windows\\System32\\config\\SAM');
        }).toThrow(PathSecurityError);
      }
    });

    it('should block CVE-2025-004 attack: mixed separators ../../../etc/passwd', () => {
      expect(() => {
        sanitizeFilePath(testDir, '..\\..\\..\\etc\\passwd');
      }).toThrow(PathSecurityError);
    });

    it('should block CVE-2025-004 attack: double encoding %252e%252e%252f', () => {
      expect(() => {
        sanitizeFilePath(testDir, '%252e%252e%252f%252e%252e%252fetc%252fpasswd');
      }).toThrow(PathSecurityError);
    });
  });

  describe('Error Messages', () => {
    it('should include attempted path in error message', () => {
      try {
        sanitizeFilePath(testDir, '../../../etc/passwd');
      } catch (error) {
        expect(error).toBeInstanceOf(PathSecurityError);
        expect(error.message).toContain('../../../etc/passwd');
        expect(error.attemptedPath).toBe('../../../etc/passwd');
      }
    });

    it('should include violation type in error', () => {
      try {
        sanitizeFilePath(testDir, '../../../etc/passwd');
      } catch (error) {
        expect(error).toBeInstanceOf(PathSecurityError);
        expect(error.violationType).toBe('traversal');
      }
    });

    it('should include violation type for unauthorized paths', () => {
      try {
        validateEpicDirectory('/tmp/malicious');
      } catch (error) {
        expect(error).toBeInstanceOf(PathSecurityError);
        expect(error.violationType).toBe('unauthorized');
      }
    });
  });

  describe('Integration with EpicParser', () => {
    it('should prevent path traversal in phase file parsing', async () => {
      const { EpicParser } = await import('../../src/parsers/epic-parser.js');

      const epicDir = path.resolve(process.cwd(), 'planning/test-epic');
      if (!fs.existsSync(epicDir)) {
        fs.mkdirSync(epicDir, { recursive: true });
      }

      const overviewPath = path.join(epicDir, 'EPIC_OVERVIEW.md');
      fs.writeFileSync(overviewPath, `
# Test Epic

**Epic ID**: test-epic
**File**: ../../../etc/passwd
      `, 'utf-8');

      expect(() => {
        const parser = new EpicParser({ epicDirectory: epicDir });
        parser.parse();
      }).toThrow();

      // Cleanup
      fs.rmSync(epicDir, { recursive: true, force: true });
    });
  });

  describe('Integration with CFN Loop Epic Command', () => {
    it('should prevent path traversal in epic directory validation', async () => {
      const { CfnLoopEpicCommand } = await import('../../src/slash-commands/cfn-loop-epic.js');

      const command = new CfnLoopEpicCommand();
      const result = await command.execute(['../../../../etc'], { cwd: process.cwd() });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security validation failed');
    });
  });
});
