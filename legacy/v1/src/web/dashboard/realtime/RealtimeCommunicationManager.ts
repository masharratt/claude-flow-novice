/**
 * Unified Real-time Communication Manager
 * Provides interface to switch between WebSocket, SSE, and Custom Sync methods
 */

import { NativeWebSocketManager, NativeWebSocketMessage, NativeWebSocketStatus } from './NativeWebSocketManager.js';
import { SSEManager, SSEMessage, SSEStatus } from './SSEManager.js';
import { CustomSyncManager, SyncMessage, SyncStatus } from './CustomSyncManager.js';
import { PerformanceBenchmark, BenchmarkResult, BenchmarkConfig } from './PerformanceBenchmark.js';

export type CommunicationMethod = 'websocket' | 'sse' | 'custom-sync' | 'auto';

export interface UnifiedMessage {
  type: string;
  payload: any;
  timestamp: Date;
  id?: string;
  protocol?: CommunicationMethod;
}

export interface UnifiedStatus {
  connected: boolean;
  method: CommunicationMethod;
  latency: number;
  throughput: number;
  errorRate: number;
  lastConnected?: Date;
  lastMessage?: Date;
  error?: string;
  protocolSpecific: any;
}

export interface ManagerOptions {
  defaultMethod?: CommunicationMethod;
  autoSwitch?: boolean;
  fallbackMethods?: CommunicationMethod[];
  enablePerformanceMonitoring?: boolean;
  benchmarkInterval?: number;
  connectionTimeout?: number;
  onMethodChange?: (method: CommunicationMethod) => void;
  onError?: (error: Error, method: CommunicationMethod) => void;
}

export class RealtimeCommunicationManager {
  private options: Required<ManagerOptions>;
  private currentMethod: CommunicationMethod;
  private connections: Map<CommunicationMethod, any> = new Map();
  private subscriptions: Map<string, Set<(data: any) => void>> = new Map();
  private performanceData: Map<CommunicationMethod, any[]> = new Map();
  private benchmark: PerformanceBenchmark | null = null;
  private isAutoSwitching: boolean = false;
  private lastMethodSwitch: Date = new Date();

  constructor(options: ManagerOptions = {}) {
    this.options = {
      defaultMethod: options.defaultMethod ?? 'auto',
      autoSwitch: options.autoSwitch ?? true,
      fallbackMethods: options.fallbackMethods ?? ['websocket', 'sse', 'custom-sync'],
      enablePerformanceMonitoring: options.enablePerformanceMonitoring ?? true,
      benchmarkInterval: options.benchmarkInterval ?? 300000, // 5 minutes
      connectionTimeout: options.connectionTimeout ?? 10000,
      onMethodChange: options.onMethodChange || (() => {}),
      onError: options.onError || (() => {})
    };

    this.currentMethod = this.options.defaultMethod;
    this.initializeConnections();

    if (this.options.enablePerformanceMonitoring) {
      this.startPerformanceMonitoring();
    }
  }

  /**
   * Initialize all connection methods
   */
  private async initializeConnections(): Promise<void> {
    console.log('Initializing real-time communication methods...');

    try {
      // Initialize WebSocket
      this.connections.set('websocket', new NativeWebSocketManager({
        url: `ws://${window.location.host}/ws`,
        autoConnect: false,
        onConnect: () => this.handleMethodConnect('websocket'),
        onDisconnect: () => this.handleMethodDisconnect('websocket'),
        onError: (error) => this.handleMethodError('websocket', error),
        onMessage: (message) => this.handleMessage('websocket', message)
      }));

      // Initialize SSE
      this.connections.set('sse', new SSEManager({
        url: `${window.location.origin}/api/events`,
        autoConnect: false,
        onConnect: () => this.handleMethodConnect('sse'),
        onDisconnect: () => this.handleMethodDisconnect('sse'),
        onError: (error) => this.handleMethodError('sse', error),
        onMessage: (message) => this.handleMessage('sse', message)
      }));

      // Initialize Custom Sync
      this.connections.set('custom-sync', new CustomSyncManager({
        url: `${window.location.origin}/api/sync`,
        autoConnect: false,
        onConnect: () => this.handleMethodConnect('custom-sync'),
        onDisconnect: () => this.handleMethodDisconnect('custom-sync'),
        onError: (error) => this.handleMethodError('custom-sync', error),
        onSync: (data) => this.handleMessage('custom-sync', { type: 'sync', data })
      }));

      // Connect to default method
      await this.connect();

    } catch (error) {
      console.error('Failed to initialize connections:', error);
      this.options.onError(error instanceof Error ? error : new Error('Initialization failed'), this.currentMethod);
    }
  }

