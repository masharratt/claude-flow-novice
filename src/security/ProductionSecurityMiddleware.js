/**
 * Production Security Middleware Suite
 *
 * Comprehensive security middleware for production deployment including:
 * - Advanced input validation and sanitization
 * - Rate limiting and abuse prevention
 * - Security headers and CORS configuration
 * - API authentication and authorization
 * - Request/response security monitoring
 * - DDoS protection and threat mitigation
 */

import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { SecurityInputSanitizer } from '../security/input-sanitizer.js';
import { AuthenticationManager } from '../security/auth-manager.js';

/**
 * Production Security Middleware Suite
 * Enterprise-grade security protection for HTTP APIs and web applications
 */
export class ProductionSecurityMiddleware {
    constructor(options = {}) {
        this.options = {
            // Rate limiting configuration
            rateLimit: {
                windowMs: options.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
                max: options.rateLimitMax || 100, // Limit each IP to 100 requests per windowMs
                message: options.rateLimitMessage || 'Too many requests from this IP, please try again later.',
                standardHeaders: options.rateLimitStandardHeaders !== false,
                legacyHeaders: options.rateLimitLegacyHeaders === true,
                keyGenerator: this.generateRateLimitKey.bind(this),
                skip: this.skipRateLimit.bind(this),
                onLimitReached: this.onRateLimitReached.bind(this),
                handler: this.rateLimitHandler.bind(this)
            },

            // Advanced rate limiting for sensitive endpoints
            strictRateLimit: {
                auth: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 auth attempts per 15 minutes
                login: { windowMs: 15 * 60 * 1000, max: 10 }, // 10 login attempts per 15 minutes
                password: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 password changes per hour
                admin: { windowMs: 15 * 60 * 1000, max: 20 } // 20 admin requests per 15 minutes
            },

            // Security configuration
            security: {
                enableCSP: options.enableCSP !== false,
                enableHSTS: options.enableHSTS !== false,
                enableXSSProtection: options.enableXSSProtection !== false,
                enableFrameProtection: options.enableFrameProtection !== false,
                enableContentTypeProtection: options.enableContentTypeProtection !== false,
                enableReferrerPolicy: options.enableReferrerPolicy !== false,
                enablePermissionsPolicy: options.enablePermissionsPolicy !== false
            },

            // CORS configuration
            cors: {
                origin: this.configureCORSOrigin.bind(this),
                credentials: options.corsCredentials !== false,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                allowedHeaders: [
                    'Origin',
                    'X-Requested-With',
                    'Content-Type',
                    'Accept',
                    'Authorization',
                    'X-API-Key',
                    'X-Client-ID',
                    'X-Request-ID'
                ],
                exposedHeaders: [
                    'X-Rate-Limit-Limit',
                    'X-Rate-Limit-Remaining',
                    'X-Rate-Limit-Reset',
                    'X-Total-Count',
                    'X-Request-ID'
                ],
                maxAge: options.corsMaxAge || 86400 // 24 hours
            },

            // Input validation configuration
            validation: {
                maxPayloadSize: options.maxPayloadSize || '10mb',
                maxUrlLength: options.maxUrlLength || 2048,
                maxHeaderSize: options.maxHeaderSize || 8192,
                strictJSON: options.strictJSON !== false,
                sanitizeAll: options.sanitizeAll !== false
            },

            // Monitoring configuration
            monitoring: {
                enableLogging: options.enableLogging !== false,
                enableMetrics: options.enableMetrics !== false,
                logLevel: options.logLevel || 'warn',
                logRequests: options.logRequests || false,
                logResponses: options.logResponses || false
            }
        };

        // Initialize security components
        this.inputSanitizer = new SecurityInputSanitizer();
        this.authManager = new AuthenticationManager();

        // Security monitoring data
        this.securityMetrics = {
            totalRequests: 0,
            blockedRequests: 0,
            rateLimitHits: 0,
            authFailures: 0,
            validationFailures: 0,
            suspiciousIPs: new Set(),
            threatsDetected: new Map(),
            lastReset: Date.now()
        };

        // Rate limiters for different endpoint types
        this.rateLimiters = {
            general: null,
            auth: null,
            login: null,
            password: null,
            admin: null
        };

        this.initializeRateLimiters();
    }

