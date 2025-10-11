/**
 * Prometheus Metrics API Endpoint - Sprint 3.3: Prometheus Integration
 *
 * Provides /prometheus/metrics endpoint for Prometheus scraping.
 * Exposes blocking coordination metrics in Prometheus text format.
 *
 * Epic: production-blocking-coordination
 * Sprint: 3.3 - Prometheus Integration
 *
 * @module api/routes/prometheus
 */

const express = require('express');
const { PrometheusMetrics } = require('../../observability/prometheus-metrics.js');

/**
 * Create Prometheus metrics router
 *
 * @param {Object} config - Configuration object
 * @param {Object} config.redis - Redis client instance (optional)
 * @param {Object} config.logger - Logger instance (optional)
 * @returns {express.Router} Express router
 */
function createPrometheusRouter({ redis, logger }) {
  const router = express.Router();
  const metrics = new PrometheusMetrics({ redis, logger });

  /**
   * GET /prometheus/metrics
   *
   * Prometheus scrape endpoint. Returns metrics in Prometheus text format.
   *
   * Metrics exposed:
   * - blocking_coordinators_total (gauge)
   * - blocking_duration_seconds (histogram)
   * - signal_delivery_latency_seconds (histogram)
   * - heartbeat_failures_total (counter)
   * - timeout_events_total (counter)
   *
   * Example:
   * curl http://localhost:3000/prometheus/metrics
   */
  router.get('/metrics', async (req, res) => {
    try {
      // Collect and return metrics in Prometheus text format
      const metricsText = await metrics.getMetrics();

      // Set content type for Prometheus scraper
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metricsText);

      if (logger) {
        logger.debug('Prometheus metrics served', {
          endpoint: '/prometheus/metrics',
          contentLength: metricsText.length,
        });
      }
    } catch (error) {
      if (logger) {
        logger.error('Prometheus metrics collection failed', {
          error: error.message,
          stack: error.stack,
        });
      }

      // Return minimal error response in Prometheus format
      res.status(500);
      res.set('Content-Type', 'text/plain');
      res.send('# Metrics collection failed\n');
    }
  });

  /**
   * GET /prometheus/health
   *
   * Health check endpoint for Prometheus scraper monitoring.
   *
   * Example:
   * curl http://localhost:3000/prometheus/health
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'prometheus-metrics',
      timestamp: Date.now(),
    });
  });

  return router;
}

// ===== EXPORTS =====

module.exports = {
  createPrometheusRouter,
};
