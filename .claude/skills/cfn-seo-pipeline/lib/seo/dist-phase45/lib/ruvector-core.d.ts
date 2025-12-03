/**
 * RuVector Core Module - Type-Safe Implementation
 *
 * Provides mock implementations of RuVector VectorDB for development and testing.
 * This module is a stub for Phase 4-5 integration with actual RuVector library.
 *
 * @module lib/ruvector-core
 * @version 1.0.0
 */
import type { VectorDB, VectorEntry, VectorQueryOptions, EmbeddingFunction, VectorDBFactory } from '../types/ruvector-core';
/**
 * Mock VectorDB implementation for development
 */
export declare class MockVectorDB implements VectorDB {
    private store;
    private name;
    constructor(name: string);
    add(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
    query(text: string, options?: VectorQueryOptions): Promise<VectorEntry[]>;
    update(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
    delete(id: string): Promise<void>;
    exists(id: string): Promise<boolean>;
    clear(): Promise<void>;
    /**
     * Mock similarity calculation using string overlap
     */
    private calculateSimilarity;
}
/**
 * Mock VectorDB factory
 */
export declare class MockVectorDBFactory implements VectorDBFactory {
    private dbs;
    create(name: string): Promise<VectorDB>;
    get(name: string): VectorDB | null;
    delete(name: string): Promise<void>;
}
/**
 * Global VectorDB factory instance
 */
export declare const vectorDBFactory: MockVectorDBFactory;
/**
 * Create or get a VectorDB instance
 */
export declare function createVectorDB(name: string): Promise<VectorDB>;
/**
 * Mock embedding function for development
 */
export declare const mockEmbeddingFunction: EmbeddingFunction;
//# sourceMappingURL=ruvector-core.d.ts.map