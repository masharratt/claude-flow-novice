/**
 * ESM Wrapper for Message Validator
 *
 * Provides ES module interface to CommonJS message-validator
 * Used in Layer 3 dormant coordinator tests
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load CommonJS message-validator
const validator = require('../../../src/security/message-validator.cjs');

// Re-export all functions
export const {
  validateMessage,
  parseAndValidateMessage,
  detectPrototypePollution,
  validateMessageSize,
  validateMessageStructure,
  validateSchema,
  getValidationStats,
  MAX_MESSAGE_SIZE,
  messageSchemas
} = validator;
