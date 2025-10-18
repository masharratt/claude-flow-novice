/**
 * Connection Status Indicators and Error Handling Utilities
 * Provides comprehensive connection monitoring and status reporting
 */

import EventEmitter from 'events';

export class ConnectionStatusManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      heartbeatInterval: options.heartbeatInterval || 10000,
      connectionTimeout: options.connectionTimeout || 30000,
      reconnectAttempts: options.reconnectAttempts || 5,
      reconnectDelay: options.reconnectDelay || 2000,
      statusUpdateInterval: options.statusUpdateInterval || 1000,
      maxHistory: options.maxHistory || 100,
      ...options
    };

    this.connections = new Map();
    this.statusHistory = [];
    this.globalStatus = {
      connected: 0,
      disconnected: 0,
      connecting: 0,
      error: 0,
      total: 0
    };

    this.heartbeatTimer = null;
    this.statusTimer = null;
    this.startTime = Date.now();

    this.startMonitoring();
  }

  /**
   * Register a new connection
   */
  registerConnection(connectionId, connection, metadata = {}) {
    const connectionInfo = {
      id: connectionId,
      connection,
      status: 'connecting',
      metadata,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      lastHeartbeat: Date.now(),
      reconnectCount: 0,
      errorCount: 0,
      messageCount: 0,
      bytesReceived: 0,
      bytesSent: 0,
      latency: 0,
      latencyHistory: []
    };

    this.connections.set(connectionId, connectionInfo);
    this.globalStatus.total++;
    this.globalStatus.connecting++;

    this.setupConnectionMonitoring(connectionId, connectionInfo);
    this.emit('connection:registered', connectionInfo);

    return connectionInfo;
  }

  /**
   * Setup monitoring for a specific connection
   */
  setupConnectionMonitoring(connectionId, connectionInfo) {
    const { connection } = connectionInfo;

    // Monitor connection events
    connection.on('connect', () => {
      this.updateConnectionStatus(connectionId, 'connected');
    });

    connection.on('open', () => {
      this.updateConnectionStatus(connectionId, 'connected');
    });

    connection.on('disconnect', (reason) => {
      this.updateConnectionStatus(connectionId, 'disconnected', { reason });
    });

    connection.on('close', (code, reason) => {
      this.updateConnectionStatus(connectionId, 'disconnected', { code, reason });
    });

    connection.on('error', (error) => {
      this.handleConnectionError(connectionId, error);
    });

    // Monitor message activity
    connection.on('message', (data) => {
      connectionInfo.lastActivity = Date.now();
      connectionInfo.messageCount++;
      connectionInfo.bytesReceived += data.length || JSON.stringify(data).length;

      // Calculate latency if timestamp is present
      if (data && data.timestamp) {
        const latency = Date.now() - data.timestamp;
        this.updateLatency(connectionId, latency);
      }
    });

    // Monitor sent messages (for Socket.IO)
    if (connection.emit) {
      const originalEmit = connection.emit.bind(connection);
      connection.emit = (event, ...args) => {
        connectionInfo.lastActivity = Date.now();
        connectionInfo.messageCount++;
        connectionInfo.bytesSent += JSON.stringify(args).length;

        return originalEmit(event, ...args);
      };
    }
  }

  /**
   * Update connection status
   */
  updateConnectionStatus(connectionId, status, details = {}) {
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) return;

    const oldStatus = connectionInfo.status;
    connectionInfo.status = status;
    connectionInfo.lastActivity = Date.now();

    // Update global counts
    if (oldStatus !== status) {
      this.globalStatus[oldStatus]--;
      this.globalStatus[status]++;

      const statusChange = {
        connectionId,
        oldStatus,
        newStatus: status,
        timestamp: Date.now(),
        details
      };

      this.statusHistory.push(statusChange);
      this.trimHistory();

      this.emit('connection:status:changed', statusChange);

      // Log significant status changes
      if (status === 'error' || status === 'disconnected') {
        console.warn(`Connection ${connectionId} status changed to ${status}:`, details);
      } else if (status === 'connected') {
        console.log(`Connection ${connectionId} established`);
      }
    }

    this.emit('connection:status:updated', connectionInfo);
  }

  /**
   * Handle connection errors
   */
  handleConnectionError(connectionId, error) {
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) return;

    connectionInfo.errorCount++;
    connectionInfo.lastError = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };

    this.updateConnectionStatus(connectionId, 'error', { error: error.message });

    this.emit('connection:error', {
      connectionId,
      error,
      connectionInfo
    });

    // Attempt reconnection if configured
    if (connectionInfo.reconnectCount < this.options.reconnectAttempts) {
      this.scheduleReconnection(connectionId);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnection(connectionId) {
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) return;

    connectionInfo.reconnectCount++;
    const delay = this.options.reconnectDelay * Math.pow(2, connectionInfo.reconnectCount - 1);

    setTimeout(() => {
      this.attemptReconnection(connectionId);
    }, delay);

    this.emit('connection:reconnect:scheduled', {
      connectionId,
      attempt: connectionInfo.reconnectCount,
      delay
    });
  }

  /**
   * Attempt to reconnect a connection
   */
  attemptReconnection(connectionId) {
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) return;

    this.updateConnectionStatus(connectionId, 'connecting');
    this.emit('connection:reconnect:attempting', { connectionId });

    try {
      if (connectionInfo.connection.connect) {
        connectionInfo.connection.connect();
      } else if (connectionInfo.connection.open) {
        connectionInfo.connection.open();
      } else {
        console.warn(`No reconnect method available for connection ${connectionId}`);
        this.updateConnectionStatus(connectionId, 'error', {
          error: 'No reconnect method available'
        });
      }
    } catch (error) {
      this.handleConnectionError(connectionId, error);
    }
  }

  /**
   * Update latency measurements
   */
  updateLatency(connectionId, latency) {
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) return;

    connectionInfo.latencyHistory.push(latency);
    if (connectionInfo.latencyHistory.length > 10) {
      connectionInfo.latencyHistory = connectionInfo.latencyHistory.slice(-10);
    }

    connectionInfo.latency = connectionInfo.latencyHistory.reduce((sum, l) => sum + l, 0) / connectionInfo.latencyHistory.length;

    this.emit('connection:latency:updated', {
      connectionId,
      latency,
      average: connectionInfo.latency
    });
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [connectionId, connectionInfo] of this.connections) {
        const timeSinceLastActivity = now - connectionInfo.lastActivity;
        const timeSinceLastHeartbeat = now - connectionInfo.lastHeartbeat;

        // Check for stale connections
        if (timeSinceLastActivity > this.options.connectionTimeout) {
          if (connectionInfo.status === 'connected') {
            this.handleConnectionError(connectionId, new Error('Connection timeout - no activity'));
          }
        }

        // Send heartbeat if supported
        if (connectionInfo.status === 'connected' && connectionInfo.connection.ping) {
          try {
            connectionInfo.connection.ping();
            connectionInfo.lastHeartbeat = now;
          } catch (error) {
            this.handleConnectionError(connectionId, error);
          }
        }
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Start monitoring
   */
  startMonitoring() {
    this.startHeartbeat();
    this.statusTimer = setInterval(() => {
      this.emit('status:updated', this.getGlobalStatus());
    }, this.options.statusUpdateInterval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }

  /**
   * Get global connection status
   */
  getGlobalStatus() {
    const connections = Array.from(this.connections.values());
    const healthyConnections = connections.filter(conn => this.isConnectionHealthy(conn));
    const unhealthyConnections = connections.filter(conn => !this.isConnectionHealthy(conn));

    return {
      ...this.globalStatus,
      healthy: healthyConnections.length,
      unhealthy: unhealthyConnections.length,
      healthRatio: connections.length > 0 ? healthyConnections.length / connections.length : 1,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now()
    };
  }

  /**
   * Check if a connection is healthy
   */
  isConnectionHealthy(connectionInfo) {
    const now = Date.now();
    const timeSinceLastActivity = now - connectionInfo.lastActivity;
    const timeSinceCreation = now - connectionInfo.createdAt;

    return connectionInfo.status === 'connected' &&
           timeSinceLastActivity < this.options.connectionTimeout &&
           connectionInfo.errorCount < 5 &&
           connectionInfo.latency < 5000;
  }

  /**
   * Get detailed connection information
   */
  getConnectionInfo(connectionId) {
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) return null;

    return {
      ...connectionInfo,
      healthy: this.isConnectionHealthy(connectionInfo),
      age: Date.now() - connectionInfo.createdAt,
      idleTime: Date.now() - connectionInfo.lastActivity
    };
  }

  /**
   * Get all connections with their status
   */
  getAllConnections() {
    return Array.from(this.connections.entries()).map(([id, info]) => ({
      id,
      ...this.getConnectionInfo(id)
    }));
  }

  /**
   * Get connections by status
   */
  getConnectionsByStatus(status) {
    return this.getAllConnections().filter(conn => conn.status === status);
  }

  /**
   * Get status history
   */
  getStatusHistory(limit = 50) {
    return this.statusHistory.slice(-limit);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const connections = this.getAllConnections();
    const activeConnections = connections.filter(conn => conn.status === 'connected');

    const avgLatency = activeConnections.length > 0
      ? activeConnections.reduce((sum, conn) => sum + conn.latency, 0) / activeConnections.length
      : 0;

    const totalMessages = connections.reduce((sum, conn) => sum + conn.messageCount, 0);
    const totalBytes = connections.reduce((sum, conn) => sum + conn.bytesReceived + conn.bytesSent, 0);

    return {
      totalConnections: connections.length,
      activeConnections: activeConnections.length,
      avgLatency,
      totalMessages,
      totalBytes,
      messageRate: totalMessages / ((Date.now() - this.startTime) / 1000),
      byteRate: totalBytes / ((Date.now() - this.startTime) / 1000),
      errorRate: connections.reduce((sum, conn) => sum + conn.errorCount, 0) / Math.max(totalMessages, 1),
      timestamp: Date.now()
    };
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    const status = this.getGlobalStatus();
    const metrics = this.getPerformanceMetrics();

    return {
      status: status.healthRatio > 0.8 ? 'healthy' : status.healthRatio > 0.5 ? 'warning' : 'critical',
      healthRatio: status.healthRatio,
      connected: status.connected,
      total: status.total,
      issues: {
        slowConnections: this.getAllConnections().filter(conn => conn.latency > 1000).length,
        errorConnections: this.getAllConnections().filter(conn => conn.errorCount > 0).length,
        staleConnections: this.getAllConnections().filter(conn =>
          Date.now() - conn.lastActivity > this.options.connectionTimeout / 2
        ).length
      },
      performance: {
        avgLatency: metrics.avgLatency,
        messageRate: metrics.messageRate,
        errorRate: metrics.errorRate
      },
      recommendations: this.generateRecommendations(status, metrics),
      timestamp: Date.now()
    };
  }

  /**
   * Generate recommendations based on status
   */
  generateRecommendations(status, metrics) {
    const recommendations = [];

    if (status.healthRatio < 0.8) {
      recommendations.push({
        type: 'health',
        priority: 'high',
        message: 'Connection health ratio is below 80%. Check for failing connections.',
        action: 'Investigate connection errors and increase reconnection attempts'
      });
    }

    if (metrics.avgLatency > 1000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Average latency is above 1 second. Consider optimizing connection handling.',
        action: 'Check network conditions and implement message batching'
      });
    }

    if (metrics.errorRate > 0.1) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'Error rate is above 10%. Connection stability issues detected.',
        action: 'Review error logs and implement better error handling'
      });
    }

    if (status.unhealthy > 0) {
      recommendations.push({
        type: 'maintenance',
        priority: 'low',
        message: `${status.unhealthy} unhealthy connections detected.`,
        action: 'Consider removing or restarting unhealthy connections'
      });
    }

    return recommendations;
  }

  /**
   * Remove connection from monitoring
   */
  removeConnection(connectionId) {
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) return;

    this.globalStatus[connectionInfo.status]--;
    this.globalStatus.total--;

    this.connections.delete(connectionId);
    this.emit('connection:removed', { connectionId, connectionInfo });
  }

  /**
   * Trim history to prevent memory leaks
   */
  trimHistory() {
    if (this.statusHistory.length > this.options.maxHistory) {
      this.statusHistory = this.statusHistory.slice(-this.options.maxHistory);
    }
  }

  /**
   * Export connection status data
   */
  exportData() {
    return {
      connections: this.getAllConnections(),
      globalStatus: this.getGlobalStatus(),
      performance: this.getPerformanceMetrics(),
      health: this.getHealthSummary(),
      history: this.getStatusHistory(),
      configuration: this.options,
      timestamp: Date.now()
    };
  }

  /**
   * Reset all monitoring data
   */
  reset() {
    this.connections.clear();
    this.statusHistory = [];
    this.globalStatus = {
      connected: 0,
      disconnected: 0,
      connecting: 0,
      error: 0,
      total: 0
    };
    this.startTime = Date.now();

    this.emit('status:reset');
  }
}

