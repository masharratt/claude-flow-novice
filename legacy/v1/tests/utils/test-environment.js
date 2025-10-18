/**
 * Test Environment Utility for Integration Testing
 * Provides Redis connection management and test cleanup utilities
 */

import { createClient } from 'redis';
import fs from 'fs-extra';
import path from 'path';

export class TestEnvironment {
  constructor(options = {}) {
    this.options = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 1,
        ...options.redis
      },
      timeout: 30000,
      cleanup: true,
      ...options
    };

    this.redisClient = null;
    this.testArtifacts = [];
  }

  async setup() {
    // Initialize Redis client
    this.redisClient = createClient({
      socket: {
        host: this.options.redis.host,
        port: this.options.redis.port
      },
      database: this.options.redis.db
    });

    await this.redisClient.connect();

    // Test Redis connectivity
    const pong = await this.redisClient.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis connection failed');
    }

    console.log('✅ Test environment setup complete');
  }

  async cleanup() {
    if (this.options.cleanup) {
      // Clear test database
      if (this.redisClient) {
        await this.redisClient.flushDb();
        await this.redisClient.quit();
      }

      // Clean up test artifacts
      for (const artifact of this.testArtifacts) {
        try {
          if (fs.existsSync(artifact)) {
            await fs.remove(artifact);
          }
        } catch (error) {
          console.warn(`Failed to remove artifact ${artifact}:`, error.message);
        }
      }

      console.log('✅ Test environment cleanup complete');
    }
  }

  async clearTestArtifacts() {
    if (this.redisClient) {
      await this.redisClient.flushDb();
    }
  }

  addTestArtifact(artifactPath) {
    this.testArtifacts.push(artifactPath);
  }

  getRedisClient() {
    return this.redisClient;
  }
}