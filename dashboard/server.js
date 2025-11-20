#!/usr/bin/env node

/**
 * CFN Loop Dashboard Server
 * 
 * Main Express server for the CFN Loop logging dashboard.
 * Provides REST API endpoints and WebSocket support for real-time updates.
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Import API endpoints
const apiEndpoints = require('./api/endpoints');

// Configuration
const PORT = process.env.DASHBOARD_PORT || 3002;
const DB_PATH = path.join(__dirname, '../.claude/cfn-data/cfn-loop.db');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time updates
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Database connection
let db;

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // Ensure database directory exists
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Database connection error:', err.message);
                reject(err);
            } else {
                console.log('Connected to SQLite database');
                // Initialize tables if they don't exist
                initializeTables().then(resolve).catch(reject);
            }
        });
    });
}

function initializeTables() {
    return new Promise((resolve, reject) => {
        const createTables = `
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                confidence REAL,
                spawned_at TEXT,
                completed_at TEXT,
                task_id TEXT,
                iteration INTEGER,
                metadata TEXT
            );
            
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                agent_id TEXT,
                loop TEXT,
                iteration INTEGER,
                event_type TEXT NOT NULL,
                level TEXT DEFAULT 'INFO',
                message TEXT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT
            );
            
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                description TEXT,
                mode TEXT,
                status TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                current_iteration INTEGER DEFAULT 1,
                max_iterations INTEGER DEFAULT 10
            );
        `;

        db.exec(createTables, (err) => {
            if (err) {
                console.error('Table creation error:', err.message);
                reject(err);
            } else {
                console.log('Database tables initialized');
                resolve();
            }
        });
    });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        database: db ? 'connected' : 'disconnected'
    });
});

// API routes
app.use('/api', apiEndpoints(db, io));

// Serve main dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected to WebSocket:', socket.id);
    
    // Join room for real-time task updates
    socket.on('subscribe-task', (taskId) => {
        socket.join(`task-${taskId}`);
        console.log(`Socket ${socket.id} subscribed to task ${taskId}`);
    });
    
    // Unsubscribe from task updates
    socket.on('unsubscribe-task', (taskId) => {
        socket.leave(`task-${taskId}`);
        console.log(`Socket ${socket.id} unsubscribed from task ${taskId}`);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Utility function to broadcast updates to connected clients
function broadcastTaskUpdate(taskId, update) {
    io.to(`task-${taskId}`).emit('task-update', {
        taskId,
        ...update,
        timestamp: new Date().toISOString()
    });
}

// Function to broadcast event updates
function broadcastEvent(event) {
    io.emit('new-event', {
        ...event,
        timestamp: new Date().toISOString()
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed');
            }
        });
    }
    
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.emit('SIGTERM');
});

// Start server
async function startServer() {
    try {
        await initializeDatabase();
        
        server.listen(PORT, () => {
            console.log(`CFN Loop Dashboard server running on port ${PORT}`);
            console.log(`Dashboard available at http://localhost:${PORT}`);
            console.log(`API endpoints available at http://localhost:${PORT}/api`);
            console.log(`WebSocket server ready for real-time updates`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Export database instance and broadcast functions for use in other modules
module.exports = {
    db: () => db,
    broadcastTaskUpdate,
    broadcastEvent,
    io
};

// Start the server if this file is run directly
if (require.main === module) {
    startServer();
}