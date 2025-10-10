/**
 * ROI Calculation Models for Phase 6 Insights Engine
 */

import { EventEmitter } from "events";

export class ROICalculator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      timeHorizon: config.timeHorizon || 12,
      discountRate: config.discountRate || 0.1
    };
    this.redisClient = null;
  }

  async initialize(redisClient) {
    this.redisClient = redisClient;
    console.log("✅ ROI Calculator initialized");
  }

  async calculateROI(insight) {
    const estimatedSavings = this.estimateSavings(insight);
    const implementationCost = this.estimateCost(insight);
    const roiScore = (estimatedSavings - implementationCost) / implementationCost;
    
    return {
      insightId: insight.id,
      roi: {
        score: Math.min(1, Math.max(0, roiScore / 3)),
        estimatedSavings,
        implementationCost,
        confidence: 0.8
      }
    };
  }

  async calculateROI(insights) {
    return Promise.all(insights.map(insight => this.calculateROI(insight)));
  }

  estimateSavings(insight) {
    const baseSavings = {
      performance: { high: 10000, medium: 5000, low: 2000 },
      cost: { high: 15000, medium: 7000, low: 3000 },
      scaling: { high: 8000, medium: 4000, low: 1500 }
    };
    
    return baseSavings[insight.type]?.[insight.severity] || 5000;
  }

  estimateCost(insight) {
    const baseCosts = {
      low: 2000,
      medium: 5000,
      high: 10000
    };
    
    return baseCosts[insight.effort] || 5000;
  }
}

export default ROICalculator;
