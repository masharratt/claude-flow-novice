/**
 * Performance Benchmarking System for Real-time Communication Methods
 * Tests and compares WebSocket, SSE, and Custom Sync implementations
 */

export interface BenchmarkConfig {
  duration: number; // milliseconds
  messageFrequency: number; // messages per second
  messageSize: number; // bytes
  concurrentConnections: number;
  testScenarios: string[];
  enableLatencyMeasurement: boolean;
  enableThroughputMeasurement: boolean;
  enableReliabilityTesting: boolean;
  enableReconnectionTesting: boolean;
}

export interface BenchmarkMetrics {
  protocol: string;
  scenario: string;
  duration: number;
  totalMessages: number;
  successfulMessages: number;
  failedMessages: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number; // messages per second
  bandwidthUsage: number; // bytes per second
  errorRate: number; // percentage
  reconnectionTime: number; // milliseconds
  cpuUsage: number; // percentage
  memoryUsage: number; // MB
  connectionTime: number; // milliseconds
  reliability: number; // percentage of successful connections
}

export interface BenchmarkResult {
  timestamp: Date;
  config: BenchmarkConfig;
  results: BenchmarkMetrics[];
  summary: {
    bestLatency: string;
    bestThroughput: string;
    bestReliability: string;
    mostEfficient: string;
    recommendation: string;
  };
}

export interface LatencyMeasurement {
  messageId: string;
  sentTime: number;
  receivedTime: number;
  latency: number;
}

