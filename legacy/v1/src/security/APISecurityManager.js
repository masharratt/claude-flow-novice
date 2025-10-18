/**
 * API Security Manager
 *
 * Comprehensive API security protection including:
 * - Request validation and sanitization
 * - Advanced rate limiting with different strategies
 * - DDoS protection and traffic shaping
 * - API key management
 * - Request/response monitoring
 * - Bot detection and protection
 * - IP whitelisting/blacklisting
 * - Geographic restrictions
 */

import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { connectRedis } from '../cli/utils/redis-client.js';
import { EnhancedAuthService } from './EnhancedAuthService.js';
import { ProductionSecurityMiddleware } from './ProductionSecurityMiddleware.js';

/**
 * API Security Manager
 * Enterprise-grade API security protection
 */
export class APISecurityManager {
    constructor(config = {}) {
        this.config = {
            // Rate limiting strategies
            rateLimiting: {
                enabled: config.rateLimitingEnabled !== false,
                strategies: {
                    // Sliding window rate limiting
                    slidingWindow: {
                        enabled: config.slidingWindowEnabled !== false,
                        windowMs: config.slidingWindowMs || 60 * 1000, // 1 minute
                        maxRequests: config.slidingWindowMaxRequests || 100
                    },
                    // Fixed window rate limiting
                    fixedWindow: {
                        enabled: config.fixedWindowEnabled !== false,
                        windowMs: config.fixedWindowMs || 60 * 1000, // 1 minute
                        maxRequests: config.fixedWindowMaxRequests || 100
                    },
                    // Token bucket rate limiting
                    tokenBucket: {
                        enabled: config.tokenBucketEnabled !== false,
                        bucketSize: config.tokenBucketSize || 100,
                        refillRate: config.tokenBucketRefillRate || 10, // tokens per second
                        maxBurst: config.tokenBucketMaxBurst || 20
                    },
                    // Adaptive rate limiting based on system load
                    adaptive: {
                        enabled: config.adaptiveRateLimitingEnabled !== false,
                        baseLimit: config.adaptiveBaseLimit || 100,
                        minLimit: config.adaptiveMinLimit || 10,
                        maxLimit: config.adaptiveMaxLimit || 1000,
                        systemLoadThreshold: config.systemLoadThreshold || 0.8
                    }
                }
            },

            // DDoS protection
            ddosProtection: {
                enabled: config.ddosProtectionEnabled !== false,
                thresholds: {
                    requestsPerSecond: config.ddosRequestsPerSecond || 1000,
                    connectionsPerIP: config.ddosConnectionsPerIP || 100,
                    requestSizeThreshold: config.ddosRequestSizeThreshold || '10mb',
                    suspiciousPatternThreshold: config.ddosSuspiciousPatternThreshold || 50
                },
                mitigation: {
                    enableIPBlocking: config.ddosEnableIPBlocking !== false,
                    blockDuration: config.ddosBlockDuration || 5 * 60 * 1000, // 5 minutes
                    enableRequestThrottling: config.ddosEnableRequestThrottling !== false,
                    enableConnectionLimiting: config.ddosEnableConnectionLimiting !== false
                }
            },

            // API key management
            apiKeys: {
                enabled: config.apiKeysEnabled !== false,
                keyLength: config.apiKeyLength || 64,
                keyPrefix: config.apiKeyPrefix || 'cf_',
                maxKeysPerAccount: config.maxKeysPerAccount || 10,
                keyExpiration: config.apiKeyExpiration || 365 * 24 * 60 * 60 * 1000 // 1 year
            },

            // Bot protection
            botProtection: {
                enabled: config.botProtectionEnabled !== false,
                suspiciousPatterns: [
                    /bot|crawler|spider|scraper/i,
                    /curl|wget|python|java|node/i,
                    /python-requests|java-http|node-fetch/i,
                    /headless|phantom|selenium|puppeteer/i
                ],
                behaviorAnalysis: {
                    enabled: config.botBehaviorAnalysisEnabled !== false,
                    requestPatternWindow: config.requestPatternWindow || 60 * 1000, // 1 minute
                    maxRequestVariation: config.maxRequestVariation || 0.8,
                    minTimeBetweenRequests: config.minTimeBetweenRequests || 100 // ms
                }
            },

            // Geographic restrictions
            geoRestrictions: {
                enabled: config.geoRestrictionsEnabled !== false,
                allowedCountries: config.allowedCountries || [],
                blockedCountries: config.blockedCountries || [],
                proxyBlocking: config.proxyBlockingEnabled !== false,
                vpnBlocking: config.vpnBlockingEnabled !== false
            },

            // IP management
            ipManagement: {
                whitelist: config.ipWhitelist || [],
                blacklist: config.ipBlacklist || [],
                dynamicBlocking: {
                    enabled: config.dynamicIPBlockingEnabled !== false,
                    scoreThreshold: config.dynamicIPScoreThreshold || 100,
                    decayRate: config.dynamicIPDecayRate || 0.1
                }
            },

            // Request validation
            requestValidation: {
                maxUrlLength: config.maxUrlLength || 2048,
                maxHeaderSize: config.maxHeaderSize || 8192,
                maxPayloadSize: config.maxPayloadSize || '10mb',
                allowedMethods: config.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                allowedProtocols: config.allowedProtocols || ['https', 'http'],
                validateJSON: config.validateJSON !== false,
                sanitizeInput: config.sanitizeInput !== false
            },

            // Redis configuration
            redis: {
                host: config.redisHost || 'localhost',
                port: config.redisPort || 6379,
                password: config.redisPassword,
                db: config.redisDb || 0
            }
        };

        // Initialize components
        this.redisClient = null;
        this.authService = new EnhancedAuthService(this.config);
        this.securityMiddleware = new ProductionSecurityMiddleware(this.config);

        // Security monitoring data
        this.metrics = {
            totalRequests: 0,
            blockedRequests: 0,
            rateLimitHits: 0,
            ddosAttempts: 0,
            botRequests: 0,
            geoBlockedRequests: 0,
            ipBlockedRequests: 0,
            apiKeyValidations: 0,
            suspiciousActivities: 0,
            lastReset: Date.now()
        };

        // Rate limiters
        this.rateLimiters = new Map();
        this.tokenBuckets = new Map();

        // IP tracking
        this.ipTracker = new Map();
        this.botTracker = new Map();
        this.ddosTracker = new Map();

        // API keys storage
        this.apiKeys = new Map();
    }

