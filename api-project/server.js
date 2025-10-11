const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Import metrics router for blocking coordination observability
const { createMetricsRouter } = require('../src/api/routes/metrics.js');

app.use(express.json());

// Mount metrics router for blocking coordination dashboard
// Provides /api/metrics/blocking-coordination endpoint
app.use('/api/metrics', createMetricsRouter({
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
});

module.exports = app;
