/**
 * Skills Database Query Layer
 *
 * Provides type-safe SQL queries for skill metadata operations.
 * Part of SkillLoader API implementation.
 *
 * @module skills-query
 */

import { QueryFilter, QueryOptions } from '../lib/database-service/types';

/**
 * Skill metadata record
 */
export interface SkillRecord {
  id: string;
  name: string;
  version: string;
  file_path: string;
  content_hash: string;
  namespace: string;
  status: 'active' | 'deprecated' | 'experimental';
  priority: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

/**
 * Agent-skill mapping record
 */
export interface AgentSkillMapping {
  agent_type: string;
  skill_id: string;
  is_required: boolean;
  priority: number;
  phase?: string;
  context_keywords?: string;
}

/**
 * Skill usage analytics record
 */
export interface SkillUsageRecord {
  id: string;
  skill_id: string;
  agent_id: string;
  agent_type: string;
  loaded_at: string;
  execution_time_ms: number;
  confidence_impact?: number;
}

/**
 * Bootstrap skill IDs that should always be loaded
 */
export const BOOTSTRAP_SKILL_IDS = [
  'cfn-coordination',
  'hook-pipeline',
  'pre-edit-backup',
  'cfn-agent-spawning',
  'cfn-loop-validation',
] as const;

/**
 * SQL queries for skills database operations
 */
export class SkillsQueryBuilder {
  /**
   * Get skills by agent type with optional context filtering
   */
  static getSkillsByAgentType(
    agentType: string,
    contextKeywords?: string[],
    phase?: string
  ): { sql: string; params: any[] } {
    const params: any[] = [agentType];
    let sql = `
      SELECT DISTINCT
        s.id,
        s.name,
        s.version,
        s.file_path,
        s.content_hash,
        s.namespace,
        s.status,
        s.priority,
        s.tags,
        asm.is_required,
        asm.priority as mapping_priority
      FROM skills s
      INNER JOIN agent_skill_mappings asm ON s.id = asm.skill_id
      WHERE asm.agent_type = ?
        AND s.status = 'active'
    `;

    // Add phase filter if provided
    if (phase) {
      sql += ` AND (asm.phase IS NULL OR asm.phase = ?)`;
      params.push(phase);
    }

    // Add context keyword filter if provided
    if (contextKeywords && contextKeywords.length > 0) {
      const keywordConditions = contextKeywords.map(() =>
        `(asm.context_keywords LIKE ? OR s.tags LIKE ?)`
      ).join(' OR ');

      sql += ` AND (${keywordConditions})`;

      contextKeywords.forEach(keyword => {
        params.push(`%${keyword}%`, `%${keyword}%`);
      });
    }

    sql += `
      ORDER BY
        asm.is_required DESC,
        COALESCE(asm.priority, s.priority) DESC,
        s.name ASC
    `;

    return { sql, params };
  }

  /**
   * Get bootstrap skills that should always be loaded
   */
  static getBootstrapSkills(): { sql: string; params: any[] } {
    const placeholders = BOOTSTRAP_SKILL_IDS.map(() => '?').join(',');

    return {
      sql: `
        SELECT
          id,
          name,
          version,
          file_path,
          content_hash,
          namespace,
          status,
          priority,
          tags
        FROM skills
        WHERE id IN (${placeholders})
          AND status = 'active'
        ORDER BY priority DESC
      `,
      params: [...BOOTSTRAP_SKILL_IDS],
    };
  }

  /**
   * Get skill by ID
   */
  static getSkillById(skillId: string): { sql: string; params: any[] } {
    return {
      sql: `
        SELECT
          id,
          name,
          version,
          file_path,
          content_hash,
          namespace,
          status,
          priority,
          tags,
          created_at,
          updated_at
        FROM skills
        WHERE id = ?
      `,
      params: [skillId],
    };
  }

  /**
   * Validate skill content hash
   */
  static validateContentHash(skillId: string, expectedHash: string): { sql: string; params: any[] } {
    return {
      sql: `
        SELECT
          id,
          content_hash,
          updated_at
        FROM skills
        WHERE id = ?
          AND content_hash = ?
      `,
      params: [skillId, expectedHash],
    };
  }

