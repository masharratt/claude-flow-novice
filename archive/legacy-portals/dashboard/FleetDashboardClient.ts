/**
 * Fleet Dashboard Client - Reusable Dashboard Component Library
 * Provides real-time fleet monitoring with WebSocket/HTTP polling fallback
 *
 * @packageDocumentation
 */

import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';

/**
 * Dashboard configuration options
 */
export interface DashboardConfig {
  /** Server URL for WebSocket/API connections */
  serverUrl?: string;
  /** Refresh interval in milliseconds (default: 1000ms) */
  refreshInterval?: number;
  /** Connection timeout in milliseconds (default: 5000ms) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Authentication token */
  authToken?: string;
  /** Enable auto-reconnect (default: true) */
  autoReconnect?: boolean;
  /** Debug mode (default: false) */
  debug?: boolean;
}

/**
 * Fleet metrics structure
 */
export interface FleetMetrics {
  timestamp: string;
  system: SystemMetrics;
  swarms: Record<string, SwarmMetrics>;
  database?: DatabaseMetrics;
  network?: NetworkMetrics;
  alerts?: Alert[];
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    model?: string;
    loadAverage?: { '1m': number; '5m': number; '15m': number };
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
    bandwidth?: number;
  };
  heap?: {
    used: number;
    total: number;
    limit: number;
  };
  gc?: {
    lastDuration: number;
    frequency: number;
  };
}

export interface SwarmMetrics {
  name: string;
  status: 'idle' | 'active' | 'running' | 'completed' | 'failed';
  agents: number;
  tasks: number;
  uptime: number;
  progress: number;
  confidence?: number;
  objective?: string;
  startTime?: string;
  endTime?: string;
}

export interface DatabaseMetrics {
  connections: number;
  latency: number;
  cacheHitRate: number;
  ioRate: number;
}

export interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  latency: number;
  connections: number;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: Date;
  category?: string;
}

/**
 * Connection status
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'polling' | 'disconnected' | 'error';

/**
 * Fleet Dashboard Client
 * Main class for interacting with fleet monitoring infrastructure
 */
export class FleetDashboardClient extends EventEmitter {
  private config: Required<DashboardConfig>;
  private socket: Socket | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private retryCount = 0;
  private lastMetrics: FleetMetrics | null = null;
  private metricsHistory: FleetMetrics[] = [];
  private maxHistorySize = 300; // 5 minutes at 1s intervals

  constructor(config: DashboardConfig = {}) {
    super();

    this.config = {
      serverUrl: config.serverUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'),
      refreshInterval: config.refreshInterval || 1000,
      timeout: config.timeout || 5000,
      maxRetries: config.maxRetries || 3,
      authToken: config.authToken || '',
      autoReconnect: config.autoReconnect !== false,
      debug: config.debug || false
    };

    this.log('Fleet Dashboard Client initialized', this.config);
  }

  /**
   * Connect to dashboard server
   */
  async connect(): Promise<void> {
    this.log('Initiating connection...');
    this.setConnectionStatus('connecting');

    try {
      // Try WebSocket connection first
      await this.connectWebSocket();
    } catch (error) {
      this.log('WebSocket connection failed, falling back to HTTP polling', error);
      this.activatePolling();
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.log('Disconnecting...');

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.setConnectionStatus('disconnected');
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get latest metrics
   */
  getLatestMetrics(): FleetMetrics | null {
    return this.lastMetrics;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(count?: number): FleetMetrics[] {
    if (count) {
      return this.metricsHistory.slice(-count);
    }
    return [...this.metricsHistory];
  }

  /**
   * Force immediate metrics refresh
   */
  async refresh(): Promise<void> {
    if (this.socket?.connected) {
      this.socket.emit('refresh');
    } else {
      await this.pollMetrics();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DashboardConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('Configuration updated', this.config);

    // Reconnect if already connected
    if (this.connectionStatus === 'connected' || this.connectionStatus === 'polling') {
      this.disconnect();
      this.connect();
    }
  }

  // Private methods

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.config.serverUrl, {
        auth: this.config.authToken ? { token: this.config.authToken } : undefined,
        transports: ['websocket', 'polling'],
        timeout: this.config.timeout,
        reconnection: this.config.autoReconnect,
        reconnectionAttempts: this.config.maxRetries,
        reconnectionDelay: 2000
      });

      const connectionTimeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, this.config.timeout);

      this.socket.on('connect', () => {
        clearTimeout(connectionTimeout);
        this.setConnectionStatus('connected');
        this.retryCount = 0;
        this.log('WebSocket connected');
        this.emit('connected', { mode: 'websocket' });
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        this.log('WebSocket disconnected', reason);
        this.setConnectionStatus('disconnected');
        this.emit('disconnected', { reason });

        if (this.config.autoReconnect) {
          this.activatePolling();
        }
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(connectionTimeout);
        this.log('WebSocket connection error', error);
        reject(error);
      });

      this.socket.on('metrics', (data: FleetMetrics) => {
        this.handleMetrics(data);
      });

      this.socket.on('alert', (alert: Alert) => {
        this.emit('alert', alert);
      });

      this.socket.on('recommendation', (rec: any) => {
        this.emit('recommendation', rec);
      });
    });
  }

  private activatePolling(): void {
    if (this.pollingTimer) {
      return; // Already polling
    }

    this.log('Activating HTTP polling fallback');
    this.setConnectionStatus('polling');
    this.emit('pollingActivated', { interval: this.config.refreshInterval });

    // Initial poll
    this.pollMetrics();

    // Set up recurring polling
    this.pollingTimer = setInterval(() => {
      this.pollMetrics();
    }, this.config.refreshInterval);
  }

  private async pollMetrics(): Promise<void> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.serverUrl}/api/metrics`,
        {
          headers: this.config.authToken
            ? { Authorization: `Bearer ${this.config.authToken}` }
            : {}
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.handleMetrics(data);
      this.retryCount = 0;
    } catch (error) {
      this.handlePollingError(error);
    }
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleMetrics(data: FleetMetrics): void {
    this.lastMetrics = data;

    // Add to history
    this.metricsHistory.push(data);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    this.emit('metrics', data);
  }

  private handlePollingError(error: any): void {
    this.log('Polling error', error);
    this.retryCount++;

    if (this.retryCount >= this.config.maxRetries) {
      this.log('Max retries reached, stopping polling');

      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }

      this.setConnectionStatus('error');
      this.emit('error', {
        message: 'Connection failed after max retries',
        error,
        retries: this.retryCount
      });
    } else {
      this.emit('pollingRetry', {
        attempt: this.retryCount,
        maxRetries: this.config.maxRetries,
        error: error.message
      });
    }
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit('statusChange', status);
    }
  }

  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[FleetDashboard] ${message}`, ...args);
    }
  }
}

/**
 * Create a new fleet dashboard client instance
 */
export function createFleetDashboard(config?: DashboardConfig): FleetDashboardClient {
  return new FleetDashboardClient(config);
}

/**
 * Export types for consumers
 */
export type {
  DashboardConfig,
  FleetMetrics,
  SystemMetrics,
  SwarmMetrics,
  DatabaseMetrics,
  NetworkMetrics,
  Alert,
  ConnectionStatus
};
