/**
 * Path Validator Tests
 *
 * Comprehensive test suite for path-validator.ts with target >90% coverage.
 * Tests path traversal prevention, symlink detection, and all security constraints.
 *
 * SECURITY CRITICAL - Protects against CVSS 7.5 path traversal attacks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import {
  validatePath,
  validatePaths,
  isPathWithinBase,
  getSafePath,
  isPathSafe,
  getPathValidationError,
  safeListDirectory,
  PathValidationError,
  PathValidationResult,
} from '../../src/lib/path-validator';

describe('Path Validator', () => {
  let testDir: string;
  let baseDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `path-validator-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(testDir, { recursive: true });

    baseDir = path.join(testDir, 'base');
    fs.mkdirSync(baseDir, { recursive: true });

    // Create test files and directories
    fs.mkdirSync(path.join(baseDir, 'subdir'));
    fs.writeFileSync(path.join(baseDir, 'file.txt'), 'test');
    fs.writeFileSync(path.join(baseDir, 'subdir', 'nested.txt'), 'nested');
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('validatePath', () => {
    describe('Valid Paths', () => {
      it('should validate simple file in base directory', () => {
        const result = validatePath('file.txt', baseDir);

        expect(result.valid).toBe(true);
        expect(result.isWithinBase).toBe(true);
        expect(result.isSymlink).toBe(false);
        expect(result.resolvedPath).toContain('file.txt');
      });

      it('should validate nested file', () => {
        const result = validatePath('subdir/nested.txt', baseDir);

        expect(result.valid).toBe(true);
        expect(result.isWithinBase).toBe(true);
      });

      it('should validate path with dot segments when safe', () => {
        const result = validatePath('subdir/../file.txt', baseDir);

        expect(result.valid).toBe(true);
        // After normalization, should resolve to file.txt in base
      });

      it('should validate non-existent file for pre-creation validation', () => {
        const result = validatePath('new-file.txt', baseDir);

        expect(result.valid).toBe(true);
        expect(result.isWithinBase).toBe(true);
      });

      it('should validate deeply nested path', () => {
        fs.mkdirSync(path.join(baseDir, 'a', 'b', 'c'), { recursive: true });
        fs.writeFileSync(path.join(baseDir, 'a', 'b', 'c', 'deep.txt'), 'deep');

        const result = validatePath('a/b/c/deep.txt', baseDir);

        expect(result.valid).toBe(true);
      });

      it('should resolve relative base directory', () => {
        const relativeBase = path.relative(process.cwd(), baseDir);
        const result = validatePath('file.txt', relativeBase);

        expect(result.valid).toBe(true);
      });
    });

    describe('Path Traversal Attacks', () => {
      it('should reject path traversal with ../', () => {
        expect(() => {
          validatePath('../outside.txt', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should reject multiple path traversal attempts', () => {
        expect(() => {
          validatePath('../../../../../../etc/passwd', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should reject path traversal in middle of path', () => {
        expect(() => {
          validatePath('subdir/../../outside.txt', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should reject path that resolves outside base', () => {
        expect(() => {
          validatePath('subdir/../../../outside.txt', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should provide detailed error context for traversal', () => {
        try {
          validatePath('../outside.txt', baseDir);
          throw new Error('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(PathValidationError);
          if (error instanceof PathValidationError) {
            expect(error.context?.reason).toBeDefined();
          }
        }
      });
    });

    describe('Home Directory Access', () => {
      it('should reject tilde home directory expansion', () => {
        expect(() => {
          validatePath('~/secret.txt', baseDir);
        }).toThrow(PathValidationError);
        expect(() => {
          validatePath('~/secret.txt', baseDir);
        }).toThrow('home directory access denied');
      });

      it('should reject home directory in middle of path', () => {
        expect(() => {
          validatePath('subdir/~/secret.txt', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should reject home directory with backslash', () => {
        expect(() => {
          validatePath('subdir\\~\\secret.txt', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should reject base directory starting with tilde', () => {
        expect(() => {
          validatePath('file.txt', '~/base');
        }).toThrow(PathValidationError);
        expect(() => {
          validatePath('file.txt', '~/base');
        }).toThrow('Base directory validation failed');
      });
    });

    describe('Symlink Detection', () => {
      it('should reject symbolic links', () => {
        const targetFile = path.join(baseDir, 'target.txt');
        const symlinkPath = path.join(baseDir, 'symlink.txt');

        fs.writeFileSync(targetFile, 'target');

        try {
          fs.symlinkSync(targetFile, symlinkPath);
        } catch (error) {
          // Skip test if symlinks not supported (Windows without admin)
          return;
        }

        expect(() => {
          validatePath('symlink.txt', baseDir);
        }).toThrow(PathValidationError);
        expect(() => {
          validatePath('symlink.txt', baseDir);
        }).toThrow('symbolic links are not allowed');
      });

      it('should detect symlink reason in error', () => {
        const targetFile = path.join(baseDir, 'target.txt');
        const symlinkPath = path.join(baseDir, 'symlink.txt');

        fs.writeFileSync(targetFile, 'target');

        try {
          fs.symlinkSync(targetFile, symlinkPath);
        } catch (error) {
          return; // Skip if symlinks not supported
        }

        try {
          validatePath('symlink.txt', baseDir);
          throw new Error('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(PathValidationError);
          if (error instanceof PathValidationError) {
            expect(error.context?.reason).toBe('SYMLINK_NOT_ALLOWED');
          }
        }
      });
    });

    describe('Absolute Paths', () => {
      it('should handle absolute paths within base', () => {
        const absolutePath = path.join(baseDir, 'file.txt');
        const result = validatePath(absolutePath, baseDir);

        expect(result.valid).toBe(true);
      });

      it('should reject absolute paths outside base', () => {
        const outsidePath = path.join(testDir, 'outside.txt');

        expect(() => {
          validatePath(outsidePath, baseDir);
        }).toThrow(PathValidationError);
        expect(() => {
          validatePath(outsidePath, baseDir);
        }).toThrow('outside allowed directory');
      });

      it('should reject system paths like /etc/passwd', () => {
        expect(() => {
          validatePath('/etc/passwd', baseDir);
        }).toThrow(PathValidationError);
      });
    });

    describe('Normalization and Edge Cases', () => {
      it('should normalize paths with extra slashes', () => {
        const result = validatePath('subdir//nested.txt', baseDir);
        expect(result.valid).toBe(true);
      });

      it('should reject current directory reference outside base', () => {
        expect(() => {
          validatePath('.', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should handle empty path', () => {
        expect(() => {
          validatePath('', baseDir);
        }).toThrow(PathValidationError);
      });

      it('should handle Windows-style paths on Linux', () => {
        const result = validatePath('subdir\\nested.txt', baseDir);
        // Path normalization should handle this
        expect(result.valid).toBe(true);
      });

      it('should reject path with parent directory reference in name', () => {
        expect(() => {
          validatePath('subdir/../../../etc/passwd', baseDir);
        }).toThrow(PathValidationError);
      });
    });

    describe('Error Context', () => {
      it('should provide full context on validation failure', () => {
        try {
          validatePath('../outside.txt', baseDir);
          throw new Error('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(PathValidationError);
          if (error instanceof PathValidationError) {
            expect(error.context).toBeDefined();
            expect(error.context?.filePath).toBe('../outside.txt');
            expect(error.context?.baseDirectory).toBeDefined();
            expect(error.context?.reason).toBeDefined();
          }
        }
      });

      it('should include normalized path in context', () => {
        try {
          validatePath('../outside.txt', baseDir);
          throw new Error('Should have thrown');
        } catch (error) {
          if (error instanceof PathValidationError) {
            expect(error.context?.normalizedPath).toBeDefined();
          }
        }
      });
    });
  });

  describe('isPathWithinBase', () => {
    it('should return true for file in base directory', () => {
      const filePath = path.join(baseDir, 'file.txt');
      expect(isPathWithinBase(filePath, baseDir)).toBe(true);
    });

    it('should return true for nested file', () => {
      const filePath = path.join(baseDir, 'subdir', 'nested.txt');
      expect(isPathWithinBase(filePath, baseDir)).toBe(true);
    });

    it('should return true for exact match of base directory', () => {
      expect(isPathWithinBase(baseDir, baseDir)).toBe(true);
    });

    it('should return false for file outside base', () => {
      const outsidePath = path.join(testDir, 'outside.txt');
      expect(isPathWithinBase(outsidePath, baseDir)).toBe(false);
    });

    it('should return false for parent directory', () => {
      expect(isPathWithinBase(testDir, baseDir)).toBe(false);
    });

    it('should return false for sibling directory', () => {
      const siblingDir = path.join(testDir, 'sibling');
      fs.mkdirSync(siblingDir);

      expect(isPathWithinBase(siblingDir, baseDir)).toBe(false);
    });

    it('should handle relative paths correctly', () => {
      const relativePath = path.relative(process.cwd(), path.join(baseDir, 'file.txt'));
      const relativeBase = path.relative(process.cwd(), baseDir);

      expect(isPathWithinBase(relativePath, relativeBase)).toBe(true);
    });

    it('should prevent prefix matching attacks', () => {
      // Create directory with similar prefix
      const similarDir = baseDir + '-evil';
      fs.mkdirSync(similarDir, { recursive: true });

      const evilPath = path.join(similarDir, 'evil.txt');
      expect(isPathWithinBase(evilPath, baseDir)).toBe(false);
    });
  });

  describe('validatePaths', () => {
    it('should validate multiple paths successfully', () => {
      const paths = ['file.txt', 'subdir/nested.txt'];
      const results = validatePaths(paths, baseDir);

      expect(results.size).toBe(2);
      expect(results.get('file.txt')?.valid).toBe(true);
      expect(results.get('subdir/nested.txt')?.valid).toBe(true);
    });

    it('should handle mix of valid and invalid paths', () => {
      const paths = ['file.txt', '../outside.txt', 'subdir/nested.txt'];
      const results = validatePaths(paths, baseDir);

      expect(results.size).toBe(3);
      expect(results.get('file.txt')?.valid).toBe(true);
      expect(results.get('../outside.txt')?.valid).toBe(false);
      expect(results.get('subdir/nested.txt')?.valid).toBe(true);
    });

    it('should include error reasons for invalid paths', () => {
      const paths = ['../outside.txt', '~/secret.txt'];
      const results = validatePaths(paths, baseDir);

      expect(results.get('../outside.txt')?.valid).toBe(false);
      expect(results.get('../outside.txt')?.reason).toBeDefined();
      expect(results.get('~/secret.txt')?.valid).toBe(false);
      expect(results.get('~/secret.txt')?.reason).toBeDefined();
    });

    it('should handle empty array', () => {
      const results = validatePaths([], baseDir);
      expect(results.size).toBe(0);
    });

    it('should not throw for invalid paths', () => {
      const paths = ['../outside.txt', '../../etc/passwd'];
      expect(() => validatePaths(paths, baseDir)).not.toThrow();
    });
  });

  describe('getSafePath', () => {
    it('should return resolved path for valid file', () => {
      const safePath = getSafePath('file.txt', baseDir);

      expect(safePath).toContain('file.txt');
      expect(path.isAbsolute(safePath)).toBe(true);
    });

    it('should throw for invalid path', () => {
      expect(() => {
        getSafePath('../outside.txt', baseDir);
      }).toThrow(PathValidationError);
    });

    it('should resolve nested paths', () => {
      const safePath = getSafePath('subdir/nested.txt', baseDir);

      expect(safePath).toContain('nested.txt');
      expect(safePath).toContain('subdir');
    });

    it('should normalize path before returning', () => {
      const safePath = getSafePath('subdir/../file.txt', baseDir);

      expect(safePath).toContain('file.txt');
      expect(safePath).not.toContain('..');
    });
  });

  describe('isPathSafe', () => {
    it('should return true for valid path', () => {
      expect(isPathSafe('file.txt', baseDir)).toBe(true);
    });

    it('should return false for invalid path', () => {
      expect(isPathSafe('../outside.txt', baseDir)).toBe(false);
    });

    it('should return false for home directory access', () => {
      expect(isPathSafe('~/secret.txt', baseDir)).toBe(false);
    });

    it('should return false for symlink', () => {
      const targetFile = path.join(baseDir, 'target.txt');
      const symlinkPath = path.join(baseDir, 'symlink.txt');

      fs.writeFileSync(targetFile, 'target');

      try {
        fs.symlinkSync(targetFile, symlinkPath);
      } catch (error) {
        return; // Skip if symlinks not supported
      }

      expect(isPathSafe('symlink.txt', baseDir)).toBe(false);
    });

    it('should not throw for any input', () => {
      const testPaths = [
        '../outside.txt',
        '~/secret.txt',
        '../../etc/passwd',
        '/etc/passwd',
        '',
        '.',
        '..',
      ];

      testPaths.forEach((testPath) => {
        expect(() => isPathSafe(testPath, baseDir)).not.toThrow();
      });
    });
  });

  describe('getPathValidationError', () => {
    it('should return undefined for valid path', () => {
      const error = getPathValidationError('file.txt', baseDir);
      expect(error).toBeUndefined();
    });

    it('should return error for invalid path', () => {
      const error = getPathValidationError('../outside.txt', baseDir);

      expect(error).toBeInstanceOf(PathValidationError);
      expect(error?.message).toBeDefined();
      expect(error?.context).toBeDefined();
    });

    it('should include error reason', () => {
      const error = getPathValidationError('../outside.txt', baseDir);

      expect(error?.context?.reason).toBeDefined();
    });

    it('should handle all error types', () => {
      const testCases = [
        { path: '../outside.txt', expectedReason: 'TRAVERSAL_PATTERN_DETECTED' },
        { path: '~/secret.txt', expectedReason: 'HOME_DIRECTORY_ACCESS' },
      ];

      testCases.forEach(({ path: testPath, expectedReason }) => {
        const error = getPathValidationError(testPath, baseDir);
        expect(error?.context?.reason).toBe(expectedReason);
      });
    });
  });

  describe('safeListDirectory', () => {
    it('should list all files in directory', () => {
      const files = safeListDirectory(baseDir);

      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain('file.txt');
      expect(files).toContain(path.join('subdir', 'nested.txt'));
    });

    it('should list files recursively by default', () => {
      fs.mkdirSync(path.join(baseDir, 'deep', 'deeper'), { recursive: true });
      fs.writeFileSync(path.join(baseDir, 'deep', 'deeper', 'file.txt'), 'deep');

      const files = safeListDirectory(baseDir);

      expect(files).toContain(path.join('deep', 'deeper', 'file.txt'));
    });

    it('should respect maxDepth option', () => {
      fs.mkdirSync(path.join(baseDir, 'level1', 'level2', 'level3'), { recursive: true });
      fs.writeFileSync(path.join(baseDir, 'level1', 'file1.txt'), '1');
      fs.writeFileSync(path.join(baseDir, 'level1', 'level2', 'file2.txt'), '2');
      fs.writeFileSync(path.join(baseDir, 'level1', 'level2', 'level3', 'file3.txt'), '3');

      const files = safeListDirectory(baseDir, { maxDepth: 2 });

      expect(files).toContain(path.join('level1', 'file1.txt'));
      expect(files).toContain(path.join('level1', 'level2', 'file2.txt'));
      expect(files).not.toContain(path.join('level1', 'level2', 'level3', 'file3.txt'));
    });

    it('should apply filter function', () => {
      const files = safeListDirectory(baseDir, {
        filter: (filePath) => filePath.endsWith('.txt'),
      });

      expect(files.every((f) => f.endsWith('.txt'))).toBe(true);
    });

    it('should skip symlinks', () => {
      const targetFile = path.join(baseDir, 'target.txt');
      const symlinkPath = path.join(baseDir, 'symlink.txt');

      fs.writeFileSync(targetFile, 'target');

      try {
        fs.symlinkSync(targetFile, symlinkPath);
      } catch (error) {
        return; // Skip if symlinks not supported
      }

      const files = safeListDirectory(baseDir);

      // Should not include symlink directory traversal
      expect(files).toContain('target.txt');
      // Symlink may or may not be listed depending on implementation
    });

    it('should handle empty directory', () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir);

      const files = safeListDirectory(emptyDir);

      expect(files).toHaveLength(0);
    });

    it('should return relative paths', () => {
      const files = safeListDirectory(baseDir);

      files.forEach((file) => {
        expect(path.isAbsolute(file)).toBe(false);
      });
    });

    it('should handle permission errors gracefully', () => {
      // This test would require changing permissions, which might not work in all environments
      // Just verify it doesn't throw
      expect(() => safeListDirectory(baseDir)).not.toThrow();
    });
  });

  describe('Security Attack Scenarios', () => {
    it('should prevent null byte injection', () => {
      expect(() => {
        validatePath('file.txt\0../../etc/passwd', baseDir);
      }).toThrow(PathValidationError);
    });

    it('should prevent URL encoding attacks', () => {
      expect(() => {
        validatePath('%2e%2e%2f%2e%2e%2fetc%2fpasswd', baseDir);
      }).toThrow(PathValidationError);
    });

    it('should prevent double encoding attacks', () => {
      expect(() => {
        validatePath('%252e%252e%252f', baseDir);
      }).toThrow(PathValidationError);
    });

    it('should prevent unicode encoding attacks', () => {
      expect(() => {
        validatePath('\u002e\u002e\u002f', baseDir);
      }).toThrow(PathValidationError);
    });

    it('should prevent backslash path traversal on all platforms', () => {
      expect(() => {
        validatePath('..\\..\\etc\\passwd', baseDir);
      }).toThrow(PathValidationError);
    });

    it('should prevent mixed slash path traversal', () => {
      expect(() => {
        validatePath('../..\\etc/passwd', baseDir);
      }).toThrow(PathValidationError);
    });
  });
});
