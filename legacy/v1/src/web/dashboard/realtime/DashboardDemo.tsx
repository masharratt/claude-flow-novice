/**
 * Real-time Communication Dashboard Demo
 * Demonstrates WebSocket, SSE, and Custom Sync methods with real swarm data
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  BarChart3,
  Clock,
  Zap,
  Shield,
  Settings,
  Play,
  Pause,
  RotateCcw,
  TrendingUp,
  Users,
  MessageSquare,
  AlertCircle
} from 'lucide-react';

import { RealtimeCommunicationManager, CommunicationMethod } from './RealtimeCommunicationManager.js';
import { PerformanceBenchmark, BenchmarkResult } from './PerformanceBenchmark.js';

interface DemoStats {
  connected: boolean;
  method: CommunicationMethod;
  messagesReceived: number;
  latency: number;
  throughput: number;
  lastUpdate: Date;
  errors: number;
}

interface SwarmAgent {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'error';
  progress: number;
  lastActivity: Date;
  taskType: string;
}

interface DemoProps {
  initialMethod?: CommunicationMethod;
  autoBenchmark?: boolean;
  showRealData?: boolean;
}

export const DashboardDemo: React.FC<DemoProps> = ({
  initialMethod = 'auto',
  autoBenchmark = false,
  showRealData = false
}) => {
  const [manager, setManager] = useState<RealtimeCommunicationManager | null>(null);
  const [currentMethod, setCurrentMethod] = useState<CommunicationMethod>(initialMethod);
  const [stats, setStats] = useState<DemoStats>({
    connected: false,
    method: 'auto',
    messagesReceived: 0,
    latency: 0,
    throughput: 0,
    lastUpdate: new Date(),
    errors: 0
  });
  const [agents, setAgents] = useState<SwarmAgent[]>([]);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [liveData, setLiveData] = useState<any>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const benchmarkRef = useRef<PerformanceBenchmark | null>(null);
  const messageCountRef = useRef(0);
  const latencyBufferRef = useRef<number[]>([]);

  // Initialize communication manager
  useEffect(() => {
    const commManager = new RealtimeCommunicationManager({
      defaultMethod: currentMethod,
      autoSwitch: true,
      enablePerformanceMonitoring: true,
      onMethodChange: (method) => {
        console.log(`Communication method switched to: ${method}`);
        setCurrentMethod(method);
        setStats(prev => ({ ...prev, method }));
      },
      onError: (error, method) => {
        console.error(`Communication error with ${method}:`, error);
        setStats(prev => ({ ...prev, errors: prev.errors + 1 }));
      }
    });

    setManager(commManager);

    // Setup subscriptions
    const unsubscribe = setupSubscriptions(commManager);

    return () => {
      unsubscribe();
      commManager.destroy();
    };
  }, []);

  // Setup message subscriptions
  const setupSubscriptions = (commManager: RealtimeCommunicationManager) => {
    const unsubscribes = [];

    // Subscribe to swarm data
    unsubscribes.push(
      commManager.subscribe('swarm_update', (data) => {
        if (showRealData && data.agents) {
          setAgents(data.agents.map((agent: any) => ({
            id: agent.id,
            name: agent.name || `Agent ${agent.id}`,
            status: agent.status || 'idle',
            progress: agent.progress || 0,
            lastActivity: new Date(agent.lastActivity || Date.now()),
            taskType: agent.taskType || 'general'
          })));
        }
      })
    );

    // Subscribe to metrics
    unsubscribes.push(
      commManager.subscribe('metrics_update', (data) => {
        setLiveData(data);

        // Update stats
        messageCountRef.current++;
        setStats(prev => ({
          ...prev,
          messagesReceived: messageCountRef.current,
          lastUpdate: new Date(),
          throughput: calculateThroughput()
        }));
      })
    );

    // Subscribe to latency responses
    unsubscribes.push(
      commManager.subscribe('pong', (data) => {
        if (data.timestamp) {
          const latency = Date.now() - data.timestamp;
          latencyBufferRef.current.push(latency);

          // Keep only last 10 latency measurements
          if (latencyBufferRef.current.length > 10) {
            latencyBufferRef.current = latencyBufferRef.current.slice(-10);
          }

          const avgLatency = latencyBufferRef.current.reduce((sum, l) => sum + l, 0) / latencyBufferRef.current.length;
          setStats(prev => ({ ...prev, latency: Math.round(avgLatency) }));
        }
      })
    );

    // Subscribe to heartbeat
    unsubscribes.push(
      commManager.subscribe('heartbeat', (data) => {
        setStats(prev => ({ ...prev, lastUpdate: new Date() }));
      })
    );

    // Subscribe to test data
    unsubscribes.push(
      commManager.subscribe('test_data', (data) => {
        if (!showRealData) {
          // Generate mock agent data for demo
          setAgents(generateMockAgents(20));
        }
      })
    );

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  };

  // Calculate throughput
  const calculateThroughput = () => {
    // Simple throughput calculation based on recent message rate
    return Math.round(messageCountRef.current / 10); // messages per second
  };

  // Generate mock agents for demo
  const generateMockAgents = (count: number): SwarmAgent[] => {
    const statuses: ('active' | 'idle' | 'error')[] = ['active', 'idle', 'error'];
    const taskTypes = ['analysis', 'coding', 'testing', 'review', 'optimization'];

    return Array.from({ length: count }, (_, i) => ({
      id: `agent-${i + 1}`,
      name: `Agent ${i + 1}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      progress: Math.floor(Math.random() * 100),
      lastActivity: new Date(Date.now() - Math.random() * 60000),
      taskType: taskTypes[Math.floor(Math.random() * taskTypes.length)]
    }));
  };

  // Connect to communication method
  const handleConnect = async (method: CommunicationMethod) => {
    if (!manager) return;

    try {
      await manager.connect(method);
      setStats(prev => ({ ...prev, connected: true, method }));
    } catch (error) {
      console.error('Connection failed:', error);
      setStats(prev => ({ ...prev, connected: false, errors: prev.errors + 1 }));
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (!manager) return;

    try {
      await manager.disconnect();
      setStats(prev => ({ ...prev, connected: false }));
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  };

  // Send test message
  const handleSendTestMessage = () => {
    if (!manager || !stats.connected) return;

    const success = manager.sendMessage('test_message', {
      timestamp: Date.now(),
      type: 'dashboard_test',
      data: { message: 'Test from dashboard demo' }
    });

    if (!success) {
      console.warn('Failed to send test message');
    }
  };

  // Run performance benchmark
  const handleRunBenchmark = async () => {
    if (!manager) return;

    setIsBenchmarking(true);
    try {
      const benchmark = new PerformanceBenchmark({
        duration: 30000, // 30 seconds
        messageFrequency: 10,
        testScenarios: ['latency', 'throughput', 'reliability']
      });

      const result = await benchmark.runBenchmarkSuite();
      setBenchmarkResult(result);
    } catch (error) {
      console.error('Benchmark failed:', error);
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Switch communication method
  const handleSwitchMethod = async (method: CommunicationMethod) => {
    if (!manager) return;

    try {
      await manager.switchMethod(method);
    } catch (error) {
      console.error('Method switch failed:', error);
    }
  };

  // Reset stats
  const handleResetStats = () => {
    messageCountRef.current = 0;
    latencyBufferRef.current = [];
    setStats({
      connected: stats.connected,
      method: stats.method,
      messagesReceived: 0,
      latency: 0,
      throughput: 0,
      lastUpdate: new Date(),
      errors: 0
    });
    setBenchmarkResult(null);
  };

  // Generate mock agents on mount if not showing real data
  useEffect(() => {
    if (!showRealData) {
      setAgents(generateMockAgents(20));
    }
  }, [showRealData]);

  // Auto-benchmark on mount if enabled
  useEffect(() => {
    if (autoBenchmark && manager) {
      setTimeout(() => {
        handleRunBenchmark();
      }, 5000);
    }
  }, [autoBenchmark, manager]);

  const methodColors = {
    websocket: 'text-blue-600',
    sse: 'text-green-600',
    'custom-sync': 'text-purple-600',
    auto: 'text-gray-600'
  };

  const statusColors = {
    active: 'text-green-600 bg-green-50',
    idle: 'text-yellow-600 bg-yellow-50',
    error: 'text-red-600 bg-red-50'
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Real-time Communication Demo</h1>
              <p className="text-gray-600 mt-2">
                Testing WebSocket, Server-Sent Events, and Custom Sync methods
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 ${methodColors[currentMethod]}`}>
                {stats.connected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                <span className="font-medium capitalize">{currentMethod}</span>
              </div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Connection Controls */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Connection Control</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {(['websocket', 'sse', 'custom-sync'] as CommunicationMethod[]).map((method) => (
              <button
                key={method}
                onClick={() => handleConnect(method)}
                disabled={stats.connected && currentMethod === method}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  currentMethod === method
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                } disabled:opacity-50`}
              >
                <div className="flex flex-col items-center space-y-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    method === 'websocket' ? 'bg-blue-100' :
                    method === 'sse' ? 'bg-green-100' : 'bg-purple-100'
                  }`}>
                    {method === 'websocket' ? <Zap className="w-4 h-4" /> :
                     method === 'sse' ? <Activity className="w-4 h-4" /> :
                     <Shield className="w-4 h-4" />}
                  </div>
                  <span className="font-medium capitalize">{method}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={handleSendTestMessage}
              disabled={!stats.connected}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Send Test Message
            </button>
            <button
              onClick={handleDisconnect}
              disabled={!stats.connected}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Disconnect
            </button>
            <button
              onClick={handleResetStats}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Reset Stats
            </button>
            <button
              onClick={handleRunBenchmark}
              disabled={isBenchmarking || !stats.connected}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isBenchmarking ? (
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Benchmarking...</span>
                </div>
              ) : (
                'Run Benchmark'
              )}
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Messages Received</p>
                <p className="text-2xl font-bold text-gray-900">{stats.messagesReceived}</p>
              </div>
              <MessageSquare className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Average Latency</p>
                <p className="text-2xl font-bold text-gray-900">{stats.latency}ms</p>
              </div>
              <Clock className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Throughput</p>
                <p className="text-2xl font-bold text-gray-900">{stats.throughput} msg/s</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Errors</p>
                <p className="text-2xl font-bold text-gray-900">{stats.errors}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Swarm Agents */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Swarm Agents</h2>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Users className="w-4 h-4" />
              <span>{agents.length} agents</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{agent.name}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[agent.status]}`}>
                    {agent.status}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Task:</span>
                    <span className="text-gray-900">{agent.taskType}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Progress:</span>
                    <span className="text-gray-900">{agent.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        agent.status === 'active' ? 'bg-green-600' :
                        agent.status === 'idle' ? 'bg-yellow-600' : 'bg-red-600'
                      }`}
                      style={{ width: `${agent.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Benchmark Results */}
        {benchmarkResult && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Benchmark Results</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {benchmarkResult.summary.bestLatency?.toUpperCase()}
                </div>
                <p className="text-sm text-gray-600 mt-1">Best Latency</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {benchmarkResult.summary.bestThroughput?.toUpperCase()}
                </div>
                <p className="text-sm text-gray-600 mt-1">Best Throughput</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {benchmarkResult.summary.mostEfficient?.toUpperCase()}
                </div>
                <p className="text-sm text-gray-600 mt-1">Most Efficient</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Recommendation</h3>
              <p className="text-blue-800">{benchmarkResult.summary.recommendation}</p>
            </div>
          </div>
        )}

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Advanced Settings</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Auto-switch protocols</span>
                <button
                  onClick={() => handleSwitchMethod('auto')}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Enable Auto-switch
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-700">Last Update</span>
                <span className="text-gray-900">{stats.lastUpdate.toLocaleTimeString()}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-700">Connection Status</span>
                <span className={`font-medium ${stats.connected ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardDemo;