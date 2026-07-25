// Stub: skill frontmatter parser
// Created to satisfy test imports

export interface SkillFrontmatter {
  name: string;
  version?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export class FrontmatterParser {
  parse(content: string): { frontmatter: SkillFrontmatter; body: string } {
    // Stub implementation - simple extraction
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!fmMatch) {
      return {
        frontmatter: { name: 'unknown' },
        body: content,
      };
    }

    const frontmatter: SkillFrontmatter = { name: 'parsed' };
    const body = fmMatch[2] || '';

    return { frontmatter, body };
  }
}

export function parseFrontmatter(content: string): SkillFrontmatter {
  const parser = new FrontmatterParser();
  return parser.parse(content).frontmatter;
}
