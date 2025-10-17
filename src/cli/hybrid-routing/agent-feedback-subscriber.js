#!/usr/bin/env node

/**
 * Agent Feedback Subscriber (Phase 4.5 Integration)
 *
 * Subscribes CLI-spawned agents to hook feedback via Redis
 * - Listens to agent:{agentId}:feedback channel
 * - Writes pending feedback to .artifacts/agents/{agentId}/pending-feedback.json
 * - Agents check for feedback on next iteration
 */

import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

export class AgentFeedbackSubscriber {
    constructor(agentId, options = {}) {
        this.agentId = agentId;
        this.channel = `agent:${agentId}:feedback`;

        this.redis = new Redis({
            host: options.redisHost || process.env.REDIS_HOST || 'localhost',
            port: options.redisPort || process.env.REDIS_PORT || 6379,
            db: 0,
            retryStrategy: (times) => {
                if (times > 3) return null;
                return Math.min(times * 50, 200);
            }
        });

        this.feedbackDir = path.join(
            process.cwd(),
            '.artifacts',
            'agents',
            agentId
        );

        this.pendingFeedbackFile = path.join(this.feedbackDir, 'pending-feedback.json');
        this.isSubscribed = false;
    }

    /**
     * Subscribe to feedback channel
     */
    async subscribe() {
        try {
            await this.redis.subscribe(this.channel);
            this.isSubscribed = true;
            console.log(`✅ Agent ${this.agentId} subscribed to ${this.channel}`);

            this.redis.on('message', async (channel, message) => {
                if (channel === this.channel) {
                    await this.handleFeedback(message);
                }
            });

            this.redis.on('error', (error) => {
                console.warn(`⚠️  Redis subscription error for ${this.agentId}: ${error.message}`);
            });

        } catch (error) {
            console.warn(`⚠️  Failed to subscribe ${this.agentId} to feedback: ${error.message}`);
        }
    }

    /**
     * Handle incoming feedback message
     */
    async handleFeedback(message) {
        try {
            const feedback = JSON.parse(message);

            console.log(`\n📬 HOOK FEEDBACK for ${this.agentId}:`);
            console.log(JSON.stringify(feedback, null, 2));

            // Write to pending feedback file
            await this.writePendingFeedback(feedback);

        } catch (error) {
            console.warn(`⚠️  Failed to handle feedback: ${error.message}`);
        }
    }

    /**
     * Write feedback to pending file for agent to read
     */
    async writePendingFeedback(feedback) {
        try {
            // Ensure directory exists
            if (!fs.existsSync(this.feedbackDir)) {
                fs.mkdirSync(this.feedbackDir, { recursive: true });
            }

            // Read existing feedback
            let pending = { agentId: this.agentId, feedback: [] };
            if (fs.existsSync(this.pendingFeedbackFile)) {
                pending = JSON.parse(fs.readFileSync(this.pendingFeedbackFile, 'utf8'));
            }

            // Add new feedback
            pending.feedback.push({
                ...feedback,
                receivedAt: new Date().toISOString(),
                processed: false
            });

            // Write back
            fs.writeFileSync(this.pendingFeedbackFile, JSON.stringify(pending, null, 2));
            console.log(`✅ Feedback written to ${this.pendingFeedbackFile}`);

        } catch (error) {
            console.warn(`⚠️  Failed to write pending feedback: ${error.message}`);
        }
    }

    /**
     * Unsubscribe and cleanup
     */
    async unsubscribe() {
        if (this.isSubscribed) {
            await this.redis.unsubscribe(this.channel);
            await this.redis.disconnect();
            this.isSubscribed = false;
            console.log(`✅ Agent ${this.agentId} unsubscribed from ${this.channel}`);
        }
    }

    /**
     * Check for pending feedback (for agents to call)
     */
    static getPendingFeedback(agentId) {
        const feedbackFile = path.join(
            process.cwd(),
            '.artifacts',
            'agents',
            agentId,
            'pending-feedback.json'
        );

        if (!fs.existsSync(feedbackFile)) {
            return [];
        }

        try {
            const pending = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
            return pending.feedback.filter(f => !f.processed);
        } catch (error) {
            console.warn(`⚠️  Failed to read pending feedback: ${error.message}`);
            return [];
        }
    }

    /**
     * Mark feedback as processed
     */
    static markFeedbackProcessed(agentId, feedbackTimestamp) {
        const feedbackFile = path.join(
            process.cwd(),
            '.artifacts',
            'agents',
            agentId,
            'pending-feedback.json'
        );

        if (!fs.existsSync(feedbackFile)) {
            return;
        }

        try {
            const pending = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));

            const feedback = pending.feedback.find(f => f.timestamp === feedbackTimestamp);
            if (feedback) {
                feedback.processed = true;
                feedback.processedAt = new Date().toISOString();
                fs.writeFileSync(feedbackFile, JSON.stringify(pending, null, 2));
                console.log(`✅ Feedback ${feedbackTimestamp} marked as processed`);
            }

        } catch (error) {
            console.warn(`⚠️  Failed to mark feedback as processed: ${error.message}`);
        }
    }
}

// Export for use in spawn-workers.js
export async function subscribeAgentToFeedback(agentId, options = {}) {
    const subscriber = new AgentFeedbackSubscriber(agentId, options);
    await subscriber.subscribe();
    return subscriber;
}

// Standalone CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const agentId = process.argv[2];

    if (!agentId) {
        console.error('Usage: node agent-feedback-subscriber.js <agentId>');
        process.exit(1);
    }

    const subscriber = new AgentFeedbackSubscriber(agentId);
    await subscriber.subscribe();

    // Keep process alive
    process.on('SIGINT', async () => {
        await subscriber.unsubscribe();
        process.exit(0);
    });
}
