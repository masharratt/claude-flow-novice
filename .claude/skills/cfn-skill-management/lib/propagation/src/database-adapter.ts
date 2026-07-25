/**
 * Database Adapter for SQLite operations
 * Supports parameterized queries to prevent SQL injection
 */

import { spawn } from 'child_process';
import type { DatabaseAdapter } from './types';

export class SQLiteDatabaseAdapter implements DatabaseAdapter {
  private databasePath: string;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  /**
   * Execute raw SQL query and return results
   */
  async query(sql: string, params?: any[]): Promise<any> {
    const results = await this.selectAll(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Select single row
   */
  async selectOne(sql: string, params?: any[]): Promise<any> {
    const results = await this.selectAll(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Select all rows
   */
  async selectAll(sql: string, params?: any[]): Promise<any[]> {
    const output = await this.executeSqlite3(sql, params);
    if (!output.trim()) {
      return [];
    }

    // Parse pipe-delimited output
    const lines = output.trim().split('\n');
    return lines.map(line => this.parsePipeDelimitedRow(line));
  }

  /**
   * Execute SQL statement (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params?: any[]): Promise<void> {
    await this.executeSqlite3(sql, params);
  }

  /**
   * Get affected agents using a skill
   */
  async getAffectedAgents(skillId: number): Promise<string[]> {
    const results = await this.selectAll(
      'SELECT DISTINCT agent_type FROM agent_skill_mappings WHERE skill_id = ?1',
      [skillId]
    );

    return results.map(row => row.agent_type).filter(Boolean);
  }

  /**
   * Close database connection (no-op for SQLite)
   */
  async close(): Promise<void> {
    // SQLite doesn't require explicit connection closing
  }

  /**
   * Execute sqlite3 command with parameter binding
   */
  private async executeSqlite3(sql: string, params?: any[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const sqlite3Args = [
        '-header',
        '-separator',
        '|',
        this.databasePath,
      ];

      const sqlWithParams = this.bindParameters(sql, params);

      const process = spawn('sqlite3', sqlite3Args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`SQLite error: ${stderr || 'unknown error'}`));
        }
      });

      process.stdin?.write(sqlWithParams);
      process.stdin?.end();
    });
  }

  /**
   * Bind parameters to SQL query
   * Simple implementation - in production would use proper binding
   */
  private bindParameters(sql: string, params?: any[]): string {
    if (!params || params.length === 0) {
      return sql;
    }

    let result = sql;
    params.forEach((param, index) => {
      const placeholder = `?${index + 1}`;
      const value = this.escapeValue(param);
      result = result.replace(placeholder, value);
    });

    return result;
  }

  /**
   * Escape value for SQL safety
   */
  private escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    if (typeof value === 'string') {
      // Escape single quotes by doubling them
      return `'${value.replace(/'/g, "''")}'`;
    }

    throw new Error(`Unsupported parameter type: ${typeof value}`);
  }

  /**
   * Parse pipe-delimited row into object
   */
  private parsePipeDelimitedRow(line: string): Record<string, any> {
    // For simplicity, return as array of values
    // In production, would need column names from query
    const values = line.split('|');
    return {
      value: values.length === 1 ? values[0] : values,
    };
  }
}

/**
 * Mock database adapter for testing
 */
export class MockDatabaseAdapter implements DatabaseAdapter {
  private data: Map<string, any[]> = new Map();

  setTableData(table: string, rows: any[]): void {
    this.data.set(table, rows);
  }

  async query(sql: string, params?: any[]): Promise<any> {
    const results = await this.selectAll(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async selectOne(sql: string, params?: any[]): Promise<any> {
    const results = await this.selectAll(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async selectAll(sql: string, params?: any[]): Promise<any[]> {
    // Mock implementation - parse SQL to determine which table to query
    if (sql.includes('FROM skills')) {
      const skills = this.data.get('skills') || [];

      // Handle WHERE name = ?1
      if (params && params.length > 0 && sql.includes('WHERE name =')) {
        return skills.filter(s => s.name === params[0]);
      }

      // Handle COUNT(*)
      if (sql.includes('COUNT(*)')) {
        return [{ count: skills.length, value: skills.length }];
      }

      return skills;
    }

    // Default: return empty array or result table
    return this.data.get('result') || [];
  }

  async execute(sql: string, params?: any[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void sql;
    void params;
    // Mock implementation
  }

  async getAffectedAgents(skillId: number): Promise<string[]> {
    const mappings = this.data.get('agent_skill_mappings') || [];
    const agents = new Set<string>();

    for (const mapping of mappings) {
      if (mapping.skill_id === skillId) {
        agents.add(mapping.agent_type);
      }
    }

    return Array.from(agents);
  }

  async close(): Promise<void> {
    this.data.clear();
  }

  clear(): void {
    this.data.clear();
  }
}
