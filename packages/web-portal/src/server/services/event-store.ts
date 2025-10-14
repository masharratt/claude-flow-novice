/**
 * Event Store Service
 * 
 * Provides centralized event storage with TTL support and flexible querying capabilities.
 * Designed for high-performance event logging and retrieval in the Claude Flow system.
 * 
 * Features:
 * - 7-day TTL for automatic cleanup
 * - SQLite persistence with in-memory optimization
 * - Flexible filtering by phaseId, agentId, event type, and date range
 * - Performance optimized with indexing and connection pooling
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Event data structure for storage
 */
export interface EventData {
  id?: string;
  timestamp: Date;
  phaseId: string;
  agentId: string;
  eventType: string;
  payload: any;
  metadata?: Record<string, any>;
}

/**
 * Query filters for event retrieval
 */
export interface EventQueryFilters {
  phaseId?: string;
  agentId?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  // Payload JSON filters for hybrid worker events
  payloadFilters?: {
    status?: string;
    provider?: string;
    confidence_min?: number;
    confidence_max?: number;
  };
}

/**
 * Query result with pagination
 */
export interface EventQueryResult {
  events: EventData[];
  total: number;
  hasMore: boolean;
}

/**
 * Event Store Service
 * 
 * Singleton service managing event persistence and retrieval
 */
class EventStoreService {
  private db: Database.Database | null = null;
  private isInitialized = false;
  private readonly TTL_DAYS = 7;
  private readonly DB_PATH = join(process.cwd(), 'data', 'events.db');

  /**
   * Initialize the event store database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure data directory exists
      const dataDir = join(process.cwd(), 'data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      // Initialize SQLite database with optimized settings
      this.db = new Database(this.DB_PATH, {
        // In-memory mode for performance, with WAL for concurrency
        fileMustExist: false,
        readonly: false,
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
      });

      // Configure database for performance
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('mmap_size = 268435456'); // 256MB

      // Create events table with optimized schema
      this.createEventsTable();

      // Start cleanup timer for TTL
      this.startCleanupTimer();

      this.isInitialized = true;
      console.log('Event Store initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Event Store:', error);
      throw error;
    }
  }

  /**
   * Create the events table with proper indexing
   */
  private createEventsTable(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create table with optimized schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        phase_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create indexes for optimal query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_phase_id ON events(phase_id);
      CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_phase_agent ON events(phase_id, agent_id);
      CREATE INDEX IF NOT EXISTS idx_events_composite ON events(timestamp, phase_id, agent_id, event_type);
      CREATE INDEX IF NOT EXISTS idx_payload_status ON events(json_extract(payload, '$.status'));
      CREATE INDEX IF NOT EXISTS idx_payload_provider ON events(json_extract(payload, '$.provider'));
      CREATE INDEX IF NOT EXISTS idx_payload_confidence ON events(CAST(json_extract(payload, '$.confidence') AS REAL));
    `);
  }

  /**
   * Store a new event
   */
  async storeEvent(event: Omit<EventData, 'id'>): Promise<string> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    try {
      const eventId = this.generateEventId();
      const stmt = this.db!.prepare(`
        INSERT INTO events (
          id, timestamp, phase_id, agent_id, event_type, payload, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        eventId,
        event.timestamp.getTime(),
        event.phaseId,
        event.agentId,
        event.eventType,
        JSON.stringify(event.payload),
        event.metadata ? JSON.stringify(event.metadata) : null
      );

      return eventId;
    } catch (error) {
      console.error('Failed to store event:', error);
      throw new Error(`Event storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store multiple events in a transaction
   */
  async storeEvents(events: Omit<EventData, 'id'>[]): Promise<string[]> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    if (events.length === 0) return [];

    try {
      const transaction = this.db!.transaction(() => {
        const eventIds: string[] = [];
        const stmt = this.db!.prepare(`
          INSERT INTO events (
            id, timestamp, phase_id, agent_id, event_type, payload, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const event of events) {
          const eventId = this.generateEventId();
          stmt.run(
            eventId,
            event.timestamp.getTime(),
            event.phaseId,
            event.agentId,
            event.eventType,
            JSON.stringify(event.payload),
            event.metadata ? JSON.stringify(event.metadata) : null
          );
          eventIds.push(eventId);
        }

        return eventIds;
      });

