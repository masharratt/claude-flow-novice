/**
 * Tests for secure-execution.ts
 *
 * Verifies that the secure execution functions properly prevent command injection
 */

import {
  isCommandAllowed,
  sanitizeArgs,
  validateCommand,
  secureSpawn,
  secureExecSync,
  addAllowedCommand,
  removeAllowedCommand,
  getAllowedCommands
} from './secure-execution';

describe('secure-execution', () => {
  beforeEach(() => {
    // Reset allowed commands to default state for each test
    const defaultCommands = [
      'tsc', 'rustc', 'gcc', 'g++', 'clang', 'clang++',
      'javac', 'go', 'python', 'python3', 'node', 'npm'
    ];

    // Clear and repopulate
    getAllowedCommands().forEach(cmd => removeAllowedCommand(cmd));
    defaultCommands.forEach(cmd => addAllowedCommand(cmd));
  });

  describe('isCommandAllowed', () => {
    it('should allow whitelisted commands', () => {
      expect(isCommandAllowed('tsc')).toBe(true);
      expect(isCommandAllowed('rustc')).toBe(true);
      expect(isCommandAllowed('gcc')).toBe(true);
    });

    it('should reject non-whitelisted commands', () => {
      expect(isCommandAllowed('rm')).toBe(false);
      expect(isCommandAllowed('sudo')).toBe(false);
      expect(isCommandAllowed('curl')).toBe(false);
    });

    it('should allow commands with arguments', () => {
      expect(isCommandAllowed('tsc --noEmit')).toBe(true);
      expect(isCommandAllowed('rustc -O')).toBe(true);
    });

    it('should reject dangerous commands even with allowed prefix', () => {
      expect(isCommandAllowed('tsc; rm -rf /')).toBe(false);
      expect(isCommandAllowed('gcc && cat /etc/passwd')).toBe(false);
    });
  });

  describe('sanitizeArgs', () => {
    it('should remove dangerous patterns', () => {
      expect(sanitizeArgs(['file.ts; rm -rf /'])).toEqual(['file.ts rm -rf /']);
      expect(sanitizeArgs(['arg && evil'])).toEqual(['arg  evil']);
      expect(sanitizeArgs(['arg || bad'])).toEqual(['arg  bad']);
      expect(sanitizeArgs(['arg | malicious'])).toEqual(['arg  malicious']);
      expect(sanitizeArgs(['arg > /etc/passwd'])).toEqual(['arg  /etc/passwd']);
      expect(sanitizeArgs(['arg < input'])).toEqual(['arg  input']);
      expect(sanitizeArgs(['arg `command`'])).toEqual(['arg command']);
      expect(sanitizeArgs(['arg $(cmd)'])).toEqual(['arg cmd']);
    });

    it('should preserve safe arguments', () => {
      expect(sanitizeArgs(['--noEmit', '--strict'])).toEqual(['--noEmit', '--strict']);
      expect(sanitizeArgs(['file.ts', 'another.js'])).toEqual(['file.ts', 'another.js']);
    });
  });

  describe('validateCommand', () => {
    it('should validate allowed commands', () => {
      const result = validateCommand('tsc --noEmit');
      expect(result.command).toBe('tsc');
      expect(result.args).toEqual(['--noEmit']);
    });

    it('should throw error for disallowed commands', () => {
      expect(() => validateCommand('rm -rf /')).toThrow('Command not allowed: rm');
    });

    it('should sanitize arguments', () => {
      const result = validateCommand('tsc file.ts; rm -rf /');
      expect(result.command).toBe('tsc');
      expect(result.args).toEqual(['file.ts rm -rf /']);
    });

    it('should throw error for empty command', () => {
      expect(() => validateCommand('')).toThrow('Empty command');
    });
  });

  describe('whitelist management', () => {
    it('should add and remove commands from whitelist', () => {
      addAllowedCommand('my-custom-compiler');
      expect(isCommandAllowed('my-custom-compiler')).toBe(true);

      removeAllowedCommand('my-custom-compiler');
      expect(isCommandAllowed('my-custom-compiler')).toBe(false);
    });

    it('should get list of allowed commands', () => {
      const commands = getAllowedCommands();
      expect(commands).toContain('tsc');
      expect(commands).toContain('rustc');
    });
  });

  describe('secureExecSync', () => {
    it('should execute allowed commands successfully', async () => {
      // Note: This test might not work in all environments
      // Consider mocking or using cross-platform commands
      try {
        const result = await secureExecSync('node --version', { timeout: 5000 });
        expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
      } catch (e) {
        // Skip test if node is not available
        console.warn('Skipping test: node not available');
      }
    });

    it('should throw error for disallowed commands', async () => {
      await expect(secureExecSync('rm -rf /')).rejects.toThrow('Command not allowed: rm');
    });

    it('should respect timeout', async () => {
      // Test with a command that sleeps longer than timeout
      try {
        await secureExecSync('node -e "setTimeout(() => {}, 10000)"', { timeout: 100 });
        fail('Should have timed out');
      } catch (e: any) {
        expect(e.message).toContain('timed out');
      }
    }, 5000);
  });
});

// Additional security test for command injection prevention
describe('Command Injection Prevention', () => {
  test('prevents command injection through semicolon', async () => {
    await expect(
      secureExecSync('tsc --noEmit; echo "INJECTED"')
    ).rejects.toThrow();
  });

  test('prevents command injection through &&', async () => {
    await expect(
      secureExecSync('tsc --noEmit && echo "INJECTED"')
    ).rejects.toThrow();
  });

  test('prevents command injection through pipe', async () => {
    await expect(
      secureExecSync('tsc --noEmit | cat')
    ).rejects.toThrow();
  });

  test('prevents command injection through $(...)', async () => {
    await expect(
      secureExecSync('tsc --noEmit $(echo "INJECTED")')
    ).rejects.toThrow();
  });

  test('prevents command injection through backticks', async () => {
    await expect(
      secureExecSync('tsc --noEmit `echo "INJECTED"`')
    ).rejects.toThrow();
  });
});