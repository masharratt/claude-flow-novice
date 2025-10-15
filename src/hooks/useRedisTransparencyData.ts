import { useState, useEffect, useCallback, useMemo } from 'react';

// Types for Redis transparency data
interface PredictiveModel {
  id: string;
  name: string;
  type: 'regression' | 'classification' | 'time_series';
  accuracy: number;
  confidence: number;
  lastTrained: string;
  trainingDataPoints: number;
  features: string[];
  status: 'active' | 'training' | 'error' | 'needs_retraining';
}

interface Prediction {
  id: string;
  modelId: string;
  timestamp: string;
  inputValue: number;
  predictedValue: number;
  actualValue?: number;
  confidence: number;
  features: Record<string, number>;
  error?: number;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
  lastActive: string;
  workload: number;
}

interface CollaborationEvent {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  type: 'message' | 'task_handoff' | 'data_share' | 'coordination' | 'review';
  timestamp: string;
  duration?: number;
  success: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

interface Anomaly {
  id: string;
  type: 'latency' | 'error_rate' | 'memory_usage' | 'cpu_usage' | 'throughput' | 'connection_count';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: string;
  value: number;
  threshold: number;
  expectedValue: number;
  confidence: number;
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  source: string;
  affectedComponents: string[];
  metadata: Record<string, any>;
}

interface PerformanceMetric {
  timestamp: string;
  metric: string;
  value: number;
  unit: string;
  threshold?: number;
  baseline?: number;
}

interface ResourceUsage {
  timestamp: string;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  connections: number;
}

interface TransparencyData {
  predictiveModels: PredictiveModel[];
  predictions: Prediction[];
  agents: Agent[];
  collaborationEvents: CollaborationEvent[];
  anomalies: Anomaly[];
  performanceMetrics: PerformanceMetric[];
  resourceUsage: ResourceUsage[];
  lastUpdated: string;
}

interface UseRedisTransparencyDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  timeRange?: string;
  filters?: {
    agentIds?: string[];
    anomalyTypes?: string[];
    severity?: string[];
  };
}

interface UseRedisTransparencyDataReturn {
  data: TransparencyData | null;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  updateFilters: (filters: Partial<UseRedisTransparencyDataOptions['filters']>) => void;
  updateTimeRange: (timeRange: string) => void;
  summary: {
    totalModels: number;
    activeModels: number;
    totalAgents: number;
    onlineAgents: number;
    totalAnomalies: number;
    criticalAnomalies: number;
    avgLatency: number;
    systemHealth: number;
  };
}

