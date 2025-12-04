/**
 * Shared utilities for GNN operations
 *
 * This module provides common hash and vector math functions used across
 * all 5 GNN modules. Eliminates duplication and ensures consistency.
 */

/**
 * Hash a string to a deterministic integer
 * Used for stable node ID generation across GNN modules
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Vector math utilities for GNN message passing
 */
export class VectorMath {
  /**
   * Multiply vector by scalar
   */
  static scalarMultiply(vector: Float32Array, scalar: number): Float32Array {
    const result = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      result[i] = vector[i] * scalar;
    }
    return result;
  }

  /**
   * Add two vectors with weight interpolation
   * result[i] = a[i] * (1 - weight) + b[i] * weight
   */
  static addVectors(a: Float32Array, b: Float32Array, weight: number): Float32Array {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    const result = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] * (1 - weight) + b[i] * weight;
    }
    return result;
  }

  /**
   * Compute mean aggregation of message vectors
   */
  static meanAggregation(messages: number[][]): number[] {
    if (messages.length === 0) {
      throw new Error('Cannot aggregate empty vector list');
    }

    const dim = messages[0].length;
    const result = new Array(dim).fill(0);

    for (const msg of messages) {
      if (msg.length !== dim) {
        throw new Error(`Vector dimension mismatch in aggregation: expected ${dim}, got ${msg.length}`);
      }
      for (let i = 0; i < dim; i++) {
        result[i] += msg[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      result[i] /= messages.length;
    }

    return result;
  }

  /**
   * Normalize vector to unit length
   */
  static normalizeVector(vector: Float32Array): Float32Array {
    let magnitude = 0;
    for (let i = 0; i < vector.length; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude === 0) {
      return new Float32Array(vector.length); // Zero vector
    }

    const result = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      result[i] = vector[i] / magnitude;
    }
    return result;
  }

  /**
   * Compute dot product of two vectors
   */
  static dotProduct(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result += a[i] * b[i];
    }
    return result;
  }
}