  /**
   * Connect to the current or specified method
   */
  async connect(method?: CommunicationMethod): Promise<void> {
    const targetMethod = method || this.currentMethod;

    if (targetMethod === 'auto') {
      await this.connectWithBestMethod();
      return;
    }

    console.log(`Connecting using ${targetMethod}...`);

    try {
      // Disconnect current method if different
      if (this.currentMethod !== targetMethod && this.currentMethod !== 'auto') {
        await this.disconnect();
      }

      const connection = this.connections.get(targetMethod);
      if (!connection) {
        throw new Error(`Connection method ${targetMethod} not initialized`);
      }

      await connection.connect();
      this.currentMethod = targetMethod;
      this.options.onMethodChange(targetMethod);

      console.log(`Successfully connected using ${targetMethod}`);

    } catch (error) {
      console.error(`Failed to connect with ${targetMethod}:`, error);

      if (this.options.autoSwitch && targetMethod !== 'auto') {
        await this.tryFallbackMethods(targetMethod);
      } else {
        this.options.onError(error instanceof Error ? error : new Error('Connection failed'), targetMethod);
      }
    }
  }

  /**
   * Connect with the best available method
   */
  private async connectWithBestMethod(): Promise<void> {
    console.log('Finding best connection method...');

    for (const method of this.options.fallbackMethods) {
      try {
        console.log(`Trying ${method}...`);
        await this.connect(method);
        return;
      } catch (error) {
        console.warn(`${method} failed:`, error);
      }
    }

    throw new Error('All connection methods failed');
  }

  /**
   * Try fallback methods when primary fails
   */
  private async tryFallbackMethods(failedMethod: CommunicationMethod): Promise<void> {
    if (this.isAutoSwitching) return; // Prevent infinite loops

    this.isAutoSwitching = true;

    for (const method of this.options.fallbackMethods) {
      if (method === failedMethod) continue;

      try {
        console.log(`Falling back to ${method}...`);
        await this.connect(method);
        this.isAutoSwitching = false;
        return;
      } catch (error) {
        console.warn(`Fallback to ${method} failed:`, error);
      }
    }

    this.isAutoSwitching = false;
    throw new Error(`All fallback methods failed after ${failedMethod} failure`);
  }

  /**
   * Disconnect from current method
   */
  async disconnect(): Promise<void> {
    console.log(`Disconnecting from ${this.currentMethod}...`);

    const connection = this.connections.get(this.currentMethod);
    if (connection && connection.disconnect) {
      connection.disconnect();
    }

    this.currentMethod = 'auto';
  }

  /**
   * Send a message using the current method
   */
  sendMessage(type: string, payload: any, options?: { method?: CommunicationMethod, priority?: number }): boolean {
    const method = options?.method || this.currentMethod;

    if (method === 'auto') {
      console.warn('Cannot send message with auto method - please specify a method');
      return false;
    }

    const connection = this.connections.get(method);
    if (!connection) {
      console.error(`Connection method ${method} not available`);
      return false;
    }

    try {
      switch (method) {
        case 'websocket':
          return connection.sendMessage(type, payload);
        case 'sse':
          console.warn('SSE is unidirectional - cannot send messages');
          return false;
        case 'custom-sync':
          connection.sendMessage(type, payload);
          return true;
        default:
          return false;
      }
    } catch (error) {
      console.error(`Failed to send message via ${method}:`, error);
      return false;
    }
  }

  /**
   * Subscribe to message types
   */
  subscribe(eventType: string, callback: (data: any) => void): () => void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(callback);

