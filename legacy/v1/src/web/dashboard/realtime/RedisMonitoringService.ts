/**
 * Redis Monitoring Service
 *
 * Monitors Redis channels and queues for agent coordination and hook feedback
 * Integrates with existing RealtimeServer for WebSocket broadcasting
 *
 * Phase 5: Validation & Monitoring + Dashboard Integration
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface RedisMonitoringConfig {
    redisHost?: string;
    redisPort?: number;
    redisDb?: number;
    monitoringInterval?: number;  // Polling interval in ms
    staleKeyThreshold?: number;   // Consider key stale after N seconds
    enablePatternValidation?: boolean;
    maxHistorySize?: number;      // Maximum history entries to keep
}

export interface FeedbackMessage {
    timestamp: string;
    source: string;
    agentId: string;
    spawnMode: 'cli' | 'task' | 'unknown';
    type: 'ROOT_WARNING' | 'LOW_COVERAGE' | 'RUST_QUALITY' | 'TDD_VIOLATION' | 'LINT_ISSUES';
    file: string;
    severity: 'error' | 'warning' | 'info';
    delivered: boolean;
    deliveredAt?: string;
}

export interface CoordinationEvent {
    timestamp: string;
    channel: string;
    operation: 'LPUSH' | 'BLPOP' | 'PUBLISH' | 'SUBSCRIBE';
    agentId?: string;
    coordinatorId?: string;
    messageType: string;
    latency?: number;
}

export interface QueueStatus {
    channel: string;
    length: number;
    oldestMessage?: string;
    newestMessage?: string;
    averageLatency?: number;
}

export interface PatternViolation {
    timestamp: string;
    violationType: 'wrong_pattern' | 'missing_timeout' | 'invalid_channel' | 'missing_dependency';
    channel?: string;
    agentId?: string;
    description: string;
    severity: 'error' | 'warning';
}

export interface RedisMetrics {
    feedbackDeliveryRate: number;      // Percentage
    averageFeedbackLatency: number;    // Milliseconds
    agentActionRate: number;            // Percentage
    activeChannels: number;
    totalMessages: number;
    staleKeys: number;
    patternViolations: number;
}

export class RedisMonitoringService extends EventEmitter {
    private redis: Redis;
    private subscriber: Redis;
    private config: Required<RedisMonitoringConfig>;
    private monitoringInterval?: NodeJS.Timeout;

    // State tracking
    private feedbackHistory: FeedbackMessage[] = [];
    private coordinationHistory: CoordinationEvent[] = [];
    private queueStatuses: Map<string, QueueStatus> = new Map();
    private violations: PatternViolation[] = [];
    private metrics: RedisMetrics;

    // Pattern tracking
    private channelPatterns = {
        agentFeedback: /^agent:([a-z]+-\d+|task_[a-f0-9]+):feedback$/,
        coordinatorFeedback: /^coordinator:([a-z]+-[a-z]+):feedback$/,
        cfnLoop: /^swarm:cfn:(mvp|standard|enterprise):([^:]+):loop(3|2|4):(complete|decision|escalate)$/
    };

    constructor(config: RedisMonitoringConfig = {}) {
        super();

        this.config = {
            redisHost: config.redisHost || process.env.REDIS_HOST || 'localhost',
            redisPort: config.redisPort || parseInt(process.env.REDIS_PORT || '6379'),
            redisDb: config.redisDb || 0,
            monitoringInterval: config.monitoringInterval || 5000,  // 5 seconds
            staleKeyThreshold: config.staleKeyThreshold || 300,     // 5 minutes
            enablePatternValidation: config.enablePatternValidation !== false,
            maxHistorySize: config.maxHistorySize || 1000
        };

        this.redis = new Redis({
            host: this.config.redisHost,
            port: this.config.redisPort,
            db: this.config.redisDb,
            retryStrategy: (times) => {
                if (times > 10) return null;
                return Math.min(times * 100, 3000);
            }
        });

        this.subscriber = new Redis({
            host: this.config.redisHost,
            port: this.config.redisPort,
            db: this.config.redisDb
        });

        this.metrics = this.initializeMetrics();

        this.setupEventHandlers();
    }

    private initializeMetrics(): RedisMetrics {
        return {
            feedbackDeliveryRate: 0,
            averageFeedbackLatency: 0,
            agentActionRate: 0,
            activeChannels: 0,
            totalMessages: 0,
            staleKeys: 0,
            patternViolations: 0
        };
    }

    private setupEventHandlers(): void {
        this.redis.on('connect', () => {
            console.log('✅ Redis monitoring service connected');
            this.emit('connected');
        });

        this.redis.on('error', (error) => {
            console.error('❌ Redis monitoring error:', error.message);
            this.emit('error', error);
        });

        this.subscriber.on('message', (channel, message) => {
            this.handleRedisMessage(channel, message);
        });
    }

    /**
     * Start monitoring Redis channels and queues
     */
    async start(): Promise<void> {
        try {
            // Subscribe to all agent feedback channels (pattern matching)
            await this.subscriber.psubscribe('agent:*:feedback');
            await this.subscriber.psubscribe('coordinator:*:feedback');
            await this.subscriber.psubscribe('swarm:cfn:*');

            console.log('✅ Subscribed to Redis monitoring channels');

            // Start polling for queue status and metrics
            this.monitoringInterval = setInterval(
                () => this.pollRedisMetrics(),
                this.config.monitoringInterval
            );

            // Initial poll
            await this.pollRedisMetrics();

            this.emit('started');
        } catch (error) {
            console.error('❌ Failed to start Redis monitoring:', error);
            throw error;
        }
    }

    /**
     * Stop monitoring
     */
    async stop(): Promise<void> {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        await this.subscriber.punsubscribe();
        await this.redis.disconnect();
        await this.subscriber.disconnect();

        this.emit('stopped');
        console.log('✅ Redis monitoring service stopped');
    }

    /**
     * Handle incoming Redis messages from pub/sub
     */
    private handleRedisMessage(channel: string, message: string): void {
        try {
            const data = JSON.parse(message);

            // Detect message type from channel pattern
            if (channel.includes(':feedback')) {
                this.handleFeedbackMessage(channel, data);
            } else if (channel.includes('swarm:cfn')) {
                this.handleCoordinationEvent(channel, data);
            }

            // Validate channel pattern
            if (this.config.enablePatternValidation) {
                this.validateChannelPattern(channel);
            }

        } catch (error) {
            console.warn('⚠️  Failed to parse Redis message:', error);
        }
    }

    /**
     * Handle hook feedback messages
     */
    private handleFeedbackMessage(channel: string, data: any): void {
        const feedback: FeedbackMessage = {
            timestamp: data.timestamp || new Date().toISOString(),
            source: data.source || 'unknown',
            agentId: data.agentId,
            spawnMode: data.spawnMode || 'unknown',
            type: data.type,
            file: data.file,
            severity: data.severity || 'info',
            delivered: data.delivered || false,
            deliveredAt: data.deliveredAt
        };

        // Use slice to create a new array, preventing memory accumulation
        this.feedbackHistory = [
            feedback,
            ...this.feedbackHistory.slice(0, this.config.maxHistorySize - 1)
        ];

        // Emit WebSocket event
        this.emit('redis_feedback', feedback);

        // Update metrics
        this.metrics.totalMessages++;
        this.updateMetrics();
    }

    /**
     * Handle agent coordination events
     */
    private handleCoordinationEvent(channel: string, data: any): void {
        const event: CoordinationEvent = {
            timestamp: data.timestamp || new Date().toISOString(),
            channel,
            operation: this.detectOperation(channel, data),
            agentId: data.agentId,
            coordinatorId: data.coordinatorId,
            messageType: data.type || data.loop || 'unknown',
            latency: data.latency
        };

        // Use slice to create a new array, preventing memory accumulation
        this.coordinationHistory = [
            event,
            ...this.coordinationHistory.slice(0, this.config.maxHistorySize - 1)
        ];

        // Emit WebSocket event
        this.emit('redis_coordination', event);

        // Update metrics
        this.metrics.totalMessages++;
        this.updateMetrics();
    }

    /**
     * Detect operation type from channel and data
     */
    private detectOperation(channel: string, data: any): 'LPUSH' | 'BLPOP' | 'PUBLISH' | 'SUBSCRIBE' {
        if (channel.includes(':feedback')) {
            return data.spawnMode === 'task' ? 'LPUSH' : 'PUBLISH';
        }
        return 'LPUSH';  // Default for CFN Loop
    }

    /**
     * Validate channel naming pattern
     */
    private validateChannelPattern(channel: string): void {
        const patterns = Object.values(this.channelPatterns);
        const isValid = patterns.some(pattern => pattern.test(channel));

        if (!isValid) {
            const violation: PatternViolation = {
                timestamp: new Date().toISOString(),
                violationType: 'invalid_channel',
                channel,
                description: `Channel "${channel}" does not match expected patterns`,
                severity: 'warning'
            };

            this.violations.unshift(violation);
            if (this.violations.length > this.config.maxHistorySize) {
                this.violations.pop();
            }

            this.emit('redis_pattern_violation', violation);
            this.metrics.patternViolations++;
        }
    }

    /**
     * Poll Redis for queue status and metrics
     */
    private async pollRedisMetrics(): Promise<void> {
        try {
            // Get all keys matching coordination patterns
            const keys = await this.redis.keys('*:feedback');
            const cfnKeys = await this.redis.keys('swarm:cfn:*');

            this.metrics.activeChannels = keys.length + cfnKeys.length;

            // Check queue lengths
            for (const key of [...keys, ...cfnKeys]) {
                const length = await this.redis.llen(key);

                if (length > 0) {
                    const oldest = await this.redis.lindex(key, -1);
                    const newest = await this.redis.lindex(key, 0);

                    const status: QueueStatus = {
                        channel: key,
                        length,
                        oldestMessage: oldest || undefined,
                        newestMessage: newest || undefined
                    };

                    this.queueStatuses.set(key, status);

                    // Emit queue status update
                    this.emit('redis_queue_status', status);
                }
            }

            // Detect stale keys (messages older than threshold)
            await this.detectStaleKeys();

            // Read feedback logs to calculate delivery rate and action rate
            await this.calculateFeedbackMetrics();

            // Emit updated metrics
            this.emit('redis_metrics', this.metrics);

        } catch (error) {
            console.error('❌ Failed to poll Redis metrics:', error);
        }
    }

    /**
     * Detect stale keys (messages waiting too long)
     */
    private async detectStaleKeys(): Promise<void> {
        let staleCount = 0;
        const now = Date.now();
        const threshold = this.config.staleKeyThreshold * 1000;

        for (const [channel, status] of this.queueStatuses) {
            if (status.oldestMessage) {
                try {
                    const data = JSON.parse(status.oldestMessage);
                    const messageTime = new Date(data.timestamp).getTime();

                    if (now - messageTime > threshold) {
                        staleCount++;

                        const violation: PatternViolation = {
                            timestamp: new Date().toISOString(),
                            violationType: 'missing_dependency',
                            channel,
                            description: `Message in ${channel} is stale (older than ${this.config.staleKeyThreshold}s)`,
                            severity: 'warning'
                        };

                        this.emit('redis_pattern_violation', violation);
                    }
                } catch (error) {
                    // Ignore parse errors
                }
            }
        }

        this.metrics.staleKeys = staleCount;
    }

    /**
     * Calculate feedback delivery and action rates from log files
     */
    private async calculateFeedbackMetrics(): Promise<void> {
        try {
            const feedbackDir = path.join(process.cwd(), '.artifacts', 'hooks');

            if (!fs.existsSync(feedbackDir)) {
                return;
            }

            const files = fs.readdirSync(feedbackDir)
                .filter(f => f.startsWith('agent-') && f.endsWith('-feedback.json'));

            let totalFeedback = 0;
            let deliveredFeedback = 0;
            let totalLatency = 0;
            let latencyCount = 0;

            for (const file of files) {
                const filePath = path.join(feedbackDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(content);

                for (const feedback of data.feedback || []) {
                    totalFeedback++;

                    if (feedback.delivered) {
                        deliveredFeedback++;

                        // Calculate latency if both timestamps available
                        if (feedback.timestamp && feedback.deliveredAt) {
                            const sent = new Date(feedback.timestamp).getTime();
                            const delivered = new Date(feedback.deliveredAt).getTime();
                            totalLatency += (delivered - sent);
                            latencyCount++;
                        }
                    }
                }
            }

            // Update metrics
            this.metrics.feedbackDeliveryRate = totalFeedback > 0
                ? (deliveredFeedback / totalFeedback) * 100
                : 0;

            this.metrics.averageFeedbackLatency = latencyCount > 0
                ? totalLatency / latencyCount
                : 0;

            // Agent action rate (same as delivery rate for now)
            this.metrics.agentActionRate = this.metrics.feedbackDeliveryRate;

        } catch (error) {
            console.warn('⚠️  Failed to calculate feedback metrics:', error);
        }
    }

    /**
     * Update calculated metrics
     */
    private updateMetrics(): void {
        // Metrics are updated by polling and event handlers
        // This method can be extended with real-time calculations
    }

    /**
     * Get current metrics snapshot
     */
    getMetrics(): RedisMetrics {
        return { ...this.metrics };
    }

    /**
     * Get recent feedback history
     */
    getFeedbackHistory(limit = 100): FeedbackMessage[] {
        return this.feedbackHistory.slice(0, limit);
    }

    /**
     * Get recent coordination events
     */
    getCoordinationHistory(limit = 100): CoordinationEvent[] {
        return this.coordinationHistory.slice(0, limit);
    }

    /**
     * Get current queue statuses
     */
    getQueueStatuses(): QueueStatus[] {
        return Array.from(this.queueStatuses.values());
    }

    /**
     * Get pattern violations
     */
    getViolations(limit = 100): PatternViolation[] {
        return this.violations.slice(0, limit);
    }
}

// Export singleton instance
let monitoringService: RedisMonitoringService | null = null;

export function getRedisMonitoringService(config?: RedisMonitoringConfig): RedisMonitoringService {
    if (!monitoringService) {
        monitoringService = new RedisMonitoringService(config);
    }
    return monitoringService;
}

export function stopRedisMonitoring(): Promise<void> {
    if (monitoringService) {
        return monitoringService.stop();
    }
    return Promise.resolve();
}
