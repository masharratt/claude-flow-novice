// Stub: skill loader service
// Created to satisfy test imports

export interface Skill {
  name: string;
  version: string;
  path: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class SkillLoaderService {
  async load(skillName: string): Promise<Skill> {
    // Stub implementation
    return {
      name: skillName,
      version: '1.0.0',
      path: `/skills/${skillName}`,
      content: '',
    };
  }

  async loadAll(): Promise<Skill[]> {
    // Stub implementation
    return [];
  }

  async reload(skillName: string): Promise<Skill> {
    return this.load(skillName);
  }
}
