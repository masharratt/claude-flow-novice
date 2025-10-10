#!/usr/bin/env node

/**
 * CSP Validation and Dashboard Test Script
 * Tests the updated CSP configuration and dashboard functionality
 */

import http from 'http';
import { SecurityConfig } from './security-config.js';

class CSPTester {
    constructor(serverUrl = 'http://localhost:3001') {
        this.serverUrl = serverUrl;
        this.testResults = [];
        this.securityConfig = new SecurityConfig();
    }

    async runAllTests() {
        console.log('🔒 Starting CSP Validation and Dashboard Tests\n');

        const tests = [
            () => this.testSecurityConfiguration(),
            () => this.testServerHealth(),
            () => this.testSecurityReport(),
            () => this.testSocketIOEndpoint(),
            () => this.testCSPPolicyGeneration(),
            () => this.testResourceValidation(),
            () => this.testHeaders()
        ];

        for (const test of tests) {
            try {
                await test();
            } catch (error) {
                this.addResult('ERROR', error.message, { error: error.stack });
            }
        }

        await this.generateReport();
    }

    async testSecurityConfiguration() {
        console.log('📋 Testing Security Configuration...');

        // Test CSP validation
        const validation = this.securityConfig.validateCSP();

        this.addResult(
            validation.isValid ? 'PASS' : 'WARN',
            'CSP Configuration Validation',
            {
                isValid: validation.isValid,
                issues: validation.issues.length,
                recommendations: validation.recommendations.length
            }
        );

        if (validation.issues.length > 0) {
            validation.issues.forEach(issue => {
                this.addResult(
                    issue.level.toUpperCase(),
                    `CSP Issue: ${issue.message}`,
                    { recommendation: issue.recommendation }
                );
            });
        }
    }

    async testServerHealth() {
        console.log('🏥 Testing Server Health...');

        try {
            const response = await this.makeRequest('/health');
            const health = JSON.parse(response);

            this.addResult(
                health.status === 'healthy' ? 'PASS' : 'FAIL',
                'Server Health Check',
                {
                    status: health.status,
                    uptime: health.uptime,
                    version: health.version
                }
            );
        } catch (error) {
            this.addResult('FAIL', 'Server Health Check', { error: error.message });
        }
    }

    async testSecurityReport() {
        console.log('📊 Testing Security Report Endpoint...');

        try {
            const response = await this.makeRequest('/api/security/report');
            const report = JSON.parse(response);

            this.addResult(
                'PASS',
                'Security Report Generation',
                {
                    securityLevel: report.securityLevel,
                    cspViolations: report.metrics.cspViolations,
                    totalRecommendations: report.recommendations.length
                }
            );

            // Validate CSP test results
            if (report.cspTest) {
                const { totalResources, allowedResources, blockedResources } = report.cspTest;

                this.addResult(
                    blockedResources === 0 ? 'PASS' : 'WARN',
                    'CSP Resource Access Test',
                    {
                        total: totalResources,
                        allowed: allowedResources,
                        blocked: blockedResources
                    }
                );

                // Check specific resources
                report.cspTest.results.forEach(result => {
                    this.addResult(
                        result.allowed ? 'PASS' : 'FAIL',
                        `Resource Access: ${result.type}`,
                        {
                            resource: result.resource,
                            allowed: result.allowed,
                            blockedBy: result.blockedBy
                        }
                    );
                });
            }
        } catch (error) {
            this.addResult('FAIL', 'Security Report Endpoint', { error: error.message });
        }
    }

    async testSocketIOEndpoint() {
        console.log('🔌 Testing Socket.io Endpoint...');

        try {
            const response = await this.makeRequest('/socket.io.js');

            // Check if the response contains JavaScript content
            const isJavaScript = response.includes('function') || response.includes('var ') || response.includes('class ');

            this.addResult(
                isJavaScript ? 'PASS' : 'FAIL',
                'Socket.io Client Endpoint',
                {
                    contentType: 'application/javascript',
                    contentLength: response.length,
                    isSelfHosted: response.includes('SocketClient')
                }
            );
        } catch (error) {
            this.addResult('FAIL', 'Socket.io Client Endpoint', { error: error.message });
        }
    }

    async testCSPPolicyGeneration() {
        console.log('🛡️ Testing CSP Policy Generation...');

        const cspHeader = this.securityConfig.generateCSPHeader();
        const cspParts = cspHeader.split(';').map(part => part.trim()).filter(part => part);

        this.addResult(
            cspParts.length > 0 ? 'PASS' : 'FAIL',
            'CSP Policy Generation',
            {
                headerLength: cspHeader.length,
                directiveCount: cspParts.length
            }
        );

        // Check for required directives
        const requiredDirectives = ['default-src', 'script-src', 'style-src', 'connect-src'];
        requiredDirectives.forEach(directive => {
            const hasDirective = cspParts.some(part => part.startsWith(directive));
            this.addResult(
                hasDirective ? 'PASS' : 'FAIL',
                `CSP Directive Present: ${directive}`,
                { present: hasDirective }
            );
        });
    }

    async testResourceValidation() {
        console.log('🔍 Testing Resource Validation...');

        const testResources = [
            { type: 'script', url: 'https://cdn.jsdelivr.net/npm/chart.js' },
            { type: 'script', url: '/socket.io.js' },
            { type: 'style', url: 'https://fonts.googleapis.com/css2?family=Inter' },
            { type: 'connect', url: 'ws://localhost:3001' },
            { type: 'img', url: 'data:image/png;base64,test' }
        ];

        const results = this.securityConfig.testCSPWithResources(testResources);

        this.addResult(
            'INFO',
            'Resource Validation Test',
            {
                total: results.totalResources,
                allowed: results.allowedResources,
                blocked: results.blockedResources
            }
        );

        results.results.forEach(result => {
            this.addResult(
                result.allowed ? 'PASS' : 'FAIL',
                `Resource: ${result.type}`,
                {
                    url: result.resource,
                    allowed: result.allowed,
                    blockedBy: result.blockedBy
                }
            );
        });
    }

