/**
 * Custom Real-time Data Synchronization Manager
 * Implements custom polling and data synchronization without WebSocket/SSE
 */

export interface SyncMessage {
  type: string;
  timestamp: Date;
  payload: any;
  id?: string;
  checksum?: string;
}

export interface SyncStatus {
  connected: boolean;
  lastSync: Date;
  error?: string;
  syncInterval: number;
  pendingRequests: number;
  dataFreshness: number; // seconds since last successful sync
  protocol: string;
  bandwidthUsage: number; // bytes per second
}

export interface SyncOptions {
  url?: string;
  syncInterval?: number;
  batchSize?: number;
  enableCompression?: boolean;
  enableDeltaSync?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  headers?: Record<string, string>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onSync?: (data: any) => void;
  onDeltaSync?: (delta: any) => void;
}

export interface DataSnapshot {
  timestamp: Date;
  data: any;
  checksum: string;
  version: number;
}

export class CustomSyncManager {
  private options: Required<SyncOptions>;
  private status: SyncStatus;
  private syncInterval: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, AbortController> = new Map();
  private subscriptions: Map<string, Set<(data: any) => void>> = new Map();
  private lastSnapshot: DataSnapshot | null = null;
  private bandwidthCounter: number = 0;
  private lastBandwidthReset: number = Date.now();
  private requestQueue: SyncMessage[] = [];
  private isProcessingQueue: boolean = false;

  constructor(options: SyncOptions = {}) {
    this.options = {
      url: options.url || `${window.location.origin}/api/sync`,
      syncInterval: options.syncInterval ?? 1000, // 1 second default
      batchSize: options.batchSize ?? 100,
      enableCompression: options.enableCompression ?? true,
      enableDeltaSync: options.enableDeltaSync ?? true,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 5000,
      headers: options.headers || {},
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError: options.onError || (() => {}),
      onSync: options.onSync || (() => {}),
      onDeltaSync: options.onDeltaSync || (() => {})
    };

    this.status = {
      connected: false,
      lastSync: new Date(0),
      syncInterval: this.options.syncInterval,
      pendingRequests: 0,
      dataFreshness: 0,
      protocol: 'custom-sync'
    };

    // Start syncing
    this.startSyncing();
  }

