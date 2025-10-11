/**
 * Checkpoint Serializer - State Compression and Serialization
 *
 * Provides efficient serialization and compression for checkpoint data:
 * - JSON serialization with optional compression (gzip)
 * - Incremental serialization (only changed data)
 * - Size validation (<1MB target)
 * - Compression ratio tracking
 *
 * Acceptance Criteria:
 * - Serialization latency: <50ms
 * - Compression ratio: ≥2:1 for typical state
 * - Target size: <1MB per sprint checkpoint
 * - Incremental checkpoint: Only serialize changed data
 *
 * @module cfn-loop/checkpoint-serializer
 */

import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { Logger } from '../core/logger.js';
import type { EpicState } from './state-checkpoint-manager.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ===== TYPE DEFINITIONS =====

/**
 * Serialized checkpoint data
 */
export interface SerializedCheckpoint {
  data: string; // Base64 encoded (compressed or raw)
  compressed: boolean;
  sizeBytes: number;
  originalSizeBytes: number;
  compressionRatio: number;
  checksum: string;
  isIncremental: boolean;
  timestamp: number;
}

/**
 * Configuration for checkpoint serializer
 */
export interface CheckpointSerializerConfig {
  compressionEnabled?: boolean; // Default: true
  compressionLevel?: number; // 0-9, default: 6
  maxSizeBytes?: number; // Default: 1048576 (1MB)
  enableChecksums?: boolean; // Default: true
  enableIncrementalSerialization?: boolean; // Default: true
}

/**
 * Incremental diff for optimization
 */
interface StateDiff {
  added: any;
  modified: any;
  removed: string[];
}

// ===== CHECKPOINT SERIALIZER =====

/**
 * Serializes and compresses epic state for efficient checkpoint storage
 *
 * Features:
 * - Automatic compression with gzip (configurable level)
 * - Incremental serialization (only changed data)
 * - Size validation and warnings
 * - Checksum generation for integrity verification
 * - Performance tracking
 *
 * Usage:
 * ```typescript
 * const serializer = new CheckpointSerializer({
 *   compressionEnabled: true,
 *   compressionLevel: 6
 * });
 *
 * const serialized = await serializer.serialize(epicState);
 * const restored = await serializer.deserialize(serialized);
 * ```
 */
export class CheckpointSerializer {
  private logger: Logger;
  private config: Required<CheckpointSerializerConfig>;

  constructor(config: CheckpointSerializerConfig = {}) {
    this.logger = new Logger({ level: 'info', format: 'json', name: 'CheckpointSerializer' }, 'CheckpointSerializer');

    this.config = {
      compressionEnabled: config.compressionEnabled ?? true,
      compressionLevel: config.compressionLevel ?? 6,
      maxSizeBytes: config.maxSizeBytes || 1048576,
      enableChecksums: config.enableChecksums ?? true,
      enableIncrementalSerialization: config.enableIncrementalSerialization ?? true,
    };
  }

