import { Router } from 'express';
import { broadcastAgentUpdate, broadcastActivityUpdate } from '../index';

const router = Router();

// Mock data for hybrid workers
const mockHybridWorkers = [
  {
    id: 'test-worker-1',
    subtask: 'hybrid-routing-test',
    provider: 'claude-flow-novice',
    confidence: 0.85,
    tokens: 1000000,
    cost: 0.50,
    duration: '1.2s',
    status: 'running',
    isHybrid: true,
    metadata: {
      mode: 'mvp',
      gateThreshold: 0.70,
      consensusThreshold: 0.80,
      validators: 2
    }
  },
  {
    id: 'test-worker-2',
    subtask: 'hybrid-routing-test',
    provider: 'claude-flow-novice',
    confidence: 0.82,
    tokens: 800000,
    cost: 0.40,
    duration: '0.9s',
    status: 'running',
    isHybrid: true,
    metadata: {
      mode: 'mvp',
      gateThreshold: 0.70,
      consensusThreshold: 0.80,
      validators: 2
    }
  },
  {
    id: 'test-worker-3',
    subtask: 'hybrid-routing-test',
    provider: 'claude-flow-novice',
    confidence: 0.88,
    tokens: 1200000,
    cost: 0.60,
    duration: '1.5s',
    status: 'running',
    isHybrid: true,
    metadata: {
      mode: 'mvp',
      gateThreshold: 0.70,
      consensusThreshold: 0.80,
      validators: 2
    }
  }
];

// GET /api/coordinator/workers - Get all workers
router.get('/workers', (req, res) => {
  const { showHybrid } = req.query;
  
  let workers = mockHybridWorkers;
  
  if (showHybrid === 'false') {
    workers = workers.filter(w => !w.isHybrid);
  }
  
  res.json({
    success: true,
    data: workers,
    total: workers.length,
    timestamp: new Date().toISOString()
  });
});

// POST /api/coordinator/workers - Register a new worker
router.post('/workers', (req, res) => {
  const workerData = req.body;
  
  const newWorker = {
    id: workerData.id || `worker-${Date.now()}`,
    subtask: workerData.subtask || 'unknown',
    provider: workerData.provider || 'unknown',
    confidence: workerData.confidence || 0.5,
    tokens: workerData.tokens || 0,
    cost: (workerData.tokens || 0) * 0.50 / 1000000, // $0.50 per 1M tokens
    duration: workerData.duration || '0s',
    status: 'running',
    isHybrid: workerData.isHybrid || true,
    metadata: workerData.metadata || {},
    createdAt: new Date().toISOString()
  };
  
  mockHybridWorkers.push(newWorker);

  // Broadcast update to connected clients
  broadcastAgentUpdate(newWorker);

  // Broadcast activity update
  broadcastActivityUpdate({
    id: `activity-${Date.now()}`,
    timestamp: new Date().toISOString(),
    message: `Agent ${newWorker.id} started with ${(newWorker.confidence * 100).toFixed(0)}% confidence`,
    type: 'success'
  });

  res.json({
    success: true,
    data: newWorker,
    message: 'Worker registered successfully'
  });
});

// GET /api/coordinator/workers/:id - Get specific worker
router.get('/workers/:id', (req, res) => {
  const { id } = req.params;
  const worker = mockHybridWorkers.find(w => w.id === id);

  if (!worker) {
    return res.status(404).json({
      success: false,
      message: 'Worker not found'
    });
  }

  res.json({
    success: true,
    data: worker
  });
});

// GET /api/coordinator/metrics - Get dashboard metrics
router.get('/metrics', (req, res) => {
  const activeAgents = mockHybridWorkers.filter(w => w.status === 'running').length;
  const completedAgents = mockHybridWorkers.filter(w => w.status === 'completed').length;
  const failedAgents = mockHybridWorkers.filter(w => w.status === 'failed').length;
  const totalCost = mockHybridWorkers.reduce((sum, w) => sum + w.cost, 0);
  const totalTokens = mockHybridWorkers.reduce((sum, w) => sum + w.tokens, 0);
  const avgConfidence = mockHybridWorkers.length > 0
    ? mockHybridWorkers.reduce((sum, w) => sum + w.confidence, 0) / mockHybridWorkers.length
    : 0;

  res.json({
    success: true,
    data: {
      activeAgents,
      completedAgents,
      failedAgents,
      totalCost,
      totalTokens,
      avgConfidence
    }
  });
});

export default router;