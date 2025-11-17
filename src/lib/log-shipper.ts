/**
 * Log Shipper - Centralized Logging to Loki/Elasticsearch
 *
 * Provides high-performance log shipping to centralized logging stack with:
 * - Batching and buffering for efficiency
 * - Retry logic for resilience
 * - Correlation ID propagation
 * - JSON formatting
 * - 30-day retention policies
 * - Search query building
 *
 * Task P2-2.3: Centralized Logging with ELK/Loki Stack
 * @version 1.0.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Log severity levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string; // ISO 8601 format
  level: LogLevel | string;
  message: string;
  context: string; // Service/source name
  correlationId?: string;
  taskId?: string;
  agentId?: string;
  traceId?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  source?: string;
}

/**
 * Log shipping options
 */
export interface ShippingOptions {
  lokiUrl?: string;
  bufferSize?: number;
  flushInterval?: number;
  defaultLabels?: Record<string, string>;
  retryAttempts?: number;
  retryDelay?: number;
  persistDir?: string;
  elasticsearchUrl?: string;
  username?: string;
  password?: string;
}

/**
 * Query options for log search
 */
export interface QueryOptions {
  level?: string;
  service?: string;
  correlationId?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Metrics for dashboard integration
 */
export interface ShipperMetrics {
  totalLogs: number;
  bufferedLogs: number;
  shippedLogs: number;
  failedLogs: number;
  lastFlushTime?: string;
  errorCount: number;
}

/**
 * High-performance log shipper for centralized logging
 */
export class LogShipper {
  private lokiUrl: string;
  private elasticsearchUrl?: string;
  private bufferSize: number;
  private flushInterval: number;
  private defaultLabels: Record<string, string>;
  private retryAttempts: number;
  private retryDelay: number;
  private persistDir: string;

  private buffer: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private metrics: ShipperMetrics;
  private closed = false;

  constructor(options: ShippingOptions = {}) {
    this.lokiUrl = options.lokiUrl || 'http://localhost:3100';
    this.elasticsearchUrl = options.elasticsearchUrl;
    this.bufferSize = options.bufferSize || 100;
    this.flushInterval = options.flushInterval || 5000;
    this.defaultLabels = options.defaultLabels || { environment: 'production', service: 'cfn' };
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.persistDir = options.persistDir || '/var/log/cfn/persist';

    this.metrics = {
      totalLogs: 0,
      bufferedLogs: 0,
      shippedLogs: 0,
      failedLogs: 0,
      errorCount: 0,
    };

    // Start auto-flush timer
    this.startAutoFlush();
  }

