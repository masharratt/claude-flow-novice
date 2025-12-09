/**
 * CFN Database Service
 * Provides database operations for skill management
 */

import { Database } from 'sqlite3';
import { open } from 'sqlite';
import type { Logger } from '../propagation/src/types.js';

export interface SkillRecord {
  id: number;
  name: string;
  version: string;
  namespace?: string;
  description: string;
  status: 'active' | 'deprecated' | 'experimental';
  tags: string;
  agent_types?: string;
  phases?: string;
  priority?: number;
  dependencies?: string;
  content_hash?: string;
  file_path: string;
  file_size: number;
  last_modified: string;
  created_at: string;
  updated_at: string;
}

export interface SkillFilter {
  agentType?: string;
  phase?: string;
  tags?: string[];
  status?: string;
  namespace?: string;
}

export class DatabaseService {
  private db: any = null;
  private initialized = false;

  constructor(
    private dbPath: string,
    private logger: Logger
  ) {}

  /**
   * Initialize database connection and create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.db = await open({
        filename: this.dbPath,
        driver: Database
      });

      await this.createTables();
      this.initialized = true;
      this.logger.info(`Database initialized: ${this.dbPath}`);
    } catch (error) {
      this.logger.error('Failed to initialize database', error as Error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
      this.logger.info('Database connection closed');
    }
  }

  /**
   * Get all skills suitable for a specific agent type
   */
  async getSkillsForAgent(agentType: string, filters?: SkillFilter): Promise<SkillRecord[]> {
    await this.ensureInitialized();

    try {
      let query = `
        SELECT * FROM skills
        WHERE status = 'active'
        AND (agent_types IS NULL OR agent_types LIKE '%' || ? || '%')
      `;
      const params: any[] = [agentType];

      if (filters?.phase) {
        query += ` AND (phases IS NULL OR phases LIKE '%' || ? || '%')`;
        params.push(filters.phase);
      }

      if (filters?.tags && filters.tags.length > 0) {
        const tagConditions = filters.tags.map(() => `tags LIKE '%' || ? || '%'`).join(' OR ');
        query += ` AND (${tagConditions})`;
        params.push(...filters.tags);
      }

      if (filters?.namespace) {
        query += ` AND namespace = ?`;
        params.push(filters.namespace);
      }

      query += ` ORDER BY priority DESC, name ASC`;

      const skills = await this.db.all(query, params);
      return skills.map(this.mapRowToSkill);
    } catch (error) {
      this.logger.error(`Failed to get skills for agent: ${agentType}`, error as Error);
      return [];
    }
  }

  /**
   * Get a specific skill by name
   */
  async getSkillByName(name: string): Promise<SkillRecord | null> {
    await this.ensureInitialized();

    try {
      const row = await this.db.get(
        'SELECT * FROM skills WHERE name = ? ORDER BY version DESC LIMIT 1',
        [name]
      );

      return row ? this.mapRowToSkill(row) : null;
    } catch (error) {
      this.logger.error(`Failed to get skill by name: ${name}`, error as Error);
      return null;
    }
  }

  /**
   * Update or insert a skill record
   */
  async upsertSkill(skill: Partial<SkillRecord>): Promise<void> {
    await this.ensureInitialized();

    try {
      const existing = await this.db.get(
        'SELECT id FROM skills WHERE name = ? AND version = ?',
        [skill.name, skill.version]
      );

      if (existing) {
        await this.db.run(`
          UPDATE skills SET
            description = ?, status = ?, tags = ?, agent_types = ?, phases = ?,
            priority = ?, dependencies = ?, content_hash = ?, file_path = ?,
            file_size = ?, last_modified = ?, updated_at = datetime('now')
          WHERE name = ? AND version = ?
        `, [
          skill.description, skill.status, skill.tags, skill.agent_types, skill.phases,
          skill.priority, skill.dependencies, skill.content_hash, skill.file_path,
          skill.file_size, skill.last_modified, skill.name, skill.version
        ]);
      } else {
        await this.db.run(`
          INSERT INTO skills (
            name, version, namespace, description, status, tags, agent_types, phases,
            priority, dependencies, content_hash, file_path, file_size, last_modified,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          skill.name, skill.version, skill.namespace, skill.description, skill.status,
          skill.tags, skill.agent_types, skill.phases, skill.priority, skill.dependencies,
          skill.content_hash, skill.file_path, skill.file_size, skill.last_modified
        ]);
      }

      this.logger.debug(`Skill upserted: ${skill.name} v${skill.version}`);
    } catch (error) {
      this.logger.error(`Failed to upsert skill: ${skill.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Delete a skill by name and version
   */
  async deleteSkill(name: string, version?: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      let query = 'DELETE FROM skills WHERE name = ?';
      const params: any[] = [name];

      if (version) {
        query += ' AND version = ?';
        params.push(version);
      }

      const result = await this.db.run(query, params);
      const deleted = result.changes > 0;

      if (deleted) {
        this.logger.debug(`Skill deleted: ${name}${version ? ` v${version}` : ''}`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(`Failed to delete skill: ${name}`, error as Error);
      return false;
    }
  }

  /**
   * Get skill statistics
   */
  async getStatistics(): Promise<{
    totalSkills: number;
    activeSkills: number;
    deprecatedSkills: number;
    experimentalSkills: number;
    namespaces: string[];
  }> {
    await this.ensureInitialized();

    try {
      const [total, active, deprecated, experimental, namespaces] = await Promise.all([
        this.db.get('SELECT COUNT(*) as count FROM skills'),
        this.db.get('SELECT COUNT(*) as count FROM skills WHERE status = ?', ['active']),
        this.db.get('SELECT COUNT(*) as count FROM skills WHERE status = ?', ['deprecated']),
        this.db.get('SELECT COUNT(*) as count FROM skills WHERE status = ?', ['experimental']),
        this.db.all('SELECT DISTINCT namespace FROM skills WHERE namespace IS NOT NULL')
      ]);

      return {
        totalSkills: total.count,
        activeSkills: active.count,
        deprecatedSkills: deprecated.count,
        experimentalSkills: experimental.count,
        namespaces: namespaces.map((row: any) => row.namespace)
      };
    } catch (error) {
      this.logger.error('Failed to get statistics', error as Error);
      return {
        totalSkills: 0,
        activeSkills: 0,
        deprecatedSkills: 0,
        experimentalSkills: 0,
        namespaces: []
      };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async createTables(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        namespace TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        tags TEXT,
        agent_types TEXT,
        phases TEXT,
        priority INTEGER DEFAULT 0,
        dependencies TEXT,
        content_hash TEXT,
        file_path TEXT,
        file_size INTEGER,
        last_modified TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(name, version)
      );

      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
      CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
      CREATE INDEX IF NOT EXISTS idx_skills_namespace ON skills(namespace);
      CREATE INDEX IF NOT EXISTS idx_skills_agent_types ON skills(agent_types);
      CREATE INDEX IF NOT EXISTS idx_skills_priority ON skills(priority);
    `);
  }

  private mapRowToSkill(row: any): SkillRecord {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      namespace: row.namespace,
      description: row.description,
      status: row.status,
      tags: row.tags || '',
      agent_types: row.agent_types,
      phases: row.phases,
      priority: row.priority,
      dependencies: row.dependencies,
      content_hash: row.content_hash,
      file_path: row.file_path,
      file_size: row.file_size,
      last_modified: row.last_modified,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}