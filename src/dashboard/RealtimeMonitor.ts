import { RealtimeMonitorConfig, MemoryHotspot, RedisClient } from './types';

export class RealtimeMonitor {
  private redisClient: RedisClient;
  private config: RealtimeMonitorConfig;
  private interval: number | null = null;
  private isRunning = false;

  constructor(redisClient: RedisClient, config: RealtimeMonitorConfig) {
    this.redisClient = redisClient;
    this.config = config;
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('Starting real-time memory monitoring...');

    // Subscribe to Redis memory events
    this.redisClient.subscribe('swarm:phase-6:memory', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'memory-update') {
          this.config.onMemoryUpdate(data.data);
        }
      } catch (error) {
        console.error('Error parsing Redis message:', error);
      }
    });

    // Start periodic monitoring
    this.interval = setInterval(async () => {
      await this.checkMemoryChanges();
    }, this.config.interval || 5000);
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    console.log('Stopping real-time memory monitoring...');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async checkMemoryChanges(): Promise<void> {
    try {
      const keys = await this.redisClient.getKeys('*');
      const memoryInfo = await this.redisClient.getMemoryInfo();

      // Detect hotspots
      const hotspots = keys
        .filter(key => key.memory > 1024)
        .map(key => ({
          type: 'redis' as const,
          name: key.key,
          severity: key.memory > 10240 ? 'high' as const :
                   key.memory > 5120 ? 'medium' as const : 'low' as const,
          memoryUsage: key.memory,
          recommendations: this.generateRecommendations(key),
          impact: key.memory / memoryInfo.memoryUsage
        }));

      // Notify about detected hotspots
      hotspots.forEach(hotspot => {
        this.config.onHotspotDetected(hotspot);
      });

      // Update memory state
      this.config.onMemoryUpdate({
        keys,
        memoryUsage: memoryInfo.memoryUsage,
        keyCount: memoryInfo.keyCount
      });

    } catch (error) {
      console.error('Error checking memory changes:', error);
    }
  }

  private generateRecommendations(key: any): string[] {
    const recommendations: string[] = [];

    if (key.memory > 10240) {
      recommendations.push('Consider data compression');
      recommendations.push('Review data structure efficiency');
    }

    if (key.ttl === -1 && key.type === 'string') {
      recommendations.push('Consider setting TTL for temporary data');
    }

    if (key.type === 'list' && key.size > 1000) {
      recommendations.push('Consider pagination or data archiving');
    }

    if (key.type === 'hash' && key.memory > 5000) {
      recommendations.push('Consider splitting large hash into smaller pieces');
    }

    return recommendations;
  }
}