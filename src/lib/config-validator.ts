// Stub: config validator
// Created to satisfy test imports

export interface ConfigValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export class ConfigValidator {
  validate(config: unknown): ConfigValidationResult {
    // Stub implementation
    return {
      valid: true,
      errors: [],
    };
  }

  validateSchema(config: unknown, schema: unknown): ConfigValidationResult {
    // Stub implementation
    return {
      valid: true,
      errors: [],
    };
  }
}

export function validateConfig(config: unknown): ConfigValidationResult {
  const validator = new ConfigValidator();
  return validator.validate(config);
}
