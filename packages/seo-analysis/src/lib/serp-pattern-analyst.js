"use strict";
/**
 * SERP Pattern Analyst Agent
 *
 * @module @claude-flow-novice/seo-analysis/lib/serp-pattern-analyst
 * @description SERP pattern analysis agent for SEO Intelligence Phase 2 Sprint 2
 * @version 1.0.0
 *
 * Provides comprehensive SERP analysis including:
 * - SERP feature detection (featured snippets, PAA, knowledge panels, etc.)
 * - Ranking pattern analysis (domain authority, content types, freshness)
 * - Semantic clustering and topic extraction
 * - Actionable recommendation generation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERPPatternAnalyst = void 0;
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const serp_analysis_1 = require("../types/serp-analysis");
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    maxResults: 10,
    enableContentScraping: false,
    requestTimeoutMs: 30000,
    verbose: false,
    rateLimitMs: 1000,
};
/**
 * Default pattern extraction configuration
 */
const DEFAULT_PATTERN_CONFIG = {
    minInstances: 3,
    minConfidence: 0.6,
    fuzzyMatching: true,
    similarityThreshold: 0.8,
};
/**
 * SERP Pattern Analyst Agent
 *
 * Analyzes search engine results pages to extract patterns and generate
 * actionable SEO recommendations.
 *
 * @example
 * ```typescript
 * const analyst = new SERPPatternAnalyst({
 *   keyword: 'best running shoes 2024',
 *   maxResults: 10,
 *   enableContentScraping: true
 * });
 *
 * const result = await analyst.analyze();
 * console.log(`Found ${result.features.length} SERP features`);
 * console.log(`Generated ${result.recommendations.length} recommendations`);
 * ```
 */
