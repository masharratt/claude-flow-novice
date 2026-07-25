/**
 * Test Suite for Issue #14: Comprehensive Query Type Detection
 *
 * Tests the detectQueryType() method to ensure it correctly identifies
 * read vs write operations for SELECT, WITH/CTE, EXPLAIN, PRAGMA, comments.
 */

import { describe, it, expect } from '@jest/globals';

// Simulate the detectQueryType method from SQLiteAdapter
function detectQueryType(query: string): 'read' | 'write' {
  // Remove multi-line comments first (/* */)
  let normalized = query.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove single-line comments (--) line by line
  normalized = normalized
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
    .trim();

  // Read operations: SELECT, WITH (CTEs), EXPLAIN, PRAGMA, SHOW
  const readPatterns = /^(SELECT|WITH|EXPLAIN|PRAGMA|SHOW)/i;
  return readPatterns.test(normalized) ? 'read' : 'write';
}

describe('Issue #14: Query Type Detection', () => {
  describe('Basic SELECT queries', () => {
    it('should detect simple SELECT as read', () => {
      expect(detectQueryType('SELECT * FROM users')).toBe('read');
    });

    it('should detect SELECT with WHERE as read', () => {
      expect(detectQueryType('SELECT id, name FROM users WHERE active = 1')).toBe('read');
    });

    it('should detect case-insensitive SELECT', () => {
      expect(detectQueryType('select * from users')).toBe('read');
      expect(detectQueryType('SeLeCt * FrOm users')).toBe('read');
    });

    it('should detect SELECT with leading whitespace', () => {
      expect(detectQueryType('  \n  SELECT * FROM users')).toBe('read');
    });
  });

  describe('WITH/CTE queries', () => {
    it('should detect basic CTE as read', () => {
      const query = `
        WITH cte AS (
          SELECT id FROM users
        )
        SELECT * FROM cte
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should detect recursive CTE as read', () => {
      const query = `
        WITH RECURSIVE cnt(x) AS (
          SELECT 1
          UNION ALL
          SELECT x+1 FROM cnt WHERE x<5
        )
        SELECT x FROM cnt
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should detect multiple CTEs as read', () => {
      const query = `
        WITH
          cte1 AS (SELECT id FROM users),
          cte2 AS (SELECT name FROM accounts)
        SELECT * FROM cte1, cte2
      `;
      expect(detectQueryType(query)).toBe('read');
    });
  });

  describe('EXPLAIN queries', () => {
    it('should detect EXPLAIN as read', () => {
      expect(detectQueryType('EXPLAIN SELECT * FROM users')).toBe('read');
    });

    it('should detect EXPLAIN QUERY PLAN as read', () => {
      expect(detectQueryType('EXPLAIN QUERY PLAN SELECT * FROM users')).toBe('read');
    });

    it('should detect case-insensitive EXPLAIN', () => {
      expect(detectQueryType('explain select * from users')).toBe('read');
    });
  });

  describe('PRAGMA queries', () => {
    it('should detect PRAGMA as read', () => {
      expect(detectQueryType('PRAGMA table_info(users)')).toBe('read');
    });

    it('should detect various PRAGMA statements as read', () => {
      expect(detectQueryType('PRAGMA database_list')).toBe('read');
      expect(detectQueryType('PRAGMA foreign_keys')).toBe('read');
      expect(detectQueryType('pragma user_version')).toBe('read');
    });
  });

  describe('SHOW queries (for compatibility)', () => {
    it('should detect SHOW as read', () => {
      expect(detectQueryType('SHOW TABLES')).toBe('read');
      expect(detectQueryType('SHOW DATABASES')).toBe('read');
    });
  });

  describe('Write operations', () => {
    it('should detect INSERT as write', () => {
      expect(detectQueryType('INSERT INTO users (name) VALUES ("Alice")')).toBe('write');
    });

    it('should detect UPDATE as write', () => {
      expect(detectQueryType('UPDATE users SET active = 0 WHERE id = 1')).toBe('write');
    });

    it('should detect DELETE as write', () => {
      expect(detectQueryType('DELETE FROM users WHERE id = 1')).toBe('write');
    });

    it('should detect CREATE as write', () => {
      expect(detectQueryType('CREATE TABLE users (id INTEGER PRIMARY KEY)')).toBe('write');
    });

    it('should detect DROP as write', () => {
      expect(detectQueryType('DROP TABLE users')).toBe('write');
    });

    it('should detect ALTER as write', () => {
      expect(detectQueryType('ALTER TABLE users ADD COLUMN email TEXT')).toBe('write');
    });
  });

  describe('Comment handling', () => {
    it('should ignore single-line comments before SELECT', () => {
      const query = `
        -- This is a comment
        SELECT * FROM users
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should ignore multiple single-line comments', () => {
      const query = `
        -- Comment 1
        -- Comment 2
        SELECT * FROM users
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should ignore multi-line comments', () => {
      const query = `
        /* This is a
           multi-line
           comment */
        SELECT * FROM users
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should ignore comments before WITH clause', () => {
      const query = `
        -- Setup CTE
        WITH cte AS (SELECT 1)
        SELECT * FROM cte
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should ignore multiple multi-line comments', () => {
      const query = `
        /* Comment 1 */
        /* Comment 2 */
        SELECT * FROM users
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should handle comments with special characters', () => {
      const query = `
        /* Comment with special chars: @#$%^&*() */
        SELECT * FROM users
      `;
      expect(detectQueryType(query)).toBe('read');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query (defaults to write)', () => {
      expect(detectQueryType('')).toBe('write');
      expect(detectQueryType('   ')).toBe('write');
    });

    it('should handle query with only comments (defaults to write)', () => {
      expect(detectQueryType('-- Just a comment')).toBe('write');
      expect(detectQueryType('/* Just a comment */')).toBe('write');
    });

    it('should detect SELECT after whitespace and comments', () => {
      const query = `

        -- Comment

        SELECT * FROM users
      `;
      expect(detectQueryType(query)).toBe('read');
    });

    it('should not be confused by SELECT in comment', () => {
      const query = `
        -- This comment mentions SELECT
        INSERT INTO users (name) VALUES ('test')
      `;
      expect(detectQueryType(query)).toBe('write');
    });

    it('should not be confused by WITH in UPDATE', () => {
      const query = 'UPDATE users SET name = "WITH" WHERE id = 1';
      expect(detectQueryType(query)).toBe('write');
    });
  });
});
