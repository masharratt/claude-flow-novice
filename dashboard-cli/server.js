const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const redis = require('redis');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3100;

// Middleware
app.use(cors());
app.use(express.json());

// Database paths
const DB_PATH = path.join(__dirname, '..', 'claude-assets', 'skills', 'cfn-redis-coordination', 'data', 'cfn-loop.db');

// Initialize SQLite database
let db;
function initializeSQLite() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
        reject(err);
      } else {
        console.log('✅ Connected to SQLite database');
        // Test query to verify connection
        db.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1", [], (err, row) => {
          if (err) {
            console.error('SQLite test query failed:', err.message);
            reject(err);
          } else {
            console.log('✅ SQLite connection verified');
            resolve();
          }
        });
      }
    });
  });
}

// Initialize Redis client
let redisClient;
async function initializeRedis() {
  try {
    redisClient = redis.createClient({
      host: 'localhost',
      port: 6379
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('✅ Connected to Redis');
    });

    await redisClient.connect();
    
    // Test Redis connection
    await redisClient.ping();
    console.log('✅ Redis connection verified');
  } catch (err) {
    console.error('Error connecting to Redis:', err);
    throw err;
  }
}

// API Routes

// GET /api/agents - Query SQLite agents table
app.get('/api/agents', async (req, res) => {
  try {
    const query = "SELECT * FROM agents ORDER BY spawned_at DESC";
    
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('Error querying agents table:', err.message);
        return res.status(500).json({
          error: 'Database query failed',
          details: err.message
        });
      }
      
      res.json({
        success: true,
        data: rows,
        count: rows.length
      });
    });
  } catch (error) {
    console.error('Unexpected error in /api/agents:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/redis/signals - Query Redis keys matching 'swarm:*'
app.get('/api/redis/signals', async (req, res) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return res.status(500).json({
        error: 'Redis connection not available'
      });
    }

    const pattern = 'swarm:*';
    const keys = await redisClient.keys(pattern);
    
    const signals = [];
    for (const key of keys) {
      try {
        const value = await redisClient.get(key);
        signals.push({
          key: key,
          value: value,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.warn(`Warning: Could not retrieve value for key ${key}:`, err.message);
        signals.push({
          key: key,
          value: null,
          error: 'Could not retrieve value',
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      data: signals,
      count: signals.length
    });
  } catch (error) {
    console.error('Error in /api/redis/signals:', error);
    res.status(500).json({
      error: 'Failed to retrieve Redis signals',
      details: error.message
    });
  }
});

// GET /api/status - Combined status with iteration info from both sources
app.get('/api/status', async (req, res) => {
  try {
    // Get data from SQLite
    const agentsQuery = "SELECT status, COUNT(*) as count FROM agents GROUP BY status";
    const agentsByStatus = await new Promise((resolve, reject) => {
      db.all(agentsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const totalAgents = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM agents", [], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    // Get data from Redis
    let redisStatus = { connected: false, signals: 0 };
    if (redisClient && redisClient.isOpen) {
      try {
        const signals = await redisClient.keys('swarm:*');
        redisStatus = {
          connected: true,
          signals: signals.length
        };
      } catch (err) {
        console.warn('Redis status check failed:', err.message);
        redisStatus.connected = false;
      }
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      server: {
        port: PORT,
        uptime: process.uptime()
      },
      database: {
        sqlite: {
          connected: true,
          totalAgents: totalAgents,
          agentsByStatus: agentsByStatus
        },
        redis: redisStatus
      }
    });
  } catch (error) {
    console.error('Error in /api/status:', error);
    res.status(500).json({
      error: 'Failed to retrieve status',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Initialize connections and start server
async function startServer() {
  try {
    console.log('🚀 Starting Dashboard Backend Server...');
    
    // Initialize database connections
    await initializeSQLite();
    await initializeRedis();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log('📊 Available endpoints:');
      console.log('   GET /api/agents     - SQLite agents data');
      console.log('   GET /api/redis/signals - Redis swarm signals');
      console.log('   GET /api/status     - Combined status');
      console.log('   GET /health         - Health check');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
  }
  
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing SQLite database:', err.message);
      } else {
        console.log('✅ SQLite database connection closed');
      }
    });
  }
  
  process.exit(0);
});

// Start the server
startServer();