/**
 * Edge Case Deduplicator
 *
 * Handles deduplication of edge cases using SHA-256 signatures.
 * Normalizes context to detect similar errors with different IDs, timestamps, or numbers.
 */

import * as crypto from 'crypto';
import { EdgeCaseInput, EdgeCaseType } from '../types/edge-case.js';

export class EdgeCaseDeduplicator {
  /**
   * Generate SHA-256 signature for edge case deduplication
   *
   * Signature is based on:
   * - Type
   * - Category
   * - Normalized error message
   * - Normalized stack trace
   *
   * @param edgeCase Edge case input
   * @returns SHA-256 signature (64 hex characters)
   */
  public generateSignature(edgeCase: EdgeCaseInput): string {
    const normalizedContext = this.normalizeContext(edgeCase.context);

    const signatureData = {
      type: edgeCase.type,
      category: edgeCase.category,
      context: normalizedContext
    };

    const signatureString = JSON.stringify(signatureData);
    const hash = crypto.createHash('sha256');
    hash.update(signatureString);

    return hash.digest('hex');
  }

  /**
   * Normalize context for deduplication
   *
   * Replaces variable data with placeholders:
   * - Dates/timestamps → {date}
   * - IDs (hex, alphanumeric) → {id}
   * - Numbers → {number}
   * - File paths → normalized paths
   * - Line numbers in stack traces → {line}
   *
   * @param context Edge case context object
   * @returns Normalized JSON string
   */
  public normalizeContext(context: any): string {
    const normalized = this.deepNormalize(context);
    return JSON.stringify(normalized, null, 0);
  }

  /**
   * Normalize stack trace for deduplication
   *
   * Removes:
   * - Line numbers
   * - Column numbers
   * - Absolute file paths (keep relative paths)
   * - Memory addresses
   *
   * @param stackTrace Stack trace string
   * @returns Normalized stack trace
   */
  public normalizeStackTrace(stackTrace: string): string {
    let normalized = stackTrace;

    // Normalize line and column numbers: ":42:10" → ":{line}:{col}"
    normalized = normalized.replace(/:(\d+):(\d+)/g, ':{line}:{col}');

    // Normalize single line numbers: ":42)" → ":{line})"
    normalized = normalized.replace(/:(\d+)\)/g, ':{line})');