  /**
   * Log skill usage for analytics
   */
  static insertSkillUsage(usage: Omit<SkillUsageRecord, 'id' | 'loaded_at'>): { sql: string; params: any[] } {
    return {
      sql: `
        INSERT INTO skill_usage_log (
          id,
          skill_id,
          agent_id,
          agent_type,
          loaded_at,
          execution_time_ms,
          confidence_impact
        ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
      `,
      params: [
        `usage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        usage.skill_id,
        usage.agent_id,
        usage.agent_type,
        usage.execution_time_ms,
        usage.confidence_impact ?? null,
      ],
    };
  }

  /**
   * Get skill effectiveness analytics
   */
  static getSkillEffectiveness(skillId?: string): { sql: string; params: any[] } {
    const params: any[] = [];
    let sql = `
      SELECT
        s.id,
        s.name,
        COUNT(sul.id) as usage_count,
        AVG(sul.execution_time_ms) as avg_load_time_ms,
        AVG(sul.confidence_impact) as avg_confidence_impact,
        MAX(sul.loaded_at) as last_used_at
      FROM skills s
      LEFT JOIN skill_usage_log sul ON s.id = sul.skill_id
    `;

    if (skillId) {
      sql += ` WHERE s.id = ?`;
      params.push(skillId);
    }

    sql += `
      GROUP BY s.id, s.name
      ORDER BY usage_count DESC, avg_confidence_impact DESC
    `;

    return { sql, params };
  }

  /**
   * Update skill content hash (for cache invalidation)
   */
  static updateContentHash(skillId: string, newHash: string): { sql: string; params: any[] } {
    return {
      sql: `
        UPDATE skills
        SET content_hash = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
      params: [newHash, skillId],
    };
  }

  /**
   * Get all active skills for caching
   */
  static getAllActiveSkills(): { sql: string; params: any[] } {
    return {
      sql: `
        SELECT
          id,
          name,
          version,
          file_path,
          content_hash,
          namespace,
          status,
          priority,
          tags
        FROM skills
        WHERE status = 'active'
        ORDER BY priority DESC, name ASC
      `,
      params: [],
    };
  }

  /**
   * Get skills by tags
   */
  static getSkillsByTags(tags: string[]): { sql: string; params: any[] } {
    const conditions = tags.map(() => 's.tags LIKE ?').join(' OR ');
    const params = tags.map(tag => `%${tag}%`);

    return {
      sql: `
        SELECT
          id,
          name,
          version,
          file_path,
          content_hash,
          namespace,
          status,
          priority,
          tags
        FROM skills s
        WHERE status = 'active'
          AND (${conditions})
        ORDER BY priority DESC, name ASC
      `,
      params,
    };
  }

  /**
   * Create skills table schema
   */
  static createSkillsTableSchema(): string {
    return `
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'cfn',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deprecated', 'experimental')),
        priority INTEGER NOT NULL DEFAULT 5 CHECK(priority BETWEEN 1 AND 10),
        tags TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
      CREATE INDEX IF NOT EXISTS idx_skills_namespace ON skills(namespace);
      CREATE INDEX IF NOT EXISTS idx_skills_priority ON skills(priority);
      CREATE INDEX IF NOT EXISTS idx_skills_tags ON skills(tags);
    `;
  }

  /**
   * Create agent_skill_mappings table schema
   */
  static createMappingsTableSchema(): string {
    return `
      CREATE TABLE IF NOT EXISTS agent_skill_mappings (
        agent_type TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        is_required BOOLEAN NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 5 CHECK(priority BETWEEN 1 AND 10),
        phase TEXT,
        context_keywords TEXT,
        PRIMARY KEY (agent_type, skill_id),
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_asm_agent_type ON agent_skill_mappings(agent_type);
      CREATE INDEX IF NOT EXISTS idx_asm_skill_id ON agent_skill_mappings(skill_id);
      CREATE INDEX IF NOT EXISTS idx_asm_phase ON agent_skill_mappings(phase);
    `;
  }

  /**
   * Create skill_usage_log table schema
   */
  static createUsageLogTableSchema(): string {
    return `
      CREATE TABLE IF NOT EXISTS skill_usage_log (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        loaded_at TEXT NOT NULL,
        execution_time_ms INTEGER NOT NULL,
        confidence_impact REAL,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sul_skill_id ON skill_usage_log(skill_id);
      CREATE INDEX IF NOT EXISTS idx_sul_agent_type ON skill_usage_log(agent_type);
      CREATE INDEX IF NOT EXISTS idx_sul_loaded_at ON skill_usage_log(loaded_at);
    `;
  }
}
