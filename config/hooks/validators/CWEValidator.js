#!/usr/bin/env node

/**
 * CWE Validator
 * Specialized validator for CWE (Common Weakness Enumeration) patterns
 * Extracted from SafetyValidator for Single Responsibility Principle
 */

export class CWEValidator {
    constructor() {
        // CWE patterns
        this.patterns = {
            // CWE-79: Cross-site Scripting
            xss: [
                /innerHTML\s*=\s*.*\+/i,
                /document\.write\s*\(/i,
                /eval\s*\(/i,
            ],

            // CWE-89: SQL Injection
            sqlInjection: [
                /SELECT.*FROM.*WHERE.*\+/i,
                /INSERT.*INTO.*VALUES.*\+/i,
                /UPDATE.*SET.*WHERE.*\+/i,
                /DELETE.*FROM.*WHERE.*\+/i,
            ],

            // CWE-22: Path Traversal
            pathTraversal: [
                /\.\.\//g,
                /file=\.\.\//i,
                /path=\.\.\//i,
            ],

            // CWE-352: CSRF
            csrf: [
                // Check for missing CSRF tokens in forms
            ],

            // CWE-732: Incorrect Permission Assignment
            incorrectPermissions: [
                /chmod\s+777/i,
                /chmod\s+666/i,
                /0777/,
                /0666/,
            ]
        };
    }

    /**
     * Scan for CWE patterns
     */
    async scanCWEPatterns(content) {
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
                                cweCategory: category
                            });
                        }
                    });
                }
            }

            if (categoryFindings.length > 0) {
                findings[category] = categoryFindings;
                securityScore -= categoryFindings.length * 8;

                categoryFindings.forEach(finding => {
                    vulnerabilities.push({
                        type: 'cwe',
                        category,
                        severity: finding.severity,
                        description: `CWE ${this.getCWEName(category)} pattern detected`,
                        location: `line ${finding.line}`,
                        pattern: finding.pattern,
                        match: finding.match,
                        cweCategory: category,
                        cwe: this.getCWEId(category)
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
     * Get CWE category name
     */
    getCWEName(category) {
        const names = {
            xss: 'CWE-79 Cross-site Scripting',
            sqlInjection: 'CWE-89 SQL Injection',
            pathTraversal: 'CWE-22 Path Traversal',
            csrf: 'CWE-352 Cross-Site Request Forgery',
            incorrectPermissions: 'CWE-732 Incorrect Permission Assignment'
        };
        return names[category] || category;
    }

    /**
     * Get CWE ID
     */
    getCWEId(category) {
        const ids = {
            xss: 'CWE-79',
            sqlInjection: 'CWE-89',
            pathTraversal: 'CWE-22',
            csrf: 'CWE-352',
            incorrectPermissions: 'CWE-732'
        };
        return ids[category] || 'CWE-Unknown';
    }
}
