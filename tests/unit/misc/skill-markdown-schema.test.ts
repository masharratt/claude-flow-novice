/**
 * Skill Markdown Schema Tests
 *
 * TDD Approach: These tests are written FIRST to define requirements
 * before implementation. Tests should initially FAIL until schema and
 * validation utilities are implemented.
 *
 * Coverage Target: >85%
 *
 * @see schemas/skill-markdown-v1.schema.json
 * @see src/lib/skill-markdown-validator.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import glob from 'glob';

// Test data paths
const SCHEMA_PATH = path.join(__dirname, '../schemas/skill-markdown-v1.schema.json');
const TEMPLATE_PATH = path.join(__dirname, '../.claude/skills/SKILL_TEMPLATE.md');
const SKILLS_DIR = path.join(__dirname, '../.claude/skills');

// Interfaces
interface SkillFrontmatter {
  name: string;
  version: string;
  category: string;
  status: 'active' | 'deprecated' | 'experimental';
  author?: string;
  tags?: string[];
}

interface SkillSections {
  overview?: string;
  usage?: string;
  examples?: string;
  implementation?: string;
  testing?: string;
}

interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  sections: SkillSections;
  rawContent: string;
}

// Helper functions
function parseSkillMarkdown(content: string): ParsedSkill {
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('No frontmatter found');
  }

  const frontmatter = yaml.load(frontmatterMatch[1]) as SkillFrontmatter;

  // Extract sections
  const sections: SkillSections = {};

  // Match ## Overview through content
  const overviewMatch = content.match(/##\s+Overview\s*\n([\s\S]+?)(?=\n##\s|\n#\s|$)/i);
  if (overviewMatch) sections.overview = overviewMatch[1].trim();

  const usageMatch = content.match(/##\s+Usage\s*\n([\s\S]+?)(?=\n##\s|\n#\s|$)/i);
  if (usageMatch) sections.usage = usageMatch[1].trim();

  const examplesMatch = content.match(/##\s+Examples?\s*\n([\s\S]+?)(?=\n##\s|\n#\s|$)/i);
  if (examplesMatch) sections.examples = examplesMatch[1].trim();

  const implementationMatch = content.match(/##\s+Implementation\s*\n([\s\S]+?)(?=\n##\s|\n#\s|$)/i);
  if (implementationMatch) sections.implementation = implementationMatch[1].trim();

  const testingMatch = content.match(/##\s+Testing\s*\n([\s\S]+?)(?=\n##\s|\n#\s|$)/i);
  if (testingMatch) sections.testing = testingMatch[1].trim();

  return {
    frontmatter,
    sections,
    rawContent: content
  };
}

function findCodeBlocks(content: string): { hasLanguage: boolean; line: number; block: string }[] {
  const blocks: { hasLanguage: boolean; line: number; block: string }[] = [];
  const lines = content.split('\n');

  let inBlock = false;
  let blockStart = 0;
  let blockContent = '';

  lines.forEach((line, index) => {
    if (line.startsWith('```')) {
      if (!inBlock) {
        // Starting a code block
        inBlock = true;
        blockStart = index + 1;
        blockContent = line;

        // Check if language specified
        const hasLanguage = line.length > 3 && line.substring(3).trim().length > 0;
        blocks.push({ hasLanguage, line: blockStart, block: '' });
      } else {
        // Ending a code block
        inBlock = false;
        blocks[blocks.length - 1].block = blockContent;
        blockContent = '';
      }
    } else if (inBlock) {
      blockContent += '\n' + line;
    }
  });

  return blocks;
}

function validateInternalLinks(content: string, skillsDir: string): { valid: boolean; brokenLinks: string[] } {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const brokenLinks: string[] = [];
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const linkPath = match[2];

    // Only check internal links (not http/https)
    if (!linkPath.startsWith('http://') && !linkPath.startsWith('https://') && !linkPath.startsWith('#')) {
      // Resolve relative path
      const absolutePath = path.resolve(skillsDir, linkPath);
      if (!fs.existsSync(absolutePath)) {
        brokenLinks.push(linkPath);
      }
    }
  }

  return {
    valid: brokenLinks.length === 0,
    brokenLinks
  };
}

describe('Skill Markdown Schema Validation', () => {
  let schema: any;
  let ajv: Ajv;

  beforeAll(() => {
    // Load schema (will fail until schema is created)
    if (fs.existsSync(SCHEMA_PATH)) {
      schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
      ajv = new Ajv({ allErrors: true });
    }
  });

  describe('Schema Existence', () => {
    it('should have JSON schema file', () => {
      expect(fs.existsSync(SCHEMA_PATH)).toBe(true);
    });

    it('should be valid JSON schema format', () => {
      expect(schema).toBeDefined();
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.title).toBe('CFN Skill Markdown Format v1.0');
    });
  });

  describe('Frontmatter Validation', () => {
    it('should validate required frontmatter fields', () => {
      const validFrontmatter: SkillFrontmatter = {
        name: 'test-skill',
        version: '1.0.0',
        category: 'testing',
        status: 'active'
      };

      // Schema should define these as required
      expect(schema.definitions.frontmatter.required).toContain('name');
      expect(schema.definitions.frontmatter.required).toContain('version');
      expect(schema.definitions.frontmatter.required).toContain('category');
      expect(schema.definitions.frontmatter.required).toContain('status');
    });

    it('should validate version follows semver format', () => {
      const pattern = schema.definitions.frontmatter.properties.version.pattern;
      const semverRegex = new RegExp(pattern);

      // Valid versions
      expect('1.0.0').toMatch(semverRegex);
      expect('2.15.3').toMatch(semverRegex);
      expect('0.1.0').toMatch(semverRegex);

      // Invalid versions
      expect('1.0').not.toMatch(semverRegex);
      expect('v1.0.0').not.toMatch(semverRegex);
      expect('1.0.0-beta').not.toMatch(semverRegex);
    });

    it('should validate name follows kebab-case pattern', () => {
      const pattern = schema.definitions.frontmatter.properties.name.pattern;
      const nameRegex = new RegExp(pattern);

      // Valid names
      expect('test-skill').toMatch(nameRegex);
      expect('my-skill-123').toMatch(nameRegex);
      expect('skill').toMatch(nameRegex);

      // Invalid names
      expect('Test-Skill').not.toMatch(nameRegex);
      expect('test_skill').not.toMatch(nameRegex);
      expect('test.skill').not.toMatch(nameRegex);
    });

    it('should validate status is enum', () => {
      const validStatuses = schema.definitions.frontmatter.properties.status.enum;

      expect(validStatuses).toContain('active');
      expect(validStatuses).toContain('deprecated');
      expect(validStatuses).toContain('experimental');
      expect(validStatuses).toHaveLength(3);
    });

    it('should allow optional author field', () => {
      const required = schema.definitions.frontmatter.required;
      expect(required).not.toContain('author');
      expect(schema.definitions.frontmatter.properties.author).toBeDefined();
    });

    it('should validate tags as array', () => {
      const tagsSchema = schema.definitions.frontmatter.properties.tags;
      expect(tagsSchema.type).toBe('array');
      expect(tagsSchema.items.type).toBe('string');
    });
  });

  describe('Section Requirements', () => {
    it('should require Overview section', () => {
      expect(schema.definitions.sections.required).toContain('overview');
    });

    it('should require Usage section', () => {
      expect(schema.definitions.sections.required).toContain('usage');
    });

    it('should require Examples section', () => {
      expect(schema.definitions.sections.required).toContain('examples');
    });

    it('should require Implementation section', () => {
      expect(schema.definitions.sections.required).toContain('implementation');
    });

    it('should require Testing section', () => {
      expect(schema.definitions.sections.required).toContain('testing');
    });

    it('should enforce minimum section length', () => {
      const sections = ['overview', 'usage', 'examples', 'implementation', 'testing'];

      sections.forEach(section => {
        const sectionSchema = schema.definitions.sections.properties[section];
        expect(sectionSchema.type).toBe('string');
        expect(sectionSchema.minLength).toBe(10);
      });
    });
  });

  describe('Content Validation', () => {
    it('should detect code blocks without language specifiers', () => {
      const contentWithoutLang = `
## Examples

\`\`\`
some code
\`\`\`
`;

      const blocks = findCodeBlocks(contentWithoutLang);
      expect(blocks.length).toBe(1);
      expect(blocks[0].hasLanguage).toBe(false);
    });

    it('should detect code blocks with language specifiers', () => {
      const contentWithLang = `
## Examples

\`\`\`bash
echo "test"
\`\`\`
`;

      const blocks = findCodeBlocks(contentWithLang);
      expect(blocks.length).toBe(1);
      expect(blocks[0].hasLanguage).toBe(true);
    });

    it('should validate heading hierarchy', () => {
      const validContent = `
# Skill Name

## Overview

### Details

## Usage
`;

      const lines = validContent.split('\n');
      const headings = lines.filter(l => l.trim().startsWith('#'));

      // First heading should be h1
      expect(headings[0].match(/^#\s/)).toBeTruthy();

      // Should not skip levels (h1 -> h3)
      let prevLevel = 0;
      headings.forEach(heading => {
        const level = heading.match(/^(#+)/)?.[1].length || 0;
        expect(level).toBeLessThanOrEqual(prevLevel + 1);
        prevLevel = level;
      });
    });
  });

  describe('Template Validation', () => {
    it('should validate SKILL_TEMPLATE.md exists', () => {
      expect(fs.existsSync(TEMPLATE_PATH)).toBe(true);
    });

    it('should validate template has all required sections', () => {
      if (!fs.existsSync(TEMPLATE_PATH)) {
        return; // Skip if template doesn't exist
      }

      const content = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
      const parsed = parseSkillMarkdown(content);

      expect(parsed.frontmatter.name).toBeDefined();
      expect(parsed.frontmatter.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(parsed.sections.overview).toBeDefined();
      expect(parsed.sections.usage).toBeDefined();
      expect(parsed.sections.examples).toBeDefined();
      expect(parsed.sections.implementation).toBeDefined();
      expect(parsed.sections.testing).toBeDefined();
    });

    it('should validate template code blocks have language specifiers', () => {
      if (!fs.existsSync(TEMPLATE_PATH)) {
        return;
      }

      const content = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
      const blocks = findCodeBlocks(content);

      blocks.forEach(block => {
        expect(block.hasLanguage).toBe(true);
      });
    });
  });

  describe('Real Skill File Validation', () => {
    let skillFiles: string[];

    beforeAll(() => {
      if (fs.existsSync(SKILLS_DIR)) {
        skillFiles = glob.sync(`${SKILLS_DIR}/*/SKILL.md`);
      } else {
        skillFiles = [];
      }
    });

    it('should find skill files in .claude/skills', () => {
      expect(skillFiles.length).toBeGreaterThan(0);
    });

    it('should validate sample of real skills', () => {
      if (skillFiles.length === 0) {
        return;
      }

      // Test first 10 skills
      const sampleSkills = skillFiles.slice(0, 10);
      const results = sampleSkills.map(file => {
        const content = fs.readFileSync(file, 'utf-8');

        try {
          const parsed = parseSkillMarkdown(content);
          return {
            file,
            valid: true,
            parsed
          };
        } catch (error) {
          return {
            file,
            valid: false,
            error: (error as Error).message
          };
        }
      });

      // At least 80% should be valid
      const validCount = results.filter(r => r.valid).length;
      const validPercentage = (validCount / results.length) * 100;

      expect(validPercentage).toBeGreaterThanOrEqual(80);
    });

    it('should report skills with missing frontmatter', () => {
      if (skillFiles.length === 0) {
        return;
      }

      const skillsWithoutFrontmatter: string[] = [];

      skillFiles.slice(0, 20).forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        if (!content.match(/^---\n[\s\S]+?\n---/)) {
          skillsWithoutFrontmatter.push(file);
        }
      });

      // Report but don't fail (for migration tracking)
      if (skillsWithoutFrontmatter.length > 0) {
        console.log(`\nSkills without frontmatter (${skillsWithoutFrontmatter.length}):`);
        skillsWithoutFrontmatter.forEach(f => console.log(`  - ${path.basename(path.dirname(f))}`));
      }

      // This test passes but logs issues for migration
      expect(true).toBe(true);
    });

    it('should report skills with missing required sections', () => {
      if (skillFiles.length === 0) {
        return;
      }

      const requiredSections = ['overview', 'usage', 'examples', 'implementation', 'testing'];
      const missingBySection: Record<string, string[]> = {};

      requiredSections.forEach(section => {
        missingBySection[section] = [];
      });

      skillFiles.slice(0, 20).forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');

        try {
          const parsed = parseSkillMarkdown(content);

          requiredSections.forEach(section => {
            if (!parsed.sections[section as keyof SkillSections]) {
              missingBySection[section].push(file);
            }
          });
        } catch (error) {
          // Skip files that can't be parsed
        }
      });

      // Report missing sections
      Object.entries(missingBySection).forEach(([section, files]) => {
        if (files.length > 0) {
          console.log(`\nSkills missing ${section} section (${files.length}):`);
          files.slice(0, 5).forEach(f => console.log(`  - ${path.basename(path.dirname(f))}`));
        }
      });

      // This test passes but logs issues for migration
      expect(true).toBe(true);
    });

    it('should report code blocks without language specifiers', () => {
      if (skillFiles.length === 0) {
        return;
      }

      const filesWithIssues: { file: string; count: number }[] = [];

      skillFiles.slice(0, 20).forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const blocks = findCodeBlocks(content);
        const blocksWithoutLang = blocks.filter(b => !b.hasLanguage);

        if (blocksWithoutLang.length > 0) {
          filesWithIssues.push({
            file,
            count: blocksWithoutLang.length
          });
        }
      });

      // Report issues
      if (filesWithIssues.length > 0) {
        console.log(`\nSkills with unlabeled code blocks (${filesWithIssues.length}):`);
        filesWithIssues.slice(0, 5).forEach(({ file, count }) =>
          console.log(`  - ${path.basename(path.dirname(file))}: ${count} blocks`)
        );
      }

      // This test passes but logs issues for migration
      expect(true).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle skills with extra frontmatter fields', () => {
      const content = `---
