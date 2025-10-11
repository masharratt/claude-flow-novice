const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Import metrics router for blocking coordination observability
const { createMetricsRouter } = require('../src/api/routes/metrics.js');

// Import Prometheus metrics router for monitoring and alerting
const { createPrometheusRouter } = require('../src/api/routes/prometheus.js');

app.use(express.json());

// Mount metrics router for blocking coordination dashboard
// Provides /api/metrics/blocking-coordination endpoint
app.use('/api/metrics', createMetricsRouter({
  redis: null,  // Optional: pass Redis client for real-time data
  logger: console
}));

// Mount Prometheus metrics endpoint for Prometheus scraping
// Provides /prometheus/metrics endpoint
app.use('/prometheus', createPrometheusRouter({
  redis: null,  // Optional: pass Redis client for real-time data
  logger: console
}));

// Serve static dashboard HTML from public directory
app.use(express.static('public'));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', swarm: 'swarm_mglgwjt7_gp40bx2' });
});

app.get('/api/items', (req, res) => {
  res.json({ items: [], count: 0 });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
  console.log(`Blocking coordination dashboard: http://localhost:${port}/blocking-coordination-dashboard.html`);
  console.log(`Metrics API: http://localhost:${port}/api/metrics/blocking-coordination`);
  console.log(`📊 Prometheus metrics: http://localhost:${port}/prometheus/metrics`);
});

module.exports = app;
