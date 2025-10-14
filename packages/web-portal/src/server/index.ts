import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Import routes
import agentsRouter from './api/agents';
import coordinatorRouter from './api/coordinator';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? false
      : ["http://localhost:3001", "http://localhost:3000", "http://localhost:3002"],
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/agents', agentsRouter);
app.use('/api/coordinator', coordinatorRouter);

// Serve static files from client build
app.use(express.static('dist/client'));

// Handle client-side routing
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'dist/client' });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-agents-view', () => {
    socket.join('agents-view');
    console.log(`Client ${socket.id} joined agents view`);
  });

  socket.on('join-dashboard', () => {
    socket.join('dashboard');
    console.log(`Client ${socket.id} joined dashboard`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Broadcast function for agent updates
export const broadcastAgentUpdate = (agentData: any) => {
  io.to('agents-view').emit('agent-update', agentData);
};

// Broadcast function for dashboard metrics updates
export const broadcastMetricsUpdate = (metricsData: any) => {
  io.to('dashboard').emit('metrics-update', metricsData);
};

// Broadcast function for activity updates
export const broadcastActivityUpdate = (activity: any) => {
  io.to('dashboard').emit('activity-update', activity);
};

const PORT = process.env.PORT || 3002;

server.listen(PORT, () => {
  console.log(`🚀 Web Portal Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🌐 Client served at: http://localhost:${PORT}`);
});

export default app;