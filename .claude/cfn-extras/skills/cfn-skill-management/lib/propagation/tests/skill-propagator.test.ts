/**
 * Integration tests for Skill Propagator
 */

import { SkillPropagator } from '../src/skill-propagator';
import { MockFileSystemAdapter } from '../src/file-system-adapter';
import { MockDatabaseAdapter } from '../src/database-adapter';
import { NoOpLogger } from '../src/logger';
import type { SkillPropagationOptions } from '../src/types';

describe('SkillPropagator', () => {
  let propagator: SkillPropagator;
  let fs: MockFileSystemAdapter;
  let db: MockDatabaseAdapter;

  beforeEach(() => {
    fs = new MockFileSystemAdapter();
    db = new MockDatabaseAdapter();
    const logger = new NoOpLogger();
    propagator = new SkillPropagator(fs, db, logger);
  });

  afterEach(() => {
    fs.clear();
    db.clear();
  });

  describe('propagate', () => {
    it('should propagate skill update successfully', async () => {
      // Setup mock data
      const skillContent = `---
name: test-skill
version: 2.0.0
description: Updated skill
tags: [tag1, tag2]
category: utilities
owner: team
approval_level: high
---
Skill content`;

      fs.setFile('/path/to/skill-v2.0.0.md', skillContent);
      fs.setFile('./.claude/skills-database/skills.db', 'db');
      fs.setHash('/path/to/skill-v2.0.0.md', 'newhash123');

      // Mock database responses
      db.setTableData('skills', [{
        id: 1,
        name: 'test-skill',
        version: '1.0.0',
        content_hash: 'oldhash456',
        content_path: '/path/to/skill-v1.0.0.md',
        tags: '["old"]',
        category: 'old-cat',
        owner: 'old-owner',
        approval_level: 'low',
      }]);

      const options: SkillPropagationOptions = {
        skillName: 'test-skill',
        newVersion: '2.0.0',
        updatePath: '/path/to/skill-v2.0.0.md',
        changeType: 'major',
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await propagator.propagate(options);

      expect(result.success).toBe(true);
      expect(result.skillName).toBe('test-skill');
      expect(result.newVersion).toBe('2.0.0');
      expect(result.oldVersion).toBe('1.0.0');
      expect(result.changeType).toBe('major');
      expect(result.contentHash).toBe('newhash123');
    });

    it('should throw on validation failure', async () => {
      fs.setFile('./.claude/skills-database/skills.db', 'db');

      const options: SkillPropagationOptions = {
        skillName: 'test-skill',
        newVersion: '1.0', // Invalid version
        updatePath: '/path/to/skill.md',
        databasePath: './.claude/skills-database/skills.db',
      };

      await expect(propagator.propagate(options)).rejects.toThrow();
    });

    it('should throw on missing skill in database', async () => {
      fs.setFile('/path/to/skill.md', 'content');
      fs.setFile('./.claude/skills-database/skills.db', 'db');
      db.setTableData('skills', []); // Empty database

      const options: SkillPropagationOptions = {
        skillName: 'missing-skill',
        newVersion: '1.0.0',
        updatePath: '/path/to/skill.md',
        databasePath: './.claude/skills-database/skills.db',
      };

      await expect(propagator.propagate(options)).rejects.toThrow('Skill not found');
    });

    it('should throw on version increment mismatch', async () => {
      const skillContent = `---
name: test-skill
version: 1.1.0
description: Updated skill
---
Content`;

      fs.setFile('/path/to/skill.md', skillContent);
      fs.setFile('./.claude/skills-database/skills.db', 'db');
      fs.setHash('/path/to/skill.md', 'newhash');

      db.setTableData('skills', [{
        id: 1,
        name: 'test-skill',
        version: '1.0.0',
        content_hash: 'oldhash',
        content_path: '/path/to/old.md',
      }]);

      const options: SkillPropagationOptions = {
        skillName: 'test-skill',
        newVersion: '1.1.0',
        updatePath: '/path/to/skill.md',
        changeType: 'patch', // Mismatch: actual is minor
        databasePath: './.claude/skills-database/skills.db',
      };

      await expect(propagator.propagate(options)).rejects.toThrow();
    });

    it('should throw on unchanged content hash', async () => {
      const skillContent = `---
name: test-skill
version: 1.0.1
description: Updated skill
---
Content`;

      const hash = 'samehash123';

      fs.setFile('/path/to/skill.md', skillContent);
      fs.setFile('./.claude/skills-database/skills.db', 'db');
      fs.setHash('/path/to/skill.md', hash);

      db.setTableData('skills', [{
        id: 1,
        name: 'test-skill',
        version: '1.0.0',
        content_hash: hash, // Same hash
        content_path: '/path/to/old.md',
      }]);

      const options: SkillPropagationOptions = {
        skillName: 'test-skill',
        newVersion: '1.0.1',
        updatePath: '/path/to/skill.md',
        changeType: 'patch',
        databasePath: './.claude/skills-database/skills.db',
      };

      await expect(propagator.propagate(options)).rejects.toThrow('Content hash unchanged');
    });

    it('should support agent notifications', async () => {
      const skillContent = `---
name: test-skill
version: 2.0.0
description: Updated skill
---
Content`;

      fs.setFile('/path/to/skill.md', skillContent);
      fs.setFile('./.claude/skills-database/skills.db', 'db');
      fs.setHash('/path/to/skill.md', 'newhash');

      db.setTableData('skills', [{
        id: 1,
        name: 'test-skill',
        version: '1.0.0',
        content_hash: 'oldhash',
        content_path: '/path/to/old.md',
      }]);

      db.setTableData('agent_skill_mappings', [
        { skill_id: 1, agent_type: 'backend-developer' },
        { skill_id: 1, agent_type: 'frontend-developer' },
      ]);

      const options: SkillPropagationOptions = {
        skillName: 'test-skill',
        newVersion: '2.0.0',
        updatePath: '/path/to/skill.md',
        changeType: 'major',
        notifyAgents: true,
        databasePath: './.claude/skills-database/skills.db',
      };

      const result = await propagator.propagate(options);

      expect(result.success).toBe(true);
      expect(result.affectedAgents).toBeDefined();
    });
  });
});
