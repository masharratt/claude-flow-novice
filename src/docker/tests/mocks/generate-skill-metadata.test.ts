/**
 * Skill Metadata Generator Test Suite
 * Tests metadata generation for skills
 *
 * Migration from: docker/tests/mocks/generate-skill-metadata.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  parameters: Array<{ name: string; type: string; required: boolean }>;
  outputs: Array<{ name: string; type: string }>;
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

class SkillMetadataGenerator {
  /**
   * Generate skill metadata
   */
  generateMetadata(
    id: string,
    name: string,
    description: string,
    parameters: Array<{ name: string; type: string; required: boolean }> = [],
    outputs: Array<{ name: string; type: string }> = []
  ): SkillMetadata {
    return {
      id,
      name,
      version: '1.0.0',
      author: 'system',
      description,
      parameters,
      outputs,
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Validate metadata
   */
  validateMetadata(metadata: SkillMetadata): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!metadata.id || metadata.id.length === 0) {
      errors.push('ID is required');
    }

    if (!metadata.name || metadata.name.length === 0) {
      errors.push('Name is required');
    }

    if (!metadata.description || metadata.description.length === 0) {
      errors.push('Description is required');
    }

    if (!metadata.version) {
      errors.push('Version is required');
    }

    if (!Array.isArray(metadata.parameters)) {
      errors.push('Parameters must be an array');
    }

    if (!Array.isArray(metadata.outputs)) {
      errors.push('Outputs must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Serialize metadata to JSON
   */
  serialize(metadata: SkillMetadata): string {
    return JSON.stringify({
      ...metadata,
      createdAt: metadata.createdAt.toISOString(),
      updatedAt: metadata.updatedAt.toISOString()
    }, null, 2);
  }

  /**
   * Deserialize metadata from JSON
   */
  deserialize(json: string): SkillMetadata {
    const data = JSON.parse(json);
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    };
  }

  /**
   * Merge metadata
   */
  mergeMetadata(base: SkillMetadata, override: Partial<SkillMetadata>): SkillMetadata {
    return {
      ...base,
      ...override,
      updatedAt: new Date()
    };
  }
}

describe('Skill Metadata Generator', () => {
  let generator: SkillMetadataGenerator;

  beforeEach(() => {
    generator = new SkillMetadataGenerator();
  });

  describe('Metadata Generation', () => {
    it('should generate skill metadata', () => {
      const metadata = generator.generateMetadata(
        'skill-1',
        'Test Skill',
        'A test skill'
      );

      expect(metadata.id).toBe('skill-1');
      expect(metadata.name).toBe('Test Skill');
      expect(metadata.description).toBe('A test skill');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should include parameters', () => {
      const params = [
        { name: 'input', type: 'string', required: true },
        { name: 'options', type: 'object', required: false }
      ];

      const metadata = generator.generateMetadata(
        'skill-1',
        'Test',
        'Description',
        params
      );

      expect(metadata.parameters).toEqual(params);
    });

    it('should include outputs', () => {
      const outputs = [
        { name: 'result', type: 'string' },
        { name: 'status', type: 'number' }
      ];

      const metadata = generator.generateMetadata(
        'skill-1',
        'Test',
        'Description',
        [],
        outputs
      );

      expect(metadata.outputs).toEqual(outputs);
    });

    it('should set timestamps', () => {
      const before = new Date();
      const metadata = generator.generateMetadata('skill-1', 'Test', 'Description');
      const after = new Date();

      expect(metadata.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(metadata.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Metadata Validation', () => {
    it('should validate complete metadata', () => {
      const metadata = generator.generateMetadata(
        'skill-1',
        'Test Skill',
        'A test skill'
      );

      const validation = generator.validateMetadata(metadata);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing ID', () => {
      const metadata = generator.generateMetadata(
        '',
        'Test Skill',
        'Description'
      );

      const validation = generator.validateMetadata(metadata);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('ID is required');
    });

    it('should detect missing name', () => {
      const metadata = generator.generateMetadata(
        'skill-1',
        '',
        'Description'
      );

      const validation = generator.validateMetadata(metadata);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Name is required');
    });

    it('should detect missing description', () => {
      const metadata = generator.generateMetadata(
        'skill-1',
        'Test',
        ''
      );

      const validation = generator.validateMetadata(metadata);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Description is required');
    });
  });

  describe('Serialization', () => {
    it('should serialize metadata to JSON', () => {
      const metadata = generator.generateMetadata(
        'skill-1',
        'Test',
        'Description'
      );

      const json = generator.serialize(metadata);
      expect(typeof json).toBe('string');
      expect(json).toContain('skill-1');
      expect(json).toContain('Test');
    });

    it('should deserialize metadata from JSON', () => {
      const original = generator.generateMetadata(
        'skill-1',
        'Test',
        'Description'
      );

      const json = generator.serialize(original);
      const restored = generator.deserialize(json);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
    });

    it('should preserve date precision on round trip', () => {
      const original = generator.generateMetadata(
        'skill-1',
        'Test',
        'Description'
      );

      const json = generator.serialize(original);
      const restored = generator.deserialize(json);

      expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });

  describe('Metadata Merging', () => {
    it('should merge metadata', () => {
      const base = generator.generateMetadata(
        'skill-1',
        'Original',
        'Original description'
      );

      const merged = generator.mergeMetadata(base, {
        name: 'Updated',
        version: '2.0.0'
      });

      expect(merged.id).toBe('skill-1');
      expect(merged.name).toBe('Updated');
      expect(merged.version).toBe('2.0.0');
      expect(merged.description).toBe('Original description');
    });

    it('should update timestamp on merge', () => {
      const base = generator.generateMetadata(
        'skill-1',
        'Test',
        'Description'
      );

      const originalTime = base.updatedAt.getTime();
      const merged = generator.mergeMetadata(base, { name: 'Updated' });

      expect(merged.updatedAt.getTime()).toBeGreaterThanOrEqual(originalTime);
    });
  });
});
