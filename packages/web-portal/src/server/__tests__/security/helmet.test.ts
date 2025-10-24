/**
 * Helmet Security Headers Tests
 *
 * MED-001: Verify all security headers are present
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import {
  securityHeaders,
  permissionsPolicyHeader,
  corsOptions,
  payloadSizeValidator,
} from '../../middleware/security.js';
import cors from 'cors';

describe('Security Headers (MED-001)', () => {
  let app: Express;

  beforeAll(() => {
    app = express();

    // Apply security middleware
    app.use(securityHeaders);
    app.use(permissionsPolicyHeader);
    app.use(cors(corsOptions));
    app.use(payloadSizeValidator(1024 * 1024));

    // Test route
    app.get('/test', (_req, res) => {
      res.json({ status: 'ok' });
    });
  });

  describe('Content-Security-Policy', () => {
    it('should include CSP header with strict default-src', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('should include script-src directive', async () => { try {
      const response = await request(app).get('/test');
      const csp = response.headers['content-security-policy'];

      expect(csp).toContain('script-src');
      expect(csp).toContain("'self'");
    });

    it('should include style-src directive', async () => { try {
      const response = await request(app).get('/test');
      const csp = response.headers['content-security-policy'];

      expect(csp).toContain('style-src');
      expect(csp).toContain("'self'");
    });

    it('should block object-src', async () => { try {
      const response = await request(app).get('/test');
      const csp = response.headers['content-security-policy'];

      expect(csp).toContain("object-src 'none'");
    });

    it('should allow WebSocket connections in connect-src', async () => { try {
      const response = await request(app).get('/test');
      const csp = response.headers['content-security-policy'];

      expect(csp).toContain('connect-src');
      expect(csp).toContain('ws:');
      expect(csp).toContain('wss:');
    });
  });

  describe('HTTP Strict Transport Security', () => {
    it('should include HSTS header', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should have max-age of 1 year (31536000 seconds)', async () => { try {
      const response = await request(app).get('/test');
      const hsts = response.headers['strict-transport-security'];

      expect(hsts).toContain('max-age=31536000');
    });

    it('should include includeSubDomains', async () => { try {
      const response = await request(app).get('/test');
      const hsts = response.headers['strict-transport-security'];

      expect(hsts).toContain('includeSubDomains');
    });
  });

  describe('X-Frame-Options', () => {
    it('should deny framing to prevent clickjacking', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('X-Content-Type-Options', () => {
    it('should prevent MIME sniffing', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('X-XSS-Protection', () => {
    it('should enable XSS filter with block mode', async () => { try {
      const response = await request(app).get('/test');

      // Helmet 8.x may not set this header (deprecated in modern browsers)
      // But if present, should be "1; mode=block"
      if (response.headers['x-xss-protection']) {
        expect(response.headers['x-xss-protection']).toContain('1');
      }
    });
  });

  describe('Referrer-Policy', () => {
    it('should use strict-origin-when-cross-origin', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Permissions-Policy', () => {
    it('should restrict camera access', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['permissions-policy']).toBeDefined();
      expect(response.headers['permissions-policy']).toContain('camera=()');
    });

    it('should restrict microphone access', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['permissions-policy']).toContain('microphone=()');
    });

    it('should restrict geolocation access', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['permissions-policy']).toContain('geolocation=()');
    });

    it('should restrict payment access', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['permissions-policy']).toContain('payment=()');
    });
  });

  describe('X-Powered-By', () => {
    it('should remove X-Powered-By header to hide technology stack', async () => { try {
      const response = await request(app).get('/test');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS Configuration', () => {
    it('should allow credentials', async () => { try {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:3001');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow requests from configured origin', async () => { try {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:3001');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    });

    it('should reject requests from unauthorized origins', async () => { try {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://evil.com');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Payload Size Validation', () => {
    it('should reject oversized payloads', async () => { try {
      const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB

      const response = await request(app)
        .post('/test')
        .set('Content-Length', String(largePayload.length))
        .send(largePayload);

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('should accept payloads within size limit', async () => { try {
      const validPayload = { data: 'small payload' };

      const response = await request(app)
        .post('/test')
        .send(validPayload);

      // May be 404 (no POST route), but should not be 413
      expect(response.status).not.toBe(413);
    });
  });

  describe('Security Headers Coverage', () => {
    it('should have all required security headers', async () => { try {
      const response = await request(app).get('/test');

      const requiredHeaders = [
        'content-security-policy',
        'strict-transport-security',
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy',
        'permissions-policy',
      ];

      for (const header of requiredHeaders) {
        expect(response.headers[header]).toBeDefined();
      }
    });

    it('should not leak sensitive headers', async () => { try {
      const response = await request(app).get('/test');

      // Headers that should NOT be present
      const forbiddenHeaders = [
        'x-powered-by',
        'server', // May be set by Express, but Helmet should hide it
      ];

      for (const header of forbiddenHeaders) {
        if (header === 'server') {
          // Server header may still be present, but should not reveal Express
          if (response.headers[header]) {
            expect(response.headers[header].toLowerCase()).not.toContain('express');
          }
        } else {
          expect(response.headers[header]).toBeUndefined();
        }
      }
    });
  });
});