/**
 * Connection Status Indicator Class
 * Provides visual/status indicators for connections
 */
export class ConnectionStatusIndicator {
  constructor(elementId, options = {}) {
    this.elementId = elementId;
    this.element = document.getElementById(elementId);
    this.options = {
      updateInterval: options.updateInterval || 1000,
      showDetails: options.showDetails ?? true,
      autoRefresh: options.autoRefresh ?? true,
      ...options
    };

    this.statusManager = null;
    this.updateTimer = null;

    if (this.element) {
      this.initialize();
    }
  }

  /**
   * Initialize the indicator
   */
  initialize() {
    this.createIndicatorElement();
    if (this.options.autoRefresh) {
      this.startAutoUpdate();
    }
  }

  /**
   * Set the status manager
   */
  setStatusManager(statusManager) {
    this.statusManager = statusManager;

    if (statusManager) {
      statusManager.on('status:updated', () => {
        this.updateDisplay();
      });
    }
  }

  /**
   * Create indicator element
   */
  createIndicatorElement() {
    if (!this.element) return;

    this.element.innerHTML = `
      <div class="connection-status-indicator">
        <div class="status-header">
          <h3>Connection Status</h3>
          <div class="status-badge status-unknown">Unknown</div>
        </div>
        <div class="status-metrics">
          <div class="metric">
            <span class="label">Connected:</span>
            <span class="value connected-count">0</span>
          </div>
          <div class="metric">
            <span class="label">Total:</span>
            <span class="value total-count">0</span>
          </div>
          <div class="metric">
            <span class="label">Health:</span>
            <span class="value health-ratio">0%</span>
          </div>
        </div>
        <div class="status-details" style="display: none;">
          <div class="detail-item">
            <span class="label">Uptime:</span>
            <span class="value uptime">0s</span>
          </div>
          <div class="detail-item">
            <span class="label">Avg Latency:</span>
            <span class="value avg-latency">0ms</span>
          </div>
          <div class="detail-item">
            <span class="label">Messages:</span>
            <span class="value message-count">0</span>
          </div>
        </div>
        <button class="toggle-details">Show Details</button>
        <button class="refresh-status">Refresh</button>
      </div>
    `;

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (!this.element) return;

    const toggleBtn = this.element.querySelector('.toggle-details');
    const refreshBtn = this.element.querySelector('.refresh-status');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const details = this.element.querySelector('.status-details');
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
        toggleBtn.textContent = isHidden ? 'Hide Details' : 'Show Details';
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.updateDisplay();
      });
    }
  }

  /**
   * Start auto-update
   */
  startAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = setInterval(() => {
      this.updateDisplay();
    }, this.options.updateInterval);
  }

  /**
   * Stop auto-update
   */
  stopAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Update the display
   */
  updateDisplay() {
    if (!this.element || !this.statusManager) return;

    const status = this.statusManager.getGlobalStatus();
    const metrics = this.statusManager.getPerformanceMetrics();
    const health = this.statusManager.getHealthSummary();

    // Update badge
    const badge = this.element.querySelector('.status-badge');
    if (badge) {
      badge.className = `status-badge status-${health.status}`;
      badge.textContent = health.status.charAt(0).toUpperCase() + health.status.slice(1);
    }

    // Update metrics
    this.updateElement('.connected-count', status.connected);
    this.updateElement('.total-count', status.total);
    this.updateElement('.health-ratio', `${Math.round(status.healthRatio * 100)}%`);

    // Update details if visible
    if (this.options.showDetails) {
      this.updateElement('.uptime', this.formatDuration(status.uptime));
      this.updateElement('.avg-latency', `${Math.round(metrics.avgLatency)}ms`);
      this.updateElement('.message-count', metrics.totalMessages);
    }
  }

  /**
   * Update element content
   */
  updateElement(selector, value) {
    const element = this.element.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Destroy the indicator
   */
  destroy() {
    this.stopAutoUpdate();
    if (this.element) {
      this.element.innerHTML = '';
    }
  }
}

export { ConnectionStatusManager, ConnectionStatusIndicator };