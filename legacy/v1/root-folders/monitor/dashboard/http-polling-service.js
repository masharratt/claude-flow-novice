/**
 * HTTP Polling Service for Dashboard Metrics
 * Provides robust fallback mechanism when WebSocket connections fail
 */

export class HttpPollingService {
    constructor(options = {}) {
        this.baseURL = options.baseURL || window.location.origin;
        this.pollingInterval = options.pollingInterval || 1000; // 1 second
        this.timeout = options.timeout || 5000; // 5 seconds timeout
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 2000; // 2 seconds

        this.isPolling = false;
        this.pollingTimer = null;
        this.retryCount = 0;
        this.lastSuccessfulPoll = null;
        this.metricsBuffer = [];
        this.subscribers = [];

        // Performance optimization
        this.abortController = null;
        this.pendingRequest = false;
        this.lastETag = null;

        // Connection status tracking
        this.connectionStatus = {
            isWebSocketConnected: false,
            isPollingActive: false,
            lastError: null,
            fallbackActivated: false,
            totalPolls: 0,
            successfulPolls: 0,
            failedPolls: 0
        };
    }

    /**
     * Start HTTP polling for metrics
     */
    start() {
        if (this.isPolling) {
            console.warn('HTTP polling already started');
            return;
        }

        console.log('🔄 Starting HTTP polling fallback service');
        this.isPolling = true;
        this.connectionStatus.isPollingActive = true;
        this.connectionStatus.fallbackActivated = true;

        // Initial poll
        this.pollMetrics();

        // Set up recurring polling
        this.pollingTimer = setInterval(() => {
            this.pollMetrics();
        }, this.pollingInterval);

        // Notify subscribers
        this.notifySubscribers('pollingStarted', {
            interval: this.pollingInterval,
            fallback: true
        });
    }

    /**
     * Stop HTTP polling
     */
    stop() {
        if (!this.isPolling) {
            return;
        }

        console.log('⏹️ Stopping HTTP polling service');
        this.isPolling = false;
        this.connectionStatus.isPollingActive = false;

        // Clear timer
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }

