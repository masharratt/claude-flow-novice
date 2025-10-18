/**
 * Metrics Collection System for Rollback Triggers
 * Collects and analyzes system metrics to support rollback decision making
 */

const EventEmitter = require('events');

class MetricsCollector extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            // Collection intervals
            metricsCollectionInterval: config.metricsCollectionInterval || 30000, // 30 seconds
            baselineCollectionInterval: config.baselineCollectionInterval || 300000, // 5 minutes

            // Storage settings
            maxMetricHistory: config.maxMetricHistory || 1000,
            metricRetentionMs: config.metricRetentionMs || 86400000, // 24 hours

            // Baseline calculation
            baselineWindowSize: config.baselineWindowSize || 20, // Last 20 measurements
            baselineStabilityThreshold: config.baselineStabilityThreshold || 0.1, // 10% variance

            ...config
        };

        this.metricHistory = {
            errorRate: [],
            performance: [],
            userSatisfaction: [],
            byzantineFailures: [],
            supportTickets: [],
            systemHealth: []
        };

        this.currentBaseline = null;
        this.isCollecting = false;
        this.collectionInterval = null;
        this.baselineInterval = null;
    }

    /**
     * Start metrics collection
     */
    startCollection() {
        if (this.isCollecting) {
            console.log('[MetricsCollector] Collection already active');
            return;
        }

        console.log('[MetricsCollector] Starting metrics collection');

        this.isCollecting = true;

        // Start regular metrics collection
        this.collectionInterval = setInterval(
            () => this.collectCurrentMetrics(),
            this.config.metricsCollectionInterval
        );

        // Start baseline updates
        this.baselineInterval = setInterval(
            () => this.updateBaseline(),
            this.config.baselineCollectionInterval
        );

        // Collect initial baseline
        setTimeout(() => this.collectBaselineMetrics(), 1000);
    }

    /**
     * Stop metrics collection
     */
    stopCollection() {
        if (!this.isCollecting) {
            return;
        }

        console.log('[MetricsCollector] Stopping metrics collection');

        this.isCollecting = false;

        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }

        if (this.baselineInterval) {
            clearInterval(this.baselineInterval);
            this.baselineInterval = null;
        }
    }

    /**
     * Collect baseline metrics for comparison
     */
    async collectBaselineMetrics() {
        try {
            console.log('[MetricsCollector] Collecting baseline metrics');

            const baseline = {
                timestamp: new Date(),
                performance: await this.collectPerformanceBaseline(),
                errorRate: await this.collectErrorRateBaseline(),
                userSatisfaction: await this.collectUserSatisfactionBaseline(),
                systemResources: await this.collectSystemResourcesBaseline(),
                throughput: await this.collectThroughputBaseline(),
                responseTime: await this.collectResponseTimeBaseline()
            };

            this.currentBaseline = baseline;

            console.log('[MetricsCollector] Baseline metrics collected');
            this.emit('baseline_updated', baseline);

            return baseline;

        } catch (error) {
            console.error(`[MetricsCollector] Error collecting baseline metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Collect current system metrics
     */
    async collectCurrentMetrics() {
        try {
            const metrics = {
                timestamp: new Date(),
                errorRate: await this.getCurrentErrorRate(),
                performance: await this.getCurrentPerformanceMetrics(),
                userSatisfaction: await this.getCurrentUserSatisfaction(),
                byzantineFailures: await this.getCurrentByzantineFailures(),
                supportTickets: await this.getCurrentSupportTickets(),
                systemHealth: await this.getCurrentSystemHealth()
            };

            // Store in history
            this.storeMetrics(metrics);

            // Cleanup old metrics
            this.cleanupOldMetrics();

            return metrics;

        } catch (error) {
            console.error(`[MetricsCollector] Error collecting current metrics: ${error.message}`);
            return null;
        }
    }

    /**
     * Get error rate for specified time window
     */
    async getErrorRate(windowMs) {
        const cutoff = Date.now() - windowMs;
        const recentMetrics = this.metricHistory.errorRate.filter(
            m => m.timestamp.getTime() > cutoff
        );

        if (recentMetrics.length === 0) {
            return await this.getCurrentErrorRate();
        }

        // Calculate weighted average (more recent metrics have higher weight)
        let totalWeight = 0;
        let weightedSum = 0;

        recentMetrics.forEach((metric, index) => {
            const weight = index + 1; // Recent metrics get higher weight
            totalWeight += weight;
            weightedSum += metric.value * weight;
        });

        return weightedSum / totalWeight;
    }

    /**
     * Get performance metrics for specified time window
     */
    async getPerformanceMetrics(windowMs) {
        const cutoff = Date.now() - windowMs;
        const recentMetrics = this.metricHistory.performance.filter(
            m => m.timestamp.getTime() > cutoff
        );

        if (recentMetrics.length === 0) {
            return await this.getCurrentPerformanceMetrics();
        }

        // Aggregate performance metrics
        const aggregated = {
            responseTime: this.aggregateMetricValues(recentMetrics, 'responseTime'),
            throughput: this.aggregateMetricValues(recentMetrics, 'throughput'),
            memoryUsage: this.aggregateMetricValues(recentMetrics, 'memoryUsage'),
            cpuUsage: this.aggregateMetricValues(recentMetrics, 'cpuUsage')
        };

        return aggregated;
    }

    /**
     * Get user satisfaction score for specified time window
     */
    async getUserSatisfactionScore(windowMs) {
        const cutoff = Date.now() - windowMs;
        const recentMetrics = this.metricHistory.userSatisfaction.filter(
            m => m.timestamp.getTime() > cutoff
        );

        if (recentMetrics.length === 0) {
            return await this.getCurrentUserSatisfaction();
        }

        // Calculate average satisfaction
        const totalScore = recentMetrics.reduce((sum, m) => sum + m.value, 0);
        return totalScore / recentMetrics.length;
    }

    /**
     * Get Byzantine failure rate for specified time window
     */
    async getByzantineFailureRate(windowMs) {
        const cutoff = Date.now() - windowMs;
        const recentMetrics = this.metricHistory.byzantineFailures.filter(
            m => m.timestamp.getTime() > cutoff
        );

        if (recentMetrics.length === 0) {
            return await this.getCurrentByzantineFailures();
        }

        // Calculate average failure rate
        const totalFailureRate = recentMetrics.reduce((sum, m) => sum + m.value, 0);
        return totalFailureRate / recentMetrics.length;
    }

    /**
     * Get support ticket surge for specified time window
     */
    async getSupportTicketSurge(windowMs) {
        const cutoff = Date.now() - windowMs;
        const recentMetrics = this.metricHistory.supportTickets.filter(
            m => m.timestamp.getTime() > cutoff
        );

        if (recentMetrics.length === 0 || !this.currentBaseline) {
            return 0; // No surge detected
        }

        // Calculate current ticket rate
        const currentRate = recentMetrics.length > 0 ?
            recentMetrics[recentMetrics.length - 1].value : 0;

        // Compare to baseline
        const baselineRate = this.currentBaseline.supportTickets || currentRate;

        if (baselineRate === 0) return 0;

        return (currentRate - baselineRate) / baselineRate;
    }

    /**
     * Current metric collection methods (simulated)
     */

    async getCurrentErrorRate() {
        // Simulate error rate collection
        await this.simulateDelay(50, 200);

        // Generate realistic error rate (usually low, occasionally spikes)
        const baseRate = 0.001; // 0.1% base error rate
        const spike = Math.random() < 0.05 ? Math.random() * 0.02 : 0; // 5% chance of spike up to 2%

        return Math.min(baseRate + spike, 0.05); // Cap at 5%
    }

    async getCurrentPerformanceMetrics() {
        await this.simulateDelay(100, 300);

        return {
            responseTime: 200 + Math.random() * 1000, // 200-1200ms
            throughput: 80 + Math.random() * 40, // 80-120 req/min
            memoryUsage: 0.4 + Math.random() * 0.3, // 40-70%
            cpuUsage: 0.2 + Math.random() * 0.4 // 20-60%
        };
    }

    async getCurrentUserSatisfaction() {
        await this.simulateDelay(200, 500);

        // User satisfaction typically ranges from 3.5 to 5.0
        const baseSatisfaction = 4.2;
        const variation = (Math.random() - 0.5) * 1.0; // +/- 0.5

        return Math.max(1.0, Math.min(5.0, baseSatisfaction + variation));
    }

    async getCurrentByzantineFailures() {
        await this.simulateDelay(150, 400);

        // Byzantine failures should be rare in healthy system
        const baseFailureRate = 0.001; // 0.1% base failure rate
        const spike = Math.random() < 0.02 ? Math.random() * 0.1 : 0; // 2% chance of spike

        return Math.min(baseFailureRate + spike, 0.2); // Cap at 20%
    }

    async getCurrentSupportTickets() {
        await this.simulateDelay(100, 250);

        // Support tickets per hour
        const baseTickets = 5;
        const variation = Math.floor((Math.random() - 0.5) * 10); // +/- 5 tickets

        return Math.max(0, baseTickets + variation);
    }

    async getCurrentSystemHealth() {
        await this.simulateDelay(200, 600);

        return {
            overallHealth: 0.85 + Math.random() * 0.15, // 85-100%
            componentHealth: {
                database: 0.9 + Math.random() * 0.1,
                api: 0.8 + Math.random() * 0.2,
                frontend: 0.85 + Math.random() * 0.15,
                cache: 0.9 + Math.random() * 0.1
            }
        };
    }

    /**
     * Baseline collection methods
     */

    async collectPerformanceBaseline() {
        const samples = [];

        // Collect multiple samples for stable baseline
        for (let i = 0; i < 5; i++) {
            samples.push(await this.getCurrentPerformanceMetrics());
            await this.simulateDelay(100, 200);
        }

        return {
            responseTime: this.calculateMedian(samples.map(s => s.responseTime)),
            throughput: this.calculateMedian(samples.map(s => s.throughput)),
            memoryUsage: this.calculateMedian(samples.map(s => s.memoryUsage)),
            cpuUsage: this.calculateMedian(samples.map(s => s.cpuUsage))
        };
    }

    async collectErrorRateBaseline() {
        const samples = [];

        for (let i = 0; i < 5; i++) {
            samples.push(await this.getCurrentErrorRate());
            await this.simulateDelay(100, 200);
        }

        return this.calculateMedian(samples);
    }

    async collectUserSatisfactionBaseline() {
        const samples = [];

        for (let i = 0; i < 3; i++) {
            samples.push(await this.getCurrentUserSatisfaction());
            await this.simulateDelay(200, 400);
        }

        return this.calculateMedian(samples);
    }

    async collectSystemResourcesBaseline() {
        return {
            memoryAvailable: 0.6, // 60% available
            diskSpace: 0.75, // 75% available
            networkBandwidth: 0.8 // 80% available
        };
    }

    async collectThroughputBaseline() {
        const samples = [];

        for (let i = 0; i < 5; i++) {
            const perf = await this.getCurrentPerformanceMetrics();
            samples.push(perf.throughput);
            await this.simulateDelay(100, 200);
        }

        return this.calculateMedian(samples);
    }

    async collectResponseTimeBaseline() {
        const samples = [];

        for (let i = 0; i < 5; i++) {
            const perf = await this.getCurrentPerformanceMetrics();
            samples.push(perf.responseTime);
            await this.simulateDelay(100, 200);
        }

        return this.calculateMedian(samples);
    }

    /**
     * Update baseline periodically
     */
    async updateBaseline() {
        if (this.metricHistory.performance.length < this.config.baselineWindowSize) {
            return; // Not enough data for stable baseline
        }

        try {
            console.log('[MetricsCollector] Updating baseline from recent metrics');

            const recentMetrics = this.getRecentMetricsForBaseline();

            // Check if metrics are stable enough for baseline update
            if (this.isMetricsStable(recentMetrics)) {
                await this.collectBaselineMetrics();
            } else {
                console.log('[MetricsCollector] Metrics not stable enough for baseline update');
            }

        } catch (error) {
            console.error(`[MetricsCollector] Error updating baseline: ${error.message}`);
        }
    }

    /**
     * Store metrics in history
     */
    storeMetrics(metrics) {
        Object.keys(metrics).forEach(key => {
            if (key === 'timestamp') return;

            if (!this.metricHistory[key]) {
                this.metricHistory[key] = [];
            }

            this.metricHistory[key].push({
                timestamp: metrics.timestamp,
                value: metrics[key]
            });

            // Limit history size
            if (this.metricHistory[key].length > this.config.maxMetricHistory) {
                this.metricHistory[key].shift();
            }
        });
    }

    /**
     * Clean up old metrics
     */
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.metricRetentionMs;

        Object.keys(this.metricHistory).forEach(key => {
            this.metricHistory[key] = this.metricHistory[key].filter(
                m => m.timestamp.getTime() > cutoff
            );
        });
    }

    /**
     * Get recent metrics for baseline calculation
     */
    getRecentMetricsForBaseline() {
        const recent = {};

        Object.keys(this.metricHistory).forEach(key => {
            recent[key] = this.metricHistory[key]
                .slice(-this.config.baselineWindowSize);
        });

        return recent;
    }

    /**
     * Check if metrics are stable for baseline update
     */
    isMetricsStable(recentMetrics) {
        // Check stability of key metrics
        const keyMetrics = ['errorRate', 'performance'];

        for (const metric of keyMetrics) {
            if (!recentMetrics[metric] || recentMetrics[metric].length < 10) {
                return false;
            }

            const values = recentMetrics[metric].map(m =>
                typeof m.value === 'object' ? m.value.responseTime : m.value
            );

            const variance = this.calculateVariance(values);
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const coefficientOfVariation = Math.sqrt(variance) / mean;

            if (coefficientOfVariation > this.config.baselineStabilityThreshold) {
                return false;
            }
        }

        return true;
    }

    /**
     * Utility methods
     */

    aggregateMetricValues(metrics, property) {
        const values = metrics.map(m => m.value[property]).filter(v => v !== undefined);

        if (values.length === 0) return 0;

        return {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            median: this.calculateMedian(values),
            current: values[values.length - 1]
        };
    }

    calculateMedian(values) {
        if (values.length === 0) return 0;

        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        return sorted.length % 2 === 0 ?
            (sorted[mid - 1] + sorted[mid]) / 2 :
            sorted[mid];
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDifferences = values.map(value => Math.pow(value - mean, 2));

        return squaredDifferences.reduce((a, b) => a + b, 0) / values.length;
    }

    async simulateDelay(minMs, maxMs) {
        const delay = Math.random() * (maxMs - minMs) + minMs;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Get metrics collection status
     */
    getStatus() {
        return {
            isCollecting: this.isCollecting,
            baselineAvailable: this.currentBaseline !== null,
            baselineAge: this.currentBaseline ?
                Date.now() - this.currentBaseline.timestamp.getTime() : null,
            metricHistorySize: Object.keys(this.metricHistory).reduce(
                (total, key) => total + this.metricHistory[key].length, 0
            ),
            lastCollection: this.getLastCollectionTime()
        };
    }

    getLastCollectionTime() {
        let lastTime = null;

        Object.values(this.metricHistory).forEach(history => {
            if (history.length > 0) {
                const time = history[history.length - 1].timestamp.getTime();
                if (!lastTime || time > lastTime) {
                    lastTime = time;
                }
            }
        });

        return lastTime ? new Date(lastTime) : null;
    }

    /**
     * Get current baseline
     */
    getBaseline() {
        return this.currentBaseline;
    }

    /**
     * Get metric history
     */
    getMetricHistory(metricType, limit = 50) {
        if (!this.metricHistory[metricType]) {
            return [];
        }

        return this.metricHistory[metricType]
            .slice(-limit)
            .map(m => ({
                timestamp: m.timestamp,
                value: m.value
            }));
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopCollection();

        Object.keys(this.metricHistory).forEach(key => {
            this.metricHistory[key] = [];
        });

        this.currentBaseline = null;
    }
}

module.exports = { MetricsCollector };