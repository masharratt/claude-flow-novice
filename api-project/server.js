const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', swarm: 'swarm_mgl3crn7_ema6gz1' });
});

app.get('/api/items', (req, res) => {
  res.json({ items: [], count: 0 });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});

module.exports = app;
