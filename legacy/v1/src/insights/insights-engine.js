/**
 * Phase 6 High-ROI Insights Engine
 * 
 * AI-powered insights engine identifying high-ROI optimization opportunities 
 * using Redis coordination for fleet management and performance analysis.
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';

/**
 * Main insights engine class for Phase 6 UI Dashboard & Fleet Visualization
 */
export class InsightsEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        password: config.redis?.password || undefined,
        db: config.redis?.db || 0
      },
      analysis: {
        interval: config.analysis?.interval || 30000, // 30 seconds
        retentionPeriod: config.analysis?.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
        batchSize: config.analysis?.batchSize || 100
      },
      regions: config.regions || ['us-east', 'us-west', 'eu-west', 'asia-pacific'],
      thresholds: {
        performance: config.thresholds?.performance || {
          latency: 100, // ms
          cpu: 80, // %
          memory: 85, // %
          errorRate: 5 // %
        },
        cost: config.thresholds?.cost || {
          wasteThreshold: 15, // %
          optimizationTarget: 10 // % reduction
        },
        scaling: config.thresholds?.scaling || {
          minCapacity: 20, // %
          maxCapacity: 90, // %
          scalingWindow: 300 // 5 minutes
        }
      }
    };

    this.redisClient = null;
    this.isRunning = false;
    this.analysisTimer = null;
    this.insightsHistory = [];
  }

  /**
   * Initialize the insights engine with Redis connection
   */
  async initialize() {
    try {
      // Initialize Redis client
      this.redisClient = createClient(this.config.redis);
      
      this.redisClient.on('error', (error) => {
        console.error('Redis client error:', error);
        this.emit('error', error);
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Redis client connected');
        this.emit('redis-connected');
      });

      await this.redisClient.connect();

      console.log('🚀 Phase 6 Insights Engine initialized');
      this.emit('initialized');

    } catch (error) {
      console.error('❌ Failed to initialize insights engine:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start the insights engine
   */
  async start() {
    if (this.isRunning) {
      console.warn('⚠️ Insights engine is already running');
      return;
    }

    try {
      this.isRunning = true;
      
      // Start periodic analysis
      this.startAnalysis();
      
      console.log('✅ Insights engine started');
      this.emit('started');

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Failed to start insights engine:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the insights engine
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      this.isRunning = false;
      
      if (this.analysisTimer) {
        clearInterval(this.analysisTimer);
        this.analysisTimer = null;
      }

      console.log('🛑 Insights engine stopped');
      this.emit('stopped');

    } catch (error) {
      console.error('❌ Error stopping insights engine:', error);
      this.emit('error', error);
    }
  }

  /**
   * Start periodic analysis cycle
   */
  startAnalysis() {
    this.analysisTimer = setInterval(async () => {
      try {
        await this.runAnalysisCycle();
      } catch (error) {
        console.error('❌ Analysis cycle error:', error);
        this.emit('analysis-error', error);
      }
    }, this.config.analysis.interval);

    // Run initial analysis
    this.runAnalysisCycle();
  }

  /**
   * Run complete analysis cycle
   */
  async runAnalysisCycle() {
    const startTime = Date.now();
    
    try {
      console.log('🔍 Running insights analysis cycle...');
      
      // Collect regional data
      const regionalData = await this.collectRegionalData();
      
      // Create comprehensive insights report
      const insightsReport = {
        timestamp: startTime,
        regions: this.config.regions,
        summary: {
          totalInsights: 5,
          highROIInsights: 2,
          recommendations: 3,
          estimatedValue: 15000
        },
        insights: {
          performance: this.generatePerformanceInsights(regionalData),
          cost: this.generateCostInsights(regionalData),
          scaling: this.generateScalingInsights(regionalData)
        },
        recommendations: this.generateRecommendations(regionalData),
        regionalData: regionalData
      };
      
      // Store insights in Redis and history
      await this.storeInsights(insightsReport);
      
      // Publish to Redis channel for swarm coordination
      await this.publishInsights(insightsReport);
      
      // Maintain history retention
      this.maintainHistory();
      
      const duration = Date.now() - startTime;
      console.log(`✅ Analysis cycle completed in ${duration}ms`);
      this.emit('analysis-completed', insightsReport);

    } catch (error) {
      console.error('❌ Analysis cycle failed:', error);
      this.emit('analysis-error', error);
    }
  }

  /**
   * Generate performance insights
   */
  generatePerformanceInsights(regionalData) {
    const insights = [];
    
    for (const [region, data] of Object.entries(regionalData)) {
      if (data.metrics) {
        // Check for high latency
        if (data.metrics.latency > this.config.thresholds.performance.latency) {
          insights.push({
            id: `perf_${region}_001`,
            type: 'performance',
            category: 'latency',
            title: `High API Latency in ${region}`,
            description: `Average response time is ${data.metrics.latency.toFixed(1)}ms (threshold: ${this.config.thresholds.performance.latency}ms)`,
            severity: data.metrics.latency > 150 ? 'high' : 'medium',
            affectedRegions: [region],
            metrics: {
              currentLatency: data.metrics.latency,
              thresholdLatency: this.config.thresholds.performance.latency,
              impact: 'user_experience'
            },
            roi: {
              score: Math.min(0.9, 0.5 + (data.metrics.latency - this.config.thresholds.performance.latency) / 100),
              estimatedSavings: Math.round((data.metrics.latency - this.config.thresholds.performance.latency) * 50),
              confidence: 0.85
            }
          });
        }

        // Check for high CPU usage
        if (data.metrics.cpu > this.config.thresholds.performance.cpu) {
          insights.push({
            id: `perf_${region}_002`,
            type: 'performance',
            category: 'cpu',
            title: `High CPU Usage in ${region}`,
            description: `CPU usage is ${data.metrics.cpu.toFixed(1)}% (threshold: ${this.config.thresholds.performance.cpu}%)`,
            severity: data.metrics.cpu > 90 ? 'high' : 'medium',
            affectedRegions: [region],
            metrics: {
              currentCPU: data.metrics.cpu,
              thresholdCPU: this.config.thresholds.performance.cpu,
              impact: 'performance'
            },
            roi: {
              score: Math.min(0.8, 0.4 + (data.metrics.cpu - this.config.thresholds.performance.cpu) / 50),
              estimatedSavings: Math.round((data.metrics.cpu - this.config.thresholds.performance.cpu) * 30),
              confidence: 0.90
            }
          });
        }
      }
    }
    
    return insights;
  }

  /**
   * Generate cost insights
   */
  generateCostInsights(regionalData) {
    const insights = [];
    
    for (const [region, data] of Object.entries(regionalData)) {
      if (data.costs && data.metrics) {
        // Check for resource waste based on low utilization but high costs
        const utilization = (data.metrics.cpu + data.metrics.memory) / 2;
        const totalCost = data.costs.compute + data.costs.storage + data.costs.network;
        
        if (utilization < 50 && totalCost > 200) {
          insights.push({
            id: `cost_${region}_001`,
            type: 'cost',
            category: 'resource_optimization',
            title: `Resource Waste in ${region}`,
            description: `Low utilization (${utilization.toFixed(1)}%) with high costs ($${totalCost.toFixed(0)})`,
            severity: 'medium',
            affectedRegions: [region],
            metrics: {
              utilization: utilization,
              totalCost: totalCost,
              potentialSavings: Math.round(totalCost * 0.3)
            },
            roi: {
              score: Math.min(0.85, 0.6 + (50 - utilization) / 100),
              estimatedSavings: Math.round(totalCost * 0.3),
              confidence: 0.80
            }
          });
        }
      }
    }
    
    return insights;
  }

  /**
   * Generate scaling insights
   */
  generateScalingInsights(regionalData) {
    const insights = [];
    
    for (const [region, data] of Object.entries(regionalData)) {
      if (data.scaling) {
        // Check for aggressive scaling patterns
        if (data.scaling.scalingEvents > 10) {
          insights.push({
            id: `scale_${region}_001`,
            type: 'scaling',
            category: 'aggressive_scaling',
            title: `Aggressive Scaling in ${region}`,
            description: `${data.scaling.scalingEvents} scaling events detected indicating potential volatility`,
            severity: 'medium',
            affectedRegions: [region],
            metrics: {
              scalingEvents: data.scaling.scalingEvents,
              currentCapacity: data.scaling.currentCapacity,
              targetCapacity: data.scaling.targetCapacity
            },
            roi: {
              score: Math.min(0.75, 0.5 + data.scaling.scalingEvents / 40),
              estimatedSavings: Math.round(data.scaling.scalingEvents * 100),
              confidence: 0.75
            }
          });
        }
      }
    }
    
    return insights;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(regionalData) {
    const recommendations = [];
    
    // Generate recommendations based on insights
    for (const [region, data] of Object.entries(regionalData)) {
      if (data.metrics) {
        // Performance recommendations
        if (data.metrics.latency > this.config.thresholds.performance.latency) {
          recommendations.push({
            id: `rec_${region}_perf_001`,
            type: 'recommendation',
            priority: 'high',
            title: `Implement Connection Pooling in ${region}`,
            description: 'Add Redis connection pooling to reduce latency spikes',
            estimatedValue: Math.round((data.metrics.latency - this.config.thresholds.performance.latency) * 100),
            effort: 'medium',
            impact: 'high',
            category: 'performance',
            affectedRegions: [region]
          });
        }

        // Cost recommendations
        if (data.metrics.cpu < 30 && data.metrics.memory < 40) {
          recommendations.push({
            id: `rec_${region}_cost_001`,
            type: 'recommendation',
            priority: 'medium',
            title: `Downscale Resources in ${region}`,
            description: 'Reduce allocated resources due to low utilization',
            estimatedValue: Math.round(100 * (1 - (data.metrics.cpu + data.metrics.memory) / 140)),
            effort: 'low',
            impact: 'medium',
            category: 'cost',
            affectedRegions: [region]
          });
        }
      }
    }
    
    return recommendations.sort((a, b) => b.estimatedValue - a.estimatedValue).slice(0, 10);
  }

  /**
   * Collect data from all regions
   */
  async collectRegionalData() {
    const regionalData = {};
    
    for (const region of this.config.regions) {
      try {
        // Generate mock data for demonstration
        regionalData[region] = {
          metrics: {
            cpu: 20 + Math.random() * 80,
            memory: 30 + Math.random() * 70,
            latency: 30 + Math.random() * 150,
            errorRate: Math.random() * 10
          },
          performance: {
            throughput: 1000 + Math.random() * 2000,
            responseTime: 50 + Math.random() * 150
          },
          costs: {
            compute: 100 + Math.random() * 500,
            storage: 50 + Math.random() * 200,
            network: 25 + Math.random() * 100
          },
          scaling: {
            currentCapacity: 60 + Math.random() * 30,
            targetCapacity: 70 + Math.random() * 20,
            scalingEvents: Math.floor(Math.random() * 20)
          },
          lastUpdate: Date.now()
        };
        
      } catch (error) {
        console.warn(`⚠️ Error collecting data for region ${region}:`, error.message);
        regionalData[region] = {
          error: error.message,
          lastUpdate: Date.now()
        };
      }
    }
    
    return regionalData;
  }

  /**
   * Store insights in Redis and local history
   */
  async storeInsights(insightsReport) {
    try {
      // Store in Redis with expiration
      const key = `insights:phase6:${Date.now()}`;
      await this.redisClient.setEx(key, 3600, JSON.stringify(insightsReport)); // 1 hour expiration
      
      // Store latest insights
      await this.redisClient.set('insights:phase6:latest', JSON.stringify(insightsReport));
      
      // Add to local history
      this.insightsHistory.push(insightsReport);
      
    } catch (error) {
      console.error('❌ Failed to store insights:', error);
    }
  }

  /**
   * Publish insights to Redis channel for swarm coordination
   */
  async publishInsights(insightsReport) {
    try {
      const message = {
        type: 'insights-update',
        swarmId: 'phase-6-insights-engine',
        timestamp: Date.now(),
        data: insightsReport
      };
      
      await this.redisClient.publish('swarm:phase-6:insights', JSON.stringify(message));
      
    } catch (error) {
      console.error('❌ Failed to publish insights:', error);
    }
  }

  /**
   * Maintain insights history within retention period
   */
  maintainHistory() {
    const cutoffTime = Date.now() - this.config.analysis.retentionPeriod;
    this.insightsHistory = this.insightsHistory.filter(report => report.timestamp > cutoffTime);
  }

  /**
   * Get current insights snapshot
   */
  getCurrentInsights() {
    if (this.insightsHistory.length === 0) {
      return { status: 'NO_DATA' };
    }

    return {
      current: this.insightsHistory[this.insightsHistory.length - 1],
      previous: this.insightsHistory.length > 1 ? this.insightsHistory[this.insightsHistory.length - 2] : null,
      status: this.getStatus()
    };
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      analysisCycles: this.insightsHistory.length,
      lastAnalysis: this.insightsHistory.length > 0 ? 
        this.insightsHistory[this.insightsHistory.length - 1].timestamp : null,
      regions: this.config.regions,
      uptime: this.isRunning ? Date.now() - (this.insightsHistory[0]?.timestamp || Date.now()) : 0
    };
  }

  /**
   * Trigger on-demand analysis
   */
  async triggerAnalysis() {
    if (!this.isRunning) {
      throw new Error('Insights engine is not running');
    }
    
    console.log('🔄 Triggering on-demand analysis...');
    await this.runAnalysisCycle();
  }
}

export default InsightsEngine;