    async testHeaders() {
        console.log('📋 Testing Security Headers...');

        try {
            const response = await this.makeRawRequest('/');

            const securityHeaders = [
                'content-security-policy',
                'x-content-type-options',
                'x-frame-options',
                'x-xss-protection',
                'referrer-policy',
                'permissions-policy'
            ];

            securityHeaders.forEach(header => {
                const headerValue = response.headers[header.toLowerCase()];
                this.addResult(
                    headerValue ? 'PASS' : 'FAIL',
                    `Security Header: ${header}`,
                    {
                        present: !!headerValue,
                        value: headerValue ? headerValue.substring(0, 100) + '...' : null
                    }
                );
            });
        } catch (error) {
            this.addResult('FAIL', 'Security Headers Test', { error: error.message });
        }
    }

    async makeRequest(path) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.serverUrl);

            http.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    }
                });
            }).on('error', reject);
        });
    }

    async makeRawRequest(path) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.serverUrl);

            http.get(url, (res) => {
                resolve(res);
            }).on('error', reject);
        });
    }

    addResult(status, description, details = {}) {
        const result = {
            status,
            description,
            details,
            timestamp: new Date().toISOString()
        };

        this.testResults.push(result);

        const statusIcon = {
            'PASS': '✅',
            'FAIL': '❌',
            'WARN': '⚠️',
            'INFO': 'ℹ️',
            'ERROR': '🚨'
        }[status] || '❓';

        console.log(`  ${statusIcon} ${description}`);
        if (Object.keys(details).length > 0) {
            console.log(`     Details: ${JSON.stringify(details, null, 2)}`);
        }
    }

    async generateReport() {
        console.log('\n📊 Test Summary Report');
        console.log('====================');

        const summary = {
            total: this.testResults.length,
            passed: this.testResults.filter(r => r.status === 'PASS').length,
            failed: this.testResults.filter(r => r.status === 'FAIL').length,
            warnings: this.testResults.filter(r => r.status === 'WARN').length,
            errors: this.testResults.filter(r => r.status === 'ERROR').length,
            info: this.testResults.filter(r => r.status === 'INFO').length
        };

        console.log(`Total Tests: ${summary.total}`);
        console.log(`✅ Passed: ${summary.passed}`);
        console.log(`⚠️ Warnings: ${summary.warnings}`);
        console.log(`❌ Failed: ${summary.failed}`);
        console.log(`🚨 Errors: ${summary.errors}`);
        console.log(`ℹ️ Info: ${summary.info}`);

        const successRate = ((summary.passed / summary.total) * 100).toFixed(1);
        console.log(`\nSuccess Rate: ${successRate}%`);

        if (summary.failed > 0 || summary.errors > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults
                .filter(r => r.status === 'FAIL' || r.status === 'ERROR')
                .forEach(result => {
                    console.log(`  - ${result.description}: ${JSON.stringify(result.details)}`);
                });
        }

        if (summary.warnings > 0) {
            console.log('\n⚠️ Warnings:');
            this.testResults
                .filter(r => r.status === 'WARN')
                .forEach(result => {
                    console.log(`  - ${result.description}: ${JSON.stringify(result.details)}`);
                });
        }

        // Generate recommendations
        console.log('\n💡 Recommendations:');

        if (summary.failed > 0) {
            console.log('  - Fix failed tests before deploying to production');
        }

        if (summary.warnings > 0) {
            console.log('  - Review warnings and implement suggested improvements');
        }

        if (summary.errors > 0) {
            console.log('  - Address critical errors immediately');
        }

        console.log('  - Regularly monitor CSP violations and adjust policy as needed');
        console.log('  - Keep security headers up to date with best practices');
        console.log('  - Test with real-world usage scenarios');

        console.log('\n🎯 Next Steps:');
        console.log('  1. Run the dashboard server: node monitor/dashboard/server.js');
        console.log('  2. Access the dashboard: http://localhost:3001');
        console.log('  3. Check browser console for CSP violations');
        console.log('  4. Monitor the /api/security/report endpoint');

        // Save detailed report
        const reportData = {
            timestamp: new Date().toISOString(),
            summary,
            results: this.testResults,
            recommendations: this.generateRecommendations(summary)
        };

        try {
            // Use fs module dynamically
            const fs = await import('fs');
            fs.writeFileSync(
                '/mnt/c/Users/masha/Documents/claude-flow-novice/csp-test-report.json',
                JSON.stringify(reportData, null, 2)
            );
            console.log('\n📄 Detailed report saved to: csp-test-report.json');
        } catch (error) {
            console.log('\n⚠️ Could not save detailed report:', error.message);
        }
    }

    generateRecommendations(summary) {
        const recommendations = [];

        if (summary.failed > 0) {
            recommendations.push({
                priority: 'HIGH',
                action: 'Fix failed tests',
                description: 'Address critical failures before production deployment'
            });
        }

        if (summary.errors > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                action: 'Resolve errors',
                description: 'Immediate attention required for system errors'
            });
        }

        if (summary.warnings > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                action: 'Review warnings',
                description: 'Implement suggested improvements for better security'
            });
        }

        recommendations.push({
            priority: 'LOW',
            action: 'Regular monitoring',
            description: 'Set up automated CSP violation monitoring and reporting'
        });

        return recommendations;
    }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new CSPTester();
    tester.runAllTests().catch(console.error);
}

export { CSPTester };