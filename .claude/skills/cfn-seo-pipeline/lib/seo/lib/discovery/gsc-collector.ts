/**
 * Google Search Console Keyword Collector
 *
 * Collects keywords from GSC API based on actual performance data.
 * Provides free keyword discovery using existing traffic data.
 *
 * @module seo/lib/discovery/gsc-collector
 */

import type { KeywordSource, GSCCollectorOptions } from './types';

/**
 * GSC API response types
 */
interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GSCResponse {
  rows?: GSCRow[];
  responseAggregationType?: string;
}

/**
 * GSC API client configuration
 */
interface GSCClientConfig {
  /** OAuth2 access token */
  accessToken: string;

  /** API endpoint base URL */
  apiEndpoint?: string;
}

/**
 * Get GSC API client from environment
 */
function getGSCClient(): GSCClientConfig | null {
  const accessToken = process.env.GSC_ACCESS_TOKEN;

  if (!accessToken) {
    console.warn('GSC_ACCESS_TOKEN not found in environment. GSC collector will be skipped.');
    return null;
  }

  return {
    accessToken,
    apiEndpoint: process.env.GSC_API_ENDPOINT || 'https://www.googleapis.com/webmasters/v3',
  };
}

/**
 * Calculate date range for GSC query
 */
function getDateRange(options: GSCCollectorOptions): { startDate: string; endDate: string } {
  const endDate = options.endDate || new Date().toISOString().split('T')[0];

  let startDate = options.startDate;
  if (!startDate) {
    // Default to 30 days ago
    const date = new Date();
    date.setDate(date.getDate() - 30);
    startDate = date.toISOString().split('T')[0];
  }

  return { startDate, endDate };
}

/**
 * Query GSC Search Analytics API
 */
async function queryGSCAPI(
  client: GSCClientConfig,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit: number
): Promise<GSCResponse> {
  const url = `${client.apiEndpoint}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const requestBody = {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit,
    startRow: 0,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${client.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GSC API error (${response.status}): ${errorText}`);
    }

    return await response.json() as GSCResponse;
  } catch (error) {
    throw new Error(`Failed to query GSC API: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Convert GSC row to KeywordSource
 */
function convertGSCRowToKeywordSource(row: GSCRow, taskId: string): KeywordSource {
  const keyword = row.keys[0]; // First dimension is the query

  return {
    keyword,
    source: 'gsc',
    metadata: {
      impressions: Math.round(row.impressions),
      clicks: Math.round(row.clicks),
      position: Math.round(row.position * 10) / 10, // Round to 1 decimal
    },
    discoveredAt: new Date().toISOString(),
    cacheHit: false, // GSC is always live data
  };
}

/**
 * Filter keywords by minimum impressions threshold
 */
function filterByImpressions(rows: GSCRow[], minImpressions: number): GSCRow[] {
  return rows.filter(row => row.impressions >= minImpressions);
}

/**
 * Collect keywords from Google Search Console
 *
 * Queries GSC API for queries with actual traffic data.
 * Requires GSC_ACCESS_TOKEN environment variable.
 *
 * @param options - GSC collector options
 * @returns Array of keyword sources with performance metrics
 */
export async function collectFromGSC(options: GSCCollectorOptions): Promise<KeywordSource[]> {
  const client = getGSCClient();

  if (!client) {
    console.warn('GSC client not configured. Skipping GSC collection.');
    return [];
  }

  // Set defaults
  const minImpressions = options.minImpressions ?? 10;
  const limit = options.limit ?? 100;

  // Get date range
  const { startDate, endDate } = getDateRange(options);

  console.log(`[GSC Collector] Querying ${options.siteUrl} from ${startDate} to ${endDate}`);

  try {
    // Query GSC API
    const response = await queryGSCAPI(
      client,
      options.siteUrl,
      startDate,
      endDate,
      limit * 2 // Request more to account for filtering
    );

    if (!response.rows || response.rows.length === 0) {
      console.log('[GSC Collector] No data returned from GSC API');
      return [];
    }

    // Filter by minimum impressions
    const filteredRows = filterByImpressions(response.rows, minImpressions);

    console.log(
      `[GSC Collector] Found ${filteredRows.length} keywords (filtered from ${response.rows.length})`
    );

    // Convert to KeywordSource format
    const keywords = filteredRows
      .slice(0, limit)
      .map(row => convertGSCRowToKeywordSource(row, options.taskId));

    // Log summary statistics
    const totalImpressions = keywords.reduce((sum, kw) => sum + (kw.metadata.impressions || 0), 0);
    const totalClicks = keywords.reduce((sum, kw) => sum + (kw.metadata.clicks || 0), 0);
    const avgPosition = keywords.reduce((sum, kw) => sum + (kw.metadata.position || 0), 0) / keywords.length;

    console.log(`[GSC Collector] Total impressions: ${totalImpressions}, clicks: ${totalClicks}`);
    console.log(`[GSC Collector] Average position: ${avgPosition.toFixed(1)}`);

    return keywords;
  } catch (error) {
    console.error('[GSC Collector] Error:', error);
    throw error;
  }
}

/**
 * Validate GSC credentials
 *
 * Checks if GSC API credentials are configured.
 *
 * @returns True if credentials are available
 */
export function isGSCConfigured(): boolean {
  return !!process.env.GSC_ACCESS_TOKEN;
}

/**
 * Get GSC site list
 *
 * Retrieves list of verified sites from GSC.
 *
 * @returns Array of site URLs
 */
export async function getGSCSites(): Promise<string[]> {
  const client = getGSCClient();

  if (!client) {
    throw new Error('GSC client not configured');
  }

  const url = `${client.apiEndpoint}/sites`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${client.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GSC API error (${response.status})`);
    }

    const data = await response.json() as { siteEntry?: Array<{ siteUrl: string }> };
    return (data.siteEntry || []).map(entry => entry.siteUrl);
  } catch (error) {
    throw new Error(`Failed to get GSC sites: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get top queries for a site
 *
 * Convenience function to get top-performing queries.
 *
 * @param siteUrl - Site URL
 * @param limit - Maximum results (default: 50)
 * @returns Array of keyword sources
 */
export async function getTopQueries(
  siteUrl: string,
  limit = 50
): Promise<KeywordSource[]> {
  return collectFromGSC({
    taskId: `top-queries-${Date.now()}`,
    siteUrl,
    limit,
    minImpressions: 10,
  });
}
