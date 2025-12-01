/**
 * Query Type Detection Tests
 *
 * Tests for Issue #14: Query Type Detection (LOW)
 * Validates that raw() method correctly detects read-only query types
 * including CTEs (WITH), EXPLAIN, and PRAGMA statements.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SQLiteAdapter } from '../src/lib/database-service/sqlite-adapter';
import { DatabaseConfig } from '../src/lib/database-service/types';

describe('Query Type Detection', () => {
  let adapter: SQLiteAdapter;
  const config: DatabaseConfig = {
    type: 'sqlite',
    database: ':memory:',
  };

  beforeEach(async () => {
    adapter = new SQLiteAdapter(config);
    await adapter.connect();

    // Create test table
    await adapter.raw(
      'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)'
    );
    await adapter.raw(
      "INSERT INTO users (name, age) VALUES ('Alice', 30), ('Bob', 25), ('Charlie', 35)"
    );
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('Traditional SELECT queries', () => {
    it('should correctly identify simple SELECT as read-only', async () => {
      const result = await adapter.raw<any[]>('SELECT * FROM users');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('should handle SELECT with WHERE clause', async () => {
      const result = await adapter.raw<any[]>(
        'SELECT * FROM users WHERE age > 25'
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should handle SELECT with JOINs', async () => {
      // Create second table
      await adapter.raw(
        'CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, amount REAL)'
      );
      await adapter.raw(
        'INSERT INTO orders (user_id, amount) VALUES (1, 100.0), (2, 50.0)'
      );

      const result = await adapter.raw<any[]>(
        'SELECT users.name, orders.amount FROM users JOIN orders ON users.id = orders.user_id'
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  describe('CTE (WITH) queries', () => {
    it('should correctly identify WITH clause as read-only', async () => {
      const query = `
        WITH adults AS (
          SELECT * FROM users WHERE age >= 30
        )
        SELECT * FROM adults
      `;

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2); // Alice and Charlie
    });

    it('should handle multiple CTEs', async () => {
      const query = `
        WITH
          adults AS (SELECT * FROM users WHERE age >= 30),
          young AS (SELECT * FROM users WHERE age < 30)
        SELECT 'adults' as group, COUNT(*) as count FROM adults
        UNION ALL
        SELECT 'young' as group, COUNT(*) as count FROM young
      `;

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should handle recursive CTEs', async () => {
      const query = `
        WITH RECURSIVE cnt(x) AS (
          SELECT 1
          UNION ALL
          SELECT x+1 FROM cnt WHERE x < 5
        )
        SELECT x FROM cnt
      `;

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5);
    });
  });

  describe('EXPLAIN queries', () => {
    it('should correctly identify EXPLAIN as read-only', async () => {
      const result = await adapter.raw<any[]>('EXPLAIN SELECT * FROM users');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle EXPLAIN QUERY PLAN', async () => {
      const result = await adapter.raw<any[]>(
        'EXPLAIN QUERY PLAN SELECT * FROM users WHERE age > 25'
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('PRAGMA queries', () => {
    it('should correctly identify PRAGMA as read-only', async () => {
      const result = await adapter.raw<any[]>('PRAGMA table_info(users)');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // id, name, age columns
    });

    it('should handle PRAGMA foreign_keys', async () => {
      const result = await adapter.raw<any[]>('PRAGMA foreign_keys');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle PRAGMA database_list', async () => {
      const result = await adapter.raw<any[]>('PRAGMA database_list');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Comments handling', () => {
    it('should strip block comments before detecting query type', async () => {
      const query = `
        /* This is a comment
           that spans multiple lines */
        SELECT * FROM users
      `;

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('should handle comments with WITH queries', async () => {
      const query = `
        /* Get adult users */
        WITH adults AS (
          SELECT * FROM users WHERE age >= 30
        )
        SELECT * FROM adults
      `;

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should handle inline comments', async () => {
      const query = `
        -- This is a line comment
        SELECT * FROM users -- Get all users
      `;

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });
  });

  describe('Write queries (should return run result)', () => {
    it('should correctly identify INSERT as write operation', async () => {
      const result = await adapter.raw<any>(
        "INSERT INTO users (name, age) VALUES ('David', 40)"
      );

      expect(result).toHaveProperty('changes');
      expect(result.changes).toBe(1);
    });

    it('should correctly identify UPDATE as write operation', async () => {
      const result = await adapter.raw<any>(
        "UPDATE users SET age = 31 WHERE name = 'Alice'"
      );

      expect(result).toHaveProperty('changes');
      expect(result.changes).toBe(1);
    });

    it('should correctly identify DELETE as write operation', async () => {
      const result = await adapter.raw<any>(
        "DELETE FROM users WHERE name = 'Bob'"
      );

      expect(result).toHaveProperty('changes');
      expect(result.changes).toBe(1);
    });

    it('should correctly identify CREATE as write operation', async () => {
      const result = await adapter.raw<any>(
        'CREATE TABLE test (id INTEGER PRIMARY KEY)'
      );

      expect(result).toHaveProperty('changes');
    });

    it('should correctly identify DROP as write operation', async () => {
      await adapter.raw('CREATE TABLE temp (id INTEGER)');
      const result = await adapter.raw<any>('DROP TABLE temp');

      expect(result).toHaveProperty('changes');
    });
  });

  describe('Edge cases', () => {
    it('should handle queries with mixed case', async () => {
      const result = await adapter.raw<any[]>('SeLeCt * FrOm users');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('should handle queries with leading whitespace', async () => {
      const result = await adapter.raw<any[]>(
        '   \n\n  SELECT * FROM users'
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('should handle WITH queries with leading whitespace', async () => {
      const query = `


        WITH adults AS (SELECT * FROM users WHERE age >= 30)
        SELECT * FROM adults
      `;

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should handle empty comment blocks', async () => {
      const query = '/**/ SELECT * FROM users';

      const result = await adapter.raw<any[]>(query);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });
  });

  describe('Performance with complex queries', () => {
    it('should handle complex nested CTEs efficiently', async () => {
      const query = `
        WITH
          level1 AS (SELECT * FROM users WHERE age > 20),
          level2 AS (SELECT * FROM level1 WHERE age < 40),
          level3 AS (SELECT * FROM level2 WHERE age >= 25)
        SELECT COUNT(*) as count FROM level3
      `;

      const start = Date.now();
      const result = await adapter.raw<any[]>(query);
      const duration = Date.now() - start;

      expect(Array.isArray(result)).toBe(true);
      expect(duration).toBeLessThan(100); // Should be fast
    });
  });
});
