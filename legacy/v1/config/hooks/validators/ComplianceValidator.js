#!/usr/bin/env node

/**
 * Compliance Validator
 * Specialized validator for compliance frameworks (GDPR, PCI, HIPAA, SOC2)
 * Extracted from SafetyValidator for Single Responsibility Principle
 */

export class ComplianceValidator {
    constructor() {
        // Compliance frameworks
        this.frameworks = {
            gdpr: {
                personalDataPatterns: [
                    /email/i,
                    /name/i,
                    /address/i,
                    /phone/i,
                    /ssn/i,
                    /social.*security/i,
                    /credit.*card/i,
                    /passport/i,
                ]
            },
            pci: {
                cardDataPatterns: [
                    /4\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/, // Visa
                    /5\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/, // MasterCard
                    /3\d{3}[-\s]?\d{6}[-\s]?\d{5}/, // American Express
                    /6011[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/, // Discover
                ]
            },
            hipaa: {
                phiPatterns: [
                    /patient/i,
                    /medical/i,
                    /health/i,
                    /diagnosis/i,
                    /treatment/i,
                    /prescription/i,
                ]
            },
            soc2: {
                securityPatterns: [
                    /access.*control/i,
                    /encryption/i,
                    /monitoring/i,
                    /audit.*log/i,
                ]
            }
        };
    }

    /**
     * Validate compliance frameworks
     */
    async validateCompliance(content) {
        const lowerContent = content.toLowerCase();
        const compliance = {
            gdpr: { passed: true, issues: [] },
            pci: { passed: true, issues: [] },
            hipaa: { passed: true, issues: [] },
            soc2: { passed: true, issues: [] }
        };
        let securityScore = 100;

        // GDPR compliance
        for (const pattern of this.frameworks.gdpr.personalDataPatterns) {
            if (new RegExp(pattern).test(lowerContent)) {
                compliance.gdpr.issues.push({
                    type: 'personal_data_detected',
                    pattern,
                    recommendation: 'Ensure GDPR compliance for personal data handling'
                });
                compliance.gdpr.passed = false;
            }
        }

        // PCI DSS compliance
        for (const pattern of this.frameworks.pci.cardDataPatterns) {
            if (new RegExp(pattern).test(content)) {
                compliance.pci.issues.push({
                    type: 'card_data_detected',
                    pattern,
                    severity: 'critical',
                    recommendation: 'Remove cardholder data and implement PCI DSS compliance'
                });
                compliance.pci.passed = false;
                securityScore -= 50;
            }
        }

        // HIPAA compliance
        for (const pattern of this.frameworks.hipaa.phiPatterns) {
            if (new RegExp(pattern).test(lowerContent)) {
                compliance.hipaa.issues.push({
                    type: 'phi_detected',
                    pattern,
                    recommendation: 'Ensure HIPAA compliance for PHI handling'
                });
                compliance.hipaa.passed = false;
            }
        }

        // SOC 2 compliance
        for (const pattern of this.frameworks.soc2.securityPatterns) {
            if (new RegExp(pattern).test(lowerContent)) {
                compliance.soc2.issues.push({
                    type: 'security_control_detected',
                    pattern,
                    recommendation: 'Document SOC 2 security controls and monitoring'
                });
            }
        }

        return { compliance, securityScore };
    }

    /**
     * Check GDPR compliance
     */
    async checkGDPR(content) {
        const lowerContent = content.toLowerCase();
        const issues = [];

        for (const pattern of this.frameworks.gdpr.personalDataPatterns) {
            if (new RegExp(pattern).test(lowerContent)) {
                issues.push({
                    type: 'personal_data_detected',
                    pattern,
                    recommendation: 'Ensure GDPR compliance for personal data handling'
                });
            }
        }

        return {
            passed: issues.length === 0,
            issues
        };
    }

    /**
     * Check HIPAA compliance
     */
    async checkHIPAA(content) {
        const lowerContent = content.toLowerCase();
        const issues = [];

        for (const pattern of this.frameworks.hipaa.phiPatterns) {
            if (new RegExp(pattern).test(lowerContent)) {
                issues.push({
                    type: 'phi_detected',
                    pattern,
                    recommendation: 'Ensure HIPAA compliance for PHI handling'
                });
            }
        }

        return {
            passed: issues.length === 0,
            issues
        };
    }

    /**
     * Check SOC 2 compliance
     */
    async checkSOC2(content) {
        const lowerContent = content.toLowerCase();
        const issues = [];

        for (const pattern of this.frameworks.soc2.securityPatterns) {
            if (new RegExp(pattern).test(lowerContent)) {
                issues.push({
                    type: 'security_control_detected',
                    pattern,
                    recommendation: 'Document SOC 2 security controls and monitoring'
                });
            }
        }

        return {
            passed: true, // SOC 2 findings are informational, not failures
            issues
        };
    }
}