    /**
     * Initialize the API security manager
     */
    async initialize() {
        try {
            // Connect to Redis
            this.redisClient = await connectRedis(this.config.redis);

            // Initialize rate limiters
            await this.initializeRateLimiters();

            // Load existing data
            await this.loadSecurityData();

            // Start monitoring processes
            this.startMonitoringProcesses();

            console.log('API Security Manager initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize APISecurityManager:', error);
            throw error;
        }
    }

    /**
     * Main API security middleware
     */
    apiSecurityMiddleware() {
        return async (req, res, next) => {
            try {
                this.metrics.totalRequests++;

                // Generate request ID
                req.requestId = crypto.randomUUID();
                res.setHeader('X-Request-ID', req.requestId);

                // Get client IP
                req.clientIP = this.getClientIP(req);

                // Basic request validation
                await this.validateRequest(req, res);

                // IP whitelist/blacklist check
                await this.checkIPRestrictions(req, res);

                // Geographic restrictions
                await this.checkGeoRestrictions(req, res);

                // Bot detection
                await this.detectBotActivity(req, res);

                // DDoS protection
                await this.checkDDoSThreats(req, res);

                // Rate limiting
                await this.applyRateLimiting(req, res);

                // API key validation (if required)
                await this.validateAPIKey(req, res);

                // Update tracking data
                await this.updateTrackingData(req);

                // Add security headers
                this.addSecurityHeaders(req, res);

                next();

            } catch (error) {
                this.handleSecurityError(req, res, error);
            }
        };
    }

    /**
     * Rate limiting middleware with multiple strategies
     */
    rateLimitingMiddleware(strategy = 'slidingWindow', options = {}) {
        return async (req, res, next) => {
            try {
                const clientIP = req.clientIP || this.getClientIP(req);
                const key = `rate_limit:${strategy}:${clientIP}`;

                switch (strategy) {
                    case 'slidingWindow':
                        await this.slidingWindowRateLimit(req, res, key, options);
                        break;
                    case 'fixedWindow':
                        await this.fixedWindowRateLimit(req, res, key, options);
                        break;
                    case 'tokenBucket':
                        await this.tokenBucketRateLimit(req, res, key, options);
                        break;
                    case 'adaptive':
                        await this.adaptiveRateLimit(req, res, key, options);
                        break;
                    default:
                        await this.slidingWindowRateLimit(req, res, key, options);
                }

                next();

            } catch (error) {
                this.handleRateLimitError(req, res, error);
            }
        };
    }

