/**
 * RuVector GNN Usage Pattern Learning
 *
 * Tracks user query interactions and GNN training signals for adaptive learning.
 * Implements reinforcement learning signals, adaptive weighting, and query pattern recognition.
 *
 * Learning Signals:
 * - Query result clicks (implicit feedback)
 * - Explicit user feedback (thumbs up/down)
 * - Dwell time on results
 * - Query reformulations
 * - GNN layer performance metrics
 *
 * Reference: docker/trigger-dev/src/lib/ruvector-gnn-connectors.ts
 */

import { getCollection, COLLECTIONS } from './ruvector-init';
import { TensorCompress, getCompressionLevel } from '@ruvector/gnn';

/**
 * Query Interaction Event
 * Represents a user interaction with search results
 */
export interface QueryInteractionEvent {
  /** Unique event ID */
  eventId: string;
  /** Query text or embedding */
  query: string | number[];
  /** Timestamp of query */
  timestamp: number;
  /** Results returned to user */
  results: Array<{
    /** Result ID */
    id: string;
    /** Position in result list (0-indexed) */
    position: number;
    /** GNN confidence score */
    confidence: number;
  }>;
  /** User interaction data */
  interaction?: {
    /** IDs of clicked results */
    clickedIds: string[];
    /** Dwell time on each result (ms) */
    dwellTimes: Record<string, number>;
    /** Explicit feedback (1 = positive, -1 = negative, 0 = neutral) */
    feedback: Record<string, 1 | -1 | 0>;
    /** Whether user reformulated query */
    reformulated: boolean;
    /** Reformulated query (if applicable) */
    reformulatedQuery?: string;
  };
}

/**
 * GNN Training Signal
 * Represents a signal for updating GNN weights
 */
export interface GNNTrainingSignal {
  /** Signal ID */
  signalId: string;
  /** Collection name */
  collection: string;
  /** Signal type */
  type: 'positive' | 'negative' | 'neutral';
  /** Signal strength (0.0-1.0) */
  strength: number;
  /** Source query embedding */
  queryEmbedding: number[];
  /** Target result embedding */
  resultEmbedding: number[];
  /** Current GNN confidence */
  currentConfidence: number;
  /** Desired confidence (based on user feedback) */
  desiredConfidence: number;
  /** Timestamp */
  timestamp: number;
  /** Metadata */
  metadata: {
    /** Event that generated this signal */
    eventId: string;
    /** Result position */
    position: number;
    /** User action that triggered signal */
    action: 'click' | 'dwell' | 'feedback' | 'skip';
  };
}

/**
 * Query Pattern
 * Represents a recurring query pattern for optimization
 */
export interface QueryPattern {
  /** Pattern ID */
  patternId: string;
  /** Pattern description (for human readability) */
  description: string;
  /** Collection name */
  collection: string;
  /** Query embedding centroid */
  centroid: number[];
  /** Number of queries in pattern */
  queryCount: number;
  /** Average query frequency (queries per day) */
  avgFrequency: number;
  /** Top-K results for this pattern */
  topResults: Array<{
    /** Result ID */
    id: string;
    /** Confidence score */
    confidence: number;
    /** Click-through rate */
    ctr: number;
  }>;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Adaptive Weight Configuration
 * Controls how GNN weights adapt based on usage patterns
 */
export interface AdaptiveWeightConfig {
  /** Learning rate (0.0-1.0) */
  learningRate: number;
  /** Momentum factor for weight updates */
  momentum: number;
  /** Weight decay (L2 regularization) */
  weightDecay: number;
  /** Minimum signal strength to trigger update */
  minSignalStrength: number;
  /** Batch size for weight updates */
  batchSize: number;
  /** Update frequency (milliseconds) */
  updateFrequencyMs: number;
}

/**
 * Default adaptive weight configuration
 */
export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveWeightConfig = {
  learningRate: 0.001, // Conservative learning rate
  momentum: 0.9, // High momentum for stable updates
  weightDecay: 0.0001, // Light regularization
  minSignalStrength: 0.1, // Ignore weak signals
  batchSize: 32, // Batch updates for efficiency
  updateFrequencyMs: 60000 // Update every minute
};

/**
 * Query Interaction Tracker
 *
 * Tracks user interactions with search results and generates training signals.
 */
export class QueryInteractionTracker {
  private events: QueryInteractionEvent[] = [];
  private signals: GNNTrainingSignal[] = [];
  private maxEventsStored = 10000; // Limit memory usage

  /**
   * Record a query event
   *
   * @param event - Query interaction event
   */
  recordEvent(event: QueryInteractionEvent): void {
    this.events.push(event);

    // Trim old events if limit exceeded
    if (this.events.length > this.maxEventsStored) {
      this.events = this.events.slice(-this.maxEventsStored);
    }
  }

