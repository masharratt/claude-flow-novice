/**
 * Audit Logging Middleware - Phase 6 #4
 *
 * Logs all privileged operations for security monitoring and compliance.
 * Implements structured logging with 90-day retention policy.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logging';
import { recordMetric } from '../utils/metrics';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface AuditLogEntry {
  timestamp: Date;
  userId: string;
  teamId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  result: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
}

export interface AuditLogOptions {
  logPath?: string;
  retentionDays?: number;
  includeRequestBody?: boolean;
  operations?: string[];
  excludeEndpoints?: string[];
}

// ============================================================================
// Audit Operations Enum
// ============================================================================

export enum AuditOperation {
  AGENT_SPAWN = 'AGENT_SPAWN',
  AGENT_TERMINATE = 'AGENT_TERMINATE',
  QUOTA_CHANGE = 'QUOTA_CHANGE',
  COST_QUERY = 'COST_QUERY',
  ROLE_CHANGE = 'ROLE_CHANGE',
  CERTIFICATE_ROTATION = 'CERTIFICATE_ROTATION',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  USER_CREATE = 'USER_CREATE',
  USER_DELETE = 'USER_DELETE',
  TEAM_CREATE = 'TEAM_CREATE',
  TEAM_DELETE = 'TEAM_DELETE'
}

// ============================================================================
// Audit Logger Class
// ============================================================================

export class AuditLogger {
  private options: Required<AuditLogOptions>;

  constructor(options: AuditLogOptions = {}) {
    this.options = {
      logPath: options.logPath || '/var/log/cfn/audit.log',
      retentionDays: options.retentionDays || 90,
      includeRequestBody: options.includeRequestBody ?? false,
      operations: options.operations || Object.values(AuditOperation),
      excludeEndpoints: options.excludeEndpoints || []
    };

    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.options.logPath);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o750 });
    }
  }

  /**
   * Log audit entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const logLine = JSON.stringify({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      }) + '\n';

      // Append to log file
      fs.appendFileSync(this.options.logPath, logLine, { mode: 0o640 });

      // Track metrics
      recordMetric('audit.logged', 1, {
        action: entry.action,
        result: entry.result
      });

      // Also log to application logger
      logger.info('Audit log entry', {
        action: entry.action,
        userId: entry.userId,
        teamId: entry.teamId,
        resource: entry.resource,
        result: entry.result
      });
    } catch (error) {
      logger.error('Failed to write audit log', {
        error: (error as Error).message,
        entry
      });

      recordMetric('audit.error', 1, {
        error: (error as Error).message
      });
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanup(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);

      // Read log file
      if (!fs.existsSync(this.options.logPath)) {
        return 0;
      }

      const content = fs.readFileSync(this.options.logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // Filter out expired entries
      const validLines = lines.filter(line => {
        try {
          const entry = JSON.parse(line);
          const entryDate = new Date(entry.timestamp);
          return entryDate >= cutoffDate;
        } catch {
          return true;  // Keep unparseable lines
        }
      });

      const removedCount = lines.length - validLines.length;

      if (removedCount > 0) {
        // Write back filtered content
        fs.writeFileSync(
          this.options.logPath,
          validLines.join('\n') + '\n',
          { mode: 0o640 }
        );

        logger.info('Cleaned up audit logs', {
          removed: removedCount,
          cutoffDate
        });
      }

      return removedCount;
    } catch (error) {
      logger.error('Failed to cleanup audit logs', {
        error: (error as Error).message
      });
      return 0;
    }
  }

  /**
   * Query audit logs
   */
  async query(filters: Partial<AuditLogEntry>): Promise<AuditLogEntry[]> {
    try {
      if (!fs.existsSync(this.options.logPath)) {
        return [];
      }

      const content = fs.readFileSync(this.options.logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      const entries: AuditLogEntry[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          entry.timestamp = new Date(entry.timestamp);

          // Apply filters
          let matches = true;

          if (filters.userId && entry.userId !== filters.userId) matches = false;
          if (filters.teamId && entry.teamId !== filters.teamId) matches = false;
          if (filters.action && entry.action !== filters.action) matches = false;
          if (filters.resource && entry.resource !== filters.resource) matches = false;
          if (filters.result && entry.result !== filters.result) matches = false;

          if (matches) {
            entries.push(entry);
          }
        } catch {
          // Skip invalid entries
        }
      }

      return entries;
    } catch (error) {
      logger.error('Failed to query audit logs', {
        error: (error as Error).message
      });
      return [];
    }
  }
}

