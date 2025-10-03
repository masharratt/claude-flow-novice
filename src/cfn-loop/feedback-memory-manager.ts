/**
 * @file Feedback Memory Manager
 * @description Manages persistence and retrieval of consensus feedback across iterations
 */

import { ConsensusFeedback, ActionableStep, ValidatorFeedback } from './feedback-injection-system.js';
import { Logger } from '../core/logger.js';

export interface FeedbackMemoryEntry {
  phaseId: string;
  iteration: number;
  feedback: ConsensusFeedback;
  storedAt: number;
  ttl: number;
}

export interface FeedbackQuery {
  phaseId?: string;
  iteration?: number;
  minConsensusScore?: number;
  maxConsensusScore?: number;
  severityFilter?: Array<'critical' | 'high' | 'medium' | 'low'>;
  limit?: number;
}

export interface FeedbackMemoryConfig {
  namespace: string;
  defaultTTL: number;
  maxEntries: number;
  compressionEnabled: boolean;
}

export class FeedbackMemoryManager {
  private logger: Logger;
  private config: FeedbackMemoryConfig;
  private memoryStore: Map<string, FeedbackMemoryEntry> = new Map();
  private indexByPhase: Map<string, Set<string>> = new Map();
  private indexByIteration: Map<number, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<FeedbackMemoryConfig>) {
    this.config = {
      namespace: config?.namespace || 'cfn-loop/feedback',
      defaultTTL: config?.defaultTTL || 86400 * 7, // 7 days
      maxEntries: config?.maxEntries || 1000,
      compressionEnabled: config?.compressionEnabled ?? false,
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'FeedbackMemoryManager' });

    // CFN-2025-003: Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Store consensus feedback in memory
   */
  async storeFeedback(feedback: ConsensusFeedback, ttl?: number): Promise<string> {
    const key = this.generateMemoryKey(feedback.phaseId, feedback.iteration);

    const entry: FeedbackMemoryEntry = {
      phaseId: feedback.phaseId,
      iteration: feedback.iteration,
      feedback,
      storedAt: Date.now(),
      ttl: ttl || this.config.defaultTTL,
    };

    // Check if we need to evict old entries
    if (this.memoryStore.size >= this.config.maxEntries) {
      await this.evictOldest();
    }

    // Store entry
    this.memoryStore.set(key, entry);

    // Update indexes
    this.updateIndexes(key, feedback.phaseId, feedback.iteration);

    this.logger.info('Stored feedback in memory', {
      key,
      phaseId: feedback.phaseId,
      iteration: feedback.iteration,
      consensusScore: feedback.consensusScore,
    });

    return key;
  }

  /**
   * Retrieve feedback by phase and iteration
   */
  async retrieveFeedback(phaseId: string, iteration: number): Promise<ConsensusFeedback | null> {
    const key = this.generateMemoryKey(phaseId, iteration);
    const entry = this.memoryStore.get(key);

    if (!entry) {
      this.logger.debug('Feedback not found in memory', { phaseId, iteration });
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.logger.debug('Feedback expired, removing', { phaseId, iteration });
      await this.deleteFeedback(phaseId, iteration);
      return null;
    }

    return entry.feedback;
  }

  /**
   * Query feedback with filters
   */
  async queryFeedback(query: FeedbackQuery): Promise<ConsensusFeedback[]> {
    let results: FeedbackMemoryEntry[] = [];

    // Start with phase filter if provided
    if (query.phaseId) {
      const phaseKeys = this.indexByPhase.get(query.phaseId) || new Set();
      results = Array.from(phaseKeys)
        .map((key) => this.memoryStore.get(key))
        .filter((entry): entry is FeedbackMemoryEntry => entry !== undefined);
    } else if (query.iteration !== undefined) {
      const iterKeys = this.indexByIteration.get(query.iteration) || new Set();
      results = Array.from(iterKeys)
        .map((key) => this.memoryStore.get(key))
        .filter((entry): entry is FeedbackMemoryEntry => entry !== undefined);
    } else {
      results = Array.from(this.memoryStore.values());
    }

    // Apply filters
    results = results.filter((entry) => {
      if (this.isExpired(entry)) {
        return false;
      }

      if (query.minConsensusScore !== undefined && entry.feedback.consensusScore < query.minConsensusScore) {
        return false;
      }

      if (query.maxConsensusScore !== undefined && entry.feedback.consensusScore > query.maxConsensusScore) {
        return false;
      }

      if (query.severityFilter && query.severityFilter.length > 0) {
        const hasSeverity = entry.feedback.validatorFeedback.some((vf) =>
          vf.issues.some((issue) => query.severityFilter!.includes(issue.severity))
        );
        if (!hasSeverity) {
          return false;
        }
      }

      return true;
    });

    // Sort by iteration (newest first)
    results.sort((a, b) => b.iteration - a.iteration);

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results.map((entry) => entry.feedback);
  }

  /**
   * Get all feedback for a phase
   */
  async getPhaseFeedback(phaseId: string): Promise<ConsensusFeedback[]> {
    return this.queryFeedback({ phaseId });
  }

  /**
   * Get latest feedback for a phase
   */
  async getLatestFeedback(phaseId: string): Promise<ConsensusFeedback | null> {
    const results = await this.queryFeedback({ phaseId, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Delete feedback by phase and iteration
   */
  async deleteFeedback(phaseId: string, iteration: number): Promise<boolean> {
    const key = this.generateMemoryKey(phaseId, iteration);
    const entry = this.memoryStore.get(key);

    if (!entry) {
      return false;
    }

    // Remove from store
    this.memoryStore.delete(key);

    // Remove from indexes
    this.removeFromIndexes(key, phaseId, iteration);

    this.logger.debug('Deleted feedback from memory', { phaseId, iteration });

    return true;
  }

  /**
   * Clear all feedback for a phase
   */
  async clearPhase(phaseId: string): Promise<number> {
    const phaseKeys = this.indexByPhase.get(phaseId) || new Set();
    let deletedCount = 0;

    for (const key of Array.from(phaseKeys)) {
      const entry = this.memoryStore.get(key);
      if (entry) {
        this.memoryStore.delete(key);
        this.removeFromIndexes(key, entry.phaseId, entry.iteration);
        deletedCount++;
      }
    }

    this.logger.info('Cleared phase feedback from memory', { phaseId, deletedCount });

    return deletedCount;
  }

  /**
   * Get accumulation of issues across iterations
   */
  async getAccumulatedIssues(phaseId: string): Promise<{
    recurring: ValidatorFeedback[];
    resolved: ValidatorFeedback[];
    new: ValidatorFeedback[];
  }> {
    const feedbacks = await this.getPhaseFeedback(phaseId);

    if (feedbacks.length === 0) {
      return { recurring: [], resolved: [], new: [] };
    }

    // Sort by iteration
    feedbacks.sort((a, b) => a.iteration - b.iteration);

    const issueMap = new Map<string, { count: number; lastSeen: number; feedback: ValidatorFeedback }>();

    // Track all issues
    feedbacks.forEach((fb, index) => {
      fb.validatorFeedback.forEach((vf) => {
        vf.issues.forEach((issue) => {
          const issueKey = this.generateIssueKey(issue);

          if (issueMap.has(issueKey)) {
            const existing = issueMap.get(issueKey)!;
            existing.count++;
            existing.lastSeen = index;
          } else {
            issueMap.set(issueKey, {
              count: 1,
              lastSeen: index,
              feedback: vf,
            });
          }
        });
      });
    });

    const latestIndex = feedbacks.length - 1;

    // Categorize issues
    const recurring: ValidatorFeedback[] = [];
    const resolved: ValidatorFeedback[] = [];
    const newIssues: ValidatorFeedback[] = [];

    issueMap.forEach((data) => {
      if (data.count > 1 && data.lastSeen === latestIndex) {
        recurring.push(data.feedback);
      } else if (data.lastSeen < latestIndex) {
        resolved.push(data.feedback);
      } else if (data.count === 1 && data.lastSeen === latestIndex) {
        newIssues.push(data.feedback);
      }
    });

    return {
      recurring,
      resolved,
      new: newIssues,
    };
  }

  /**
   * Get feedback trends across iterations
   */
  async getFeedbackTrends(phaseId: string): Promise<{
    consensusScoretrend: number[];
    issueCountTrend: number[];
    criticalIssuesTrend: number[];
    improving: boolean;
  }> {
    const feedbacks = await this.getPhaseFeedback(phaseId);

    if (feedbacks.length === 0) {
      return {
        consensusScoretrend: [],
        issueCountTrend: [],
        criticalIssuesTrend: [],
        improving: false,
      };
    }

    // Sort by iteration
    feedbacks.sort((a, b) => a.iteration - b.iteration);

    const consensusScoretrend = feedbacks.map((fb) => fb.consensusScore);
    const issueCountTrend = feedbacks.map((fb) =>
      fb.validatorFeedback.reduce((sum, vf) => sum + vf.issues.length, 0)
    );
    const criticalIssuesTrend = feedbacks.map((fb) =>
      fb.validatorFeedback.reduce(
        (sum, vf) => sum + vf.issues.filter((i) => i.severity === 'critical').length,
        0
      )
    );

    // Determine if improving (last 3 iterations)
    const recentScores = consensusScoretrend.slice(-3);
    const improving = recentScores.length >= 2 && recentScores.every((score, idx) => idx === 0 || score >= recentScores[idx - 1]);

    return {
      consensusScoretrend,
      issueCountTrend,
      criticalIssuesTrend,
      improving,
    };
  }

  /**
   * Export feedback to external storage (MCP)
   */
  async exportToMCP(phaseId: string): Promise<{
    exported: number;
    keys: string[];
  }> {
    // This would integrate with the MCP memory tool
    // For now, just return metadata
    const feedbacks = await this.getPhaseFeedback(phaseId);

    this.logger.info('Exporting feedback to MCP', {
      phaseId,
      count: feedbacks.length,
    });

    return {
      exported: feedbacks.length,
      keys: feedbacks.map((fb) => this.generateMemoryKey(fb.phaseId, fb.iteration)),
    };
  }

  /**
   * Import feedback from external storage
   */
  async importFromMCP(keys: string[]): Promise<number> {
    // This would integrate with the MCP memory tool
    // For now, just return count
    this.logger.info('Importing feedback from MCP', {
      count: keys.length,
    });

    return keys.length;
  }

  /**
   * Generate memory key
   */
  private generateMemoryKey(phaseId: string, iteration: number): string {
    return `${this.config.namespace}/${phaseId}/${iteration}`;
  }

  /**
   * Generate issue key for deduplication
   */
  private generateIssueKey(issue: any): string {
    const locationKey = issue.location
      ? `${issue.location.file || ''}:${issue.location.line || ''}`
      : 'no-location';

    return `${issue.type}:${issue.severity}:${issue.message}:${locationKey}`;
  }

  /**
   * Update indexes
   */
  private updateIndexes(key: string, phaseId: string, iteration: number): void {
    // Phase index
    if (!this.indexByPhase.has(phaseId)) {
      this.indexByPhase.set(phaseId, new Set());
    }
    this.indexByPhase.get(phaseId)!.add(key);

    // Iteration index
    if (!this.indexByIteration.has(iteration)) {
      this.indexByIteration.set(iteration, new Set());
    }
    this.indexByIteration.get(iteration)!.add(key);
  }

  /**
   * Remove from indexes
   */
  private removeFromIndexes(key: string, phaseId: string, iteration: number): void {
    // Phase index
    const phaseSet = this.indexByPhase.get(phaseId);
    if (phaseSet) {
      phaseSet.delete(key);
      if (phaseSet.size === 0) {
        this.indexByPhase.delete(phaseId);
      }
    }

    // Iteration index
    const iterSet = this.indexByIteration.get(iteration);
    if (iterSet) {
      iterSet.delete(key);
      if (iterSet.size === 0) {
        this.indexByIteration.delete(iteration);
      }
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: FeedbackMemoryEntry): boolean {
    const expirationTime = entry.storedAt + entry.ttl * 1000;
    return Date.now() > expirationTime;
  }

  /**
   * Evict oldest entry
   */
  private async evictOldest(): Promise<void> {
    let oldestEntry: FeedbackMemoryEntry | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of Array.from(this.memoryStore.entries())) {
      if (!oldestEntry || entry.storedAt < oldestEntry.storedAt) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldestEntry) {
      await this.deleteFeedback(oldestEntry.phaseId, oldestEntry.iteration);
      this.logger.debug('Evicted oldest feedback entry', {
        phaseId: oldestEntry.phaseId,
        iteration: oldestEntry.iteration,
      });
    }
  }

  /**
   * Start cleanup interval
   * CFN-2025-003: Periodic cleanup every hour to prevent memory leak
   */
  private startCleanupInterval(): void {
    // Clear any existing interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpired();
      },
      3600000 // CFN-2025-003: Every 1 hour
    );
  }

  /**
   * Cleanup expired entries
   */
  private async cleanupExpired(): Promise<void> {
    const expiredKeys: Array<{ phaseId: string; iteration: number }> = [];

    for (const [key, entry] of Array.from(this.memoryStore.entries())) {
      if (this.isExpired(entry)) {
        expiredKeys.push({ phaseId: entry.phaseId, iteration: entry.iteration });
      }
    }

    for (const { phaseId, iteration } of expiredKeys) {
      await this.deleteFeedback(phaseId, iteration);
    }

    if (expiredKeys.length > 0) {
      this.logger.info('Cleaned up expired feedback entries', { count: expiredKeys.length });
    }
  }

  /**
   * Get memory statistics
   */
  getStatistics(): {
    totalEntries: number;
    totalPhases: number;
    memoryUsage: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let oldestTime: number | null = null;
    let newestTime: number | null = null;

    for (const entry of Array.from(this.memoryStore.values())) {
      if (!oldestTime || entry.storedAt < oldestTime) {
        oldestTime = entry.storedAt;
      }
      if (!newestTime || entry.storedAt > newestTime) {
        newestTime = entry.storedAt;
      }
    }

    return {
      totalEntries: this.memoryStore.size,
      totalPhases: this.indexByPhase.size,
      memoryUsage: this.estimateMemoryUsage(),
      oldestEntry: oldestTime,
      newestEntry: newestTime,
    };
  }

  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    // Rough estimation
    let totalSize = 0;

    for (const entry of Array.from(this.memoryStore.values())) {
      const jsonSize = JSON.stringify(entry.feedback).length;
      totalSize += jsonSize;
    }

    return totalSize;
  }

  /**
   * Shutdown memory manager
   * CFN-2025-003: Clear cleanup interval to prevent memory leak
   */
  shutdown(): void {
    // CFN-2025-003: Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.memoryStore.clear();
    this.indexByPhase.clear();
    this.indexByIteration.clear();

    this.logger.info('Feedback memory manager shut down');
  }
}
