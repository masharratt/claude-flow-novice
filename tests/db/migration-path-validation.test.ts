/**
 * Migration Path Validation Tests
 *
 * Regression test suite to prevent future path resolution issues.
 * Validates that migration files are properly located in the up/ and down/
 * subdirectories and that test files reference the correct paths.
 *
 * Coverage:
 * - Migration file existence in up/ directory
 * - Migration file existence in down/ directory
 * - Path resolution logic consistency
 * - Test file migration path references
 * - Migration numbering and naming conventions
 *
 * Related Bug: Migration path fixes (2025-11-17)
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.join(__dirname, '../..');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'src/db/migrations');
const UP_DIR = path.join(MIGRATIONS_DIR, 'up');
const DOWN_DIR = path.join(MIGRATIONS_DIR, 'down');

describe('Migration Path Validation', () => {
  describe('Directory Structure', () => {
    it('should have migrations directory', () => {
      expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
      expect(fs.statSync(MIGRATIONS_DIR).isDirectory()).toBe(true);
    });

    it('should have up/ subdirectory', () => {
      expect(fs.existsSync(UP_DIR)).toBe(true);
      expect(fs.statSync(UP_DIR).isDirectory()).toBe(true);
    });

    it('should have down/ subdirectory', () => {
      expect(fs.existsSync(DOWN_DIR)).toBe(true);
      expect(fs.statSync(DOWN_DIR).isDirectory()).toBe(true);
    });

    it('should not have migration files in root migrations directory', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR);
      const sqlFiles = files.filter(f => f.endsWith('.sql') && fs.statSync(path.join(MIGRATIONS_DIR, f)).isFile());

      expect(sqlFiles).toEqual([]);
    });
  });

  describe('Migration Files Existence', () => {
    it('should have all expected migration files in up/ directory', () => {
      const expectedMigrations = [
        '001-add-deployment-audit.sql',
        '002-add-edge-cases.sql',
        '002-cache-invalidation-tracking.sql',
        '003-unify-metrics-schema.sql',
        '004-backup-metadata-schema.sql',
        '005-reflection-schema.sql',
        '006-skill-patches-schema.sql',
        '007-skill-metadata-schema.sql',
        '007-workspace-tracking-schema.sql',
        '008-promotion-audit-schema.sql',
        '009-edge-case-feedback-loop.sql',
      ];

      for (const migration of expectedMigrations) {
        const migrationPath = path.join(UP_DIR, migration);
        expect(fs.existsSync(migrationPath)).toBe(true);
        expect(fs.statSync(migrationPath).isFile()).toBe(true);
      }
    });

    it('should have matching down migrations for each up migration', () => {
      const upFiles = fs.readdirSync(UP_DIR).filter(f => f.endsWith('.sql'));
      const downFiles = fs.readdirSync(DOWN_DIR).filter(f => f.endsWith('.sql'));

      expect(upFiles.length).toBeGreaterThan(0);
      expect(downFiles.length).toBe(upFiles.length);

      for (const upFile of upFiles) {
        expect(downFiles).toContain(upFile);
      }
    });

    it('should have valid SQL files (not empty)', () => {
      const upFiles = fs.readdirSync(UP_DIR).filter(f => f.endsWith('.sql'));

      for (const file of upFiles) {
        const filePath = path.join(UP_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content.length).toBeGreaterThan(0);
        expect(content).toContain('CREATE TABLE');
      }
    });
  });

  describe('Migration Naming Conventions', () => {
    it('should follow NNN-description.sql naming pattern', () => {
      const upFiles = fs.readdirSync(UP_DIR).filter(f => f.endsWith('.sql'));
      const pattern = /^\d{3}-[a-z-]+\.sql$/;

      for (const file of upFiles) {
        expect(file).toMatch(pattern);
      }
    });

    it('should have sequential or logical numbering', () => {
      const upFiles = fs.readdirSync(UP_DIR).filter(f => f.endsWith('.sql'));
      const numbers = upFiles.map(f => parseInt(f.split('-')[0]));

      expect(numbers).toContain(1);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(20); // Reasonable upper bound
    });
  });

  describe('Path Resolution Logic', () => {
    it('should resolve paths correctly from test files', () => {
      // Simulate path resolution from tests/ directory
      const testDir = path.join(PROJECT_ROOT, 'tests');
      const resolvedPath = path.join(testDir, '../src/db/migrations/up/001-add-deployment-audit.sql');
      const normalizedPath = path.normalize(resolvedPath);

      expect(fs.existsSync(normalizedPath)).toBe(true);
    });

    it('should resolve paths correctly from src/ directory', () => {
      // Simulate path resolution from src/ directory
      const srcDir = path.join(PROJECT_ROOT, 'src');
      const resolvedPath = path.join(srcDir, 'db/migrations/up/001-add-deployment-audit.sql');
      const normalizedPath = path.normalize(resolvedPath);

      expect(fs.existsSync(normalizedPath)).toBe(true);
    });

    it('should handle process.cwd() based resolution', () => {
      const resolvedPath = path.join(process.cwd(), 'src/db/migrations/up/001-add-deployment-audit.sql');
      expect(fs.existsSync(resolvedPath)).toBe(true);
    });
  });

  describe('Test File Migration References', () => {
    it('should have correct migration paths in skill-loader-memory.test.ts', () => {
      const testFile = path.join(PROJECT_ROOT, 'tests/skill-loader-memory.test.ts');
      const content = fs.readFileSync(testFile, 'utf-8');

      expect(content).toContain('src/db/migrations/up/007-skill-metadata-schema.sql');
      expect(content).not.toContain("'src/db/migrations/007-skill-metadata-schema.sql'");
    });

    it('should have correct migration paths in skill-deployment.test.ts', () => {
      const testFile = path.join(PROJECT_ROOT, 'tests/skill-deployment.test.ts');
      const content = fs.readFileSync(testFile, 'utf-8');

      expect(content).toContain('src/db/migrations/up/001-add-deployment-audit.sql');
      expect(content).not.toContain("'src/db/migrations/001-add-deployment-audit.sql'");
    });

    it('should have correct migration paths in metrics-logger.test.ts', () => {
      const testFile = path.join(PROJECT_ROOT, 'tests/metrics-logger.test.ts');
      const content = fs.readFileSync(testFile, 'utf-8');

      expect(content).toContain('src/db/migrations/up/003-unify-metrics-schema.sql');
      expect(content).not.toContain("'src/db/migrations/003-unify-metrics-schema.sql'");
    });

    it('should not have old migration paths in test files', () => {
      const testFiles = [
        'tests/skill-loader-memory.test.ts',
        'tests/skill-deployment.test.ts',
        'tests/metrics-logger.test.ts',
      ];

      for (const testFile of testFiles) {
        const filePath = path.join(PROJECT_ROOT, testFile);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for old pattern: src/db/migrations/NNN-*.sql (without up/ or down/)
          const oldPattern = /src\/db\/migrations\/\d{3}-[a-z-]+\.sql/g;
          const matches = content.match(oldPattern) || [];

          // Filter out valid paths that include up/ or down/
          const invalidMatches = matches.filter(match => !match.includes('/up/') && !match.includes('/down/'));

          expect(invalidMatches).toEqual([]);
        }
      }
    });
  });

  describe('Migration Consistency', () => {
    it('should have consistent SQL syntax across migrations', () => {
      const upFiles = fs.readdirSync(UP_DIR).filter(f => f.endsWith('.sql'));

      for (const file of upFiles) {
        const filePath = path.join(UP_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for CREATE TABLE IF NOT EXISTS pattern
        expect(content).toMatch(/CREATE TABLE IF NOT EXISTS/i);
      }
    });

    it('should have proper rollback migrations', () => {
      const downFiles = fs.readdirSync(DOWN_DIR).filter(f => f.endsWith('.sql'));

      for (const file of downFiles) {
        const filePath = path.join(DOWN_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for DROP (TABLE|VIEW|INDEX) IF EXISTS pattern
        expect(content).toMatch(/DROP (TABLE|VIEW|INDEX) IF EXISTS/i);
      }
    });
  });

  describe('Documentation References', () => {
    it('should verify verification script uses correct path', () => {
      const verifyScript = path.join(PROJECT_ROOT, 'tests/verify-skill-deployment.sh');

      if (fs.existsSync(verifyScript)) {
        const content = fs.readFileSync(verifyScript, 'utf-8');
        expect(content).toContain('src/db/migrations/up/001-add-deployment-audit.sql');
      }
    });
  });
});

/**
 * Future Proofing Tests
 */
