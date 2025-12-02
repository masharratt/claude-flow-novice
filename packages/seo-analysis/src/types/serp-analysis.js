"use strict";
/**
 * SERP Pattern Analysis Type Definitions
 *
 * @module @claude-flow-novice/seo-analysis/types/serp-analysis
 * @description Type definitions for SERP pattern analysis (Phase 2 Sprint 2)
 * @version 1.0.0
 *
 * Provides comprehensive types for:
 * - SERP feature detection (featured snippets, PAA, knowledge panels)
 * - Ranking pattern analysis across top 10 results
 * - Semantic clustering and topic extraction
 * - Actionable recommendation generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERPAnalysisError = exports.SERPAnalysisErrorCode = exports.RecommendationType = exports.FreshnessSignal = exports.ContentType = exports.FeaturedSnippetType = exports.SERPFeatureType = void 0;
exports.isSuccessfulGoogleSearch = isSuccessfulGoogleSearch;
exports.isSuccessfulDataForSEOSearch = isSuccessfulDataForSEOSearch;
/**
 * SERP feature types that can be detected
 */
var SERPFeatureType;
(function (SERPFeatureType) {
    SERPFeatureType["FEATURED_SNIPPET"] = "featured_snippet";
    SERPFeatureType["PEOPLE_ALSO_ASK"] = "people_also_ask";
    SERPFeatureType["KNOWLEDGE_PANEL"] = "knowledge_panel";
    SERPFeatureType["IMAGE_PACK"] = "image_pack";
    SERPFeatureType["VIDEO_CAROUSEL"] = "video_carousel";
    SERPFeatureType["LOCAL_PACK"] = "local_pack";
    SERPFeatureType["SHOPPING_RESULTS"] = "shopping_results";
    SERPFeatureType["RELATED_SEARCHES"] = "related_searches";
    SERPFeatureType["TOP_STORIES"] = "top_stories";
    SERPFeatureType["SITE_LINKS"] = "site_links";
    SERPFeatureType["TWITTER_CAROUSEL"] = "twitter_carousel";
    SERPFeatureType["RECIPES"] = "recipes";
    SERPFeatureType["FLIGHTS"] = "flights";
    SERPFeatureType["HOTELS"] = "hotels";
    SERPFeatureType["JOBS"] = "jobs";
    SERPFeatureType["EVENTS"] = "events";
})(SERPFeatureType || (exports.SERPFeatureType = SERPFeatureType = {}));
/**
 * Featured snippet subtypes
 */
var FeaturedSnippetType;
(function (FeaturedSnippetType) {
    FeaturedSnippetType["PARAGRAPH"] = "paragraph";
    FeaturedSnippetType["LIST"] = "list";
    FeaturedSnippetType["TABLE"] = "table";
    FeaturedSnippetType["VIDEO"] = "video";
})(FeaturedSnippetType || (exports.FeaturedSnippetType = FeaturedSnippetType = {}));
/**
 * Content type classification
 */
var ContentType;
(function (ContentType) {
    ContentType["BLOG"] = "blog";
    ContentType["PRODUCT"] = "product";
    ContentType["GUIDE"] = "guide";
    ContentType["NEWS"] = "news";
    ContentType["VIDEO"] = "video";
    ContentType["LANDING_PAGE"] = "landing_page";
    ContentType["FORUM"] = "forum";
    ContentType["DOCUMENTATION"] = "documentation";
    ContentType["ECOMMERCE"] = "ecommerce";
    ContentType["SOCIAL"] = "social";
    ContentType["OTHER"] = "other";
})(ContentType || (exports.ContentType = ContentType = {}));
/**
 * Freshness signal types
 */
var FreshnessSignal;
(function (FreshnessSignal) {
    FreshnessSignal["DATE_IN_TITLE"] = "date_in_title";
    FreshnessSignal["DATE_IN_URL"] = "date_in_url";
    FreshnessSignal["RECENT_PUBLICATION"] = "recent_publication";
    FreshnessSignal["FREQUENT_UPDATES"] = "frequent_updates";
    FreshnessSignal["NEWS_ARTICLE"] = "news_article";
    FreshnessSignal["NONE"] = "none";
})(FreshnessSignal || (exports.FreshnessSignal = FreshnessSignal = {}));
/**
 * Recommendation type
 */
var RecommendationType;
(function (RecommendationType) {
    RecommendationType["SERP_FEATURE"] = "serp_feature";
    RecommendationType["CONTENT_STRUCTURE"] = "content_structure";
    RecommendationType["KEYWORD_VARIATION"] = "keyword_variation";
    RecommendationType["COMPETITIVE_POSITIONING"] = "competitive_positioning";
    RecommendationType["TECHNICAL_SEO"] = "technical_seo";
    RecommendationType["CONTENT_STRATEGY"] = "content_strategy";
})(RecommendationType || (exports.RecommendationType = RecommendationType = {}));
// ============================================================================
// ERROR HANDLING
// ============================================================================
/**
 * SERP analysis error codes
 */
var SERPAnalysisErrorCode;
(function (SERPAnalysisErrorCode) {
    SERPAnalysisErrorCode["INVALID_KEYWORD"] = "INVALID_KEYWORD";
    SERPAnalysisErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
    SERPAnalysisErrorCode["API_KEY_MISSING"] = "API_KEY_MISSING";
    SERPAnalysisErrorCode["API_REQUEST_FAILED"] = "API_REQUEST_FAILED";
    SERPAnalysisErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    SERPAnalysisErrorCode["TIMEOUT"] = "TIMEOUT";
    SERPAnalysisErrorCode["PARSE_ERROR"] = "PARSE_ERROR";
    SERPAnalysisErrorCode["INSUFFICIENT_DATA"] = "INSUFFICIENT_DATA";
    SERPAnalysisErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
})(SERPAnalysisErrorCode || (exports.SERPAnalysisErrorCode = SERPAnalysisErrorCode = {}));
/**
 * SERP analysis error
 */
class SERPAnalysisError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'SERPAnalysisError';
        Object.setPrototypeOf(this, SERPAnalysisError.prototype);
    }
}
exports.SERPAnalysisError = SERPAnalysisError;
// ============================================================================
// UTILITY TYPES
// ============================================================================
/**
 * Type guard for successful Google search response
 */
function isSuccessfulGoogleSearch(response) {
    return !response.error && Array.isArray(response.items) && response.items.length > 0;
}
/**
 * Type guard for successful DataForSEO response
 */
function isSuccessfulDataForSEOSearch(response) {
    return (Array.isArray(response.tasks) &&
        response.tasks.length > 0 &&
        response.tasks[0].status_code === 20000 &&
        Array.isArray(response.tasks[0].result) &&
        response.tasks[0].result.length > 0 &&
        Array.isArray(response.tasks[0].result[0].items) &&
        response.tasks[0].result[0].items.length > 0);
}
//# sourceMappingURL=serp-analysis.js.map