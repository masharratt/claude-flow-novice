// Stub: agent output validator
// Created to satisfy test imports

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class AgentOutputValidator {
  validate(output: string | unknown): ValidationResult {
    // Stub implementation
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }
}

export function validateAgentOutput(output: string | unknown): ValidationResult {
  const validator = new AgentOutputValidator();
  return validator.validate(output);
}