  /**
   * Start the synchronization process
   */
  startSyncing(): void {
    console.log('Starting custom data synchronization');

    // Initial sync
    this.performSync();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.performSync();
    }, this.options.syncInterval);

    this.status.connected = true;
    this.options.onConnect();
  }

  /**
   * Stop synchronization
   */
  stopSyncing(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Cancel all pending requests
    this.pendingRequests.forEach(controller => {
      controller.abort();
    });
    this.pendingRequests.clear();

    this.status.connected = false;
    this.options.onDisconnect();
  }

  /**
   * Perform data synchronization
   */
  async performSync(): Promise<void> {
    if (this.isProcessingQueue) {
      return; // Skip if already processing
    }

    this.isProcessingQueue = true;

    try {
      // Prepare sync request
      const syncData = {
        lastSync: this.lastSnapshot?.timestamp.toISOString(),
        version: this.lastSnapshot?.version || 0,
        enableDelta: this.options.enableDeltaSync && this.lastSnapshot !== null,
        batchSize: this.options.batchSize,
        checksum: this.lastSnapshot?.checksum
      };

      const requestId = this.generateRequestId();
      const controller = new AbortController();
      this.pendingRequests.set(requestId, controller);

      const response = await fetch(this.options.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Request-ID': requestId,
          'X-Client-Version': '1.0.0',
          ...this.options.headers
        },
        body: JSON.stringify(syncData),
        signal: controller.signal,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const dataSize = JSON.stringify(data).length;
      this.updateBandwidthUsage(dataSize);

      // Process the response
      await this.processSyncResponse(data);

      // Update status
      this.status.lastSync = new Date();
      this.status.dataFreshness = 0;
      this.status.error = undefined;

      // Process queued requests
      await this.processRequestQueue();

    } catch (error) {
      console.error('Sync failed:', error);
      this.status.error = error instanceof Error ? error.message : 'Unknown error';
      this.options.onError(error instanceof Error ? error : new Error('Sync failed'));

      // Retry logic
      if (this.status.pendingRequests < this.options.maxRetries) {
        setTimeout(() => {
          this.performSync();
        }, this.options.retryDelay);
      }
    } finally {
      this.pendingRequests.delete(requestId);
      this.status.pendingRequests = this.pendingRequests.size;
      this.isProcessingQueue = false;
    }
  }

  /**
   * Process sync response
   */
  private async processSyncResponse(data: any): Promise<void> {
    if (!data) return;

    const { type, payload, timestamp, checksum, version } = data;

    switch (type) {
      case 'full_sync':
        // Full data refresh
        await this.handleFullSync(payload, checksum, version, timestamp);
        break;

      case 'delta_sync':
        // Incremental updates
        await this.handleDeltaSync(payload, checksum, version, timestamp);
        break;

      case 'heartbeat':
        // Connection health check
        this.handleHeartbeat();
        break;

      case 'error':
        // Server-side error
        throw new Error(payload.message || 'Server error during sync');

      default:
        console.warn('Unknown sync response type:', type);
    }
  }

  /**
   * Handle full sync response
   */
  private async handleFullSync(payload: any, checksum: string, version: number, timestamp: string): Promise<void> {
    const snapshot: DataSnapshot = {
      timestamp: new Date(timestamp),
      data: payload,
      checksum,
      version
    };

    this.lastSnapshot = snapshot;

    // Notify all subscribers
    this.broadcastData('full_sync', payload);

    // Custom sync handler
    this.options.onSync(payload);
  }

  /**
   * Handle delta sync response
   */
  private async handleDeltaSync(payload: any, checksum: string, version: number, timestamp: string): Promise<void> {
    if (!this.lastSnapshot) {
      // If no previous snapshot, fall back to full sync
      return this.performFullSyncFallback();
    }

    // Apply delta to existing data
    const updatedData = this.applyDelta(this.lastSnapshot.data, payload);

    const snapshot: DataSnapshot = {
      timestamp: new Date(timestamp),
      data: updatedData,
      checksum,
      version
    };

    this.lastSnapshot = snapshot;

    // Notify subscribers about delta
    this.broadcastData('delta_sync', payload);
    this.options.onDeltaSync(payload);
  }

  /**
   * Handle heartbeat response
   */
  private handleHeartbeat(): void {
    this.status.lastSync = new Date();
    this.status.dataFreshness = 0;

    // Broadcast heartbeat to subscribers
    this.broadcastData('heartbeat', { timestamp: new Date() });
  }

  /**
   * Apply delta changes to existing data
   */
  private applyDelta(existingData: any, delta: any): any {
    if (!delta || !existingData) return existingData;

    // Simple delta implementation - can be enhanced
    if (delta.operations && Array.isArray(delta.operations)) {
      let result = { ...existingData };

      for (const operation of delta.operations) {
        switch (operation.type) {
          case 'update':
            result = this.deepMerge(result, operation.data);
            break;
          case 'delete':
            result = this.deepDelete(result, operation.path);
            break;
          case 'add':
            result = this.deepAdd(result, operation.path, operation.data);
            break;
        }
      }

      return result;
    }

    // Fallback: just merge delta with existing data
    return this.deepMerge(existingData, delta);
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    if (!target) return source;

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Deep delete property by path
   */
  private deepDelete(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) return obj;
      current = current[keys[i]];
    }

    delete current[keys[keys.length - 1]];
    return obj;
  }

  /**
   * Deep add property by path
   */
  private deepAdd(obj: any, path: string, value: any): any {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    return obj;
  }

  /**
   * Fallback to full sync
   */
  private async performFullSyncFallback(): Promise<void> {
    try {
      const response = await fetch(`${this.options.url}/full`, {
        method: 'GET',
        headers: this.options.headers,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      await this.handleFullSync(data.payload, data.checksum, data.version, data.timestamp);
    } catch (error) {
      console.error('Full sync fallback failed:', error);
      throw error;
    }
  }

  /**
   * Broadcast data to all subscribers
   */
  private broadcastData(eventType: string, data: any): void {
    const callbacks = this.subscriptions.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }

    // Also broadcast to wildcard subscribers
    const wildcardCallbacks = this.subscriptions.get('*');
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach(callback => callback({ type: eventType, data }));
    }
  }

  /**
   * Subscribe to data updates
   */
  subscribe(eventType: string, callback: (data: any) => void): () => void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(callback);

    return () => {
      const callbacks = this.subscriptions.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(eventType);
        }
      }
    };
  }

  /**
   * Send a message to server (queued for next sync)
   */
  sendMessage(type: string, payload: any): string {
    const message: SyncMessage = {
      type,
      timestamp: new Date(),
      payload,
      id: this.generateRequestId()
    };

    this.requestQueue.push(message);
    return message.id;
  }

  /**
   * Process queued requests
   */
  private async processRequestQueue(): Promise<void> {
    if (this.requestQueue.length === 0) return;

    const batch = this.requestQueue.splice(0, this.options.batchSize);

    try {
      const response = await fetch(`${this.options.url}/queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers
        },
        body: JSON.stringify({ messages: batch }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to process queue: HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('Processed queue batch:', result);

    } catch (error) {
      console.error('Failed to process request queue:', error);
      // Re-queue failed messages
      this.requestQueue.unshift(...batch);
    }
  }

  /**
   * Update bandwidth usage
   */
  private updateBandwidthUsage(bytes: number): void {
    const now = Date.now();
    const timeDiff = (now - this.lastBandwidthReset) / 1000; // seconds

    this.bandwidthCounter += bytes;

    if (timeDiff >= 1) {
      this.status.bandwidthUsage = this.bandwidthCounter / timeDiff;
      this.bandwidthCounter = 0;
      this.lastBandwidthReset = now;
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current status
   */
  getStatus(): SyncStatus {
    // Update data freshness
    const now = Date.now();
    this.status.dataFreshness = (now - this.status.lastSync.getTime()) / 1000;

    return { ...this.status };
  }

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<void> {
    await this.performSync();
  }

  /**
   * Get current data snapshot
   */
  getCurrentSnapshot(): DataSnapshot | null {
    return this.lastSnapshot ? { ...this.lastSnapshot } : null;
  }

  /**
   * Get sync statistics
   */
  getStats() {
    return {
      status: this.getStatus(),
      subscriptions: Array.from(this.subscriptions.keys()),
      queuedRequests: this.requestQueue.length,
      lastSnapshot: this.lastSnapshot,
      bandwidthUsage: this.status.bandwidthUsage
    };
  }

  /**
   * Clear all data and reset
   */
  reset(): void {
    this.lastSnapshot = null;
    this.requestQueue = [];
    this.status.lastSync = new Date(0);
    this.status.dataFreshness = 0;
  }
}

export default CustomSyncManager;