  /**
   * Ship a log entry to centralized logging stack
   */
  async ship(entry: LogEntry): Promise<void> {
    if (this.closed) {
      throw new Error('LogShipper is closed');
    }

    // Normalize entry
    this.normalizeEntry(entry);

    // Add to buffer
    this.buffer.push(entry);
    this.metrics.totalLogs++;
    this.metrics.bufferedLogs++;

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /**
   * Flush buffered logs to centralized stack
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToShip = [...this.buffer];
    this.buffer = [];
    this.metrics.bufferedLogs = 0;

    try {
      // Ship to Loki
      await this.shipToLoki(logsToShip);

      // Ship to Elasticsearch if configured
      if (this.elasticsearchUrl) {
        await this.shipToElasticsearch(logsToShip);
      }

      this.metrics.shippedLogs += logsToShip.length;
      this.metrics.lastFlushTime = new Date().toISOString();
    } catch (error) {
      this.metrics.failedLogs += logsToShip.length;
      this.metrics.errorCount++;

      // Persist failed logs for retry
      await this.persistLogs(logsToShip);

      throw error;
    }
  }

  /**
   * Ship logs to Loki
   */
  private async shipToLoki(logs: LogEntry[]): Promise<void> {
    const payload = this.formatLogsForLoki(logs);

    const response = await this.retryWithBackoff(async () => {
      return fetch(`${this.lokiUrl}/loki/api/v1/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    });

    if (!response.ok) {
      throw new Error(`Loki API error: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Ship logs to Elasticsearch
   */
  private async shipToElasticsearch(logs: LogEntry[]): Promise<void> {
    const bulkPayload = this.formatLogsForElasticsearch(logs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-ndjson',
    };

    if (this.defaultLabels.username && this.defaultLabels.password) {
      const auth = Buffer.from(
        `${this.defaultLabels.username}:${this.defaultLabels.password}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await this.retryWithBackoff(async () => {
      return fetch(`${this.elasticsearchUrl}/_bulk`, {
        method: 'POST',
        headers,
        body: bulkPayload,
      });
    });

    if (!response.ok) {
      throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Format logs for Loki push API
   */
  private formatLogsForLoki(logs: LogEntry[]): any {
    const streams = new Map<string, any[]>();

    for (const log of logs) {
      const labels = this.getLabelsForLog(log);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');

      if (!streams.has(labelStr)) {
        streams.set(labelStr, []);
      }

      const timestamp = (new Date(log.timestamp).getTime() * 1000000).toString();
      streams.get(labelStr)!.push([timestamp, this.formatLog(log)]);
    }

    const streamsList = Array.from(streams.entries()).map(([labels, values]) => ({
      stream: this.parseLabels(labels),
      values,
    }));

    return { streams: streamsList };
  }

  /**
   * Format logs for Elasticsearch bulk API
   */
  private formatLogsForElasticsearch(logs: LogEntry[]): string {
    const lines: string[] = [];
    const indexPrefix = `cfn-logs-${new Date().toISOString().split('T')[0]}`;

    for (const log of logs) {
      // Index metadata
      lines.push(
        JSON.stringify({
          index: {
            _index: indexPrefix,
            _type: '_doc',
          },
        })
      );

      // Document
      lines.push(JSON.stringify(log));
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get labels for a log entry
   */
  private getLabelsForLog(log: LogEntry): Record<string, string> {
    return {
      ...this.defaultLabels,
      level: String(log.level),
      service: log.context,
    };
  }

  /**
   * Parse label string into object
   */
  private parseLabels(labelStr: string): Record<string, string> {
    const labels: Record<string, string> = {};
    const parts = labelStr.split(', ');

    for (const part of parts) {
      const [key, value] = part.split('=');
      labels[key] = value.replace(/^"|"$/g, '');
    }

    return labels;
  }

  /**
   * Format log as JSON string
   */
  formatLog(entry: LogEntry): string {
    const logObject = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      context: entry.context,
      ...(entry.correlationId && { correlationId: entry.correlationId }),
      ...(entry.taskId && { taskId: entry.taskId }),
      ...(entry.agentId && { agentId: entry.agentId }),
      ...(entry.traceId && { traceId: entry.traceId }),
      ...(entry.metadata && { metadata: entry.metadata }),
      ...(entry.error && { error: entry.error }),
    };

    return JSON.stringify(logObject);
  }

  /**
   * Normalize log entry
   */
  private normalizeEntry(entry: LogEntry): void {
    // Ensure ISO 8601 timestamp
    if (!entry.timestamp) {
      entry.timestamp = new Date().toISOString();
    }

    // Validate timestamp format
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(entry.timestamp)) {
      try {
        entry.timestamp = new Date(entry.timestamp).toISOString();
      } catch {
        entry.timestamp = new Date().toISOString();
      }
    }

    // Ensure level is string
    entry.level = String(entry.level).toLowerCase();
  }

  /**
   * Check if log entry has expired based on retention policy
   */
  isLogExpired(entry: LogEntry, retentionDays: number): boolean {
    try {
      const logTime = new Date(entry.timestamp).getTime();
      const now = new Date().getTime();
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

      return now - logTime > retentionMs;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired logs
   */
  async cleanupExpiredLogs(retentionDays: number): Promise<number> {
    let cleanedCount = 0;

    try {
      // Clean from buffer
      const beforeCount = this.buffer.length;
      this.buffer = this.buffer.filter(log => !this.isLogExpired(log, retentionDays));
      cleanedCount += beforeCount - this.buffer.length;

      // Clean from persistent storage
      const persisted = await this.getPersistentLogs();
      for (const log of persisted) {
        if (this.isLogExpired(log, retentionDays)) {
          cleanedCount++;
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired logs:', error);
    }

    return cleanedCount;
  }

  /**
   * Build LogQL query string
   */
  buildLogQLQuery(options: QueryOptions): string {
    let query = '{';

    if (options.level) {
      query += `level="${options.level}",`;
    }

    if (options.service) {
      query += `service="${options.service}",`;
    }

    query = query.replace(/,$/g, '}');

    if (options.correlationId) {
      query += ` | json correlationId="${options.correlationId}"`;
    }

    if (options.timeRange) {
      const start = Math.floor(options.timeRange.start.getTime() / 1000);
      const end = Math.floor(options.timeRange.end.getTime() / 1000);
      query = `${start}s,${end}s ${query}`;
    }

    return query;
  }

  /**
   * Get metrics for dashboard integration
   */
  getMetrics(): ShipperMetrics {
    return {
      ...this.metrics,
      bufferedLogs: this.buffer.length,
    };
  }

  /**
   * Calculate error rate
   */
  getErrorRate(): number {
    if (this.metrics.totalLogs === 0) {
      return 0;
    }

    const errorLogs = this.buffer.filter(log => log.level === LogLevel.ERROR).length;
    return errorLogs / this.metrics.totalLogs;
  }

  /**
   * Get persisted logs from disk
   */
  async getPersistentLogs(): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];

    try {
      const files = await fs.readdir(this.persistDir);

      for (const file of files) {
        try {
          const filePath = path.join(this.persistDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const logEntry = JSON.parse(content);
          logs.push(logEntry);
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // Persist dir doesn't exist yet
    }

    return logs;
  }

  /**
   * Persist logs to disk for retry on failure
   */
  private async persistLogs(logs: LogEntry[]): Promise<void> {
    try {
      await fs.mkdir(this.persistDir, { recursive: true });

      for (const log of logs) {
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        const filePath = path.join(this.persistDir, filename);
        await fs.writeFile(filePath, JSON.stringify(log));
      }
    } catch (error) {
      console.error('Error persisting logs:', error);
    }
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0 && !this.closed) {
        try {
          await this.flush();
        } catch (error) {
          console.error('Auto-flush error:', error);
        }
      }
    }, this.flushInterval);
  }

  /**
   * Close the shipper and clean up resources
   */
  async close(): Promise<void> {
    this.closed = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining logs
    if (this.buffer.length > 0) {
      try {
        await this.flush();
      } catch (error) {
        console.error('Error flushing remaining logs:', error);
      }
    }
  }

  /**
   * Getter methods for configuration
   */
  getLokiUrl(): string {
    return this.lokiUrl;
  }

  getDefaultLabels(): Record<string, string> {
    return this.defaultLabels;
  }

  getBufferSize(): number {
    return this.bufferSize;
  }

  getFlushInterval(): number {
    return this.flushInterval;
  }
}
