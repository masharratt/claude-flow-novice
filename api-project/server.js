const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', swarm: 'swarm_mgpochfa_x077v25' });
});

app.get('/api/items', (req, res) => {
  // Return some sample items for testing
  res.json({ 
    items: [
      { id: 1, name: 'Sample Item 1', description: 'This is a test item' },
      { id: 2, name: 'Sample Item 2', description: 'Another test item' },
      { id: 3, name: 'Sample Item 3', description: 'Yet another test item' }
    ], 
    count: 3 
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});

module.exports = app;