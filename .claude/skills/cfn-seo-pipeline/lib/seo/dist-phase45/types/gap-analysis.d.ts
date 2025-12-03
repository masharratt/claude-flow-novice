/**
 * SEO Gap Analysis Type Definitions
 *
 * Type definitions for Phase 4-5: Content Gap Analysis and Opportunity Identification
 *
 * @module types/gap-analysis
 * @version 1.0.0
 */
/**
 * Competitor gap type
 */
export type CompetitorGapType = 'content_missing' | 'format_opportunity' | 'depth_improvement' | 'freshness_gap' | 'feature_gap' | 'backlink_opportunity' | 'entity_gap' | 'schema_gap';
/**
 * Gap opportunity priority level
 */
export type GapOpportunityPriority = 'critical' | 'high' | 'medium' | 'low';
/**
 * Gap opportunity status
 */
export type GapOpportunityStatus = 'identified' | 'validated' | 'prioritized' | 'assigned' | 'completed';
/**
 * Content gap detection
 */
export interface ContentGap {
    type: CompetitorGapType;
    description: string;
    competitorUrl?: string;
    competitorTitle?: string;
    keyword?: string;
    searchVolume?: number;
    difficulty?: number;
}
/**
 * Gap analysis result
 */
export interface GapAnalysisResult {
    targetKeyword: string;
    yourUrl?: string;
    competitorAnalyzed: number;
    gapsIdentified: ContentGap[];
    totalGapScore: number;
    averageGapScore: number;
    timestamp: Date;
}
/**
 * Opportunity gap data
 */
export interface GapOpportunity {
    id: string;
    type: CompetitorGapType;
    priority: GapOpportunityPriority;
    status: GapOpportunityStatus;
    keyword: string;
    estimatedTrafficValue?: number;
    difficulty?: number;
    recommendation: string;
    competitors: Array<{
        domain: string;
        url: string;
        rankPosition?: number;
    }>;
    implementationCost?: 'low' | 'medium' | 'high';
    implementationTime?: 'hours' | 'days' | 'weeks';
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Gap analysis cache entry
 */
export interface GapAnalysisCacheEntry {
    id: string;
    keyword: string;
    results: GapAnalysisResult;
    opportunities: GapOpportunity[];
    confidence: number;
    generatedAt: Date;
    expiresAt: Date;
}
//# sourceMappingURL=gap-analysis.d.ts.map