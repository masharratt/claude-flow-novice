/**
 * Rollback Communication and Notification System
 * Handles user notifications and system alerts during rollback operations
 */

const EventEmitter = require('events');

class NotificationService extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            // Notification channels
            enableEmailNotifications: config.enableEmailNotifications !== false,
            enableSlackNotifications: config.enableSlackNotifications || false,
            enablePushNotifications: config.enablePushNotifications !== false,
            enableInAppNotifications: config.enableInAppNotifications !== false,

            // Timing requirements
            emergencyNotificationTimeoutMs: config.emergencyNotificationTimeoutMs || 10000, // 10 seconds
            standardNotificationTimeoutMs: config.standardNotificationTimeoutMs || 30000, // 30 seconds

            // Escalation settings
            enableEscalation: config.enableEscalation !== false,
            escalationDelayMs: config.escalationDelayMs || 300000, // 5 minutes

            ...config
        };

        this.notificationQueue = [];
        this.notificationHistory = [];
        this.activeNotifications = new Map();
        this.subscribedUsers = new Set();
        this.isOperational = true;

        this.notificationTemplates = this.setupNotificationTemplates();
        this.communicationChannels = this.initializeCommunicationChannels();
    }

    /**
     * Broadcast rollback initiation to all users
     */
    async broadcastRollbackStart(rollbackData) {
        console.log(`[NotificationService] Broadcasting rollback start: ${rollbackData.rollbackId}`);

        const notification = {
            id: `rollback_start_${Date.now()}`,
            type: 'rollback_start',
            severity: 'high',
            title: 'System Maintenance - Feature Temporarily Disabled',
            message: this.formatRollbackStartMessage(rollbackData),
            data: rollbackData,
            timestamp: new Date(),
            urgent: true,
            broadcastToAll: true
        };

        return await this.sendNotification(notification);
    }

    /**
     * Broadcast rollback completion
     */
    async broadcastRollbackComplete(rollbackData) {
        console.log(`[NotificationService] Broadcasting rollback completion: ${rollbackData.rollbackId}`);

        const notification = {
            id: `rollback_complete_${Date.now()}`,
            type: 'rollback_complete',
            severity: 'medium',
            title: 'System Maintenance Complete',
            message: this.formatRollbackCompleteMessage(rollbackData),
            data: rollbackData,
            timestamp: new Date(),
            urgent: false,
            broadcastToAll: true
        };

        return await this.sendNotification(notification);
    }

    /**
     * Broadcast emergency situation
     */
    async broadcastEmergency(emergencyData) {
        console.log(`[NotificationService] Broadcasting emergency: ${emergencyData.rollbackId}`);

        const notification = {
            id: `emergency_${Date.now()}`,
            type: 'emergency',
            severity: 'critical',
            title: 'URGENT: System Issue Detected',
            message: this.formatEmergencyMessage(emergencyData),
            data: emergencyData,
            timestamp: new Date(),
            urgent: true,
            broadcastToAll: true,
            requiresAcknowledgment: true
        };

        return await this.sendNotification(notification);
    }

    /**
     * Trigger system alert for operations team
     */
    async triggerSystemAlert(alertData) {
        console.log(`[NotificationService] Triggering system alert: ${alertData.severity}`);

        const alert = {
            id: `alert_${Date.now()}`,
            type: 'system_alert',
            severity: alertData.severity,
            title: `System Alert: ${alertData.severity.toUpperCase()}`,
            message: alertData.message,
            data: alertData,
            timestamp: new Date(),
            urgent: alertData.severity === 'critical',
            targetAudience: 'operations_team',
            requiresAcknowledgment: true,
            escalationEnabled: alertData.severity === 'critical'
        };

        return await this.sendNotification(alert);
    }

    /**
     * Send notification through appropriate channels
     */
    async sendNotification(notification) {
        try {
            // Add to queue and history
            this.notificationQueue.push(notification);
            this.notificationHistory.push(notification);
            this.activeNotifications.set(notification.id, notification);

            console.log(`[NotificationService] Processing notification: ${notification.id} (${notification.type})`);

            // Determine target audience
            const targets = this.determineNotificationTargets(notification);

            // Send through all appropriate channels
            const channelPromises = [];

            if (this.config.enableInAppNotifications) {
                channelPromises.push(this.sendInAppNotification(notification, targets));
            }

            if (this.config.enableEmailNotifications) {
                channelPromises.push(this.sendEmailNotification(notification, targets));
            }

            if (this.config.enableSlackNotifications && notification.severity === 'critical') {
                channelPromises.push(this.sendSlackNotification(notification, targets));
            }

            if (this.config.enablePushNotifications && notification.urgent) {
                channelPromises.push(this.sendPushNotification(notification, targets));
            }

            // Wait for all channels to complete (with timeout)
            const timeout = notification.urgent ?
                this.config.emergencyNotificationTimeoutMs :
                this.config.standardNotificationTimeoutMs;

            const results = await Promise.allSettled(
                channelPromises.map(promise =>
                    this.withTimeout(promise, timeout)
                )
            );

            // Process results
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            if (failed > 0) {
                console.warn(`[NotificationService] ${failed} notification channels failed for ${notification.id}`);
            }

            // Setup escalation if needed
            if (notification.escalationEnabled && this.config.enableEscalation) {
                this.setupEscalation(notification);
            }

            // Emit notification sent event
            this.emit('notification_sent', {
                notification,
                successful,
                failed,
                timestamp: new Date()
            });

            console.log(`[NotificationService] Notification sent: ${notification.id} (${successful} successful, ${failed} failed)`);

            return {
                success: successful > 0,
                notificationId: notification.id,
                channelsSuccessful: successful,
                channelsFailed: failed
            };

        } catch (error) {
            console.error(`[NotificationService] Error sending notification: ${error.message}`);

            this.emit('notification_failed', {
                notification,
                error,
                timestamp: new Date()
            });

            throw error;
        }
    }

    /**
     * Send in-app notification
     */
    async sendInAppNotification(notification, targets) {
        console.log(`[NotificationService] Sending in-app notification to ${targets.length} users`);

        // In production, this would integrate with the application's notification system
        // For now, we simulate the process

        await this.simulateDelay(100, 500);

        const inAppNotification = {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            severity: notification.severity,
            timestamp: notification.timestamp,
            dismissible: !notification.requiresAcknowledgment,
            actions: this.generateNotificationActions(notification)
        };

        // Would send to each target user's notification feed
        console.log(`[NotificationService] In-app notification sent: ${notification.id}`);

        return { channel: 'in-app', status: 'sent', targets: targets.length };
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(notification, targets) {
        console.log(`[NotificationService] Sending email notification to ${targets.length} recipients`);

        await this.simulateDelay(200, 1000);

        const emailContent = {
            subject: notification.title,
            body: this.generateEmailBody(notification),
            priority: notification.urgent ? 'high' : 'normal',
            recipients: targets.map(t => t.email).filter(email => email)
        };

        // Would integrate with email service (SendGrid, SES, etc.)
        console.log(`[NotificationService] Email notification sent: ${notification.id}`);

        return { channel: 'email', status: 'sent', targets: emailContent.recipients.length };
    }

    /**
     * Send Slack notification
     */
    async sendSlackNotification(notification, targets) {
        console.log(`[NotificationService] Sending Slack notification`);

        await this.simulateDelay(300, 800);

        const slackMessage = {
            text: notification.title,
            attachments: [{
                color: this.getSeverityColor(notification.severity),
                title: notification.title,
                text: notification.message,
                timestamp: Math.floor(notification.timestamp.getTime() / 1000),
                fields: [
                    {
                        title: 'Severity',
                        value: notification.severity.toUpperCase(),
                        short: true
                    },
                    {
                        title: 'Type',
                        value: notification.type,
                        short: true
                    }
                ]
            }]
        };

        // Would send to Slack channels/users via webhook or API
        console.log(`[NotificationService] Slack notification sent: ${notification.id}`);

        return { channel: 'slack', status: 'sent', targets: 1 };
    }

    /**
     * Send push notification
     */
    async sendPushNotification(notification, targets) {
        console.log(`[NotificationService] Sending push notification to ${targets.length} devices`);

        await this.simulateDelay(100, 400);

        const pushPayload = {
            title: notification.title,
            body: notification.message,
            data: {
                notificationId: notification.id,
                type: notification.type,
                severity: notification.severity
            },
            badge: 1,
            sound: notification.urgent ? 'urgent.mp3' : 'default.mp3'
        };

        // Would send via push notification service (FCM, APNs, etc.)
        console.log(`[NotificationService] Push notification sent: ${notification.id}`);

        return { channel: 'push', status: 'sent', targets: targets.length };
    }

    /**
     * Determine notification targets based on type and audience
     */
    determineNotificationTargets(notification) {
        const targets = [];

        if (notification.broadcastToAll) {
            // Get all subscribed users
            for (const userId of this.subscribedUsers) {
                targets.push(this.getUserProfile(userId));
            }
        } else if (notification.targetAudience) {
            // Get users in specific audience
            targets.push(...this.getUsersByAudience(notification.targetAudience));
        }

        return targets.filter(target => target); // Remove null/undefined
    }

    /**
     * Setup escalation for critical notifications
     */
    setupEscalation(notification) {
        const escalationTimer = setTimeout(async () => {
            console.log(`[NotificationService] Escalating notification: ${notification.id}`);

            const escalatedNotification = {
                ...notification,
                id: `${notification.id}_escalated`,
                title: `ESCALATED: ${notification.title}`,
                severity: 'critical',
                targetAudience: 'senior_operations',
                escalated: true
            };

            await this.sendNotification(escalatedNotification);

        }, this.config.escalationDelayMs);

        // Store escalation timer for potential cancellation
        this.activeNotifications.get(notification.id).escalationTimer = escalationTimer;
    }

    /**
     * Cancel notification escalation
     */
    cancelEscalation(notificationId) {
        const notification = this.activeNotifications.get(notificationId);
        if (notification && notification.escalationTimer) {
            clearTimeout(notification.escalationTimer);
            delete notification.escalationTimer;
            console.log(`[NotificationService] Cancelled escalation for: ${notificationId}`);
        }
    }

    /**
     * Format rollback start message
     */
    formatRollbackStartMessage(rollbackData) {
        return `We're temporarily disabling some features to address a system issue. This should take approximately ${rollbackData.expectedDuration}. We apologize for any inconvenience.`;
    }

    /**
     * Format rollback complete message
     */
    formatRollbackCompleteMessage(rollbackData) {
        const duration = rollbackData.duration ?
            `${Math.round(rollbackData.duration / 1000 / 60)} minutes` :
            'a few minutes';

        return `System maintenance is complete. All features are now restored. The maintenance took ${duration}. Thank you for your patience.`;
    }

    /**
     * Format emergency message
     */
    formatEmergencyMessage(emergencyData) {
        return `We've detected a critical system issue and have disabled some features as a precaution. Our team is working to resolve this immediately. Error: ${emergencyData.error}`;
    }

    /**
     * Generate email body
     */
    generateEmailBody(notification) {
        return `
${notification.message}

Details:
- Time: ${notification.timestamp.toISOString()}
- Severity: ${notification.severity.toUpperCase()}
- Type: ${notification.type}

If you have any questions, please contact our support team.

Thank you for your patience.
        `.trim();
    }

    /**
     * Generate notification actions
     */
    generateNotificationActions(notification) {
        const actions = [];

        if (notification.type === 'rollback_start') {
            actions.push({
                text: 'View Status',
                action: 'view_rollback_status',
                data: { rollbackId: notification.data.rollbackId }
            });
        }

        if (notification.requiresAcknowledgment) {
            actions.push({
                text: 'Acknowledge',
                action: 'acknowledge',
                data: { notificationId: notification.id }
            });
        }

        return actions;
    }

    /**
     * Get severity color for Slack attachments
     */
    getSeverityColor(severity) {
        const colors = {
            critical: '#ff0000',
            high: '#ff9900',
            medium: '#ffcc00',
            low: '#00cc00'
        };
        return colors[severity] || '#cccccc';
    }

    /**
     * Get user profile (mock)
     */
    getUserProfile(userId) {
        // In production, this would fetch from user service
        return {
            id: userId,
            email: `user${userId}@example.com`,
            preferences: {}
        };
    }

    /**
     * Get users by audience (mock)
     */
    getUsersByAudience(audience) {
        // In production, this would fetch from user service
        const audiences = {
            operations_team: [
                { id: 'ops1', email: 'ops1@company.com' },
                { id: 'ops2', email: 'ops2@company.com' }
            ],
            senior_operations: [
                { id: 'senior1', email: 'senior1@company.com' }
            ]
        };

        return audiences[audience] || [];
    }

    /**
     * Simulate network delay
     */
    async simulateDelay(minMs, maxMs) {
        const delay = Math.random() * (maxMs - minMs) + minMs;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Add timeout to promise
     */
    withTimeout(promise, timeoutMs) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Notification timeout')), timeoutMs)
            )
        ]);
    }

    /**
     * Subscribe user to notifications
     */
    subscribeUser(userId) {
        this.subscribedUsers.add(userId);
        console.log(`[NotificationService] User subscribed: ${userId}`);
    }

    /**
     * Unsubscribe user from notifications
     */
    unsubscribeUser(userId) {
        this.subscribedUsers.delete(userId);
        console.log(`[NotificationService] User unsubscribed: ${userId}`);
    }

    /**
     * Acknowledge notification
     */
    acknowledgeNotification(notificationId, userId) {
        const notification = this.activeNotifications.get(notificationId);
        if (notification) {
            if (!notification.acknowledgedBy) {
                notification.acknowledgedBy = [];
            }
            notification.acknowledgedBy.push({
                userId,
                timestamp: new Date()
            });

            console.log(`[NotificationService] Notification acknowledged: ${notificationId} by ${userId}`);

            // Cancel escalation if fully acknowledged
            if (notification.escalationEnabled && notification.acknowledgedBy.length >= 2) {
                this.cancelEscalation(notificationId);
            }
        }
    }

    /**
     * Setup notification templates
     */
    setupNotificationTemplates() {
        return {
            rollback_start: {
                title: 'System Maintenance - Feature Temporarily Disabled',
                urgency: 'high'
            },
            rollback_complete: {
                title: 'System Maintenance Complete',
                urgency: 'medium'
            },
            emergency: {
                title: 'URGENT: System Issue Detected',
                urgency: 'critical'
            },
            system_alert: {
                title: 'System Alert',
                urgency: 'high'
            }
        };
    }

    /**
     * Initialize communication channels
     */
    initializeCommunicationChannels() {
        return {
            inApp: { enabled: this.config.enableInAppNotifications, status: 'operational' },
            email: { enabled: this.config.enableEmailNotifications, status: 'operational' },
            slack: { enabled: this.config.enableSlackNotifications, status: 'operational' },
            push: { enabled: this.config.enablePushNotifications, status: 'operational' }
        };
    }

    /**
     * Check if service is operational
     */
    isOperational() {
        return this.isOperational;
    }

    /**
     * Get notification service status
     */
    getServiceStatus() {
        return {
            operational: this.isOperational,
            activeNotifications: this.activeNotifications.size,
            notificationQueue: this.notificationQueue.length,
            subscribedUsers: this.subscribedUsers.size,
            channels: this.communicationChannels,
            recentNotifications: this.notificationHistory.slice(-10)
        };
    }

    /**
     * Clear old notifications from history
     */
    cleanupNotificationHistory(maxAge = 86400000) { // 24 hours
        const cutoff = Date.now() - maxAge;
        this.notificationHistory = this.notificationHistory.filter(
            notification => notification.timestamp.getTime() > cutoff
        );
    }
}

module.exports = { NotificationService };