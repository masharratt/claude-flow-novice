/**
 * Research Service Stub - Phase 1 Component Placeholder
 *
 * @module @claude-flow-novice/seo-analysis/lib/research-service
 * @description Temporary stub for Phase 1 integration (research-cache, rate-limiter, error-sanitizer)
 * @status PLACEHOLDER - Will be fully implemented in Phase 2 Sprint 4
 *
 * This module is a stub to allow Phase 2 testing to proceed without Phase 1 dependencies.
 * Full implementation deferred to Sprint 4 when MCP tool integration is complete.
 */
/**
 * Stub research result interface
 */
export interface ResearchResult {
    query: any;
    serpResults?: any[];
    contentResults?: any[];
    metadata?: any;
    timestamp: Date;
}
/**
 * Stub research service class - functional enough for testing
 */
export declare class ResearchService {
    constructor(config?: any);
    execute(query: any): Promise<ResearchResult>;
    getCacheStats(): {
        size: number;
        hits: number;
        misses: number;
    };
    getRateLimiterStats(): {
        websearch: {};
        webfetch: {};
    };
    clearCache(): Promise<void>;
    invalidateCacheByPattern(pattern: string): Promise<number>;
}
/**
 * Default research service instance
 */
export declare const researchService: ResearchService;
/**
 * Convenience function for SERP queries
 */
export declare function searchSerp(query: string, options?: any): Promise<ResearchResult>;
/**
 * Convenience function for content fetching
 */
export declare function fetchContent(url: string, options?: any): Promise<ResearchResult>;
/**
 * Convenience function for hybrid queries
 */
export declare function hybridResearch(query: string, targetUrl: string, options?: any): Promise<ResearchResult>;
//# sourceMappingURL=research-service.d.ts.map