/**
 * Skill Loader - Phase 3 Implementation
 *
 * Loads skills from:
 * 1. Bootstrap skills (static files, no DB required)
 * 2. Database-driven skills (SQLite with approval awareness)
 *
 * Features:
 * - Approval-aware loading (auto, escalate, human)
 * - LRU cache with TTL
 * - Content hash validation
 * - Usage analytics logging
 * - Context-based filtering
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';

// ============================================================================
// Interfaces
// ============================================================================

export interface Skill {
  id: number;
  name: string;
  category: 'coordination' | 'testing' | 'infrastructure' | 'domain' | 'foundation';
  team: string;
  contentPath: string;
  contentHash: string;
  tags: string[];
  version: string;
  status: 'active' | 'deprecated' | 'archived';
  approvalLevel: 'auto' | 'escalate' | 'human';
  approvalCriteria?: Record<string, any>;
  owner: string;
  content?: string;  // Loaded on-demand
  phase4PatternId?: number;
  generatedBy?: string;
}

export interface AgentSkillMapping {
  agentType: string;
  skillId: number;
  priority: number;
  required: boolean;
  conditions?: {
    taskContext?: string[];
    phase?: string[];
    mode?: string[];
  };
  notes?: string;
}

export interface TaskContext {
  taskId?: string;
  keywords?: string;
  phase?: string;
  mode?: string;
  iteration?: number;
}

export interface SkillUsageLog {
  agentId: string;
  agentType: string;
  skillIds: number[];
  taskId?: string;
  phase?: string;
  loadedAt: Date;
  confidenceBefore?: number;
  confidenceAfter?: number;
  executionTimeMs: number;
}

export interface SkillMetrics {
  skillId: number;
  skillName: string;
  totalUsages: number;
  averageConfidenceImpact: number;
  averageExecutionTimeMs: number;
  lastUsedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface BootstrapSkill {
  skillName: string;
  filePath: string;
  loadOrder: number;
  description: string;
}

interface CacheEntry {
  skill: Skill;
  timestamp: number;
}

// ============================================================================
// SkillLoader Class
// ============================================================================

export class SkillLoader {
  private db: Database.Database;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheMaxSize = 100; // LRU cache size
  private cacheTTL = 60000; // 1 minute TTL
  private bootstrapPath: string;
  private enableCache: boolean;

  constructor(
    dbPath: string = './.claude/skills-database/skills.db',
    options: { enableCache?: boolean; cacheMaxSize?: number; cacheTTL?: number } = {}
  ) {
    // Initialize database connection
    if (!existsSync(dbPath)) {
      throw new Error(`Skills database not found at: ${dbPath}`);
    }

    this.db = new Database(dbPath, { readonly: true });
    this.bootstrapPath = path.resolve('./.claude/skills/bootstrap');
    this.enableCache = options.enableCache !== false;
    this.cacheMaxSize = options.cacheMaxSize || this.cacheMaxSize;
    this.cacheTTL = options.cacheTTL || this.cacheTTL;
  }

  /**
   * Load skills for a specific agent with context filtering
   */
  async loadSkillsForAgent(
    agentType: string,
    context: TaskContext = {}
  ): Promise<Skill[]> {
    const startTime = Date.now();

    // Step 1: Load bootstrap skills (always first, no DB required)
    const bootstrapSkills = await this.loadBootstrapSkills();

    // Step 2: Query database for agent-specific skills
    const dbSkills = await this.queryAgentSkills(agentType, context);

    // Step 3: Load content for database skills
    const loadedDbSkills = await Promise.all(
      dbSkills.map(s => this.loadSkillContent(s))
    );

    // Step 4: Combine and return
    const allSkills = [...bootstrapSkills, ...loadedDbSkills];

    const executionTimeMs = Date.now() - startTime;

    // Log performance if slow
    if (executionTimeMs > 15) {
      console.warn(`[SkillLoader] Slow skill loading: ${executionTimeMs}ms for ${agentType}`);
    }

    return allSkills;
  }

  /**
   * Load bootstrap skills (static files, no database required)
   */
  async loadBootstrapSkills(): Promise<Skill[]> {
    const bootstrapRecords = this.db.prepare(`
      SELECT skill_name, file_path, load_order, description
      FROM bootstrap_skills
      ORDER BY load_order ASC
    `).all() as BootstrapSkill[];

    const bootstrapSkills: Skill[] = [];

    for (const record of bootstrapRecords) {
      try {
        const fullPath = path.resolve(record.filePath);

        if (!existsSync(fullPath)) {
          console.warn(`[SkillLoader] Bootstrap skill not found: ${fullPath}`);
          continue;
        }

        const content = readFileSync(fullPath, 'utf-8');
        const hash = this.calculateHash(content);

        // Parse frontmatter for metadata
        const metadata = this.parseFrontmatter(content);

        bootstrapSkills.push({
          id: -record.loadOrder, // Negative IDs for bootstrap skills
          name: record.skillName,
          category: 'foundation',
          team: 'foundation',
          contentPath: record.filePath,
          contentHash: hash,
          tags: metadata.tags || ['bootstrap'],
          version: metadata.version || '1.0.0',
          status: 'active',
          approvalLevel: metadata.approval_level || 'auto',
          approvalCriteria: metadata.approval_criteria,
          owner: metadata.owner || 'cfn-core',
          content: content,
          generatedBy: 'bootstrap'
        });
      } catch (error) {
        console.error(`[SkillLoader] Failed to load bootstrap skill ${record.skillName}:`, error);
      }
    }

    return bootstrapSkills;
  }

  /**
   * Query database for agent-specific skills with filtering
   */
  private async queryAgentSkills(
    agentType: string,
    context: TaskContext
  ): Promise<Skill[]> {
    const { keywords, phase, mode } = context;

    // Build dynamic query based on context
    let query = `
      SELECT
        s.id, s.name, s.category, s.team, s.content_path, s.content_hash,
        s.tags, s.version, s.status, s.approval_level, s.approval_criteria,
        s.owner, s.phase4_pattern_id, s.generated_by,
        m.priority, m.required, m.conditions
      FROM skills s
      JOIN agent_skill_mappings m ON m.skill_id = s.id
      WHERE m.agent_type = ?
        AND s.status = 'active'
    `;

    const params: any[] = [agentType];

    // Filter by conditions if present
    if (keywords || phase || mode) {
      query += ` AND (
        m.conditions IS NULL
        ${keywords ? "OR m.conditions LIKE ?" : ""}
        ${phase ? "OR m.conditions LIKE ?" : ""}
        ${mode ? "OR m.conditions LIKE ?" : ""}
      )`;

      if (keywords) params.push(`%${keywords}%`);
      if (phase) params.push(`%"phase"%${phase}%`);
      if (mode) params.push(`%"mode"%${mode}%`);
    }

    // Order by priority (ascending), then approval level (auto first)
    query += `
      ORDER BY
        m.priority ASC,
        CASE s.approval_level
          WHEN 'auto' THEN 1
          WHEN 'escalate' THEN 2
          WHEN 'human' THEN 3
        END ASC
    `;

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      team: row.team,
      contentPath: row.content_path,
      contentHash: row.content_hash,
      tags: row.tags ? JSON.parse(row.tags) : [],
      version: row.version,
      status: row.status,
      approvalLevel: row.approval_level,
      approvalCriteria: row.approval_criteria ? JSON.parse(row.approval_criteria) : undefined,
      owner: row.owner,
      phase4PatternId: row.phase4_pattern_id,
      generatedBy: row.generated_by
    }));
  }

  /**
   * Load skill content from file with caching and hash validation
   */
  private async loadSkillContent(skill: Skill): Promise<Skill> {
    const cacheKey = `${skill.id}:${skill.version}`;

    // Check cache first
    if (this.enableCache && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey)!;

      // Check TTL
      if (Date.now() - entry.timestamp < this.cacheTTL) {
        return entry.skill;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    // Load from file
    try {
      const fullPath = path.resolve(skill.contentPath);

      if (!existsSync(fullPath)) {
        console.warn(`[SkillLoader] Skill file not found: ${fullPath}`);
        return { ...skill, content: `# Error: Skill file not found\n\nPath: ${fullPath}` };
      }

      const content = readFileSync(fullPath, 'utf-8');

      // Validate hash (non-blocking warning)
      const actualHash = this.calculateHash(content);
      if (actualHash !== skill.contentHash) {
        console.warn(
          `[SkillLoader] Hash mismatch for skill ${skill.name} (${skill.version})\n` +
          `  Expected: ${skill.contentHash}\n` +
          `  Actual:   ${actualHash}\n` +
          `  This may indicate the file was modified without updating the database.`
        );
      }

      const loadedSkill = { ...skill, content };

      // Update cache with LRU eviction
      if (this.enableCache) {
        if (this.cache.size >= this.cacheMaxSize) {
          // Remove oldest entry
          const oldestKey = this.cache.keys().next().value;
          this.cache.delete(oldestKey);
        }

        this.cache.set(cacheKey, {
          skill: loadedSkill,
          timestamp: Date.now()
        });
      }

      return loadedSkill;
    } catch (error) {
      console.error(`[SkillLoader] Failed to load skill ${skill.name}:`, error);
      return { ...skill, content: `# Error loading skill\n\n${error}` };
    }
  }

  /**
   * Get single skill by ID or name
   */
  async getSkill(idOrName: number | string): Promise<Skill | null> {
    let row: any;

    if (typeof idOrName === 'number') {
      row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(idOrName);
    } else {
      row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(idOrName);
    }

    if (!row) {
      return null;
    }

    const skill: Skill = {
      id: row.id,
      name: row.name,
      category: row.category,
      team: row.team,
      contentPath: row.content_path,
      contentHash: row.content_hash,
      tags: row.tags ? JSON.parse(row.tags) : [],
      version: row.version,
      status: row.status,
      approvalLevel: row.approval_level,
      approvalCriteria: row.approval_criteria ? JSON.parse(row.approval_criteria) : undefined,
      owner: row.owner,
      phase4PatternId: row.phase4_pattern_id,
      generatedBy: row.generated_by
    };

    return this.loadSkillContent(skill);
  }

  /**
   * Check if skill requires approval before deployment
   */
  async requiresApproval(skill: Skill): Promise<boolean> {
    if (skill.approvalLevel === 'auto') {
      return false;
    }

    // Check if already approved
    const approved = this.db.prepare(`
      SELECT 1 FROM approval_history
      WHERE skill_id = ? AND version = ? AND decision = 'approved'
      LIMIT 1
    `).get(skill.id, skill.version);

    return !approved;
  }

  /**
   * Validate all skill content hashes
   */
  async validateIntegrity(): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    const skills = this.db.prepare('SELECT id, name, content_path, content_hash FROM skills').all() as any[];

    for (const skill of skills) {
      try {
        const fullPath = path.resolve(skill.content_path);

        if (!existsSync(fullPath)) {
          result.errors.push(`Skill ${skill.name}: File not found at ${fullPath}`);
          result.valid = false;
          continue;
        }

        const content = readFileSync(fullPath, 'utf-8');
        const actualHash = this.calculateHash(content);

        if (actualHash !== skill.content_hash) {
          result.warnings.push(
            `Skill ${skill.name}: Hash mismatch (expected: ${skill.content_hash}, actual: ${actualHash})`
          );
        }
      } catch (error) {
        result.errors.push(`Skill ${skill.name}: ${error}`);
        result.valid = false;
      }
    }

    return result;
  }

  /**
   * Log skill usage for analytics
   */
  async logSkillUsage(usage: SkillUsageLog): Promise<void> {
    // Note: This creates a writable connection temporarily for logging
    const logDb = new Database(this.db.name);

    try {
      const stmt = logDb.prepare(`
        INSERT INTO skill_usage_log (
          agent_id, agent_type, skill_id, task_id, phase,
          loaded_at, confidence_before, confidence_after, execution_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const skillId of usage.skillIds) {
        stmt.run(
          usage.agentId,
          usage.agentType,
          skillId,
          usage.taskId || null,
          usage.phase || null,
          usage.loadedAt.toISOString(),
          usage.confidenceBefore || null,
          usage.confidenceAfter || null,
          usage.executionTimeMs
        );
      }
    } finally {
      logDb.close();
    }
  }

  /**
   * Get skill effectiveness metrics
   */
  async getSkillMetrics(skillId: number): Promise<SkillMetrics | null> {
    const skill = this.db.prepare('SELECT name FROM skills WHERE id = ?').get(skillId) as any;

    if (!skill) {
      return null;
    }

    const metrics = this.db.prepare(`
      SELECT
        COUNT(*) as total_usages,
        AVG(confidence_after - confidence_before) as avg_confidence_impact,
        AVG(execution_time_ms) as avg_execution_time_ms,
        MAX(loaded_at) as last_used_at
      FROM skill_usage_log
      WHERE skill_id = ?
        AND confidence_before IS NOT NULL
        AND confidence_after IS NOT NULL
    `).get(skillId) as any;

    return {
      skillId,
      skillName: skill.name,
      totalUsages: metrics.total_usages || 0,
      averageConfidenceImpact: metrics.avg_confidence_impact || 0,
      averageExecutionTimeMs: metrics.avg_execution_time_ms || 0,
      lastUsedAt: metrics.last_used_at || 'never'
    };
  }

  /**
   * Clear cache (useful for testing or manual cache invalidation)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Calculate SHA256 hash of content
   */
  private calculateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Parse YAML frontmatter from markdown file
   */
  private parseFrontmatter(content: string): Record<string, any> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return {};
    }

    const frontmatter = match[1];
    const metadata: Record<string, any> = {};

    // Simple YAML parsing (supports basic key: value and key: [array])
    const lines = frontmatter.split('\n');
    let currentKey: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Key: value
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        currentKey = key.trim();

        if (value.startsWith('[') && value.endsWith(']')) {
          // Array
          metadata[currentKey] = value
            .slice(1, -1)
            .split(',')
            .map(v => v.trim());
        } else if (value === 'true' || value === 'false') {
          metadata[currentKey] = value === 'true';
        } else if (!isNaN(Number(value)) && value !== '') {
          metadata[currentKey] = Number(value);
        } else if (value) {
          metadata[currentKey] = value;
        } else {
          metadata[currentKey] = null;
        }
      } else if (currentKey && trimmed.startsWith('- ')) {
        // Array item continuation
        if (!Array.isArray(metadata[currentKey])) {
          metadata[currentKey] = [];
        }
        metadata[currentKey].push(trimmed.slice(2).trim());
      } else if (currentKey && trimmed.startsWith(' ')) {
        // Object continuation (nested keys)
        const [nestedKey, nestedValue] = trimmed.split(':').map(s => s.trim());
        if (!metadata[currentKey]) {
          metadata[currentKey] = {};
        }
        if (typeof metadata[currentKey] === 'object' && !Array.isArray(metadata[currentKey])) {
          metadata[currentKey][nestedKey] = isNaN(Number(nestedValue)) ? nestedValue : Number(nestedValue);
        }
      }
    }

    return metadata;
  }
}