    // Normalize absolute paths to relative
    // /app/src/file.js → src/file.js
    // /home/user/project/file.js → file.js
    normalized = normalized.replace(/\/[a-zA-Z0-9_\-\/]+\//g, (match) => {
      // Keep only the last 2 path segments
      const segments = match.split('/').filter(s => s.length > 0);
      return segments.slice(-2).join('/') + '/';
    });

    // Normalize memory addresses: 0x7f1234567890 → {addr}
    normalized = normalized.replace(/0x[0-9a-f]+/gi, '{addr}');

    return normalized;
  }

  /**
   * Deep normalize an object or string
   *
   * Recursively processes objects and arrays,
   * normalizing strings at leaf nodes.
   */
  private deepNormalize(value: any): any {
    if (typeof value === 'string') {
      return this.normalizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.deepNormalize(item));
    }

    if (typeof value === 'object' && value !== null) {
      const normalized: any = {};

      // Special handling for error objects
      if (value.message !== undefined) {
        normalized.message = this.normalizeString(value.message);
      }

      if (value.stack !== undefined) {
        normalized.stack = this.normalizeStackTrace(value.stack);
      }

      // Normalize other properties
      for (const key of Object.keys(value)) {
        if (key !== 'message' && key !== 'stack') {
          normalized[key] = this.deepNormalize(value[key]);
        }
      }

      // Sort keys for consistent hashing
      const sorted: any = {};
      Object.keys(normalized).sort().forEach(key => {
        sorted[key] = normalized[key];
      });

      return sorted;
    }

    // Numbers, booleans, null stay as-is for non-string normalization
    // but we track them as {number} etc. in strings
    return value;
  }

  /**
   * Normalize a string by replacing variable data with placeholders
   */
  private normalizeString(str: string): string {
    let normalized = str;

    // Normalize ISO 8601 dates/timestamps
    // 2025-11-16T13:00:00Z → {date}
    // 2025-11-16T13:00:00.123Z → {date}
    // 2025-11-16 13:00:00 → {date}
    normalized = normalized.replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?/g, '{date}');

    // Normalize standalone dates
    // 2025-11-16 → {date}
    normalized = normalized.replace(/\d{4}-\d{2}-\d{2}/g, '{date}');

    // Normalize Unix timestamps (10 digits)
    // 1700000000 → {timestamp}
    normalized = normalized.replace(/\b\d{10}\b/g, '{timestamp}');

    // Normalize UUIDs
    // 550e8400-e29b-41d4-a716-446655440000 → {uuid}
    normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}');

    // Normalize hex IDs (8+ hex characters)
    // abc123def456 → {id}
    normalized = normalized.replace(/\b[a-f0-9]{8,}\b/gi, '{id}');

    // Normalize task/agent IDs with prefixes
    // task-abc123, agent-xyz789, cfn-cli-1234567 → {id}
    normalized = normalized.replace(/(?:task|agent|cfn|job|run|session)-[a-z0-9\-]+/gi, '{id}');

    // Normalize user/resource IDs in paths
    // /api/users/12345 → /api/users/{id}
    // /tasks/abc123/status → /tasks/{id}/status
    normalized = normalized.replace(/\/([a-z0-9\-]+)(?=\/|$)/gi, (match, id) => {
      // Only replace if it looks like an ID (contains numbers or is hex)
      if (/\d/.test(id) || /^[a-f0-9]+$/i.test(id)) {
        return '/{id}';
      }
      return match;
    });

    // Normalize standalone numbers
    // "Error 500", "timeout after 5000ms", "user 12345" → "Error {number}", etc.
    normalized = normalized.replace(/\b\d+\b/g, '{number}');

    // Normalize memory addresses
    // 0x7f1234567890 → {addr}
    normalized = normalized.replace(/0x[0-9a-f]+/gi, '{addr}');

    // Normalize file paths with line numbers
    // /app/file.js:42 → /app/file.js:{line}
    normalized = normalized.replace(/:(\d+)(?::(\d+))?/g, ':{line}');

    return normalized;
  }

  /**
   * Check if two edge cases are similar based on their signatures
   *
   * @param signature1 First signature
   * @param signature2 Second signature
   * @returns True if signatures match
   */
  public areSimilar(signature1: string, signature2: string): boolean {
    return signature1 === signature2;
  }

  /**
   * Calculate similarity score between two contexts (for fuzzy matching)
   *
   * This is for future enhancement - currently we use exact signature matching.
   * Could be used for "similar but not identical" edge case detection.
   *
   * @param context1 First context
   * @param context2 Second context
   * @returns Similarity score (0.0 to 1.0)
   */
  public calculateSimilarity(context1: any, context2: any): number {
    const norm1 = this.normalizeContext(context1);
    const norm2 = this.normalizeContext(context2);

    // Simple Jaccard similarity on normalized strings
    const set1 = new Set(norm1.split(/\s+/));
    const set2 = new Set(norm2.split(/\s+/));

    const intersection = new Set(Array.from(set1).filter(x => set2.has(x)));
    const union = new Set([...Array.from(set1), ...Array.from(set2)]);

    return intersection.size / union.size;
  }

  /**
   * Extract common pattern from multiple edge cases
   *
   * For future pattern detection feature.
   *
   * @param edgeCases Array of edge case inputs
   * @returns Common pattern descriptor
   */
  public extractPattern(edgeCases: EdgeCaseInput[]): any {
    // Future implementation: extract common error patterns
    // For now, return basic statistics

    const types = new Map<EdgeCaseType, number>();
    const categories = new Map<string, number>();

    for (const edgeCase of edgeCases) {
      types.set(edgeCase.type, (types.get(edgeCase.type) || 0) + 1);
      categories.set(edgeCase.category, (categories.get(edgeCase.category) || 0) + 1);
    }

    return {
      commonType: this.findMostCommon(types),
      commonCategory: this.findMostCommon(categories),
      totalCases: edgeCases.length
    };
  }

  /**
   * Find most common value in a map
   */
  private findMostCommon<K>(map: Map<K, number>): K | null {
    let maxCount = 0;
    let maxKey: K | null = null;

    for (const [key, count] of Array.from(map.entries())) {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    }

    return maxKey;
  }
}
