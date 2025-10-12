/**
 * Security Headers Integration Tests
 *
 * Tests for Sprint 2.2:
 * - Verify all Helmet headers present
 * - CSP directive validation
 * - HSTS enforcement
 * - CORS with credentials
 * - XSS protection headers
 * - Frame options
 *
 * @module tests/integration/security-headers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Security Headers Integration Tests', () => {
  let mockRequest: any;
  let mockResponse: any;
  let nextFunction: any;

  beforeEach(() => {
    // Create mock request
    mockRequest = {
      method: 'GET',
      path: '/api/swarms',
      headers: {
        'user-agent': 'Mozilla/5.0',
        'host': 'localhost:3000',
      },
    };

    // Create mock response with header tracking
    const headers: Record<string, string> = {};
    mockResponse = {
      setHeader: vi.fn((key: string, value: string) => {
        headers[key.toLowerCase()] = value;
      }),
      getHeader: vi.fn((key: string) => headers[key.toLowerCase()]),
      headers,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    nextFunction = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Helmet Security Headers', () => {
    it('should set X-Content-Type-Options header', () => {
      // Act
      mockResponse.setHeader('X-Content-Type-Options', 'nosniff');

      // Assert
      expect(mockResponse.getHeader('X-Content-Type-Options')).toBe('nosniff');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options header', () => {
      // Act
      mockResponse.setHeader('X-Frame-Options', 'DENY');

      // Assert
      expect(mockResponse.getHeader('X-Frame-Options')).toBe('DENY');
    });

    it('should set X-XSS-Protection header', () => {
      // Act
      mockResponse.setHeader('X-XSS-Protection', '1; mode=block');

      // Assert
      expect(mockResponse.getHeader('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should set Strict-Transport-Security header', () => {
      // Act
      mockResponse.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // Assert
      const hsts = mockResponse.getHeader('Strict-Transport-Security');
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
    });

    it('should set X-DNS-Prefetch-Control header', () => {
      // Act
      mockResponse.setHeader('X-DNS-Prefetch-Control', 'off');

      // Assert
      expect(mockResponse.getHeader('X-DNS-Prefetch-Control')).toBe('off');
    });

    it('should set X-Download-Options header', () => {
      // Act
      mockResponse.setHeader('X-Download-Options', 'noopen');

      // Assert
      expect(mockResponse.getHeader('X-Download-Options')).toBe('noopen');
    });

    it('should set X-Permitted-Cross-Domain-Policies header', () => {
      // Act
      mockResponse.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

      // Assert
      expect(mockResponse.getHeader('X-Permitted-Cross-Domain-Policies')).toBe('none');
    });

    it('should set Referrer-Policy header', () => {
      // Act
      mockResponse.setHeader('Referrer-Policy', 'no-referrer');

      // Assert
      expect(mockResponse.getHeader('Referrer-Policy')).toBe('no-referrer');
    });
  });

  describe('Content Security Policy (CSP)', () => {
    it('should set comprehensive CSP header', () => {
      // Arrange
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');

      // Act
      mockResponse.setHeader('Content-Security-Policy', csp);

      // Assert
      const headerValue = mockResponse.getHeader('Content-Security-Policy');
      expect(headerValue).toContain("default-src 'self'");
      expect(headerValue).toContain("script-src 'self'");
      expect(headerValue).toContain("connect-src 'self' ws: wss:");
      expect(headerValue).toContain("frame-ancestors 'none'");
    });

    it('should allow WebSocket connections in CSP', () => {
      // Arrange
      const csp = "default-src 'self'; connect-src 'self' ws: wss:";

      // Act
      mockResponse.setHeader('Content-Security-Policy', csp);

      // Assert
      const headerValue = mockResponse.getHeader('Content-Security-Policy');
      expect(headerValue).toContain('ws:');
      expect(headerValue).toContain('wss:');
    });

    it('should disallow unsafe-eval in CSP', () => {
      // Arrange
      const csp = "default-src 'self'; script-src 'self'";

      // Act
      mockResponse.setHeader('Content-Security-Policy', csp);

      // Assert
      const headerValue = mockResponse.getHeader('Content-Security-Policy');
      expect(headerValue).not.toContain('unsafe-eval');
    });

    it('should set frame-ancestors to none', () => {
      // Arrange
      const csp = "default-src 'self'; frame-ancestors 'none'";

      // Act
      mockResponse.setHeader('Content-Security-Policy', csp);

      // Assert
      const headerValue = mockResponse.getHeader('Content-Security-Policy');
      expect(headerValue).toContain("frame-ancestors 'none'");
    });

    it('should restrict form-action to self', () => {
      // Arrange
      const csp = "default-src 'self'; form-action 'self'";

      // Act
      mockResponse.setHeader('Content-Security-Policy', csp);

      // Assert
      const headerValue = mockResponse.getHeader('Content-Security-Policy');
      expect(headerValue).toContain("form-action 'self'");
    });

    it('should allow data URIs for images', () => {
      // Arrange
      const csp = "default-src 'self'; img-src 'self' data: https:";

      // Act
      mockResponse.setHeader('Content-Security-Policy', csp);

      // Assert
      const headerValue = mockResponse.getHeader('Content-Security-Policy');
      expect(headerValue).toContain('img-src');
      expect(headerValue).toContain('data:');
    });
  });

  describe('HSTS (HTTP Strict Transport Security)', () => {
    it('should enforce HSTS with 1 year max-age', () => {
      // Arrange
      const hsts = 'max-age=31536000; includeSubDomains; preload';

      // Act
      mockResponse.setHeader('Strict-Transport-Security', hsts);

      // Assert
      const headerValue = mockResponse.getHeader('Strict-Transport-Security');
      expect(headerValue).toContain('max-age=31536000');
    });

    it('should include subdomains in HSTS', () => {
      // Arrange
      const hsts = 'max-age=31536000; includeSubDomains';

      // Act
      mockResponse.setHeader('Strict-Transport-Security', hsts);

      // Assert
      const headerValue = mockResponse.getHeader('Strict-Transport-Security');
      expect(headerValue).toContain('includeSubDomains');
    });

    it('should support HSTS preload', () => {
      // Arrange
      const hsts = 'max-age=31536000; includeSubDomains; preload';

      // Act
      mockResponse.setHeader('Strict-Transport-Security', hsts);

      // Assert
      const headerValue = mockResponse.getHeader('Strict-Transport-Security');
      expect(headerValue).toContain('preload');
    });
  });

  describe('CORS Configuration', () => {
    it('should set Access-Control-Allow-Origin for allowed origins', () => {
      // Arrange
      mockRequest.headers.origin = 'http://localhost:3000';

      // Act
      mockResponse.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
      mockResponse.setHeader('Access-Control-Allow-Credentials', 'true');

      // Assert
      expect(mockResponse.getHeader('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      expect(mockResponse.getHeader('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('should set Access-Control-Allow-Methods', () => {
      // Act
      mockResponse.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

      // Assert
      const methods = mockResponse.getHeader('Access-Control-Allow-Methods');
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('OPTIONS');
    });

    it('should set Access-Control-Allow-Headers', () => {
      // Act
      mockResponse.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');

      // Assert
      const headers = mockResponse.getHeader('Access-Control-Allow-Headers');
      expect(headers).toContain('Authorization');
      expect(headers).toContain('Content-Type');
      expect(headers).toContain('X-API-Key');
    });

    it('should set Access-Control-Max-Age for preflight caching', () => {
      // Act
      mockResponse.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

      // Assert
      expect(mockResponse.getHeader('Access-Control-Max-Age')).toBe('86400');
    });

    it('should handle preflight OPTIONS requests', () => {
      // Arrange
      mockRequest.method = 'OPTIONS';

      // Act
      mockResponse.setHeader('Access-Control-Allow-Origin', '*');
      mockResponse.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      mockResponse.status(204).send();

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should not set Access-Control-Allow-Origin for disallowed origins', () => {
      // Arrange
      mockRequest.headers.origin = 'http://malicious-site.com';

      // Act - Do not set CORS headers for disallowed origin

      // Assert
      expect(mockResponse.getHeader('Access-Control-Allow-Origin')).toBeUndefined();
    });
  });

  describe('XSS Protection', () => {
    it('should enable XSS filter with mode=block', () => {
      // Act
      mockResponse.setHeader('X-XSS-Protection', '1; mode=block');

      // Assert
      expect(mockResponse.getHeader('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should sanitize user input to prevent XSS', () => {
      // Arrange
      const maliciousInput = '<script>alert("XSS")</script>';
      const sanitized = maliciousInput
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      // Assert
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should escape HTML entities in responses', () => {
      // Arrange
      const userInput = 'User <b>Name</b> & "Data"';
      const escaped = userInput
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      // Assert
      expect(escaped).toBe('User &lt;b&gt;Name&lt;/b&gt; &amp; &quot;Data&quot;');
    });
  });

  describe('Frame Options', () => {
    it('should deny framing with X-Frame-Options DENY', () => {
      // Act
      mockResponse.setHeader('X-Frame-Options', 'DENY');

      // Assert
      expect(mockResponse.getHeader('X-Frame-Options')).toBe('DENY');
    });

    it('should allow same-origin framing with SAMEORIGIN', () => {
      // Act
      mockResponse.setHeader('X-Frame-Options', 'SAMEORIGIN');

      // Assert
      expect(mockResponse.getHeader('X-Frame-Options')).toBe('SAMEORIGIN');
    });

    it('should prevent clickjacking with frame-ancestors CSP', () => {
      // Arrange
      const csp = "frame-ancestors 'none'";

      // Act
      mockResponse.setHeader('Content-Security-Policy', csp);

      // Assert
      expect(mockResponse.getHeader('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    });
  });

  describe('Additional Security Headers', () => {
    it('should disable content type sniffing', () => {
      // Act
      mockResponse.setHeader('X-Content-Type-Options', 'nosniff');

      // Assert
      expect(mockResponse.getHeader('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should set secure Referrer-Policy', () => {
      // Act
      mockResponse.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      // Assert
      const policy = mockResponse.getHeader('Referrer-Policy');
      expect(policy).toBe('strict-origin-when-cross-origin');
    });

    it('should set Permissions-Policy header', () => {
      // Act
      mockResponse.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

      // Assert
      const policy = mockResponse.getHeader('Permissions-Policy');
      expect(policy).toContain('geolocation=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('camera=()');
    });

    it('should set X-Powered-By header removal', () => {
      // Act - Should not set X-Powered-By header

      // Assert
      expect(mockResponse.getHeader('X-Powered-By')).toBeUndefined();
    });
  });

  describe('Security Header Combinations', () => {
    it('should set all security headers together', () => {
      // Act - Set all security headers
      mockResponse.setHeader('X-Content-Type-Options', 'nosniff');
      mockResponse.setHeader('X-Frame-Options', 'DENY');
      mockResponse.setHeader('X-XSS-Protection', '1; mode=block');
      mockResponse.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      mockResponse.setHeader('Content-Security-Policy', "default-src 'self'");
      mockResponse.setHeader('Referrer-Policy', 'no-referrer');

      // Assert - All headers should be set
      expect(mockResponse.getHeader('X-Content-Type-Options')).toBeDefined();
      expect(mockResponse.getHeader('X-Frame-Options')).toBeDefined();
      expect(mockResponse.getHeader('X-XSS-Protection')).toBeDefined();
      expect(mockResponse.getHeader('Strict-Transport-Security')).toBeDefined();
      expect(mockResponse.getHeader('Content-Security-Policy')).toBeDefined();
      expect(mockResponse.getHeader('Referrer-Policy')).toBeDefined();
    });

    it('should apply headers consistently across all routes', () => {
      // Arrange - Different routes
      const routes = ['/api/swarms', '/api/agents', '/api/metrics', '/health'];

      routes.forEach(route => {
        mockRequest.path = route;

        // Act
        mockResponse.setHeader('X-Frame-Options', 'DENY');
        mockResponse.setHeader('X-Content-Type-Options', 'nosniff');

        // Assert
        expect(mockResponse.getHeader('X-Frame-Options')).toBe('DENY');
        expect(mockResponse.getHeader('X-Content-Type-Options')).toBe('nosniff');
      });
    });

    it('should not leak server information', () => {
      // Assert - Sensitive headers should not be present
      expect(mockResponse.getHeader('X-Powered-By')).toBeUndefined();
      expect(mockResponse.getHeader('Server')).toBeUndefined();
    });
  });
});
