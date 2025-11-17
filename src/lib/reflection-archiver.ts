/**
 * Reflection Archiver
 * Task 5.3: ACE Reflection Persistence Standardization
 *
 * Manages automatic archival of Redis reflections to PostgreSQL
 * based on TTL thresholds. Runs as background task.
 *
 * Performance target: <500ms per reflection archive
 */

import { DatabaseService } from './database-service';
import { StandardError, ErrorCode } from './errors';
import { logger } from './logging';

export interface ArchiverConfig {
  /**
   * TTL threshold in seconds - archive when Redis key TTL falls below this
   * Default: 3600 (1 hour)
   */
  ttl_threshold_seconds?: number;

  /**
   * Interval between archive scans in milliseconds
   * Default: 300000 (5 minutes)
   */
  scan_interval_ms?: number;

  /**
   * Maximum reflections to archive per scan
   * Default: 100
   */
  max_per_scan?: number;

  /**
   * Enable automatic archival on interval
   * Default: true
   */
  auto_archive?: boolean;
}

export interface ArchiveMetrics {
  total_archived: number;
  last_scan_time: Date | null;
  last_scan_count: number;
  failed_archives: number;
  average_archive_time_ms: number;
  redis_unavailable_count: number;
}

const DEFAULT_CONFIG: Required<ArchiverConfig> = {
  ttl_threshold_seconds: 3600, // 1 hour
  scan_interval_ms: 300000, // 5 minutes
  max_per_scan: 100,
  auto_archive: true,
};

export class ReflectionArchiver {
  private dbService: DatabaseService;
  private config: Required<ArchiverConfig>;
  private scanInterval: NodeJS.Timeout | null = null;
  private metrics: ArchiveMetrics = {
    total_archived: 0,
    last_scan_time: null,
    last_scan_count: 0,
    failed_archives: 0,
    average_archive_time_ms: 0,
    redis_unavailable_count: 0,
  };

  private archiveTimes: number[] = [];
  private isScanning: boolean = false;

