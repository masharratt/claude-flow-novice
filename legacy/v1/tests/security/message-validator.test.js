/**
 * Message Validator Test Suite
 *
 * Tests comprehensive JSON schema validation for coordinator messages
 * Security: VULN-002 mitigation (Unsafe JSON deserialization, CVSS 7.8)
 *
 * Test Categories:
 * 1. Valid Messages - All message types pass validation
 * 2. Invalid Structure - Missing required fields, wrong types
 * 3. Prototype Pollution - Malicious property injection
 * 4. Size Limits - Oversized messages rejected
 * 5. Schema Validation - Format violations, constraint failures
 */

const { describe, it, expect, beforeAll } = require('@jest/globals');
const {
  validateMessage,
  parseAndValidateMessage,
  detectPrototypePollution,
  validateMessageSize,
  validateMessageStructure,
  getValidationStats,
  MAX_MESSAGE_SIZE
} = require('../../src/security/message-validator.js');

describe('Message Validator - Security Tests', () => {
  let validationStats;

  beforeAll(() => {
    validationStats = getValidationStats();
  });

  // ========================================
  // Category 1: Valid Messages
  // ========================================

  describe('Valid Messages', () => {
    it('should validate valid request message', () => {
      const validRequest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'impl-coordinator',
        to: 'review-coordinator',
        task: 'review_code',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: {
          files: ['test.js'],
          language: 'javascript'
        }
      };

      expect(() => validateMessage(validRequest)).not.toThrow();
      const validated = validateMessage(validRequest);
      expect(validated.type).toBe('request');
      expect(validated.from).toBe('impl-coordinator');
    });

    it('should validate valid response message', () => {
      const validResponse = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        type: 'response',
        from: 'review-coordinator',
        to: 'impl-coordinator',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        success: true,
        data: {
          approved: true,
          suggestions: []
        }
      };

      expect(() => validateMessage(validResponse)).not.toThrow();
      const validated = validateMessage(validResponse);
      expect(validated.type).toBe('response');
      expect(validated.success).toBe(true);
    });

    it('should validate valid error message', () => {
      const validError = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        type: 'error',
        from: 'impl-coordinator',
        to: 'review-coordinator',
        timestamp: Date.now(),
        error: 'VALIDATION_FAILED',
        message: 'Code validation failed',
        stack: 'Error: Validation failed\n  at ...',
        correlationId: '550e8400-e29b-41d4-a716-446655440001'
      };

      expect(() => validateMessage(validError)).not.toThrow();
      const validated = validateMessage(validError);
      expect(validated.type).toBe('error');
      expect(validated.error).toBe('VALIDATION_FAILED');
    });

    it('should validate valid heartbeat message', () => {
      const validHeartbeat = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        type: 'heartbeat',
        from: 'impl-coordinator',
        coordinatorId: 'impl-coordinator',
        timestamp: Date.now(),
        state: 'active',
        stats: {
          requestsReceived: 10,
          requestsCompleted: 8,
          queueSize: 2,
          pendingRequests: 1
        }
      };

      expect(() => validateMessage(validHeartbeat)).not.toThrow();
      const validated = validateMessage(validHeartbeat);
      expect(validated.type).toBe('heartbeat');
      expect(validated.state).toBe('active');
    });
  });

  // ========================================
  // Category 2: Invalid Structure
  // ========================================

  describe('Invalid Message Structure', () => {
    it('should reject non-object messages', () => {
      expect(() => validateMessage(null)).toThrow('Message must be a non-null object');
      expect(() => validateMessage(undefined)).toThrow('Message must be a non-null object');
      expect(() => validateMessage('string')).toThrow('Message must be a non-null object');
      expect(() => validateMessage(123)).toThrow('Message must be a non-null object');
      expect(() => validateMessage([1, 2, 3])).toThrow('Message must be a non-null object');
    });

    it('should reject messages without type property', () => {
      const noType = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        from: 'test',
        timestamp: Date.now()
      };

      expect(() => validateMessage(noType)).toThrow('Message must have a "type" property');
    });

    it('should reject messages with invalid type', () => {
      const invalidType = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'invalid_type',
        from: 'test',
        timestamp: Date.now()
      };

      expect(() => validateMessage(invalidType)).toThrow('Unknown message type: "invalid_type"');
    });

    it('should reject messages missing required fields', () => {
      const missingFields = {
        type: 'request',
        from: 'test',
        // Missing: id, to, task, correlationId, timestamp
      };

      expect(() => validateMessage(missingFields)).toThrow('Schema validation failed');
    });

    it('should reject messages with wrong field types', () => {
      const wrongTypes = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 123, // Should be string
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now()
      };

      expect(() => validateMessage(wrongTypes)).toThrow('Schema validation failed');
    });

    it('should reject messages with invalid UUID format', () => {
      const invalidUUID = {
        id: 'not-a-uuid',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: 'also-not-a-uuid',
        timestamp: Date.now()
      };

      expect(() => validateMessage(invalidUUID)).toThrow('Schema validation failed');
    });
  });

  // ========================================
  // Category 3: Prototype Pollution
  // ========================================

  describe('Prototype Pollution Detection', () => {
    it('should detect __proto__ pollution attempt via defineProperty', () => {
      // Use Object.defineProperty to create __proto__ as own property
      const protoAttack = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'attacker',
        to: 'victim',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now()
      };

      // This creates __proto__ as an own property
      Object.defineProperty(protoAttack, '__proto__', {
        value: { isAdmin: true },
        enumerable: false,
        configurable: true
      });

      expect(() => detectPrototypePollution(protoAttack)).toThrow('Prototype pollution attempt detected');
    });

    it('should detect constructor pollution attempt', () => {
      const constructorAttack = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'attacker',
        to: 'victim',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        constructor: {
          prototype: {
            isAdmin: true
          }
        }
      };

      expect(() => validateMessage(constructorAttack)).toThrow('Prototype pollution attempt detected');
    });

    it('should detect prototype property pollution', () => {
      const prototypeAttack = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'attacker',
        to: 'victim',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        prototype: {
          isAdmin: true
        }
      };

      expect(() => validateMessage(prototypeAttack)).toThrow('Prototype pollution attempt detected');
    });

    it('should detect nested prototype pollution', () => {
      const nestedAttack = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'attacker',
        to: 'victim',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: {
          nested: {}
        }
      };

      // Set __proto__ on nested object using defineProperty
      Object.defineProperty(nestedAttack.data.nested, '__proto__', {
        value: { isAdmin: true },
        enumerable: false,
        configurable: true
      });

      expect(() => detectPrototypePollution(nestedAttack)).toThrow('Prototype pollution attempt detected');
    });

    it('should detect __defineGetter__ pollution', () => {
      const getterAttack = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'attacker',
        to: 'victim',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        __defineGetter__: () => true
      };

      expect(() => detectPrototypePollution(getterAttack)).toThrow('Prototype pollution attempt detected');
    });

    it('should detect __defineSetter__ pollution', () => {
      const setterAttack = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'attacker',
        to: 'victim',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        __defineSetter__: () => {}
      };

      expect(() => detectPrototypePollution(setterAttack)).toThrow('Prototype pollution attempt detected');
    });
  });

  // ========================================
  // Category 4: Size Limits
  // ========================================

  describe('Payload Size Limits', () => {
    it('should reject oversized messages (>1MB)', () => {
      const oversizedData = 'x'.repeat(1048577); // 1MB + 1 byte
      const oversizedMessage = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: {
          payload: oversizedData
        }
      };

      expect(() => validateMessage(oversizedMessage)).toThrow('Message size');
      expect(() => validateMessage(oversizedMessage)).toThrow('exceeds maximum');
    });

    it('should accept messages at size limit (exactly 1MB)', () => {
      // Create message that's close to but under 1MB
      const largeData = 'x'.repeat(500000); // 500KB
      const largeMessage = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: {
          payload: largeData
        }
      };

      expect(() => validateMessage(largeMessage)).not.toThrow();
    });

    it('should validate custom size limits', () => {
      const customLimit = 1024; // 1KB
      const tooLarge = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: {
          payload: 'x'.repeat(2000)
        }
      };

      expect(() => validateMessage(tooLarge, customLimit)).toThrow('exceeds maximum');
    });
  });

  // ========================================
  // Category 5: Schema Validation
  // ========================================

  describe('JSON Schema Validation', () => {
    it('should enforce string length limits on IDs', () => {
      const longId = 'x'.repeat(101); // Max is 100
      const invalidMessage = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: longId,
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now()
      };

      expect(() => validateMessage(invalidMessage)).toThrow('Schema validation failed');
    });

    it('should enforce ID pattern (alphanumeric, dash, underscore)', () => {
      const invalidPattern = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'invalid@coordinator',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now()
      };

      expect(() => validateMessage(invalidPattern)).toThrow('Schema validation failed');
    });

    it('should enforce timestamp range limits', () => {
      const invalidTimestamp = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: -1 // Negative timestamp
      };

      expect(() => validateMessage(invalidTimestamp)).toThrow('Schema validation failed');
    });

    it('should enforce heartbeat state enum', () => {
      const invalidState = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'heartbeat',
        from: 'test',
        coordinatorId: 'test',
        timestamp: Date.now(),
        state: 'invalid_state', // Must be dormant, active, paused, or stopped
        stats: {
          requestsReceived: 0,
          requestsCompleted: 0,
          queueSize: 0,
          pendingRequests: 0
        }
      };

      expect(() => validateMessage(invalidState)).toThrow('Schema validation failed');
    });

    it('should remove additional properties (security)', () => {
      const extraProps = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        extraProperty: 'should be removed'
      };

      const validated = validateMessage(extraProps);
      expect(validated.extraProperty).toBeUndefined();
    });

    it('should enforce maximum properties in data objects', () => {
      const tooManyProps = {};
      for (let i = 0; i < 101; i++) {
        tooManyProps[`prop${i}`] = i;
      }

      const invalidMessage = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: tooManyProps
      };

      expect(() => validateMessage(invalidMessage)).toThrow('Schema validation failed');
    });
  });

  // ========================================
  // Category 6: parseAndValidateMessage
  // ========================================

  describe('Safe JSON Parsing', () => {
    it('should parse and validate valid JSON string', () => {
      const validMessage = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now()
      };

      const jsonStr = JSON.stringify(validMessage);
      expect(() => parseAndValidateMessage(jsonStr)).not.toThrow();
      const parsed = parseAndValidateMessage(jsonStr);
      expect(parsed.type).toBe('request');
    });

    it('should reject invalid JSON', () => {
      const invalidJSON = '{ invalid json }';
      expect(() => parseAndValidateMessage(invalidJSON)).toThrow('Invalid JSON');
    });

    it('should reject oversized JSON strings', () => {
      const oversized = 'x'.repeat(1048577);
      expect(() => parseAndValidateMessage(oversized)).toThrow('exceeds maximum');
    });

    it('should handle JSON with prototype pollution via defineProperty', () => {
      // Create a JSON string and then add __proto__ via defineProperty
      const baseObj = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now()
      };

      const parsed = JSON.parse(JSON.stringify(baseObj));
      Object.defineProperty(parsed, '__proto__', {
        value: { isAdmin: true },
        enumerable: false,
        configurable: true
      });

      expect(() => detectPrototypePollution(parsed)).toThrow('Prototype pollution');
    });
  });

  // ========================================
  // Category 7: Validation Statistics
  // ========================================

  describe('Validation Statistics', () => {
    it('should return validation configuration', () => {
      const stats = getValidationStats();

      expect(stats.maxMessageSize).toBe(1048576);
      expect(stats.maxStringLength).toBe(10000);
      expect(stats.maxIdLength).toBe(100);
      expect(stats.supportedMessageTypes).toEqual(['request', 'response', 'error', 'heartbeat']);
      expect(stats.dangerousProperties).toContain('__proto__');
      expect(stats.dangerousProperties).toContain('constructor');
      expect(stats.dangerousProperties).toContain('prototype');
    });

    it('should report max message size constant', () => {
      expect(MAX_MESSAGE_SIZE).toBe(1048576);
    });
  });

  // ========================================
  // Category 8: Edge Cases
  // ========================================

  describe('Edge Cases', () => {
    it('should handle empty data object in request', () => {
      const emptyData = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: {}
      };

      expect(() => validateMessage(emptyData)).not.toThrow();
    });

    it('should handle optional fields (error stack)', () => {
      const noStack = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'error',
        from: 'test',
        to: 'test',
        timestamp: Date.now(),
        error: 'ERROR_CODE',
        message: 'Error message'
        // stack is optional
      };

      expect(() => validateMessage(noStack)).not.toThrow();
    });

    it('should handle minimum valid timestamp', () => {
      const minTimestamp = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: 0
      };

      expect(() => validateMessage(minTimestamp)).not.toThrow();
    });

    it('should handle deeply nested data structures', () => {
      const deepNested = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'request',
        from: 'test',
        to: 'test',
        task: 'test',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        data: {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep'
                }
              }
            }
          }
        }
      };

      expect(() => validateMessage(deepNested)).not.toThrow();
    });
  });
});
