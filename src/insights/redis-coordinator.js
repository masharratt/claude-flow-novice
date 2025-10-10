/**
 * Redis Coordination Layer for Phase 6 Insights Engine
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';

export class RedisCoordinator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379
      },
      channels: {
        insights: 'swarm:phase-6:insights',
        recommendations: 'swarm:phase-6:recommendations',
        fleet: 'swarm:phase-6:fleet'
      }
    };
    
    this.redisClient = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      this.redisClient = createClient(this.config.redis);
      
      this.redisClient.on('error', (error) => {
        console.error('Redis client error:', error);
        this.emit('error', error);
      });

      await this.redisClient.connect();
      this.isConnected = true;
      
      console.log('✅ Redis Coordinator initialized');
      this.emit('initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize Redis coordinator:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async publishInsights(insights) {
    try {
      const message = {
        type: 'insights-update',
        swarmId: 'phase-6-insights-engine',
        timestamp: Date.now(),
        data: insights
      };
      
      await this.redisClient.publish(this.config.channels.insights, JSON.stringify(message));
      await this.storeInsights(insights);
      
      this.emit('insights-published', insights);
      
    } catch (error) {
      console.error('❌ Failed to publish insights:', error);
      throw error;
    }
  }

  async publishRecommendations(recommendations) {
    try {
      const message = {
        type: 'recommendations-update',
        swarmId: 'phase-6-insights-engine',
        timestamp: Date.now(),
        data: recommendations
      };
      
      await this.redisClient.publish(this.config.channels.recommendations, JSON.stringify(message));
      await this.storeRecommendations(recommendations);
      
      this.emit('recommendations-published', recommendations);
      
    } catch (error) {
      console.error('❌ Failed to publish recommendations:', error);
      throw error;
    }
  }

  async publishFleetUpdate(fleetData) {
    try {
      const message = {
        type: 'fleet-update',
        swarmId: 'phase-6-insights-engine',
        timestamp: Date.now(),
        data: fleetData
      };
      
      await this.redisClient.publish(this.config.channels.fleet, JSON.stringify(message));
      await this.storeFleetData(fleetData);
      
      this.emit('fleet-published', fleetData);
      
    } catch (error) {
      console.error('❌ Failed to publish fleet update:', error);
      throw error;
    }
  }

  async storeInsights(insights) {
    try {
      await this.redisClient.set('insights:phase6:latest', JSON.stringify(insights));
    } catch (error) {
      console.error('❌ Failed to store insights:', error);
    }
  }

  async storeRecommendations(recommendations) {
    try {
      await this.redisClient.set('recommendations:phase6:latest', JSON.stringify(recommendations));
    } catch (error) {
      console.error('❌ Failed to store recommendations:', error);
    }
  }

  async storeFleetData(fleetData) {
    try {
      await this.redisClient.set('fleet:phase6:latest', JSON.stringify(fleetData));
    } catch (error) {
      console.error('❌ Failed to store fleet data:', error);
    }
  }

  async storeSwarmMemory(memoryKey, memoryData) {
    try {
      const key = `swarm:memory:phase6:${memoryKey}`;
      await this.redisClient.setEx(key, 7200, JSON.stringify(memoryData)); // 2 hours expiration
    } catch (error) {
      console.error('❌ Failed to store swarm memory:', error);
    }
  }

  async getSwarmMemory(memoryKey) {
    try {
      const key = `swarm:memory:phase6:${memoryKey}`;
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to retrieve swarm memory:', error);
      return null;
    }
  }

  async getLatestInsights() {
    try {
      const data = await this.redisClient.get('insights:phase6:latest');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to get latest insights:', error);
      return null;
    }
  }

  async getLatestRecommendations() {
    try {
      const data = await this.redisClient.get('recommendations:phase6:latest');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to get latest recommendations:', error);
      return null;
    }
  }

  async getLatestFleetData() {
    try {
      const data = await this.redisClient.get('fleet:phase6:latest');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to get latest fleet data:', error);
      return null;
    }
  }

  async broadcastSwarmStatus(status) {
    try {
      const message = {
        type: 'swarm-status',
        swarmId: 'phase-6-insights-engine',
        timestamp: Date.now(),
        status: status
      };
      
      await this.redisClient.publish('swarm:phase-6:events', JSON.stringify(message));
      this.emit('status-broadcasted', status);
      
    } catch (error) {
      console.error('❌ Failed to broadcast swarm status:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      channels: Object.values(this.config.channels)
    };
  }

  async disconnect() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      
      this.isConnected = false;
      console.log('🛑 Redis Coordinator disconnected');
      this.emit('disconnected');
      
    } catch (error) {
      console.error('❌ Error during disconnect:', error);
      this.emit('disconnect-error', error);
    }
  }
}

export default RedisCoordinator;