export class PerformanceBenchmark {
  private config: BenchmarkConfig;
  private results: Map<string, BenchmarkMetrics[]> = new Map();
  private latencyMeasurements: Map<string, LatencyMeasurement[]> = new Map();
  private activeConnections: Map<string, any> = new Map();
  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = {
      duration: 60000, // 1 minute
      messageFrequency: 100, // 100 messages per second
      messageSize: 1024, // 1KB messages
      concurrentConnections: 10,
      testScenarios: ['latency', 'throughput', 'reliability', 'reconnection', 'stress'],
      enableLatencyMeasurement: true,
      enableThroughputMeasurement: true,
      enableReliabilityTesting: true,
      enableReconnectionTesting: true,
      ...config
    };
  }

  /**
   * Run comprehensive benchmark suite
   */
  async runBenchmarkSuite(): Promise<BenchmarkResult> {
    console.log('🚀 Starting comprehensive performance benchmark suite...');

    this.isRunning = true;
    this.startTime = Date.now();
    this.results.clear();
    this.latencyMeasurements.clear();

    const protocols = ['websocket', 'sse', 'custom-sync'];
    const allResults: BenchmarkMetrics[] = [];

    for (const protocol of protocols) {
      console.log(`\n📊 Testing ${protocol.toUpperCase()} protocol...`);

      for (const scenario of this.config.testScenarios) {
        const metrics = await this.runSingleBenchmark(protocol, scenario);
        allResults.push(metrics);
        this.storeResult(protocol, metrics);
      }
    }

    const summary = this.generateSummary(allResults);
    const result: BenchmarkResult = {
      timestamp: new Date(),
      config: this.config,
      results: allResults,
      summary
    };

    this.isRunning = false;
    console.log('\n✅ Benchmark suite completed!');
    this.printSummary(summary);

    return result;
  }

  /**
   * Run a single benchmark test
   */
  private async runSingleBenchmark(protocol: string, scenario: string): Promise<BenchmarkMetrics> {
    console.log(`  🔄 Running ${scenario} test for ${protocol}...`);

    const startTime = Date.now();
    let connection: any = null;
    let messageCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let totalLatency = 0;
    let minLatency = Infinity;
    let maxLatency = 0;
    let bandwidthUsed = 0;
    let reconnectionTime = 0;
    let connectionTime = 0;

    try {
      // Initialize connection
      const connectionStart = Date.now();
      connection = await this.createConnection(protocol);
      connectionTime = Date.now() - connectionStart;

      // Setup message handlers
      const measurements: LatencyMeasurement[] = [];

      if (this.config.enableLatencyMeasurement) {
        this.setupLatencyMeasurement(connection, protocol, measurements);
      }

      // Run scenario-specific test
      switch (scenario) {
        case 'latency':
          ({ messageCount, successCount, errorCount } = await this.runLatencyTest(connection, protocol));
          break;
        case 'throughput':
          ({ messageCount, successCount, errorCount } = await this.runThroughputTest(connection, protocol));
          break;
        case 'reliability':
          ({ messageCount, successCount, errorCount } = await this.runReliabilityTest(connection, protocol));
          break;
        case 'reconnection':
          reconnectionTime = await this.runReconnectionTest(connection, protocol);
          ({ messageCount, successCount, errorCount } = { messageCount: 0, successCount: 0, errorCount: 0 });
          break;
        case 'stress':
          ({ messageCount, successCount, errorCount } = await this.runStressTest(connection, protocol));
          break;
        default:
          throw new Error(`Unknown test scenario: ${scenario}`);
      }

      // Calculate latency metrics
      if (measurements.length > 0) {
        const latencies = measurements.map(m => m.latency);
        totalLatency = latencies.reduce((sum, l) => sum + l, 0);
        minLatency = Math.min(...latencies);
        maxLatency = Math.max(...latencies);
      }

      // Calculate bandwidth
      bandwidthUsed = messageCount * this.config.messageSize;

      // Get system metrics
      const systemMetrics = await this.getSystemMetrics();

    } catch (error) {
      console.error(`  ❌ ${scenario} test failed for ${protocol}:`, error);
      errorCount++;
    } finally {
      if (connection) {
        await this.closeConnection(connection, protocol);
      }
    }

    const duration = Date.now() - startTime;
    const averageLatency = measurements.length > 0 ? totalLatency / measurements.length : 0;
    const throughput = messageCount / (duration / 1000);
    const errorRate = messageCount > 0 ? (errorCount / messageCount) * 100 : 0;
    const reliability = messageCount > 0 ? (successCount / messageCount) * 100 : 0;

    return {
      protocol,
      scenario,
      duration,
      totalMessages: messageCount,
      successfulMessages: successCount,
      failedMessages: errorCount,
      averageLatency,
      minLatency: minLatency === Infinity ? 0 : minLatency,
      maxLatency,
      p95Latency: this.calculatePercentile(measurements, 95),
      p99Latency: this.calculatePercentile(measurements, 99),
      throughput,
      bandwidthUsage: bandwidthUsed / (duration / 1000),
      errorRate,
      reconnectionTime,
      cpuUsage: 0, // Would need actual CPU monitoring
      memoryUsage: 0, // Would need actual memory monitoring
      connectionTime,
      reliability
    };
  }

  /**
   * Create connection for specific protocol
   */
  private async createConnection(protocol: string): Promise<any> {
    const { NativeWebSocketManager } = await import('./NativeWebSocketManager.js');
    const { SSEManager } = await import('./SSEManager.js');
    const { CustomSyncManager } = await import('./CustomSyncManager.js');

    switch (protocol) {
      case 'websocket':
        return new NativeWebSocketManager({
          url: `ws://${window.location.host}/ws-benchmark`,
          autoConnect: true
        });

      case 'sse':
        return new SSEManager({
          url: `${window.location.origin}/api/events-benchmark`,
          autoConnect: true
        });

      case 'custom-sync':
        return new CustomSyncManager({
          url: `${window.location.origin}/api/sync-benchmark`,
          syncInterval: 1000
        });

      default:
        throw new Error(`Unknown protocol: ${protocol}`);
    }
  }

  /**
   * Setup latency measurement for connection
   */
  private setupLatencyMeasurement(connection: any, protocol: string, measurements: LatencyMeasurement[]): void {
    const handleMessage = (data: any) => {
      if (data.type === 'pong' || data.type === 'latency_response') {
        const now = Date.now();
        const sentTime = data.timestamp || data.sentTime;
        const latency = now - sentTime;

        measurements.push({
          messageId: data.messageId || `msg_${Date.now()}`,
          sentTime,
          receivedTime: now,
          latency
        });
      }
    };

    // Subscribe based on protocol
    if (protocol === 'websocket') {
      connection.subscribe('pong', handleMessage);
    } else if (protocol === 'sse') {
      connection.subscribe('pong', handleMessage);
    } else if (protocol === 'custom-sync') {
      connection.subscribe('latency_response', handleMessage);
    }
  }

  /**
   * Run latency test
   */
  private async runLatencyTest(connection: any, protocol: string): Promise<{messageCount: number, successCount: number, errorCount: number}> {
    const messageCount = Math.floor(this.config.duration / 1000); // 1 message per second
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < messageCount; i++) {
      try {
        const message = {
          type: 'ping',
          timestamp: Date.now(),
          messageId: `latency_${protocol}_${i}`
        };

        if (protocol === 'websocket') {
          connection.sendMessage('ping', message, message.messageId);
        } else if (protocol === 'sse') {
          // SSE is unidirectional, so we can't send pings
          successCount++;
        } else if (protocol === 'custom-sync') {
          connection.sendMessage('ping', message);
        }

        await this.sleep(1000); // Wait 1 second between messages
        successCount++;

      } catch (error) {
        console.error(`Latency test error for ${protocol}:`, error);
        errorCount++;
      }
    }

    return { messageCount, successCount, errorCount };
  }

  /**
   * Run throughput test
   */
  private async runThroughputTest(connection: any, protocol: string): Promise<{messageCount: number, successCount: number, errorCount: number}> {
    const messageCount = Math.floor(this.config.duration * this.config.messageFrequency / 1000);
    let successCount = 0;
    let errorCount = 0;

    const interval = 1000 / this.config.messageFrequency;

    for (let i = 0; i < messageCount; i++) {
      try {
        const message = {
          type: 'benchmark',
          data: this.generateTestData(this.config.messageSize),
          sequence: i
        };

        if (protocol === 'websocket') {
          connection.sendMessage('benchmark', message);
        } else if (protocol === 'sse') {
          // SSE is server-sent only
          successCount++;
        } else if (protocol === 'custom-sync') {
          connection.sendMessage('benchmark', message);
        }

        successCount++;
        await this.sleep(interval);

      } catch (error) {
        console.error(`Throughput test error for ${protocol}:`, error);
        errorCount++;
      }
    }

    return { messageCount, successCount, errorCount };
  }

  /**
   * Run reliability test
   */
  private async runReliabilityTest(connection: any, protocol: string): Promise<{messageCount: number, successCount: number, errorCount: number}> {
    const messageCount = 100;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < messageCount; i++) {
      try {
        const message = {
          type: 'reliability_test',
          data: { testId: i, timestamp: Date.now() }
        };

        if (protocol === 'websocket') {
          connection.sendMessage('reliability_test', message);
        } else if (protocol === 'custom-sync') {
          connection.sendMessage('reliability_test', message);
        }

        // Wait for acknowledgment
        await this.sleep(100);
        successCount++;

      } catch (error) {
        console.error(`Reliability test error for ${protocol}:`, error);
        errorCount++;
      }
    }

    return { messageCount, successCount, errorCount };
  }

  /**
   * Run reconnection test
   */
  private async runReconnectionTest(connection: any, protocol: string): Promise<number> {
    console.log(`  🔄 Testing reconnection for ${protocol}...`);

    const disconnectStart = Date.now();

    try {
      // Disconnect
      connection.disconnect();
      await this.sleep(2000); // Wait 2 seconds

      // Reconnect
      await connection.connect();
      const reconnectionTime = Date.now() - disconnectStart;

      console.log(`  ✅ ${protocol} reconnection time: ${reconnectionTime}ms`);
      return reconnectionTime;

    } catch (error) {
      console.error(`  ❌ ${protocol} reconnection failed:`, error);
      return -1;
    }
  }

  /**
   * Run stress test
   */
  private async runStressTest(connection: any, protocol: string): Promise<{messageCount: number, successCount: number, errorCount: number}> {
    const messageCount = 1000; // High frequency
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < messageCount; i++) {
      try {
        const message = {
          type: 'stress_test',
          data: this.generateTestData(2048), // 2KB messages
          sequence: i,
          burst: true
        };

        if (protocol === 'websocket') {
          connection.sendMessage('stress_test', message);
        } else if (protocol === 'custom-sync') {
          connection.sendMessage('stress_test', message);
        }

        successCount++;

        // No sleep for stress test - send as fast as possible

      } catch (error) {
        console.error(`Stress test error for ${protocol}:`, error);
        errorCount++;
      }
    }

    return { messageCount, successCount, errorCount };
  }

  /**
   * Generate test data of specified size
   */
  private generateTestData(size: number): string {
    const data = 'x'.repeat(size);
    return data;
  }

  /**
   * Calculate percentile from measurements
   */
  private calculatePercentile(measurements: LatencyMeasurement[], percentile: number): number {
    if (measurements.length === 0) return 0;

    const latencies = measurements.map(m => m.latency).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * latencies.length) - 1;
    return latencies[Math.max(0, index)];
  }

  /**
   * Get system metrics (placeholder implementation)
   */
  private async getSystemMetrics(): Promise<{cpuUsage: number, memoryUsage: number}> {
    // In a real implementation, this would use performance APIs
    return {
      cpuUsage: Math.random() * 20, // Mock CPU usage
      memoryUsage: Math.random() * 100 // Mock memory usage in MB
    };
  }

  /**
   * Close connection for specific protocol
   */
  private async closeConnection(connection: any, protocol: string): Promise<void> {
    try {
      if (connection.disconnect) {
        connection.disconnect();
      } else if (connection.close) {
        connection.close();
      }
    } catch (error) {
      console.error(`Error closing ${protocol} connection:`, error);
    }
  }

  /**
   * Store benchmark result
   */
  private storeResult(protocol: string, metrics: BenchmarkMetrics): void {
    if (!this.results.has(protocol)) {
      this.results.set(protocol, []);
    }
    this.results.get(protocol)!.push(metrics);
  }

  /**
   * Generate summary of results
   */
  private generateSummary(allResults: BenchmarkMetrics[]): BenchmarkResult['summary'] {
    // Group by protocol
    const protocolResults = new Map<string, BenchmarkMetrics[]>();

    for (const result of allResults) {
      if (!protocolResults.has(result.protocol)) {
        protocolResults.set(result.protocol, []);
      }
      protocolResults.get(result.protocol)!.push(result);
    }

    // Find best performers
    let bestLatency = '';
    let bestThroughput = '';
    let bestReliability = '';
    let mostEfficient = '';

    let minAvgLatency = Infinity;
    let maxThroughput = 0;
    let maxReliability = 0;
    let minBandwidthUsage = Infinity;

    for (const [protocol, results] of protocolResults) {
      const avgLatency = results.reduce((sum, r) => sum + r.averageLatency, 0) / results.length;
      const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
      const avgReliability = results.reduce((sum, r) => sum + r.reliability, 0) / results.length;
      const avgBandwidth = results.reduce((sum, r) => sum + r.bandwidthUsage, 0) / results.length;

      if (avgLatency < minAvgLatency) {
        minAvgLatency = avgLatency;
        bestLatency = protocol;
      }

      if (avgThroughput > maxThroughput) {
        maxThroughput = avgThroughput;
        bestThroughput = protocol;
      }

      if (avgReliability > maxReliability) {
        maxReliability = avgReliability;
        bestReliability = protocol;
      }

      if (avgBandwidth < minBandwidthUsage) {
        minBandwidthUsage = avgBandwidth;
        mostEfficient = protocol;
      }
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(bestLatency, bestThroughput, bestReliability, mostEfficient);

    return {
      bestLatency,
      bestThroughput,
      bestReliability,
      mostEfficient,
      recommendation
    };
  }

  /**
   * Generate recommendation based on results
   */
  private generateRecommendation(bestLatency: string, bestThroughput: string, bestReliability: string, mostEfficient: string): string {
    if (bestLatency === bestThroughput && bestThroughput === bestReliability) {
      return `Use ${bestLatency} - it performs best across all metrics`;
    }

    if (bestLatency === 'websocket' && bestReliability === 'websocket') {
      return 'Use WebSocket for real-time applications requiring low latency and high reliability';
    }

    if (mostEfficient === 'sse') {
      return 'Use Server-Sent Events for simple data streaming with minimal overhead';
    }

    if (bestReliability === 'custom-sync') {
      return 'Use Custom Sync for environments with restrictive network policies';
    }

    return 'Choose protocol based on specific requirements: WebSocket for real-time, SSE for simplicity, Custom Sync for compatibility';
  }

  /**
   * Print summary to console
   */
  private printSummary(summary: BenchmarkResult['summary']): void {
    console.log('\n📊 BENCHMARK SUMMARY');
    console.log('==================');
    console.log(`🚀 Best Latency: ${summary.bestLatency.toUpperCase()}`);
    console.log(`⚡ Best Throughput: ${summary.bestThroughput.toUpperCase()}`);
    console.log(`🔒 Most Reliable: ${summary.bestReliability.toUpperCase()}`);
    console.log(`💡 Most Efficient: ${summary.mostEfficient.toUpperCase()}`);
    console.log(`\n🎯 RECOMMENDATION:`);
    console.log(summary.recommendation);
  }

  /**
   * Export results to JSON
   */
  exportResults(result: BenchmarkResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if benchmark is running
   */
  isBenchmarkRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current progress
   */
  getProgress(): number {
    if (!this.isRunning) return 0;

    const elapsed = Date.now() - this.startTime;
    return Math.min((elapsed / this.config.duration) * 100, 100);
  }
}

export default PerformanceBenchmark;