    /**
     * Initialize all rate limiters
     */
    initializeRateLimiters() {
        // General rate limiter
        this.rateLimiters.general = rateLimit({
            windowMs: this.options.rateLimit.windowMs,
            max: this.options.rateLimit.max,
            message: this.options.rateLimit.message,
            standardHeaders: this.options.rateLimit.standardHeaders,
            legacyHeaders: this.options.rateLimit.legacyHeaders,
            keyGenerator: this.options.rateLimit.keyGenerator,
            skip: this.options.rateLimit.skip,
            onLimitReached: this.options.rateLimit.onLimitReached,
            handler: this.options.rateLimit.handler
        });

        // Strict rate limiters for sensitive endpoints
        for (const [type, config] of Object.entries(this.options.strictRateLimit)) {
            this.rateLimiters[type] = rateLimit({
                windowMs: config.windowMs,
                max: config.max,
                message: `Rate limit exceeded for ${type} endpoint. Please try again later.`,
                keyGenerator: (req) => `${req.ip}:${type}`,
                handler: (req, res) => {
                    this.logSecurityEvent('strict_rate_limit_exceeded', {
                        ip: req.ip,
                        type,
                        userAgent: req.get('User-Agent'),
                        endpoint: req.path
                    });

                    res.status(429).json({
                        error: 'Rate limit exceeded',
                        type,
                        retryAfter: Math.ceil(config.windowMs / 1000)
                    });
                }
            });
        }
    }

    /**
     * Main security middleware - combines all security measures
     */
    securityMiddleware() {
        return (req, res, next) => {
            try {
                // Update security metrics
                this.securityMetrics.totalRequests++;

                // Generate request ID
                req.requestId = crypto.randomUUID();
                res.setHeader('X-Request-ID', req.requestId);

                // Add security headers
                this.addSecurityHeaders(req, res);

                // Log request if enabled
                if (this.options.monitoring.logRequests) {
                    this.logRequest(req);
                }

                // Validate request basics
                this.validateRequestBasics(req, res);

                // Check for suspicious patterns
                this.checkSuspiciousPatterns(req, res);

                // Continue to next middleware
                next();

            } catch (error) {
                this.handleSecurityError(req, res, error);
            }
        };
    }

    /**
     * Advanced input validation middleware
     */
    inputValidationMiddleware(options = {}) {
        return (req, res, next) => {
            try {
                // Validate URL
                this.validateUrl(req, res);

                // Validate headers
                this.validateHeaders(req, res);

                // Validate query parameters
                this.validateQueryParams(req, res);

                // Validate request body if present
                if (req.body && Object.keys(req.body).length > 0) {
                    this.validateRequestBody(req, res);
                }

                // Validate files if present
                if (req.files && Object.keys(req.files).length > 0) {
                    this.validateFiles(req, res);
                }

                next();

            } catch (error) {
                this.handleValidationError(req, res, error);
            }
        };
    }

    /**
     * API authentication middleware
     */
    authenticationMiddleware(options = {}) {
        const {
            required = true,
            roles = [],
            permissions = [],
            skipPaths = [],
            tokenTypes = ['Bearer', 'ApiKey']
        } = options;

        return async (req, res, next) => {
            try {
                // Skip authentication for specified paths
                if (skipPaths.some(path => req.path.startsWith(path))) {
                    return next();
                }

                // Extract authentication token
                const token = this.extractAuthToken(req, tokenTypes);

                if (!token && required) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        message: 'No authentication token provided'
                    });
                }

                if (token) {
                    // Validate token
                    const tokenValidation = await this.authManager.validateToken(token);

                    if (!tokenValidation.valid) {
                        this.securityMetrics.authFailures++;
                        return res.status(401).json({
                            error: 'Invalid authentication token',
                            message: tokenValidation.error
                        });
                    }

                    // Check role requirements
                    if (roles.length > 0 && !roles.includes(tokenValidation.user.role)) {
                        return res.status(403).json({
                            error: 'Insufficient role permissions',
                            required: roles,
                            current: tokenValidation.user.role
                        });
                    }

                    // Check permission requirements
                    if (permissions.length > 0) {
                        const hasPermission = permissions.every(permission =>
                            tokenValidation.user.permissions.includes(permission)
                        );

                        if (!hasPermission) {
                            return res.status(403).json({
                                error: 'Insufficient permissions',
                                required: permissions,
                                current: tokenValidation.user.permissions
                            });
                        }
                    }

                    // Attach user info to request
                    req.user = tokenValidation.user;
                    req.session = tokenValidation.session;
                }