describe('Migration Path Regression Prevention', () => {
  it('should fail if new migrations are added to wrong directory', () => {
    const rootFiles = fs.readdirSync(MIGRATIONS_DIR);
    const sqlFiles = rootFiles.filter(f =>
      f.endsWith('.sql') &&
      f !== 'README.md' &&
      fs.statSync(path.join(MIGRATIONS_DIR, f)).isFile()
    );

    expect(sqlFiles).toEqual([]);
  });

  it('should ensure all TypeScript files use correct import paths', () => {
    const srcFiles = [
      'src/lib/backup-manager.ts',
      // Add other TypeScript files that reference migrations
    ];

    for (const file of srcFiles) {
      const filePath = path.join(PROJECT_ROOT, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for any migration references
        if (content.includes('migrations/')) {
          // Ensure they use up/ or down/ subdirectories
          const migrationRefs = content.match(/migrations\/[^/]+\.sql/g) || [];
          expect(migrationRefs).toEqual([]);
        }
      }
    }
  });

  it('should maintain consistent path resolution across environments', () => {
    const testPaths = [
      path.join(PROJECT_ROOT, 'src/db/migrations/up/001-add-deployment-audit.sql'),
      path.join(process.cwd(), 'src/db/migrations/up/001-add-deployment-audit.sql'),
      path.resolve('./src/db/migrations/up/001-add-deployment-audit.sql'),
    ];

    for (const testPath of testPaths) {
      expect(fs.existsSync(testPath)).toBe(true);
    }
  });
});
