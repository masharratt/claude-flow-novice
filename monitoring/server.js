const express = require('express');
const { spawn } = require('child_process');
const redis = require('redis');
const Docker = require('dockerode');

const app = express();
const PORT = process.env.PORT || 5555;

// Initialize Redis client
const redisClient = redis.createClient({
  url: 'redis://localhost:6379'
});

// Initialize Docker client
const docker = new Docker();

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Redis connection
redisClient.on('error', (err) => {
  console.log('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis Client Connected');
});

// Connect to Redis
redisClient.connect().catch(console.error);

// Utility functions
function execCommand(command) {
  return new Promise((resolve, reject) => {
    const process = spawn('bash', ['-c', command]);
    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${error}`));
      }
    });
  });
}

// API Routes

// Get container statistics
app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });

    const containerStats = containers.map(container => ({
      name: container.Names[0].replace(/^\//, ''),
      status: container.Status.includes('Up') ? 'running' :
              container.Status.includes('Exited') ? 'exited' : 'unknown',
      memory: container.SizeRw ? Math.round(container.SizeRw / 1024 / 1024) + 'MB' : 'N/A',
      cpu: 'N/A', // Would need container stats API for real-time CPU
      image: container.Image,
      ports: container.Ports
    }));

    const total = containerStats.length;
    const running = containerStats.filter(c => c.status === 'running').length;
    const failed = containerStats.filter(c => c.status === 'exited' &&
      !container.Names[0].includes('postgres') &&
      !container.Names[0].includes('redis')).length;

    // Filter for CFN-related containers
    const cfnContainers = containerStats.filter(container =>
      container.name.includes('cfn') ||
      container.name.includes('redis') ||
      container.name.includes('cadvisor') ||
      container.name.includes('consensus') ||
      container.name.includes('agent-comm')
    );

    res.json({
      total: cfnContainers.length,
      running: cfnContainers.filter(c => c.status === 'running').length,
      failed: cfnContainers.filter(c => c.status === 'exited').length,
      containers: cfnContainers
    });

  } catch (error) {
    console.error('Error fetching container stats:', error);
    res.status(500).json({ error: 'Failed to fetch container stats' });
  }
});

// Get system statistics
app.get('/api/system', async (req, res) => {
  try {
    // Get memory info
    const memInfo = await execCommand("cat /proc/meminfo");
    const memTotal = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)[1]) * 1024;
    const memAvailable = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)[1]) * 1024;
    const memUsed = memTotal - memAvailable;

    // Get system load
    const loadAvg = await execCommand("cat /proc/loadavg | cut -d' ' -f1");
    const systemLoad = parseFloat(loadAvg);

    res.json({
      memoryTotal: memTotal,
      memoryUsed: memUsed,
      load: systemLoad
    });

  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

// Get CFN loop statistics
app.get('/api/cfn', async (req, res) => {
  try {
    const cfnKeys = await redisClient.keys('cfn_loop:*');

    let activeTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;
    let healthyAgents = 0;
    let stuckAgents = 0;

    for (const key of cfnKeys) {
      try {
        const value = await redisClient.get(key);
        if (value) {
          if (key.includes(':context:')) {
            const context = JSON.parse(value);
            if (context.status === 'in_progress') activeTasks++;
            if (context.status === 'completed') completedTasks++;
            if (context.status === 'failed') failedTasks++;

            if (context.confidence) {
              totalConfidence += context.confidence;
              confidenceCount++;
            }
          }
        }
      } catch (parseError) {
        console.warn(`Failed to parse Redis key ${key}:`, parseError.message);
      }
    }

    // Check for stuck agents (simplified)
    try {
      const processes = await execCommand("ps aux | grep 'claude-flow-novice agent' | grep -v grep | wc -l");
      healthyAgents = parseInt(processes);
    } catch (procError) {
      console.warn('Could not check agent processes:', procError.message);
    }

    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    res.json({
      activeTasks,
      completedTasks,
      failedTasks,
      avgConfidence,
      healthyAgents,
      stuckAgents,
      memoryAlerts: 0, // Would need telemetry integration
      timeoutRate: healthyAgents > 0 ? Math.round((stuckAgents / healthyAgents) * 100) + '%' : '0%'
    });

  } catch (error) {
    console.error('Error fetching CFN stats:', error);
    // Return default values if Redis is not available
    res.json({
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      avgConfidence: 0,
      healthyAgents: 0,
      stuckAgents: 0,
      memoryAlerts: 0,
      timeoutRate: '0%'
    });
  }
});

// Get detailed container stats
app.get('/api/containers/:name/stats', async (req, res) => {
  try {
    const containerName = req.params.name;
    const container = docker.getContainer(containerName);

    const stats = await container.stats({ stream: false });

    res.json({
      cpu_usage: stats.cpu_stats.cpu_usage.total_usage,
      memory_usage: stats.memory_stats.usage,
      memory_limit: stats.memory_stats.limit,
      network_rx: stats.networks ? Object.values(stats.networks).reduce((acc, net) => acc + net.rx_bytes, 0) : 0,
      network_tx: stats.networks ? Object.values(stats.networks).reduce((acc, net) => acc + net.tx_bytes, 0) : 0
    });

  } catch (error) {
    console.error(`Error fetching stats for container ${req.params.name}:`, error);
    res.status(500).json({ error: 'Failed to fetch container stats' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/dashboard.html');
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 CFN Monitoring Dashboard server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard available at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');

  if (redisClient.isOpen) {
    await redisClient.quit();
  }

  process.exit(0);
});

module.exports = app;