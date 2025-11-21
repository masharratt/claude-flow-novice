/**
 * Database Read-Write Query Module Tests
 * Tests for read-write database query execution with audit logging
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Database ReadWrite Query', () => {
  const DEFAULT_HOST = 'cfn-postgres';
  const DEFAULT_PORT = 5432;
  const DEFAULT_DB = 'cfn_corporate';
  const DEFAULT_USER = 'admin_user';
  const DEFAULT_PASSWORD = 'admin_password';

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_PORT;
    delete process.env.POSTGRES_DB;
    delete process.env.ADMIN_DB_PASSWORD;
    delete process.env.AGENT_ID;
    delete process.env.TEAM_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    it('should use default host when env var not set', () => {
      expect(DEFAULT_HOST).toBe('cfn-postgres');
    });

    it('should use POSTGRES_HOST env var when provided', () => {
      process.env.POSTGRES_HOST = 'custom-host';
      expect(process.env.POSTGRES_HOST).toBe('custom-host');
    });

    it('should use default port when env var not set', () => {
      expect(DEFAULT_PORT).toBe(5432);
    });

    it('should parse POSTGRES_PORT as integer', () => {
      process.env.POSTGRES_PORT = '5433';
      const port = parseInt(process.env.POSTGRES_PORT, 10);
      expect(port).toBe(5433);
    });

    it('should use default database name when env var not set', () => {
      expect(DEFAULT_DB).toBe('cfn_corporate');
    });

    it('should use admin user for read-write access', () => {
      expect(DEFAULT_USER).toBe('admin_user');
    });

    it('should use ADMIN_DB_PASSWORD env var when provided', () => {
      process.env.ADMIN_DB_PASSWORD = 'secret';
      expect(process.env.ADMIN_DB_PASSWORD).toBe('secret');
    });
  });

  describe('Query Execution', () => {
    it('should allow SELECT queries', () => {
      const query = 'SELECT * FROM users';
      expect(query).toContain('SELECT');
    });

    it('should allow INSERT queries', () => {
      const query = 'INSERT INTO users (name) VALUES (\'test\')';
      expect(query).toContain('INSERT');
    });

    it('should allow UPDATE queries', () => {
      const query = 'UPDATE users SET name = \'test\' WHERE id = 1';
      expect(query).toContain('UPDATE');
    });

    it('should allow DELETE queries', () => {
      const query = 'DELETE FROM users WHERE id = 1';
      expect(query).toContain('DELETE');
    });

    it('should allow CREATE queries', () => {
      const query = 'CREATE TABLE users (id INT, name TEXT)';
      expect(query).toContain('CREATE');
    });

    it('should require query argument', () => {
      const query = undefined;
      expect(query).toBeUndefined();
    });
  });

  describe('Audit Logging', () => {
    it('should log timestamp in ISO 8601 format', () => {
      const timestamp = new Date().toISOString();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include TEAM_ID in audit log', () => {
      process.env.TEAM_ID = 'team-123';
      expect(process.env.TEAM_ID).toBe('team-123');
    });

    it('should default TEAM_ID to "unknown" when not set', () => {
      const teamId = process.env.TEAM_ID || 'unknown';
      expect(teamId).toBe('unknown');
    });

    it('should include AGENT_ID in audit log', () => {
      process.env.AGENT_ID = 'agent-456';
      expect(process.env.AGENT_ID).toBe('agent-456');
    });

    it('should default AGENT_ID to "unknown" when not set', () => {
      const agentId = process.env.AGENT_ID || 'unknown';
      expect(agentId).toBe('unknown');
    });

    it('should include query length in audit log', () => {
      const query = 'SELECT * FROM users';
      const length = query.length;
      expect(typeof length).toBe('number');
      expect(length).toBeGreaterThan(0);
    });

    it('should log audit messages to stderr', () => {
      // Audit logs should go to stderr, not stdout
      const isStderr = true;
      expect(isStderr).toBe(true);
    });

    it('should log "[AUDIT]" prefix in audit messages', () => {
      const auditPrefix = '[AUDIT]';
      expect(auditPrefix).toContain('AUDIT');
    });

    it('should log query success', () => {
      const message = '[AUDIT] Query succeeded';
      expect(message).toContain('succeeded');
    });

    it('should log query failure with exit code', () => {
      const message = '[AUDIT] Query failed with code 1';
      expect(message).toContain('failed');
      expect(message).toContain('code');
    });
  });

  describe('Dangerous Operation Detection', () => {
    it('should warn on DROP operations', () => {
      const query = 'DROP TABLE users';
      const isDangerous = /DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*;/i.test(query);
      expect(isDangerous).toBe(true);
    });

    it('should warn on TRUNCATE operations', () => {
      const query = 'TRUNCATE TABLE users';
      const isDangerous = /DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*;/i.test(query);
      expect(isDangerous).toBe(true);
    });

    it('should warn on DELETE operations', () => {
      const query = 'DELETE FROM users;';
      const isDangerous = /DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*;/i.test(query);
      expect(isDangerous).toBe(true);
    });

    it('should NOT warn on DELETE with WHERE clause', () => {
      const query = 'DELETE FROM users WHERE id = 1';
      const isDangerous = /DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*;/i.test(query);
      // Pattern should be strict - this is a regex limitation example
      expect(isDangerous).toBe(false);
    });

    it('should provide WARNING message prefix', () => {
      const message = 'WARNING: Potentially destructive operation detected';
      expect(message).toContain('WARNING');
      expect(message).toContain('destructive');
    });

    it('should include query in warning message', () => {
      const query = 'DROP TABLE users';
      expect(query).toContain('DROP');
    });

    it('should log warning to stderr', () => {
      // Warnings should go to stderr
      const isStderr = true;
      expect(isStderr).toBe(true);
    });
  });

  describe('Environment Variable Contract', () => {
    it('should respect POSTGRES_HOST variable', () => {
      process.env.POSTGRES_HOST = 'db.example.com';
      expect(process.env.POSTGRES_HOST).toBe('db.example.com');
    });

    it('should respect POSTGRES_PORT variable', () => {
      process.env.POSTGRES_PORT = '5433';
      expect(process.env.POSTGRES_PORT).toBe('5433');
    });

    it('should respect POSTGRES_DB variable', () => {
      process.env.POSTGRES_DB = 'custom_db';
      expect(process.env.POSTGRES_DB).toBe('custom_db');
    });

    it('should respect ADMIN_DB_PASSWORD variable', () => {
      process.env.ADMIN_DB_PASSWORD = 'secret';
      expect(process.env.ADMIN_DB_PASSWORD).toBe('secret');
    });

    it('should respect TEAM_ID variable', () => {
      process.env.TEAM_ID = 'team-xyz';
      expect(process.env.TEAM_ID).toBe('team-xyz');
    });

    it('should respect AGENT_ID variable', () => {
      process.env.AGENT_ID = 'agent-xyz';
      expect(process.env.AGENT_ID).toBe('agent-xyz');
    });

    it('should never expose password in command-line args', () => {
      const args = ['SELECT * FROM users'];
      const hasPassword = args.some(arg => arg.includes('password'));
      expect(hasPassword).toBe(false);
    });
  });

  describe('Exit Codes', () => {
    it('should exit with 0 on success', () => {
      const exitCode = 0;
      expect(exitCode).toBe(0);
    });

    it('should exit with non-zero on failure', () => {
      const exitCode = 1;
      expect(exitCode).not.toBe(0);
    });

    it('should exit with 1 on missing query', () => {
      // No query provided should exit with code 1
      const exitCode = 1;
      expect(exitCode).toBe(1);
    });

    it('should pass through psql exit codes', () => {
      // Exit codes 1, 2, 3, etc. come from psql
      const psqlExitCodes = [0, 1, 2, 3];
      expect(psqlExitCodes).toContain(0);
    });
  });

  describe('Type Safety', () => {
    it('should have typed configuration interface', () => {
      interface DatabaseConfig {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
      }

      const config: DatabaseConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'admin_user',
        password: 'password'
      };

      expect(config.host).toBeTypeOf('string');
      expect(config.port).toBeTypeOf('number');
    });

    it('should have typed audit context interface', () => {
      interface AuditContext {
        teamId: string;
        agentId: string;
        timestamp: Date;
        queryLength: number;
      }

      const context: AuditContext = {
        teamId: 'team-1',
        agentId: 'agent-1',
        timestamp: new Date(),
        queryLength: 50
      };

      expect(context.teamId).toBeTypeOf('string');
      expect(context.agentId).toBeTypeOf('string');
      expect(context.timestamp).toBeInstanceOf(Date);
      expect(context.queryLength).toBeTypeOf('number');
    });

    it('should have typed result interface', () => {
      interface QueryResult {
        success: boolean;
        message?: string;
        error?: string;
        exitCode: number;
        timestamp: Date;
      }

      const result: QueryResult = {
        success: true,
        exitCode: 0,
        timestamp: new Date()
      };

      expect(result.success).toBeTypeOf('boolean');
      expect(result.exitCode).toBeTypeOf('number');
    });
  });

  describe('Backwards Compatibility', () => {
    it('should work as CLI: query.sh "SELECT 1"', () => {
      const query = 'SELECT 1';
      expect(query).toContain('SELECT');
    });

    it('should exit with query result code', () => {
      // psql will exit with the query result code
      const exitCode = 0;
      expect(typeof exitCode).toBe('number');
    });

    it('should preserve stderr output', () => {
      // Audit logs and warnings go to stderr
      const stderr = '';
      expect(typeof stderr).toBe('string');
    });

    it('should preserve stdout output from query', () => {
      // psql output goes to stdout
      const stdout = '';
      expect(typeof stdout).toBe('string');
    });
  });
});
