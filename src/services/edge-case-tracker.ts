/**
 * Edge Case Tracker Service
 *
 * Comprehensive edge case tracking with feedback loop, deduplication,
 * expert notification, and analytics.
 *
 * Part of Phase 2, Task P2-2.1: Edge Case Feedback Loop
 */

import * as sqlite3 from 'better-sqlite3';
import { EdgeCaseDeduplicator } from '../lib/edge-case-deduplicator';
import {
  EdgeCase,
  EdgeCaseInput,
  EdgeCaseType,
  EdgeCaseCategory,
  EdgeCasePriority,
  EdgeCaseStatus,
  EdgeCaseResolution,
  EdgeCaseNotification,
  EdgeCaseAnalytics,
  EdgeCaseTrackerConfig,
  TopEdgeCasesQuery
} from '../types/edge-case';

/**
 * Edge Case Tracker
 *
 * Manages the complete edge case feedback loop:
 * 1. Detection and recording with deduplication
 * 2. Priority scoring based on frequency, recency, severity, impact
 * 3. Expert notification queue with <1h SLA
 * 4. Workflow management (NEW → INVESTIGATING → RESOLVED → CLOSED)
 * 5. Resolution tracking and verification
 * 6. Analytics and reporting
 */
export class EdgeCaseTracker {
  private db: sqlite3.Database | null = null;
  private deduplicator: EdgeCaseDeduplicator;
  private config: EdgeCaseTrackerConfig;

  constructor(config: EdgeCaseTrackerConfig) {
    this.config = {
      autoCloseAfterDays: 7,
      notificationThrottleMinutes: 60,
      ...config
    };

    this.deduplicator = new EdgeCaseDeduplicator();
  }

  /**
   * Initialize the tracker (create database tables)
   */
  public async initialize(): Promise<void> {
    this.db = new sqlite3.default(this.config.dbPath);

    // Execute migration to create tables
    const migration = `
      CREATE TABLE IF NOT EXISTS edge_case_tracker (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        signature TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN (
          'syntax_error', 'logic_error', 'timeout', 'data_validation', 'system_error'
        )),
        category TEXT NOT NULL CHECK(category IN (
          'skill_execution', 'database_operation', 'coordination', 'file_operation', 'api_call'
        )),
        priority TEXT NOT NULL CHECK(priority IN ('critical', 'high', 'medium', 'low')),
        context TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN (
          'new', 'investigating', 'resolved', 'closed', 'wont_fix'
        )),
        first_occurred DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_occurred DATETIME DEFAULT CURRENT_TIMESTAMP,
        occurrence_count INTEGER DEFAULT 1,
        assigned_expert TEXT,
        investigation_started_at DATETIME,
        resolved_at DATETIME,
        resolution TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_case_tracker_signature
        ON edge_case_tracker(signature);

      CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_priority_status
        ON edge_case_tracker(priority, status);

      CREATE TABLE IF NOT EXISTS edge_case_notifications (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        edge_case_id TEXT NOT NULL,
        priority TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        channel TEXT NOT NULL CHECK(channel IN ('slack', 'email')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME,
        delivery_status TEXT CHECK(delivery_status IN ('pending', 'sent', 'failed')),
        FOREIGN KEY (edge_case_id) REFERENCES edge_case_tracker(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_edge_case_notifications_pending
        ON edge_case_notifications(created_at, sent_at)
        WHERE sent_at IS NULL;
    `;

    this.db.exec(migration);
  }