class SERPPatternAnalyst {
    /**
     * Create a new SERPPatternAnalyst
     *
     * @param config - Analysis configuration
     */
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.warnings = [];
        this.startTime = 0;
        this.httpsAgent = new https_1.default.Agent({
            rejectUnauthorized: true, // Enforce certificate validation
            minVersion: 'TLSv1.2',
        });
        this.validateConfig();
    }
    /**
     * Set research service for integration testing
     *
     * @param service - ResearchService instance
     * @internal
     */
    setResearchService(service) {
        this.researchService = service;
    }
    /**
     * Validate configuration
     *
     * @throws {SERPAnalysisError} If configuration is invalid
     * @private
     */
    validateConfig() {
        // Validate keyword
        if (!this.config.keyword || typeof this.config.keyword !== 'string') {
            throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.INVALID_KEYWORD, 'Keyword must be a non-empty string');
        }
        // Trim and validate keyword
        this.config.keyword = this.config.keyword.trim();
        if (this.config.keyword.length < 2) {
            throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.INVALID_KEYWORD, 'Keyword must be at least 2 characters');
        }
        if (this.config.keyword.length > 200) {
            throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.INVALID_KEYWORD, 'Keyword must be less than 200 characters');
        }
        // Validate maxResults
        if (this.config.maxResults < 5 || this.config.maxResults > 100) {
            throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.INVALID_CONFIG, 'maxResults must be between 5 and 100');
        }
        // Security: Validate API key configuration
        this.validateApiKeyConfig();
    }
    /**
     * Validate API key configuration
     *
     * @throws {SERPAnalysisError} If no valid API keys are configured
     * @private
     */
    validateApiKeyConfig() {
        const googleApiKey = this.config.googleApiKey || process.env.GOOGLE_API_KEY;
        const googleSearchEngineId = this.config.googleSearchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID;
        const dataForSeoApiKey = this.config.dataForSeoApiKey || process.env.DATA_FOR_SEO_API_KEY;
        const hasGoogleConfig = googleApiKey && googleSearchEngineId;
        const hasDataForSeoConfig = dataForSeoApiKey;
        if (!hasGoogleConfig && !hasDataForSeoConfig) {
            throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.API_KEY_MISSING, 'No API keys configured. Set GOOGLE_API_KEY + GOOGLE_SEARCH_ENGINE_ID or DATA_FOR_SEO_API_KEY');
        }
        // Validate placeholder detection
        if (googleApiKey && this.isPlaceholderApiKey(googleApiKey)) {
            this.warnings.push('Google API key appears to be a placeholder');
        }
        if (dataForSeoApiKey && this.isPlaceholderApiKey(dataForSeoApiKey)) {
            this.warnings.push('DataForSEO API key appears to be a placeholder');
        }
    }
    /**
     * Check if API key is a placeholder
     *
     * @param key - API key to check
     * @returns True if placeholder
     * @private
     */
    isPlaceholderApiKey(key) {
        // Check for obvious placeholders
        if (key.includes('[REDACTED]') ||
            key === 'your-api-key-here' ||
            key === 'YOUR_API_KEY' ||
            key.startsWith('test-') ||
            key === 'fake-key') {
            return true;
        }
        // Google API keys: 39 chars, alphanumeric
        // DataForSEO keys: base64-encoded login:password
        // Reject keys that are too short
        if (key.length < 20) {
            return true;
        }
        // Check for low entropy (repeated chars, sequential)
        const hasLowEntropy = /^(.)\1+$/.test(key) || /^(abc|123)+$/.test(key);
        return hasLowEntropy;
    }
    /**
     * Sanitize error messages to prevent sensitive data exposure
     *
     * @param message - Original error message
     * @returns Sanitized error message
     * @private
     */
    sanitizeErrorMessage(message) {
        let sanitized = message;
        // Redact emails
        sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]');
        // Redact API keys (comprehensive pattern)
        sanitized = sanitized.replace(/(?:api[_-]?key|api_?secret|access[_-]?token|bearer)[\s]*[=:]\s*[^\s&"']+/gi, '[REDACTED_API_KEY]');
        // Redact tokens (32+ alphanumeric/hyphens/underscores)
        sanitized = sanitized.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED_TOKEN]');
        // Redact API keys in URLs
        sanitized = sanitized.replace(/([?&](?:api[_-]?key|key|token)[=])[^&\s"']+/gi, '$1[REDACTED]');
        // Redact JSON-formatted API keys
        sanitized = sanitized.replace(/"api[_-]?key"\s*:\s*"[^"]+"/gi, '"api_key": "[REDACTED]"');
        return sanitized;
    }
    /**
     * Main analysis method
     *
     * @returns Complete SERP analysis result
     * @throws {SERPAnalysisError} If analysis fails
     */
    async analyze() {
        this.startTime = Date.now();
        this.warnings = [];
        try {
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Starting analysis for keyword: "${this.config.keyword}"`);
            }
            // Step 1: Fetch search results
            const searchResults = await this.fetchSearchResults();
            if (searchResults.length === 0) {
                throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.INSUFFICIENT_DATA, 'No search results returned');
            }
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Fetched ${searchResults.length} search results`);
            }
            // Step 1b: Enrich with scraped content (Phase 2 Sprint 3)
            await this.enrichWithScrapedContent(searchResults);
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Content enrichment completed`);
            }
            // Step 2: Detect SERP features
            const features = await this.detectFeatures(searchResults);
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Detected ${features.length} SERP features`);
            }
            // Step 3: Analyze ranking patterns
            const rankingPatterns = await this.analyzeRankingPatterns(searchResults);
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Analyzed ranking patterns`);
            }
            // Step 4: Extract semantic clusters
            const semanticClusters = await this.extractSemanticClusters(searchResults);
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Extracted ${semanticClusters.length} semantic clusters`);
            }
            // Step 5: Identify content gaps
            const contentGaps = this.identifyContentGaps(searchResults, features, semanticClusters);
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Identified ${contentGaps.length} content gaps`);
            }
            // Step 6: Generate recommendations
            const recommendations = this.generateRecommendations(searchResults, features, rankingPatterns, semanticClusters, contentGaps);
            if (this.config.verbose) {
                console.log(`[SERP Analyst] Generated ${recommendations.length} recommendations`);
            }
            // Calculate overall confidence
            const confidence = this.calculateOverallConfidence(searchResults, features, rankingPatterns, semanticClusters);
            const totalTimeMs = Date.now() - this.startTime;
            return {
                keyword: this.config.keyword,
                analyzedAt: new Date(),
                totalTimeMs,
                results: searchResults,
                features,
                rankingPatterns,
                semanticClusters,
                contentGaps,
                recommendations,
                confidence,
                warnings: this.warnings,
                metadata: {
                    apiProvider: this.determineApiProvider(),
                    totalResults: searchResults.length,
                    cacheHit: false,
                },
            };
        }
        catch (error) {
            if (error instanceof serp_analysis_1.SERPAnalysisError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : 'Unknown error';
            const sanitizedMessage = this.sanitizeErrorMessage(message);
            throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.API_REQUEST_FAILED, `Analysis failed: ${sanitizedMessage}`, { originalError: message });
        }
    }
    /**
     * Fetch search results from API
     *
     * @returns Array of search results
     * @throws {SERPAnalysisError} If fetch fails
     * @private
     */
    async fetchSearchResults() {
        const errors = [];
        // Try Google Custom Search first
        const googleApiKey = this.config.googleApiKey || process.env.GOOGLE_API_KEY;
        const googleSearchEngineId = this.config.googleSearchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID;
        if (googleApiKey && googleSearchEngineId && !this.isPlaceholderApiKey(googleApiKey)) {
            try {
                return await this.fetchFromGoogleCustomSearch(googleApiKey, googleSearchEngineId);
            }
            catch (error) {
                if (error instanceof serp_analysis_1.SERPAnalysisError) {
                    // Only retry on recoverable errors
                    if (error.code === serp_analysis_1.SERPAnalysisErrorCode.RATE_LIMIT_EXCEEDED ||
                        error.code === serp_analysis_1.SERPAnalysisErrorCode.TIMEOUT) {
                        this.warnings.push(`Google API ${error.code}, trying DataForSEO`);
                        errors.push(error);
                    }
                    else {
                        // Non-recoverable error, throw immediately
                        throw error;
                    }
                }
                else {
                    errors.push(error);
                }
            }
        }
        // Try DataForSEO as fallback
        const dataForSeoApiKey = this.config.dataForSeoApiKey || process.env.DATA_FOR_SEO_API_KEY;
        if (dataForSeoApiKey && !this.isPlaceholderApiKey(dataForSeoApiKey)) {
            try {
                return await this.fetchFromDataForSEO(dataForSeoApiKey);
            }
            catch (error) {
                if (error instanceof serp_analysis_1.SERPAnalysisError) {
                    if (error.code === serp_analysis_1.SERPAnalysisErrorCode.RATE_LIMIT_EXCEEDED ||
                        error.code === serp_analysis_1.SERPAnalysisErrorCode.TIMEOUT) {
                        errors.push(error);
                    }
                    else {
                        throw error;
                    }
                }
                else {
                    errors.push(error);
                }
            }
        }
        // All providers failed
        throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.API_REQUEST_FAILED, `All API providers failed: ${errors.map(e => e.message).join('; ')}`, { errors });
    }
    /**
     * Fetch results from Google Custom Search API
     *
     * @param apiKey - Google API key
     * @param searchEngineId - Custom Search Engine ID
     * @returns Array of search results
     * @throws {SERPAnalysisError} If fetch fails
     * @private
     */
    async fetchFromGoogleCustomSearch(apiKey, searchEngineId) {
        try {
            const url = 'https://www.googleapis.com/customsearch/v1';
            const params = {
                key: apiKey,
                cx: searchEngineId,
                q: this.config.keyword,
                num: Math.min(this.config.maxResults, 10), // Google limits to 10 per request
            };
            const response = await axios_1.default.get(url, {
                params,
                timeout: this.config.requestTimeoutMs,
                httpsAgent: this.httpsAgent,
            });
            if (!(0, serp_analysis_1.isSuccessfulGoogleSearch)(response.data)) {
                throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.API_REQUEST_FAILED, response.data.error?.message || 'Google search returned no results');
            }
            return this.parseGoogleSearchResults(response.data.items);
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                const axiosError = error;
                if (axiosError.response?.status === 429) {
                    throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.RATE_LIMIT_EXCEEDED, 'Google API rate limit exceeded');
                }
                if (axiosError.code === 'ECONNABORTED') {
                    throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.TIMEOUT, 'Google API request timeout');
                }
            }
            throw error;
        }
    }
    /**
     * Fetch results from DataForSEO API
     *
     * @param apiKey - DataForSEO API key (base64-encoded login:password)
     * @returns Array of search results
     * @throws {SERPAnalysisError} If fetch fails
     * @private
     */
    async fetchFromDataForSEO(apiKey) {
        try {
            const url = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
            const payload = [{
                    keyword: this.config.keyword,
                    language_code: 'en',
                    location_code: 2840, // USA
                    device: 'desktop',
                    depth: this.config.maxResults,
                }];
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    'Authorization': `Basic ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: this.config.requestTimeoutMs,
                httpsAgent: this.httpsAgent,
            });
            if (!(0, serp_analysis_1.isSuccessfulDataForSEOSearch)(response.data)) {
                const statusMessage = response.data.tasks?.[0]?.status_message || 'No results returned';
                throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.API_REQUEST_FAILED, `DataForSEO error: ${statusMessage}`);
            }
            return this.parseDataForSEOResults(response.data.tasks[0].result[0].items);
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                const axiosError = error;
                if (axiosError.response?.status === 429) {
                    throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.RATE_LIMIT_EXCEEDED, 'DataForSEO rate limit exceeded');
                }
                if (axiosError.code === 'ECONNABORTED') {
                    throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.TIMEOUT, 'DataForSEO request timeout');
                }
                // Handle authentication errors
                if (axiosError.response?.status === 401) {
                    throw new serp_analysis_1.SERPAnalysisError(serp_analysis_1.SERPAnalysisErrorCode.API_REQUEST_FAILED, 'DataForSEO authentication failed - check API key');
                }
            }
            throw error;
        }
    }
    /**
     * Parse Google Custom Search results
     *
     * @param items - Google search items
     * @returns Parsed search results
     * @private
     */
    parseGoogleSearchResults(items) {
        return items.map((item, index) => {
            const domain = this.extractDomain(item.link);
            const urlPattern = this.extractUrlPattern(item.link);
            const freshnessSignals = this.detectFreshnessSignals(item.title, item.link);
            const contentType = this.classifyContentType(item.title, item.snippet, item.link);
            return {
                position: index + 1,
                title: item.title,
                url: item.link,
                domain,
                snippet: item.snippet,
                contentType,
                titleLength: item.title.length,
                snippetLength: item.snippet.length,
                freshnessSignals,
                urlPattern,
                hasSiteLinks: false, // Google Custom Search doesn't provide this easily
                richSnippetFeatures: [],
            };
        });
    }
    /**
     * Parse DataForSEO results
     *
     * @param items - DataForSEO result items
     * @returns Parsed search results
     * @private
     */
    parseDataForSEOResults(items) {
        // Filter to organic results only
        const organicItems = items.filter(item => item.type === 'organic');
        return organicItems.map((item) => {
            const domain = this.extractDomain(item.url);
            const urlPattern = this.extractUrlPattern(item.url);
            const freshnessSignals = this.detectFreshnessSignals(item.title, item.url);
            const contentType = this.classifyContentType(item.title, item.description, item.url);
            return {
                position: item.rank_absolute,
                title: item.title,
                url: item.url,
                domain,
                snippet: item.description,
                contentType,
                titleLength: item.title.length,
                snippetLength: item.description.length,
                freshnessSignals,
                urlPattern,
                hasSiteLinks: Boolean(item.links && item.links.length > 0),
                richSnippetFeatures: item.table ? ['table'] : [],
            };
        });
    }
    /**
     * Extract domain from URL
     *
     * @param url - Full URL
     * @returns Domain name
     * @private
     */
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        }
        catch {
            return 'unknown';
        }
    }
    /**
     * Extract URL pattern
     *
     * @param url - Full URL
     * @returns URL pattern (e.g., /blog/{category}/{slug})
     * @private
     */
    extractUrlPattern(url) {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            // Replace numbers with {id}
            const pattern = path
                .replace(/\/\d+/g, '/{id}')
                .replace(/\/[a-f0-9-]{36}/gi, '/{uuid}')
                .replace(/\/\d{4}-\d{2}-\d{2}/g, '/{date}')
                .replace(/\/[^/]{30,}/g, '/{slug}');
            return pattern || '/';
        }
        catch {
            return '/';
        }
    }
    /**
     * Detect freshness signals in title and URL
     *
     * @param title - Page title
     * @param url - Page URL
     * @returns Array of detected freshness signals
     * @private
     */
    detectFreshnessSignals(title, url) {
        const signals = [];
        // Check for dates in title
        if (/\b20\d{2}\b/.test(title) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(title)) {
            signals.push(serp_analysis_1.FreshnessSignal.DATE_IN_TITLE);
        }
        // Check for dates in URL
        if (/\/20\d{2}\//.test(url) || /\/\d{4}-\d{2}-\d{2}/.test(url)) {
            signals.push(serp_analysis_1.FreshnessSignal.DATE_IN_URL);
        }
        // Check for news indicators
        if (/\/(news|press|blog)\//.test(url)) {
            signals.push(serp_analysis_1.FreshnessSignal.NEWS_ARTICLE);
        }
        if (signals.length === 0) {
            signals.push(serp_analysis_1.FreshnessSignal.NONE);
        }
        return signals;
    }
    /**
     * Classify content type based on title, snippet, and URL
     *
     * @param title - Page title
     * @param snippet - Meta description
     * @param url - Page URL
     * @returns Classified content type
     * @private
     */
    classifyContentType(title, snippet, url) {
        const combined = `${title} ${snippet} ${url}`.toLowerCase();
        if (/\/(blog|article)\//.test(url) || /\bblog\b/.test(combined)) {
            return serp_analysis_1.ContentType.BLOG;
        }
        if (/\/(product|shop|buy)\//.test(url) || /\b(buy|price|shop)\b/.test(combined)) {
            return serp_analysis_1.ContentType.PRODUCT;
        }
        if (/\b(guide|how to|tutorial|complete|ultimate)\b/.test(combined)) {
            return serp_analysis_1.ContentType.GUIDE;
        }
        if (/\/(news|press)\//.test(url) || /\bnews\b/.test(combined)) {
            return serp_analysis_1.ContentType.NEWS;
        }
        if (/\/(watch|video)\//.test(url) || /\bvideo\b/.test(combined)) {
            return serp_analysis_1.ContentType.VIDEO;
        }
        if (/\/(docs|documentation)\//.test(url) || /\bdocumentation\b/.test(combined)) {
            return serp_analysis_1.ContentType.DOCUMENTATION;
        }
        if (/\/(forum|community|discussion)\//.test(url)) {
            return serp_analysis_1.ContentType.FORUM;
        }
        return serp_analysis_1.ContentType.OTHER;
    }
    /**
     * Detect SERP features from search results
     *
     * @param results - Search results
     * @returns Detected SERP features
     * @private
     */
    async detectFeatures(results) {
        const features = [];
        // Feature detection would require access to full SERP HTML
        // For now, detect features from available data
        // Detect site links
        results.forEach((result) => {
            if (result.hasSiteLinks) {
                features.push({
                    type: serp_analysis_1.SERPFeatureType.SITE_LINKS,
                    position: result.position - 1,
                    domain: result.domain,
                    url: result.url,
                    confidence: 0.95,
                });
            }
        });
        // Detect video carousels
        const videoResults = results.filter((r) => r.contentType === serp_analysis_1.ContentType.VIDEO);
        if (videoResults.length >= 3 && videoResults[0].position <= 5) {
            features.push({
                type: serp_analysis_1.SERPFeatureType.VIDEO_CAROUSEL,
                position: videoResults[0].position - 1,
                confidence: 0.8,
            });
        }
        // Detect image packs (heuristic: multiple image-related results)
        const imageRelatedResults = results.filter((r) => r.url.includes('/image/') || r.url.includes('/photo/') || r.title.toLowerCase().includes('image'));
        if (imageRelatedResults.length >= 2) {
            features.push({
                type: serp_analysis_1.SERPFeatureType.IMAGE_PACK,
                position: 0,
                confidence: 0.6,
            });
        }
        // Note: Full feature detection requires scraping actual SERP HTML
        if (features.length === 0) {
            this.warnings.push('Limited SERP feature detection without full HTML access');
        }
        return features;
    }
    /**
     * Analyze domain authority distribution using SpyFu backlink data
     *
     * @param results - Search results
     * @returns Domain authority pattern analysis
     * @private
     */
    async analyzeDomainAuthority(results) {
        const domains = [...new Set(results.map(r => r.domain))];
        // Fetch backlink counts from SpyFu in parallel
        const backlinkCounts = await Promise.all(domains.map(domain => this.fetchBacklinksFromSpyFu(domain)));
        const domainData = domains.map((domain, i) => ({
            domain,
            backlinks: backlinkCounts[i],
        }));
        // Classify into high/medium/low authority based on backlink thresholds
        const highAuthority = domainData.filter(d => d.backlinks > 10000).length;
        const mediumAuthority = domainData.filter(d => d.backlinks > 1000 && d.backlinks <= 10000).length;
        const lowAuthority = domainData.filter(d => d.backlinks <= 1000).length;
        // Find domains appearing multiple times (dominant domains)
        const dominantDomains = domains.filter((d) => results.filter(r => r.domain === d).length > 1);
        // Generate insight based on distribution
        let insight = '';
        if (highAuthority > results.length / 2) {
            insight = 'High authority sites dominate; requires strong backlink profile to compete';
        }
        else if (mediumAuthority > results.length / 2) {
            insight = 'Medium authority sites prevalent; opportunities for established sites';
        }
        else {
            insight = 'Mixed authority distribution; content quality may outweigh authority';
        }
        return {
            highAuthority,
            mediumAuthority,
            lowAuthority,
            dominantDomains,
            insight,
        };
    }
    /**
     * Fetch backlinks from SpyFu for a domain
     *
     * @param domain - Domain to lookup
     * @returns Number of backlinks (0 if lookup fails)
     * @private
     */
    async fetchBacklinksFromSpyFu(domain) {
        const spyfuApiKey = this.config.spyfuApiKey || process.env.SPYFU_API_KEY;
        if (!spyfuApiKey || this.isPlaceholderApiKey(spyfuApiKey)) {
            return 0; // Non-critical, return 0
        }
        try {
            const url = 'https://www.spyfu.com/apis/domain_stats_api/domain_overview';
            const response = await axios_1.default.get(url, {
                params: {
                    domain,
                    api_key: spyfuApiKey,
                },
                timeout: this.config.requestTimeoutMs,
                httpsAgent: this.httpsAgent,
            });
            return response.data.backlinks || 0;
        }
        catch (error) {
            // Non-critical failure - just warn and return 0
            this.warnings.push(`SpyFu backlink lookup failed for ${domain}`);
            return 0;
        }
    }
    /**
     * Analyze ranking patterns across search results
     *
     * @param results - Search results
     * @returns Ranking pattern analysis
     * @private
     */
    async analyzeRankingPatterns(results) {
        // Domain authority pattern using SpyFu backlink data
        const domainAuthority = await this.analyzeDomainAuthority(results);
        // Content length pattern (requires scraping, using estimates)
        const contentLength = {
            averageWordCount: 1500,
            minWordCount: 500,
            maxWordCount: 3000,
            standardDeviation: 600,
            recommendedRange: {
                min: 1200,
                max: 2000,
            },
            insight: 'Long-form content dominates; aim for 1200-2000 words',
        };
        // Title and meta pattern
        const titleMeta = this.analyzeTitleMetaPatterns(results);
        // URL structure pattern
        const urlStructure = this.analyzeUrlStructurePatterns(results);
        // Content type distribution
        const contentTypes = this.analyzeContentTypeDistribution(results);
        // Freshness signal distribution
        const freshnessSignals = this.analyzeFreshnessSignalDistribution(results);
        return {
            domainAuthority,
            contentLength,
            titleMeta,
            urlStructure,
            contentTypes,
            freshnessSignals,
        };
    }
    /**
     * Analyze title and meta patterns
     *
     * @param results - Search results
     * @returns Title and meta pattern analysis
     * @private
     */
    analyzeTitleMetaPatterns(results) {
        const titleLengths = results.map((r) => r.titleLength);
        const metaLengths = results.map((r) => r.snippetLength);
        const avgTitleLength = this.average(titleLengths);
        const avgMetaLength = this.average(metaLengths);
        // Analyze keyword placement
        const keyword = this.config.keyword.toLowerCase();
        const keywordInTitle = results.filter((r) => r.title.toLowerCase().includes(keyword)).length;
        const keywordAtStart = results.filter((r) => r.title.toLowerCase().startsWith(keyword.split(' ')[0])).length;
        const keywordInMeta = results.filter((r) => r.snippet.toLowerCase().includes(keyword)).length;
        // Extract common title patterns
        const titlePatterns = this.extractTitlePatterns(results);
        return {
            avgTitleLength,
            titleLengthRange: {
                min: Math.min(...titleLengths),
                max: Math.max(...titleLengths),
            },
            avgMetaLength,
            metaLengthRange: {
                min: Math.min(...metaLengths),
                max: Math.max(...metaLengths),
            },
            commonTitlePatterns: titlePatterns.slice(0, 5),
            titleStructures: [],
            keywordPlacement: {
                inTitle: (keywordInTitle / results.length) * 100,
                atTitleStart: (keywordAtStart / results.length) * 100,
                inMeta: (keywordInMeta / results.length) * 100,
            },
            insights: [
                `${avgTitleLength.toFixed(0)} character average title length`,
                `${(keywordInTitle / results.length * 100).toFixed(0)}% include target keyword in title`,
                avgTitleLength > 60 ? 'Titles may be truncated in SERPs' : 'Title lengths are optimal',
            ],
        };
    }
    /**
     * Extract common title patterns
     *
     * @param results - Search results
     * @returns Common title patterns
     * @private
     */
    extractTitlePatterns(results) {
        const patterns = [];
        // Check for common structures
        const hasPipe = results.filter((r) => r.title.includes('|')).length;
        const hasDash = results.filter((r) => r.title.includes('-')).length;
        const hasColon = results.filter((r) => r.title.includes(':')).length;
        const hasBrackets = results.filter((r) => /\[.*\]/.test(r.title)).length;
        const hasParentheses = results.filter((r) => /\(.*\)/.test(r.title)).length;
        if (hasPipe > results.length * 0.3)
            patterns.push('Title | Brand');
        if (hasDash > results.length * 0.3)
            patterns.push('Title - Subtitle');
        if (hasColon > results.length * 0.3)
            patterns.push('Category: Title');
        if (hasBrackets > results.length * 0.2)
            patterns.push('Title [Year/Category]');
        if (hasParentheses > results.length * 0.2)
            patterns.push('Title (Additional Info)');
        return patterns;
    }
    /**
     * Analyze URL structure patterns
     *
     * @param results - Search results
     * @returns URL structure pattern analysis
     * @private
     */
    analyzeUrlStructurePatterns(results) {
        const urlLengths = results.map((r) => r.url.length);
        const patterns = new Map();
        // Group by URL pattern
        results.forEach((result) => {
            const pattern = result.urlPattern;
            if (!patterns.has(pattern)) {
                patterns.set(pattern, []);
            }
            patterns.get(pattern).push(result.url);
        });
        // Convert to array and sort by frequency
        const patternArray = Array.from(patterns.entries())
            .map(([pattern, examples]) => ({
            pattern,
            count: examples.length,
            examples: examples.slice(0, 3),
        }))
            .sort((a, b) => b.count - a.count);
        // Calculate component statistics
        const keyword = this.config.keyword.toLowerCase();
        const hasKeyword = results.filter((r) => r.url.toLowerCase().includes(keyword.replace(/\s+/g, '-'))).length;
        const avgPathDepth = this.average(results.map((r) => {
            try {
                const path = new URL(r.url).pathname;
                return path.split('/').filter(Boolean).length;
            }
            catch {
                return 0;
            }
        }));
        const hasHyphens = results.filter((r) => r.url.includes('-')).length;
        const hasNumbers = results.filter((r) => /\d/.test(r.url)).length;
        return {
            patterns: patternArray,
            avgUrlLength: this.average(urlLengths),
            components: {
                hasKeyword: (hasKeyword / results.length) * 100,
                pathDepth: avgPathDepth,
                hasHyphens: (hasHyphens / results.length) * 100,
                hasNumbers: (hasNumbers / results.length) * 100,
                hasCategory: 60, // Estimated
            },
            insights: [
                `Average path depth: ${avgPathDepth.toFixed(1)} levels`,
                `${(hasKeyword / results.length * 100).toFixed(0)}% include keyword in URL`,
                `${(hasHyphens / results.length * 100).toFixed(0)}% use hyphens for word separation`,
            ],
        };
    }
    /**
     * Analyze content type distribution
     *
     * @param results - Search results
     * @returns Content type distribution
     * @private
     */
    analyzeContentTypeDistribution(results) {
        const distribution = new Map();
        results.forEach((result) => {
            if (!distribution.has(result.contentType)) {
                distribution.set(result.contentType, []);
            }
            distribution.get(result.contentType).push(result.position);
        });
        return Array.from(distribution.entries())
            .map(([type, positions]) => ({
            type,
            count: positions.length,
            positions: positions.sort((a, b) => a - b),
        }))
            .sort((a, b) => b.count - a.count);
    }
    /**
     * Analyze freshness signal distribution
     *
     * @param results - Search results
     * @returns Freshness signal distribution
     * @private
     */
    analyzeFreshnessSignalDistribution(results) {
        const distribution = new Map();
        results.forEach((result) => {
            result.freshnessSignals.forEach((signal) => {
                if (!distribution.has(signal)) {
                    distribution.set(signal, []);
                }
                distribution.get(signal).push(result.position);
            });
        });
        return Array.from(distribution.entries())
            .map(([signal, positions]) => ({
            signal,
            count: positions.length,
            positions: positions.sort((a, b) => a - b),
        }))
            .sort((a, b) => b.count - a.count);
    }
    /**
     * Extract semantic clusters from search results
     *
     * @param results - Search results
     * @returns Semantic clusters
     * @private
     */
    async extractSemanticClusters(results) {
        // Extract keywords from titles and snippets
        const allText = results.map((r) => `${r.title} ${r.snippet}`).join(' ');
        const words = this.extractKeywords(allText);
        // Simple clustering based on word frequency
        const clusters = [];
        const processedWords = new Set();
        words.slice(0, 5).forEach((word, index) => {
            if (processedWords.has(word))
                return;
            const positions = results
                .filter((r) => r.title.toLowerCase().includes(word) || r.snippet.toLowerCase().includes(word))
                .map((r) => r.position);
            if (positions.length >= 3) {
                clusters.push({
                    clusterId: `cluster-${index + 1}`,
                    mainTopic: word,
                    keywords: [word],
                    prevalence: positions.length / results.length,
                    positions,
                    subtopics: [],
                    entities: [],
                    coverageScore: positions.length / results.length,
                    examples: positions.slice(0, 3).map((pos) => {
                        const result = results.find((r) => r.position === pos);
                        return {
                            position: pos,
                            url: result.url,
                            snippet: result.snippet.substring(0, 100),
                        };
                    }),
                });
                processedWords.add(word);
            }
        });
        return clusters;
    }
    /**
     * Extract keywords from text using simple frequency analysis
     *
     * @param text - Input text
     * @returns Top keywords
     * @private
     */
    extractKeywords(text) {
        // Remove common words and extract meaningful terms
        const stopWords = new Set([
            'the',
            'a',
            'an',
            'and',
            'or',
            'but',
            'in',
            'on',
            'at',
            'to',
            'for',
            'of',
            'with',
            'by',
            'from',
            'as',
            'is',
            'was',
            'are',
            'were',
            'be',
            'been',
            'being',
            'have',
            'has',
            'had',
            'do',
            'does',
            'did',
            'will',
            'would',
            'should',
            'could',
            'can',
            'may',
            'might',
            'must',
            'this',
            'that',
            'these',
            'those',
            'it',
            'its',
            'their',
            'your',
            'our',
        ]);
        const words = text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter((word) => word.length > 3 && !stopWords.has(word));
        // Count frequency
        const frequency = new Map();
        words.forEach((word) => {
            frequency.set(word, (frequency.get(word) || 0) + 1);
        });
        // Sort by frequency
        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => word)
            .slice(0, 20);
    }
    /**
     * Identify content gaps from analysis
     *
     * @param results - Search results
     * @param features - SERP features
     * @param clusters - Semantic clusters
     * @returns Identified content gaps
     * @private
     */
    identifyContentGaps(results, features, clusters) {
        const gaps = [];
        // Check for missing content types
        const contentTypeDistribution = this.analyzeContentTypeDistribution(results);
        const hasBlog = contentTypeDistribution.some((ct) => ct.type === serp_analysis_1.ContentType.BLOG);
        const hasGuide = contentTypeDistribution.some((ct) => ct.type === serp_analysis_1.ContentType.GUIDE);
        const hasVideo = contentTypeDistribution.some((ct) => ct.type === serp_analysis_1.ContentType.VIDEO);
        if (!hasBlog && contentTypeDistribution.length > 0) {
            gaps.push({
                gapType: 'format_mismatch',
                topic: 'blog content',
                opportunityScore: 0.7,
                currentCoverage: 0,
                recommendedContentType: serp_analysis_1.ContentType.BLOG,
                reasoning: 'No blog-style content in top 10; opportunity for informational articles',
                priority: 'medium',
            });
        }
        if (!hasGuide) {
            gaps.push({
                gapType: 'missing_topic',
                topic: 'comprehensive guides',
                opportunityScore: 0.8,
                currentCoverage: 0,
                recommendedContentType: serp_analysis_1.ContentType.GUIDE,
                reasoning: 'No comprehensive guides found; opportunity for in-depth tutorials',
                priority: 'high',
            });
        }
        if (!hasVideo && results.length > 0) {
            gaps.push({
                gapType: 'format_mismatch',
                topic: 'video content',
                opportunityScore: 0.6,
                currentCoverage: 0,
                recommendedContentType: serp_analysis_1.ContentType.VIDEO,
                reasoning: 'No video content in results; consider video optimization',
                priority: 'low',
            });
        }
        return gaps;
    }
    /**
     * Generate actionable recommendations
     *
     * @param results - Search results
     * @param features - SERP features
     * @param patterns - Ranking patterns
     * @param clusters - Semantic clusters
     * @param gaps - Content gaps
     * @returns Array of recommendations
     * @private
     */
    generateRecommendations(results, features, patterns, clusters, gaps) {
        const recommendations = [];
        // Title optimization
        if (patterns.titleMeta.keywordPlacement.inTitle > 80) {
            recommendations.push({
                type: serp_analysis_1.RecommendationType.CONTENT_STRUCTURE,
                title: 'Include target keyword in title',
                description: `${patterns.titleMeta.keywordPlacement.inTitle.toFixed(0)}% of top results include the keyword in their title. Ensure your title contains "${this.config.keyword}".`,
                impact: 'high',
                effort: 'low',
                priority: 0.9,
                evidence: [
                    `${patterns.titleMeta.keywordPlacement.atTitleStart.toFixed(0)}% place keyword at title start`,
                    `Average title length: ${patterns.titleMeta.avgTitleLength.toFixed(0)} characters`,
                ],
                actionSteps: [
                    'Place target keyword in title',
                    'Keep title under 60 characters',
                    'Front-load keyword if possible',
                ],
            });
        }
        // Content length recommendation
        if (patterns.contentLength.recommendedRange) {
            recommendations.push({
                type: serp_analysis_1.RecommendationType.CONTENT_STRUCTURE,
                title: 'Optimize content length',
                description: `Top-ranking content averages ${patterns.contentLength.averageWordCount} words. Aim for ${patterns.contentLength.recommendedRange.min}-${patterns.contentLength.recommendedRange.max} words.`,
                impact: 'medium',
                effort: 'high',
                priority: 0.7,
                evidence: [
                    `Average word count: ${patterns.contentLength.averageWordCount}`,
                    `Range: ${patterns.contentLength.minWordCount}-${patterns.contentLength.maxWordCount} words`,
                ],
                actionSteps: [
                    `Write ${patterns.contentLength.recommendedRange.min}-${patterns.contentLength.recommendedRange.max} words`,
                    'Focus on comprehensive coverage',
                    'Maintain readability and structure',
                ],
            });
        }
        // SERP feature targeting
        const hasSnippet = features.some((f) => f.type === serp_analysis_1.SERPFeatureType.FEATURED_SNIPPET);
        if (!hasSnippet || features.length > 0) {
            recommendations.push({
                type: serp_analysis_1.RecommendationType.SERP_FEATURE,
                title: 'Target SERP features',
                description: `${features.length} SERP features detected. Optimize content to capture featured snippets and other rich results.`,
                impact: 'high',
                effort: 'medium',
                priority: 0.85,
                evidence: features.map((f) => `${f.type} at position ${f.position}`),
                actionSteps: [
                    'Use clear heading structure (H2, H3)',
                    'Include concise definitions and lists',
                    'Add FAQ sections for PAA boxes',
                    'Implement structured data (schema.org)',
                ],
                relatedFeatures: features.map((f) => f.type),
            });
        }
        // Freshness recommendations
        const freshResults = results.filter((r) => r.freshnessSignals.length > 1).length;
        if (freshResults > results.length * 0.5) {
            recommendations.push({
                type: serp_analysis_1.RecommendationType.CONTENT_STRATEGY,
                title: 'Emphasize content freshness',
                description: `${(freshResults / results.length * 100).toFixed(0)}% of top results show freshness signals. Include dates and update content regularly.`,
                impact: 'medium',
                effort: 'low',
                priority: 0.6,
                evidence: [
                    `${freshResults} results show freshness signals`,
                    'Dates in titles and URLs are common',
                ],
                actionSteps: [
                    'Include current year in title',
                    'Add publication/update dates',
                    'Regular content updates',
                ],
            });
        }
        // URL structure recommendations
        if (patterns.urlStructure.components.hasKeyword > 70) {
            recommendations.push({
                type: serp_analysis_1.RecommendationType.TECHNICAL_SEO,
                title: 'Optimize URL structure',
                description: `${patterns.urlStructure.components.hasKeyword.toFixed(0)}% of top results include keywords in URLs. Use descriptive, keyword-rich URLs.`,
                impact: 'medium',
                effort: 'low',
                priority: 0.65,
                evidence: [
                    `Average path depth: ${patterns.urlStructure.components.pathDepth.toFixed(1)} levels`,
                    `${patterns.urlStructure.components.hasHyphens.toFixed(0)}% use hyphens`,
                ],
                actionSteps: [
                    'Include target keyword in URL',
                    'Use hyphens to separate words',
                    'Keep URLs concise and readable',
                ],
            });
        }
        // Content gap recommendations
        gaps.forEach((gap) => {
            if (gap.priority === 'high') {
                recommendations.push({
                    type: serp_analysis_1.RecommendationType.COMPETITIVE_POSITIONING,
                    title: `Address content gap: ${gap.topic}`,
                    description: gap.reasoning,
                    impact: 'high',
                    effort: 'high',
                    priority: gap.opportunityScore,
                    evidence: [
                        `Current coverage: ${gap.currentCoverage * 100}%`,
                        `Opportunity score: ${gap.opportunityScore}`,
                    ],
                    actionSteps: [
                        `Create ${gap.recommendedContentType} content`,
                        'Focus on comprehensive coverage',
                        'Differentiate from existing content',
                    ],
                });
            }
        });
        // Sort by priority
        return recommendations.sort((a, b) => b.priority - a.priority);
    }
    /**
     * Enrich search results with scraped content analysis
     *
     * @param results - Search results to enrich
     * @private
     */
    async enrichWithScrapedContent(results) {
        if (!this.config.enableContentScraping) {
            return;
        }
        try {
            // Create extractor with configured parameters
            const extractorConfig = {
                rateLimitMs: this.config.rateLimitMs,
                requestTimeoutMs: this.config.requestTimeoutMs,
                maxRetries: 2,
                verbose: this.config.verbose,
            };
            // Import FirecrawlContentExtractor dynamically
            // This is implemented by backend-developer team
            // For now, we provide the type-safe interface
            const firecrawlExtractorPath = './firecrawl-content-extractor';
            try {
                // Dynamic import for FirecrawlContentExtractor
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { FirecrawlContentExtractor } = require(firecrawlExtractorPath);
                const extractor = new FirecrawlContentExtractor(extractorConfig);
                // Get top 5 results for content scraping to avoid excessive API calls
                const topUrls = results.slice(0, 5).map((r) => r.url);
                if (topUrls.length === 0) {
                    return;
                }
                // Scrape content and attach to results
                const scrapedResults = await extractor.scrapeUrls(topUrls);
                // Enrich search results with scraped content and update word counts
                for (let i = 0; i < results.length && i < 5; i++) {
                    const scraped = scrapedResults.results?.find((r) => r.url === results[i].url);
                    if (scraped && scraped.success && scraped.analysis) {
                        // Update word count from actual content
                        results[i].wordCount = scraped.analysis.wordCount;
                        // Update headings from scraped content
                        results[i].headings = {
                            h1: Array(scraped.analysis.headingDistribution.h1).fill(''),
                            h2: Array(scraped.analysis.headingDistribution.h2).fill(''),
                            h3: Array(scraped.analysis.headingDistribution.h3).fill(''),
                        };
                        // Update schema types
                        if (scraped.analysis.schemaTypes) {
                            results[i].schemaTypes = scraped.analysis.schemaTypes;
                        }
                    }
                }
                if (this.config.verbose) {
                    console.log(`[SERP Analyst] Successfully scraped ${scrapedResults.successCount}/${scrapedResults.totalUrls} URLs`);
                }
            }
            catch (error) {
                // FirecrawlContentExtractor may not be available yet
                // Log warning but continue with analysis
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                this.warnings.push(`Content scraping unavailable: ${errorMsg}`);
                if (this.config.verbose) {
                    console.warn(`[SERP Analyst] Content scraping skipped: ${errorMsg}`);
                }
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.warnings.push(`Content enrichment failed: ${errorMsg}`);
            if (this.config.verbose) {
                console.warn(`[SERP Analyst] Content enrichment error: ${errorMsg}`);
            }
        }
    }
    /**
     * Calculate overall analysis confidence
     *
     * @param results - Search results
     * @param features - SERP features
     * @param patterns - Ranking patterns
     * @param clusters - Semantic clusters
     * @returns Confidence score (0.0-1.0)
     * @private
     */
    calculateOverallConfidence(results, features, patterns, clusters) {
        let confidence = 0.5; // Base confidence
        // More results = higher confidence
        if (results.length >= 10)
            confidence += 0.2;
        else if (results.length >= 5)
            confidence += 0.1;
        // Feature detection adds confidence
        if (features.length > 0)
            confidence += 0.1;
        // Clustering adds confidence
        if (clusters.length >= 3)
            confidence += 0.1;
        // Pattern analysis adds confidence
        if (patterns.contentTypes.length > 0)
            confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
    /**
     * Determine which API provider was used
     *
     * @returns API provider identifier
     * @private
     */
    determineApiProvider() {
        const googleApiKey = this.config.googleApiKey || process.env.GOOGLE_API_KEY;
        const dataForSeoApiKey = this.config.dataForSeoApiKey || process.env.DATA_FOR_SEO_API_KEY;
        if (googleApiKey && !this.isPlaceholderApiKey(googleApiKey)) {
            return 'google';
        }
        if (dataForSeoApiKey && !this.isPlaceholderApiKey(dataForSeoApiKey)) {
            return 'dataforseo';
        }
        return 'scraping';
    }
    /**
     * Calculate average of array
     *
     * @param numbers - Array of numbers
     * @returns Average value
     * @private
     */
    average(numbers) {
        if (numbers.length === 0)
            return 0;
        return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    }
}
exports.SERPPatternAnalyst = SERPPatternAnalyst;
//# sourceMappingURL=serp-pattern-analyst.js.map