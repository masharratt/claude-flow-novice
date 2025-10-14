/**
 * SQLite Adapter for ACE System
 * Handles all database operations for adaptive_context tables
 */

const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const crypto = require('crypto');

class ACEAdapter {
  constructor(options = {}) {
    this.dbPath = options.dbPath;
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Query bullets from adaptive_context
   */
  async queryBullets(options = {}) {
    const {
      category,
      tags,
      minConfidence = 0.0,
      limit = 50,
      isActive = true
    } = options;

    let query = 'SELECT * FROM adaptive_context WHERE 1=1';
    const params = [];

    if (isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(isActive ? 1 : 0);
    }

    if (category) {
      if (Array.isArray(category)) {
        query += ` AND category IN (${category.map(() => '?').join(',')})`;
        params.push(...category);
      } else {
        query += ' AND category = ?';
        params.push(category);
      }
    }

    if (tags && tags.length > 0) {
      // JSON array search
      const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ');
      query += ` AND (${tagConditions})`;
      params.push(...tags.map(tag => `%"${tag}"%`));
    }

    query += ' AND confidence_score >= ?';
    params.push(minConfidence);

    query += ' ORDER BY priority DESC, confidence_score DESC, helpful_count DESC';
    query += ' LIMIT ?';
    params.push(limit);

    return this._all(query, params);
  }

  /**
   * Store reflection in context_reflections table
   */
  async storeReflection(reflection) {
    const id = reflection.id || `refl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const query = `
      INSERT INTO context_reflections (
        id, reflection_type, task_id, execution_trace,
        feedback_signals, extracted_lessons, curator_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    await this._run(query, [
      id,
      reflection.reflection_type,
      reflection.task_id,
      JSON.stringify(reflection.execution_trace || {}),
      JSON.stringify(reflection.feedback_signals || {}),
      JSON.stringify(reflection.extracted_lessons || []),
      'pending'
    ]);

    return id;
  }

  /**
   * Get reflection by ID
   */
  async getReflection(reflectionId) {
    const query = 'SELECT * FROM context_reflections WHERE id = ?';
    const row = await this._get(query, [reflectionId]);

    if (row) {
      // Parse JSON fields
      row.execution_trace = JSON.parse(row.execution_trace || '{}');
      row.feedback_signals = JSON.parse(row.feedback_signals || '{}');
      row.extracted_lessons = JSON.parse(row.extracted_lessons || '[]');
      row.merged_bullet_ids = JSON.parse(row.merged_bullet_ids || '[]');
    }

    return row;
  }

  /**
   * Add or update bullet in adaptive_context
   */
  async upsertBullet(bullet) {
    const bulletId = bullet.bullet_id || `bullet-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const query = `
      INSERT INTO adaptive_context (
        id, bullet_id, category, content, helpful_count, harmful_count,
        confidence_score, priority, tags, source_task_id, acl_level,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(bullet_id) DO UPDATE SET
        helpful_count = helpful_count + excluded.helpful_count,
        confidence_score = excluded.confidence_score,
        updated_at = datetime('now')
    `;

    await this._run(query, [
      bulletId,
      bulletId,
      bullet.category,
      bullet.content,
      bullet.helpful_count || 0,
      bullet.harmful_count || 0,
      bullet.confidence_score || 0.5,
      bullet.priority || 5,
      JSON.stringify(bullet.tags || []),
      bullet.source_task_id,
      bullet.acl_level || 4,
      1 // is_active
    ]);

    return bulletId;
  }

  /**
   * Log bullet usage
   */
  async logUsage(usage) {
    const id = `usage-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const query = `
      INSERT INTO context_usage_log (
        id, bullet_id, task_id, agent_id, usage_outcome,
        context_snapshot, used_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    await this._run(query, [
      id,
      usage.bulletId,
      usage.taskId,
      usage.agentId,
      usage.outcome, // 'helpful' or 'harmful'
      JSON.stringify(usage.contextSnapshot || {})
    ]);

    return id;
  }

  /**
   * Get system statistics
   */
  async getStats() {
    const totalBullets = await this._get('SELECT COUNT(*) as count FROM adaptive_context WHERE is_active = 1');
    const avgConfidence = await this._get('SELECT AVG(confidence_score) as avg FROM adaptive_context WHERE is_active = 1');
    const topBullets = await this._all(`
      SELECT bullet_id, content, helpful_count, harmful_count, confidence_score
      FROM adaptive_context
      WHERE is_active = 1
      ORDER BY helpful_count DESC, confidence_score DESC
      LIMIT 10
    `);

    const categoryDistribution = await this._all(`
      SELECT category, COUNT(*) as count
      FROM adaptive_context
      WHERE is_active = 1
      GROUP BY category
      ORDER BY count DESC
    `);

    return {
      total_bullets: totalBullets.count,
      avg_confidence: avgConfidence.avg ? avgConfidence.avg.toFixed(2) : 0,
      top_bullets: topBullets,
      category_distribution: categoryDistribution
    };
  }

  /**
   * Update reflection status after curation
   */
  async updateReflectionStatus(reflectionId, status, mergedBulletIds = []) {
    const query = `
      UPDATE context_reflections
      SET curator_status = ?, merged_bullet_ids = ?
      WHERE id = ?
    `;

    await this._run(query, [
      status,
      JSON.stringify(mergedBulletIds),
      reflectionId
    ]);
  }

  /**
   * Archive bullet (soft delete)
   */
  async archiveBullet(bulletId, reason) {
    const query = `
      UPDATE adaptive_context
      SET is_active = 0, updated_at = datetime('now')
      WHERE bullet_id = ?
    `;

    await this._run(query, [bulletId]);

    // Log archive event
    await this._run(`
      INSERT INTO context_merge_log (
        id, action_type, reflection_id, affected_bullets,
        merge_decision, rationale, performed_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      `archive-${Date.now()}`,
      'archive',
      null,
      JSON.stringify([bulletId]),
      'archive',
      reason
    ]);
  }

  // Promise wrappers for sqlite3
  _run(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  _get(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  _all(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = { ACEAdapter };
