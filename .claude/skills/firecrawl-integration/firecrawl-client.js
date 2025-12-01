/**
 * Firecrawl API Client v2
 *
 * Self-hosted Firecrawl integration for OurStories SEO pipeline.
 * Base URL: https://firecrawl-api-ourstories.fly.dev
 *
 * Endpoints:
 * - POST /v2/scrape - Scrape single URL
 * - POST /v2/crawl - Crawl entire website
 * - POST /v2/map - Map website URLs
 * - POST /v2/search - Web search with scraping
 * - POST /v2/extract - AI-powered data extraction
 * - POST /v2/batch/scrape - Batch scrape multiple URLs
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load credentials from environment or .env file
function loadConfig() {
  const config = {
    apiKey: process.env.FIRECRAWL_API_KEY,
    baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://firecrawl-api-ourstories.fly.dev',
    projectId: process.env.FIRECRAWL_PROJECT_ID,
    teamId: process.env.FIRECRAWL_TEAM_ID
  };

  // Fallback: read from .env file if not in environment
  if (!config.apiKey) {
    try {
      const envPath = resolve(process.cwd(), '.env');
      const envContent = readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        if (line.startsWith('FIRECRAWL_API_KEY=')) {
          config.apiKey = line.split('=')[1].trim();
        }
        if (line.startsWith('FIRECRAWL_BASE_URL=')) {
          config.baseUrl = line.split('=')[1].trim();
        }
      }
    } catch (e) {
      // .env file not found, continue with defaults
    }
  }

  if (!config.apiKey) {
    throw new Error('FIRECRAWL_API_KEY not configured. Set it in .env or environment.');
  }

  return config;
}

/**
 * Make authenticated request to Firecrawl API
 */