    /**
     * API key validation middleware
     */
    apiKeyMiddleware(options = {}) {
        const { required = true, roles = [], permissions = [] } = options;

        return async (req, res, next) => {
            try {
                const apiKey = this.extractAPIKey(req);

                if (!apiKey && required) {
                    return res.status(401).json({
                        error: 'API key required',
                        message: 'Please provide a valid API key'
                    });
                }

                if (apiKey) {
                    this.metrics.apiKeyValidations++;

                    const keyData = await this.validateAPIKeyData(apiKey);

                    if (!keyData) {
                        return res.status(401).json({
                            error: 'Invalid API key',
                            message: 'The provided API key is invalid or expired'
                        });
                    }

                    if (!keyData.active) {
                        return res.status(401).json({
                            error: 'API key inactive',
                            message: 'The API key has been deactivated'
                        });
                    }

                    // Check role requirements
                    if (roles.length > 0 && !roles.some(role => keyData.roles.includes(role))) {
                        return res.status(403).json({
                            error: 'Insufficient API key permissions',
                            required: roles,
                            current: keyData.roles
                        });
                    }

                    // Check permission requirements
                    if (permissions.length > 0) {
                        const hasPermission = permissions.every(permission =>
                            keyData.permissions.includes(permission)
                        );

                        if (!hasPermission) {
                            return res.status(403).json({
                                error: 'Insufficient API key permissions',
                                required: permissions,
                                current: keyData.permissions
                            });
                        }
                    }

                    // Update API key usage
                    await this.updateAPIKeyUsage(apiKey);

                    // Attach API key data to request
                    req.apiKey = keyData;
                }

                next();

            } catch (error) {
                this.handleAPIKeyError(req, res, error);
            }
        };
    }

