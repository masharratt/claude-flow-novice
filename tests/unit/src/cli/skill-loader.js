// Stub: CLI skill loader (JavaScript)
// Created to satisfy test imports

export class SkillLoader {
  async load(skillName, options = {}) {
    return {
      name: skillName,
      path: `/skills/${skillName}`,
      content: '',
    };
  }

  async listSkills() {
    return [];
  }
}

export function loadSkill(skillName) {
  const loader = new SkillLoader();
  return loader.load(skillName);
}