// Mock data generator for development
const generateMockData = (): TransparencyData => {
  const now = new Date();
  
  // Generate predictive models
  const predictiveModels: PredictiveModel[] = [
    {
      id: 'model-1',
      name: 'Latency Prediction Model',
      type: 'regression',
      accuracy: 0.94,
      confidence: 0.87,
      lastTrained: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      trainingDataPoints: 50000,
      features: ['cpu_usage', 'memory_usage', 'connection_count', 'request_rate'],
      status: 'active'
    },
    {
      id: 'model-2',
      name: 'Anomaly Detection Model',
      type: 'classification',
      accuracy: 0.91,
      confidence: 0.92,
      lastTrained: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      trainingDataPoints: 75000,
      features: ['latency', 'error_rate', 'throughput', 'resource_usage'],
      status: 'active'
    },
    {
      id: 'model-3',
      name: 'Resource Forecast Model',
      type: 'time_series',
      accuracy: 0.88,
      confidence: 0.79,
      lastTrained: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      trainingDataPoints: 100000,
      features: ['historical_usage', 'time_of_day', 'day_of_week', 'seasonal_patterns'],
      status: 'training'
    }
  ];

  // Generate predictions
  const predictions: Prediction[] = Array.from({ length: 100 }, (_, i) => ({
    id: `prediction-${i}`,
    modelId: predictiveModels[i % 3].id,
    timestamp: new Date(now.getTime() - i * 5 * 60 * 1000).toISOString(),
    inputValue: Math.random() * 100,
    predictedValue: 45 + Math.random() * 20,
    actualValue: i % 3 === 0 ? undefined : 45 + Math.random() * 25,
    confidence: 0.7 + Math.random() * 0.3,
    features: {
      cpu_usage: Math.random() * 100,
      memory_usage: Math.random() * 100,
      connection_count: Math.floor(Math.random() * 1000)
    }
  }));

  // Generate agents
  const agents: Agent[] = [
    {
      id: 'agent-1',
      name: 'React Frontend Engineer',
      role: 'react-frontend-engineer',
      status: 'online',
      capabilities: ['react', 'typescript', 'css', 'testing'],
      lastActive: now.toISOString(),
      workload: 75
    },
    {
      id: 'agent-2',
      name: 'Backend Developer',
      role: 'backend-dev',
      status: 'online',
      capabilities: ['nodejs', 'database', 'api', 'redis'],
      lastActive: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      workload: 60
    },
    {
      id: 'agent-3',
      name: 'System Architect',
      role: 'system-architect',
      status: 'busy',
      capabilities: ['architecture', 'scalability', 'security', 'performance'],
      lastActive: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      workload: 90
    },
    {
      id: 'agent-4',
      name: 'Security Specialist',
      role: 'security-specialist',
      status: 'online',
      capabilities: ['security', 'audit', 'compliance', 'penetration_testing'],
      lastActive: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      workload: 45
    },
    {
      id: 'agent-5',
      name: 'Data Analyst',
      role: 'analyst',
      status: 'offline',
      capabilities: ['analytics', 'reporting', 'visualization', 'statistics'],
      lastActive: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      workload: 0
    }
  ];

  // Generate collaboration events
  const collaborationEvents: CollaborationEvent[] = Array.from({ length: 50 }, (_, i) => ({
    id: `event-${i}`,
    sourceAgentId: agents[Math.floor(Math.random() * agents.length)].id,
    targetAgentId: agents[Math.floor(Math.random() * agents.length)].id,
    type: ['message', 'task_handoff', 'data_share', 'coordination', 'review'][Math.floor(Math.random() * 5)] as any,
    timestamp: new Date(now.getTime() - i * 15 * 60 * 1000).toISOString(),
    duration: Math.floor(Math.random() * 5000),
    success: Math.random() > 0.1,
    priority: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as any,
    metadata: {
      taskId: `task-${Math.floor(Math.random() * 100)}`,
      projectId: `project-${Math.floor(Math.random() * 10)}`
    }
  }));

  // Generate anomalies
  const anomalies: Anomaly[] = [
    {
      id: 'anomaly-1',
      type: 'latency',
      severity: 'high',
      title: 'High Latency Detected',
      description: 'API latency exceeded 200ms threshold for 5 consecutive minutes',
      timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      value: 245,
      threshold: 200,
      expectedValue: 85,
      confidence: 0.92,
      status: 'active',
      source: 'api-gateway',
      affectedComponents: ['user-service', 'database'],
      metadata: {
        endpoint: '/api/users',
        method: 'GET'
      }
    },
    {
      id: 'anomaly-2',
      type: 'memory_usage',
      severity: 'medium',
      title: 'Memory Usage Spike',
      description: 'Memory usage increased by 40% in the last hour',
      timestamp: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
      value: 85,
      threshold: 80,
      expectedValue: 60,
      confidence: 0.87,
      status: 'investigating',
      source: 'worker-service',
      affectedComponents: ['worker-service'],
      metadata: {
        process_id: '1234',
        memory_leak_detected: true
      }
    },
    {
      id: 'anomaly-3',
      type: 'error_rate',
      severity: 'critical',
      title: 'Error Rate Surge',
      description: 'Error rate increased to 15% from normal 1%',
      timestamp: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      value: 15,
      threshold: 5,
      expectedValue: 1,
      confidence: 0.95,
      status: 'resolved',
      source: 'payment-service',
      affectedComponents: ['payment-service', 'database'],
      metadata: {
        error_type: 'connection_timeout',
        affected_transactions: 245
      }
    }
  ];

  // Generate performance metrics
  const performanceMetrics: PerformanceMetric[] = Array.from({ length: 200 }, (_, i) => ({
    timestamp: new Date(now.getTime() - i * 2 * 60 * 1000).toISOString(),
    metric: ['latency', 'throughput', 'error_rate'][Math.floor(Math.random() * 3)],
    value: Math.random() * 100,
    unit: ['ms', 'req/s', '%'][Math.floor(Math.random() * 3)],
    threshold: Math.random() * 80 + 20,
    baseline: Math.random() * 50 + 25
  }));

  // Generate resource usage
  const resourceUsage: ResourceUsage[] = Array.from({ length: 100 }, (_, i) => ({
    timestamp: new Date(now.getTime() - i * 5 * 60 * 1000).toISOString(),
    cpu: Math.random() * 100,
    memory: Math.random() * 100,
    disk: Math.random() * 100,
    network: Math.random() * 100,
    connections: Math.floor(Math.random() * 1000)
  }));

  return {
    predictiveModels,
    predictions,
    agents,
    collaborationEvents,
    anomalies,
    performanceMetrics,
    resourceUsage,
    lastUpdated: now.toISOString()
  };
};

