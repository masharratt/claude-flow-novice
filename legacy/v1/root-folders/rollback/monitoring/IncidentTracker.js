/**
 * Incident Documentation and Tracking System
 * Tracks rollback incidents, generates reports, and manages escalation
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class IncidentTracker extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            incidentsPath: config.incidentsPath || './data/incidents',
            reportsPath: config.reportsPath || './data/reports',
            maxIncidentAge: config.maxIncidentAge || 7776000000, // 90 days
            autoReportGeneration: config.autoReportGeneration !== false,
            severityLevels: config.severityLevels || ['low', 'medium', 'high', 'critical'],
            ...config
        };

        this.activeIncidents = new Map();
        this.incidentHistory = [];
        this.isOperational = true;

        // Incident classification
        this.incidentTypes = {
            automated_rollback: {
                name: 'Automated Rollback',
                defaultSeverity: 'high',
                sla: 300000, // 5 minutes
                requiresPostMortem: true
            },
            manual_rollback: {
                name: 'Manual Rollback',
                defaultSeverity: 'critical',
                sla: 900000, // 15 minutes
                requiresPostMortem: true
            },
            rollback_failure: {
                name: 'Rollback Failure',
                defaultSeverity: 'critical',
                sla: 300000, // 5 minutes
                requiresPostMortem: true,
                escalateImmediately: true
            },
            trigger_detection: {
                name: 'Trigger Detection',
                defaultSeverity: 'medium',
                sla: 600000, // 10 minutes
                requiresPostMortem: false
            }
        };

        this.initializeTracker();
    }

    /**
     * Initialize incident tracking system
     */
    async initializeTracker() {
        try {
            await fs.mkdir(this.config.incidentsPath, { recursive: true });
            await fs.mkdir(this.config.reportsPath, { recursive: true });
            await this.loadActiveIncidents();
            console.log('[IncidentTracker] Incident tracking system initialized');
        } catch (error) {
            console.error(`[IncidentTracker] Initialization failed: ${error.message}`);
            this.isOperational = false;
        }
    }

    /**
     * Create a new incident
     */
    async createIncident(incidentData) {
        try {
            const incident = {
                id: this.generateIncidentId(),
                type: incidentData.type,
                severity: incidentData.severity || this.getDefaultSeverity(incidentData.type),
                title: incidentData.title || this.generateIncidentTitle(incidentData),
                description: incidentData.description || '',

                // Timestamps
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,

                // Status and assignment
                status: 'open',
                assignedTo: incidentData.assignedTo || null,
                priority: this.calculatePriority(incidentData.type, incidentData.severity),

                // Context and data
                context: incidentData.context || {},
                rollbackId: incidentData.rollbackId || null,
                triggerId: incidentData.triggerId || null,

                // Metrics and tracking
                responseTime: null,
                resolutionTime: null,
                slaTarget: this.getSLATarget(incidentData.type),
                slaBreached: false,

                // Documentation
                timeline: [{
                    timestamp: new Date(),
                    action: 'created',
                    details: 'Incident created',
                    user: incidentData.createdBy || 'system'
                }],

                // Resolution tracking
                rootCause: null,
                resolution: null,
                preventiveMeasures: [],

                // Post-mortem requirements
                requiresPostMortem: this.requiresPostMortem(incidentData.type),
                postMortemCompleted: false,

                // Escalation
                escalated: false,
                escalatedAt: null,
                escalatedTo: null,

                // Additional metadata
                tags: incidentData.tags || [],
                affectedComponents: incidentData.affectedComponents || [],
                impactLevel: this.calculateImpactLevel(incidentData),
                customerFacing: incidentData.customerFacing !== false
            };

            // Store incident
            await this.storeIncident(incident);

            // Add to active incidents
            this.activeIncidents.set(incident.id, incident);

            // Add to history
            this.incidentHistory.push(incident);

            // Setup SLA monitoring
            this.setupSLAMonitoring(incident);

            // Auto-escalate if required
            if (this.shouldAutoEscalate(incident)) {
                await this.escalateIncident(incident.id, 'Auto-escalated due to incident type');
            }

            console.log(`[IncidentTracker] Created incident: ${incident.id} (${incident.type}, ${incident.severity})`);

            // Emit incident created event
            this.emit('incident_created', incident);

            return incident;

        } catch (error) {
            console.error(`[IncidentTracker] Error creating incident: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update an existing incident
     */
    async updateIncident(incidentId, updates) {
        try {
            const incident = this.activeIncidents.get(incidentId);
            if (!incident) {
                throw new Error(`Incident ${incidentId} not found`);
            }

            // Update incident data
            Object.assign(incident, updates);
            incident.updatedAt = new Date();

            // Add timeline entry
            incident.timeline.push({
                timestamp: new Date(),
                action: 'updated',
                details: this.generateUpdateSummary(updates),
                user: updates.updatedBy || 'system'
            });

            // Handle status changes
            if (updates.status) {
                await this.handleStatusChange(incident, updates.status);
            }

            // Update stored incident
            await this.storeIncident(incident);

            console.log(`[IncidentTracker] Updated incident: ${incidentId}`);

            // Emit incident updated event
            this.emit('incident_updated', { incident, updates });

            return incident;

        } catch (error) {
            console.error(`[IncidentTracker] Error updating incident ${incidentId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Resolve an incident
     */
    async resolveIncident(incidentId, resolution) {
        try {
            const incident = this.activeIncidents.get(incidentId);
            if (!incident) {
                throw new Error(`Incident ${incidentId} not found`);
            }

            if (incident.status === 'resolved') {
                console.log(`[IncidentTracker] Incident ${incidentId} already resolved`);
                return incident;
            }

            // Calculate resolution time
            const resolutionTime = Date.now() - incident.createdAt.getTime();
            const slaBreached = resolutionTime > incident.slaTarget;

            // Update incident
            incident.status = 'resolved';
            incident.resolvedAt = new Date();
            incident.resolution = resolution;
            incident.resolutionTime = resolutionTime;
            incident.slaBreached = slaBreached;
            incident.updatedAt = new Date();

            // Add timeline entry
            incident.timeline.push({
                timestamp: new Date(),
                action: 'resolved',
                details: `Incident resolved: ${resolution.summary || 'Resolution provided'}`,
                user: resolution.resolvedBy || 'system'
            });

            // Clear SLA monitoring
            this.clearSLAMonitoring(incidentId);

            // Store updated incident
            await this.storeIncident(incident);

            // Remove from active incidents
            this.activeIncidents.delete(incidentId);

            // Generate post-incident report
            if (incident.requiresPostMortem) {
                await this.generatePostIncidentReport(incident);
            }

            console.log(`[IncidentTracker] Resolved incident: ${incidentId} (${Math.round(resolutionTime / 1000)}s, SLA ${slaBreached ? 'BREACHED' : 'MET'})`);

            // Emit incident resolved event
            this.emit('incident_resolved', incident);

            return incident;

        } catch (error) {
            console.error(`[IncidentTracker] Error resolving incident ${incidentId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Escalate an incident
     */
    async escalateIncident(incidentId, reason, escalateTo = 'senior_operations') {
        try {
            const incident = this.activeIncidents.get(incidentId);
            if (!incident) {
                throw new Error(`Incident ${incidentId} not found`);
            }

            if (incident.escalated) {
                console.log(`[IncidentTracker] Incident ${incidentId} already escalated`);
                return incident;
            }

            // Update incident
            incident.escalated = true;
            incident.escalatedAt = new Date();
            incident.escalatedTo = escalateTo;
            incident.severity = this.escalateSeverity(incident.severity);
            incident.updatedAt = new Date();

            // Add timeline entry
            incident.timeline.push({
                timestamp: new Date(),
                action: 'escalated',
                details: `Escalated to ${escalateTo}: ${reason}`,
                user: 'system'
            });

            // Store updated incident
            await this.storeIncident(incident);

            console.log(`[IncidentTracker] Escalated incident: ${incidentId} to ${escalateTo}`);

            // Emit escalation event
            this.emit('incident_escalated', { incident, reason, escalateTo });

            return incident;

        } catch (error) {
            console.error(`[IncidentTracker] Error escalating incident ${incidentId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate post-incident report
     */
    async generatePostIncidentReport(incident) {
        try {
            const report = {
                incidentId: incident.id,
                title: `Post-Incident Report: ${incident.title}`,
                generatedAt: new Date(),

                // Incident summary
                summary: {
                    type: incident.type,
                    severity: incident.severity,
                    duration: incident.resolutionTime,
                    slaBreached: incident.slaBreached,
                    customerImpact: incident.customerFacing,
                    affectedComponents: incident.affectedComponents
                },

                // Timeline analysis
                timeline: incident.timeline,

                // Impact assessment
                impact: {
                    usersFaced: this.calculateUserImpact(incident),
                    systemDowntime: this.calculateDowntime(incident),
                    dataLoss: false, // Would be determined from incident details
                    revenueImpact: this.estimateRevenueImpact(incident)
                },

                // Root cause analysis
                rootCause: incident.rootCause || {
                    category: 'To be determined',
                    description: 'Root cause analysis pending',
                    contributingFactors: []
                },

                // Resolution analysis
                resolution: {
                    method: incident.resolution?.method || 'rollback',
                    effectiveness: incident.resolution?.effectiveness || 'successful',
                    timeToResolve: incident.resolutionTime,
                    resourcesUsed: incident.resolution?.resourcesUsed || []
                },

                // Lessons learned
                lessonsLearned: incident.resolution?.lessonsLearned || [],

                // Action items
                actionItems: this.generateActionItems(incident),

                // Preventive measures
                preventiveMeasures: incident.preventiveMeasures || [],

                // Recommendations
                recommendations: this.generateRecommendations(incident)
            };

            // Store report
            const reportPath = path.join(
                this.config.reportsPath,
                `post-incident-${incident.id}-${Date.now()}.json`
            );

            await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

            console.log(`[IncidentTracker] Generated post-incident report: ${reportPath}`);

            // Mark post-mortem as completed
            incident.postMortemCompleted = true;
            await this.storeIncident(incident);

            return report;

        } catch (error) {
            console.error(`[IncidentTracker] Error generating post-incident report for ${incident.id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate incident statistics and trends
     */
    async generateIncidentStatistics(timeframe = 'week') {
        try {
            const cutoffTime = this.getTimeframeCutoff(timeframe);
            const recentIncidents = this.incidentHistory.filter(
                incident => incident.createdAt.getTime() > cutoffTime
            );

            const statistics = {
                timeframe,
                period: {
                    start: new Date(cutoffTime),
                    end: new Date()
                },

                // Overall metrics
                totalIncidents: recentIncidents.length,
                resolvedIncidents: recentIncidents.filter(i => i.status === 'resolved').length,
                openIncidents: recentIncidents.filter(i => i.status !== 'resolved').length,
                escalatedIncidents: recentIncidents.filter(i => i.escalated).length,

                // Severity breakdown
                severityBreakdown: this.calculateSeverityBreakdown(recentIncidents),

                // Type breakdown
                typeBreakdown: this.calculateTypeBreakdown(recentIncidents),

                // SLA metrics
                slaMetrics: this.calculateSLAMetrics(recentIncidents),

                // Resolution times
                resolutionTimes: this.calculateResolutionTimes(recentIncidents),

                // Trends
                trends: this.calculateTrends(recentIncidents, timeframe),

                // Top issues
                topRootCauses: this.getTopRootCauses(recentIncidents),
                topAffectedComponents: this.getTopAffectedComponents(recentIncidents),

                // Performance metrics
                averageResolutionTime: this.calculateAverageResolutionTime(recentIncidents),
                medianResolutionTime: this.calculateMedianResolutionTime(recentIncidents),

                // Rollback specific metrics
                rollbackMetrics: this.calculateRollbackMetrics(recentIncidents)
            };

            // Store statistics
            const statsPath = path.join(
                this.config.reportsPath,
                `incident-statistics-${timeframe}-${Date.now()}.json`
            );

            await fs.writeFile(statsPath, JSON.stringify(statistics, null, 2), 'utf8');

            console.log(`[IncidentTracker] Generated incident statistics for ${timeframe}: ${statsPath}`);

            return statistics;

        } catch (error) {
            console.error(`[IncidentTracker] Error generating incident statistics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get active incidents
     */
    getActiveIncidents(filters = {}) {
        let incidents = Array.from(this.activeIncidents.values());

        // Apply filters
        if (filters.severity) {
            incidents = incidents.filter(i => i.severity === filters.severity);
        }

        if (filters.type) {
            incidents = incidents.filter(i => i.type === filters.type);
        }

        if (filters.assignedTo) {
            incidents = incidents.filter(i => i.assignedTo === filters.assignedTo);
        }

        // Sort by priority and created date
        incidents.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority; // Higher priority first
            }
            return a.createdAt.getTime() - b.createdAt.getTime(); // Older first
        });

        return incidents;
    }

    /**
     * Helper methods
     */

    generateIncidentId() {
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 8);
        return `INC-${timestamp}-${random}`;
    }

    generateIncidentTitle(incidentData) {
        const typeMap = {
            automated_rollback: 'Automated Rollback Triggered',
            manual_rollback: 'Manual Rollback Executed',
            rollback_failure: 'Rollback Operation Failed',
            trigger_detection: 'Rollback Trigger Detected'
        };

        return typeMap[incidentData.type] || 'System Incident';
    }

    getDefaultSeverity(type) {
        return this.incidentTypes[type]?.defaultSeverity || 'medium';
    }

    calculatePriority(type, severity) {
        const severityScores = { low: 1, medium: 2, high: 3, critical: 4 };
        const typeMultipliers = {
            rollback_failure: 2,
            manual_rollback: 1.5,
            automated_rollback: 1.2,
            trigger_detection: 1
        };

        return (severityScores[severity] || 2) * (typeMultipliers[type] || 1);
    }

    getSLATarget(type) {
        return this.incidentTypes[type]?.sla || 1800000; // 30 minutes default
    }

    requiresPostMortem(type) {
        return this.incidentTypes[type]?.requiresPostMortem || false;
    }

    shouldAutoEscalate(incident) {
        return this.incidentTypes[incident.type]?.escalateImmediately || false;
    }

    calculateImpactLevel(incidentData) {
        // Simple impact calculation - would be more sophisticated in production
        if (incidentData.severity === 'critical') return 'high';
        if (incidentData.severity === 'high') return 'medium';
        return 'low';
    }

    escalateSeverity(currentSeverity) {
        const escalationMap = {
            low: 'medium',
            medium: 'high',
            high: 'critical',
            critical: 'critical'
        };
        return escalationMap[currentSeverity] || 'high';
    }

    generateUpdateSummary(updates) {
        const keys = Object.keys(updates).filter(k => k !== 'updatedBy');
        return `Updated: ${keys.join(', ')}`;
    }

    async handleStatusChange(incident, newStatus) {
        if (newStatus === 'in_progress' && !incident.responseTime) {
            incident.responseTime = Date.now() - incident.createdAt.getTime();
        }
    }

    setupSLAMonitoring(incident) {
        const slaTimer = setTimeout(() => {
            if (incident.status !== 'resolved') {
                this.handleSLABreach(incident);
            }
        }, incident.slaTarget);

        incident.slaTimer = slaTimer;
    }

    clearSLAMonitoring(incidentId) {
        const incident = this.activeIncidents.get(incidentId);
        if (incident && incident.slaTimer) {
            clearTimeout(incident.slaTimer);
            delete incident.slaTimer;
        }
    }

    async handleSLABreach(incident) {
        console.warn(`[IncidentTracker] SLA breach detected for incident: ${incident.id}`);

        incident.slaBreached = true;
        await this.escalateIncident(incident.id, 'SLA breach - automatic escalation');
    }

    // Statistics calculation methods
    calculateSeverityBreakdown(incidents) {
        const breakdown = { low: 0, medium: 0, high: 0, critical: 0 };
        incidents.forEach(incident => {
            breakdown[incident.severity] = (breakdown[incident.severity] || 0) + 1;
        });
        return breakdown;
    }

    calculateTypeBreakdown(incidents) {
        const breakdown = {};
        incidents.forEach(incident => {
            breakdown[incident.type] = (breakdown[incident.type] || 0) + 1;
        });
        return breakdown;
    }

    calculateSLAMetrics(incidents) {
        const resolvedIncidents = incidents.filter(i => i.status === 'resolved');
        const breached = resolvedIncidents.filter(i => i.slaBreached).length;
        const total = resolvedIncidents.length;

        return {
            totalResolved: total,
            slaBreached: breached,
            slaMet: total - breached,
            slaPercentage: total > 0 ? ((total - breached) / total * 100).toFixed(1) : '0.0'
        };
    }

    calculateResolutionTimes(incidents) {
        const resolved = incidents.filter(i => i.resolutionTime);
        const times = resolved.map(i => i.resolutionTime);

        if (times.length === 0) return { count: 0 };

        return {
            count: times.length,
            min: Math.min(...times),
            max: Math.max(...times),
            average: times.reduce((a, b) => a + b, 0) / times.length,
            median: this.calculateMedian(times)
        };
    }

    calculateAverageResolutionTime(incidents) {
        const resolved = incidents.filter(i => i.resolutionTime);
        if (resolved.length === 0) return 0;
        return resolved.reduce((sum, i) => sum + i.resolutionTime, 0) / resolved.length;
    }

    calculateMedianResolutionTime(incidents) {
        const times = incidents.filter(i => i.resolutionTime).map(i => i.resolutionTime);
        return this.calculateMedian(times);
    }

    calculateMedian(numbers) {
        if (numbers.length === 0) return 0;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ?
            (sorted[mid - 1] + sorted[mid]) / 2 :
            sorted[mid];
    }

    calculateTrends(incidents, timeframe) {
        // Simple trend calculation - would be more sophisticated in production
        const periods = this.splitIntoPeriods(incidents, timeframe);
        const counts = periods.map(p => p.length);

        const trend = counts.length > 1 ?
            (counts[counts.length - 1] - counts[0]) / counts.length :
            0;

        return {
            direction: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
            magnitude: Math.abs(trend),
            periods: counts
        };
    }

    getTopRootCauses(incidents) {
        const causes = {};
        incidents.forEach(incident => {
            if (incident.rootCause?.category) {
                causes[incident.rootCause.category] = (causes[incident.rootCause.category] || 0) + 1;
            }
        });

        return Object.entries(causes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cause, count]) => ({ cause, count }));
    }

    getTopAffectedComponents(incidents) {
        const components = {};
        incidents.forEach(incident => {
            incident.affectedComponents.forEach(component => {
                components[component] = (components[component] || 0) + 1;
            });
        });

        return Object.entries(components)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([component, count]) => ({ component, count }));
    }

    calculateRollbackMetrics(incidents) {
        const rollbackIncidents = incidents.filter(i =>
            i.type.includes('rollback') || i.rollbackId
        );

        return {
            totalRollbacks: rollbackIncidents.length,
            automaticRollbacks: rollbackIncidents.filter(i => i.type === 'automated_rollback').length,
            manualRollbacks: rollbackIncidents.filter(i => i.type === 'manual_rollback').length,
            failedRollbacks: rollbackIncidents.filter(i => i.type === 'rollback_failure').length,
            successRate: rollbackIncidents.length > 0 ?
                ((rollbackIncidents.length - rollbackIncidents.filter(i => i.type === 'rollback_failure').length) / rollbackIncidents.length * 100).toFixed(1) :
                '100.0'
        };
    }

    generateActionItems(incident) {
        const actionItems = [];

        if (incident.slaBreached) {
            actionItems.push({
                title: 'Review and improve SLA response procedures',
                priority: 'high',
                assignee: 'operations_team'
            });
        }

        if (incident.escalated) {
            actionItems.push({
                title: 'Review escalation triggers and procedures',
                priority: 'medium',
                assignee: 'operations_team'
            });
        }

        return actionItems;
    }

    generateRecommendations(incident) {
        const recommendations = [];

        if (incident.type === 'rollback_failure') {
            recommendations.push('Improve rollback system resilience and error handling');
            recommendations.push('Implement additional rollback validation steps');
        }

        if (incident.resolutionTime > incident.slaTarget * 2) {
            recommendations.push('Review and optimize incident response procedures');
        }

        return recommendations;
    }

    // Utility methods
    getTimeframeCutoff(timeframe) {
        const now = Date.now();
        const timeframes = {
            hour: 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000,
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000
        };

        return now - (timeframes[timeframe] || timeframes.week);
    }

    splitIntoPeriods(incidents, timeframe) {
        // Simple implementation - would be more sophisticated in production
        const periods = [];
        const cutoff = this.getTimeframeCutoff(timeframe);
        const periodLength = timeframe === 'week' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

        let currentPeriodStart = cutoff;
        while (currentPeriodStart < Date.now()) {
            const periodEnd = currentPeriodStart + periodLength;
            const periodIncidents = incidents.filter(i =>
                i.createdAt.getTime() >= currentPeriodStart &&
                i.createdAt.getTime() < periodEnd
            );
            periods.push(periodIncidents);
            currentPeriodStart = periodEnd;
        }

        return periods;
    }

    async storeIncident(incident) {
        if (this.config.persistenceEnabled !== false) {
            const filePath = path.join(this.config.incidentsPath, `${incident.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(incident, null, 2), 'utf8');
        }
    }

    async loadActiveIncidents() {
        try {
            const files = await fs.readdir(this.config.incidentsPath);
            const incidentFiles = files.filter(f => f.endsWith('.json'));

            for (const file of incidentFiles) {
                try {
                    const filePath = path.join(this.config.incidentsPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const incident = JSON.parse(content);

                    // Only load unresolved incidents as active
                    if (incident.status !== 'resolved') {
                        this.activeIncidents.set(incident.id, incident);
                    }

                    this.incidentHistory.push(incident);

                } catch (error) {
                    console.error(`[IncidentTracker] Error loading incident file ${file}: ${error.message}`);
                }
            }

            console.log(`[IncidentTracker] Loaded ${this.activeIncidents.size} active incidents and ${this.incidentHistory.length} total incidents`);

        } catch (error) {
            console.error(`[IncidentTracker] Error loading incidents: ${error.message}`);
        }
    }

    isOperational() {
        return this.isOperational;
    }

    getStatus() {
        return {
            operational: this.isOperational,
            activeIncidents: this.activeIncidents.size,
            totalIncidents: this.incidentHistory.length,
            incidentTypes: Object.keys(this.incidentTypes)
        };
    }
}

module.exports = { IncidentTracker };