    /**
     * DDoS protection middleware
     */
    ddosProtectionMiddleware() {
        return async (req, res, next) => {
            try {
                if (!this.config.ddosProtection.enabled) {
                    return next();
                }

                const clientIP = req.clientIP || this.getClientIP(req);
                const now = Date.now();

                // Get IP metrics
                const ipMetrics = this.ddosTracker.get(clientIP) || {
                    requestCount: 0,
                    firstSeen: now,
                    lastSeen: now,
                    suspiciousScore: 0,
                    blocked: false,
                    blockExpiry: 0
                };

                // Update request count
                ipMetrics.requestCount++;
                ipMetrics.lastSeen = now;

                // Calculate requests per second
                const timeWindow = 60 * 1000; // 1 minute
                const requestsPerSecond = ipMetrics.requestCount / (timeWindow / 1000);

                // Check for DDoS patterns
                if (requestsPerSecond > this.config.ddosProtection.thresholds.requestsPerSecond) {
                    this.metrics.ddosAttempts++;

                    // Block IP if enabled
                    if (this.config.ddosProtection.mitigation.enableIPBlocking) {
                        ipMetrics.blocked = true;
                        ipMetrics.blockExpiry = now + this.config.ddosProtection.mitigation.blockDuration;
                    }

                    await this.logSecurityEvent('ddos_attack_detected', {
                        ip: clientIP,
                        requestsPerSecond,
                        userAgent: req.get('User-Agent'),
                        endpoint: req.path
                    });

                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        message: 'Too many requests from this IP',
                        retryAfter: Math.ceil(this.config.ddosProtection.mitigation.blockDuration / 1000)
                    });
                }

                // Check suspicious patterns
                await this.checkSuspiciousPatterns(req, ipMetrics);

                // Update tracker
                this.ddosTracker.set(clientIP, ipMetrics);

                next();

            } catch (error) {
                this.handleDDoSError(req, res, error);
            }
        };
    }

    /**
     * Bot protection middleware
     */
    botProtectionMiddleware() {
        return async (req, res, next) => {
            try {
                if (!this.config.botProtection.enabled) {
                    return next();
                }

                const clientIP = req.clientIP || this.getClientIP(req);
                const userAgent = req.get('User-Agent') || '';

                // Check user agent patterns
                const isSuspiciousUA = this.config.botProtection.suspiciousPatterns.some(pattern =>
                    pattern.test(userAgent)
                );

                // Check behavior patterns
                const isSuspiciousBehavior = await this.analyzeBotBehavior(clientIP);

                if (isSuspiciousUA || isSuspiciousBehavior) {
                    this.metrics.botRequests++;

                    await this.logSecurityEvent('bot_activity_detected', {
                        ip: clientIP,
                        userAgent,
                        suspiciousUA: isSuspiciousUA,
                        suspiciousBehavior: isSuspiciousBehavior,
                        endpoint: req.path
                    });

                    // Option 1: Block with 403
                    // Option 2: Return fake data
                    // Option 3: Rate limit more strictly
                    // For now, we'll rate limit more strictly
                    req.botDetected = true;
                }

                next();

            } catch (error) {
                this.handleBotDetectionError(req, res, error);
            }
        };
    }

    // Private helper methods

    async initializeRateLimiters() {
        // Initialize Redis store for rate limiters
        const redisStore = new RedisStore({
            client: this.redisClient,
            prefix: 'rl:'
        });

        // Sliding window rate limiter
        if (this.config.rateLimiting.strategies.slidingWindow.enabled) {
            this.rateLimiters.set('slidingWindow', rateLimit({
                store: redisStore,
                windowMs: this.config.rateLimiting.strategies.slidingWindow.windowMs,
                max: this.config.rateLimiting.strategies.slidingWindow.maxRequests,
                keyGenerator: (req) => `sliding:${req.clientIP || this.getClientIP(req)}`,
                handler: this.handleRateLimitExceeded.bind(this)
            }));
        }

        // Fixed window rate limiter
        if (this.config.rateLimiting.strategies.fixedWindow.enabled) {
            this.rateLimiters.set('fixedWindow', rateLimit({
                store: redisStore,
                windowMs: this.config.rateLimiting.strategies.fixedWindow.windowMs,
                max: this.config.rateLimiting.strategies.fixedWindow.maxRequests,
                keyGenerator: (req) => `fixed:${req.clientIP || this.getClientIP(req)}`,
                handler: this.handleRateLimitExceeded.bind(this)
            }));
        }
    }

    async slidingWindowRateLimit(req, res, key, options = {}) {
        const windowMs = options.windowMs || this.config.rateLimiting.strategies.slidingWindow.windowMs;
        const maxRequests = options.maxRequests || this.config.rateLimiting.strategies.slidingWindow.maxRequests;

        const now = Date.now();
        const windowStart = now - windowMs;

        // Get current request timestamps
        const requests = await this.redisClient.zrangebyscore(key, windowStart, now);

        if (requests.length >= maxRequests) {
            this.metrics.rateLimitHits++;
            throw new Error('Rate limit exceeded (sliding window)');
        }

        // Add current request
        await this.redisClient.zadd(key, now, `${now}-${req.requestId}`);
        await this.redisClient.expire(key, Math.ceil(windowMs / 1000));

        // Clean up old entries
        await this.redisClient.zremrangebyscore(key, 0, windowStart);
    }

    async fixedWindowRateLimit(req, res, key, options = {}) {
        const windowMs = options.windowMs || this.config.rateLimiting.strategies.fixedWindow.windowMs;
        const maxRequests = options.maxRequests || this.config.rateLimiting.strategies.fixedWindow.maxRequests;

        const now = Date.now();
        const windowStart = Math.floor(now / windowMs) * windowMs;

        const currentWindow = await this.redisClient.incr(key);

        if (currentWindow === 1) {
            await this.redisClient.expire(key, Math.ceil(windowMs / 1000));
        }

        if (currentWindow > maxRequests) {
            this.metrics.rateLimitHits++;
            throw new Error('Rate limit exceeded (fixed window)');
        }
    }

    async tokenBucketRateLimit(req, res, key, options = {}) {
        const bucketSize = options.bucketSize || this.config.rateLimiting.strategies.tokenBucket.bucketSize;
        const refillRate = options.refillRate || this.config.rateLimiting.strategies.tokenBucket.refillRate;
        const maxBurst = options.maxBurst || this.config.rateLimiting.strategies.tokenBucket.maxBurst;

        const now = Date.now();
        const bucket = this.tokenBuckets.get(key) || {
            tokens: bucketSize,
            lastRefill: now
        };

        // Refill tokens based on time elapsed
        const timeSinceLastRefill = (now - bucket.lastRefill) / 1000;
        const tokensToAdd = timeSinceLastRefill * refillRate;

        bucket.tokens = Math.min(bucketSize, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;

        // Check if tokens available
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            this.tokenBuckets.set(key, bucket);
        } else {
            this.metrics.rateLimitHits++;
            throw new Error('Rate limit exceeded (token bucket)');
        }
    }

    async adaptiveRateLimit(req, res, key, options = {}) {
        const baseLimit = options.baseLimit || this.config.rateLimiting.strategies.adaptive.baseLimit;
        const minLimit = options.minLimit || this.config.rateLimiting.strategies.adaptive.minLimit;
        const maxLimit = options.maxLimit || this.config.rateLimiting.strategies.adaptive.maxLimit;
        const systemLoadThreshold = options.systemLoadThreshold || this.config.rateLimiting.strategies.adaptive.systemLoadThreshold;

        // Get system load (simplified)
        const systemLoad = await this.getSystemLoad();

        // Calculate dynamic limit
        let dynamicLimit = baseLimit;

        if (systemLoad > systemLoadThreshold) {
            // Reduce limit based on system load
            const loadFactor = Math.min(2, systemLoad);
            dynamicLimit = Math.max(minLimit, Math.floor(baseLimit / loadFactor));
        } else if (systemLoad < 0.5) {
            // Increase limit if system is underutilized
            const loadFactor = Math.max(0.5, systemLoad);
            dynamicLimit = Math.min(maxLimit, Math.floor(baseLimit / loadFactor));
        }

        // Apply sliding window with dynamic limit
        await this.slidingWindowRateLimit(req, res, key, { maxRequests: dynamicLimit });
    }

    getClientIP(req) {
        return req.ip ||
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.headers['x-client-ip'] ||
            req.headers['x-forwarded'] ||
            req.headers['forwarded-for'] ||
            req.headers['forwarded'] ||
            'unknown';
    }

    async validateRequest(req, res) {
        // Validate URL length
        if (req.url.length > this.config.requestValidation.maxUrlLength) {
            throw new Error('URL too long');
        }

        // Validate HTTP method
        if (!this.config.requestValidation.allowedMethods.includes(req.method)) {
            throw new Error('Method not allowed');
        }

        // Validate headers size
        const headerSize = JSON.stringify(req.headers).length;
        if (headerSize > this.config.requestValidation.maxHeaderSize) {
            throw new Error('Headers too large');
        }

        // Validate content length
        const contentLength = req.get('Content-Length');
        if (contentLength) {
            const maxSize = this.parseSize(this.config.requestValidation.maxPayloadSize);
            if (parseInt(contentLength) > maxSize) {
                throw new Error('Request entity too large');
            }
        }
    }

    async checkIPRestrictions(req, res) {
        const clientIP = req.clientIP;

        // Check whitelist
        if (this.config.ipManagement.whitelist.length > 0) {
            if (!this.config.ipManagement.whitelist.includes(clientIP)) {
                this.metrics.ipBlockedRequests++;
                throw new Error('IP not whitelisted');
            }
        }

        // Check blacklist
        if (this.config.ipManagement.blacklist.includes(clientIP)) {
            this.metrics.ipBlockedRequests++;
            throw new Error('IP blacklisted');
        }

        // Check dynamic blocking
        if (this.config.ipManagement.dynamicBlocking.enabled) {
            const ipScore = await this.calculateIPScore(clientIP);
            if (ipScore > this.config.ipManagement.dynamicBlocking.scoreThreshold) {
                this.metrics.ipBlockedRequests++;
                throw new Error('IP dynamically blocked due to suspicious activity');
            }
        }
    }

    async checkGeoRestrictions(req, res) {
        if (!this.config.geoRestrictions.enabled) {
            return;
        }

        const clientIP = req.clientIP;
        const country = await this.getIPCountry(clientIP);

        if (!country) {
            return; // Unknown country, allow by default
        }

        // Check allowed countries
        if (this.config.geoRestrictions.allowedCountries.length > 0) {
            if (!this.config.geoRestrictions.allowedCountries.includes(country)) {
                this.metrics.geoBlockedRequests++;
                throw new Error(`Access from country ${country} not allowed`);
            }
        }

        // Check blocked countries
        if (this.config.geoRestrictions.blockedCountries.includes(country)) {
            this.metrics.geoBlockedRequests++;
            throw new Error(`Access from country ${country} blocked`);
        }

        // Check for VPN/Proxy
        if (this.config.geoRestrictions.vpnBlocking || this.config.geoRestrictions.proxyBlocking) {
            const isVPNOrProxy = await this.isVPNOrProxy(clientIP);
            if (isVPNOrProxy) {
                this.metrics.geoBlockedRequests++;
                throw new Error('VPN/Proxy access not allowed');
            }
        }
    }

    async detectBotActivity(req, res) {
        const clientIP = req.clientIP;
        const userAgent = req.get('User-Agent') || '';

        // Get IP bot metrics
        const ipMetrics = this.botTracker.get(clientIP) || {
            requestCount: 0,
            uniqueEndpoints: new Set(),
            userAgentHashes: new Set(),
            timeBetweenRequests: [],
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            suspiciousScore: 0
        };

        // Update metrics
        ipMetrics.requestCount++;
        ipMetrics.uniqueEndpoints.add(req.path);
        ipMetrics.userAgentHashes.add(crypto.createHash('md5').update(userAgent).digest('hex'));

        const now = Date.now();
        if (ipMetrics.lastSeen) {
            ipMetrics.timeBetweenRequests.push(now - ipMetrics.lastSeen);
            // Keep only last 100 time differences
            if (ipMetrics.timeBetweenRequests.length > 100) {
                ipMetrics.timeBetweenRequests = ipMetrics.timeBetweenRequests.slice(-100);
            }
        }
        ipMetrics.lastSeen = now;

        // Calculate suspicious score
        const endpointVariation = ipMetrics.uniqueEndpoints.size / ipMetrics.requestCount;
        const userAgentVariation = ipMetrics.userAgentHashes.size / Math.min(ipMetrics.requestCount, 10);
        const avgTimeBetweenRequests = ipMetrics.timeBetweenRequests.length > 0
            ? ipMetrics.timeBetweenRequests.reduce((a, b) => a + b, 0) / ipMetrics.timeBetweenRequests.length
            : 0;

        // High endpoint variation + low time between requests = suspicious
        if (endpointVariation > 0.8 && avgTimeBetweenRequests < this.config.botProtection.behaviorAnalysis.minTimeBetweenRequests) {
            ipMetrics.suspiciousScore += 50;
        }

        // Multiple user agents from same IP = suspicious
        if (userAgentVariation > 0.5) {
            ipMetrics.suspiciousScore += 30;
        }

        // Very consistent timing = suspicious (bot-like)
        if (ipMetrics.timeBetweenRequests.length > 10) {
            const variance = this.calculateVariance(ipMetrics.timeBetweenRequests);
            if (variance < 100) { // Low variance = bot-like
                ipMetrics.suspiciousScore += 20;
            }
        }

        this.botTracker.set(clientIP, ipMetrics);

        if (ipMetrics.suspiciousScore > 100) {
            this.metrics.suspiciousActivities++;
            req.botScore = ipMetrics.suspiciousScore;
        }
    }

    async analyzeBotBehavior(clientIP) {
        const ipMetrics = this.botTracker.get(clientIP);
        return ipMetrics && ipMetrics.suspiciousScore > 50;
    }

    async checkDDoSThreats(req, res) {
        const clientIP = req.clientIP;
        const ipMetrics = this.ddosTracker.get(clientIP) || {
            requestCount: 0,
            suspiciousScore: 0,
            blocked: false,
            blockExpiry: 0
        };

        // Check if IP is blocked
        if (ipMetrics.blocked && Date.now() < ipMetrics.blockExpiry) {
            this.metrics.ddosAttempts++;
            throw new Error('IP blocked due to DDoS protection');
        }

        // Check request patterns
        const timeWindow = 60 * 1000; // 1 minute
        const requestsPerMinute = ipMetrics.requestCount / (timeWindow / 1000);

        if (requestsPerMinute > this.config.ddosProtection.thresholds.requestsPerSecond) {
            this.metrics.ddosAttempts++;
            throw new Error('DDoS pattern detected');
        }
    }

    async applyRateLimiting(req, res) {
        if (!this.config.rateLimiting.enabled) {
            return;
        }

        // Apply sliding window rate limiting by default
        await this.slidingWindowRateLimit(req, res, `rate_limit:default:${req.clientIP}`);
    }

    async validateAPIKey(req, res) {
        // API key validation is handled by the specific middleware
        // This is a placeholder for global API key validation
    }

    extractAPIKey(req) {
        // Check various locations for API key
        return req.get('X-API-Key') ||
               req.get('Authorization')?.replace(/^Bearer\s+/, '') ||
               req.query.api_key ||
               req.body.api_key;
    }

    async validateAPIKeyData(apiKey) {
        // Check Redis first
        const keyData = await this.redisClient?.hgetall(`api_key:${apiKey}`);

        if (keyData && Object.keys(keyData).length > 0) {
            return {
                id: keyData.id,
                name: keyData.name,
                permissions: JSON.parse(keyData.permissions || '[]'),
                roles: JSON.parse(keyData.roles || '[]'),
                active: keyData.active === 'true',
                usageCount: parseInt(keyData.usageCount || '0'),
                lastUsedAt: parseInt(keyData.lastUsedAt || '0'),
                createdAt: parseInt(keyData.createdAt || '0'),
                expiresAt: parseInt(keyData.expiresAt || '0')
            };
        }

        // Check in-memory store
        return this.apiKeys.get(apiKey) || null;
    }

    async updateAPIKeyUsage(apiKey) {
        const now = Date.now();

        if (this.redisClient) {
            await this.redisClient.hincrby(`api_key:${apiKey}`, 'usageCount', 1);
            await this.redisClient.hset(`api_key:${apiKey}`, 'lastUsedAt', now.toString());
        } else {
            const keyData = this.apiKeys.get(apiKey);
            if (keyData) {
                keyData.usageCount++;
                keyData.lastUsedAt = now;
                this.apiKeys.set(apiKey, keyData);
            }
        }
    }

    async updateTrackingData(req) {
        const clientIP = req.clientIP;
        const now = Date.now();

        // Update IP tracker
        const ipData = this.ipTracker.get(clientIP) || {
            requestCount: 0,
            endpoints: new Set(),
            firstSeen: now,
            lastSeen: now
        };

        ipData.requestCount++;
        ipData.endpoints.add(req.path);
        ipData.lastSeen = now;

        this.ipTracker.set(clientIP, ipData);
    }

    addSecurityHeaders(req, res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-Rate-Limit-Limit', this.config.rateLimiting.strategies.slidingWindow.maxRequests);
        res.setHeader('X-Request-ID', req.requestId);
    }

    async checkSuspiciousPatterns(req, ipMetrics) {
        const suspiciousPatterns = [
            /\.\./g,  // Path traversal
            /<script/i,  // XSS
            /union\s+select/i,  // SQL injection
            /exec\s*\(/i,  // Code execution
            /\$\{/g,  // Template injection
        ];

        const url = req.url;
        const userAgent = req.get('User-Agent') || '';
        const combined = `${url} ${userAgent}`;

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(combined)) {
                ipMetrics.suspiciousScore += 25;
                this.metrics.suspiciousActivities++;
                break;
            }
        }
    }

    async getSystemLoad() {
        // Simplified system load calculation
        // In production, this would use actual system metrics
        const memoryUsage = process.memoryUsage();
        const memoryLoad = memoryUsage.heapUsed / memoryUsage.heapTotal;
        return Math.min(1, memoryLoad);
    }

    async calculateIPScore(clientIP) {
        const ipData = this.ipTracker.get(clientIP) || { requestCount: 0, suspiciousScore: 0 };

        // Score based on request count and suspicious activity
        const requestScore = Math.min(50, ipData.requestCount / 10);
        const suspiciousScore = ipData.suspiciousScore || 0;

        return requestScore + suspiciousScore;
    }

    async getIPCountry(ip) {
        // Placeholder for IP geolocation
        // In production, integrate with a geolocation service
        return 'US';
    }

    async isVPNOrProxy(ip) {
        // Placeholder for VPN/proxy detection
        // In production, integrate with a VPN/proxy detection service
        return false;
    }

    calculateVariance(numbers) {
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const squaredDiffs = numbers.map(x => Math.pow(x - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
        return Math.sqrt(avgSquaredDiff);
    }

    parseSize(size) {
        const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
        const match = size.toString().toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);

        if (!match) return 1024 * 1024; // Default to 1MB

        const [, num, unit] = match;
        return parseInt(num) * units[unit];
    }

    handleRateLimitExceeded(req, res) {
        this.metrics.rateLimitHits++;
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(this.config.rateLimiting.strategies.slidingWindow.windowMs / 1000)
        });
    }

    handleSecurityError(req, res, error) {
        this.metrics.blockedRequests++;
        console.error('API Security Error:', error);

        res.status(400).json({
            error: 'Security validation failed',
            message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message,
            requestId: req.requestId
        });
    }

    handleRateLimitError(req, res, error) {
        this.metrics.rateLimitHits++;
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: error.message,
            requestId: req.requestId
        });
    }

    handleAPIKeyError(req, res, error) {
        res.status(401).json({
            error: 'API key validation failed',
            message: error.message,
            requestId: req.requestId
        });
    }

    handleDDoSError(req, res, error) {
        this.metrics.ddosAttempts++;
        res.status(429).json({
            error: 'DDoS protection activated',
            message: 'Request blocked due to suspicious activity',
            requestId: req.requestId
        });
    }

    handleBotDetectionError(req, res, error) {
        console.error('Bot detection error:', error);
        next(); // Continue on bot detection errors
    }

    async logSecurityEvent(eventType, details) {
        const event = {
            id: crypto.randomUUID(),
            type: eventType,
            details,
            timestamp: new Date().toISOString(),
            service: 'APISecurityManager'
        };

        if (this.redisClient) {
            await this.redisClient.publish('security:api_events', JSON.stringify(event));
        }

        console.log('[API SECURITY EVENT]', JSON.stringify(event, null, 2));
    }

    async loadSecurityData() {
        // Load existing security data from Redis
        // This would include API keys, IP blocking rules, etc.
    }

    startMonitoringProcesses() {
        // Start background processes for security monitoring
        setInterval(() => {
            this.cleanupOldData();
        }, 60 * 60 * 1000); // Every hour

        setInterval(() => {
            this.updateMetrics();
        }, 60 * 1000); // Every minute
    }

    cleanupOldData() {
        // Clean up old tracking data
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        // Clean up IP tracker
        for (const [ip, data] of this.ipTracker) {
            if (now - data.lastSeen > maxAge) {
                this.ipTracker.delete(ip);
            }
        }

        // Clean up bot tracker
        for (const [ip, data] of this.botTracker) {
            if (now - data.lastSeen > maxAge) {
                this.botTracker.delete(ip);
            }
        }

        // Clean up DDoS tracker
        for (const [ip, data] of this.ddosTracker) {
            if (now - data.lastSeen > maxAge) {
                this.ddosTracker.delete(ip);
            }
        }
    }

    updateMetrics() {
        // Update and reset metrics if needed
        const now = Date.now();
        if (now - this.metrics.lastReset > 24 * 60 * 60 * 1000) { // 24 hours
            this.resetMetrics();
        }
    }

    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            blockedRequests: 0,
            rateLimitHits: 0,
            ddosAttempts: 0,
            botRequests: 0,
            geoBlockedRequests: 0,
            ipBlockedRequests: 0,
            apiKeyValidations: 0,
            suspiciousActivities: 0,
            lastReset: Date.now()
        };
    }

    /**
     * Get security metrics
     */
    getSecurityMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.lastReset,
            trackedIPs: this.ipTracker.size,
            trackedBots: this.botTracker.size,
            ddosTracker: this.ddosTracker.size,
            activeAPIKeys: this.apiKeys.size
        };
    }

    /**
     * Generate API key
     */
    async generateAPIKey(name, permissions = [], roles = [], expiresAt = null) {
        const apiKey = this.config.apiKeys.keyPrefix + crypto.randomBytes(this.config.apiKeys.keyLength).toString('hex');

        const keyData = {
            id: crypto.randomUUID(),
            name,
            apiKey,
            permissions,
            roles,
            active: true,
            usageCount: 0,
            lastUsedAt: 0,
            createdAt: Date.now(),
            expiresAt: expiresAt || Date.now() + this.config.apiKeys.keyExpiration
        };

        // Store API key
        if (this.redisClient) {
            await this.redisClient.hset(`api_key:${apiKey}`, {
                id: keyData.id,
                name: keyData.name,
                apiKey: keyData.apiKey,
                permissions: JSON.stringify(keyData.permissions),
                roles: JSON.stringify(keyData.roles),
                active: keyData.active.toString(),
                usageCount: keyData.usageCount.toString(),
                lastUsedAt: keyData.lastUsedAt.toString(),
                createdAt: keyData.createdAt.toString(),
                expiresAt: keyData.expiresAt.toString()
            });

            const ttl = Math.max(0, Math.floor((keyData.expiresAt - Date.now()) / 1000));
            if (ttl > 0) {
                await this.redisClient.expire(`api_key:${apiKey}`, ttl);
            }
        } else {
            this.apiKeys.set(apiKey, keyData);
        }

        await this.logSecurityEvent('api_key_created', {
            keyId: keyData.id,
            name,
            permissions,
            roles,
            expiresAt: keyData.expiresAt
        });

        return keyData;
    }
}

export default APISecurityManager;