        // Abort any pending request
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        // Notify subscribers
        this.notifySubscribers('pollingStopped', {});
    }

    /**
     * Poll metrics from server with retry logic
     */
    async pollMetrics() {
        if (!this.isPolling || this.pendingRequest) {
            return;
        }

        this.pendingRequest = true;
        this.connectionStatus.totalPolls++;

        // Create new AbortController for this request
        this.abortController = new AbortController();

        try {
            const startTime = performance.now();
            const response = await this.fetchWithAuth('/api/metrics', {
                signal: this.abortController.signal,
                headers: this.getOptimizedHeaders()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const requestTime = performance.now() - startTime;

            // Update connection status
            this.connectionStatus.successfulPolls++;
            this.connectionStatus.lastError = null;
            this.lastSuccessfulPoll = Date.now();
            this.retryCount = 0;

            // Add metadata to metrics
            const enrichedData = {
                ...data,
                polling: {
                    requestTime: Math.round(requestTime * 100) / 100,
                    timestamp: new Date().toISOString(),
                    method: 'http',
                    fallback: true,
                    sequence: this.connectionStatus.totalPolls
                }
            };

            // Store in buffer (keep last 60 data points)
            this.metricsBuffer.push(enrichedData);
            if (this.metricsBuffer.length > 60) {
                this.metricsBuffer.shift();
            }

            // Notify all subscribers
            this.notifySubscribers('metrics', enrichedData);

        } catch (error) {
            this.handlePollingError(error);
        } finally {
            this.pendingRequest = false;
            this.abortController = null;
        }
    }

    /**
     * Fetch with authentication and proper error handling
     */
    async fetchWithAuth(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

        // Get auth token from auth client
        const token = this.getAuthToken();

        const defaultOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache',
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            ...options
        };

        return fetch(fullUrl, defaultOptions);
    }

    /**
     * Get optimized headers for requests
     */
    getOptimizedHeaders() {
        const headers = {};

        // Add ETag if available for conditional requests
        if (this.lastETag) {
            headers['If-None-Match'] = this.lastETag;
        }

        // Add compression
        headers['Accept-Encoding'] = 'gzip, deflate';

        return headers;
    }

    /**
     * Get authentication token
     */
    getAuthToken() {
        // Try to get token from auth client
        if (window.authClient && window.authClient.isAuthenticated()) {
            return window.authClient.getCurrentToken();
        }

        // Fallback to localStorage
        return localStorage.getItem('dashboard_access_token');
    }

    /**
     * Handle polling errors with retry logic
     */
    handlePollingError(error) {
        this.connectionStatus.failedPolls++;
        this.connectionStatus.lastError = error.message;

        console.warn('❌ Polling error:', error.message);

        // Retry logic
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff

            console.log(`🔄 Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);

            setTimeout(() => {
                this.pollMetrics();
            }, delay);

            // Notify subscribers about retry
            this.notifySubscribers('pollingRetry', {
                attempt: this.retryCount,
                maxRetries: this.maxRetries,
                delay: delay,
                error: error.message
            });
        } else {
            console.error('💥 Max retries reached, stopping polling');
            this.stop();

            // Notify subscribers about failure
            this.notifySubscribers('pollingFailed', {
                error: error.message,
                totalAttempts: this.connectionStatus.totalPolls,
                successfulAttempts: this.connectionStatus.successfulPolls
            });
        }
    }

    /**
     * Subscribe to polling events
     */
    subscribe(event, callback) {
        if (!this.subscribers[event]) {
            this.subscribers[event] = [];
        }

        this.subscribers[event].push(callback);

        // Return unsubscribe function
        return () => {
            const index = this.subscribers[event].indexOf(callback);
            if (index > -1) {
                this.subscribers[event].splice(index, 1);
            }
        };
    }

    /**
     * Notify all subscribers of an event
     */
    notifySubscribers(event, data) {
        if (this.subscribers[event]) {
            this.subscribers[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Subscriber error for event ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get current connection status
     */
    getConnectionStatus() {
        return {
            ...this.connectionStatus,
            successRate: this.connectionStatus.totalPolls > 0
                ? (this.connectionStatus.successfulPolls / this.connectionStatus.totalPolls * 100).toFixed(1)
                : 0,
            isHealthy: this.lastSuccessfulPoll && (Date.now() - this.lastSuccessfulPoll < 10000), // Last 10 seconds
            uptime: this.isPolling ? Date.now() - (this.startTime || Date.now()) : 0
        };
    }

    /**
     * Get metrics history from buffer
     */
    getMetricsHistory(count = 60) {
        return this.metricsBuffer.slice(-count);
    }

    /**
     * Force immediate poll
     */
    async forcePoll() {
        if (this.pendingRequest) {
            console.warn('Poll request already in progress');
            return;
        }

        await this.pollMetrics();
    }

    /**
     * Update WebSocket connection status
     */
    setWebSocketStatus(connected) {
        this.connectionStatus.isWebSocketConnected = connected;

        if (connected) {
            // WebSocket reconnected, we can stop polling
            if (this.isPolling) {
                console.log('🔗 WebSocket reconnected, stopping HTTP polling');
                this.stop();
                this.connectionStatus.fallbackActivated = false;
            }
        } else {
            // WebSocket disconnected, start polling if not already active
            if (!this.isPolling) {
                console.log('🔌 WebSocket disconnected, starting HTTP polling fallback');
                this.start();
            }
        }
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        const recentPolls = this.metricsBuffer.slice(-10);
        const avgRequestTime = recentPolls.length > 0
            ? recentPolls.reduce((sum, poll) => sum + (poll.polling?.requestTime || 0), 0) / recentPolls.length
            : 0;

        return {
            averageRequestTime: Math.round(avgRequestTime * 100) / 100,
            totalRequests: this.connectionStatus.totalPolls,
            successRate: parseFloat(this.getConnectionStatus().successRate),
            bufferUtilization: `${this.metricsBuffer.length}/60`,
            lastPollTime: this.lastSuccessfulPoll ? new Date(this.lastSuccessfulPoll).toISOString() : null
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.stop();
        this.subscribers = {};
        this.metricsBuffer = [];
    }
}