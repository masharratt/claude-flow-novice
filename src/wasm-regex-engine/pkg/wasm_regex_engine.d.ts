/* tslint:disable */
/* eslint-disable */
/**
 * Batch processor for parallel-style pattern matching
 */
export class BatchProcessor {
  free(): void;
  constructor();
  /**
   * Add a named pattern group
   */
  add_group(name: string, patterns: any[]): void;
  /**
   * Match content against a specific group
   */
  match_group(group_name: string, content: string): any;
  /**
   * Match content against all groups
   */
  match_all_groups(content: string): any;
  /**
   * Get group names
   */
  group_names(): any[];
}
/**
 * High-performance WASM regex engine with SIMD-like batch processing
 */
export class RegexEngine {
  free(): void;
  /**
   * Create a new regex engine with compiled patterns
   */
  constructor(patterns: any[]);
  /**
   * Fast batch matching - returns indices of matching patterns
   */
  match_indices(content: string): Uint32Array;
  /**
   * Check if any pattern matches (fastest check)
   */
  has_match(content: string): boolean;
  /**
   * Full match with details (positions, captured text)
   */
  match_all(content: string): any;
  /**
   * Count total matches across all patterns
   */
  count_matches(content: string): number;
  /**
   * Get pattern at index
   */
  get_pattern(index: number): string | undefined;
  /**
   * Get total pattern count
   */
  pattern_count(): number;
}
/**
 * Optimized single-pattern regex matcher
 */
export class SingleRegex {
  free(): void;
  constructor(pattern: string, flags?: string | null);
  test(content: string): boolean;
  find_all(content: string): any[];
  count(content: string): number;
}