// ============================================================================
// Express Middleware
// ============================================================================

let globalAuditLogger: AuditLogger;

/**
 * Create audit logging middleware
 */
export function auditLogger(options: AuditLogOptions = {}) {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(options);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip excluded endpoints
    if (options.excludeEndpoints?.some(endpoint => req.path.startsWith(endpoint))) {
      return next();
    }

    // Capture response
    const originalJson = res.json;
    let responseBody: any;

    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Capture response completion
    res.on('finish', async () => {
      // Determine if this is an auditable operation
      const action = determineAction(req);

      if (!action) {
        return;
      }

      // Check if operation should be audited
      if (options.operations && !options.operations.includes(action)) {
        return;
      }

      // Extract user context
      const user = (req as any).user || {};

      // Create audit log entry
      const entry: AuditLogEntry = {
        timestamp: new Date(),
        userId: user.id || 'unknown',
        teamId: user.teamId || 'unknown',
        action,
        resource: extractResource(req),
        resourceId: extractResourceId(req),
        metadata: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          ...(options.includeRequestBody && req.body ? { requestBody: req.body } : {}),
          ...(responseBody ? { responseBody } : {})
        },
        ipAddress: extractIpAddress(req),
        userAgent: req.get('user-agent'),
        result: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
        errorMessage: res.statusCode >= 400 && responseBody?.error
          ? responseBody.error
          : undefined
      };

      await globalAuditLogger.log(entry);
    });

    next();
  };
}

/**
 * Manual audit logging
 */
export async function logAudit(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
  }

  await globalAuditLogger.log({
    ...entry,
    timestamp: new Date()
  });
}

/**
 * Get audit logger instance
 */
export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
  }
  return globalAuditLogger;
}

// ============================================================================
// Helper Functions
// ============================================================================

function determineAction(req: Request): string | null {
  const path = req.path;
  const method = req.method;

  // Agent operations
  if (path.includes('/agents/spawn')) return AuditOperation.AGENT_SPAWN;
  if (path.includes('/agents/') && method === 'DELETE') return AuditOperation.AGENT_TERMINATE;

  // Quota operations
  if (path.includes('/quota') && (method === 'PUT' || method === 'PATCH')) {
    return AuditOperation.QUOTA_CHANGE;
  }

  // Cost operations
  if (path.includes('/cost')) return AuditOperation.COST_QUERY;

  // Role operations
  if (path.includes('/roles') && (method === 'PUT' || method === 'PATCH')) {
    return AuditOperation.ROLE_CHANGE;
  }

  // User operations
  if (path.includes('/users') && method === 'POST') return AuditOperation.USER_CREATE;
  if (path.includes('/users') && method === 'DELETE') return AuditOperation.USER_DELETE;

  // Team operations
  if (path.includes('/teams') && method === 'POST') return AuditOperation.TEAM_CREATE;
  if (path.includes('/teams') && method === 'DELETE') return AuditOperation.TEAM_DELETE;

  // Config operations
  if (path.includes('/config') && (method === 'PUT' || method === 'PATCH')) {
    return AuditOperation.CONFIG_CHANGE;
  }

  return null;
}

function extractResource(req: Request): string {
  const parts = req.path.split('/').filter(p => p);
  return parts[0] || 'unknown';
}

function extractResourceId(req: Request): string | undefined {
  // Try to extract ID from path (e.g., /agents/123)
  const parts = req.path.split('/').filter(p => p);

  if (parts.length >= 2) {
    const id = parts[1];
    // Check if it looks like an ID (not another resource name)
    if (!/^[a-z]+$/.test(id)) {
      return id;
    }
  }

  // Try to extract from request body
  if (req.body && (req.body.id || req.body.resourceId)) {
    return req.body.id || req.body.resourceId;
  }

  return undefined;
}

function extractIpAddress(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

// ============================================================================
// Cleanup Scheduler
// ============================================================================

/**
 * Schedule automatic audit log cleanup
 */
export function scheduleAuditCleanup(intervalMs: number = 24 * 60 * 60 * 1000): NodeJS.Timeout {
  const cleanup = async () => {
    try {
      const removed = await getAuditLogger().cleanup();
      logger.info('Scheduled audit log cleanup completed', { removed });
    } catch (error) {
      logger.error('Scheduled audit log cleanup failed', {
        error: (error as Error).message
      });
    }
  };

  // Run immediately and then on interval
  cleanup();

  return setInterval(cleanup, intervalMs);
}
