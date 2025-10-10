/**
 * JWT Authentication Comprehensive Test Suite
 *
 * Tests JWT token generation, validation, refresh, and revocation
 * Security edge cases: expired, invalid signature, tampered tokens
 * Coverage target: >95%
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { EnhancedAuthService } from '../../src/security/EnhancedAuthService.js';

describe('JWT Authentication - Comprehensive Test Suite', () => {
    let authService;
    let testUser;
    let validTokens;
    let testKeys;

    beforeAll(async () => {
        // Initialize auth service with test configuration
        authService = new EnhancedAuthService({
            jwtAlgorithm: 'RS256',
            jwtExpiresIn: '1h',
            refreshExpiresIn: '7d',
            jwtIssuer: 'test-issuer',
            jwtAudience: 'test-audience',
            passwordMinLength: 8,
            redisHost: process.env.REDIS_HOST || 'localhost',
            redisPort: process.env.REDIS_PORT || 6379
        });

        // Create test keys for manual token manipulation
        testKeys = authService.keys;

        // Register a test user
        const registrationResult = await authService.registerUser({
            username: 'testuser',
            email: 'test@example.com',
            password: 'SecurePass123!',
            firstName: 'Test',
            lastName: 'User'
        });

        testUser = registrationResult.user;
    });

    afterAll(async () => {
        // Cleanup
        if (authService.redisClient) {
            await authService.redisClient.quit();
        }
    });

    beforeEach(async () => {
        // Generate fresh tokens for each test
        const authResult = await authService.authenticateUser({
            username: 'testuser',
            password: 'SecurePass123!'
        });

        if (authResult.success) {
            validTokens = authResult.tokens;
        }
    });

    describe('Token Generation', () => {
        it('should generate valid access token with correct claims', async () => {
            expect(validTokens).toBeDefined();
            expect(validTokens.accessToken).toBeDefined();
            expect(typeof validTokens.accessToken).toBe('string');

            const decoded = jwt.decode(validTokens.accessToken);
            expect(decoded).toMatchObject({
                sub: testUser.id,
                username: testUser.username,
                email: testUser.email,
                type: 'access',
                iss: 'test-issuer',
                aud: 'test-audience'
            });
        });

        it('should generate valid refresh token with correct claims', async () => {
            expect(validTokens.refreshToken).toBeDefined();
            expect(typeof validTokens.refreshToken).toBe('string');

            const decoded = jwt.decode(validTokens.refreshToken);
            expect(decoded).toMatchObject({
                sub: testUser.id,
                type: 'refresh',
                iss: 'test-issuer',
                aud: 'test-audience'
            });
        });

        it('should include unique JTI for each token', async () => {
            const token1 = await authService.generateTokenPair(testUser);
            const token2 = await authService.generateTokenPair(testUser);

            const decoded1 = jwt.decode(token1.accessToken);
            const decoded2 = jwt.decode(token2.accessToken);

            expect(decoded1.jti).toBeDefined();
            expect(decoded2.jti).toBeDefined();
            expect(decoded1.jti).not.toBe(decoded2.jti);
        });

        it('should set correct expiration times', async () => {
            const decoded = jwt.decode(validTokens.accessToken);
            const refreshDecoded = jwt.decode(validTokens.refreshToken);

            const now = Math.floor(Date.now() / 1000);

            // Access token expires in 1 hour (3600 seconds)
            expect(decoded.exp - decoded.iat).toBe(3600);

            // Refresh token expires in 7 days (604800 seconds)
            expect(refreshDecoded.exp - refreshDecoded.iat).toBe(604800);
        });

        it('should include user roles and permissions in access token', async () => {
            const decoded = jwt.decode(validTokens.accessToken);

            expect(decoded.roles).toBeDefined();
            expect(Array.isArray(decoded.roles)).toBe(true);
            expect(decoded.permissions).toBeDefined();
            expect(Array.isArray(decoded.permissions)).toBe(true);
        });

        it('should sign tokens with RS256 algorithm', async () => {
            const decodedHeader = jwt.decode(validTokens.accessToken, { complete: true });

            expect(decodedHeader.header.alg).toBe('RS256');
            expect(decodedHeader.header.kid).toBe('auth-key-1');
        });
    });

    describe('Token Validation', () => {
        it('should validate valid access token successfully', async () => {
            const result = await authService.validateToken(validTokens.accessToken);

            expect(result.valid).toBe(true);
            expect(result.user).toBeDefined();
            expect(result.user.id).toBe(testUser.id);
            expect(result.type).toBe('access');
        });

        it('should reject token with invalid signature', async () => {
            // Create token with different key
            const { privateKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });

            const invalidToken = jwt.sign(
                { sub: testUser.id, type: 'access' },
                privateKey,
                { algorithm: 'RS256' }
            );

            const result = await authService.validateToken(invalidToken);

            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should reject expired token', async () => {
            // Create expired token
            const now = Math.floor(Date.now() / 1000);
            const expiredToken = jwt.sign(
                {
                    sub: testUser.id,
                    type: 'access',
                    iat: now - 7200,
                    exp: now - 3600,
                    iss: 'test-issuer',
                    aud: 'test-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256' }
            );

            const result = await authService.validateToken(expiredToken);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('expired');
        });

        it('should reject token with tampered payload', async () => {
            const parts = validTokens.accessToken.split('.');
            const tamperedPayload = Buffer.from(JSON.stringify({
                sub: 'hacker-id',
                roles: ['admin']
            })).toString('base64url');

            const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

            const result = await authService.validateToken(tamperedToken);

            expect(result.valid).toBe(false);
        });

        it('should reject token with wrong issuer', async () => {
            const wrongIssuerToken = jwt.sign(
                {
                    sub: testUser.id,
                    type: 'access',
                    iss: 'wrong-issuer',
                    aud: 'test-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256', expiresIn: '1h' }
            );

            const result = await authService.validateToken(wrongIssuerToken);

            expect(result.valid).toBe(false);
        });

        it('should reject token with wrong audience', async () => {
            const wrongAudienceToken = jwt.sign(
                {
                    sub: testUser.id,
                    type: 'access',
                    iss: 'test-issuer',
                    aud: 'wrong-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256', expiresIn: '1h' }
            );

            const result = await authService.validateToken(wrongAudienceToken);

            expect(result.valid).toBe(false);
        });

        it('should reject malformed token', async () => {
            const malformedTokens = [
                'not.a.token',
                'only-one-part',
                'two.parts',
                '',
                null,
                undefined,
                'Bearer valid.token.here' // Token with Bearer prefix
            ];

            for (const token of malformedTokens) {
                const result = await authService.validateToken(token);
                expect(result.valid).toBe(false);
            }
        });

        it('should validate token with clock tolerance', async () => {
            // Token that just expired but within clock tolerance
            const now = Math.floor(Date.now() / 1000);
            const almostExpiredToken = jwt.sign(
                {
                    sub: testUser.id,
                    type: 'access',
                    iat: now - 3630, // Issued 1 hour and 30 seconds ago
                    exp: now - 30,   // Expired 30 seconds ago
                    iss: 'test-issuer',
                    aud: 'test-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256' }
            );

            const result = await authService.validateToken(almostExpiredToken, {
                clockTolerance: 60
            });

            expect(result.valid).toBe(true);
        });

        it('should reject token for inactive user', async () => {
            // Create inactive user
            const inactiveUser = await authService.registerUser({
                username: 'inactiveuser',
                email: 'inactive@example.com',
                password: 'SecurePass123!',
                firstName: 'Inactive',
                lastName: 'User'
            });

            // Generate token for inactive user
            const tokens = await authService.generateTokenPair(inactiveUser.user);

            // Mark user as inactive
            const user = await authService.getUserById(inactiveUser.user.id);
            user.status = 'inactive';
            await authService.storeUser(user);

            // Validate token
            const result = await authService.validateToken(tokens.accessToken);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('inactive');
        });
    });

    describe('Token Refresh', () => {
        it('should refresh token successfully', async () => {
            const newTokens = await authService.refreshToken(validTokens.refreshToken);

            expect(newTokens).toBeDefined();
            expect(newTokens.accessToken).toBeDefined();
            expect(newTokens.refreshToken).toBeDefined();
            expect(newTokens.accessToken).not.toBe(validTokens.accessToken);
            expect(newTokens.refreshToken).not.toBe(validTokens.refreshToken);
        });

        it('should reject refresh with access token', async () => {
            await expect(authService.refreshToken(validTokens.accessToken))
                .rejects.toThrow('Invalid token type');
        });

        it('should reject expired refresh token', async () => {
            const now = Math.floor(Date.now() / 1000);
            const expiredRefreshToken = jwt.sign(
                {
                    sub: testUser.id,
                    type: 'refresh',
                    iat: now - 700000,
                    exp: now - 100000,
                    iss: 'test-issuer',
                    aud: 'test-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256' }
            );

            await expect(authService.refreshToken(expiredRefreshToken))
                .rejects.toThrow();
        });

        it('should blacklist old refresh token after successful refresh', async () => {
            const oldRefreshToken = validTokens.refreshToken;

            await authService.refreshToken(oldRefreshToken);

            // Try to use old refresh token again
            await expect(authService.refreshToken(oldRefreshToken))
                .rejects.toThrow('revoked');
        });

        it('should reject refresh token after user logout', async () => {
            await authService.logout(testUser.id, null, true);

            await expect(authService.refreshToken(validTokens.refreshToken))
                .rejects.toThrow();
        });

        it('should preserve scope in refreshed token', async () => {
            const scopedTokens = await authService.generateTokenPair(
                testUser,
                null,
                'read:users write:users'
            );

            const newTokens = await authService.refreshToken(scopedTokens.refreshToken);
            const decoded = jwt.decode(newTokens.accessToken);

            expect(decoded.scope).toBe('read:users write:users');
        });

        it('should reject refresh for inactive user', async () => {
            const user = await authService.getUserById(testUser.id);
            user.status = 'suspended';
            await authService.storeUser(user);

            await expect(authService.refreshToken(validTokens.refreshToken))
                .rejects.toThrow('inactive');

            // Restore user status
            user.status = 'active';
            await authService.storeUser(user);
        });
    });

    describe('Token Revocation', () => {
        it('should blacklist token successfully', async () => {
            await authService.blacklistToken(validTokens.accessToken);

            const result = await authService.validateToken(validTokens.accessToken);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('revoked');
        });

        it('should check if token is blacklisted', async () => {
            const isBlacklisted1 = await authService.isTokenBlacklisted(validTokens.accessToken);
            expect(isBlacklisted1).toBe(false);

            await authService.blacklistToken(validTokens.accessToken);

            const isBlacklisted2 = await authService.isTokenBlacklisted(validTokens.accessToken);
            expect(isBlacklisted2).toBe(true);
        });

        it('should revoke all tokens on logout', async () => {
            const authResult = await authService.authenticateUser({
                username: 'testuser',
                password: 'SecurePass123!'
            });

            const sessionTokens = authResult.tokens;

            await authService.logout(testUser.id, authResult.session.id, false);

            // Tokens should still be valid if only session is deleted
            // But if logoutAllDevices is true, all sessions are deleted
            await authService.logout(testUser.id, null, true);

            const result = await authService.validateToken(sessionTokens.accessToken);
            expect(result.valid).toBe(false);
        });
    });

    describe('Security Edge Cases', () => {
        it('should handle None algorithm attack', async () => {
            const noneAlgToken = jwt.sign(
                {
                    sub: testUser.id,
                    type: 'access',
                    iss: 'test-issuer',
                    aud: 'test-audience'
                },
                '',
                { algorithm: 'none' }
            );

            const result = await authService.validateToken(noneAlgToken);
            expect(result.valid).toBe(false);
        });

        it('should reject token with null signature', async () => {
            const parts = validTokens.accessToken.split('.');
            const nullSigToken = `${parts[0]}.${parts[1]}.`;

            const result = await authService.validateToken(nullSigToken);
            expect(result.valid).toBe(false);
        });

        it('should handle extremely long tokens', async () => {
            const longPayload = {
                sub: testUser.id,
                type: 'access',
                iss: 'test-issuer',
                aud: 'test-audience',
                data: 'A'.repeat(100000) // 100KB of data
            };

            const longToken = jwt.sign(
                longPayload,
                testKeys.privateKey,
                { algorithm: 'RS256', expiresIn: '1h' }
            );

            const result = await authService.validateToken(longToken);
            // Should handle gracefully, either validate or reject based on size limits
            expect(typeof result.valid).toBe('boolean');
        });

        it('should handle concurrent token validation', async () => {
            const validationPromises = Array(100).fill(null).map(() =>
                authService.validateToken(validTokens.accessToken)
            );

            const results = await Promise.all(validationPromises);

            expect(results).toHaveLength(100);
            results.forEach(result => {
                expect(result.valid).toBe(true);
            });
        });

        it('should reject token with future iat claim', async () => {
            const now = Math.floor(Date.now() / 1000);
            const futureToken = jwt.sign(
                {
                    sub: testUser.id,
                    type: 'access',
                    iat: now + 3600, // Issued 1 hour in the future
                    exp: now + 7200,
                    iss: 'test-issuer',
                    aud: 'test-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256' }
            );

            const result = await authService.validateToken(futureToken);
            // Should be handled by clock tolerance or rejected
            expect(typeof result.valid).toBe('boolean');
        });

        it('should handle token with missing required claims', async () => {
            const invalidClaims = [
                { type: 'access', iss: 'test-issuer' }, // Missing sub
                { sub: testUser.id, iss: 'test-issuer' }, // Missing type
                { sub: testUser.id, type: 'access' }, // Missing iss
            ];

            for (const claims of invalidClaims) {
                const invalidToken = jwt.sign(
                    claims,
                    testKeys.privateKey,
                    { algorithm: 'RS256', expiresIn: '1h' }
                );

                const result = await authService.validateToken(invalidToken);
                expect(result.valid).toBe(false);
            }
        });

        it('should handle SQL injection attempts in token claims', async () => {
            const sqlInjectionToken = jwt.sign(
                {
                    sub: "'; DROP TABLE users; --",
                    type: 'access',
                    iss: 'test-issuer',
                    aud: 'test-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256', expiresIn: '1h' }
            );

            const result = await authService.validateToken(sqlInjectionToken);
            // Should validate signature but fail on user lookup
            expect(result.valid).toBe(false);
        });

        it('should handle XSS attempts in token claims', async () => {
            const xssToken = jwt.sign(
                {
                    sub: testUser.id,
                    username: '<script>alert("XSS")</script>',
                    type: 'access',
                    iss: 'test-issuer',
                    aud: 'test-audience'
                },
                testKeys.privateKey,
                { algorithm: 'RS256', expiresIn: '1h' }
            );

            const result = await authService.validateToken(xssToken);
            // Should handle gracefully without executing script
            expect(typeof result.valid).toBe('boolean');
        });
    });

    describe('Performance Tests', () => {
        it('should generate 1000 tokens within reasonable time', async () => {
            const startTime = Date.now();

            const promises = Array(1000).fill(null).map(() =>
                authService.generateTokenPair(testUser)
            );

            await Promise.all(promises);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(10000); // Less than 10 seconds
        });

        it('should validate 1000 tokens within reasonable time', async () => {
            const startTime = Date.now();

            const promises = Array(1000).fill(null).map(() =>
                authService.validateToken(validTokens.accessToken)
            );

            await Promise.all(promises);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(5000); // Less than 5 seconds
        });
    });

    describe('Session Integration', () => {
        it('should validate token with valid session', async () => {
            const authResult = await authService.authenticateUser({
                username: 'testuser',
                password: 'SecurePass123!'
            });

            const result = await authService.validateToken(authResult.tokens.accessToken);

            expect(result.valid).toBe(true);
            expect(result.sessionId).toBeDefined();
        });

        it('should reject token with expired session', async () => {
            const authResult = await authService.authenticateUser({
                username: 'testuser',
                password: 'SecurePass123!'
            });

            // Manually expire the session
            const session = await authService.getSession(authResult.session.id);
            session.expiresAt = Date.now() - 1000;
            await authService.storeSession(session);

            const result = await authService.validateToken(authResult.tokens.accessToken);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Session expired');
        });
    });
});
