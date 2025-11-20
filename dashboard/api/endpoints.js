/**
 * CFN Loop Dashboard API Endpoints
 * 
 * REST API endpoints for retrieving CFN Loop data from SQLite database.
 * Supports real-time updates via WebSocket broadcasting.
 */

const express = require('express');
const path = require('path');

function createEndpoints(db, io) {
    const router = express.Router();

    // Utility function to execute database queries
    function query(sql, params = []) {
        return new Promise((resolve, reject) => {
            db().all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Utility function to execute database queries with single result
    function get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db().get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Utility function to execute database modifications
    function run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db().run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        id: this.lastID, 
                        changes: this.changes 
                    });
                }
            });
        });
    }

    /**
     * Dashboard Metrics
     * GET /api/metrics
     * Returns overall dashboard statistics
     */
    router.get('/metrics', async (req, res) => {
        try {
            const [
                totalTasks,
                activeTasks,
                totalAgents,
                activeAgents,
                recentEvents,
                avgConfidence
            ] = await Promise.all([
                query('SELECT COUNT(*) as count FROM tasks'),
                query('SELECT COUNT(*) as count FROM tasks WHERE status IN ("running", "pending")'),
                query('SELECT COUNT(*) as count FROM agents'),
                query('SELECT COUNT(*) as count FROM agents WHERE status IN ("spawned", "running")'),
                query('SELECT COUNT(*) as count FROM events WHERE timestamp > datetime("now", "-1 hour")'),
                query('SELECT AVG(confidence) as avg_confidence FROM agents WHERE confidence IS NOT NULL')
            ]);

            res.json({
                totalTasks: totalTasks[0].count,
                activeTasks: activeTasks[0].count,
                totalAgents: totalAgents[0].count,
                activeAgents: activeAgents[0].count,
                recentEvents: recentEvents[0].count,
                averageConfidence: avgConfidence[0].avg_confidence ? Math.round(avgConfidence[0].avg_confidence * 100) : 0,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error fetching metrics:', error);
            res.status(500).json({ error: 'Failed to fetch metrics' });
        }
    });

    /**
     * Tasks List
     * GET /api/tasks
     * Returns list of CFN Loop tasks
     */
    router.get('/tasks', async (req, res) => {
        try {
            const { page = 1, limit = 50, status, search } = req.query;
            const offset = (page - 1) * limit;

            let whereClause = '';
            let params = [];

            if (status) {
                whereClause += ' WHERE status = ?';
                params.push(status);
            }

            if (search) {
                whereClause += whereClause ? ' AND' : ' WHERE';
                whereClause += ' description LIKE ?';
                params.push(`%${search}%`);
            }

            const [tasks, total] = await Promise.all([
                query(`
                    SELECT *, 
                           CASE 
                               WHEN status = 'completed' THEN 'success'
                               WHEN status = 'failed' THEN 'danger'
                               WHEN status = 'running' THEN 'primary'
                               ELSE 'secondary'
                           END as status_class
                    FROM tasks 
                    ${whereClause}
                    ORDER BY created_at DESC 
                    LIMIT ? OFFSET ?
                `, [...params, limit, offset]),
                query(`SELECT COUNT(*) as count FROM tasks ${whereClause}`, params)
            ]);

            res.json({
                tasks,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total[0].count,
                    pages: Math.ceil(total[0].count / limit)
                }
            });
        } catch (error) {
            console.error('Error fetching tasks:', error);
            res.status(500).json({ error: 'Failed to fetch tasks' });
        }
    });

    /**
     * Task Details
     * GET /api/tasks/:taskId
     * Returns detailed information about a specific task
     */
    router.get('/tasks/:taskId', async (req, res) => {
        try {
            const { taskId } = req.params;

            const [task, agents, events] = await Promise.all([
                get('SELECT * FROM tasks WHERE id = ?', [taskId]),
                query('SELECT * FROM agents WHERE task_id = ? ORDER BY spawned_at DESC', [taskId]),
                query(`
                    SELECT * FROM events 
                    WHERE task_id = ? 
                    ORDER BY timestamp DESC 
                    LIMIT 100
                `, [taskId])
            ]);

            if (!task) {
                return res.status(404).json({ error: 'Task not found' });
            }

            // Parse metadata JSON fields
            agents.forEach(agent => {
                try {
                    agent.metadata = agent.metadata ? JSON.parse(agent.metadata) : {};
                } catch (e) {
                    agent.metadata = {};
                }
            });

            events.forEach(event => {
                try {
                    event.metadata = event.metadata ? JSON.parse(event.metadata) : {};
                } catch (e) {
                    event.metadata = {};
                }
            });

            res.json({
                task,
                agents,
                events
            });
        } catch (error) {
            console.error('Error fetching task details:', error);
            res.status(500).json({ error: 'Failed to fetch task details' });
        }
    });

    /**
     * Agent Status
     * GET /api/agents
     * Returns list of agents with their current status
     */
    router.get('/agents', async (req, res) => {
        try {
            const { status, type, task_id } = req.query;
            
            let whereClause = '';
            let params = [];

            if (status) {
                whereClause += ' WHERE status = ?';
                params.push(status);
            }

            if (type) {
                whereClause += whereClause ? ' AND' : ' WHERE';
                whereClause += ' type = ?';
                params.push(type);
            }

            if (task_id) {
                whereClause += whereClause ? ' AND' : ' WHERE';
                whereClause += ' task_id = ?';
                params.push(task_id);
            }

            const agents = await query(`
                SELECT *, 
                       CASE 
                           WHEN status = 'completed' THEN 'success'
                           WHEN status = 'failed' THEN 'danger'
                           WHEN status = 'spawned' THEN 'primary'
                           WHEN status = 'running' THEN 'warning'
                           ELSE 'secondary'
                       END as status_class
                FROM agents 
                ${whereClause}
                ORDER BY spawned_at DESC
            `, params);

            // Parse metadata and calculate duration
            agents.forEach(agent => {
                try {
                    agent.metadata = agent.metadata ? JSON.parse(agent.metadata) : {};
                } catch (e) {
                    agent.metadata = {};
                }

                // Calculate duration if agent has completed
                if (agent.spawned_at && agent.completed_at) {
                    const start = new Date(agent.spawned_at);
                    const end = new Date(agent.completed_at);
                    agent.duration = Math.round((end - start) / 1000); // duration in seconds
                }
            });

            res.json(agents);
        } catch (error) {
            console.error('Error fetching agents:', error);
            res.status(500).json({ error: 'Failed to fetch agents' });
        }
    });

    /**
     * Events Stream
     * GET /api/events
     * Returns recent events with filtering options
     */
    router.get('/events', async (req, res) => {
        try {
            const { 
                page = 1, 
                limit = 100, 
                level, 
                event_type, 
                task_id, 
                loop,
                since 
            } = req.query;
            
            const offset = (page - 1) * limit;
            let whereClause = '';
            let params = [];

            // Build WHERE clause
            const conditions = [];
            
            if (level) {
                conditions.push('level = ?');
                params.push(level.toUpperCase());
            }
            
            if (event_type) {
                conditions.push('event_type = ?');
                params.push(event_type);
            }
            
            if (task_id) {
                conditions.push('task_id = ?');
                params.push(task_id);
            }
            
            if (loop) {
                conditions.push('loop = ?');
                params.push(loop);
            }
            
            if (since) {
                conditions.push('timestamp > ?');
                params.push(since);
            }
            
            if (conditions.length > 0) {
                whereClause = ' WHERE ' + conditions.join(' AND ');
            }

            const [events, total] = await Promise.all([
                query(`
                    SELECT * FROM events 
                    ${whereClause}
                    ORDER BY timestamp DESC 
                    LIMIT ? OFFSET ?
                `, [...params, limit, offset]),
                query(`SELECT COUNT(*) as count FROM events ${whereClause}`, params)
            ]);

            // Parse metadata
            events.forEach(event => {
                try {
                    event.metadata = event.metadata ? JSON.parse(event.metadata) : {};
                } catch (e) {
                    event.metadata = {};
                }

                // Add level class for styling
                event.level_class = event.level.toLowerCase();
            });

            res.json({
                events,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total[0].count,
                    pages: Math.ceil(total[0].count / limit)
                }
            });
        } catch (error) {
            console.error('Error fetching events:', error);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    });

    /**
     * Performance Analytics
     * GET /api/analytics/performance
     * Returns performance metrics and analytics
     */
    router.get('/analytics/performance', async (req, res) => {
        try {
            const { 
                timeframe = '24h', 
                task_id 
            } = req.query;
            
            // Calculate time filter
            let timeFilter = '';
            switch (timeframe) {
                case '1h':
                    timeFilter = "datetime('now', '-1 hour')";
                    break;
                case '24h':
                    timeFilter = "datetime('now', '-1 day')";
                    break;
                case '7d':
                    timeFilter = "datetime('now', '-7 days')";
                    break;
                case '30d':
                    timeFilter = "datetime('now', '-30 days')";
                    break;
                default:
                    timeFilter = "datetime('now', '-1 day')";
            }

            let whereClause = `WHERE timestamp > ${timeFilter}`;
            let params = [];

            if (task_id) {
                whereClause += ' AND task_id = ?';
                params.push(task_id);
            }

            const [
                agentPerformance,
                eventStats,
                completionRate,
                confidenceByType
            ] = await Promise.all([
                // Agent performance by type
                query(`
                    SELECT type, 
                           AVG(confidence) as avg_confidence,
                           COUNT(*) as total_agents,
                           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                           AVG(
                               CASE 
                                   WHEN completed_at AND spawned_at 
                                   THEN (julianday(completed_at) - julianday(spawned_at)) * 86400
                                   ELSE NULL 
                               END
                           ) as avg_duration_seconds
                    FROM agents 
                    WHERE spawned_at > ${timeFilter}
                    ${task_id ? 'AND task_id = ?' : ''}
                    GROUP BY type
                `, task_id ? [task_id] : []),

                // Event statistics
                query(`
                    SELECT event_type, 
                           level,
                           COUNT(*) as count
                    FROM events 
                    ${whereClause}
                    GROUP BY event_type, level
                `, params),

                // Task completion rates
                query(`
                    SELECT 
                        COUNT(*) as total_tasks,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks,
                        SUM(CASE WHEN status IN ('running', 'pending') THEN 1 ELSE 0 END) as active_tasks
                    FROM tasks 
                    WHERE created_at > ${timeFilter}
                    ${task_id ? 'AND id = ?' : ''}
                `, task_id ? [task_id] : []),

                // Confidence scores by iteration
                query(`
                    SELECT iteration,
                           AVG(confidence) as avg_confidence,
                           COUNT(*) as agent_count
                    FROM agents 
                    WHERE confidence IS NOT NULL 
                      AND spawned_at > ${timeFilter}
                      ${task_id ? 'AND task_id = ?' : ''}
                    GROUP BY iteration
                    ORDER BY iteration
                `, task_id ? [task_id] : [])
            ]);

            // Calculate derived metrics
            const taskStats = completionRate[0] || {};
            const completionRatePercent = taskStats.total_tasks > 0 
                ? Math.round((taskStats.completed_tasks / taskStats.total_tasks) * 100) 
                : 0;

            res.json({
                timeframe,
                task_id: task_id || null,
                agentPerformance: agentPerformance.map(agent => ({
                    ...agent,
                    avg_confidence: agent.avg_confidence ? Math.round(agent.avg_confidence * 100) : 0,
                    avg_duration_seconds: Math.round(agent.avg_duration_seconds || 0),
                    completion_rate: agent.total_agents > 0 
                        ? Math.round((agent.completed / agent.total_agents) * 100) 
                        : 0
                })),
                eventStats,
                taskStats: {
                    ...taskStats,
                    completion_rate_percent: completionRatePercent
                },
                confidenceByIteration: confidenceByType.map(item => ({
                    ...item,
                    avg_confidence: item.avg_confidence ? Math.round(item.avg_confidence * 100) : 0
                })),
                generated_at: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error fetching performance analytics:', error);
            res.status(500).json({ error: 'Failed to fetch performance analytics' });
        }
    });

    /**
     * Real-time Event Subscription
     * POST /api/events/subscribe
     * Subscribe to real-time event updates
     */
    router.post('/events/subscribe', (req, res) => {
        const { task_id, event_types } = req.body;
        
        // This endpoint works with WebSocket connections
        // The actual subscription is handled on the client side via socket.io
        res.json({ 
            message: 'Use WebSocket connection to subscribe to real-time updates',
            socket_events: {
                task_updates: `task-${task_id}`,
                new_events: 'new-event'
            }
        });
    });

    /**
     * Create Event
     * POST /api/events
     * Create a new event (used by CFN Loop agents)
     */
    router.post('/events', async (req, res) => {
        try {
            const { 
                task_id, 
                agent_id, 
                loop, 
                iteration, 
                event_type, 
                level = 'INFO', 
                message, 
                metadata 
            } = req.body;

            if (!task_id || !event_type || !message) {
                return res.status(400).json({ 
                    error: 'Missing required fields: task_id, event_type, message' 
                });
            }

            const result = await run(`
                INSERT INTO events (task_id, agent_id, loop, iteration, event_type, level, message, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                task_id, 
                agent_id, 
                loop, 
                iteration, 
                event_type, 
                level.toUpperCase(), 
                message, 
                metadata ? JSON.stringify(metadata) : null
            ]);

            // Broadcast new event to connected clients
            const newEvent = {
                id: result.id,
                task_id,
                agent_id,
                loop,
                iteration,
                event_type,
                level: level.toUpperCase(),
                message,
                metadata: metadata ? JSON.parse(metadata) : {},
                timestamp: new Date().toISOString()
            };

            io.emit('new-event', newEvent);

            res.json({ 
                success: true, 
                event_id: result.id,
                event: newEvent
            });
        } catch (error) {
            console.error('Error creating event:', error);
            res.status(500).json({ error: 'Failed to create event' });
        }
    });

    // Error handling middleware for this router
    router.use((error, req, res, next) => {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    });

    return router;
}

module.exports = createEndpoints;