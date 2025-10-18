#!/usr/bin/env node

/**
 * OWASP Validator
 * Specialized validator for OWASP Top 10 security patterns
 * Extracted from SafetyValidator for Single Responsibility Principle
 */

export class OWASPValidator {
    constructor() {
        // OWASP Top 10 2021 patterns
        this.patterns = {
            // A01: Broken Access Control
            accessControl: [
                /isAdmin\s*=\s*true/i,
                /user\.role\s*===\s*['"]admin['"]/i,
                /\.\.\//g, // Path traversal
                /%2e%2e/i,
                /file=\.\.\//i,
            ],

            // A02: Cryptographic Failures
            cryptography: [
                /md5\s*\(/i,
                /sha1\s*\(/i,
                /crypto\.createHash\(['"]md5['"]\)/i,
                /crypto\.createHash\(['"]sha1['"]\)/i,
                /password\s*=\s*['"][^'"]*['"]/, // Hardcoded passwords
                /secret\s*=\s*['"][^'"]*['"]/, // Hardcoded secrets
            ],

            // A03: Injection
            injection: [
                /SELECT.*FROM.*WHERE.*\+/i,
                /execute\s*\(\s*['"][^'"]*\+/i,
                /query\s*\(\s*['"][^'"]*\+/i,
                /innerHTML\s*=/i,
                /outerHTML\s*=/i,
                /document\.write\s*\(/i,
                /eval\s*\(/i,
                /setTimeout\s*\(\s*['"][^'"]*\+/i,
            ],

            // A04: Insecure Design
            insecureDesign: [
                /DEBUG\s*=\s*true/i,
                /debugMode\s*=\s*true/i,
                /process\.env\.NODE_ENV\s*!==\s*['"]production['"]/i,
            ],

            // A05: Security Misconfiguration
            misconfiguration: [
                /Access-Control-Allow-Origin:\s*\*/i,
                /allowCredentials\s*=\s*true.*allowOrigin.*\*/i,
                /disableHostCheck\s*=\s*true/i,
            ],

            // A06: Vulnerable Components
            vulnerableComponents: [
                // Checked via dependency scanning
            ],

            // A07: Authentication Failures
            authentication: [
                /password\s*===\s*['"][^'"]*['"]/, // Hardcoded password comparison
                /token\s*===\s*['"][^'"]*['"]/, // Hardcoded token comparison
                /session\.id\s*===/i,
            ],

            // A08: Software and Data Integrity Failures
            integrity: [
                /exec\s*\(/i,
                /spawn\s*\(/i,
                /require\s*\(\s*['"][^'"]*\+/i,
            ]
        };
    }

    /**
     * Scan for OWASP Top 10 patterns
     */
    async scanOWASPPatterns(content) {
        const findings = {};
        let securityScore = 100;
        const vulnerabilities = [];

        // Standard pattern matching
        for (const [category, patterns] of Object.entries(this.patterns)) {
            const categoryFindings = [];

            for (const pattern of patterns) {
                const matches = content.match(new RegExp(pattern, 'gi'));
                if (matches) {
                    const lines = content.split('\n');
                    matches.forEach(match => {
                        const lineIndex = lines.findIndex(line => line.includes(match));
                        if (lineIndex >= 0) {
                            categoryFindings.push({
                                pattern: pattern.source,
                                match,
                                line: lineIndex + 1,
                                severity: this.assessPatternSeverity(pattern, match),
                                owaspCategory: category
                            });
                        }
                    });
                }
            }

            if (categoryFindings.length > 0) {
                findings[category] = categoryFindings;
                securityScore -= categoryFindings.length * 10;

                categoryFindings.forEach(finding => {
                    vulnerabilities.push({
                        type: 'owasp',
                        category,
                        severity: finding.severity,
                        description: `OWASP ${this.getOWASPName(category)} pattern detected`,
                        location: `line ${finding.line}`,
                        pattern: finding.pattern,
                        match: finding.match,
                        owaspCategory: category
                    });
                });
            }
        }

        return { findings, securityScore, vulnerabilities };
    }

    /**
     * Assess pattern severity
     */
    assessPatternSeverity(pattern, match) {
        const criticalPatterns = [
            /eval\s*\(/i,
            /innerHTML\s*=/i,
            /SELECT.*FROM.*WHERE.*\+/i,
        ];

        const highPatterns = [
            /md5\s*\(/i,
            /sha1\s*\(/i,
            /password\s*=\s*['"][^'"]*['"]/i,
        ];

        if (criticalPatterns.some(p => p.test(match))) return 'critical';
        if (highPatterns.some(p => p.test(match))) return 'high';
        return 'medium';
    }

    /**
     * Get OWASP category name
     */
    getOWASPName(category) {
        const names = {
            accessControl: 'A01 Broken Access Control',
            cryptography: 'A02 Cryptographic Failures',
            injection: 'A03 Injection',
            insecureDesign: 'A04 Insecure Design',
            misconfiguration: 'A05 Security Misconfiguration',
            vulnerableComponents: 'A06 Vulnerable Components',
            authentication: 'A07 Authentication Failures',
            integrity: 'A08 Software and Data Integrity Failures'
        };
        return names[category] || category;
    }

    /**
     * Get category priority
     */
    getCategoryPriority(category) {
        const priorities = {
            accessControl: 'critical',
            cryptography: 'high',
            injection: 'critical',
            vulnerableComponents: 'high',
            authentication: 'critical'
        };
        return priorities[category] || 'medium';
    }

    /**
     * Get OWASP recommendation
     */
    getOWASPRecommendation(category) {
        const recommendations = {
            accessControl: 'Implement proper access controls with role-based permissions and input validation',
            cryptography: 'Use strong cryptographic algorithms (AES-256, SHA-256+) and proper key management',
            injection: 'Use parameterized queries, input validation, and output encoding',
            vulnerableComponents: 'Update dependencies to latest secure versions and implement dependency scanning',
            authentication: 'Implement multi-factor authentication and secure session management'
        };
        return recommendations[category] || 'Review and implement proper security controls';
    }
}
