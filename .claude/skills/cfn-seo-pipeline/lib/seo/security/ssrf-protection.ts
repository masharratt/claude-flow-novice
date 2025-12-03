/**
 * SSRF (Server-Side Request Forgery) Protection Module
 *
 * Validates external URLs before making HTTP requests to prevent:
 * - Requests to internal cloud metadata endpoints
 * - Access to private IP ranges
 * - Localhost/loopback enumeration
 * - Local file access via URL schemes
 *
 * Addresses SEC-1.3: Unvalidated URL Parsing
 *
 * @module seo/security/ssrf-protection
 */

/**
 * List of allowed external domains for API calls
 * Explicitly whitelisted to prevent SSRF attacks
 */
const ALLOWED_DOMAINS = [
  'api.dataforseo.com',
  'dataforseo.com',
  'www.google.com',
  'google.com',
  'serpapi.com',
  'api.serpapi.com',
];

/**
 * Blocked domains that should never be accessed
 */
const BLOCKED_DOMAINS = [
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
  '169.254.169.254', // AWS metadata endpoint
  'metadata.google.internal',
  '0.0.0.0',
  '255.255.255.255',
];

/**
 * Blocked IP ranges (private, reserved, multicast)
 * Prevents access to internal networks
 */
const BLOCKED_IP_RANGES = [
  { min: '10.0.0.0', max: '10.255.255.255' }, // Private Class A
  { min: '172.16.0.0', max: '172.31.255.255' }, // Private Class B
  { min: '192.168.0.0', max: '192.168.255.255' }, // Private Class C
  { min: '169.254.0.0', max: '169.254.255.255' }, // Link-local
  { min: '127.0.0.0', max: '127.255.255.255' }, // Loopback
  { min: '224.0.0.0', max: '239.255.255.255' }, // Multicast
];

/**
 * Blocked URL schemes
 */
const BLOCKED_SCHEMES = ['file', 'data', 'javascript', 'vbscript', 'about'];

/**
 * Convert IPv4 address string to integer for range comparison
 *
 * @param ip - IPv4 address as string (e.g., "192.168.1.1")
 * @returns IP address as integer or -1 if invalid
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return -1;
  }

  const octets = parts.map((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 ? num : -1;
  });

  if (octets.includes(-1)) {
    return -1;
  }

  return (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

/**
 * Check if an IPv4 address is in a blocked range
 *
 * @param ip - IPv4 address or hostname to check
 * @returns true if IP is in a blocked range, false if not an IP or allowed IP
 */
function isBlockedIPRange(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === -1) {
    return false; // Not a valid IPv4 address (probably a domain name), so not blocked by this check
  }

  for (const range of BLOCKED_IP_RANGES) {
    const minInt = ipv4ToInt(range.min);
    const maxInt = ipv4ToInt(range.max);

    if (ipInt >= minInt && ipInt <= maxInt) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a hostname is an IPv6 address
 *
 * @param hostname - Hostname to check
 * @returns true if hostname is IPv6
 */
function isIPv6(hostname: string): boolean {
  // Simple IPv6 check: contains colons
  return hostname.includes(':') && /^[\da-f:]+$/i.test(hostname);
}

/**
 * Check if a URL is allowed to be accessed
 *
 * Validates:
 * - URL scheme is allowed (https/http only)
 * - Hostname is not in blocklist
 * - Hostname is not a private IP range
 * - Hostname is in allowlist (if using allowlist mode)
 *
 * @param url - URL string to validate
 * @param useAllowlist - If true, only allow domains in ALLOWED_DOMAINS list
 * @returns true if URL is safe to access, false otherwise
 */
export function isAllowedURL(url: string, useAllowlist: boolean = true): boolean {
  try {
    const parsed = new URL(url);

    // Check URL scheme
    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (!['http', 'https'].includes(scheme)) {
      return false;
    }

    // Extract hostname (without port)
    const hostname = parsed.hostname || '';

    if (!hostname) {
      return false;
    }

    const hostnameLower = hostname.toLowerCase();

    // Check blocklist
    if (BLOCKED_DOMAINS.includes(hostnameLower)) {
      return false;
    }

    // Check if blocked IP range
    if (isBlockedIPRange(hostnameLower)) {
      return false;
    }

    // Check IPv6 blocklist
    if (isIPv6(hostnameLower)) {
      // Simple IPv6 check: reject link-local and loopback
      if (hostnameLower === '::1' || hostnameLower.startsWith('fe80:') || hostnameLower.startsWith('fc00:')) {
        return false;
      }
    }

    // If allowlist mode enabled, check against allowed domains
    if (useAllowlist) {
      const isAllowed = ALLOWED_DOMAINS.some((allowedDomain) => {
        const allowed = allowedDomain.toLowerCase();
        return (
          hostnameLower === allowed ||
          hostnameLower.endsWith(`.${allowed}`) ||
          // Also allow www subdomain
          hostnameLower === `www.${allowed}` ||
          hostnameLower.endsWith(`.www.${allowed}`)
        );
      });

      if (!isAllowed) {
        return false;
      }
    }

    return true;
  } catch (error) {
    // Invalid URL format
    return false;
  }
}

/**
 * Validate and parse external URL with SSRF protection
 *
 * Purpose: Safe URL parsing for external competitor/result URLs
 * in competitive analysis and SERP result extraction
 *
 * Rules:
 * - URL must be valid (RFC 3986)
 * - Scheme must be http/https
 * - Hostname must not be in blocked list
 * - Hostname must not be private IP range
 * - Optional: hostname must be in allowlist
 *
 * @param url - URL string to validate
 * @param useAllowlist - If true, only allow domains in ALLOWED_DOMAINS list (default: false for competitor analysis)
 * @returns Parsed URL object or null if validation fails
 */
export function validateExternalURL(url: string, useAllowlist: boolean = false): URL | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Trim URL
  const trimmedUrl = url.trim();

  // Validate URL format
  try {
    const parsed = new URL(trimmedUrl);

    // Check URL scheme
    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (!['http', 'https'].includes(scheme)) {
      return null;
    }

    // Reject file:// URLs
    if (BLOCKED_SCHEMES.includes(scheme)) {
      return null;
    }

    // Extract hostname
    const hostname = parsed.hostname || '';
    if (!hostname) {
      return null;
    }

    const hostnameLower = hostname.toLowerCase();

    // Check blocklist
    if (BLOCKED_DOMAINS.includes(hostnameLower)) {
      return null;
    }

    // Check if blocked IP range
    if (isBlockedIPRange(hostnameLower)) {
      return null;
    }

    // Check IPv6 blocklist
    if (isIPv6(hostnameLower)) {
      if (hostnameLower === '::1' || hostnameLower.startsWith('fe80:') || hostnameLower.startsWith('fc00:')) {
        return null;
      }
    }

    // If allowlist enabled, check against allowed domains
    if (useAllowlist) {
      const isAllowed = ALLOWED_DOMAINS.some((allowedDomain) => {
        const allowed = allowedDomain.toLowerCase();
        return (
          hostnameLower === allowed ||
          hostnameLower.endsWith(`.${allowed}`) ||
          hostnameLower === `www.${allowed}` ||
          hostnameLower.endsWith(`.www.${allowed}`)
        );
      });

      if (!isAllowed) {
        return null;
      }
    }

    return parsed;
  } catch (error) {
    // Invalid URL
    return null;
  }
}

