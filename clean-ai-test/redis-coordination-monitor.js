#!/usr/bin/env node

/**
 * Redis Coordination Monitor
 * Real-time monitoring of Redis-based AI coordinator communication
 */

import Redis from 'redis';
import readline from 'readline';

class RedisCoordinationMonitor {
  constructor() {
    this.redisClient = null;
    this.isRunning = false;
    this.messageCount = 0;
    this.coordinators = new Map();
    this.startTime = Date.now();
  }

  async initialize() {
    try {
      this.redisClient = Redis.createClient({
        url: 'redis://localhost:6379'
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      await this.redisClient.connect();
      console.log('🔍 Connected to Redis for real-time monitoring');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      return false;
    }
  }

  async startMonitoring() {
    if (!await this.initialize()) {
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Redis Coordination Monitor...\n');

    // Subscribe to coordinator announcements
    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();
    await subscriber.subscribe('coordinator-announcements', (message) => {
      this.handleAnnouncement(JSON.parse(message));
    });

    // Start periodic status updates
    this.statusInterval = setInterval(() => {
      this.showStatus();
    }, 5000);

    // Handle graceful shutdown
    readline.createInterface({
      input: process.stdin,
      output: process.stdout
    }).on('SIGINT', () => {
      this.shutdown();
    });

    console.log('✅ Monitoring active. Press Ctrl+C to stop.\n');
    console.log('📊 Waiting for coordinator announcements...\n');
  }

  handleAnnouncement(announcement) {
    this.messageCount++;
    const timestamp = new Date(announcement.timestamp).toLocaleTimeString();

    if (announcement.action === 'CHOICE_ANNOUNCED') {
      const coordinator = announcement.coordinatorId;
      const choice = announcement.choice;

      this.coordinators.set(coordinator, {
        choice: choice,
        timestamp: announcement.timestamp,
        status: 'active'
      });

      console.log(`🎯 [${timestamp}] ${coordinator} chose: ${choice}`);
      this.showLanguageStatus();
    } else if (announcement.action === 'CHOICE_RETRACTED') {
      const coordinator = announcement.coordinatorId;

      if (this.coordinators.has(coordinator)) {
        const previousChoice = this.coordinators.get(coordinator).choice;
        console.log(`🔄 [${timestamp}] ${coordinator} retracted: ${previousChoice}`);
        this.coordinators.delete(coordinator);
      }
    }
  }

  showLanguageStatus() {
    const languages = new Set();
    const coordinatorStatus = [];

    for (const [coordinator, info] of this.coordinators) {
      languages.add(info.choice);
      coordinatorStatus.push(`${coordinator}: ${info.choice}`);
    }

    console.log(`📝 Current Status: ${coordinatorStatus.join(' | ')}`);
    console.log(`🌍 Languages Taken: [${Array.from(languages).join(', ')}]`);
    console.log('');
  }

  async showStatus() {
    const runtime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const activeCoordinators = this.coordinators.size;

    console.log(`\n📊 Status Update (${runtime}s runtime):`);
    console.log(`   📨 Messages Received: ${this.messageCount}`);
    console.log(`   🤖 Active Coordinators: ${activeCoordinators}/7`);

    if (activeCoordinators > 0) {
      this.showLanguageStatus();
    }

    // Show Redis memory usage
    try {
      const info = await this.redisClient.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      if (memoryMatch) {
        console.log(`   💾 Redis Memory: ${memoryMatch[1].trim()}`);
      }
    } catch (error) {
      // Ignore Redis info errors
    }
  }

  async shutdown() {
    console.log('\n🔄 Shutting down Redis Coordination Monitor...');
    this.isRunning = false;

    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('✅ Monitor stopped gracefully');
    process.exit(0);
  }
}

// Start the monitor
const monitor = new RedisCoordinationMonitor();
monitor.startMonitoring().catch(console.error);