      return transaction();
    } catch (error) {
      console.error('Failed to store events:', error);
      throw new Error(`Batch event storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Query events with flexible filtering
   */
  async queryEvents(filters: EventQueryFilters = {}): Promise<EventQueryResult> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    try {
      // Build WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters.phaseId) {
        conditions.push('phase_id = ?');
        params.push(filters.phaseId);
      }

      if (filters.agentId) {
        conditions.push('agent_id = ?');
        params.push(filters.agentId);
      }

      if (filters.eventType) {
        conditions.push('event_type = ?');
        params.push(filters.eventType);
      }

      if (filters.startDate) {
        conditions.push('timestamp >= ?');
        params.push(filters.startDate.getTime());
      }

      if (filters.endDate) {
        conditions.push('timestamp <= ?');
        params.push(filters.endDate.getTime());
      }

      // Payload JSON filters (for hybrid worker queries)
      if (filters.payloadFilters) {
        const { status, provider, confidence_min, confidence_max } = filters.payloadFilters;

        if (status) {
          conditions.push("json_extract(payload, '$.status') = ?");
          params.push(status);
        }

        if (provider) {
          conditions.push("json_extract(payload, '$.provider') = ?");
          params.push(provider);
        }

        if (confidence_min !== undefined) {
          conditions.push("CAST(json_extract(payload, '$.confidence') AS REAL) >= ?");
          params.push(confidence_min);
        }

        if (confidence_max !== undefined) {
          conditions.push("CAST(json_extract(payload, '$.confidence') AS REAL) <= ?");
          params.push(confidence_max);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countStmt = this.db!.prepare(`
        SELECT COUNT(*) as total FROM events ${whereClause}
      `);
      const countResult = countStmt.get(...params) as { total: number };
      const total = countResult.total;

      // Get paginated results
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      const queryStmt = this.db!.prepare(`
        SELECT 
          id, timestamp, phase_id, agent_id, event_type, payload, metadata
        FROM events 
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const rows = queryStmt.all(...params, limit, offset) as any[];

      const events: EventData[] = rows.map(row => ({
        id: row.id,
        timestamp: new Date(row.timestamp),
        phaseId: row.phase_id,
        agentId: row.agent_id,
        eventType: row.event_type,
        payload: JSON.parse(row.payload),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));

      return {
        events,
        total,
        hasMore: offset + events.length < total
      };
    } catch (error) {
      console.error('Failed to query events:', error);
      throw new Error(`Event query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get events by phase ID
   */
  async getEventsByPhaseId(phaseId: string, limit = 100): Promise<EventData[]> {
    const result = await this.queryEvents({ phaseId, limit });
    return result.events;
  }

  /**
   * Get events by agent ID
   */
  async getEventsByAgentId(agentId: string, limit = 100): Promise<EventData[]> {
    const result = await this.queryEvents({ agentId, limit });
    return result.events;
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType: string, limit = 100): Promise<EventData[]> {
    const result = await this.queryEvents({ eventType, limit });
    return result.events;
  }

  /**
   * Get events in date range
   */
  async getEventsByDateRange(startDate: Date, endDate: Date, limit = 100): Promise<EventData[]> {
    const result = await this.queryEvents({ startDate, endDate, limit });
    return result.events;
  }

  /**
   * Get recent events
   */
  async getRecentEvents(limit = 50): Promise<EventData[]> {
    const result = await this.queryEvents({ limit });
    return result.events;
  }

  /**
   * Delete events by ID (for manual cleanup)
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    try {
      const stmt = this.db!.prepare('DELETE FROM events WHERE id = ?');
      const result = stmt.run(eventId);
      return result.changes > 0;
    } catch (error) {
      console.error('Failed to delete event:', error);
      return false;
    }
  }

  /**
   * Get event store statistics
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    oldestEvent?: Date;
    newestEvent?: Date;
    uniquePhases: number;
    uniqueAgents: number;
    uniqueEventTypes: number;
  }> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    try {
      // Total events
      const totalStmt = this.db!.prepare('SELECT COUNT(*) as count FROM events');
      const totalResult = totalStmt.get() as { count: number };
      const totalEvents = totalResult.count;

      if (totalEvents === 0) {
        return {
          totalEvents: 0,
          uniquePhases: 0,
          uniqueAgents: 0,
          uniqueEventTypes: 0
        };
      }

      // Date range
      const rangeStmt = this.db!.prepare(`
        SELECT 
          MIN(timestamp) as oldest,
          MAX(timestamp) as newest
        FROM events
      `);
      const rangeResult = rangeStmt.get() as { oldest: number; newest: number };

      // Unique counts
      const uniqueStmt = this.db!.prepare(`
        SELECT 
          COUNT(DISTINCT phase_id) as phases,
          COUNT(DISTINCT agent_id) as agents,
          COUNT(DISTINCT event_type) as types
        FROM events
      `);
      const uniqueResult = uniqueStmt.get() as { phases: number; agents: number; types: number };

      return {
        totalEvents,
        oldestEvent: rangeResult.oldest ? new Date(rangeResult.oldest) : undefined,
        newestEvent: rangeResult.newest ? new Date(rangeResult.newest) : undefined,
        uniquePhases: uniqueResult.phases,
        uniqueAgents: uniqueResult.agents,
        uniqueEventTypes: uniqueResult.types
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      throw new Error(`Statistics query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup expired events (TTL enforcement)
   */
  async cleanupExpiredEvents(): Promise<number> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    try {
      const cutoffTime = Date.now() - (this.TTL_DAYS * 24 * 60 * 60 * 1000);
      
      const stmt = this.db!.prepare('DELETE FROM events WHERE timestamp < ?');
      const result = stmt.run(cutoffTime);
      
      if (result.changes > 0) {
        console.log(`Cleaned up ${result.changes} expired events`);
      }
      
      return result.changes;
    } catch (error) {
      console.error('Failed to cleanup expired events:', error);
      return 0;
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupExpiredEvents().catch(error => {
        console.error('Auto-cleanup failed:', error);
      });
    }, 60 * 60 * 1000);

    // Run initial cleanup
    this.cleanupExpiredEvents().catch(error => {
      console.error('Initial cleanup failed:', error);
    });
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }
}

// Export singleton instance
export const eventStoreService = new EventStoreService();

// Export types for external use
export type { EventData, EventQueryFilters, EventQueryResult };