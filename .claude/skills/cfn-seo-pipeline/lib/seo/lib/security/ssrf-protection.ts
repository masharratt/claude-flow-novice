/**
 * SSRF (Server-Side Request Forgery) Protection Module
 *
 * Prevents SSRF attacks by validating URLs against whitelisted domains,
 * blocking private/local IP addresses, and enforcing protocol restrictions.
 *
 * @module seo/lib/security/ssrf-protection
 */

/**
 * Whitelist of allowed domains for external requests
 */
const ALLOWED_DOMAINS = new Set([
  'suggestqueries.google.com',
  'www.google.com',
  'google.com',
  'reddit.com',
  'oauth.reddit.com',
  'www.reddit.com',
  'api.reddit.com',
  'quora.com',
  'www.quora.com',
]);

/**
 * Patterns for private/local IP addresses that should be blocked
 */
const BLOCKED_IP_PATTERNS = [
  /^127\./, // 127.0.0.0/8 - Loopback
  /^10\./, // 10.0.0.0/8 - Private
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12 - Private
  /^192\.168\./, // 192.168.0.0/16 - Private
  /^169\.254\./, // 169.254.0.0/16 - Link-local
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 private (fc00::/7)
  /^fe80:/i, // IPv6 link-local (fe80::/10)
  /^ff00:/i, // IPv6 multicast (ff00::/8)
];

/**
 * Represents a parsed and validated URL
 */
export interface ValidatedURL {
  protocol: string;
  hostname: string;
  port?: number;
  pathname: string;
  searchParams: Record<string, string>;
}

/**
 * Check if a hostname is an IP address
 *
 * @param hostname - Hostname to check
 * @returns true if hostname is an IP address
 */
function isIPAddress(hostname: string): boolean {
  // IPv4: check for numeric octets
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return true;
  }
  // IPv6: check for hex and colons
  if (/^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(hostname)) {
    return true;
  }
  // IPv6 compressed format
  if (/^::1$|^::$|^::[0-9a-f]{0,4}$|^[0-9a-f]{0,4}::$|^[0-9a-f]{0,4}::[0-9a-f]{0,4}$/i.test(hostname)) {
    return true;
  }
  return false;
}

/**
 * Check if an IP address is in a private/reserved range
 *
 * @param ip - IP address to check
 * @returns true if IP is private/reserved
 */
