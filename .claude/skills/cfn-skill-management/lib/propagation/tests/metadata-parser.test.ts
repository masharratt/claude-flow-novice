/**
 * Tests for Metadata Parser
 */

import { SkillMetadataParser } from '../src/metadata-parser';

describe('SkillMetadataParser', () => {
  let parser: SkillMetadataParser;

  beforeEach(() => {
    parser = new SkillMetadataParser();
  });

  describe('parse', () => {
    it('should parse basic frontmatter', () => {
      const content = `---
name: test-skill
version: 1.0.0
description: A test skill
---
Content here`;

      const metadata = parser.parse(content);
      expect(metadata.name).toBe('test-skill');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.description).toBe('A test skill');
    });

    it('should parse array fields', () => {
      const content = `---
name: test-skill
version: 1.0.0
description: A test skill
tags: [tag1, tag2, tag3]
---
Content`;

      const metadata = parser.parse(content);
      expect(Array.isArray(metadata.tags)).toBe(true);
      expect(metadata.tags).toContain('tag1');
      expect(metadata.tags).toContain('tag2');
    });

    it('should parse quoted strings', () => {
      const content = `---
name: "my-skill"
version: "1.0.0"
description: "A quoted skill"
---
Content`;

      const metadata = parser.parse(content);
      expect(metadata.name).toBe('my-skill');
      expect(metadata.description).toBe('A quoted skill');
    });

    it('should throw on missing frontmatter', () => {
      const content = 'Content without frontmatter';
      expect(() => parser.parse(content)).toThrow();
    });

    it('should handle empty fields', () => {
      const content = `---
name: test-skill
version: 1.0.0
description:
category:
---
Content`;

      const metadata = parser.parse(content);
      expect(metadata.name).toBe('test-skill');
      expect(metadata.description).toBeNull();
    });
  });

  describe('validate', () => {
    it('should validate required fields', () => {
      const metadata = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'Test',
      };

      const result = parser.validate(metadata);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on missing name', () => {
      const metadata = {
        version: '1.0.0',
        description: 'Test',
      };

      const result = parser.validate(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should error on missing version', () => {
      const metadata = {
        name: 'test-skill',
        description: 'Test',
      };

      const result = parser.validate(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });

    it('should error on missing description', () => {
      const metadata = {
        name: 'test-skill',
        version: '1.0.0',
      };

      const result = parser.validate(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: description');
    });

    it('should error on invalid version format', () => {
      const metadata = {
        name: 'test-skill',
        version: '1.0',
        description: 'Test',
      };

      const result = parser.validate(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid version format'))).toBe(true);
    });
  });

  describe('extractField', () => {
    it('should extract single field value', () => {
      const content = `---
name: test-skill
version: 1.0.0
---`;

      const name = parser.extractField(content, 'name');
      expect(name).toBe('test-skill');
    });

    it('should return null for missing field', () => {
      const content = `---
name: test-skill
---`;

      const version = parser.extractField(content, 'missing');
      expect(version).toBeNull();
    });
  });

  describe('extractArrayField', () => {
    it('should extract array field', () => {
      const content = `---
tags: [tag1, tag2, tag3]
---`;

      const tags = parser.extractArrayField(content, 'tags');
      expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty array for missing field', () => {
      const content = `---
name: test-skill
---`;

      const tags = parser.extractArrayField(content, 'tags');
      expect(tags).toEqual([]);
    });
  });
});
