#!/usr/bin/env node

/**
 * Dependency Scanner
 * Specialized scanner for dependency vulnerability checking
 * Extracted from SafetyValidator for Single Responsibility Principle
 */

export class DependencyScanner {
    constructor() {
        // Vulnerability database (simplified version - in production use npm audit/Snyk)
        this.vulnerabilityDatabase = new Map();
        this.initializeVulnerabilityDatabase();

        // Performance thresholds
        this.maxDependencies = 1000;
    }

    /**
     * Initialize vulnerability database with known CVEs
     */
    initializeVulnerabilityDatabase() {
        // Sample vulnerable package versions
        this.vulnerabilityDatabase.set('lodash', {
            '4.17.15': { severity: 'high', cve: 'CVE-2021-23337' },
            '4.17.14': { severity: 'high', cve: 'CVE-2021-23337' },
            '4.17.13': { severity: 'high', cve: 'CVE-2021-23337' },
        });

        this.vulnerabilityDatabase.set('axios', {
            '0.21.1': { severity: 'medium', cve: 'CVE-2021-3749' },
            '0.21.0': { severity: 'medium', cve: 'CVE-2021-3749' },
        });

        this.vulnerabilityDatabase.set('node-forge', {
            '1.3.0': { severity: 'critical', cve: 'CVE-2022-24771' },
            '1.2.1': { severity: 'critical', cve: 'CVE-2022-24771' },
        });

        this.vulnerabilityDatabase.set('minimist', {
            '1.2.5': { severity: 'high', cve: 'CVE-2021-44906' },
            '1.2.0': { severity: 'high', cve: 'CVE-2020-7598' },
        });

        this.vulnerabilityDatabase.set('express', {
            '4.16.0': { severity: 'medium', cve: 'CVE-2022-24999' },
            '4.15.0': { severity: 'medium', cve: 'CVE-2022-24999' },
        });
    }

    /**
     * Check for vulnerable dependencies
     */
    async scanDependencies(content, extension, filePath) {
        const vulnerabilities = [];
        const performanceIssues = [];
        let securityScore = 100;
        let performanceScore = 100;

        if (extension === 'json' && filePath?.includes('package.json')) {
            try {
                const packageJson = JSON.parse(content);
                const dependencies = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies
                };

                // Scan for vulnerable dependencies
                for (const [name, version] of Object.entries(dependencies)) {
                    const packageVulns = this.checkPackageVulnerabilities(name, version);
                    if (packageVulns.length > 0) {
                        packageVulns.forEach(vuln => {
                            vulnerabilities.push({
                                type: 'dependency',
                                package: name,
                                version,
                                severity: vuln.severity,
                                description: `Vulnerable dependency: ${name}@${version}`,
                                cve: vuln.cve,
                                recommendation: `Update ${name} to a secure version`
                            });

                            securityScore -= this.getSeverityScore(vuln.severity);
                        });
                    }
                }

                // Check for excessive dependencies
                if (Object.keys(dependencies).length > this.maxDependencies) {
                    performanceIssues.push({
                        type: 'excessive_dependencies',
                        count: Object.keys(dependencies).length,
                        threshold: this.maxDependencies
                    });
                    performanceScore -= 10;
                }

            } catch (error) {
                return {
                    vulnerabilities: [],
                    performanceIssues: [],
                    securityScore: 100,
                    performanceScore: 100,
                    error: `Failed to parse package.json: ${error.message}`
                };
            }
        }

        return {
            vulnerabilities,
            performanceIssues,
            securityScore,
            performanceScore
        };
    }

    /**
     * Check if a package version has known vulnerabilities
     */
    checkPackageVulnerabilities(packageName, version) {
        const vulnerabilities = [];
        const packageVulns = this.vulnerabilityDatabase.get(packageName);

        if (packageVulns) {
            for (const [vulnVersion, vulnInfo] of Object.entries(packageVulns)) {
                // Simple version comparison (could be improved with semver)
                if (this.isVersionVulnerable(version, vulnVersion)) {
                    vulnerabilities.push(vulnInfo);
                }
            }
        }

        return vulnerabilities;
    }

    /**
     * Simple version vulnerability check
     */
    isVersionVulnerable(currentVersion, vulnerableVersion) {
        // Remove semver operators (^, ~, >=, etc.)
        const cleanVersion = currentVersion.replace(/^[~^>=<]+/, '');

        // This is a simplified check - in production, use proper semver comparison
        return cleanVersion === vulnerableVersion ||
               cleanVersion.startsWith(vulnerableVersion.split('.')[0] + '.');
    }

    /**
     * Get severity score for vulnerability
     */
    getSeverityScore(severity) {
        const scores = { critical: 30, high: 20, medium: 10, low: 5 };
        return scores[severity] || 5;
    }

    /**
     * Update vulnerability database (for extensibility)
     */
    updateVulnerabilityDatabase(packageName, vulnerabilities) {
        this.vulnerabilityDatabase.set(packageName, vulnerabilities);
    }
}
