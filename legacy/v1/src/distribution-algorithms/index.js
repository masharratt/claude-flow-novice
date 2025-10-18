/**
 * Distribution Algorithms Module - Phase 4 Node Distribution & Performance Optimization
 *
 * This module exports all distribution algorithms and optimization components
 * for intelligent node placement and load balancing.
 */

// Core optimization algorithms
export { default as GeneticAlgorithmOptimizer, createGeneticOptimizer, createNodeDistributionProblem } from './genetic-algorithm-optimizer.js';
export { default as SimulatedAnnealingOptimizer, createSimulatedAnnealingOptimizer, createNodePlacementProblem } from './simulated-annealing-optimizer.js';
export { default as MLPerformancePredictor, createMLPerformancePredictor } from './ml-performance-predictor.js';

// Main optimization orchestrator
export { default as NodePlacementOptimizer, createNodePlacementOptimizer } from './node-placement-optimizer.js';

// Geographic distribution
export { default as GeoLoadDistributor, createGeoLoadDistributor } from './geo-load-distributor.js';

// Utility functions for creating complete optimization systems
export function createIntelligentDistributionSystem(options = {}) {
  const {
    redis = {
      host: 'localhost',
      port: 6379,
      database: 0
    },
    optimization = {
      algorithms: ['genetic', 'annealing', 'ml_hybrid'],
      maxOptimizationTime: 60000
    },
    geographic = {
      enabled: true,
      strategy: 'latency_optimized'
    },
    swarmId = 'phase-4-node-distribution'
  } = options;

  return {
    nodePlacementOptimizer: createNodePlacementOptimizer({
      swarmId,
      redis,
      optimization
    }),

    geoLoadDistributor: geographic.enabled ? createGeoLoadDistributor({
      swarmId,
      redis,
      distribution: geographic
    }) : null,

    mlPredictor: createMLPerformancePredictor({
      swarmId
    }),

    async initialize() {
      const results = {};

      // Initialize main optimizer
      await this.nodePlacementOptimizer.initialize();
      results.nodePlacementOptimizer = 'initialized';

      // Initialize geographic distributor if enabled
      if (this.geoLoadDistributor) {
        await this.geoLoadDistributor.initialize();
        results.geoLoadDistributor = 'initialized';
      }

      return results;
    },

    async optimizeDistribution(nodes, tasks, constraints = {}) {
      // Perform geographic distribution first if enabled
      let geographicDistribution = null;
      if (this.geoLoadDistributor && constraints.geographic) {
        geographicDistribution = await this.geoLoadDistributor.distributeTasksGeographically(
          tasks,
          constraints.geographic
        );
      }

      // Perform node placement optimization
      const placementResult = await this.nodePlacementOptimizer.optimizeNodePlacement(
        nodes,
        tasks,
        constraints
      );

      return {
        geographicDistribution,
        nodePlacement: placementResult,
        combinedEfficiency: this.calculateCombinedEfficiency(
          geographicDistribution,
          placementResult
        )
      };
    },

    calculateCombinedEfficiency(geoDist, placement) {
      if (!geoDist) return placement.efficiency;

      const geoEfficiency = geoDist.metrics?.distributionEfficiency || 0.8;
      const placementEfficiency = placement.efficiency || 0.8;

      return (geoEfficiency * 0.4 + placementEfficiency * 0.6);
    },

    async shutdown() {
      const results = {};

      if (this.nodePlacementOptimizer) {
        await this.nodePlacementOptimizer.shutdown();
        results.nodePlacementOptimizer = 'shutdown';
      }

      if (this.geoLoadDistributor) {
        await this.geoLoadDistributor.shutdown();
        results.geoLoadDistributor = 'shutdown';
      }

      return results;
    }
  };
}

// Default export with all components
export default {
  GeneticAlgorithmOptimizer,
  SimulatedAnnealingOptimizer,
  MLPerformancePredictor,
  NodePlacementOptimizer,
  GeoLoadDistributor,
  createIntelligentDistributionSystem,
  createGeneticOptimizer,
  createSimulatedAnnealingOptimizer,
  createMLPerformancePredictor,
  createNodePlacementOptimizer,
  createGeoLoadDistributor
};