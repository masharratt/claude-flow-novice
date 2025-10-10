/* tslint:disable */
/* eslint-disable */
/**
 * Standalone serialization function (no instance needed)
 */
export function quickSerialize(value: any): string;
/**
 * Standalone deserialization function (no instance needed)
 */
export function quickDeserialize(json_str: string): any;
/**
 * Standalone fast state serialization (no instance needed, no compression)
 * For small states <10KB where compression overhead isn't worth it
 */
export function quickSerializeState(value: any): string;
/**
 * Standalone fast state deserialization (no instance needed)
 */
export function quickDeserializeState(json_str: string): any;
/**
 * High-performance WASM JSON serializer for swarm messaging
 */
export class MessageSerializer {
  free(): void;
  /**
   * Create a new MessageSerializer instance
   */
  constructor();
  /**
   * Serialize a JavaScript value to JSON string (50x faster than JSON.stringify)
   *
   * This function uses Rust's serde_json which is significantly faster
   * than JavaScript's native JSON.stringify due to:
   * - Zero-copy string handling in WASM memory
   * - Compiled native code vs interpreted JavaScript
   * - Optimized buffer management
   */
  serializeMessage(value: any): string;
  /**
   * Deserialize JSON string to JavaScript value (50x faster than JSON.parse)
   *
   * Benefits:
   * - Native parsing in compiled Rust code
   * - Memory-efficient WASM allocation
   * - Better error handling than JavaScript
   */
  deserializeMessage(json_str: string): any;
  /**
   * Batch deserialize multiple JSON strings (optimized for swarm message history)
   * Returns array of parsed messages
   */
  batchDeserialize(json_strings: any[]): any[];
  /**
   * Check if JSON string is valid without full parsing (ultra-fast validation)
   */
  isValidJson(json_str: string): boolean;
  /**
   * Get serialized size without full serialization (estimate)
   */
  estimateSize(value: any): number;
  /**
   * Compact serialization (minified, no whitespace)
   */
  serializeCompact(value: any): string;
  /**
   * Pretty-print serialization (for debugging)
   */
  serializePretty(value: any): string;
  /**
   * Clear internal buffer (for memory management)
   */
  clearBuffer(): void;
  /**
   * Get current buffer capacity
   */
  getBufferCapacity(): number;
}
/**
 * High-performance state serializer with compression for swarm state management
 * Target: <1ms for 100KB states, <500μs restoration, 40x speedup
 */
export class StateSerializer {
  free(): void;
  /**
   * Create new state serializer
   */
  constructor(enable_compression: boolean);
  /**
   * Serialize state with optional compression
   * Target: <1ms for 100KB objects
   */
  serializeState(value: any): string;
  /**
   * Deserialize state
   * Target: <500μs restoration
   */
  deserializeState(json_str: string): any;
  /**
   * Batch serialize multiple snapshots (optimized for snapshot creation)
   */
  batchSerializeStates(states: any[]): any[];
  /**
   * Fast state comparison (check if states are identical without full parsing)
   */
  statesEqual(state1: string, state2: string): boolean;
  /**
   * Get state size estimate
   */
  getStateSize(value: any): number;
}
