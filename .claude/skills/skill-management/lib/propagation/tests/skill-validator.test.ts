/**
 * Tests for Skill Validator
 */

import { SkillValidator } from '../src/skill-validator';
import { MockFileSystemAdapter } from '../src/file-system-adapter';
import { MockDatabaseAdapter } from '../src/database-adapter';

describe('SkillValidator', () => {
  let validator: SkillValidator;
  let fs: MockFileSystemAdapter;
  let db: MockDatabaseAdapter;

  beforeEach(() => {
    fs = new MockFileSystemAdapter();
    db = new MockDatabaseAdapter();
    validator = new SkillValidator(fs, db);
  });

  afterEach(() => {
    fs.clear();
    db.clear();
  });

  describe('validateParameters', () => {
    it('should validate complete options', async () => {
      fs.setFile('/path/to/skill.md', '---\nname: test\n---');
      fs.setFile('./.claude/skills-database/skills.db', 'db');

      const options = {
        skillName: 'test-skill',
        newVersion: '1.0.0',
        updatePath: '/path/to/skill.md',
        changeType: 'patch' as const,
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on missing skillName', async () => {
      const options = {
        skillName: '',
        newVersion: '1.0.0',
        updatePath: '/path/to/skill.md',
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('skillName'))).toBe(true);
    });

    it('should error on missing newVersion', async () => {
      const options = {
        skillName: 'test-skill',
        newVersion: '',
        updatePath: '/path/to/skill.md',
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('newVersion'))).toBe(true);
    });

    it('should error on missing updatePath', async () => {
      const options = {
        skillName: 'test-skill',
        newVersion: '1.0.0',
        updatePath: '',
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('updatePath'))).toBe(true);
    });

    it('should error on invalid skill name', async () => {
      fs.setFile('/path/to/skill.md', 'content');
      fs.setFile('./.claude/skills-database/skills.db', 'db');

      const options = {
        skillName: 'skill@invalid!',
        newVersion: '1.0.0',
        updatePath: '/path/to/skill.md',
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid skill name'))).toBe(true);
    });

    it('should error on invalid version format', async () => {
      fs.setFile('/path/to/skill.md', 'content');
      fs.setFile('./.claude/skills-database/skills.db', 'db');

      const options = {
        skillName: 'test-skill',
        newVersion: '1.0',
        updatePath: '/path/to/skill.md',
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid version format'))).toBe(true);
    });

    it('should error on non-existent update file', async () => {
      fs.setFile('./.claude/skills-database/skills.db', 'db');

      const options = {
        skillName: 'test-skill',
        newVersion: '1.0.0',
        updatePath: '/missing/file.md',
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Update file not found'))).toBe(true);
    });

    it('should error on invalid change type', async () => {
      fs.setFile('/path/to/skill.md', 'content');
      fs.setFile('./.claude/skills-database/skills.db', 'db');

      const options = {
        skillName: 'test-skill',
        newVersion: '1.0.0',
        updatePath: '/path/to/skill.md',
        changeType: 'invalid' as any,
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await validator.validateParameters(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid changeType'))).toBe(true);
    });
  });

  describe('validateVersionIncrement', () => {
    it('should validate patch increment', async () => {
      const result = await validator.validateVersionIncrement('1.0.0', '1.0.1', 'patch');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate minor increment', async () => {
      const result = await validator.validateVersionIncrement('1.0.0', '1.1.0', 'minor');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate major increment', async () => {
      const result = await validator.validateVersionIncrement('1.0.0', '2.0.0', 'major');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on same version', async () => {
      const result = await validator.validateVersionIncrement('1.0.0', '1.0.0', 'patch');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Version unchanged'))).toBe(true);
    });

    it('should error on downgrade', async () => {
      const result = await validator.validateVersionIncrement('2.0.0', '1.0.0', 'major');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('downgrade'))).toBe(true);
    });

    it('should error on type mismatch', async () => {
      const result = await validator.validateVersionIncrement('1.0.0', '1.1.0', 'patch');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('mismatch'))).toBe(true);
    });
  });

  describe('validateContentHashChanged', () => {
    it('should accept different hashes', () => {
      const result = validator.validateContentHashChanged(
        'hash1',
        'hash2'
      );
      expect(result.valid).toBe(true);
    });

    it('should error on same hash', () => {
      const result = validator.validateContentHashChanged(
        'samehash',
        'samehash'
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Content hash unchanged'))).toBe(true);
    });
  });
});