  /**
   * Record an edge case with automatic deduplication
   *
   * Performance target: <100ms
   */
  public async recordEdgeCase(input: EdgeCaseInput): Promise<EdgeCase> {
    if (!this.db) {
      throw new Error('EdgeCaseTracker not initialized. Call initialize() first.');
    }

    // Generate signature for deduplication
    const signature = this.deduplicator.generateSignature(input);

    // Check for existing edge case with same signature
    const existing = this.db.prepare(`
      SELECT * FROM edge_case_tracker WHERE signature = ?
    `).get(signature) as any;

    if (existing) {
      // Update existing edge case (increment count, update last_occurred)
      const updatedCount = existing.occurrence_count + 1;

      // Recalculate priority based on new occurrence count
      const updatedPriority = this.calculatePriority({
        ...input,
        occurrenceCount: updatedCount,
        firstOccurred: new Date(existing.first_occurred),
        lastOccurred: new Date()
      });

      this.db.prepare(`
        UPDATE edge_case_tracker
        SET occurrence_count = ?,
            last_occurred = CURRENT_TIMESTAMP,
            priority = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(updatedCount, updatedPriority, existing.id);

      // Return updated edge case
      return this.getEdgeCase(existing.id)!;
    } else {
      // Create new edge case
      const id = this.generateId();
      const priority = this.calculatePriority(input);

      this.db.prepare(`
        INSERT INTO edge_case_tracker (
          id, signature, type, category, priority, context, status,
          first_occurred, last_occurred, occurrence_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
      `).run(
        id,
        signature,
        input.type,
        input.category,
        priority,
        JSON.stringify(input.context),
        EdgeCaseStatus.NEW
      );

      // Queue notification
      await this.queueNotification(id, input.type, input.category, priority);

      // Return created edge case
      return this.getEdgeCase(id)!;
    }
  }

  /**
   * Calculate priority score based on frequency, recency, severity, impact
   *
   * Scoring algorithm:
   * - Frequency: occurrence_count > 100 (+30), > 10 (+20), > 1 (+10)
   * - Recency: < 1h (+20), < 24h (+10)
   * - Type severity: system_error (+20), logic_error (+10)
   * - Category impact: database_operation (+15), coordination (+10)
   *
   * Priority thresholds:
   * - CRITICAL: >= 60
   * - HIGH: >= 40
   * - MEDIUM: >= 20
   * - LOW: < 20
   */
  private calculatePriority(input: EdgeCaseInput & Partial<EdgeCase>): EdgeCasePriority {
    let score = 0;

    // Frequency scoring
    const count = input.occurrenceCount || 1;
    if (count > 100) score += 30;
    else if (count > 10) score += 20;
    else if (count > 1) score += 10;

    // Recency scoring
    if (input.firstOccurred) {
      const hoursSinceFirst = (Date.now() - input.firstOccurred.getTime()) / 3600000;
      if (hoursSinceFirst < 1) score += 20;
      else if (hoursSinceFirst < 24) score += 10;
    }

    // Type severity scoring
    if (input.type === EdgeCaseType.SYSTEM_ERROR) score += 20;
    else if (input.type === EdgeCaseType.LOGIC_ERROR) score += 10;
    else if (input.type === EdgeCaseType.TIMEOUT) score += 5;

    // Category impact scoring
    if (input.category === EdgeCaseCategory.DATABASE_OPERATION) score += 15;
    else if (input.category === EdgeCaseCategory.COORDINATION) score += 10;
    else if (input.category === EdgeCaseCategory.API_CALL) score += 8;

    // Determine priority
    if (score >= 60) return EdgeCasePriority.CRITICAL;
    if (score >= 40) return EdgeCasePriority.HIGH;
    if (score >= 20) return EdgeCasePriority.MEDIUM;
    return EdgeCasePriority.LOW;
  }

  /**
   * Queue expert notification
   *
   * Notifications are queued but not sent immediately to allow throttling.
   * External service should process the queue periodically.
   */
  private async queueNotification(
    edgeCaseId: string,
    type: EdgeCaseType,
    category: EdgeCaseCategory,
    priority: EdgeCasePriority
  ): Promise<void> {
    if (!this.db) return;

    // Check if notification already exists for this edge case
    const existing = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM edge_case_notifications
      WHERE edge_case_id = ? AND sent_at IS NULL
    `).get(edgeCaseId) as { count: number };

    if (existing.count > 0) {
      // Don't duplicate notifications
      return;
    }

    // Determine notification channels based on priority
    const channels: Array<'slack' | 'email'> = [];

    if (priority === EdgeCasePriority.CRITICAL || priority === EdgeCasePriority.HIGH) {
      if (this.config.notificationConfig.slack?.enabled) {
        channels.push('slack');
      }
    }

    if (this.config.notificationConfig.email?.enabled) {
      channels.push('email');
    }

    // Create notification messages
    for (const channel of channels) {
      const message = this.formatNotificationMessage(type, category, priority);

      this.db.prepare(`
        INSERT INTO edge_case_notifications (
          edge_case_id, priority, type, category, message, channel, delivery_status
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `).run(edgeCaseId, priority, type, category, message, channel);
    }
  }

  /**
   * Format notification message
   */
  private formatNotificationMessage(
    type: EdgeCaseType,
    category: EdgeCaseCategory,
    priority: EdgeCasePriority
  ): string {
    const emoji = {
      [EdgeCasePriority.CRITICAL]: '🚨',
      [EdgeCasePriority.HIGH]: '⚠️',
      [EdgeCasePriority.MEDIUM]: '⚡',
      [EdgeCasePriority.LOW]: 'ℹ️'
    };

    return `${emoji[priority]} Edge Case Detected\n` +
           `Priority: ${priority.toUpperCase()}\n` +
           `Type: ${type}\n` +
           `Category: ${category}\n` +
           `Please investigate and assign.`;
  }

  /**
   * Get edge case by ID
   */
  public getEdgeCase(id: string): EdgeCase | null {
    if (!this.db) return null;

    const row = this.db.prepare(`
      SELECT * FROM edge_case_tracker WHERE id = ?
    `).get(id) as any;

    if (!row) return null;

    return this.rowToEdgeCase(row);
  }

  /**
   * Update edge case status
   */
  public async updateStatus(
    id: string,
    status: EdgeCaseStatus,
    assignedExpert?: string
  ): Promise<void> {
    if (!this.db) return;

    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (assignedExpert) {
      updates.push('assigned_expert = ?');
      params.push(assignedExpert);
    }

    if (status === EdgeCaseStatus.INVESTIGATING) {
      updates.push('investigation_started_at = CURRENT_TIMESTAMP');
    }

    if (status === EdgeCaseStatus.RESOLVED) {
      updates.push('resolved_at = CURRENT_TIMESTAMP');
    }

    params.push(id);

    this.db.prepare(`
      UPDATE edge_case_tracker
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...params);
  }

  /**
   * Resolve edge case with resolution details
   */
  public async resolveEdgeCase(
    id: string,
    resolution: EdgeCaseResolution
  ): Promise<void> {
    if (!this.db) return;

    this.db.prepare(`
      UPDATE edge_case_tracker
      SET status = 'resolved',
          resolved_at = CURRENT_TIMESTAMP,
          resolution = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(resolution), id);
  }

  /**
   * Get pending notifications
   */
  public async getPendingNotifications(): Promise<EdgeCaseNotification[]> {
    if (!this.db) return [];

    const rows = this.db.prepare(`
      SELECT * FROM edge_case_notifications
      WHERE sent_at IS NULL
      ORDER BY created_at ASC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      edgeCaseId: row.edge_case_id,
      priority: row.priority as EdgeCasePriority,
      type: row.type as EdgeCaseType,
      category: row.category as EdgeCaseCategory,
      message: row.message,
      createdAt: new Date(row.created_at),
      sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
      channel: row.channel as 'slack' | 'email'
    }));
  }

  /**
   * Mark notification as sent
   */
  public async markNotificationSent(notificationId: string): Promise<void> {
    if (!this.db) return;

    this.db.prepare(`
      UPDATE edge_case_notifications
      SET sent_at = CURRENT_TIMESTAMP,
          delivery_status = 'sent'
      WHERE id = ?
    `).run(notificationId);
  }

  /**
   * Check for auto-close eligibility (7 days without recurrence)
   */
  public async checkAutoClose(): Promise<void> {
    if (!this.db) return;

    const daysThreshold = this.config.autoCloseAfterDays || 7;

    this.db.prepare(`
      UPDATE edge_case_tracker
      SET status = 'closed',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'resolved'
        AND julianday('now') - julianday(resolved_at) >= ?
    `).run(daysThreshold);
  }

  /**
   * Get top edge cases (for analytics)
   *
   * Performance target: <500ms
   */
  public async getTopEdgeCases(query: TopEdgeCasesQuery = {}): Promise<EdgeCase[]> {
    if (!this.db) return [];

    const limit = query.limit || 10;
    const orderBy = query.orderBy || 'frequency';

    let orderClause = 'occurrence_count DESC';
    if (orderBy === 'recent') orderClause = 'last_occurred DESC';
    if (orderBy === 'priority') orderClause = `
      CASE priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END
    `;

    let whereClause = "status NOT IN ('closed', 'wont_fix')";
    const params: any[] = [];

    if (query.category) {
      whereClause += ' AND category = ?';
      params.push(query.category);
    }

    if (query.type) {
      whereClause += ' AND type = ?';
      params.push(query.type);
    }

    if (query.status) {
      whereClause = whereClause.replace("status NOT IN ('closed', 'wont_fix')", 'status = ?');
      params.push(query.status);
    }

    params.push(limit);

    const rows = this.db.prepare(`
      SELECT * FROM edge_case_tracker
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ?
    `).all(...params) as any[];

    return rows.map(row => this.rowToEdgeCase(row));
  }

  /**
   * Get edge cases by priority
   */
  public async getEdgeCasesByPriority(priority: EdgeCasePriority): Promise<EdgeCase[]> {
    if (!this.db) return [];

    const rows = this.db.prepare(`
      SELECT * FROM edge_case_tracker
      WHERE priority = ? AND status NOT IN ('closed', 'wont_fix')
      ORDER BY last_occurred DESC
    `).all(priority) as any[];

    return rows.map(row => this.rowToEdgeCase(row));
  }

  /**
   * Get edge cases grouped by category
   */
  public async getEdgeCasesByCategory(): Promise<Record<EdgeCaseCategory, number>> {
    if (!this.db) {
      return {
        [EdgeCaseCategory.SKILL_EXECUTION]: 0,
        [EdgeCaseCategory.DATABASE_OPERATION]: 0,
        [EdgeCaseCategory.COORDINATION]: 0,
        [EdgeCaseCategory.FILE_OPERATION]: 0,
        [EdgeCaseCategory.API_CALL]: 0
      };
    }

    const rows = this.db.prepare(`
      SELECT category, COUNT(*) as count
      FROM edge_case_tracker
      WHERE status NOT IN ('closed', 'wont_fix')
      GROUP BY category
    `).all() as any[];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.category] = row.count;
    }

    return result as Record<EdgeCaseCategory, number>;
  }

  /**
   * Get analytics
   *
   * Performance target: <500ms
   */
  public async getAnalytics(): Promise<EdgeCaseAnalytics> {
    if (!this.db) {
      return {
        totalCases: 0,
        resolvedCases: 0,
        resolutionRate: 0,
        avgResolutionTimeHours: 0,
        casesByPriority: {
          [EdgeCasePriority.CRITICAL]: 0,
          [EdgeCasePriority.HIGH]: 0,
          [EdgeCasePriority.MEDIUM]: 0,
          [EdgeCasePriority.LOW]: 0
        },
        casesByCategory: {
          [EdgeCaseCategory.SKILL_EXECUTION]: 0,
          [EdgeCaseCategory.DATABASE_OPERATION]: 0,
          [EdgeCaseCategory.COORDINATION]: 0,
          [EdgeCaseCategory.FILE_OPERATION]: 0,
          [EdgeCaseCategory.API_CALL]: 0
        },
        casesByType: {
          [EdgeCaseType.SYNTAX_ERROR]: 0,
          [EdgeCaseType.LOGIC_ERROR]: 0,
          [EdgeCaseType.TIMEOUT]: 0,
          [EdgeCaseType.DATA_VALIDATION]: 0,
          [EdgeCaseType.SYSTEM_ERROR]: 0
        },
        topEdgeCases: []
      };
    }

    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_cases,
        SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) as resolved_cases,
        AVG(CASE
          WHEN resolved_at IS NOT NULL
          THEN (julianday(resolved_at) - julianday(first_occurred)) * 24
          ELSE NULL
        END) as avg_resolution_hours
      FROM edge_case_tracker
    `).get() as any;

    const totalCases = stats.total_cases || 0;
    const resolvedCases = stats.resolved_cases || 0;
    const resolutionRate = totalCases > 0 ? resolvedCases / totalCases : 0;

    return {
      totalCases,
      resolvedCases,
      resolutionRate,
      avgResolutionTimeHours: stats.avg_resolution_hours || 0,
      casesByPriority: await this.getCasesByPriority(),
      casesByCategory: await this.getEdgeCasesByCategory(),
      casesByType: await this.getCasesByType(),
      topEdgeCases: (await this.getTopEdgeCases({ limit: 10 })).map(ec => ({
        id: ec.id,
        signature: ec.signature,
        type: ec.type,
        category: ec.category,
        occurrenceCount: ec.occurrenceCount,
        priority: ec.priority
      }))
    };
  }

  /**
   * Get cases by priority (for analytics)
   */
  private async getCasesByPriority(): Promise<Record<EdgeCasePriority, number>> {
    if (!this.db) {
      return {
        [EdgeCasePriority.CRITICAL]: 0,
        [EdgeCasePriority.HIGH]: 0,
        [EdgeCasePriority.MEDIUM]: 0,
        [EdgeCasePriority.LOW]: 0
      };
    }

    const rows = this.db.prepare(`
      SELECT priority, COUNT(*) as count
      FROM edge_case_tracker
      GROUP BY priority
    `).all() as any[];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.priority] = row.count;
    }

    return result as Record<EdgeCasePriority, number>;
  }

