/**
 * Persistent Metrics Storage using SQLite
 *
 * Stores all metrics to a local SQLite database for:
 * - Cross-process metric aggregation
 * - Historical analysis
 * - Metrics that survive restarts
 * - Query capabilities across time ranges
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { MetricPoint } from './telemetry.js';

export interface StoredMetric {
  id: number;
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  timestamp: string; // ISO 8601
  tags: string; // JSON stringified
}

export interface MetricQuery {
  name?: string;
  type?: string;
  startTime?: Date;
  endTime?: Date;
  tags?: Record<string, string>;
  limit?: number;
}

export interface MetricSummary {
  name: string;
  type: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  tags: Record<string, Record<string, number>>; // tag -> value -> count
}

export class MetricsStorage {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private readonly dbPath: string;

  constructor(dbPath: string = '.claude-flow-novice/metrics.db') {
    this.dbPath = dbPath;

    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Initialize database
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency

    // Create schema
    this.createSchema();

    // Prepare insert statement for performance
    this.insertStmt = this.db.prepare(`
      INSERT INTO metrics (name, value, type, timestamp, tags)
      VALUES (?, ?, ?, ?, ?)
    `);
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('counter', 'gauge', 'timer', 'histogram')),
        timestamp TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for fast queries
      CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type);
      CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(name, timestamp);
    `);
  }

  /**
   * Store a metric point
   */
  store(metric: MetricPoint): void {
    this.insertStmt.run(
      metric.name,
      metric.value,
      metric.type,
      metric.timestamp.toISOString(),
      JSON.stringify(metric.tags)
    );
  }

  /**
   * Store multiple metrics in a transaction (faster)
   */
  storeBatch(metrics: MetricPoint[]): void {
    const insertMany = this.db.transaction((metricsArray: MetricPoint[]) => {
      for (const metric of metricsArray) {
        this.insertStmt.run(
          metric.name,
          metric.value,
          metric.type,
          metric.timestamp.toISOString(),
          JSON.stringify(metric.tags)
        );
      }
    });

    insertMany(metrics);
  }

  /**
   * Query metrics with filters
   */
  query(filter: MetricQuery = {}): StoredMetric[] {
    let sql = 'SELECT * FROM metrics WHERE 1=1';
    const params: any[] = [];

    if (filter.name) {
      sql += ' AND name = ?';
      params.push(filter.name);
    }

    if (filter.type) {
      sql += ' AND type = ?';
      params.push(filter.type);
    }

    if (filter.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(filter.startTime.toISOString());
    }

    if (filter.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(filter.endTime.toISOString());
    }

    sql += ' ORDER BY timestamp DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as StoredMetric[];

    // Filter by tags if specified
    if (filter.tags) {
      return rows.filter(row => {
        const rowTags = JSON.parse(row.tags);
        return Object.entries(filter.tags!).every(
          ([key, value]) => rowTags[key] === value
        );
      });
    }

    return rows;
  }

  /**
   * Get total count for a counter metric
   */
  getCounterTotal(name: string, tags?: Record<string, string>): number {
    const metrics = this.query({ name, type: 'counter', tags });
    return metrics.reduce((sum, m) => sum + m.value, 0);
  }

  /**
   * Get latest gauge value
   */
  getLatestGauge(name: string, tags?: Record<string, string>): number | null {
    const metrics = this.query({ name, type: 'gauge', tags, limit: 1 });
    return metrics.length > 0 ? metrics[0].value : null;
  }

  /**
   * Get metric summary with aggregations
   */
  getSummary(name: string, startTime?: Date, endTime?: Date): MetricSummary | null {
    const metrics = this.query({ name, startTime, endTime });

    if (metrics.length === 0) {
      return null;
    }

    const values = metrics.map(m => m.value);
    const tagBreakdown: Record<string, Record<string, number>> = {};

    // Aggregate tags
    metrics.forEach(metric => {
      const tags = JSON.parse(metric.tags);
      Object.entries(tags).forEach(([key, value]) => {
        if (!tagBreakdown[key]) {
          tagBreakdown[key] = {};
        }
        tagBreakdown[key][value as string] = (tagBreakdown[key][value as string] || 0) + metric.value;
      });
    });

    return {
      name,
      type: metrics[0].type,
      count: metrics.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      tags: tagBreakdown,
    };
  }

  /**
   * Get breakdown by tag value
   */
  getBreakdown(name: string, tagKey: string, startTime?: Date, endTime?: Date): Record<string, number> {
    const metrics = this.query({ name, startTime, endTime });
    const breakdown: Record<string, number> = {};

    metrics.forEach(metric => {
      const tags = JSON.parse(metric.tags);
      const tagValue = tags[tagKey] || 'unknown';
      breakdown[tagValue] = (breakdown[tagValue] || 0) + metric.value;
    });

    return breakdown;
  }

  /**
   * Get time-series data (metrics grouped by time buckets)
   */
  getTimeSeries(
    name: string,
    bucketSize: '1min' | '5min' | '1hour' | '1day' = '5min',
    startTime?: Date,
    endTime?: Date
  ): Array<{ timestamp: string; value: number; count: number }> {
    const bucketSeconds: Record<string, number> = {
      '1min': 60,
      '5min': 300,
      '1hour': 3600,
      '1day': 86400,
    };

    const seconds = bucketSeconds[bucketSize];
    const sql = `
      SELECT
        strftime('%Y-%m-%d %H:%M:%S',
          datetime((strftime('%s', timestamp) / ${seconds}) * ${seconds}, 'unixepoch')
        ) as bucket,
        SUM(value) as value,
        COUNT(*) as count
      FROM metrics
      WHERE name = ?
        ${startTime ? 'AND timestamp >= ?' : ''}
        ${endTime ? 'AND timestamp <= ?' : ''}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const params = [name];
    if (startTime) params.push(startTime.toISOString());
    if (endTime) params.push(endTime.toISOString());

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Array<{ timestamp: string; value: number; count: number }>;
  }

  /**
   * Clean up old metrics (retention policy)
   */
  cleanup(retentionDays: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const stmt = this.db.prepare('DELETE FROM metrics WHERE timestamp < ?');
    const result = stmt.run(cutoffDate.toISOString());

    return result.changes;
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalMetrics: number;
    uniqueNames: number;
    oldestMetric: string | null;
    newestMetric: string | null;
    dbSizeMB: number;
  } {
    const totalMetrics = this.db.prepare('SELECT COUNT(*) as count FROM metrics').get() as { count: number };
    const uniqueNames = this.db.prepare('SELECT COUNT(DISTINCT name) as count FROM metrics').get() as { count: number };
    const oldest = this.db.prepare('SELECT MIN(timestamp) as ts FROM metrics').get() as { ts: string | null };
    const newest = this.db.prepare('SELECT MAX(timestamp) as ts FROM metrics').get() as { ts: string | null };

    // Get database file size
    let dbSizeMB = 0;
    try {
      const fs = require('fs');
      const stats = fs.statSync(this.dbPath);
      dbSizeMB = stats.size / (1024 * 1024);
    } catch (err) {
      // Ignore if can't get file size
    }

    return {
      totalMetrics: totalMetrics.count,
      uniqueNames: uniqueNames.count,
      oldestMetric: oldest.ts,
      newestMetric: newest.ts,
      dbSizeMB: Math.round(dbSizeMB * 100) / 100,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalStorage: MetricsStorage | undefined;

export function getGlobalMetricsStorage(): MetricsStorage {
  if (!globalStorage) {
    globalStorage = new MetricsStorage();
  }
  return globalStorage;
}

export function setGlobalMetricsStorage(storage: MetricsStorage): void {
  globalStorage = storage;
}
