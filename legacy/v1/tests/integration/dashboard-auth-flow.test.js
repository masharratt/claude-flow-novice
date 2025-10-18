/**
 * Dashboard Authentication Flow Integration Test Suite
 *
 * End-to-end tests for dashboard authentication flow
 * Tests Memory→ACL→Encryption integration
 * Multi-instance cache invalidation under load
 * Coverage target: >95%
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { EnhancedAuthService } from '../../src/security/EnhancedAuthService.js';
import { EncryptionService } from '../../src/security/EncryptionService.js';
import { connectRedis } from '../../src/cli/utils/redis-client.js';
import http from 'http';
import { WebSocket } from 'ws';

describe('Dashboard Authentication Flow - Integration Tests', () => {
    let authService;
    let encryptionService;
    let redisClient;
    let dashboardServer;
    let wsServer;
    let testUser;
    let adminUser;
    let testTokens;

    beforeAll(async () => {
        // Initialize services
        authService = new EnhancedAuthService({
            jwtAlgorithm: 'RS256',
            jwtExpiresIn: '1h',
            refreshExpiresIn: '7d',
            sessionTimeout: 30 * 60 * 1000,
            redisHost: process.env.REDIS_HOST || 'localhost',
            redisPort: process.env.REDIS_PORT || 6379
        });

        encryptionService = new EncryptionService({
            algorithm: 'aes-256-gcm',
            keyDerivation: 'pbkdf2'
        });

        await encryptionService.initialize();

        redisClient = await connectRedis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379
        });

        // Create test users
        const userResult = await authService.registerUser({
            username: 'dashboarduser',
            email: 'dashboard@example.com',
            password: 'SecurePass123!',
            firstName: 'Dashboard',
            lastName: 'User',
            roles: ['user']
        });
        testUser = userResult.user;

        const adminResult = await authService.registerUser({
            username: 'dashboardadmin',
            email: 'admin@example.com',
            password: 'AdminPass123!',
            firstName: 'Admin',
            lastName: 'User',
            roles: ['admin']
        });
        adminUser = adminResult.user;
    });

    afterAll(async () => {
        if (dashboardServer) {
            dashboardServer.close();
        }
        if (wsServer) {
            wsServer.close();
        }
        if (redisClient) {
            await redisClient.quit();
        }
        if (authService.redisClient) {
            await authService.redisClient.quit();
        }
    });

    beforeEach(async () => {
        // Authenticate user before each test
        const authResult = await authService.authenticateUser({
            username: 'dashboarduser',
            password: 'SecurePass123!'
        });
        testTokens = authResult.tokens;
    });

    describe('End-to-End Authentication Flow', () => {
        it('should complete full authentication flow from login to dashboard access', async () => {
            // Step 1: User login
            const loginResult = await authService.authenticateUser({
                username: 'dashboarduser',
                password: 'SecurePass123!'
            });

            expect(loginResult.success).toBe(true);
            expect(loginResult.tokens).toBeDefined();
            expect(loginResult.session).toBeDefined();

            // Step 2: Validate access token
            const validationResult = await authService.validateToken(loginResult.tokens.accessToken);

            expect(validationResult.valid).toBe(true);
            expect(validationResult.user.id).toBe(testUser.id);

            // Step 3: Store session in Redis
            const sessionKey = `session:${loginResult.session.id}`;
            const sessionExists = await redisClient.exists(sessionKey);
            expect(sessionExists).toBe(1);

            // Step 4: Encrypt sensitive dashboard data
            const dashboardData = {
                userId: testUser.id,
                preferences: { theme: 'dark' },
                metrics: { loginCount: 1 }
            };

            const encrypted = await encryptionService.encrypt(JSON.stringify(dashboardData));
            expect(encrypted.encrypted).toBeDefined();
            expect(encrypted.tag).toBeDefined();

            // Step 5: Store encrypted data in Redis
            await redisClient.set(
                `dashboard:${testUser.id}`,
                JSON.stringify(encrypted)
            );

            // Step 6: Retrieve and decrypt
            const storedData = await redisClient.get(`dashboard:${testUser.id}`);
            const parsedEncrypted = JSON.parse(storedData);
            const decrypted = await encryptionService.decrypt(
                parsedEncrypted.encrypted,
                parsedEncrypted.iv,
                parsedEncrypted.tag
            );

            const retrievedData = JSON.parse(decrypted);
            expect(retrievedData.userId).toBe(testUser.id);

            // Step 7: Logout
            await authService.logout(testUser.id, loginResult.session.id);

            const sessionExistsAfterLogout = await redisClient.exists(sessionKey);
            expect(sessionExistsAfterLogout).toBe(0);
        });

        it('should handle MFA flow in dashboard authentication', async () => {
            // Step 1: Setup MFA for user
            const mfaSetup = await authService.setupMFA(testUser.id, 'totp');

            expect(mfaSetup.secret).toBeDefined();
            expect(mfaSetup.qrCode).toBeDefined();
            expect(mfaSetup.backupCodes).toBeDefined();

            // Step 2: Enable MFA with verification
            // Note: In real scenario, user would scan QR code and provide TOTP token
            // For testing, we'll use a mock verification token
            const speakeasy = await import('speakeasy');
            const token = speakeasy.totp({
                secret: mfaSetup.secret,
                encoding: 'base32'
            });

            await authService.enableMFA(testUser.id, token, mfaSetup.backupCodes);

            // Step 3: Login with MFA
            const loginAttempt = await authService.authenticateUser({
                username: 'dashboarduser',
                password: 'SecurePass123!'
            });

            expect(loginAttempt.requiresMFA).toBe(true);

            // Step 4: Complete MFA
            const mfaToken = speakeasy.totp({
                secret: mfaSetup.secret,
                encoding: 'base32'
            });

            const mfaLoginResult = await authService.authenticateUser({
                username: 'dashboarduser',
                password: 'SecurePass123!',
                mfaToken
            });

            expect(mfaLoginResult.success).toBe(true);
            expect(mfaLoginResult.tokens).toBeDefined();

            // Cleanup: Disable MFA
            const user = await authService.getUserById(testUser.id);
            user.mfaEnabled = false;
            await authService.storeUser(user);
        });

        it('should enforce role-based access control in dashboard', async () => {
            // User with 'user' role
            const userTokens = await authService.generateTokenPair(testUser);
            const userValidation = await authService.validateToken(userTokens.accessToken);

            expect(userValidation.user.roles).toContain('user');
            expect(userValidation.user.roles).not.toContain('admin');

            // User with 'admin' role
            const adminTokens = await authService.generateTokenPair(adminUser);
            const adminValidation = await authService.validateToken(adminTokens.accessToken);

            expect(adminValidation.user.roles).toContain('admin');

            // Simulate ACL check
            const hasAdminAccess = (roles) => roles.includes('admin');

            expect(hasAdminAccess(userValidation.user.roles)).toBe(false);
            expect(hasAdminAccess(adminValidation.user.roles)).toBe(true);
        });

        it('should handle session timeout gracefully', async () => {
            // Create short-lived session
            const authResult = await authService.authenticateUser({
                username: 'dashboarduser',
                password: 'SecurePass123!'
            });

            const session = await authService.getSession(authResult.session.id);

            // Manually expire session
            session.expiresAt = Date.now() - 1000;
            await authService.storeSession(session);

            // Try to validate token with expired session
            const validationResult = await authService.validateToken(authResult.tokens.accessToken);

            expect(validationResult.valid).toBe(false);
            expect(validationResult.error).toContain('Session expired');
        });
    });

    describe('Memory→ACL→Encryption Integration', () => {
        it('should integrate memory management with ACL and encryption', async () => {
            // Step 1: Authenticate user
            const authResult = await authService.authenticateUser({
                username: 'dashboarduser',
                password: 'SecurePass123!'
            });

            // Step 2: Create user-specific encrypted memory
            const sensitiveData = {
                userId: testUser.id,
                apiKeys: ['key1', 'key2'],
                preferences: { notifications: true }
            };

            const encrypted = await encryptionService.encrypt(JSON.stringify(sensitiveData));

            // Step 3: Store with ACL-style key structure
            const aclKey = `memory:${testUser.id}:private:settings`;
            await redisClient.set(aclKey, JSON.stringify(encrypted));

            // Step 4: Retrieve with ACL verification
            const canAccess = (userId, requestedUserId, accessLevel) => {
                return userId === requestedUserId && accessLevel === 'private';
            };

            const hasAccess = canAccess(testUser.id, testUser.id, 'private');
            expect(hasAccess).toBe(true);

            // Step 5: Decrypt if access granted
            if (hasAccess) {
                const storedEncrypted = await redisClient.get(aclKey);
                const parsedEncrypted = JSON.parse(storedEncrypted);
                const decrypted = await encryptionService.decrypt(
                    parsedEncrypted.encrypted,
                    parsedEncrypted.iv,
                    parsedEncrypted.tag
                );

                const retrievedData = JSON.parse(decrypted);
                expect(retrievedData.userId).toBe(testUser.id);
                expect(retrievedData.apiKeys).toEqual(['key1', 'key2']);
            }

            // Step 6: Verify access denial for unauthorized user
            const unauthorizedAccess = canAccess(adminUser.id, testUser.id, 'private');
            expect(unauthorizedAccess).toBe(false);
        });

        it('should handle multi-level ACL permissions', async () => {
            const aclLevels = [
                { level: 'public', canRead: true, canWrite: false },
                { level: 'team', canRead: true, canWrite: true },
                { level: 'private', canRead: true, canWrite: true },
                { level: 'system', canRead: false, canWrite: false }
            ];

            for (const acl of aclLevels) {
                const key = `memory:test:${acl.level}:data`;
                const data = { level: acl.level, timestamp: Date.now() };

                if (acl.canWrite) {
                    const encrypted = await encryptionService.encrypt(JSON.stringify(data));
                    await redisClient.set(key, JSON.stringify(encrypted));
                }

                if (acl.canRead) {
                    const storedData = await redisClient.get(key);
                    if (storedData) {
                        const parsed = JSON.parse(storedData);
                        const decrypted = await encryptionService.decrypt(
                            parsed.encrypted,
                            parsed.iv,
                            parsed.tag
                        );
                        const retrieved = JSON.parse(decrypted);
                        expect(retrieved.level).toBe(acl.level);
                    }
                }
            }
        });

        it('should validate encryption integrity with ACL', async () => {
            const data = { userId: testUser.id, secret: 'confidential' };
            const encrypted = await encryptionService.encrypt(JSON.stringify(data));

            // Store encrypted data
            await redisClient.set('memory:encrypted:test', JSON.stringify(encrypted));

            // Retrieve and verify integrity
            const stored = await redisClient.get('memory:encrypted:test');
            const parsed = JSON.parse(stored);

            expect(parsed.encrypted).toBeDefined();
            expect(parsed.iv).toBeDefined();
            expect(parsed.tag).toBeDefined();

            // Decrypt successfully
            const decrypted = await encryptionService.decrypt(
                parsed.encrypted,
                parsed.iv,
                parsed.tag
            );

            expect(JSON.parse(decrypted).secret).toBe('confidential');

            // Tamper with encrypted data
            parsed.encrypted = parsed.encrypted.substring(0, parsed.encrypted.length - 10) + 'TAMPERED12';

            // Decryption should fail
            await expect(
                encryptionService.decrypt(parsed.encrypted, parsed.iv, parsed.tag)
            ).rejects.toThrow();
        });
    });

    describe('Multi-Instance Cache Invalidation', () => {
        it('should invalidate cache across multiple instances', async () => {
            // Simulate multiple dashboard instances
            const instances = ['instance-1', 'instance-2', 'instance-3'];

            // Each instance caches user session
            for (const instance of instances) {
                const cacheKey = `cache:${instance}:user:${testUser.id}`;
                await redisClient.set(cacheKey, JSON.stringify({
                    userId: testUser.id,
                    cached: true,
                    timestamp: Date.now()
                }));
            }

            // Verify caches exist
            for (const instance of instances) {
                const exists = await redisClient.exists(`cache:${instance}:user:${testUser.id}`);
                expect(exists).toBe(1);
            }

            // Invalidate cache across all instances
            const invalidationKey = 'cache:invalidation';
            await redisClient.publish(invalidationKey, JSON.stringify({
                userId: testUser.id,
                action: 'logout',
                timestamp: Date.now()
            }));

            // Simulate cache invalidation
            const pattern = `cache:*:user:${testUser.id}`;
            const keys = await redisClient.keys(pattern);
            for (const key of keys) {
                await redisClient.del(key);
            }

            // Verify caches are invalidated
            for (const instance of instances) {
                const exists = await redisClient.exists(`cache:${instance}:user:${testUser.id}`);
                expect(exists).toBe(0);
            }
        });

        it('should handle cache invalidation under load', async () => {
            const numInstances = 10;
            const numUsers = 50;

            // Populate caches for multiple users across multiple instances
            const cacheOps = [];
            for (let i = 0; i < numInstances; i++) {
                for (let u = 0; u < numUsers; u++) {
                    const cacheKey = `cache:instance-${i}:user:user-${u}`;
                    cacheOps.push(
                        redisClient.set(cacheKey, JSON.stringify({
                            userId: `user-${u}`,
                            instance: `instance-${i}`,
                            data: Math.random()
                        }))
                    );
                }
            }

            await Promise.all(cacheOps);

            // Verify all caches exist
            const totalKeys = await redisClient.keys('cache:instance-*:user:*');
            expect(totalKeys.length).toBe(numInstances * numUsers);

            // Invalidate specific user's cache across all instances
            const targetUserId = 'user-25';
            const invalidateOps = [];

            for (let i = 0; i < numInstances; i++) {
                const cacheKey = `cache:instance-${i}:user:${targetUserId}`;
                invalidateOps.push(redisClient.del(cacheKey));
            }

            await Promise.all(invalidateOps);

            // Verify target user's cache is invalidated across all instances
            for (let i = 0; i < numInstances; i++) {
                const exists = await redisClient.exists(`cache:instance-${i}:user:${targetUserId}`);
                expect(exists).toBe(0);
            }

            // Verify other users' caches still exist
            const remainingKeys = await redisClient.keys('cache:instance-*:user:*');
            expect(remainingKeys.length).toBe(numInstances * (numUsers - 1));

            // Cleanup
            await redisClient.del(...remainingKeys);
        });

        it('should handle concurrent cache invalidation requests', async () => {
            // Setup caches
            const instances = Array.from({ length: 20 }, (_, i) => `instance-${i}`);

            for (const instance of instances) {
                await redisClient.set(`cache:${instance}:data`, 'cached-value');
            }

            // Concurrent invalidation from multiple sources
            const invalidationPromises = Array.from({ length: 100 }, async () => {
                const keysToInvalidate = await redisClient.keys('cache:instance-*:data');
                return Promise.all(keysToInvalidate.map(key => redisClient.del(key)));
            });

            await Promise.all(invalidationPromises);

            // Verify all caches are invalidated
            const remainingKeys = await redisClient.keys('cache:instance-*:data');
            expect(remainingKeys.length).toBe(0);
        });

        it('should use pub/sub for real-time cache invalidation', async () => {
            const subscriber = redisClient.duplicate();
            await subscriber.connect();

            const invalidationEvents = [];

            await subscriber.subscribe('cache:invalidation', (message) => {
                invalidationEvents.push(JSON.parse(message));
            });

            // Publish invalidation event
            await redisClient.publish('cache:invalidation', JSON.stringify({
                userId: testUser.id,
                action: 'update',
                timestamp: Date.now()
            }));

            // Wait for message propagation
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(invalidationEvents.length).toBeGreaterThan(0);
            expect(invalidationEvents[0].userId).toBe(testUser.id);

            await subscriber.quit();
        });
    });

    describe('Performance Under Load', () => {
        it('should handle 1000 concurrent authentication requests', async () => {
            const numRequests = 1000;
            const startTime = Date.now();

            const authPromises = Array.from({ length: numRequests }, () =>
                authService.authenticateUser({
                    username: 'dashboarduser',
                    password: 'SecurePass123!'
                })
            );

            const results = await Promise.allSettled(authPromises);

            const duration = Date.now() - startTime;
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

            expect(successCount).toBeGreaterThan(numRequests * 0.95); // 95% success rate
            expect(duration).toBeLessThan(30000); // Less than 30 seconds

            console.log(`Authenticated ${successCount}/${numRequests} requests in ${duration}ms`);
        });

        it('should handle 500 concurrent token validations', async () => {
            const numValidations = 500;
            const startTime = Date.now();

            const validationPromises = Array.from({ length: numValidations }, () =>
                authService.validateToken(testTokens.accessToken)
            );

            const results = await Promise.all(validationPromises);

            const duration = Date.now() - startTime;
            const validCount = results.filter(r => r.valid).length;

            expect(validCount).toBe(numValidations);
            expect(duration).toBeLessThan(5000); // Less than 5 seconds

            console.log(`Validated ${validCount} tokens in ${duration}ms`);
        });

        it('should handle rapid session creation and destruction', async () => {
            const numCycles = 100;
            const startTime = Date.now();

            for (let i = 0; i < numCycles; i++) {
                const authResult = await authService.authenticateUser({
                    username: 'dashboarduser',
                    password: 'SecurePass123!'
                });

                await authService.logout(testUser.id, authResult.session.id);
            }

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(20000); // Less than 20 seconds

            console.log(`Completed ${numCycles} auth/logout cycles in ${duration}ms`);
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle Redis connection failure gracefully', async () => {
            // Simulate Redis disconnection
            const originalClient = authService.redisClient;
            authService.redisClient = null;

            // Operations should fall back to in-memory storage
            const result = await authService.authenticateUser({
                username: 'dashboarduser',
                password: 'SecurePass123!'
            });

            expect(result.success).toBe(true);

            // Restore connection
            authService.redisClient = originalClient;
        });

        it('should handle encryption service failure', async () => {
            // Test with invalid encrypted data
            await expect(
                encryptionService.decrypt('invalid-data', 'invalid-iv', 'invalid-tag')
            ).rejects.toThrow();
        });

        it('should handle malformed session data', async () => {
            // Store malformed session data
            await redisClient.set('session:malformed', 'not-json-data');

            const session = await authService.getSession('malformed');

            // Should handle gracefully
            expect(session).toBeFalsy();
        });

        it('should recover from concurrent token refresh conflicts', async () => {
            const refreshPromises = Array.from({ length: 10 }, () =>
                authService.refreshToken(testTokens.refreshToken)
            );

            const results = await Promise.allSettled(refreshPromises);

            // Only one should succeed, others should fail gracefully
            const successful = results.filter(r => r.status === 'fulfilled');
            const failed = results.filter(r => r.status === 'rejected');

            expect(successful.length).toBe(1);
            expect(failed.length).toBe(9);
        });
    });
});