  /**
   * Get cases by type (for analytics)
   */
  private async getCasesByType(): Promise<Record<EdgeCaseType, number>> {
    if (!this.db) {
      return {
        [EdgeCaseType.SYNTAX_ERROR]: 0,
        [EdgeCaseType.LOGIC_ERROR]: 0,
        [EdgeCaseType.TIMEOUT]: 0,
        [EdgeCaseType.DATA_VALIDATION]: 0,
        [EdgeCaseType.SYSTEM_ERROR]: 0
      };
    }

    const rows = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM edge_case_tracker
      GROUP BY type
    `).all() as any[];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.type] = row.count;
    }

    return result as Record<EdgeCaseType, number>;
  }

  /**
   * Convert database row to EdgeCase object
   */
  private rowToEdgeCase(row: any): EdgeCase {
    return {
      id: row.id,
      signature: row.signature,
      type: row.type as EdgeCaseType,
      category: row.category as EdgeCaseCategory,
      priority: row.priority as EdgeCasePriority,
      context: JSON.parse(row.context),
      status: row.status as EdgeCaseStatus,
      firstOccurred: new Date(row.first_occurred),
      lastOccurred: new Date(row.last_occurred),
      occurrenceCount: row.occurrence_count,
      assignedExpert: row.assigned_expert || undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolution: row.resolution || undefined
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
