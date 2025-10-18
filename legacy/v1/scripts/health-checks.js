#!/usr/bin/env node

/**
 * Health Check System
 *
 * Comprehensive health checks for claude-flow-novice:
 * - Package installation validation
 * - Redis connectivity check
 * - Build artifacts verification
 * - System requirements validation
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);

export class HealthCheckSystem {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.timeout = options.timeout || 10000;

        this.results = {
            overall: 'unknown',
            checks: [],
            timestamp: new Date().toISOString()
        };

        this.systemRequirements = {
            node: '>=20.0.0',
            npm: '>=9.0.0',
            memory: 512 * 1024 * 1024, // 512MB minimum
            diskSpace: 500 * 1024 * 1024 // 500MB minimum
        };
    }

    /**
     * Run all health checks
     */
    async runAll() {
        console.log('Running comprehensive health checks...\n');

        const checks = [
            this.checkSystemRequirements(),
            this.checkPackageInstallation(),
            this.checkRedisConnectivity(),
            this.checkBuildArtifacts(),
            this.checkDependencies(),
            this.checkConfiguration()
        ];

        const results = await Promise.allSettled(checks);

        this.results.checks = results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    name: `Check ${index + 1}`,
                    status: 'failed',
                    error: result.reason.message
                };
            }
        });

        this.results.overall = this.determineOverallStatus();
        this.results.timestamp = new Date().toISOString();

        return this.results;
    }

    /**
     * Check system requirements
     */
    async checkSystemRequirements() {
        const check = {
            name: 'System Requirements',
            status: 'unknown',
            details: {},
            errors: []
        };

        try {
            // Check Node.js version
            const nodeVersion = process.version;
            const nodeOk = this.compareVersion(nodeVersion, '20.0.0');
            check.details.node = {
                version: nodeVersion,
                required: this.systemRequirements.node,
                status: nodeOk ? 'ok' : 'failed'
            };
            if (!nodeOk) {
                check.errors.push(`Node.js version ${nodeVersion} does not meet requirement ${this.systemRequirements.node}`);
            }

            // Check NPM version
            try {
                const { stdout } = await execAsync('npm --version');
                const npmVersion = stdout.trim();
                const npmOk = this.compareVersion(npmVersion, '9.0.0');
                check.details.npm = {
                    version: npmVersion,
                    required: this.systemRequirements.npm,
                    status: npmOk ? 'ok' : 'failed'
                };
                if (!npmOk) {
                    check.errors.push(`NPM version ${npmVersion} does not meet requirement ${this.systemRequirements.npm}`);
                }
            } catch (error) {
                check.details.npm = { status: 'error', error: error.message };
                check.errors.push('NPM not found or not accessible');
            }

            // Check available memory
            const freeMem = require('os').freemem();
            const memOk = freeMem >= this.systemRequirements.memory;
            check.details.memory = {
                available: Math.round(freeMem / 1024 / 1024), // MB
                required: Math.round(this.systemRequirements.memory / 1024 / 1024), // MB
                status: memOk ? 'ok' : 'warning'
            };

            // Check platform
            check.details.platform = {
                type: process.platform,
                arch: process.arch,
                status: 'ok'
            };

            check.status = check.errors.length === 0 ? 'passed' : 'failed';
        } catch (error) {
            check.status = 'error';
            check.error = error.message;
        }

        return check;
    }

    /**
     * Check package installation
     */
    async checkPackageInstallation() {
        const check = {
            name: 'Package Installation',
            status: 'unknown',
            details: {},
            errors: []
        };

        try {
            // Check if package.json exists
            const packageJsonPath = path.resolve('./package.json');
            if (existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
                check.details.package = {
                    name: packageJson.name,
                    version: packageJson.version,
                    status: 'ok'
                };
            } else {
                check.errors.push('package.json not found');
            }

            // Check node_modules
            const nodeModulesPath = path.resolve('./node_modules');
            if (existsSync(nodeModulesPath)) {
                check.details.nodeModules = {
                    exists: true,
                    status: 'ok'
                };
            } else {
                check.errors.push('node_modules directory not found');
            }

            // Check critical dependencies
            const criticalDeps = [
                '@anthropic-ai/claude-agent-sdk',
                '@modelcontextprotocol/sdk',
                'redis',
                'express'
            ];

            const missingDeps = [];
            for (const dep of criticalDeps) {
                const depPath = path.resolve('./node_modules', dep);
                if (!existsSync(depPath)) {
                    missingDeps.push(dep);
                }
            }

            check.details.dependencies = {
                critical: criticalDeps.length,
                missing: missingDeps.length,
                status: missingDeps.length === 0 ? 'ok' : 'failed',
                missingList: missingDeps
            };

            if (missingDeps.length > 0) {
                check.errors.push(`Missing critical dependencies: ${missingDeps.join(', ')}`);
            }

            check.status = check.errors.length === 0 ? 'passed' : 'failed';
        } catch (error) {
            check.status = 'error';
            check.error = error.message;
        }

        return check;
    }

    /**
     * Check Redis connectivity
     */
    async checkRedisConnectivity() {
        const check = {
            name: 'Redis Connectivity',
            status: 'unknown',
            details: {},
            errors: []
        };

        try {
            // Try to connect to Redis
            const redis = require('redis');
            const client = redis.createClient({
                socket: {
                    connectTimeout: 5000
                }
            });

            try {
                await client.connect();

                // Test basic operations
                await client.ping();

                const info = await client.info();
                const lines = info.split('\r\n');
                const versionLine = lines.find(line => line.startsWith('redis_version:'));
                const version = versionLine ? versionLine.split(':')[1] : 'unknown';

                check.details.connection = {
                    status: 'connected',
                    version: version
                };

                // Test pub/sub capability
                const testKey = `health-check:${Date.now()}`;
                await client.set(testKey, 'test', { EX: 10 });
                const value = await client.get(testKey);
                await client.del(testKey);

                check.details.operations = {
                    set: 'ok',
                    get: value === 'test' ? 'ok' : 'failed',
                    delete: 'ok'
                };

                await client.quit();
                check.status = 'passed';
            } catch (error) {
                check.errors.push(`Redis connection failed: ${error.message}`);
                check.status = 'failed';
                try {
                    await client.quit();
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        } catch (error) {
            check.errors.push(`Redis module not found: ${error.message}`);
            check.status = 'failed';
            check.details.note = 'Redis is required for swarm coordination';
        }

        return check;
    }

    /**
     * Check build artifacts
     */
    async checkBuildArtifacts() {
        const check = {
            name: 'Build Artifacts',
            status: 'unknown',
            details: {},
            errors: []
        };

        try {
            const distPath = path.resolve('./.claude-flow-novice/dist');
            const criticalPaths = [
                './.claude-flow-novice/dist/src/index.js',
                './.claude-flow-novice/dist/src/cli/index.js',
                './.claude-flow-novice/dist/src/cli/main.js'
            ];

            if (existsSync(distPath)) {
                check.details.dist = { exists: true, status: 'ok' };

                const missing = [];
                for (const criticalPath of criticalPaths) {
                    if (!existsSync(path.resolve(criticalPath))) {
                        missing.push(criticalPath);
                    }
                }

                check.details.critical = {
                    total: criticalPaths.length,
                    missing: missing.length,
                    status: missing.length === 0 ? 'ok' : 'failed',
                    missingList: missing
                };

                if (missing.length > 0) {
                    check.errors.push(`Missing critical build artifacts: ${missing.join(', ')}`);
                    check.errors.push('Run: npm run build');
                }
            } else {
                check.errors.push('Build directory not found');
                check.errors.push('Run: npm run build');
            }

            check.status = check.errors.length === 0 ? 'passed' : 'failed';
        } catch (error) {
            check.status = 'error';
            check.error = error.message;
        }

        return check;
    }

    /**
     * Check dependencies health
     */
    async checkDependencies() {
        const check = {
            name: 'Dependencies Health',
            status: 'unknown',
            details: {},
            errors: []
        };

        try {
            // Check for security vulnerabilities
            try {
                const { stdout } = await execAsync('npm audit --json', { timeout: 10000 });
                const auditData = JSON.parse(stdout);

                check.details.security = {
                    vulnerabilities: auditData.metadata?.vulnerabilities || {},
                    status: (auditData.metadata?.vulnerabilities?.high || 0) > 0 ||
                           (auditData.metadata?.vulnerabilities?.critical || 0) > 0
                           ? 'warning' : 'ok'
                };

                if ((auditData.metadata?.vulnerabilities?.critical || 0) > 0) {
                    check.errors.push(`Found ${auditData.metadata.vulnerabilities.critical} critical vulnerabilities`);
                }
            } catch (error) {
                check.details.security = {
                    status: 'unknown',
                    note: 'Unable to run security audit'
                };
            }

            // Check for outdated packages
            try {
                const { stdout } = await execAsync('npm outdated --json', { timeout: 10000 });
                const outdatedData = stdout.trim() ? JSON.parse(stdout) : {};
                const outdatedCount = Object.keys(outdatedData).length;

                check.details.updates = {
                    outdated: outdatedCount,
                    status: outdatedCount > 10 ? 'warning' : 'ok'
                };
            } catch (error) {
                // npm outdated returns non-zero exit code when packages are outdated
                check.details.updates = { status: 'ok' };
            }

            check.status = check.errors.length === 0 ? 'passed' : 'warning';
        } catch (error) {
            check.status = 'error';
            check.error = error.message;
        }

        return check;
    }

    /**
     * Check configuration files
     */
    async checkConfiguration() {
        const check = {
            name: 'Configuration',
            status: 'unknown',
            details: {},
            errors: []
        };

        try {
            const configFiles = [
                'config/production-monitoring.js',
                '.swcrc',
                'config/jest/jest.config.js'
            ];

            const missing = [];
            for (const configFile of configFiles) {
                if (!existsSync(path.resolve(configFile))) {
                    missing.push(configFile);
                }
            }

            check.details.files = {
                total: configFiles.length,
                missing: missing.length,
                status: missing.length === 0 ? 'ok' : 'warning',
                missingList: missing
            };

            if (missing.length > 0) {
                check.errors.push(`Missing configuration files: ${missing.join(', ')}`);
            }

            check.status = check.errors.length === 0 ? 'passed' : 'warning';
        } catch (error) {
            check.status = 'error';
            check.error = error.message;
        }

        return check;
    }

    /**
     * Determine overall health status
     */
    determineOverallStatus() {
        const statuses = this.results.checks.map(check => check.status);

        if (statuses.includes('failed') || statuses.includes('error')) {
            return 'unhealthy';
        }

        if (statuses.includes('warning')) {
            return 'degraded';
        }

        if (statuses.every(status => status === 'passed')) {
            return 'healthy';
        }

        return 'unknown';
    }

    /**
     * Compare semantic versions
     */
    compareVersion(version, requirement) {
        const cleanVersion = version.replace(/^v/, '');
        const cleanRequirement = requirement.replace(/^>=/, '');

        const vParts = cleanVersion.split('.').map(Number);
        const rParts = cleanRequirement.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            if (vParts[i] > rParts[i]) return true;
            if (vParts[i] < rParts[i]) return false;
        }

        return true; // Equal
    }

    /**
     * Generate detailed report
     */
    generateReport() {
        const report = {
            summary: {
                status: this.results.overall,
                timestamp: this.results.timestamp,
                totalChecks: this.results.checks.length,
                passed: this.results.checks.filter(c => c.status === 'passed').length,
                failed: this.results.checks.filter(c => c.status === 'failed').length,
                warnings: this.results.checks.filter(c => c.status === 'warning').length,
                errors: this.results.checks.filter(c => c.status === 'error').length
            },
            checks: this.results.checks,
            recommendations: this.generateRecommendations()
        };

        return report;
    }

    /**
     * Generate recommendations based on check results
     */
    generateRecommendations() {
        const recommendations = [];

        for (const check of this.results.checks) {
            if (check.errors && check.errors.length > 0) {
                recommendations.push({
                    category: check.name,
                    priority: check.status === 'failed' ? 'high' : 'medium',
                    issues: check.errors,
                    actions: this.getActionsForCheck(check)
                });
            }
        }

        return recommendations;
    }

    /**
     * Get recommended actions for a failed check
     */
    getActionsForCheck(check) {
        const actions = [];

        switch (check.name) {
            case 'System Requirements':
                if (check.details.node?.status === 'failed') {
                    actions.push('Upgrade Node.js to version 20.0.0 or higher');
                }
                if (check.details.npm?.status === 'failed') {
                    actions.push('Upgrade NPM to version 9.0.0 or higher');
                }
                break;

            case 'Package Installation':
                if (check.details.nodeModules?.exists === false) {
                    actions.push('Run: npm install');
                }
                if (check.details.dependencies?.missing?.length > 0) {
                    actions.push('Install missing dependencies: npm install');
                }
                break;

            case 'Redis Connectivity':
                actions.push('Ensure Redis is installed and running');
                actions.push('Check Redis connection settings');
                break;

            case 'Build Artifacts':
                actions.push('Run: npm run build');
                actions.push('Verify build configuration');
                break;

            case 'Dependencies Health':
                if (check.details.security?.status === 'warning') {
                    actions.push('Run: npm audit fix');
                    actions.push('Review security vulnerabilities');
                }
                break;

            case 'Configuration':
                actions.push('Ensure all required configuration files are present');
                actions.push('Run: npx claude-flow-novice init');
                break;
        }

        return actions;
    }

    /**
     * Print report to console
     */
    printReport() {
        const report = this.generateReport();

        console.log('\n' + '='.repeat(60));
        console.log('HEALTH CHECK REPORT');
        console.log('='.repeat(60));
        console.log(`Overall Status: ${report.summary.status.toUpperCase()}`);
        console.log(`Timestamp: ${report.summary.timestamp}`);
        console.log(`Total Checks: ${report.summary.totalChecks}`);
        console.log(`Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Warnings: ${report.summary.warnings}`);
        console.log('='.repeat(60));

        for (const check of report.checks) {
            const statusIcon = check.status === 'passed' ? '✓' :
                             check.status === 'failed' ? '✗' :
                             check.status === 'warning' ? '⚠' : '?';
            console.log(`\n${statusIcon} ${check.name}: ${check.status.toUpperCase()}`);

            if (check.errors && check.errors.length > 0) {
                check.errors.forEach(error => console.log(`  - ${error}`));
            }
        }

        if (report.recommendations.length > 0) {
            console.log('\n' + '='.repeat(60));
            console.log('RECOMMENDATIONS');
            console.log('='.repeat(60));

            for (const rec of report.recommendations) {
                console.log(`\n[${rec.priority.toUpperCase()}] ${rec.category}`);
                rec.actions.forEach(action => console.log(`  → ${action}`));
            }
        }

        console.log('\n' + '='.repeat(60));
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const healthCheck = new HealthCheckSystem({ verbose: true });

    (async () => {
        await healthCheck.runAll();
        healthCheck.printReport();

        const report = healthCheck.generateReport();

        // Exit with appropriate code
        if (report.summary.status === 'healthy') {
            process.exit(0);
        } else if (report.summary.status === 'degraded') {
            process.exit(1);
        } else {
            process.exit(2);
        }
    })();
}

export default HealthCheckSystem;
