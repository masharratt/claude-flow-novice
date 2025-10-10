/**
 * Multi-Regional Fleet Overview for Phase 6 Insights Engine
 */

import { EventEmitter } from 'events';

export class FleetOverview extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.redisClient = null;
    this.fleetData = {};
  }

  async initialize(redisClient) {
    this.redisClient = redisClient;
    await this.initializeRegionData();
    console.log('✅ Fleet Overview initialized');
  }

  async initializeRegionData() {
    const regions = this.config.regions || ['us-east', 'us-west', 'eu-west', 'asia-pacific'];
    
    for (const region of regions) {
      this.fleetData[region] = {
        location: this.getRegionLocation(region),
        status: 'active',
        metrics: {
          performance: {
            latency: 50 + Math.random() * 100,
            throughput: 1000 + Math.random() * 2000,
            cpu: 20 + Math.random() * 70,
            memory: 30 + Math.random() * 60
          },
          costs: {
            total: 175 + Math.random() * 800,
            efficiency: 60 + Math.random() * 30
          },
          alerts: []
        },
        lastUpdate: Date.now()
      };
    }
  }

  getRegionLocation(region) {
    const locations = {
      'us-east': { lat: 37.77, lng: -77.41, city: 'Virginia' },
      'us-west': { lat: 37.77, lng: -122.41, city: 'California' },
      'eu-west': { lat: 53.34, lng: -6.26, city: 'Dublin' },
      'asia-pacific': { lat: 1.35, lng: 103.81, city: 'Singapore' }
    };
    return locations[region] || { lat: 0, lng: 0, city: 'Unknown' };
  }

  getFleetOverview() {
    return {
      timestamp: Date.now(),
      regions: Object.keys(this.fleetData),
      summary: this.calculateFleetSummary(),
      regionalData: this.fleetData,
      recommendations: this.generateFleetRecommendations()
    };
  }

  calculateFleetSummary() {
    const regions = Object.keys(this.fleetData);
    let totalLatency = 0;
    let totalCPU = 0;
    let totalCost = 0;
    let totalAlerts = 0;
    
    for (const region of regions) {
      const data = this.fleetData[region];
      if (data && data.metrics) {
        totalLatency += data.metrics.performance.latency;
        totalCPU += data.metrics.performance.cpu;
        totalCost += data.metrics.costs.total;
        totalAlerts += data.metrics.alerts.length;
      }
    }
    
    const regionCount = regions.length;
    
    return {
      totalRegions: regionCount,
      averageLatency: totalLatency / regionCount,
      averageCPU: totalCPU / regionCount,
      totalCost: totalCost,
      totalAlerts: totalAlerts,
      fleetHealth: this.calculateFleetHealth()
    };
  }

  calculateFleetHealth() {
    let healthScore = 100;
    let alertCount = 0;
    
    for (const region of Object.keys(this.fleetData)) {
      const data = this.fleetData[region];
      if (data && data.metrics) {
        const metrics = data.metrics.performance;
        
        if (metrics.latency > 100) healthScore -= 10;
        if (metrics.cpu > 80) healthScore -= 10;
        
        alertCount += data.metrics.alerts.length;
      }
    }
    
    healthScore -= alertCount * 5;
    healthScore = Math.max(0, healthScore);
    
    return {
      score: healthScore,
      status: healthScore >= 90 ? 'excellent' : 
              healthScore >= 70 ? 'good' : 
              healthScore >= 50 ? 'fair' : 'poor'
    };
  }

  generateFleetRecommendations() {
    const recommendations = [];
    
    for (const region of Object.keys(this.fleetData)) {
      const data = this.fleetData[region];
      if (data && data.metrics) {
        const metrics = data.metrics.performance;
        
        if (metrics.latency > 100) {
          recommendations.push({
            id: `fleet_rec_${region}_latency`,
            region: region,
            type: 'performance',
            priority: 'high',
            title: `Optimize ${region} Performance`,
            description: `High latency detected in ${region} region`,
            estimatedValue: Math.round((metrics.latency - 100) * 50)
          });
        }
        
        if (metrics.cpu > 85) {
          recommendations.push({
            id: `fleet_rec_${region}_capacity`,
            region: region,
            type: 'scaling',
            priority: 'medium',
            title: `Scale ${region} Resources`,
            description: `High CPU usage in ${region} region`,
            estimatedValue: Math.round((metrics.cpu - 85) * 30)
          });
        }
      }
    }
    
    return recommendations.slice(0, 10);
  }

  getRegionalComparison() {
    const comparison = {};
    
    for (const region of Object.keys(this.fleetData)) {
      const data = this.fleetData[region];
      if (data) {
        comparison[region] = {
          location: data.location,
          performance: data.metrics.performance,
          costs: data.metrics.costs,
          alerts: data.metrics.alerts.length
        };
      }
    }
    
    return comparison;
  }
}

export default FleetOverview;