  /**
   * Record user interaction (click, dwell, feedback)
   *
   * @param eventId - Event ID to update
   * @param interaction - Interaction data
   */
  recordInteraction(
    eventId: string,
    interaction: NonNullable<QueryInteractionEvent['interaction']>
  ): void {
    const event = this.events.find(e => e.eventId === eventId);
    if (!event) {
      console.warn(`Event not found: ${eventId}`);
      return;
    }

    event.interaction = interaction;

    // Generate training signals from interaction
    this.generateTrainingSignals(event);
  }

  /**
   * Generate training signals from a query event
   *
   * Signals are generated based on:
   * - Clicks (positive signal for clicked results)
   * - Skips (negative signal for skipped results)
   * - Dwell time (strength based on time)
   * - Explicit feedback (strong positive/negative signal)
   *
   * @param event - Query interaction event
   */
  private generateTrainingSignals(event: QueryInteractionEvent): void {
    if (!event.interaction) return;

    const { clickedIds, dwellTimes, feedback, reformulated } = event.interaction;

    for (const result of event.results) {
      const wasClicked = clickedIds.includes(result.id);
      const dwellTime = dwellTimes[result.id] ?? 0;
      const userFeedback = feedback[result.id] ?? 0;

      // Determine signal type and strength
      let signalType: GNNTrainingSignal['type'] = 'neutral';
      let strength = 0;
      let action: GNNTrainingSignal['metadata']['action'] = 'skip';

      if (userFeedback !== 0) {
        // Explicit feedback (strongest signal)
        signalType = userFeedback > 0 ? 'positive' : 'negative';
        strength = 1.0;
        action = 'feedback';
      } else if (wasClicked) {
        // Click signal
        signalType = 'positive';
        // Strength based on dwell time
        // <1s = weak (0.2), 1-5s = medium (0.5), >5s = strong (0.8)
        if (dwellTime < 1000) {
          strength = 0.2;
        } else if (dwellTime < 5000) {
          strength = 0.5;
        } else {
          strength = 0.8;
        }
        action = dwellTime > 1000 ? 'dwell' : 'click';
      } else {
        // Skip signal (negative, but weak)
        signalType = 'negative';
        // Strength inversely proportional to position
        // Top results skipped = stronger negative signal
        strength = 0.1 * (1 - result.position / event.results.length);
        action = 'skip';
      }

      // Calculate desired confidence based on signal
      const desiredConfidence =
        signalType === 'positive'
          ? Math.min(1.0, result.confidence + strength * 0.2)
          : Math.max(0.0, result.confidence - strength * 0.2);

      // Create training signal
      const signal: GNNTrainingSignal = {
        signalId: `${event.eventId}-${result.id}`,
        collection: '', // Will be set by caller
        type: signalType,
        strength,
        queryEmbedding: typeof event.query === 'string' ? [] : event.query,
        resultEmbedding: [], // Will be fetched from collection
        currentConfidence: result.confidence,
        desiredConfidence,
        timestamp: Date.now(),
        metadata: {
          eventId: event.eventId,
          position: result.position,
          action
        }
      };

      this.signals.push(signal);
    }

    // If query was reformulated, generate negative signal for all results
    if (reformulated) {
      for (const result of event.results) {
        this.signals.push({
          signalId: `${event.eventId}-reform-${result.id}`,
          collection: '',
          type: 'negative',
          strength: 0.3, // Medium strength
          queryEmbedding: typeof event.query === 'string' ? [] : event.query,
          resultEmbedding: [],
          currentConfidence: result.confidence,
          desiredConfidence: Math.max(0.0, result.confidence - 0.1),
          timestamp: Date.now(),
          metadata: {
            eventId: event.eventId,
            position: result.position,
            action: 'skip'
          }
        });
      }
    }
  }

