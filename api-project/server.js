const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', swarm: 'swarm_mglr53gx_8a1350e' });
});

app.get('/api/items', (req, res) => {
  res.json({ items: [], count: 0 });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});

module.exports = app;
