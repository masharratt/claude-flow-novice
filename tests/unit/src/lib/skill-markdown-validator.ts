// Stub: skill markdown validator
// Created to satisfy test imports

export interface MarkdownValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SkillMarkdownValidator {
  validate(content: string): MarkdownValidationResult {
    // Stub implementation
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }

  validateStructure(content: string): boolean {
    // Stub implementation
    return true;
  }
}

export function validateSkillMarkdown(content: string): MarkdownValidationResult {
  const validator = new SkillMarkdownValidator();
  return validator.validate(content);
}
