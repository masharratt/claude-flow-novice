/**
 * DataForSEO API Type Definitions
 *
 * Type definitions for DataForSEO API responses used in Phase 4-5 research operations.
 * Covers keyword research, SERP analysis, and rank tracking data.
 *
 * @module types/dataforseo-api
 * @version 1.0.0
 */
/**
 * DataForSEO search intent type
 */
export type SearchIntentType = 'informational' | 'navigational' | 'commercial' | 'transactional';
/**
 * Keyword research data from DataForSEO
 */
export interface DataForSEOKeywordData {
    keyword: string;
    search_volume: number;
    cpc: number;
    competition: number;
    search_intent_type: SearchIntentType;
    keyword_difficulty: number;
    monthly_searches: Array<{
        month: number;
        year: number;
        search_volume: number;
    }>;
}
/**
 * SERP result item
 */
export interface DataForSEOSERPResult {
    rank: number;
    title: string;
    description: string;
    url: string;
    domain: string;
    type: 'organic' | 'featured_snippet' | 'knowledge_panel' | 'people_also_ask';
    timestamp: Date;
    position?: number;
}
/**
 * SERP analysis response
 */
export interface DataForSEOSERPAnalysis {
    keyword: string;
    location: string;
    language: string;
    search_engine: string;
    results_count: number;
    serp_items: DataForSEOSERPResult[];
    featured_snippet?: {
        title: string;
        description: string;
        url: string;
        domain: string;
    };
    people_also_ask?: Array<{
        question: string;
        answers: Array<{
            title: string;
            url: string;
            domain: string;
        }>;
    }>;
    related_searches?: string[];
}
/**
 * Rank tracking position
 */
export interface DataForSEORankPosition {
    keyword: string;
    current_position: number;
    previous_position?: number;
    url: string;
    rank_group: number;
    featured_rank?: boolean;
    is_paid: boolean;
    timestamp: Date;
}
/**
 * Backlink data from DataForSEO
 */
export interface DataForSEOBacklinkData {
    source_url: string;
    target_url: string;
    anchor_text: string;
    domain_rating: number;
    referring_domain: string;
    first_seen: Date;
    last_seen: Date;
    link_type: 'internal' | 'external' | 'redirect';
}
/**
 * DataForSEO API error response
 */
export interface DataForSEOErrorResponse {
    status_code: number;
    status_message: string;
    time: string;
}
/**
 * DataForSEO API successful response wrapper
 */
export interface DataForSEOAPIResponse<T> {
    status_code: number;
    status_message: string;
    time: string;
    data: T;
}
/**
 * Cached DataForSEO research
 */
export interface CachedDataForSEOResearch {
    requestId: string;
    keyword: string;
    dataType: 'keyword_research' | 'serp_analysis' | 'rank_tracking' | 'backlink_analysis';
    response: unknown;
    apiResponseTime: number;
    cachedAt: Date;
    expiresAt: Date;
    reliability: number;
}
//# sourceMappingURL=dataforseo-api.d.ts.map