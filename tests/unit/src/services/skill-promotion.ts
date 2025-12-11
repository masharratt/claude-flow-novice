// Stub: skill promotion service
// Created to satisfy test imports

export interface PromotionOptions {
  skillName: string;
  fromStage: string;
  toStage: string;
  skipValidation?: boolean;
}

export interface PromotionResult {
  success: boolean;
  skillName: string;
  stage: string;
  errors?: string[];
}

export class SkillPromotionService {
  async promote(options: PromotionOptions): Promise<PromotionResult> {
    // Stub implementation
    return {
      success: true,
      skillName: options.skillName,
      stage: options.toStage,
    };
  }

  async listPromotions(): Promise<PromotionResult[]> {
    // Stub implementation
    return [];
  }
}