/**
 * Extract and validate domain from a URL
 *
 * Purpose: Safely extract domain for further processing
 *
 * @param url - URL string
 * @returns Domain name or null if invalid
 */
export function extractValidDomain(url: string): string | null {
  const parsed = validateExternalURL(url, false);
  return parsed ? parsed.hostname || null : null;
}

/**
 * Add a domain to the allowlist
 *
 * Use with caution: only add trusted external APIs
 *
 * @param domain - Domain to add to allowlist
 */
export function addToAllowlist(domain: string): void {
  const normalized = domain.toLowerCase().trim();
  if (!ALLOWED_DOMAINS.includes(normalized)) {
    ALLOWED_DOMAINS.push(normalized);
  }
}

/**
 * Check if a domain is in the allowlist
 *
 * @param domain - Domain to check
 * @returns true if domain is allowed
 */
export function isDomainAllowed(domain: string): boolean {
  const normalized = domain.toLowerCase().trim();
  return ALLOWED_DOMAINS.some((allowed) => {
    const allowedNorm = allowed.toLowerCase();
    return (
      normalized === allowedNorm ||
      normalized.endsWith(`.${allowedNorm}`) ||
      normalized === `www.${allowedNorm}` ||
      normalized.endsWith(`.www.${allowedNorm}`)
    );
  });
}

/**
 * Validate a list of URLs
 *
 * Purpose: Batch validation for multiple URLs
 *
 * @param urls - Array of URL strings
 * @param useAllowlist - Whether to enforce allowlist
 * @returns Array of validated URLs (invalid URLs filtered out)
 */
export function validateURLList(urls: string[], useAllowlist: boolean = false): URL[] {
  return urls
    .map((url) => validateExternalURL(url, useAllowlist))
    .filter((url): url is URL => url !== null);
}

/**
 * Get information about why a URL was rejected
 *
 * Purpose: Debugging and security logging
 *
 * @param url - URL that was rejected
 * @returns Reason for rejection or null if URL is valid
 */
export function getRejectionReason(url: string): string | null {
  try {
    const parsed = new URL(url);

    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (!['http', 'https'].includes(scheme)) {
      return `Invalid scheme: ${scheme}`;
    }

    const hostname = parsed.hostname || '';
    if (!hostname) {
      return 'No hostname found';
    }

    const hostnameLower = hostname.toLowerCase();

    if (BLOCKED_DOMAINS.includes(hostnameLower)) {
      return `Domain in blocklist: ${hostnameLower}`;
    }

    if (isBlockedIPRange(hostnameLower)) {
      return `IP address in blocked range: ${hostnameLower}`;
    }

    if (isIPv6(hostnameLower) && (hostnameLower === '::1' || hostnameLower.startsWith('fe80:'))) {
      return `IPv6 address in blocked range: ${hostnameLower}`;
    }

    return null; // URL is valid
  } catch (error) {
    return `Invalid URL format`;
  }
}