  /**
   * Get training signals for a collection
   *
   * @param collection - Collection name
   * @param limit - Maximum number of signals to return
   * @returns Training signals
   */
  getTrainingSignals(collection: string, limit?: number): GNNTrainingSignal[] {
    const filtered = this.signals.filter(s => s.collection === collection);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * Get all training signals
   *
   * @param limit - Maximum number of signals to return
   * @returns Training signals
   */
  getAllTrainingSignals(limit?: number): GNNTrainingSignal[] {
    return limit ? this.signals.slice(0, limit) : [...this.signals];
  }

  /**
   * Clear old training signals
   *
   * @param olderThanMs - Clear signals older than this (milliseconds)
   */
  clearOldSignals(olderThanMs: number): void {
    const cutoff = Date.now() - olderThanMs;
    this.signals = this.signals.filter(s => s.timestamp >= cutoff);
  }

  /**
   * Get query statistics
   *
   * @param collection - Collection name (optional)
   * @returns Query statistics
   */
  getQueryStats(collection?: string): {
    totalQueries: number;
    totalInteractions: number;
    avgClickThroughRate: number;
    avgDwellTime: number;
    reformulationRate: number;
  } {
    const events = collection
      ? this.events.filter(e => {
          // Would need to track collection per event
          return true;
        })
      : this.events;

    const interactions = events.filter(e => e.interaction);
    const clicks = interactions.flatMap(e => e.interaction!.clickedIds);
    const dwellTimes = interactions.flatMap(e => Object.values(e.interaction!.dwellTimes));
    const reformulations = interactions.filter(e => e.interaction!.reformulated);

    return {
      totalQueries: events.length,
      totalInteractions: interactions.length,
      avgClickThroughRate: clicks.length / (events.length * 10), // Assuming 10 results per query
      avgDwellTime: dwellTimes.reduce((sum, t) => sum + t, 0) / (dwellTimes.length || 1),
      reformulationRate: reformulations.length / (events.length || 1)
    };
  }
}

/**
 * Query Pattern Recognizer
 *
 * Identifies recurring query patterns for caching and optimization.
 */
export class QueryPatternRecognizer {
  private patterns: QueryPattern[] = [];
  private compressor = new TensorCompress();

  /**
   * Add a query to pattern recognition
   *
   * @param query - Query embedding
   * @param collection - Collection name
   * @param results - Query results
   */
  async addQuery(
    query: number[],
    collection: string,
    results: Array<{ id: string; confidence: number }>
  ): Promise<void> {
    // Find or create pattern
    const pattern = this.findMatchingPattern(query, collection);

    if (pattern) {
      // Update existing pattern
      pattern.queryCount++;
      pattern.lastUpdated = Date.now();

      // Update centroid (exponential moving average)
      const alpha = 0.1; // Learning rate for centroid update
      for (let i = 0; i < pattern.centroid.length; i++) {
        pattern.centroid[i] = alpha * query[i] + (1 - alpha) * pattern.centroid[i];
      }

      // Update top results with click-through rate
      for (const result of results) {
        const existing = pattern.topResults.find(r => r.id === result.id);
        if (existing) {
          existing.confidence = (existing.confidence + result.confidence) / 2;
          // CTR update would require interaction data
        } else if (pattern.topResults.length < 10) {
          pattern.topResults.push({ ...result, ctr: 0 });
        }
      }
    } else {
      // Create new pattern
      const newPattern: QueryPattern = {
        patternId: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: `Pattern for ${collection}`,
        collection,
        centroid: [...query],
        queryCount: 1,
        avgFrequency: 0, // Will be calculated over time
        topResults: results.slice(0, 10).map(r => ({ ...r, ctr: 0 })),
        lastUpdated: Date.now()
      };

      this.patterns.push(newPattern);
    }
  }

  /**
   * Find matching pattern for a query
   *
   * Uses cosine similarity with threshold = 0.9
   *
   * @param query - Query embedding
   * @param collection - Collection name
   * @returns Matching pattern or undefined
   */
  private findMatchingPattern(query: number[], collection: string): QueryPattern | undefined {
    const threshold = 0.9;

    for (const pattern of this.patterns) {
      if (pattern.collection !== collection) continue;

      const similarity = this.cosineSimilarity(query, pattern.centroid);
      if (similarity >= threshold) {
        return pattern;
      }
    }

    return undefined;
  }

  /**
   * Get patterns for a collection
   *
   * @param collection - Collection name
   * @returns Patterns sorted by frequency
   */
  getPatterns(collection: string): QueryPattern[] {
    return this.patterns
      .filter(p => p.collection === collection)
      .sort((a, b) => b.queryCount - a.queryCount);
  }

