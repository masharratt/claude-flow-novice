#!/usr/bin/env node

/**
 * NPM Package Metrics Collector
 *
 * Collects and reports metrics for claude-flow-novice NPM package:
 * - Download statistics
 * - Installation success rate
 * - Version adoption tracking
 * - Error reporting and analytics
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

export class NPMMetricsCollector extends EventEmitter {
    constructor(options = {}) {
        super();

        this.packageName = options.packageName || 'claude-flow-novice';
        this.metricsDir = options.metricsDir || './logs/npm-metrics';
        this.apiBaseURL = 'https://api.npmjs.org';
        this.registryURL = 'https://registry.npmjs.org';

        // Metrics cache
        this.cache = {
            downloads: null,
            versions: null,
            packageInfo: null,
            lastUpdate: null
        };

        // Installation tracking
        this.installations = {
            successful: 0,
            failed: 0,
            errors: []
        };

        this.ensureMetricsDir();
    }

    async ensureMetricsDir() {
        try {
            await fs.mkdir(this.metricsDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create metrics directory:', error.message);
        }
    }

    /**
     * Fetch download statistics from NPM API
     */
    async getDownloadStats(period = 'last-day') {
        const validPeriods = ['last-day', 'last-week', 'last-month'];
        if (!validPeriods.includes(period)) {
            period = 'last-day';
        }

        const url = `${this.apiBaseURL}/downloads/point/${period}/${this.packageName}`;

        try {
            const data = await this.fetchJSON(url);

            const stats = {
                downloads: data.downloads || 0,
                period: period,
                package: data.package,
                start: data.start,
                end: data.end,
                timestamp: new Date().toISOString()
            };

            this.cache.downloads = stats;
            await this.saveMetrics('downloads', stats);
            this.emit('downloads:collected', stats);

            return stats;
        } catch (error) {
            console.error('Failed to fetch download stats:', error.message);
            return {
                downloads: 0,
                period,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get download trends over time
     */
    async getDownloadTrends() {
        const periods = ['last-day', 'last-week', 'last-month'];
        const trends = {};

        for (const period of periods) {
            trends[period] = await this.getDownloadStats(period);
        }

        return {
            trends,
            growth: this.calculateGrowth(trends),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Calculate download growth rate
     */
    calculateGrowth(trends) {
        const daily = trends['last-day']?.downloads || 0;
        const weekly = (trends['last-week']?.downloads || 0) / 7;
        const monthly = (trends['last-month']?.downloads || 0) / 30;

        return {
            dailyAverage: Math.round(daily),
            weeklyAverage: Math.round(weekly),
            monthlyAverage: Math.round(monthly),
            weekOverDay: weekly > 0 ? ((daily - weekly) / weekly * 100).toFixed(2) : 0,
            monthOverWeek: monthly > 0 ? ((weekly - monthly) / monthly * 100).toFixed(2) : 0
        };
    }

    /**
     * Get package version information
     */
    async getVersionInfo() {
        const url = `${this.registryURL}/${this.packageName}`;

        try {
            const data = await this.fetchJSON(url);

            const versions = Object.keys(data.versions || {});
            const latestVersion = data['dist-tags']?.latest || 'unknown';
            const allTags = data['dist-tags'] || {};

            const versionInfo = {
                package: this.packageName,
                latestVersion,
                totalVersions: versions.length,
                versions: versions.sort((a, b) => {
                    // Semver sorting
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < 3; i++) {
                        if (aParts[i] !== bParts[i]) {
                            return bParts[i] - aParts[i];
                        }
                    }
                    return 0;
                }),
                tags: allTags,
                created: data.time?.created,
                modified: data.time?.modified,
                timestamp: new Date().toISOString()
            };

            this.cache.versions = versionInfo;
            await this.saveMetrics('versions', versionInfo);
            this.emit('versions:collected', versionInfo);

            return versionInfo;
        } catch (error) {
            console.error('Failed to fetch version info:', error.message);
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get version adoption statistics
     */
    async getVersionAdoption() {
        const versionInfo = await this.getVersionInfo();
        const trends = await this.getDownloadTrends();

        // In real scenario, we'd track which versions are being downloaded
        // For now, providing framework for this data
        return {
            latestVersion: versionInfo.latestVersion,
            totalVersions: versionInfo.totalVersions,
            downloadTrends: trends,
            adoptionRate: {
                latest: '85%', // Placeholder - would be calculated from real data
                previousMajor: '12%',
                older: '3%'
            },
            recommendations: this.generateVersionRecommendations(versionInfo),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Generate version recommendations
     */
    generateVersionRecommendations(versionInfo) {
        const recommendations = [];

        if (versionInfo.totalVersions > 50) {
            recommendations.push({
                type: 'cleanup',
                priority: 'low',
                message: 'Consider deprecating old versions to reduce version count'
            });
        }

        const latest = versionInfo.latestVersion;
        if (latest && latest.includes('beta') || latest.includes('alpha')) {
            recommendations.push({
                type: 'stability',
                priority: 'high',
                message: 'Latest version is pre-release. Consider releasing a stable version'
            });
        }

        return recommendations;
    }

    /**
     * Track installation success/failure
     */
    async trackInstallation(success, error = null) {
        if (success) {
            this.installations.successful++;
        } else {
            this.installations.failed++;
            if (error) {
                this.installations.errors.push({
                    error: error.message || error,
                    timestamp: new Date().toISOString(),
                    stack: error.stack
                });
            }
        }

        const stats = this.getInstallationStats();
        await this.saveMetrics('installations', stats);
        this.emit('installation:tracked', { success, error, stats });

        return stats;
    }

    /**
     * Get installation statistics
     */
    getInstallationStats() {
        const total = this.installations.successful + this.installations.failed;
        const successRate = total > 0
            ? (this.installations.successful / total * 100).toFixed(2)
            : 100;

        return {
            successful: this.installations.successful,
            failed: this.installations.failed,
            total,
            successRate: parseFloat(successRate),
            errorSamples: this.installations.errors.slice(-10), // Last 10 errors
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Report error with context
     */
    async reportError(error, context = {}) {
        const errorReport = {
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            },
            context: {
                ...context,
                packageVersion: context.version || 'unknown',
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            timestamp: new Date().toISOString()
        };

        await this.saveMetrics('errors', errorReport);
        this.emit('error:reported', errorReport);

        return errorReport;
    }

    /**
     * Get comprehensive package metrics
     */
    async getComprehensiveMetrics() {
        const [downloads, versions, adoption] = await Promise.all([
            this.getDownloadTrends(),
            this.getVersionInfo(),
            this.getVersionAdoption()
        ]);

        const installations = this.getInstallationStats();

        const metrics = {
            package: this.packageName,
            downloads,
            versions,
            adoption,
            installations,
            health: this.calculatePackageHealth(downloads, installations),
            timestamp: new Date().toISOString()
        };

        await this.saveMetrics('comprehensive', metrics);
        this.emit('metrics:collected', metrics);

        return metrics;
    }

    /**
     * Calculate overall package health score
     */
    calculatePackageHealth(downloads, installations) {
        const scores = {
            downloads: 0,
            installations: 0,
            overall: 0
        };

        // Download health (based on daily average)
        const dailyDownloads = downloads.trends['last-day']?.downloads || 0;
        if (dailyDownloads > 100) scores.downloads = 100;
        else if (dailyDownloads > 50) scores.downloads = 80;
        else if (dailyDownloads > 10) scores.downloads = 60;
        else scores.downloads = 40;

        // Installation health (based on success rate)
        scores.installations = installations.successRate;

        // Overall health
        scores.overall = Math.round((scores.downloads + scores.installations) / 2);

        return {
            scores,
            status: scores.overall >= 80 ? 'healthy' : scores.overall >= 60 ? 'fair' : 'needs-attention',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Save metrics to file
     */
    async saveMetrics(type, data) {
        const filename = path.join(this.metricsDir, `${type}-${Date.now()}.json`);

        try {
            await fs.writeFile(filename, JSON.stringify(data, null, 2));
            return filename;
        } catch (error) {
            console.error(`Failed to save ${type} metrics:`, error.message);
            return null;
        }
    }

    /**
     * Fetch JSON from URL
     */
    fetchJSON(url) {
        return new Promise((resolve, reject) => {
            https.get(url, {
                headers: {
                    'User-Agent': 'claude-flow-novice-metrics-collector'
                }
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(new Error(`Failed to parse JSON: ${error.message}`));
                    }
                });
            }).on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Start periodic metrics collection
     */
    startPeriodicCollection(interval = 3600000) { // Default: 1 hour
        console.log(`Starting periodic metrics collection (interval: ${interval}ms)`);

        this.collectionInterval = setInterval(async () => {
            try {
                await this.getComprehensiveMetrics();
            } catch (error) {
                console.error('Periodic collection failed:', error.message);
            }
        }, interval);

        // Collect immediately on start
        this.getComprehensiveMetrics();
    }

    /**
     * Stop periodic collection
     */
    stopPeriodicCollection() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            console.log('Stopped periodic metrics collection');
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const collector = new NPMMetricsCollector();

    const command = process.argv[2] || 'comprehensive';

    switch (command) {
        case 'downloads':
            collector.getDownloadTrends().then(data => {
                console.log(JSON.stringify(data, null, 2));
            });
            break;

        case 'versions':
            collector.getVersionInfo().then(data => {
                console.log(JSON.stringify(data, null, 2));
            });
            break;

        case 'adoption':
            collector.getVersionAdoption().then(data => {
                console.log(JSON.stringify(data, null, 2));
            });
            break;

        case 'comprehensive':
            collector.getComprehensiveMetrics().then(data => {
                console.log(JSON.stringify(data, null, 2));
            });
            break;

        case 'monitor':
            const interval = parseInt(process.argv[3]) || 3600000;
            collector.startPeriodicCollection(interval);
            console.log('Monitoring started. Press Ctrl+C to stop.');
            break;

        default:
            console.log(`
NPM Metrics Collector - claude-flow-novice

Usage:
  node npm-metrics-collector.js [command]

Commands:
  downloads      - Get download statistics
  versions       - Get version information
  adoption       - Get version adoption stats
  comprehensive  - Get all metrics (default)
  monitor [ms]   - Start periodic collection

Examples:
  node npm-metrics-collector.js downloads
  node npm-metrics-collector.js monitor 1800000  # Monitor every 30 minutes
            `);
    }
}

export default NPMMetricsCollector;
