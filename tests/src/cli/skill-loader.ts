// Stub: CLI skill loader
// Created to satisfy test imports

export interface SkillLoaderOptions {
  skillPath?: string;
  cache?: boolean;
}

export interface LoadedSkill {
  name: string;
  path: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class SkillLoader {
  async load(skillName: string, options?: SkillLoaderOptions): Promise<LoadedSkill> {
    // Stub implementation
    return {
      name: skillName,
      path: `/skills/${skillName}`,
      content: '',
    };
  }

  async listSkills(): Promise<string[]> {
    // Stub implementation
    return [];
  }
}

export function loadSkill(skillName: string): Promise<LoadedSkill> {
  const loader = new SkillLoader();
  return loader.load(skillName);
}