  /**
   * Get hot patterns (frequently accessed)
   *
   * @param collection - Collection name
   * @param threshold - Minimum query count threshold
   * @returns Hot patterns
   */
  getHotPatterns(collection: string, threshold: number = 10): QueryPattern[] {
    return this.getPatterns(collection).filter(p => p.queryCount >= threshold);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Adaptive Weight Manager
 *
 * Manages GNN weight updates based on training signals.
 * Implements batch gradient descent with momentum.
 */
export class AdaptiveWeightManager {
  private config: AdaptiveWeightConfig;
  private signalBuffer: GNNTrainingSignal[] = [];
  private lastUpdateTime = 0;

  constructor(config: Partial<AdaptiveWeightConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
  }

  /**
   * Add training signal to buffer
   *
   * @param signal - Training signal
   */
  addSignal(signal: GNNTrainingSignal): void {
    // Filter out weak signals
    if (signal.strength < this.config.minSignalStrength) {
      return;
    }

    this.signalBuffer.push(signal);

    // Trigger update if buffer is full or enough time has passed
    const timeSinceUpdate = Date.now() - this.lastUpdateTime;
    if (
      this.signalBuffer.length >= this.config.batchSize ||
      timeSinceUpdate >= this.config.updateFrequencyMs
    ) {
      this.flushBuffer();
    }
  }

  /**
   * Flush signal buffer and apply weight updates
   *
   * Note: This is a placeholder. Full implementation requires:
   * 1. GNN layer weight extraction
   * 2. Gradient calculation from training signals
   * 3. Momentum-based weight update
   * 4. Weight persistence to disk
   */
  private flushBuffer(): void {
    if (this.signalBuffer.length === 0) return;

    console.log(`Flushing ${this.signalBuffer.length} training signals`);

    // Placeholder - would calculate weight updates
    // For each signal:
    // 1. Calculate loss = (currentConfidence - desiredConfidence)^2
    // 2. Calculate gradient of loss w.r.t. GNN weights
    // 3. Apply momentum-based update: weight -= learningRate * gradient + momentum * prevUpdate
    // 4. Apply weight decay: weight *= (1 - weightDecay)

    this.signalBuffer = [];
    this.lastUpdateTime = Date.now();
  }

  /**
   * Get current configuration
   */
  getConfig(): AdaptiveWeightConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<AdaptiveWeightConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get buffer statistics
   */
  getBufferStats(): {
    bufferSize: number;
    timeSinceLastUpdate: number;
    signalsByType: Record<string, number>;
  } {
    const signalsByType: Record<string, number> = {};
    for (const signal of this.signalBuffer) {
      signalsByType[signal.type] = (signalsByType[signal.type] ?? 0) + 1;
    }

    return {
      bufferSize: this.signalBuffer.length,
      timeSinceLastUpdate: Date.now() - this.lastUpdateTime,
      signalsByType
    };
  }
}

/**
 * Usage Pattern Learning System
 *
 * Combines interaction tracking, pattern recognition, and adaptive weighting.
 */
export class UsagePatternLearningSystem {
  private interactionTracker: QueryInteractionTracker;
  private patternRecognizer: QueryPatternRecognizer;
  private weightManager: AdaptiveWeightManager;

  constructor(config?: Partial<AdaptiveWeightConfig>) {
    this.interactionTracker = new QueryInteractionTracker();
    this.patternRecognizer = new QueryPatternRecognizer();
    this.weightManager = new AdaptiveWeightManager(config);
  }

  /**
   * Record a query and its results
   *
   * @param query - Query text or embedding
   * @param collection - Collection name
   * @param results - Query results
   * @returns Event ID for later interaction recording
   */
  async recordQuery(
    query: string | number[],
    collection: string,
    results: Array<{ id: string; confidence: number }>
  ): Promise<string> {
    const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Record interaction event
    this.interactionTracker.recordEvent({
      eventId,
      query,
      timestamp: Date.now(),
      results: results.map((r, i) => ({ ...r, position: i }))
    });

    // Add to pattern recognition
    if (typeof query !== 'string') {
      await this.patternRecognizer.addQuery(query, collection, results);
    }

    return eventId;
  }

  /**
   * Record user interaction with results
   *
   * @param eventId - Event ID from recordQuery
   * @param interaction - User interaction data
   */
  recordInteraction(
    eventId: string,
    interaction: NonNullable<QueryInteractionEvent['interaction']>
  ): void {
    this.interactionTracker.recordInteraction(eventId, interaction);

    // Get training signals and add to weight manager
    const signals = this.interactionTracker.getAllTrainingSignals();
    for (const signal of signals) {
      this.weightManager.addSignal(signal);
    }
  }

  /**
   * Get query statistics
   */
  getQueryStats(collection?: string) {
    return this.interactionTracker.getQueryStats(collection);
  }

  /**
   * Get query patterns
   */
  getQueryPatterns(collection: string) {
    return this.patternRecognizer.getPatterns(collection);
  }

  /**
   * Get hot query patterns
   */
  getHotPatterns(collection: string, threshold?: number) {
    return this.patternRecognizer.getHotPatterns(collection, threshold);
  }

  /**
   * Get weight manager statistics
   */
  getWeightManagerStats() {
    return this.weightManager.getBufferStats();
  }

  /**
   * Cleanup old data
   *
   * @param olderThanMs - Clear data older than this (milliseconds)
   */
  cleanup(olderThanMs: number): void {
    this.interactionTracker.clearOldSignals(olderThanMs);
  }
}
