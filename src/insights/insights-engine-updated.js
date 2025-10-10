/**
 * Phase 6 High-ROI Insights Engine - Updated with Integrated Components
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import ROICalculator from './roi-calculator.js';
import RecommendationEngine from './recommendation-engine.js';
import FleetOverview from './fleet-overview.js';
import RedisCoordinator from './redis-coordinator.js';

export class InsightsEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379
      },
      analysis: {
        interval: config.analysis?.interval || 30000
      },
      regions: config.regions || ['us-east', 'us-west', 'eu-west', 'asia-pacific'],
      thresholds: {
        performance: {
          latency: 100,
          cpu: 80,
          memory: 85,
          errorRate: 5
        },
        cost: {
          wasteThreshold: 15,
          optimizationTarget: 10
        }
      }
    };

    this.redisClient = null;
    this.isRunning = false;
    this.analysisTimer = null;
    this.insightsHistory = [];
    
    // Initialize components
    this.roiCalculator = new ROICalculator(this.config);
    this.recommendationEngine = new RecommendationEngine(this.config);
    this.fleetOverview = new FleetOverview(this.config);
    this.redisCoordinator = new RedisCoordinator(this.config);
  }

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

      // Initialize all components
      await this.roiCalculator.initialize(this.redisClient);
      await this.recommendationEngine.initialize(this.redisClient);
      await this.fleetOverview.initialize(this.redisClient);
      await this.redisCoordinator.initialize();

      // Set up event listeners for coordination
      this.setupEventListeners();

      console.log('🚀 Phase 6 Insights Engine initialized with all components');
      this.emit('initialized');

    } catch (error) {
      console.error('❌ Failed to initialize insights engine:', error);
      this.emit('error', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Listen to coordination events
    this.redisCoordinator.on('insights-request', async (data) => {
      const insights = this.getCurrentInsights();
      await this.redisCoordinator.publishInsights(insights);
    });

    this.redisCoordinator.on('recommendations-request', async (data) => {
      const latest = this.getLatestRecommendations();
      if (latest) {
        await this.redisCoordinator.publishRecommendations(latest);
      }
    });

    this.redisCoordinator.on('fleet-request', async (data) => {
      const fleetData = this.fleetOverview.getFleetOverview();
      await this.redisCoordinator.publishFleetUpdate(fleetData);
    });
  }

  async start() {
    if (this.isRunning) {
      console.warn('⚠️ Insights engine is already running');
      return;
    }

    try {
      this.isRunning = true;
      this.startAnalysis();
      
      // Broadcast swarm status
      await this.redisCoordinator.broadcastSwarmStatus({
        status: 'active',
        components: ['roi-calculator', 'recommendation-engine', 'fleet-overview', 'redis-coordinator'],
        regions: this.config.regions
      });
      
      console.log('✅ Insights engine started');
      this.emit('started');

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Failed to start insights engine:', error);
      this.emit('error', error);
      throw error;
    }
  }

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

      // Broadcast shutdown status
      await this.redisCoordinator.broadcastSwarmStatus({
        status: 'shutdown',
        timestamp: Date.now()
      });

      console.log('🛑 Insights engine stopped');
      this.emit('stopped');

    } catch (error) {
      console.error('❌ Error stopping insights engine:', error);
      this.emit('error', error);
    }
  }

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

  async runAnalysisCycle() {
    const startTime = Date.now();
    
    try {
      console.log('🔍 Running integrated insights analysis cycle...');
      
      // Collect regional data
      const regionalData = await this.collectRegionalData();
      
      // Generate insights
      const performanceInsights = this.generatePerformanceInsights(regionalData);
      const costInsights = this.generateCostInsights(regionalData);
      const scalingInsights = this.generateScalingInsights(regionalData);
      
      const allInsights = [...performanceInsights, ...costInsights, ...scalingInsights];
      
      // Calculate ROI using the ROI calculator
      const insightsWithROI = await this.roiCalculator.calculateROI(allInsights);
      
      // Generate recommendations using the recommendation engine
      const recommendations = await this.recommendationEngine.generate(insightsWithROI);
      
      // Get fleet overview
      const fleetOverview = this.fleetOverview.getFleetOverview();
      
      // Create comprehensive insights report
      const insightsReport = {
        timestamp: startTime,
        regions: this.config.regions,
        summary: {
          totalInsights: insightsWithROI.length,
          highROIInsights: insightsWithROI.filter(i => i.roi.score >= 0.8).length,
          recommendations: recommendations.length,
          estimatedValue: recommendations.reduce((sum, r) => sum + (r.estimatedValue || 0), 0),
          fleetHealth: fleetOverview.summary.fleetHealth
        },
        insights: {
          performance: performanceInsights,
          cost: costInsights,
          scaling: scalingInsights
        },
        recommendations: recommendations,
        fleetData: fleetOverview,
        regionalData: regionalData
      };
      
      // Store and publish results
      await this.storeInsights(insightsReport);
      await this.redisCoordinator.publishInsights(insightsReport);
      await this.redisCoordinator.publishRecommendations(recommendations);
      await this.redisCoordinator.publishFleetUpdate(fleetOverview);
      
      // Store in swarm memory
      await this.redisCoordinator.storeSwarmMemory('latest-analysis', {
        timestamp: startTime,
        insightsCount: insightsWithROI.length,
        recommendationsCount: recommendations.length,
        confidence: this.calculateOverallConfidence(insightsWithROI)
      });
      
      // Maintain history
      this.maintainHistory();
      
      const duration = Date.now() - startTime;
      console.log(`✅ Integrated analysis cycle completed in ${duration}ms`);
      this.emit('analysis-completed', insightsReport);

    } catch (error) {
      console.error('❌ Analysis cycle failed:', error);
      this.emit('analysis-error', error);
    }
  }

  calculateOverallConfidence(insights) {
    if (insights.length === 0) return 0;
    const totalConfidence = insights.reduce((sum, insight) => sum + (insight.roi?.confidence || 0), 0);
    return totalConfidence / insights.length;
  }

  // Reuse existing methods from original file...
  generatePerformanceInsights(regionalData) {
    const insights = [];
    
    for (const [region, data] of Object.entries(regionalData)) {
      if (data.metrics) {
        if (data.metrics.latency > this.config.thresholds.performance.latency) {
          insights.push({
            id: `perf_${region}_001`,
            type: 'performance',
            category: 'latency',
            title: `High API Latency in ${region}`,
            description: `Average response time is ${data.metrics.latency.toFixed(1)}ms`,
            severity: data.metrics.latency > 150 ? 'high' : 'medium',
            affectedRegions: [region],
            metrics: {
              currentLatency: data.metrics.latency,
              thresholdLatency: this.config.thresholds.performance.latency
            },
            effort: 'medium'
          });
        }

        if (data.metrics.cpu > this.config.thresholds.performance.cpu) {
          insights.push({
            id: `perf_${region}_002`,
            type: 'performance',
            category: 'cpu',
            title: `High CPU Usage in ${region}`,
            description: `CPU usage is ${data.metrics.cpu.toFixed(1)}%`,
            severity: data.metrics.cpu > 90 ? 'high' : 'medium',
            affectedRegions: [region],
            metrics: {
              currentCPU: data.metrics.cpu,
              thresholdCPU: this.config.thresholds.performance.cpu
            },
            effort: 'medium'
          });
        }
      }
    }
    
    return insights;
  }

  generateCostInsights(regionalData) {
    const insights = [];
    
    for (const [region, data] of Object.entries(regionalData)) {
      if (data.costs && data.metrics) {
        const utilization = (data.metrics.cpu + data.metrics.memory) / 2;
        const totalCost = data.costs.compute + data.costs.storage + data.costs.network;
        
        if (utilization < 50 && totalCost > 200) {
          insights.push({
            id: `cost_${region}_001`,
            type: 'cost',
            category: 'resource_optimization',
            title: `Resource Waste in ${region}`,
            description: `Low utilization (${utilization.toFixed(1)}%) with high costs`,
            severity: 'medium',
            affectedRegions: [region],
            metrics: {
              utilization: utilization,
              totalCost: totalCost
            },
            effort: 'low'
          });
        }
      }
    }
    
    return insights;
  }

  generateScalingInsights(regionalData) {
    const insights = [];
    
    for (const [region, data] of Object.entries(regionalData)) {
      if (data.scaling && data.scaling.scalingEvents > 10) {
        insights.push({
          id: `scale_${region}_001`,
          type: 'scaling',
          category: 'aggressive_scaling',
          title: `Aggressive Scaling in ${region}`,
          description: `${data.scaling.scalingEvents} scaling events detected`,
          severity: 'medium',
          affectedRegions: [region],
          metrics: {
            scalingEvents: data.scaling.scalingEvents,
            currentCapacity: data.scaling.currentCapacity
          },
          effort: 'low'
        });
      }
    }
    
    return insights;
  }

  async collectRegionalData() {
    const regionalData = {};
    
    for (const region of this.config.regions) {
      try {
        regionalData[region] = {
          metrics: {
            cpu: 20 + Math.random() * 80,
            memory: 30 + Math.random() * 70,
            latency: 30 + Math.random() * 150,
            errorRate: Math.random() * 10
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

  async storeInsights(insightsReport) {
    try {
      const key = `insights:phase6:${Date.now()}`;
      await this.redisClient.setEx(key, 3600, JSON.stringify(insightsReport));
      await this.redisClient.set('insights:phase6:latest', JSON.stringify(insightsReport));
      this.insightsHistory.push(insightsReport);
    } catch (error) {
      console.error('❌ Failed to store insights:', error);
    }
  }

  maintainHistory() {
    const retentionPeriod = 24 * 60 * 60 * 1000; // 24 hours
    const cutoffTime = Date.now() - retentionPeriod;
    this.insightsHistory = this.insightsHistory.filter(report => report.timestamp > cutoffTime);
  }

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

  getLatestRecommendations() {
    if (this.insightsHistory.length === 0) {
      return [];
    }
    const latest = this.insightsHistory[this.insightsHistory.length - 1];
    return latest.recommendations || [];
  }

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

  async triggerAnalysis() {
    if (!this.isRunning) {
      throw new Error('Insights engine is not running');
    }
    
    console.log('🔄 Triggering on-demand analysis...');
    await this.runAnalysisCycle();
  }

  async getComprehensiveReport() {
    const currentInsights = this.getCurrentInsights();
    const fleetOverview = this.fleetOverview.getFleetOverview();
    const regionalComparison = this.fleetOverview.getRegionalComparison();
    
    return {
      insights: currentInsights,
      fleet: fleetOverview,
      regionalComparison: regionalComparison,
      swarmMemory: await this.redisCoordinator.getSwarmMemory('latest-analysis'),
      status: this.getStatus()
    };
  }
}

export default InsightsEngine;