export const useRedisTransparencyData = (
  options: UseRedisTransparencyDataOptions = {}
): UseRedisTransparencyDataReturn => {
  const {
    autoRefresh = true,
    refreshInterval = 30000, // 30 seconds
    timeRange = '24h',
    filters = {}
  } = options;

  const [data, setData] = useState<TransparencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFilters, setCurrentFilters] = useState(filters);
  const [currentTimeRange, setCurrentTimeRange] = useState(timeRange);

  // Fetch data from API or use mock data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // In a real implementation, this would be an API call
      // const response = await fetch(`/api/redis-transparency/data?timeRange=${currentTimeRange}&filters=${JSON.stringify(currentFilters)}`);
      // if (!response.ok) throw new Error('Failed to fetch data');
      // const result = await response.json();

      // For now, use mock data
      const result = generateMockData();
      
      // Apply filters
      let filteredData = { ...result };
      
      if (currentFilters.agentIds?.length) {
        filteredData.agents = result.agents.filter(agent => 
          currentFilters.agentIds!.includes(agent.id)
        );
        filteredData.collaborationEvents = result.collaborationEvents.filter(event =>
          currentFilters.agentIds!.includes(event.sourceAgentId) ||
          currentFilters.agentIds!.includes(event.targetAgentId)
        );
      }
      
      if (currentFilters.anomalyTypes?.length) {
        filteredData.anomalies = result.anomalies.filter(anomaly =>
          currentFilters.anomalyTypes!.includes(anomaly.type)
        );
      }
      
      if (currentFilters.severity?.length) {
        filteredData.anomalies = filteredData.anomalies.filter(anomaly =>
          currentFilters.severity!.includes(anomaly.severity)
        );
      }

      setData(filteredData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Failed to fetch Redis transparency data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentTimeRange, currentFilters]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!data) {
      return {
        totalModels: 0,
        activeModels: 0,
        totalAgents: 0,
        onlineAgents: 0,
        totalAnomalies: 0,
        criticalAnomalies: 0,
        avgLatency: 0,
        systemHealth: 0
      };
    }

    const totalModels = data.predictiveModels.length;
    const activeModels = data.predictiveModels.filter(m => m.status === 'active').length;
    const totalAgents = data.agents.length;
    const onlineAgents = data.agents.filter(a => a.status === 'online').length;
    const totalAnomalies = data.anomalies.length;
    const criticalAnomalies = data.anomalies.filter(a => a.severity === 'critical').length;
    
    const latencyMetrics = data.performanceMetrics.filter(m => m.metric === 'latency');
    const avgLatency = latencyMetrics.length > 0 
      ? latencyMetrics.reduce((sum, m) => sum + m.value, 0) / latencyMetrics.length 
      : 0;

    // Calculate system health score (0-100)
    const healthFactors = [
      activeModels / totalModels, // Model availability
      onlineAgents / totalAgents, // Agent availability
      Math.max(0, 1 - (criticalAnomalies / Math.max(totalAnomalies, 1))), // Anomaly impact
      Math.max(0, 1 - (avgLatency / 200)) // Latency impact (200ms as baseline)
    ];
    
    const systemHealth = Math.round(
      healthFactors.reduce((sum, factor) => sum + factor, 0) / healthFactors.length * 100
    );

    return {
      totalModels,
      activeModels,
      totalAgents,
      onlineAgents,
      totalAnomalies,
      criticalAnomalies,
      avgLatency,
      systemHealth
    };
  }, [data]);

  const refreshData = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const updateFilters = useCallback((newFilters: Partial<UseRedisTransparencyDataOptions['filters']>) => {
    setCurrentFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const updateTimeRange = useCallback((newTimeRange: string) => {
    setCurrentTimeRange(newTimeRange);
  }, []);

  return {
    data,
    loading,
    error,
    refreshData,
    updateFilters,
    updateTimeRange,
    summary
  };
};

export default useRedisTransparencyData;