  constructor(dbService: DatabaseService, config?: ArchiverConfig) {
    this.dbService = dbService;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start automatic archival process
   */
  start(): void {
    if (this.scanInterval) {
      logger.warn('Archiver already running');
      return;
    }

    if (!this.config.auto_archive) {
      logger.info('Auto-archive disabled in config');
      return;
    }

    logger.info('Starting reflection archiver', {
      scan_interval_ms: this.config.scan_interval_ms,
      ttl_threshold_seconds: this.config.ttl_threshold_seconds,
      max_per_scan: this.config.max_per_scan,
    });

    this.scanInterval = setInterval(
      () => this.runArchiveScan(),
      this.config.scan_interval_ms
    );

    // Run initial scan immediately
    this.runArchiveScan();
  }

  /**
   * Stop automatic archival process
   */
  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      logger.info('Reflection archiver stopped');
    }
  }

  /**
   * Manually trigger an archive scan
   */
  async manualScan(): Promise<number> {
    return await this.runArchiveScan();
  }

  /**
   * Get current archiver metrics
   */
  getMetrics(): ArchiveMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      total_archived: 0,
      last_scan_time: null,
      last_scan_count: 0,
      failed_archives: 0,
      average_archive_time_ms: 0,
      redis_unavailable_count: 0,
    };
    this.archiveTimes = [];
  }

  // ========== Private Methods ==========

  private async runArchiveScan(): Promise<number> {
    if (this.isScanning) {
      logger.debug('Archive scan already in progress, skipping');
      return 0;
    }

    this.isScanning = true;
    const scanStartTime = Date.now();

    try {
      const archivedCount = await this.scanAndArchive();

      this.metrics.last_scan_time = new Date();
      this.metrics.last_scan_count = archivedCount;
      this.metrics.total_archived += archivedCount;

      const scanDuration = Date.now() - scanStartTime;

      logger.info('Archive scan complete', {
        archived_count: archivedCount,
        scan_duration_ms: scanDuration,
        total_archived: this.metrics.total_archived,
      });

      return archivedCount;
    } catch (error) {
      logger.error('Archive scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    } finally {
      this.isScanning = false;
    }
  }

  private async scanAndArchive(): Promise<number> {
    let redisAdapter;

    try {
      redisAdapter = this.dbService.getAdapter('redis');
    } catch (error) {
      this.metrics.redis_unavailable_count++;
      logger.warn('Redis adapter unavailable, skipping archive scan', {
        redis_unavailable_count: this.metrics.redis_unavailable_count,
      });
      return 0;
    }

    let archivedCount = 0;

    try {
      // Get all reflection keys
      const keys = await redisAdapter.keys('reflection:*');

      logger.debug('Scanning reflection keys', { key_count: keys.length });

      // Process up to max_per_scan keys
      const keysToProcess = keys.slice(0, this.config.max_per_scan);

      for (const key of keysToProcess) {
        try {
          const archived = await this.archiveIfExpiring(key);

          if (archived) {
            archivedCount++;
          }
        } catch (error) {
          this.metrics.failed_archives++;

          logger.error('Failed to archive reflection', {
            key,
            error: error instanceof Error ? error.message : String(error),
            failed_archives: this.metrics.failed_archives,
          });
        }
      }

      // Update average archive time
      if (this.archiveTimes.length > 0) {
        const sum = this.archiveTimes.reduce((a, b) => a + b, 0);
        this.metrics.average_archive_time_ms = sum / this.archiveTimes.length;
      }

      // Keep only last 100 archive times for moving average
      if (this.archiveTimes.length > 100) {
        this.archiveTimes = this.archiveTimes.slice(-100);
      }

      return archivedCount;
    } catch (error) {
      logger.error('Scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return archivedCount;
    }
  }

  private async archiveIfExpiring(key: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      const redisAdapter = this.dbService.getAdapter('redis');

      // Check TTL
      const ttl = await redisAdapter.ttl(key);

      // Skip if key doesn't exist or has no expiration
      if (ttl < 0) {
        return false;
      }

      // Archive if TTL is below threshold
      if (ttl < this.config.ttl_threshold_seconds) {
        const data = await redisAdapter.get(key);

        if (!data) {
          logger.warn('Key exists but has no data', { key, ttl });
          return false;
        }

        let reflection;
        try {
          reflection = JSON.parse(data);
        } catch (error) {
          logger.error('Failed to parse reflection data', {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }

        // Write to PostgreSQL (idempotent)
        await this.writeToPostgreSQL(reflection);

        const archiveTime = Date.now() - startTime;
        this.archiveTimes.push(archiveTime);

        logger.debug('Reflection archived', {
          key,
          ttl,
          archive_time_ms: archiveTime,
          agent_id: reflection.agent_id,
          task_id: reflection.task_id,
        });

        // Warn if archive took too long
        if (archiveTime >= 500) {
          logger.warn('Archive exceeded performance target', {
            key,
            archive_time_ms: archiveTime,
            target_ms: 500,
          });
        }

        return true;
      }

      return false;
    } catch (error) {
      throw new StandardError(
        ErrorCode.DATABASE_ERROR,
        'Failed to archive reflection',
        {
          key,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async writeToPostgreSQL(reflection: any): Promise<void> {
    const pgAdapter = this.dbService.getAdapter('postgres');

    const query = `
      INSERT INTO reflections (
        agent_id,
        task_id,
        reflection_type,
        confidence,
        payload,
        timestamp,
        archived_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (agent_id, task_id, timestamp)
      DO UPDATE SET
        reflection_type = EXCLUDED.reflection_type,
        confidence = EXCLUDED.confidence,
        payload = EXCLUDED.payload,
        archived_at = NOW()
    `;

    const params = [
      reflection.agent_id,
      reflection.task_id,
      reflection.reflection_type,
      reflection.confidence,
      typeof reflection.payload === 'string'
        ? reflection.payload
        : JSON.stringify(reflection.payload),
      reflection.timestamp || new Date(),
    ];

    await pgAdapter.execute(query, params);
  }
}

/**
 * Factory function to create and start an archiver
 */
export function createArchiver(
  dbService: DatabaseService,
  config?: ArchiverConfig
): ReflectionArchiver {
  const archiver = new ReflectionArchiver(dbService, config);

  if (config?.auto_archive !== false) {
    archiver.start();
  }

  return archiver;
}