  /**
   * Serialize epic state to compressed checkpoint
   *
   * @param state Epic state to serialize
   * @param previousState Previous state for incremental serialization (optional)
   * @returns Serialized checkpoint data
   */
  async serialize(state: EpicState, previousState?: EpicState): Promise<SerializedCheckpoint> {
    const startTime = Date.now();

    try {
      // Determine if incremental serialization should be used
      const isIncremental = this.config.enableIncrementalSerialization && previousState !== undefined;

      // Get data to serialize (full or incremental)
      const dataToSerialize = isIncremental ? this.computeDiff(state, previousState!) : state;

      // Convert to JSON
      const jsonString = JSON.stringify(dataToSerialize);
      const originalSizeBytes = Buffer.byteLength(jsonString, 'utf8');

      // Compress if enabled
      let data: string;
      let compressed: boolean;
      let sizeBytes: number;

      if (this.config.compressionEnabled) {
        const buffer = Buffer.from(jsonString, 'utf8');
        const compressedBuffer = await gzipAsync(buffer, { level: this.config.compressionLevel });
        data = compressedBuffer.toString('base64');
        compressed = true;
        sizeBytes = compressedBuffer.length;
      } else {
        data = Buffer.from(jsonString, 'utf8').toString('base64');
        compressed = false;
        sizeBytes = originalSizeBytes;
      }

      // Calculate compression ratio
      const compressionRatio = originalSizeBytes / sizeBytes;

      // Generate checksum if enabled
      const checksum = this.config.enableChecksums ? this.generateChecksum(data) : '';

      // Validate size
      if (sizeBytes > this.config.maxSizeBytes) {
        this.logger.warn('Serialized checkpoint exceeds size limit', {
          sizeBytes,
          limit: this.config.maxSizeBytes,
          compressionRatio,
        });
      }

      const serializationTime = Date.now() - startTime;

      this.logger.debug('Checkpoint serialized', {
        sizeBytes,
        originalSizeBytes,
        compressionRatio: compressionRatio.toFixed(2),
        compressed,
        isIncremental,
        serializationTimeMs: serializationTime,
      });

      return {
        data,
        compressed,
        sizeBytes,
        originalSizeBytes,
        compressionRatio,
        checksum,
        isIncremental,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to serialize checkpoint', { error });
      throw error;
    }
  }

  /**
   * Deserialize checkpoint back to epic state
   *
   * @param serialized Serialized checkpoint data
   * @param baseState Base state for incremental deserialization (optional)
   * @returns Restored epic state
   */
  async deserialize(serialized: SerializedCheckpoint, baseState?: EpicState): Promise<EpicState> {
    const startTime = Date.now();

    try {
      // Verify checksum if enabled
      if (this.config.enableChecksums && serialized.checksum) {
        const computedChecksum = this.generateChecksum(serialized.data);
        if (computedChecksum !== serialized.checksum) {
          throw new Error('Checksum verification failed - data may be corrupted');
        }
      }

      // Decode from base64
      const buffer = Buffer.from(serialized.data, 'base64');

      // Decompress if needed
      let jsonString: string;
      if (serialized.compressed) {
        const decompressedBuffer = await gunzipAsync(buffer);
        jsonString = decompressedBuffer.toString('utf8');
      } else {
        jsonString = buffer.toString('utf8');
      }

      // Parse JSON
      const parsedData = JSON.parse(jsonString);

      // Apply diff if incremental
      let state: EpicState;
      if (serialized.isIncremental) {
        if (!baseState) {
          throw new Error('Base state required for incremental deserialization');
        }
        state = this.applyDiff(baseState, parsedData);
      } else {
        state = parsedData;
      }

      const deserializationTime = Date.now() - startTime;

      this.logger.debug('Checkpoint deserialized', {
        sizeBytes: serialized.sizeBytes,
        isIncremental: serialized.isIncremental,
        deserializationTimeMs: deserializationTime,
      });

      return state;
    } catch (error) {
      this.logger.error('Failed to deserialize checkpoint', { error });
      throw error;
    }
  }

  /**
   * Compute incremental diff between two states
   *
   * @param currentState Current state
   * @param previousState Previous state
   * @returns State diff
   */
  private computeDiff(currentState: EpicState, previousState: EpicState): StateDiff {
    const diff: StateDiff = {
      added: {},
      modified: {},
      removed: [],
    };

    // This is a simplified diff implementation
    // In production, consider using a library like jsondiffpatch for more efficient diffing

    // For now, we'll just track sprint-level changes
    const currentSprintIds = new Set(currentState.sprints.map((s) => s.sprintId));
    const previousSprintIds = new Set(previousState.sprints.map((s) => s.sprintId));

    // Find added sprints
    diff.added = {
      sprints: currentState.sprints.filter((s) => !previousSprintIds.has(s.sprintId)),
    };

    // Find modified sprints
    diff.modified = {
      sprints: currentState.sprints.filter((s) => {
        if (!previousSprintIds.has(s.sprintId)) return false;
        const prevSprint = previousState.sprints.find((ps) => ps.sprintId === s.sprintId);
        return JSON.stringify(s) !== JSON.stringify(prevSprint);
      }),
    };

    // Find removed sprints
    diff.removed = previousState.sprints.filter((s) => !currentSprintIds.has(s.sprintId)).map((s) => s.sprintId);

    // Include base epic metadata that always needs to be present
    diff.modified = {
      ...diff.modified,
      epicMetadata: {
        epicId: currentState.epicId,
        name: currentState.name,
        status: currentState.status,
        lastUpdateTime: currentState.lastUpdateTime,
      },
    };

    return diff;
  }

  /**
   * Apply diff to base state to reconstruct full state
   *
   * @param baseState Base state
   * @param diff State diff
   * @returns Reconstructed state
   */
  private applyDiff(baseState: EpicState, diff: StateDiff): EpicState {
    // Start with base state
    let state: EpicState = { ...baseState };

    // Apply epic metadata updates
    if (diff.modified.epicMetadata) {
      state = {
        ...state,
        ...diff.modified.epicMetadata,
      };
    }

    // Apply sprint changes
    let sprints = [...state.sprints];

    // Remove deleted sprints
    if (diff.removed.length > 0) {
      sprints = sprints.filter((s) => !diff.removed.includes(s.sprintId));
    }

    // Add new sprints
    if (diff.added.sprints) {
      sprints.push(...diff.added.sprints);
    }

    // Update modified sprints
    if (diff.modified.sprints) {
      for (const modifiedSprint of diff.modified.sprints) {
        const index = sprints.findIndex((s) => s.sprintId === modifiedSprint.sprintId);
        if (index !== -1) {
          sprints[index] = modifiedSprint;
        }
      }
    }

    state.sprints = sprints;

    return state;
  }

  /**
   * Generate simple checksum for data integrity verification
   *
   * @param data Data to checksum
   * @returns Checksum string
   */
  private generateChecksum(data: string): string {
    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Estimate size of serialized state (without actually serializing)
   *
   * @param state State to estimate
   * @returns Estimated size in bytes
   */
  estimateSize(state: EpicState): number {
    const jsonString = JSON.stringify(state);
    const sizeBytes = Buffer.byteLength(jsonString, 'utf8');

    // Apply estimated compression ratio (typically 2:1 to 3:1 for JSON)
    const estimatedCompressedSize = this.config.compressionEnabled ? sizeBytes / 2.5 : sizeBytes;

    return Math.ceil(estimatedCompressedSize);
  }
}
