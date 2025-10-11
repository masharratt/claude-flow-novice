/**
 * Metrics API routes for observability dashboard
 */
const express = require('express');
const { BlockingCoordinationMetrics } = require('../../observability/blocking-coordination-metrics.js');

function createMetricsRouter({ redis, logger }) {
  const router = express.Router();
  const metrics = new BlockingCoordinationMetrics({ redis, logger });

  // GET /api/metrics/blocking-coordination
  router.get('/blocking-coordination', async (req, res) => {
    try {
      const dashboardMetrics = await metrics.getDashboardMetrics();
      res.json(dashboardMetrics);
    } catch (error) {
      logger.error('Failed to get metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  // GET /api/metrics/blocking-coordination/active
  router.get('/blocking-coordination/active', async (req, res) => {
    try {
      const coordinators = await metrics.getActiveCoordinators();
      res.json({ coordinators });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get active coordinators' });
    }
  });

  // GET /api/metrics/blocking-coordination/heartbeats
  router.get('/blocking-coordination/heartbeats', async (req, res) => {
    try {
      const heartbeats = await metrics.getHeartbeatStatus();
      res.json({ heartbeats });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get heartbeats' });
    }
  });

  return router;
}

module.exports = { createMetricsRouter };
