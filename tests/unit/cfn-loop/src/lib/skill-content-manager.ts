// Stub: skill content manager
// Created to satisfy test imports

export interface SkillContent {
  name: string;
  path: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class SkillContentManager {
  async loadSkill(path: string): Promise<SkillContent> {
    // Stub implementation
    return {
      name: 'stub-skill',
      path,
      content: '',
    };
  }

  async saveSkill(skill: SkillContent): Promise<void> {
    // Stub implementation
  }

  async deleteSkill(path: string): Promise<void> {
    // Stub implementation
  }

  async listSkills(): Promise<SkillContent[]> {
    // Stub implementation
    return [];
  }
}
