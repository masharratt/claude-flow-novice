// Stub: promotion validator service
// Created to satisfy test imports

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateStagedSkill(skillName: string): Promise<ValidationResult> {
  // Stub implementation
  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}

export class PromotionValidator {
  async validate(skillName: string): Promise<ValidationResult> {
    return validateStagedSkill(skillName);
  }
}