name: test-skill
version: 1.0.0
category: testing
status: active
custom_field: "extra data"
---

# Test Skill

## Overview
Test overview

## Usage
Test usage

## Examples
Test examples

## Implementation
Test implementation

## Testing
Test testing
`;

      expect(() => parseSkillMarkdown(content)).not.toThrow();
    });

    it('should handle skills with multiple code blocks', () => {
      const content = `---
name: test
version: 1.0.0
category: test
status: active
---

# Test

## Overview
Test

## Usage
\`\`\`bash
echo "test"
\`\`\`

## Examples
\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`javascript
const y = 2;
\`\`\`

## Implementation
Test

## Testing
Test
`;

      const blocks = findCodeBlocks(content);
      expect(blocks.length).toBe(3);
      expect(blocks.every(b => b.hasLanguage)).toBe(true);
    });

    it('should handle empty optional sections gracefully', () => {
      const content = `---
name: test
version: 1.0.0
category: test
status: active
---

# Test

## Overview
Test overview

## Usage
Test usage

## Examples
Test examples

## Implementation
Test implementation

## Testing
Test testing
`;

      const parsed = parseSkillMarkdown(content);
      expect(parsed.frontmatter.author).toBeUndefined();
      expect(parsed.frontmatter.tags).toBeUndefined();
    });
  });
});