    // Also subscribe to all active connections
    this.connections.forEach((connection, method) => {
      if (connection.subscribe) {
        connection.subscribe(eventType, callback);
      }
    });

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(eventType);
        }
      }

      // Unsubscribe from all connections
      this.connections.forEach((connection) => {
        if (connection.unsubscribe) {
          connection.unsubscribe(eventType, callback);
        }
      });
    };
  }

  /**
   * Get current connection status
   */
  getStatus(): UnifiedStatus {
    const connection = this.connections.get(this.currentMethod);
    const protocolStatus = connection?.getStatus ? connection.getStatus() : null;

    return {
      connected: protocolStatus?.connected ?? false,
      method: this.currentMethod,
      latency: protocolStatus?.latency ?? 0,
      throughput: protocolStatus?.dataRate ?? 0,
      errorRate: this.calculateErrorRate(),
      lastConnected: protocolStatus?.lastConnected,
      lastMessage: protocolStatus?.lastMessage,
      error: protocolStatus?.error,
      protocolSpecific: protocolStatus
    };
  }

  /**
   * Get all available connection statuses
   */
  getAllStatuses(): Map<CommunicationMethod, any> {
    const statuses = new Map();

    this.connections.forEach((connection, method) => {
      if (connection.getStatus) {
        statuses.set(method, connection.getStatus());
      }
    });

    return statuses;
  }

  /**
   * Switch to a different communication method
   */
  async switchMethod(newMethod: CommunicationMethod): Promise<void> {
    if (newMethod === this.currentMethod) {
      return;
    }

    const timeSinceLastSwitch = Date.now() - this.lastMethodSwitch.getTime();
    if (timeSinceLastSwitch < 5000) { // 5 second cooldown
      console.warn('Method switching too frequently - please wait');
      return;
    }

    console.log(`Switching from ${this.currentMethod} to ${newMethod}...`);

    try {
      await this.disconnect();
      await this.connect(newMethod);
      this.lastMethodSwitch = new Date();
    } catch (error) {
      console.error(`Failed to switch to ${newMethod}:`, error);
      this.options.onError(error instanceof Error ? error : new Error('Method switch failed'), newMethod);
    }
  }

  /**
   * Run performance benchmark
   */
  async runBenchmark(config?: Partial<BenchmarkConfig>): Promise<BenchmarkResult> {
    if (!this.benchmark) {
      this.benchmark = new PerformanceBenchmark(config);
    }

    const result = await this.benchmark.runBenchmarkSuite();
    this.updatePerformanceData(result);

    return result;
  }

  /**
   * Get performance comparison
   */
  getPerformanceComparison(): any {
    const comparison: any = {};

    this.performanceData.forEach((data, method) => {
      if (data.length > 0) {
        const latest = data[data.length - 1];
        comparison[method] = {
          averageLatency: latest.results.reduce((sum: number, r: any) => sum + r.averageLatency, 0) / latest.results.length,
          averageThroughput: latest.results.reduce((sum: number, r: any) => sum + r.throughput, 0) / latest.results.length,
          reliability: latest.results.reduce((sum: number, r: any) => sum + r.reliability, 0) / latest.results.length,
          lastTest: latest.timestamp
        };
      }
    });

    return comparison;
  }

  /**
   * Get connection statistics
   */
  getStatistics(): any {
    const stats: any = {
      currentMethod: this.currentMethod,
      connectedSubscriptions: this.subscriptions.size,
      autoSwitching: this.isAutoSwitching,
      lastMethodSwitch: this.lastMethodSwitch,
      uptime: Date.now() - this.lastMethodSwitch.getTime()
    };

    // Add method-specific stats
    this.connections.forEach((connection, method) => {
      if (connection.getStats) {
        stats[`${method}Stats`] = connection.getStats();
      }
    });

    return stats;
  }

  /**
   * Handle method connection
   */
  private handleMethodConnect(method: CommunicationMethod): void {
    console.log(`${method} connected`);
    this.recordPerformanceEvent(method, 'connect');
  }

  /**
   * Handle method disconnection
   */
  private handleMethodDisconnect(method: CommunicationMethod): void {
    console.log(`${method} disconnected`);
    this.recordPerformanceEvent(method, 'disconnect');

    // Auto-switch if this was the active method
    if (method === this.currentMethod && this.options.autoSwitch && !this.isAutoSwitching) {
      this.tryFallbackMethods(method);
    }
  }

  /**
   * Handle method error
   */
  private handleMethodError(method: CommunicationMethod, error: any): void {
    console.error(`${method} error:`, error);
    this.recordPerformanceEvent(method, 'error');
    this.options.onError(error instanceof Error ? error : new Error('Method error'), method);
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(method: CommunicationMethod, message: any): void {
    const unifiedMessage: UnifiedMessage = {
      type: message.type || message.event,
      payload: message.data || message.payload,
      timestamp: message.timestamp || new Date(),
      id: message.id,
      protocol: method
    };

    // Notify subscribers
    const callbacks = this.subscriptions.get(unifiedMessage.type);
    if (callbacks) {
      callbacks.forEach(callback => callback(unifiedMessage.payload));
    }

    // Record performance metrics
    this.recordPerformanceEvent(method, 'message', unifiedMessage);
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    if (this.options.benchmarkInterval > 0) {
      setInterval(async () => {
        if (this.options.enablePerformanceMonitoring) {
          try {
            await this.runBenchmark({
              duration: 10000, // Short benchmark for monitoring
              messageFrequency: 10,
              testScenarios: ['latency', 'throughput']
            });
          } catch (error) {
            console.error('Performance monitoring failed:', error);
          }
        }
      }, this.options.benchmarkInterval);
    }
  }

  /**
   * Record performance event
   */
  private recordPerformanceEvent(method: CommunicationMethod, eventType: string, data?: any): void {
    if (!this.performanceData.has(method)) {
      this.performanceData.set(method, []);
    }

    const events = this.performanceData.get(method)!;
    events.push({
      timestamp: new Date(),
      eventType,
      data
    });

    // Keep only last 100 events per method
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
  }

  /**
   * Update performance data from benchmark results
   */
  private updatePerformanceData(result: BenchmarkResult): void {
    result.results.forEach(metrics => {
      if (!this.performanceData.has(metrics.protocol)) {
        this.performanceData.set(metrics.protocol, []);
      }

      this.performanceData.get(metrics.protocol)!.push({
        timestamp: result.timestamp,
        type: 'benchmark',
        metrics
      });
    });
  }

  /**
   * Calculate error rate
   */
  private calculateErrorRate(): number {
    // Simple implementation - could be enhanced with actual error tracking
    return 0;
  }

  /**
   * Get recommended method based on performance
   */
  getRecommendedMethod(): CommunicationMethod {
    const comparison = this.getPerformanceComparison();

    if (!Object.keys(comparison).length) {
      return this.options.fallbackMethods[0];
    }

    // Find method with best latency
    let bestMethod = this.options.fallbackMethods[0];
    let bestLatency = Infinity;

    for (const [method, data] of Object.entries(comparison)) {
      if (data.averageLatency < bestLatency) {
        bestLatency = data.averageLatency;
        bestMethod = method as CommunicationMethod;
      }
    }

    return bestMethod;
  }

  /**
   * Export configuration and statistics
   */
  exportData(): any {
    return {
      configuration: this.options,
      currentStatus: this.getStatus(),
      allStatuses: Object.fromEntries(this.getAllStatuses()),
      performanceComparison: this.getPerformanceComparison(),
      statistics: this.getStatistics(),
      recommendations: {
        bestMethod: this.getRecommendedMethod(),
        autoSwitching: this.options.autoSwitch
      }
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    console.log('Cleaning up RealtimeCommunicationManager...');

    // Disconnect all connections
    this.connections.forEach((connection) => {
      if (connection.disconnect) {
        connection.disconnect();
      }
    });

    // Clear data
    this.subscriptions.clear();
    this.performanceData.clear();

    if (this.benchmark) {
      this.benchmark = null;
    }
  }
}

export default RealtimeCommunicationManager;