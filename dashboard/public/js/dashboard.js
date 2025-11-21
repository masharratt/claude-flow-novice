/**
 * CFN Loop Dashboard Frontend JavaScript
 * 
 * Handles real-time dashboard updates, WebSocket connections,
 * and API interactions for the CFN Loop logging dashboard.
 */

class CFNLoopDashboard {
    constructor() {
        this.socket = null;
        this.currentTaskId = null;
        this.refreshInterval = null;
        this.metrics = {};
        
        this.init();
    }

    /**
     * Initialize the dashboard
     */
    async init() {
        try {
            await this.connectWebSocket();
            await this.loadInitialData();
            this.setupEventListeners();
            this.startAutoRefresh();
            console.log('Dashboard initialized successfully');
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showError('Failed to initialize dashboard: ' + error.message);
        }
    }

    /**
     * Establish WebSocket connection for real-time updates
     */
    async connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        try {
            this.socket = io(wsUrl);
            
            this.socket.on('connect', () => {
                console.log('WebSocket connected');
                this.updateConnectionStatus('connected');
            });
            
            this.socket.on('disconnect', () => {
                console.log('WebSocket disconnected');
                this.updateConnectionStatus('disconnected');
            });
            
            this.socket.on('task-update', (data) => {
                console.log('Task update received:', data);
                this.handleTaskUpdate(data);
            });
            
            this.socket.on('new-event', (event) => {
                console.log('New event received:', event);
                this.handleNewEvent(event);
            });
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            throw error;
        }
    }

    /**
     * Load initial dashboard data
     */
    async loadInitialData() {
        try {
            await Promise.all([
                this.loadMetrics(),
                this.loadTasks(),
                this.loadAgents(),
                this.loadRecentEvents()
            ]);
        } catch (error) {
            console.error('Failed to load initial data:', error);
            throw error;
        }
    }

    /**
     * Load dashboard metrics
     */
    async loadMetrics() {
        try {
            const response = await fetch('/api/metrics');
            if (!response.ok) throw new Error('Failed to fetch metrics');
            
            this.metrics = await response.json();
            this.updateMetricsDisplay();
        } catch (error) {
            console.error('Failed to load metrics:', error);
            this.showError('Failed to load metrics: ' + error.message);
        }
    }

    /**
     * Load tasks list
     */
    async loadTasks() {
        try {
            const response = await fetch('/api/tasks?limit=20');
            if (!response.ok) throw new Error('Failed to fetch tasks');
            
            const data = await response.json();
            this.updateTasksDisplay(data.tasks);
        } catch (error) {
            console.error('Failed to load tasks:', error);
            this.showError('Failed to load tasks: ' + error.message);
        }
    }

    /**
     * Load agents list
     */
    async loadAgents() {
        try {
            const response = await fetch('/api/agents?limit=20');
            if (!response.ok) throw new Error('Failed to fetch agents');
            
            const agents = await response.json();
            this.updateAgentsDisplay(agents);
        } catch (error) {
            console.error('Failed to load agents:', error);
            this.showError('Failed to load agents: ' + error.message);
        }
    }

    /**
     * Load recent events
     */
    async loadRecentEvents() {
        try {
            const response = await fetch('/api/events?limit=50');
            if (!response.ok) throw new Error('Failed to fetch events');
            
            const data = await response.json();
            this.updateEventsDisplay(data.events);
        } catch (error) {
            console.error('Failed to load events:', error);
            this.showError('Failed to load events: ' + error.message);
        }
    }

    /**
     * Setup event listeners for UI interactions
     */
    setupEventListeners() {
        // Task selection
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('task-link')) {
                e.preventDefault();
                const taskId = e.target.dataset.taskId;
                this.selectTask(taskId);
            }
        });

        // Refresh buttons
        const refreshButtons = document.querySelectorAll('[data-action="refresh"]');
        refreshButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.refreshData();
            });
        });

        // Filter controls
        const filterControls = document.querySelectorAll('[data-filter]');
        filterControls.forEach(control => {
            control.addEventListener('change', () => {
                this.applyFilters();
            });
        });

        // Auto-refresh toggle
        const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
        if (autoRefreshToggle) {
            autoRefreshToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        }
    }

    /**
     * Handle real-time task updates
     */
    handleTaskUpdate(data) {
        if (data.taskId === this.currentTaskId) {
            this.refreshTaskDetails(data.taskId);
        }
        
        // Update task in the list if visible
        const taskElement = document.querySelector(`[data-task-id="${data.taskId}"]`);
        if (taskElement) {
            this.updateTaskElement(taskElement, data);
        }
        
        // Refresh metrics if they might be affected
        if (data.status) {
            this.loadMetrics();
        }
    }

    /**
     * Handle new events
     */
    handleNewEvent(event) {
        // Add to events list if showing recent events
        const eventsContainer = document.getElementById('events-list');
        if (eventsContainer) {
            this.prependEventToList(event);
        }
        
        // Update event counters
        this.updateEventCounters();
    }

    /**
     * Update metrics display
     */
    updateMetricsDisplay() {
        const elements = {
            'total-tasks': this.metrics.totalTasks || 0,
            'active-tasks': this.metrics.activeTasks || 0,
            'total-agents': this.metrics.totalAgents || 0,
            'active-agents': this.metrics.activeAgents || 0,
            'recent-events': this.metrics.recentEvents || 0,
            'avg-confidence': this.metrics.averageConfidence || 0
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                // Add animation for value changes
                element.classList.add('value-updated');
                setTimeout(() => element.classList.remove('value-updated'), 500);
            }
        });
    }

    /**
     * Update tasks display
     */
    updateTasksDisplay(tasks) {
        const container = document.getElementById('tasks-list');
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = '<p class="no-data">No tasks found</p>';
            return;
        }

        const tasksHtml = tasks.map(task => `
            <div class="task-item ${task.status_class}" data-task-id="${task.id}">
                <div class="task-header">
                    <h4>
                        <a href="#" class="task-link" data-task-id="${task.id}">
                            ${task.id}
                        </a>
                    </h4>
                    <span class="status-badge status-${task.status_class}">
                        ${task.status}
                    </span>
                </div>
                <div class="task-description">
                    ${task.description || 'No description'}
                </div>
                <div class="task-meta">
                    <span class="iteration">Iteration: ${task.current_iteration || 1}</span>
                    <span class="created">Created: ${this.formatDate(task.created_at)}</span>
                </div>
            </div>
        `).join('');

        container.innerHTML = tasksHtml;
    }

    /**
     * Update agents display
     */
    updateAgentsDisplay(agents) {
        const container = document.getElementById('agents-list');
        if (!container) return;

        if (agents.length === 0) {
            container.innerHTML = '<p class="no-data">No agents found</p>';
            return;
        }

        const agentsHtml = agents.map(agent => `
            <div class="agent-item ${agent.status_class}" data-agent-id="${agent.id}">
                <div class="agent-header">
                    <h4>${agent.type}</h4>
                    <span class="status-badge status-${agent.status_class}">
                        ${agent.status}
                    </span>
                </div>
                <div class="agent-meta">
                    <span class="confidence">
                        Confidence: ${agent.confidence ? Math.round(agent.confidence * 100) + '%' : 'N/A'}
                    </span>
                    ${agent.duration ? `<span class="duration">Duration: ${agent.duration}s</span>` : ''}
                    <span class="created">Started: ${this.formatDate(agent.spawned_at)}</span>
                </div>
            </div>
        `).join('');

        container.innerHTML = agentsHtml;
    }

    /**
     * Update events display
     */
    updateEventsDisplay(events) {
        const container = document.getElementById('events-list');
        if (!container) return;

        if (events.length === 0) {
            container.innerHTML = '<p class="no-data">No events found</p>';
            return;
        }

        const eventsHtml = events.map(event => `
            <div class="event-item level-${event.level_class}" data-event-id="${event.id}">
                <div class="event-header">
                    <span class="event-type">${event.event_type}</span>
                    <span class="level-badge level-${event.level_class}">
                        ${event.level}
                    </span>
                    <span class="timestamp">${this.formatDate(event.timestamp)}</span>
                </div>
                <div class="event-message">
                    ${event.message}
                </div>
                ${event.task_id ? `<div class="event-meta">Task: ${event.task_id}</div>` : ''}
            </div>
        `).join('');

        container.innerHTML = eventsHtml;
    }

    /**
     * Select and display task details
     */
    async selectTask(taskId) {
        try {
            this.currentTaskId = taskId;
            
            // Subscribe to task updates via WebSocket
            if (this.socket) {
                this.socket.emit('subscribe-task', taskId);
            }
            
            // Load task details
            const response = await fetch(`/api/tasks/${taskId}`);
            if (!response.ok) throw new Error('Failed to fetch task details');
            
            const taskData = await response.json();
            this.displayTaskDetails(taskData);
            
        } catch (error) {
            console.error('Failed to select task:', error);
            this.showError('Failed to load task details: ' + error.message);
        }
    }

    /**
     * Display detailed task information
     */
    displayTaskDetails(taskData) {
        const container = document.getElementById('task-details');
        if (!container) return;

        const { task, agents, events } = taskData;
        
        const detailsHtml = `
            <div class="task-details">
                <div class="task-header">
                    <h3>${task.id}</h3>
                    <span class="status-badge status-${task.status || 'secondary'}">
                        ${task.status || 'Unknown'}
                    </span>
                </div>
                <div class="task-info">
                    <p><strong>Description:</strong> ${task.description || 'No description'}</p>
                    <p><strong>Mode:</strong> ${task.mode || 'N/A'}</p>
                    <p><strong>Current Iteration:</strong> ${task.current_iteration || 1}/${task.max_iterations || 10}</p>
                    <p><strong>Created:</strong> ${this.formatDate(task.created_at)}</p>
                    ${task.completed_at ? `<p><strong>Completed:</strong> ${this.formatDate(task.completed_at)}</p>` : ''}
                </div>
                
                <div class="agents-section">
                    <h4>Agents (${agents.length})</h4>
                    <div class="agents-list">
                        ${agents.map(agent => `
                            <div class="agent-summary ${agent.status_class}">
                                <strong>${agent.type}</strong> - ${agent.status}
                                ${agent.confidence ? ` (${Math.round(agent.confidence * 100)}% confidence)` : ''}
                            </div>
                        `).join('') || '<p>No agents for this task</p>'}
                    </div>
                </div>
                
                <div class="events-section">
                    <h4>Recent Events (${events.length})</h4>
                    <div class="events-timeline">
                        ${events.map(event => `
                            <div class="timeline-event level-${event.level.toLowerCase()}">
                                <div class="timeline-time">${this.formatDate(event.timestamp)}</div>
                                <div class="timeline-content">
                                    <strong>${event.event_type}:</strong> ${event.message}
                                </div>
                            </div>
                        `).join('') || '<p>No events for this task</p>'}
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = detailsHtml;
        container.style.display = 'block';
    }

    /**
     * Start auto-refresh
     */
    startAutoRefresh() {
        this.stopAutoRefresh(); // Clear any existing interval
        
        this.refreshInterval = setInterval(() => {
            this.refreshData();
        }, 30000); // Refresh every 30 seconds
        
        console.log('Auto-refresh started (30s interval)');
    }

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('Auto-refresh stopped');
        }
    }

    /**
     * Refresh all dashboard data
     */
    async refreshData() {
        try {
            await Promise.all([
                this.loadMetrics(),
                this.loadTasks(),
                this.loadAgents()
            ]);
            
            // Update last refresh time
            const lastRefreshElement = document.getElementById('last-refresh');
            if (lastRefreshElement) {
                lastRefreshElement.textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
            }
        } catch (error) {
            console.error('Failed to refresh data:', error);
        }
    }

    /**
     * Apply filters to current view
     */
    applyFilters() {
        // Implementation depends on specific filter requirements
        console.log('Applying filters...');
        // This would typically involve re-fetching data with filter parameters
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(status) {
        const indicator = document.getElementById('connection-status');
        if (indicator) {
            indicator.className = `connection-status ${status}`;
            indicator.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error(message);
        
        // Create or update error notification
        let errorElement = document.getElementById('error-notification');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'error-notification';
            errorElement.className = 'error-notification';
            document.body.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }

    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    /**
     * Prepend new event to the top of the events list
     */
    prependEventToList(event) {
        const container = document.getElementById('events-list');
        if (!container) return;
        
        const eventHtml = `
            <div class="event-item level-${event.level.toLowerCase()} new-event" data-event-id="${event.id}">
                <div class="event-header">
                    <span class="event-type">${event.event_type}</span>
                    <span class="level-badge level-${event.level.toLowerCase()}">
                        ${event.level}
                    </span>
                    <span class="timestamp">${this.formatDate(event.timestamp)}</span>
                </div>
                <div class="event-message">
                    ${event.message}
                </div>
                ${event.task_id ? `<div class="event-meta">Task: ${event.task_id}</div>` : ''}
            </div>
        `;
        
        container.insertAdjacentHTML('afterbegin', eventHtml);
        
        // Remove highlighting after a delay
        setTimeout(() => {
            const newEvent = container.querySelector('.new-event');
            if (newEvent) {
                newEvent.classList.remove('new-event');
            }
        }, 2000);
        
        // Limit the number of events displayed
        const events = container.querySelectorAll('.event-item');
        if (events.length > 50) {
            for (let i = 50; i < events.length; i++) {
                events[i].remove();
            }
        }
    }

    /**
     * Update event counters
     */
    updateEventCounters() {
        // Update any event count displays
        const recentEventsElement = document.getElementById('recent-events');
        if (recentEventsElement) {
            const currentCount = parseInt(recentEventsElement.textContent) || 0;
            recentEventsElement.textContent = currentCount + 1;
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new CFNLoopDashboard();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CFNLoopDashboard;
}