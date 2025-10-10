/**
 * Phase 6 High-ROI Insights Engine - Main Export
 * 
 * This package provides comprehensive insights analysis capabilities including:
 * - Performance bottleneck detection
 * - Cost optimization analysis
 * - ROI calculation with confidence scoring
 * - Multi-regional fleet overview
 * - Redis-based swarm coordination
 */

import InsightsEngine from './insights-engine.js';
import ROICalculator from './roi-calculator.js';
import RecommendationEngine from './recommendation-engine.js';
import FleetOverview from './fleet-overview.js';
import RedisCoordinator from './redis-coordinator.js';

// Main exports
export {
  InsightsEngine,
  ROICalculator,
  RecommendationEngine,
  FleetOverview,
  RedisCoordinator
};

// Default export is the main InsightsEngine
export default InsightsEngine;

/**
 * Quick start factory function
 */
export function createInsightsEngine(config = {}) {
  return new InsightsEngine(config);
}

/**
 * Configuration presets for common use cases
 */
export const presets = {
  development: {
    analysis: {
      interval: 30000
    },
    regions: ['us-east', 'us-west'],
    thresholds: {
      performance: {
        latency: 200,
        cpu: 90,
        memory: 90
      }
    }
  },
  
  production: {
    analysis: {
      interval: 60000
    },
    regions: ['us-east', 'us-west', 'eu-west', 'asia-pacific'],
    thresholds: {
      performance: {
        latency: 100,
        cpu: 80,
        memory: 85
      }
    }
  },
  
  testing: {
    analysis: {
      interval: 5000
    },
    regions: ['us-east'],
    thresholds: {
      performance: {
        latency: 300,
        cpu: 95,
        memory: 95
      }
    }
  }
};

/**
 * Version information
 */
export const version = '1.0.0';
export const phase = 'Phase 6';
export const description = 'High-ROI Insights Engine for Fleet Management and Performance Analysis';
