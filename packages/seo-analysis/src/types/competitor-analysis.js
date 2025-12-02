"use strict";
/**
 * Competitor Deep Analysis Type Definitions
 *
 * @module planning/seo/types/competitor-analysis
 * @description Type definitions for deep competitor analysis (Phase 2 Sprint 1)
 * @version 2.0.0
 *
 * Provides comprehensive types for:
 * - Site-wide crawling and analysis (50+ pages)
 * - Hub page identification algorithms
 * - Site architecture pattern extraction
 * - Content strategy analysis
 * - Internal linking pattern analysis
 * - Content gap identification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompetitorAnalysisError = exports.CompetitorAnalysisErrorCode = void 0;
exports.isSuccessfulCrawl = isSuccessfulCrawl;
exports.isHubPage = isHubPage;
exports.isHighPriorityGap = isHighPriorityGap;
exports.isHighConfidencePattern = isHighConfidencePattern;
// ============================================================================
// ERROR TYPES
// ============================================================================
/**
 * Competitor analysis error codes
 */
var CompetitorAnalysisErrorCode;
(function (CompetitorAnalysisErrorCode) {
    CompetitorAnalysisErrorCode["INVALID_DOMAIN"] = "INVALID_DOMAIN";
    CompetitorAnalysisErrorCode["FIRECRAWL_API_ERROR"] = "FIRECRAWL_API_ERROR";
    CompetitorAnalysisErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    CompetitorAnalysisErrorCode["CRAWL_TIMEOUT"] = "CRAWL_TIMEOUT";
    CompetitorAnalysisErrorCode["INSUFFICIENT_DATA"] = "INSUFFICIENT_DATA";
    CompetitorAnalysisErrorCode["ANALYSIS_FAILED"] = "ANALYSIS_FAILED";
})(CompetitorAnalysisErrorCode || (exports.CompetitorAnalysisErrorCode = CompetitorAnalysisErrorCode = {}));
/**
 * Competitor analysis error
 */
class CompetitorAnalysisError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'CompetitorAnalysisError';
        Object.setPrototypeOf(this, CompetitorAnalysisError.prototype);
    }
}
exports.CompetitorAnalysisError = CompetitorAnalysisError;
// ============================================================================
// TYPE GUARDS
// ============================================================================
/**
 * Type guard: Check if result is a successful crawl
 */
function isSuccessfulCrawl(result) {
    return result.success && result.page !== undefined;
}
/**
 * Type guard: Check if page is a hub page (by confidence threshold)
 */
function isHubPage(metadata, minConfidence = 0.75) {
    return metadata.confidence >= minConfidence;
}
/**
 * Type guard: Check if content gap is high priority
 */
function isHighPriorityGap(gap) {
    return gap.priority === 'high' && gap.opportunityScore >= 0.7;
}
/**
 * Type guard: Check if pattern is high confidence
 */
function isHighConfidencePattern(pattern, minConfidence = 0.8) {
    return pattern.confidence >= minConfidence;
}
//# sourceMappingURL=competitor-analysis.js.map