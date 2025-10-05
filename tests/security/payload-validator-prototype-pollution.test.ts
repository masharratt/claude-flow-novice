/**
 * SEC-INJ-001: Prototype Pollution Bypass Test
 *
 * Validates that PayloadValidator properly detects non-enumerable
 * properties like __proto__, constructor, and prototype to prevent
 * prototype pollution attacks.
 */

import { PayloadValidator } from '../../src/coordination/v2/security/payload-validator.js';

describe('SEC-INJ-001: Prototype Pollution Prevention', () => {
  let validator: PayloadValidator;

  beforeEach(() => {
    validator = new PayloadValidator();
  });

  describe('getAllKeys() non-enumerable property detection', () => {
    it('should detect __proto__ property in payload', () => {
      // Use Object.defineProperty to actually create __proto__ key
      const maliciousPayload = {};
      Object.defineProperty(maliciousPayload, '__proto__', {
        value: { polluted: true },
        enumerable: false,
        configurable: true
      });

      const keys = validator.getAllKeys(maliciousPayload);

      // Should include __proto__ because we now use getOwnPropertyNames
      expect(keys).toContain('__proto__');
    });

    it('should detect constructor property in payload', () => {
      const maliciousPayload = {
        "constructor": {
          polluted: true
        }
      };

      const keys = validator.getAllKeys(maliciousPayload);

      // Note: constructor is already an enumerable own property when set
      expect(keys).toContain('constructor');
    });

    it('should detect prototype property in payload', () => {
      const maliciousPayload = {
        "prototype": {
          polluted: true
        }
      };

      const keys = validator.getAllKeys(maliciousPayload);

      expect(keys).toContain('prototype');
    });

    it('should detect nested __proto__ in complex payload', () => {
      const maliciousPayload = {
        data: {
          user: {}
        }
      };
      // Create __proto__ property on nested object
      Object.defineProperty(maliciousPayload.data.user, '__proto__', {
        value: { isAdmin: true },
        enumerable: false,
        configurable: true
      });

      const keys = validator.getAllKeys(maliciousPayload);

      expect(keys).toContain('__proto__');
    });

    it('should detect symbol properties', () => {
      const testSymbol = Symbol('test');
      const payload = {
        normalKey: 'value',
        [testSymbol]: 'symbolValue'
      };

      const keys = validator.getAllKeys(payload);

      // Should include symbol representation
      expect(keys.some(k => k.includes('Symbol(test)'))).toBe(true);
    });

    it('should handle arrays with nested __proto__', () => {
      const nestedObj = { name: 'safe' };
      const protoObj = {};
      Object.defineProperty(protoObj, '__proto__', {
        value: { polluted: true },
        enumerable: false,
        configurable: true
      });

      const maliciousPayload = {
        items: [nestedObj, protoObj]
      };

      const keys = validator.getAllKeys(maliciousPayload);

      expect(keys).toContain('__proto__');
    });
  });

  describe('validate() integration with forbidden keys', () => {
    it('should reject payload with __proto__ via validate()', () => {
      const maliciousPayload = {};
      Object.defineProperty(maliciousPayload, '__proto__', {
        value: { polluted: true },
        enumerable: false,
        configurable: true
      });

      const result = validator.validate(maliciousPayload);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('__proto__'))).toBe(true);
    });

    it('should reject payload with constructor via validate()', () => {
      const maliciousPayload = {
        "constructor": {
          polluted: true
        }
      };

      const result = validator.validate(maliciousPayload);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('constructor'))).toBe(true);
    });

    it('should reject payload with prototype via validate()', () => {
      const maliciousPayload = {
        "prototype": {
          polluted: true
        }
      };

      const result = validator.validate(maliciousPayload);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('prototype'))).toBe(true);
    });

    it('should accept safe payload without forbidden keys', () => {
      const safePayload = {
        "data": {
          "user": {
            "name": "test",
            "role": "user"
          }
        }
      };

      const result = validator.validate(safePayload);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject deeply nested __proto__ pollution attempt', () => {
      const maliciousPayload = {
        level1: {
          level2: {
            level3: {}
          }
        }
      };
      Object.defineProperty(maliciousPayload.level1.level2.level3, '__proto__', {
        value: { isAdmin: true },
        enumerable: false,
        configurable: true
      });

      const result = validator.validate(maliciousPayload);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('__proto__'))).toBe(true);
    });
  });

  describe('Real-world attack vectors', () => {
    it('should reject JSON.parse with Object.setPrototypeOf pollution', () => {
      // This simulates a payload that passed through JSON.parse
      // but was then manipulated to have __proto__ property
      const maliciousPayload = JSON.parse('{"data": "test"}');
      Object.defineProperty(maliciousPayload, '__proto__', {
        value: { polluted: true },
        enumerable: false,
        configurable: true
      });

      const result = validator.validate(maliciousPayload);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('__proto__'))).toBe(true);
    });

    it('should reject lodash merge-style payload', () => {
      const maliciousPayload = {
        "constructor": {
          "prototype": {
            "polluted": true
          }
        }
      };

      const result = validator.validate(maliciousPayload);

      expect(result.valid).toBe(false);
      // Should catch either constructor or prototype
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject Object.assign-style pollution', () => {
      const maliciousPayload = {
        "normalData": "safe"
      };
      Object.defineProperty(maliciousPayload, '__proto__', {
        value: { isAdmin: true },
        enumerable: false,
        configurable: true
      });

      const result = validator.validate(maliciousPayload);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('__proto__'))).toBe(true);
    });
  });

  describe('Regression: Ensure existing functionality works', () => {
    it('should still validate normal object keys', () => {
      const payload = {
        "user": {
          "name": "test",
          "email": "test@example.com",
          "settings": {
            "theme": "dark"
          }
        }
      };

      const keys = validator.getAllKeys(payload);

      expect(keys).toContain('user');
      expect(keys).toContain('name');
      expect(keys).toContain('email');
      expect(keys).toContain('settings');
      expect(keys).toContain('theme');
    });

    it('should handle empty objects', () => {
      const payload = {};

      const keys = validator.getAllKeys(payload);

      expect(keys).toHaveLength(0);
    });

    it('should handle null and undefined', () => {
      expect(validator.getAllKeys(null)).toHaveLength(0);
      expect(validator.getAllKeys(undefined)).toHaveLength(0);
    });

    it('should handle arrays correctly', () => {
      const payload = {
        "items": ["a", "b", "c"]
      };

      const keys = validator.getAllKeys(payload);

      expect(keys).toContain('items');
    });
  });
});
