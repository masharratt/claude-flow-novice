/**
 * Enhanced Security Configuration for Dashboard
 * Provides CSP validation, security headers, and monitoring
 */

class SecurityConfig {
    constructor(options = {}) {
        this.options = {
            // CSP policies
            csp: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                manifestSrc: ["'self'"],
                workerSrc: ["'self'", "blob:"],
                childSrc: ["'self'", "blob:"]
            },
            // Additional security headers
            headers: {
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block',
                'Referrer-Policy': 'strict-origin-when-cross-origin',
                'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
            },
            // Security monitoring
            monitoring: {
                enabled: true,
                logLevel: 'warn',
                reportUri: null
            },
            ...options
        };

        this.violations = [];
        this.securityMetrics = {
            cspViolations: 0,
            blockedRequests: 0,
            suspiciousActivity: 0
        };
    }

    /**
     * Generate CSP header value
     */
    generateCSPHeader() {
        const csp = [];

        for (const [directive, sources] of Object.entries(this.options.csp)) {
            const directiveName = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
            csp.push(`${directiveName} ${sources.join(' ')}`);
        }

        return csp.join('; ');
    }

    /**
     * Validate CSP configuration
     */
    validateCSP() {
        const issues = [];
        const csp = this.options.csp;

        // Check for unsafe-inline in script-src (should be minimized)
        if (csp.scriptSrc.includes("'unsafe-inline'")) {
            issues.push({
                level: 'warning',
                message: 'script-src includes unsafe-inline - consider removing for better security',
                recommendation: 'Use CSP hashes or nonces instead of unsafe-inline'
            });
        }

        // Check if default-src is restrictive enough
        if (csp.defaultSrc.length > 1 || !csp.defaultSrc.includes("'self'")) {
            issues.push({
                level: 'warning',
                message: 'default-src should be restrictive',
                recommendation: 'Consider setting default-src to only \'self\' and explicitly allow other sources'
            });
        }

        // Check for wildcard sources
        for (const [directive, sources] of Object.entries(csp)) {
            if (sources.includes('*')) {
                issues.push({
                    level: 'error',
                    message: `${directive} includes wildcard (*) - this is a security risk`,
                    recommendation: 'Replace wildcards with specific trusted domains'
                });
            }
        }

        // Check for data: in script-src
        if (csp.scriptSrc.includes('data:')) {
            issues.push({
                level: 'error',
                message: 'script-src includes data: - this can lead to XSS attacks',
                recommendation: 'Remove data: from script-src directive'
            });
        }

        return {
            isValid: issues.filter(i => i.level === 'error').length === 0,
            issues,
            recommendations: issues.filter(i => i.recommendation)
        };
    }

    /**
     * Middleware for Express applications
     */
    middleware() {
        return (req, res, next) => {
            // Set CSP header
            res.header('Content-Security-Policy', this.generateCSPHeader());

            // Set other security headers
            for (const [header, value] of Object.entries(this.options.headers)) {
                res.header(header, value);
            }

            // Log CSP violations if reporting is enabled
            if (this.options.monitoring.enabled) {
                res.on('finish', () => {
                    if (req.headers['content-security-policy-report-only'] ||
                        req.url.includes('/csp-report')) {
                        this.handleCSPReport(req);
                    }
                });
            }

            next();
        };
    }

    /**
     * Handle CSP violation reports
     */
    handleCSPReport(req) {
        try {
            const report = req.body;

            this.violations.push({
                timestamp: new Date(),
                userAgent: req.headers['user-agent'],
                ip: req.ip,
                violation: report
            });

            this.securityMetrics.cspViolations++;

            // Log violation if monitoring is enabled
            if (this.options.monitoring.enabled) {
                console.warn('CSP Violation:', {
                    violatedDirective: report['violated-directive'],
                    blockedUri: report['blocked-uri'],
                    documentUri: report['document-uri'],
                    userAgent: req.headers['user-agent']
                });
            }

        } catch (error) {
            console.error('Error handling CSP report:', error);
        }
    }

    /**
     * Generate security report
     */
    generateSecurityReport() {
        const cspValidation = this.validateCSP();

        return {
            timestamp: new Date(),
            securityLevel: cspValidation.isValid ? 'HIGH' : 'MEDIUM',
            cspPolicy: this.generateCSPHeader(),
            securityHeaders: this.options.headers,
            metrics: this.securityMetrics,
            violations: this.violations.slice(-10), // Last 10 violations
            validation: cspValidation,
            recommendations: this.generateRecommendations(cspValidation)
        };
    }

    /**
     * Generate security recommendations
     */
    generateRecommendations(cspValidation) {
        const recommendations = [...cspValidation.recommendations];

        // Add general security recommendations
        if (this.securityMetrics.cspViolations > 5) {
            recommendations.push({
                level: 'high',
                message: 'High number of CSP violations detected',
                action: 'Review and tighten CSP policy based on actual usage patterns'
            });
        }

        if (this.violations.length > 0) {
            recommendations.push({
                level: 'medium',
                message: 'Security violations have been recorded',
                action: 'Implement regular security monitoring and incident response procedures'
            });
        }

        return recommendations;
    }

    /**
     * Test CSP against a list of allowed resources
     */
    testCSPWithResources(resources) {
        const results = [];

        for (const resource of resources) {
            const isAllowed = this.isResourceAllowed(resource);
            results.push({
                resource: resource.url,
                type: resource.type,
                allowed: isAllowed,
                blockedBy: isAllowed ? null : this.getBlockingDirective(resource)
            });
        }

        return {
            totalResources: resources.length,
            allowedResources: results.filter(r => r.allowed).length,
            blockedResources: results.filter(r => !r.allowed).length,
            results
        };
    }

    /**
     * Check if a resource is allowed by CSP
     */
    isResourceAllowed(resource) {
        const { type, url } = resource;
        const directive = this.getDirectiveForType(type);

        if (!directive || !this.options.csp[directive]) {
            return false;
        }

        const sources = this.options.csp[directive];
        return this.urlMatchesSources(url, sources);
    }

    /**
     * Get CSP directive for resource type
     */
    getDirectiveForType(type) {
        const mapping = {
            'script': 'scriptSrc',
            'style': 'styleSrc',
            'font': 'fontSrc',
            'img': 'imgSrc',
            'connect': 'connectSrc',
            'worker': 'workerSrc',
            'child': 'childSrc'
        };

        return mapping[type] || null;
    }

    /**
     * Check if URL matches any of the allowed sources
     */
    urlMatchesSources(url, sources) {
        return sources.some(source => {
            if (source === "'self'") {
                // Handle both browser and Node.js environments
                const origin = typeof window !== 'undefined'
                    ? window.location.origin
                    : 'http://localhost:3001';
                return url.startsWith('/') || url.startsWith(origin);
            }
            if (source === 'data:') {
                return url.startsWith('data:');
            }
            if (source.startsWith('http')) {
                return url.startsWith(source);
            }
            return false;
        });
    }

    /**
     * Get directive that blocks a resource
     */
    getBlockingDirective(resource) {
        const { type } = resource;
        const directive = this.getDirectiveForType(type);
        return directive || 'default-src';
    }

    /**
     * Update CSP configuration
     */
    updateCSP(newCspOptions) {
        this.options.csp = { ...this.options.csp, ...newCspOptions };
    }

    /**
     * Get current CSP configuration
     */
    getCSPConfiguration() {
        return {
            header: this.generateCSPHeader(),
            directives: this.options.csp,
            validation: this.validateCSP()
        };
    }
}

export { SecurityConfig };

// Default configuration for the dashboard
export const defaultSecurityConfig = new SecurityConfig({
    csp: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"]
    },
    monitoring: {
        enabled: true,
        logLevel: 'warn'
    }
});