                next();

            } catch (error) {
                this.handleAuthError(req, res, error);
            }
        };
    }

    /**
     * Rate limiting middleware
     */
    rateLimitMiddleware(type = 'general') {
        const limiter = this.rateLimiters[type] || this.rateLimiters.general;
        return limiter;
    }

    /**
     * CORS middleware with advanced configuration
     */
    corsMiddleware() {
        return cors(this.options.cors);
    }

    /**
     * Helmet security headers middleware
     */
    helmetMiddleware() {
        const helmetConfig = {
            contentSecurityPolicy: this.options.security.enableCSP ? {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                    childSrc: ["'none'"],
                    workerSrc: ["'self'", "blob:"],
                    manifestSrc: ["'self'"],
                    upgradeInsecureRequests: []
                }
            } : false,

            hsts: this.options.security.enableHSTS ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            } : false,

            xssFilter: this.options.security.enableXSSProtection,
            frameguard: this.options.security.enableFrameProtection ? { action: 'deny' } : false,
            noSniff: this.options.security.enableContentTypeProtection,
            referrerPolicy: this.options.security.enableReferrerPolicy ? { policy: 'strict-origin-when-cross-origin' } : false,
            permittedCrossDomainPolicies: false,
            hidePoweredBy: true,
            ieNoOpen: true
        };

        return helmet(helmetConfig);
    }

    /**
     * Request size limiting middleware
     */
    requestSizeLimitMiddleware() {
        return (req, res, next) => {
            const contentLength = req.get('Content-Length');

            if (contentLength) {
                const maxSize = this.parseSize(this.options.validation.maxPayloadSize);

                if (parseInt(contentLength) > maxSize) {
                    this.securityMetrics.blockedRequests++;
                    return res.status(413).json({
                        error: 'Request entity too large',
                        maxSize: this.options.validation.maxPayloadSize,
                        received: contentLength
                    });
                }
            }

            next();
        };
    }

    /**
     * DDoS protection middleware
     */
    ddosProtectionMiddleware() {
        const ipTracking = new Map();
        const suspiciousThreshold = 100; // requests per minute
        const blockingThreshold = 500; // requests per minute

        return (req, res, next) => {
            const ip = req.ip;
            const now = Date.now();
            const window = 60 * 1000; // 1 minute window

            // Clean old entries
            for (const [trackedIp, data] of ipTracking) {
                if (now - data.lastSeen > window) {
                    ipTracking.delete(trackedIp);
                }
            }

            // Track current IP
            if (!ipTracking.has(ip)) {
                ipTracking.set(ip, {
                    count: 0,
                    firstSeen: now,
                    lastSeen: now,
                    blocked: false
                });
            }

            const ipData = ipTracking.get(ip);
            ipData.count++;
            ipData.lastSeen = now;

            // Check thresholds
            const requestsPerMinute = ipData.count;

            if (requestsPerMinute > blockingThreshold) {
                ipData.blocked = true;
                this.securityMetrics.blockedRequests++;
                this.securityMetrics.suspiciousIPs.add(ip);

                this.logSecurityEvent('ip_blocked_ddos', {
                    ip,
                    requestsPerMinute,
                    userAgent: req.get('User-Agent'),
                    path: req.path
                });

                return res.status(429).json({
                    error: 'IP temporarily blocked due to suspicious activity',
                    retryAfter: 300 // 5 minutes
                });
            }

            if (requestsPerMinute > suspiciousThreshold) {
                this.logSecurityEvent('suspicious_activity_detected', {
                    ip,
                    requestsPerMinute,
                    userAgent: req.get('User-Agent'),
                    path: req.path
                });
            }

            next();
        };
    }

    // Private helper methods

    generateRateLimitKey(req) {
        // Use IP + user agent for more sophisticated rate limiting
        return `${req.ip}:${req.get('User-Agent') || 'unknown'}`;
    }

    skipRateLimit(req) {
        // Skip rate limiting for health checks and static assets
        const skipPaths = ['/health', '/ping', '/favicon.ico', '/robots.txt'];
        return skipPaths.includes(req.path) || req.path.startsWith('/static/');
    }

    onLimitReached(req, res, options) {
        this.securityMetrics.rateLimitHits++;
        this.logSecurityEvent('rate_limit_exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
        });
    }

    rateLimitHandler(req, res) {
        this.securityMetrics.blockedRequests++;
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: this.options.rateLimit.message,
            retryAfter: Math.ceil(this.options.rateLimit.windowMs / 1000)
        });
    }

    configureCORSOrigin(origin, callback) {
        // Configure CORS origins based on environment
        const allowedOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000', 'http://localhost:3001'];

        // Allow no origin for same-origin requests (mobile apps, server-to-server)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }

    addSecurityHeaders(req, res) {
        // Add custom security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

        // Add rate limit headers
        res.setHeader('X-Rate-Limit-Limit', this.options.rateLimit.max);
        res.setHeader('X-Rate-Limit-Window', this.options.rateLimit.windowMs);

        // Add security metrics headers (only in development)
        if (process.env.NODE_ENV !== 'production') {
            res.setHeader('X-Security-Metrics', JSON.stringify({
                totalRequests: this.securityMetrics.totalRequests,
                blockedRequests: this.securityMetrics.blockedRequests,
                rateLimitHits: this.securityMetrics.rateLimitHits
            }));
        }
    }

    validateRequestBasics(req, res) {
        // Validate URL length
        if (req.url.length > this.options.validation.maxUrlLength) {
            this.securityMetrics.blockedRequests++;
            throw new Error('URL too long');
        }

        // Validate HTTP method
        const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        if (!allowedMethods.includes(req.method)) {
            this.securityMetrics.blockedRequests++;
            throw new Error('Method not allowed');
        }

        // Validate HTTP version
        if (!req.httpVersion || req.httpVersion < '1.1') {
            this.securityMetrics.blockedRequests++;
            throw new Error('HTTP version not supported');
        }
    }

    checkSuspiciousPatterns(req, res) {
        const suspiciousPatterns = [
            /\.\./g, // Path traversal
            /<script/i, // XSS attempt
            /javascript:/i, // JavaScript protocol
            /union\s+select/i, // SQL injection
            /exec\s*\(/i, // Code execution
            /\$\{/g, // Template injection
            /<iframe/i, // iframe injection
            /data:text\/html/i // Data URI injection
        ];

        const url = req.url;
        const userAgent = req.get('User-Agent') || '';
        const referer = req.get('Referer') || '';

        const combinedString = `${url} ${userAgent} ${referer}`;

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(combinedString)) {
                this.securityMetrics.blockedRequests++;
                this.logSecurityEvent('suspicious_pattern_detected', {
                    ip: req.ip,
                    pattern: pattern.source,
                    url,
                    userAgent
                });

                throw new Error('Suspicious request pattern detected');
            }
        }
    }

    validateUrl(req, res) {
        // Validate URL structure
        try {
            new URL(req.url, `http://${req.get('host')}`);
        } catch (error) {
            this.securityMetrics.validationFailures++;
            throw new Error('Invalid URL format');
        }

        // Sanitize URL parameters
        if (this.options.validation.sanitizeAll) {
            const sanitizedUrl = this.inputSanitizer.sanitizeInput(req.url, { type: 'url' });
            req.url = sanitizedUrl.sanitized;
        }
    }

    validateHeaders(req, res) {
        const headers = req.headers;

        // Check header size
        const headerString = JSON.stringify(headers);
        if (headerString.length > this.options.validation.maxHeaderSize) {
            this.securityMetrics.validationFailures++;
            throw new Error('Headers too large');
        }

        // Validate specific headers
        const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-originating-ip'];
        for (const header of suspiciousHeaders) {
            if (headers[header]) {
                // Validate IP format
                const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                if (!ipRegex.test(headers[header])) {
                    this.securityMetrics.validationFailures++;
                    throw new Error(`Invalid ${header} header format`);
                }
            }
        }
    }

    validateQueryParams(req, res) {
        const query = req.query;

        for (const [key, value] of Object.entries(query)) {
            if (typeof value === 'string') {
                // Sanitize query parameter values
                if (this.options.validation.sanitizeAll) {
                    const sanitized = this.inputSanitizer.sanitizeInput(value, { type: 'query_param' });
                    req.query[key] = sanitized.sanitized;
                }

                // Check for suspicious patterns in query parameters
                const suspiciousPatterns = [
                    /<script/i,
                    /javascript:/i,
                    /union\s+select/i,
                    /exec\s*\(/i
                ];

                for (const pattern of suspiciousPatterns) {
                    if (pattern.test(value)) {
                        this.securityMetrics.validationFailures++;
                        throw new Error(`Suspicious pattern in query parameter: ${key}`);
                    }
                }
            }
        }
    }

    validateRequestBody(req, res) {
        const contentType = req.get('Content-Type') || '';

        // Validate JSON body
        if (contentType.includes('application/json')) {
            if (this.options.validation.strictJSON) {
                try {
                    JSON.parse(JSON.stringify(req.body));
                } catch (error) {
                    this.securityMetrics.validationFailures++;
                    throw new Error('Invalid JSON format');
                }
            }

            // Sanitize JSON values
            if (this.options.validation.sanitizeAll) {
                this.sanitizeObject(req.body);
            }
        }

        // Validate form data
        if (contentType.includes('application/x-www-form-urlencoded')) {
            if (this.options.validation.sanitizeAll) {
                this.sanitizeObject(req.body);
            }
        }
    }

    validateFiles(req, res) {
        const files = req.files;

        for (const [fieldname, file] of Object.entries(files)) {
            // Check file size
            const maxSize = this.parseSize('10mb'); // 10MB default
            if (file.size > maxSize) {
                this.securityMetrics.validationFailures++;
                throw new Error(`File too large: ${fieldname}`);
            }

            // Check file type
            const allowedTypes = [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf', 'text/plain', 'application/json',
                'text/csv', 'application/vnd.ms-excel'
            ];

            if (!allowedTypes.includes(file.mimetype)) {
                this.securityMetrics.validationFailures++;
                throw new Error(`File type not allowed: ${file.mimetype}`);
            }

            // Check file name
            const suspiciousNamePatterns = [
                /\.\./g, // Path traversal
                /\.exe$/i, // Executable
                /\.bat$/i, // Batch file
                /\.cmd$/i, // Command file
                /\.scr$/i // Screensaver
            ];

            for (const pattern of suspiciousNamePatterns) {
                if (pattern.test(file.name)) {
                    this.securityMetrics.validationFailures++;
                    throw new Error(`Suspicious file name: ${file.name}`);
                }
            }
        }
    }

    sanitizeObject(obj, maxDepth = 10) {
        if (maxDepth <= 0) return;

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                if (typeof obj[i] === 'string') {
                    const sanitized = this.inputSanitizer.sanitizeInput(obj[i]);
                    obj[i] = sanitized.sanitized;
                } else if (typeof obj[i] === 'object' && obj[i] !== null) {
                    this.sanitizeObject(obj[i], maxDepth - 1);
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string') {
                    const sanitized = this.inputSanitizer.sanitizeInput(value);
                    obj[key] = sanitized.sanitized;
                } else if (typeof value === 'object' && value !== null) {
                    this.sanitizeObject(value, maxDepth - 1);
                }
            }
        }
    }

    extractAuthToken(req, tokenTypes) {
        const authHeader = req.get('Authorization');

        if (!authHeader) return null;

        for (const type of tokenTypes) {
            const prefix = type === 'Bearer' ? 'Bearer ' : `${type} `;
            if (authHeader.startsWith(prefix)) {
                return authHeader.substring(prefix.length);
            }
        }

        return null;
    }

    parseSize(size) {
        const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
        const match = size.toString().toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);

        if (!match) return 1024 * 1024; // Default to 1MB

        const [, num, unit] = match;
        return parseInt(num) * units[unit];
    }

    handleSecurityError(req, res, error) {
        this.logSecurityEvent('security_error', {
            ip: req.ip,
            path: req.path,
            error: error.message,
            userAgent: req.get('User-Agent')
        });

        res.status(400).json({
            error: 'Security validation failed',
            message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message
        });
    }

    handleValidationError(req, res, error) {
        this.securityMetrics.validationFailures++;
        this.logSecurityEvent('validation_error', {
            ip: req.ip,
            path: req.path,
            error: error.message
        });

        res.status(400).json({
            error: 'Validation failed',
            message: error.message
        });
    }

    handleAuthError(req, res, error) {
        this.securityMetrics.authFailures++;
        this.logSecurityEvent('authentication_error', {
            ip: req.ip,
            path: req.path,
            error: error.message
        });

        res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid authentication credentials'
        });
    }

    logRequest(req) {
        const logData = {
            requestId: req.requestId,
            ip: req.ip,
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            referer: req.get('Referer'),
            timestamp: new Date().toISOString()
        };

        console.log('[SECURITY REQUEST]', JSON.stringify(logData));
    }

    logSecurityEvent(eventType, details) {
        const logEntry = {
            eventId: crypto.randomUUID(),
            type: eventType,
            details,
            severity: 'INFO',
            timestamp: new Date().toISOString(),
            service: 'ProductionSecurityMiddleware'
        };

        if (this.options.monitoring.enableLogging) {
            console.log('[SECURITY EVENT]', JSON.stringify(logEntry, null, 2));
        }
    }

    /**
     * Get security metrics
     */
    getSecurityMetrics() {
        return {
            ...this.securityMetrics,
            suspiciousIPs: Array.from(this.securityMetrics.suspiciousIPs),
            threatsDetected: Array.from(this.securityMetrics.threatsDetected.entries()),
            uptime: Date.now() - this.securityMetrics.lastReset
        };
    }

    /**
     * Reset security metrics
     */
    resetSecurityMetrics() {
        this.securityMetrics = {
            totalRequests: 0,
            blockedRequests: 0,
            rateLimitHits: 0,
            authFailures: 0,
            validationFailures: 0,
            suspiciousIPs: new Set(),
            threatsDetected: new Map(),
            lastReset: Date.now()
        };
    }
}

export default ProductionSecurityMiddleware;