async function firecrawlRequest(endpoint, options = {}) {
  const config = loadConfig();
  const url = `${config.baseUrl}${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  const response = await fetch(url, {
    method: options.method || 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();

  if (!response.ok) {
    throw new FirecrawlError(data.error || 'Firecrawl API error', response.status, data);
  }

  return data;
}

class FirecrawlError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'FirecrawlError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Scrape a single URL
 *
 * @param {string} url - URL to scrape
 * @param {Object} options - Scrape options
 * @param {string[]} options.formats - Output formats: 'markdown', 'html', 'json', 'screenshot', 'links'
 * @param {Object} options.scrapeOptions - Scraping behavior options
 * @param {Object} options.jsonOptions - JSON extraction options (prompt or schema)
 * @returns {Promise<Object>} Scraped content
 *
 * @example
 * const result = await scrape('https://example.com', {
 *   formats: ['markdown', 'html'],
 *   scrapeOptions: { onlyMainContent: true, waitFor: 2000 }
 * });
 */
async function scrape(url, options = {}) {
  const body = {
    url,
    formats: options.formats || ['markdown'],
    scrapeOptions: {
      onlyMainContent: true,
      timeout: 30000,
      ...options.scrapeOptions
    }
  };

  if (options.jsonOptions) {
    body.jsonOptions = options.jsonOptions;
  }

  return firecrawlRequest('/v2/scrape', { body });
}

/**
 * Crawl a website to discover and scrape multiple pages
 *
 * @param {string} url - Starting URL
 * @param {Object} options - Crawl options
 * @param {number} options.limit - Max pages to crawl (default: 100)
 * @param {number} options.maxDepth - Max crawl depth (default: 3)
 * @param {string[]} options.includePaths - URL paths to include
 * @param {string[]} options.excludePaths - URL paths to exclude
 * @returns {Promise<Object>} Crawl job info with ID
 *
 * @example
 * const job = await crawl('https://example.com', {
 *   limit: 50,
 *   includePaths: ['/blog'],
 *   excludePaths: ['/admin']
 * });
 */
async function crawl(url, options = {}) {
  const body = {
    url,
    limit: options.limit || 100,
    maxDepth: options.maxDepth || 3,
    scrapeOptions: {
      onlyMainContent: true,
      formats: ['markdown'],
      ...options.scrapeOptions
    },
    includePaths: options.includePaths,
    excludePaths: options.excludePaths,
    allowBackwardLinks: options.allowBackwardLinks || false,
    allowExternalLinks: options.allowExternalLinks || false,
    ignoreSitemap: options.ignoreSitemap || false
  };

  return firecrawlRequest('/v2/crawl', { body });
}

/**
 * Get crawl job status
 *
 * @param {string} jobId - Crawl job ID
 * @returns {Promise<Object>} Job status and results
 */
async function getCrawlStatus(jobId) {
  return firecrawlRequest(`/v2/crawl/${jobId}`, { method: 'GET' });
}

/**
 * Cancel a running crawl job
 *
 * @param {string} jobId - Crawl job ID to cancel
 * @returns {Promise<Object>} Cancellation confirmation
 */
async function cancelCrawl(jobId) {
  return firecrawlRequest(`/v2/crawl/${jobId}`, { method: 'DELETE' });
}

/**
 * Map all URLs on a website
 *
 * @param {string} url - Website URL to map
 * @param {Object} options - Map options
 * @param {string} options.search - Filter URLs by search query
 * @param {number} options.limit - Max URLs to return (default: 1000)
 * @param {boolean} options.includeSubdomains - Include subdomains
 * @returns {Promise<Object>} List of discovered URLs
 *
 * @example
 * const map = await mapUrls('https://example.com', {
 *   search: 'blog',
 *   limit: 500
 * });
 */
async function mapUrls(url, options = {}) {
  const body = {
    url,
    search: options.search,
    limit: options.limit || 1000,
    includeSubdomains: options.includeSubdomains || false,
    ignoreSitemap: options.ignoreSitemap || false
  };

  return firecrawlRequest('/v2/map', { body });
}

/**
 * Web search with optional scraping
 *
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.limit - Max results (default: 5)
 * @param {string} options.lang - Language code (e.g., 'en')
 * @param {string} options.country - Country code (e.g., 'us')
 * @param {Object} options.scrapeOptions - Options for scraping results
 * @returns {Promise<Object>} Search results with scraped content
 *
 * @example
 * const results = await search('machine learning tutorials', {
 *   limit: 10,
 *   lang: 'en',
 *   country: 'us',
 *   scrapeOptions: { onlyMainContent: true }
 * });
 */
async function search(query, options = {}) {
  const body = {
    query,
    limit: options.limit || 5,
    lang: options.lang,
    country: options.country,
    scrapeOptions: options.scrapeOptions
  };

  return firecrawlRequest('/v2/search', { body });
}

/**
 * Extract structured data using AI
 *
 * @param {string[]} urls - URLs to extract from
 * @param {Object} options - Extraction options
 * @param {string} options.prompt - Natural language extraction prompt
 * @param {Object} options.schema - JSON schema for structured extraction
 * @param {Object} options.agent - AI agent configuration
 * @returns {Promise<Object>} Extracted structured data
 *
 * @example
 * const data = await extract(['https://example.com/product'], {
 *   prompt: 'Extract product name, price, and specifications'
 * });
 */
async function extract(urls, options = {}) {
  const body = {
    urls: Array.isArray(urls) ? urls : [urls],
    prompt: options.prompt,
    schema: options.schema,
    agent: {
      model: 'fire-1',
      temperature: 0.1,
      maxTokens: 1000,
      ...options.agent
    }
  };

  return firecrawlRequest('/v2/extract', { body });
}

/**
 * Get extraction job status
 *
 * @param {string} jobId - Extraction job ID
 * @returns {Promise<Object>} Job status and results
 */
async function getExtractStatus(jobId) {
  return firecrawlRequest(`/v2/extract/${jobId}`, { method: 'GET' });
}

/**
 * Batch scrape multiple URLs
 *
 * @param {string[]} urls - URLs to scrape
 * @param {Object} options - Scrape options
 * @param {string[]} options.formats - Output formats
 * @param {Object} options.scrapeOptions - Scraping behavior options
 * @returns {Promise<Object>} Batch job info with ID
 *
 * @example
 * const job = await batchScrape([
 *   'https://example.com/page1',
 *   'https://example.com/page2'
 * ], { formats: ['markdown'] });
 */
async function batchScrape(urls, options = {}) {
  const body = {
    urls,
    formats: options.formats || ['markdown'],
    scrapeOptions: {
      onlyMainContent: true,
      timeout: 30000,
      ...options.scrapeOptions
    }
  };

  return firecrawlRequest('/v2/batch/scrape', { body });
}

/**
 * Check API health status
 *
 * @returns {Promise<Object>} Health status
 */
async function healthCheck() {
  return firecrawlRequest('/v2/health', { method: 'GET' });
}

/**
 * Scrape competitor URLs for SEO analysis
 *
 * @param {string[]} urls - Competitor URLs (top 5 SERP results)
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Competitor content for analysis
 */
async function scrapeCompetitors(urls, options = {}) {
  const results = [];

  for (const url of urls.slice(0, 5)) {
    try {
      const result = await scrape(url, {
        formats: ['markdown', 'links'],
        scrapeOptions: {
          onlyMainContent: true,
          timeout: 45000,
          ...options.scrapeOptions
        }
      });

      results.push({
        url,
        success: true,
        data: result.data
      });
    } catch (error) {
      results.push({
        url,
        success: false,
        error: error.message
      });
    }
  }

  return {
    success: true,
    results,
    scraped: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  };
}

/**
 * Extract SEO-relevant data from scraped content
 *
 * @param {string} url - URL to analyze
 * @returns {Promise<Object>} SEO analysis data
 */
async function extractSeoData(url) {
  return extract([url], {
    prompt: `Extract the following SEO-relevant data:
      1. Main heading (H1)
      2. All H2 subheadings
      3. Meta description (if available)
      4. Word count estimate
      5. Key topics/themes covered
      6. FAQ questions if present
      7. Internal links count
      8. External links count
      9. Content structure (introduction, sections, conclusion)
      10. Unique value proposition or main thesis`,
    agent: {
      model: 'fire-1',
      temperature: 0.1,
      maxTokens: 2000
    }
  });
}

export {
  scrape,
  crawl,
  getCrawlStatus,
  cancelCrawl,
  mapUrls,
  search,
  extract,
  getExtractStatus,
  batchScrape,
  healthCheck,
  scrapeCompetitors,
  extractSeoData,
  FirecrawlError,
  loadConfig
};

export default {
  scrape,
  crawl,
  getCrawlStatus,
  cancelCrawl,
  mapUrls,
  search,
  extract,
  getExtractStatus,
  batchScrape,
  healthCheck,
  scrapeCompetitors,
  extractSeoData
};
