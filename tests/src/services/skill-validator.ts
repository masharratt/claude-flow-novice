// Stub: skill validator service
// Created to satisfy test imports

export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SkillValidator {
  async validate(skillPath: string): Promise<SkillValidationResult> {
    // Stub implementation
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }

  async validateContent(content: string): Promise<SkillValidationResult> {
    // Stub implementation
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }
}
