/**
 * Namespace Sanitizer Tests
 *
 * Comprehensive validation tests for namespace path sanitization including:
 * - Character whitelisting and injection prevention
 * - Directory traversal attack prevention
 * - Reserved name validation
 * - Namespace depth limits
 * - Deterministic ID generation
 * - Namespace comparison and hierarchy
 * - Edge cases and error handling
 */

import {
  NamespaceSanitizer,
  NamespaceComponentType,
  type NamespaceValidationResult,
  type SanitizationOptions,
  type NamespaceBuildOptions,
} from '../../../src/utils/namespace-sanitizer.js';

describe('NamespaceSanitizer', () => {
  describe('sanitizeId', () => {
    it('should sanitize valid alphanumeric IDs', () => {
      expect(NamespaceSanitizer.sanitizeId('my-epic-123')).toBe('my-epic-123');
      expect(NamespaceSanitizer.sanitizeId('Sprint_1_2')).toBe('Sprint_1_2');
      expect(NamespaceSanitizer.sanitizeId('Phase-0')).toBe('Phase-0');
    });

    it('should replace invalid characters with dashes', () => {
      expect(NamespaceSanitizer.sanitizeId('my epic!@#')).toBe('my-epic');
      expect(NamespaceSanitizer.sanitizeId('sprint 1.1')).toBe('sprint-1-1');
      expect(NamespaceSanitizer.sanitizeId('epic:path')).toBe('epic-path');
    });

    it('should handle leading/trailing invalid characters', () => {
      expect(NamespaceSanitizer.sanitizeId('---epic---')).toBe('epic');
      expect(NamespaceSanitizer.sanitizeId('!!!sprint!!!')).toBe('sprint');
      expect(NamespaceSanitizer.sanitizeId('epic   ')).toBe('epic');
    });

    it('should collapse multiple consecutive replacement characters', () => {
      expect(NamespaceSanitizer.sanitizeId('my!!!epic')).toBe('my-epic');
      expect(NamespaceSanitizer.sanitizeId('sprint space')).toBe('sprint-space');
      expect(NamespaceSanitizer.sanitizeId('a@@@@b')).toBe('a-b');
    });

    it('should enforce maximum length', () => {
      const longId = 'a'.repeat(100);
      const sanitized = NamespaceSanitizer.sanitizeId(longId);
      expect(sanitized.length).toBeLessThanOrEqual(64);
      expect(sanitized).toBe('a'.repeat(64));
    });

    it('should throw on empty ID after sanitization', () => {
      expect(() => NamespaceSanitizer.sanitizeId('!!!')).toThrow('Invalid ID format');
      expect(() => NamespaceSanitizer.sanitizeId('   ')).toThrow('Invalid ID format');
      expect(() => NamespaceSanitizer.sanitizeId('')).toThrow('Invalid ID format');
    });

    it('should prevent directory traversal attacks', () => {
      expect(() => NamespaceSanitizer.sanitizeId('../../../etc/passwd')).toThrow('dangerous pattern');
      expect(() => NamespaceSanitizer.sanitizeId('./../config')).toThrow('dangerous pattern');
      expect(() => NamespaceSanitizer.sanitizeId('..\\windows')).toThrow('dangerous pattern');
    });

    it('should block reserved names', () => {
      expect(() => NamespaceSanitizer.sanitizeId('admin')).toThrow('reserved name');
      expect(() => NamespaceSanitizer.sanitizeId('system')).toThrow('reserved name');
      expect(() => NamespaceSanitizer.sanitizeId('null')).toThrow('reserved name');
      expect(() => NamespaceSanitizer.sanitizeId('__proto__')).toThrow('reserved name');
    });

    it('should block dangerous special characters', () => {
      expect(() => NamespaceSanitizer.sanitizeId('test<script>')).toThrow('dangerous pattern');
      expect(() => NamespaceSanitizer.sanitizeId('epic|pipeline')).toThrow('dangerous pattern');
      expect(() => NamespaceSanitizer.sanitizeId('path\\backslash')).toThrow('dangerous pattern');
    });

    it('should respect sanitization options', () => {
      const opts: SanitizationOptions = {
        maxIdLength: 10,
        allowUppercase: false,
        replaceInvalid: true,
        replacementChar: '_',
      };

      const result = NamespaceSanitizer.sanitizeId('MyEpic@123', opts);
      expect(result).toBe('myepic_123');
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should remove invalid chars when replaceInvalid is false', () => {
      const opts: SanitizationOptions = {
        replaceInvalid: false,
      };

      expect(NamespaceSanitizer.sanitizeId('my@#epic', opts)).toBe('myepic');
      expect(NamespaceSanitizer.sanitizeId('test 1 2 3', opts)).toBe('test123');
    });
  });

  describe('generateUniqueId', () => {
    it('should generate deterministic unique IDs', () => {
      const id1 = NamespaceSanitizer.generateUniqueId('sprint', 'seed-123');
      const id2 = NamespaceSanitizer.generateUniqueId('sprint', 'seed-123');
      const id3 = NamespaceSanitizer.generateUniqueId('sprint', 'seed-456');

      expect(id1).toBe(id2); // Same seed = same ID (deterministic)
      expect(id1).not.toBe(id3); // Different seed = different ID
      expect(id1).toMatch(/^sprint-[a-f0-9]{16}$/); // Format: prefix-{16-char-hash}
    });

    it('should sanitize prefix before generation', () => {
      const id = NamespaceSanitizer.generateUniqueId('My Epic!@#', 'seed');
      expect(id).toMatch(/^My-Epic-[a-f0-9]{16}$/);
    });

    it('should prevent collisions with different seeds', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const id = NamespaceSanitizer.generateUniqueId('sprint', `seed-${i}`);
        ids.add(id);
      }
      expect(ids.size).toBe(50); // All unique
    });

    it('should handle special characters in seed', () => {
      const id1 = NamespaceSanitizer.generateUniqueId('sprint', 'user@example.com');
      const id2 = NamespaceSanitizer.generateUniqueId('sprint', 'user@example.com');
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^sprint-[a-f0-9]{16}$/);
    });
  });

  describe('buildNamespace', () => {
    it('should build valid namespace paths', () => {
      const ns = NamespaceSanitizer.buildNamespace('epic-1', 'phase-1', 'sprint-1');
      expect(ns).toBe('cfn-loop/epic-1/phase-phase-1/sprint-sprint-1');
    });

    it('should include agent ID when specified', () => {
      const ns = NamespaceSanitizer.buildNamespace('epic-1', 'phase-1', 'sprint-1', 'coder-1');
      expect(ns).toBe('cfn-loop/epic-1/phase-phase-1/sprint-sprint-1/agent-coder-1');
    });

    it('should include iteration number when specified', () => {
      const ns = NamespaceSanitizer.buildNamespace(
        'epic-1',
        'phase-1',
        'sprint-1',
        undefined,
        5
      );
      expect(ns).toBe('cfn-loop/epic-1/phase-phase-1/sprint-sprint-1/iteration-5');
    });

    it('should include both agent and iteration', () => {
      const ns = NamespaceSanitizer.buildNamespace(
        'epic-1',
        'phase-1',
        'sprint-1',
        'tester-1',
        3,
        { includeAgent: true, includeIteration: true }
      );
      expect(ns).toBe('cfn-loop/epic-1/phase-phase-1/sprint-sprint-1/agent-tester-1/iteration-3');
    });

    it('should sanitize all components', () => {
      const ns = NamespaceSanitizer.buildNamespace('My Epic!', 'Phase @1', 'Sprint #1');
      expect(ns).toBe('cfn-loop/My-Epic/phase-Phase-1/sprint-Sprint-1');
    });

    it('should respect custom prefix', () => {
      const ns = NamespaceSanitizer.buildNamespace('epic-1', 'phase-1', 'sprint-1', undefined, undefined, {
        prefix: 'custom-namespace',
      });
      expect(ns).toBe('custom-namespace/epic-1/phase-phase-1/sprint-sprint-1');
    });

    it('should enforce maximum depth', () => {
      const opts: NamespaceBuildOptions = {
        sanitization: { maxDepth: 3 },
      };

      expect(() =>
        NamespaceSanitizer.buildNamespace('epic', 'phase', 'sprint', 'agent', 1, opts)
      ).toThrow('depth');
    });

    it('should throw on negative iteration number', () => {
      expect(() =>
        NamespaceSanitizer.buildNamespace('epic', 'phase', 'sprint', undefined, -1)
      ).toThrow('Invalid iteration number');
    });

    it('should validate final namespace path', () => {
      // Should not throw for valid namespace
      expect(() =>
        NamespaceSanitizer.buildNamespace('valid-epic', 'phase-1', 'sprint-1')
      ).not.toThrow();

      // Should throw for invalid components (after sanitization fails)
      expect(() =>
        NamespaceSanitizer.buildNamespace('', 'phase-1', 'sprint-1')
      ).toThrow();
    });
  });

  describe('validateNamespacePath', () => {
    it('should validate correct namespace paths', () => {
      const result = NamespaceSanitizer.validateNamespacePath(
        'cfn-loop/epic-1/phase-1/sprint-1'
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty paths', () => {
      const result = NamespaceSanitizer.validateNamespacePath('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Namespace path is empty');
    });

    it('should detect paths with no components', () => {
      const result = NamespaceSanitizer.validateNamespacePath('///');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Namespace contains no valid components');
    });

    it('should detect excessive depth', () => {
      const deepPath = Array(15).fill('component').join('/');
      const result = NamespaceSanitizer.validateNamespacePath(deepPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('depth'))).toBe(true);
    });

    it('should detect invalid characters', () => {
      const result = NamespaceSanitizer.validateNamespacePath('epic/phase@1/sprint!');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid characters'))).toBe(true);
    });

    it('should detect dangerous patterns', () => {
      const result = NamespaceSanitizer.validateNamespacePath('epic/../config');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('dangerous pattern'))).toBe(true);
    });

    it('should detect components exceeding max length', () => {
      const longComponent = 'a'.repeat(100);
      const result = NamespaceSanitizer.validateNamespacePath(`epic/${longComponent}/sprint`);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('maximum length'))).toBe(true);
    });

    it('should warn on reserved names', () => {
      const result = NamespaceSanitizer.validateNamespacePath('cfn-loop/admin/phase-1');
      expect(result.warnings).toContain("Component 'admin' uses reserved name");
    });

    it('should warn on numeric-only components', () => {
      const result = NamespaceSanitizer.validateNamespacePath('epic/12345/sprint');
      expect(result.warnings.some(w => w.includes('numeric-only'))).toBe(true);
    });

    it('should warn on duplicate components', () => {
      const result = NamespaceSanitizer.validateNamespacePath('epic/phase-1/phase-1');
      expect(result.warnings.some(w => w.includes('duplicate'))).toBe(true);
    });

    it('should auto-sanitize on validation failure', () => {
      const result = NamespaceSanitizer.validateNamespacePath('epic/phase@!/sprint#1');
      expect(result.valid).toBe(false);
      expect(result.sanitizedPath).toBe('epic/phase/sprint-1');
      expect(result.warnings.some(w => w.includes('automatically sanitized'))).toBe(true);
    });
  });

  describe('parseNamespace', () => {
    it('should parse standard namespace', () => {
      const parsed = NamespaceSanitizer.parseNamespace(
        'cfn-loop/epic-1/phase-1/sprint-1/agent-coder-1/iteration-3'
      );

      expect(parsed.prefix).toBe('cfn-loop');
      expect(parsed.epicId).toBe('epic-1');
      expect(parsed.phaseId).toBe('1');
      expect(parsed.sprintId).toBe('1');
      expect(parsed.agentId).toBe('coder-1');
      expect(parsed.iterationNum).toBe(3);
    });

    it('should handle minimal namespace', () => {
      const parsed = NamespaceSanitizer.parseNamespace('cfn-loop/epic-1');

      expect(parsed.prefix).toBe('cfn-loop');
      expect(parsed.epicId).toBe('epic-1');
      expect(parsed.phaseId).toBeNull();
      expect(parsed.sprintId).toBeNull();
      expect(parsed.agentId).toBeNull();
      expect(parsed.iterationNum).toBeNull();
    });

    it('should extract components array', () => {
      const parsed = NamespaceSanitizer.parseNamespace('cfn-loop/epic-1/phase-1/sprint-1');
      expect(parsed.components).toEqual(['cfn-loop', 'epic-1', 'phase-1', 'sprint-1']);
    });

    it('should handle namespaces without prefixes', () => {
      const parsed = NamespaceSanitizer.parseNamespace('my-epic/phase-2');
      expect(parsed.prefix).toBe('my-epic');
      expect(parsed.epicId).toBe('my-epic'); // First component fallback
      expect(parsed.phaseId).toBe('2');
    });
  });

  describe('compareNamespaces', () => {
    it('should detect parent relationship', () => {
      const parent = 'cfn-loop/epic-1';
      const child = 'cfn-loop/epic-1/phase-1';
      expect(NamespaceSanitizer.compareNamespaces(parent, child)).toBe('parent');
    });

    it('should detect child relationship', () => {
      const child = 'cfn-loop/epic-1/phase-1/sprint-1';
      const parent = 'cfn-loop/epic-1/phase-1';
      expect(NamespaceSanitizer.compareNamespaces(child, parent)).toBe('child');
    });

    it('should detect sibling relationship', () => {
      const sibling1 = 'cfn-loop/epic-1/phase-1';
      const sibling2 = 'cfn-loop/epic-1/phase-2';
      expect(NamespaceSanitizer.compareNamespaces(sibling1, sibling2)).toBe('sibling');
    });

    it('should detect unrelated namespaces', () => {
      const ns1 = 'cfn-loop/epic-1/phase-1';
      const ns2 = 'cfn-loop/epic-2/phase-1';
      expect(NamespaceSanitizer.compareNamespaces(ns1, ns2)).toBe('unrelated');
    });

    it('should handle identical namespaces', () => {
      const ns = 'cfn-loop/epic-1/phase-1';
      // Identical namespaces are neither parent nor child, so they're unrelated
      expect(NamespaceSanitizer.compareNamespaces(ns, ns)).toBe('unrelated');
    });
  });

  describe('generateMemoryPrefix', () => {
    it('should generate memory prefix for epic only', () => {
      const prefix = NamespaceSanitizer.generateMemoryPrefix('epic-1');
      expect(prefix).toBe('epic-1');
    });

    it('should generate memory prefix with phase', () => {
      const prefix = NamespaceSanitizer.generateMemoryPrefix('epic-1', 'phase-1');
      expect(prefix).toBe('epic-1:phase-phase-1');
    });

    it('should generate full memory prefix', () => {
      const prefix = NamespaceSanitizer.generateMemoryPrefix('epic-1', 'phase-1', 'sprint-1');
      expect(prefix).toBe('epic-1:phase-phase-1:sprint-sprint-1');
    });

    it('should sanitize all components', () => {
      const prefix = NamespaceSanitizer.generateMemoryPrefix('My Epic!', 'Phase @1', 'Sprint #1');
      expect(prefix).toBe('My-Epic:phase-Phase-1:sprint-Sprint-1');
    });
  });

  describe('Security edge cases', () => {
    it('should prevent path traversal variations', () => {
      const attacks = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        './../config',
        'epic/../../secrets',
        'phase/../../../root',
      ];

      attacks.forEach(attack => {
        expect(() => NamespaceSanitizer.sanitizeId(attack)).toThrow();
      });
    });

    it('should prevent injection via special characters', () => {
      const injections = [
        'epic<script>alert(1)</script>',
        'phase|rm -rf',
        'agent"quoted"',
        'path*wildcard',
      ];

      injections.forEach(injection => {
        expect(() => NamespaceSanitizer.sanitizeId(injection)).toThrow();
      });
    });

    it('should prevent null byte injection', () => {
      const nullByteAttack = 'epic\x00secret';
      expect(() => NamespaceSanitizer.sanitizeId(nullByteAttack)).toThrow('dangerous pattern');
    });

    it('should prevent control character injection', () => {
      const controlChars = 'epic\r\nphase\t\nsprint';
      expect(() => NamespaceSanitizer.sanitizeId(controlChars)).toThrow('dangerous pattern');
    });

    it('should handle Unicode edge cases', () => {
      // Unicode characters should be replaced/removed
      const unicode = 'epic-™-phase-©-sprint';
      const sanitized = NamespaceSanitizer.sanitizeId(unicode);
      expect(sanitized).toMatch(/^[a-zA-Z0-9\-_]+$/);
    });

    it('should prevent prototype pollution attempts', () => {
      expect(() => NamespaceSanitizer.sanitizeId('__proto__')).toThrow('reserved name');
      expect(() => NamespaceSanitizer.sanitizeId('constructor')).toThrow('reserved name');
      expect(() => NamespaceSanitizer.sanitizeId('prototype')).toThrow('reserved name');
    });
  });

  describe('Performance and limits', () => {
    it('should handle maximum safe depth', () => {
      const maxDepth = 10;
      const components = Array(maxDepth).fill('component').join('/');
      const result = NamespaceSanitizer.validateNamespacePath(components);
      expect(result.valid).toBe(true);
    });

    it('should handle maximum ID length', () => {
      const maxLength = 64;
      const longId = 'a'.repeat(maxLength);
      const sanitized = NamespaceSanitizer.sanitizeId(longId);
      expect(sanitized.length).toBe(maxLength);
    });

    it('should efficiently sanitize large batches', () => {
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        NamespaceSanitizer.sanitizeId(`epic-${i}`);
      }
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be fast (<100ms for 1000 ops)
    });

    it('should handle deep namespace validation efficiently', () => {
      const namespace = 'cfn-loop/epic-1/phase-1/sprint-1/agent-coder-1/iteration-5';
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        NamespaceSanitizer.validateNamespacePath(namespace);
      }
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50); // Should be fast (<50ms for 100 validations)
    });
  });

  describe('Integration scenarios', () => {
    it('should handle full CFN Loop namespace lifecycle', () => {
      // Build namespace for epic start
      const epicNs = NamespaceSanitizer.buildNamespace('user-mgmt', 'auth', 'jwt-token');
      expect(epicNs).toMatch(/^cfn-loop\/user-mgmt\/phase-auth\/sprint-jwt-token$/);

      // Add agent to namespace
      const agentNs = NamespaceSanitizer.buildNamespace(
        'user-mgmt',
        'auth',
        'jwt-token',
        'backend-dev-1'
      );
      expect(agentNs).toMatch(/agent-backend-dev-1$/);

      // Add iteration to namespace
      const iterNs = NamespaceSanitizer.buildNamespace(
        'user-mgmt',
        'auth',
        'jwt-token',
        'backend-dev-1',
        3
      );
      expect(iterNs).toMatch(/iteration-3$/);

      // Validate final namespace
      const validation = NamespaceSanitizer.validateNamespacePath(iterNs);
      expect(validation.valid).toBe(true);

      // Parse namespace components
      const parsed = NamespaceSanitizer.parseNamespace(iterNs);
      expect(parsed.epicId).toBe('user-mgmt');
      expect(parsed.phaseId).toBe('auth');
      expect(parsed.sprintId).toBe('jwt-token');
      expect(parsed.agentId).toBe('backend-dev-1');
      expect(parsed.iterationNum).toBe(3);
    });

    it('should handle cross-phase dependencies', () => {
      const phase1 = NamespaceSanitizer.buildNamespace('epic', 'phase-1', 'sprint-1');
      const phase2 = NamespaceSanitizer.buildNamespace('epic', 'phase-2', 'sprint-1');

      // Different phases, same epic = unrelated
      expect(NamespaceSanitizer.compareNamespaces(phase1, phase2)).toBe('unrelated');

      // Same phase, different sprints = siblings
      const sprint1 = NamespaceSanitizer.buildNamespace('epic', 'phase-1', 'sprint-1');
      const sprint2 = NamespaceSanitizer.buildNamespace('epic', 'phase-1', 'sprint-2');
      expect(NamespaceSanitizer.compareNamespaces(sprint1, sprint2)).toBe('sibling');
    });

    it('should generate consistent memory prefixes', () => {
      const prefix1 = NamespaceSanitizer.generateMemoryPrefix('epic', 'phase', 'sprint');
      const prefix2 = NamespaceSanitizer.generateMemoryPrefix('epic', 'phase', 'sprint');
      expect(prefix1).toBe(prefix2);

      // Different inputs = different prefixes
      const prefix3 = NamespaceSanitizer.generateMemoryPrefix('epic2', 'phase', 'sprint');
      expect(prefix1).not.toBe(prefix3);
    });
  });
});