function isPrivateIP(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * Resolve hostname to IP and check if it's private
 *
 * Note: This is a synchronous check based on DNS resolution.
 * In a real implementation, you'd want to use async DNS resolution.
 * For now, we validate based on hostname patterns.
 *
 * @param hostname - Hostname to check
 * @returns true if hostname resolves to private IP
 */
async function hostnameResolvesToPrivateIP(hostname: string): Promise<boolean> {
  // If it's already an IP, check directly
  if (isIPAddress(hostname)) {
    return isPrivateIP(hostname);
  }

  // For domain names, we cannot resolve without DNS library
  // In production, use a DNS library with timeout/rate limiting
  // For now, only block known problematic patterns
  const suspiciousPatterns = [
    /^localhost$/i,
    /^127-[\d-]+\..*$/, // 127-anything patterns
    /^0\.0\.0\.0$/i, // All zeros
    /^255\.255\.255\.255$/i, // Broadcast
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(hostname));
}

/**
 * Normalize a URL for comparison
 *
 * @param url - URL string to normalize
 * @returns Normalized URL
 */
function normalizeURL(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Validate a URL for SSRF vulnerabilities
 *
 * Checks:
 * - Protocol is HTTP or HTTPS
 * - Domain is whitelisted
 * - No private/local IPs
 * - No credentials in URL
 * - Valid URL format
 *
 * @param urlString - URL to validate
 * @throws Error if URL fails validation
 * @returns ValidatedURL object on success
 *
 * @example
 * ```typescript
 * try {
 *   const validated = await validateURL('https://suggestqueries.google.com/search?q=test');
 *   // Safe to make request to validated.hostname
 * } catch (error) {
 *   console.error('URL blocked:', error.message);
 * }
 * ```
 */
export async function validateURL(urlString: string): Promise<ValidatedURL> {
  // Validate input is string
  if (!urlString || typeof urlString !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  // Check for null bytes
  if (urlString.includes('\x00')) {
    throw new Error('URL contains null bytes');
  }

  // Check for common SSRF bypass patterns
  const bypassPatterns = [
    /^(https?:)?\/\/[^/]*@/, // username:password@
    /\.\.\//, // Path traversal
    /\?.*redirect=/, // Redirect parameter
    /%\.\./, // Encoded traversal
  ];

  if (bypassPatterns.some((pattern) => pattern.test(urlString))) {
    throw new Error('URL contains SSRF bypass pattern');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch (error) {
    throw new Error(`Invalid URL format: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check protocol
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Only HTTP and HTTPS protocols allowed, got: ${parsed.protocol}`
    );
  }

  // Check for credentials in URL (common SSRF vector)
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials not allowed');
  }

  // Get hostname (without port)
  const hostname = parsed.hostname || '';

  if (!hostname) {
    throw new Error('URL must contain a valid hostname');
  }

  // Check for localhost variations
  if (hostname.toLowerCase() === 'localhost') {
    throw new Error('Access to localhost blocked');
  }

  // Check if it's an IP address
  if (isIPAddress(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error(`Access to private IP address blocked: ${hostname}`);
    }
  } else {
    // Check domain whitelist
    if (!ALLOWED_DOMAINS.has(hostname.toLowerCase())) {
      // Check if domain is a subdomain of whitelisted domain
      const isWhitelisted = Array.from(ALLOWED_DOMAINS).some((allowed) => {
        const pattern = new RegExp(`(^|\\.)${allowed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        return pattern.test(hostname);
      });

      if (!isWhitelisted) {
        throw new Error(`Domain not whitelisted: ${hostname}`);
      }
    }

    // Perform hostname resolution check (for local network bypass detection)
    if (await hostnameResolvesToPrivateIP(hostname)) {
      throw new Error(`Hostname resolves to private IP address: ${hostname}`);
    }
  }

  // Check port if specified
  if (parsed.port) {
    const port = parseInt(parsed.port, 10);
    const blockedPorts = [
      25, // SMTP
      587, // SMTP TLS
      3306, // MySQL
      5432, // PostgreSQL
      6379, // Redis
      27017, // MongoDB
      9200, // Elasticsearch
    ];

    if (blockedPorts.includes(port)) {
      throw new Error(`Access to port ${port} blocked (database/mail service)`);
    }
  }

  // Parse query parameters
  const searchParams: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    searchParams[key] = value;
  });

  return {
    protocol: parsed.protocol,
    hostname: hostname.toLowerCase(),
    port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    pathname: parsed.pathname,
    searchParams,
  };
}

/**
 * Create a URL-safe request with SSRF protection
 *
 * @param urlString - URL to validate and fetch
 * @param options - Fetch options
 * @returns Fetch response
 * @throws Error if URL fails validation
 */
export async function fetchWithSSRFProtection(
  urlString: string,
  options?: RequestInit
): Promise<Response> {
  // Validate URL first
  await validateURL(urlString);

  // If validation passes, safe to fetch
  try {
    return await fetch(urlString, {
      ...options,
      // Security headers
      headers: {
        ...options?.headers,
        'User-Agent': 'SEO-Pipeline/1.0',
      },
      // Timeout to prevent slow-read attacks
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Fetch failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate multiple URLs
 *
 * @param urls - Array of URL strings
 * @returns Promise<ValidatedURL[]>
 * @throws Error on first validation failure
 */
export async function validateURLBatch(urls: string[]): Promise<ValidatedURL[]> {
  const results: ValidatedURL[] = [];

  for (const url of urls) {
    try {
      const validated = await validateURL(url);
      results.push(validated);
    } catch (error) {
      throw new Error(`Batch validation failed for URL "${url}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return results;
}

/**
 * Add a domain to the whitelist
 *
 * Use with caution - only add trusted domains.
 *
 * @param domain - Domain to whitelist
 * @throws Error if domain format is invalid
 */
export function addWhitelistedDomain(domain: string): void {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Domain must be a non-empty string');
  }

  const normalized = domain.toLowerCase();

  // Basic domain validation
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
    throw new Error(`Invalid domain format: ${domain}`);
  }

  ALLOWED_DOMAINS.add(normalized);
}

/**
 * Get the current whitelist
 *
 * @returns Array of whitelisted domains
 */
export function getWhitelistedDomains(): string[] {
  return Array.from(ALLOWED_DOMAINS).sort();
}
