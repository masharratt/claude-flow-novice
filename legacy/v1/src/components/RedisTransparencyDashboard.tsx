import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter
} from 'recharts';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Filter,
  Download,
  Settings,
  Zap,
  Database,
  Shield,
  Eye,
  BarChart3,
  PieChartIcon,
  LineChartIcon
} from 'lucide-react';

// Types
interface PredictiveModel {
  id: string;
  name: string;
  accuracy: number;
  confidence: number;
  lastTrained: string;
  status: 'active' | 'training' | 'error';
  predictions: PredictionData[];
}

interface PredictionData {
  timestamp: string;
  predicted: number;
  actual: number;
  confidence: number;
}

interface AgentCollaboration {
  agentId: string;
  agentName: string;
  role: string;
  collaborations: number;
  successRate: number;
  avgResponseTime: number;
  lastActive: string;
  status: 'online' | 'offline' | 'busy';
}

interface PerformanceMetric {
  timestamp: string;
  latency: number;
  throughput: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

interface Anomaly {
  id: string;
  type: 'latency' | 'error' | 'memory' | 'throughput';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  value: number;
  threshold: number;
  status: 'active' | 'resolved' | 'investigating';
}

interface DashboardData {
  predictiveModels: PredictiveModel[];
  agentCollaborations: AgentCollaboration[];
  performanceMetrics: PerformanceMetric[];
  anomalies: Anomaly[];
  summary: {
    totalAgents: number;
    activeModels: number;
    anomalyCount: number;
    avgLatency: number;
    systemHealth: number;
  };
}

const RedisTransparencyDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/redis-transparency/dashboard');
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      const dashboardData = await response.json();
      setData(dashboardData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchDashboardData, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboardData]);

  // Calculate system health
  const systemHealth = useMemo(() => {
    if (!data) return 0;
    const { avgLatency, anomalyCount, totalAgents } = data.summary;
    const latencyScore = Math.max(0, 100 - (avgLatency / 10));
    const anomalyScore = Math.max(0, 100 - (anomalyCount * 10));
    const agentScore = totalAgents > 0 ? 100 : 0;
    return Math.round((latencyScore + anomalyScore + agentScore) / 3);
  }, [data]);

  // Prepare chart data
  const performanceChartData = useMemo(() => {
    if (!data) return [];
    return data.performanceMetrics.map(metric => ({
      ...metric,
      time: new Date(metric.timestamp).toLocaleTimeString()
    }));
  }, [data]);

  const collaborationData = useMemo(() => {
    if (!data) return [];
    return data.agentCollaborations.map(agent => ({
      name: agent.agentName,
      collaborations: agent.collaborations,
      successRate: agent.successRate,
      responseTime: agent.avgResponseTime
    }));
  }, [data]);

  const anomalyDistribution = useMemo(() => {
    if (!data) return [];
    const distribution = data.anomalies.reduce((acc, anomaly) => {
      acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(distribution).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / data.anomalies.length) * 100)
    }));
  }, [data]);

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  const handleExportData = async () => {
    try {
      const response = await fetch('/api/redis-transparency/export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `redis-transparency-${new Date().toISOString()}.json`;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="animate-spin h-8 w-8 text-blue-500" />
        <span className="ml-2 text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-700">Error loading dashboard: {error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Redis Transparency Dashboard</h1>
            <p className="text-gray-600 mt-1">Real-time monitoring and analytics</p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded-lg ${autoRefresh ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
            >
              <RefreshCw className={`h-5 w-5 ${autoRefresh ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExportData}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">System Health</p>
              <p className="text-2xl font-bold text-gray-900">{systemHealth}%</p>
            </div>
            <div className={`p-3 rounded-full ${systemHealth >= 80 ? 'bg-green-100' : systemHealth >= 60 ? 'bg-yellow-100' : 'bg-red-100'}`}>
              <Activity className={`h-6 w-6 ${systemHealth >= 80 ? 'text-green-600' : systemHealth >= 60 ? 'text-yellow-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Agents</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.totalAgents}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Models</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.activeModels}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Zap className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Anomalies</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.anomalyCount}</p>
            </div>
            <div className={`p-3 rounded-full ${data.summary.anomalyCount > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
              <AlertTriangle className={`h-6 w-6 ${data.summary.anomalyCount > 0 ? 'text-red-600' : 'text-green-600'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="flex space-x-1 p-1">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'models', label: 'Predictive Models', icon: TrendingUp },
            { id: 'collaboration', label: 'Collaboration', icon: Users },
            { id: 'performance', label: 'Performance', icon: Activity },
            { id: 'anomalies', label: 'Anomalies', icon: Shield }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Performance Chart */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Performance</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="latency" stroke="#3b82f6" name="Latency (ms)" />
                  <Line type="monotone" dataKey="throughput" stroke="#10b981" name="Throughput" />
                  <Line type="monotone" dataKey="errorRate" stroke="#ef4444" name="Error Rate (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Anomaly Distribution */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Anomaly Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={anomalyDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ type, percentage }) => `${type}: ${percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {anomalyDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Recent Anomalies */}
            <div className="bg-white rounded-lg shadow-sm p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Anomalies</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Type</th>
                      <th className="text-left py-2">Severity</th>
                      <th className="text-left py-2">Message</th>
                      <th className="text-left py-2">Time</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.anomalies.slice(0, 5).map((anomaly) => (
                      <tr key={anomaly.id} className="border-b">
                        <td className="py-2">{anomaly.type}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            anomaly.severity === 'critical' ? 'bg-red-100 text-red-700' :
                            anomaly.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                            anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {anomaly.severity}
                          </span>
                        </td>
                        <td className="py-2">{anomaly.message}</td>
                        <td className="py-2">{new Date(anomaly.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            anomaly.status === 'active' ? 'bg-red-100 text-red-700' :
                            anomaly.status === 'investigating' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {anomaly.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'models' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model List */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Predictive Models</h3>
              <div className="space-y-4">
                {data.predictiveModels.map((model) => (
                  <div
                    key={model.id}
                    className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedModel(model.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{model.name}</h4>
                      <span className={`px-2 py-1 rounded text-xs ${
                        model.status === 'active' ? 'bg-green-100 text-green-700' :
                        model.status === 'training' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {model.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Accuracy:</span>
                        <span className="ml-2 font-medium">{(model.accuracy * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Confidence:</span>
                        <span className="ml-2 font-medium">{(model.confidence * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Model Performance */}
            {selectedModel && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Performance</h3>
                {(() => {
                  const model = data.predictiveModels.find(m => m.id === selectedModel);
                  if (!model) return null;
                  return (
                    <ResponsiveContainer width="100%" height={300}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="predicted" name="Predicted" />
                        <YAxis dataKey="actual" name="Actual" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter
                          name="Predictions"
                          data={model.predictions}
                          fill="#3b82f6"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {activeTab === 'collaboration' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Agent Collaboration Metrics */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Collaboration Metrics</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={collaborationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="collaborations" fill="#3b82f6" name="Collaborations" />
                  <Bar dataKey="successRate" fill="#10b981" name="Success Rate (%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Agent Status */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Status</h3>
              <div className="space-y-3">
                {data.agentCollaborations.map((agent) => (
                  <div key={agent.agentId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${
                        agent.status === 'online' ? 'bg-green-500' :
                        agent.status === 'busy' ? 'bg-yellow-500' :
                        'bg-gray-500'
                      }`} />
                      <div>
                        <p className="font-medium text-gray-900">{agent.agentName}</p>
                        <p className="text-sm text-gray-600">{agent.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Response Time</p>
                      <p className="font-medium">{agent.avgResponseTime}ms</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Latency Trends */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Latency Trends</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={performanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="latency" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Resource Usage */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resource Usage</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="memoryUsage" stroke="#8b5cf6" name="Memory (%)" />
                  <Line type="monotone" dataKey="cpuUsage" stroke="#f59e0b" name="CPU (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'anomalies' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Anomaly Detection</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3">ID</th>
                    <th className="text-left py-3">Type</th>
                    <th className="text-left py-3">Severity</th>
                    <th className="text-left py-3">Message</th>
                    <th className="text-left py-3">Value</th>
                    <th className="text-left py-3">Threshold</th>
                    <th className="text-left py-3">Time</th>
                    <th className="text-left py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.anomalies.map((anomaly) => (
                    <tr key={anomaly.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">{anomaly.id}</td>
                      <td className="py-3">{anomaly.type}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          anomaly.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          anomaly.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                          anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {anomaly.severity}
                        </span>
                      </td>
                      <td className="py-3">{anomaly.message}</td>
                      <td className="py-3">{anomaly.value}</td>
                      <td className="py-3">{anomaly.threshold}</td>
                      <td className="py-3">{new Date(anomaly.timestamp).toLocaleString()}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          anomaly.status === 'active' ? 'bg-red-100 text-red-700' :
                          anomaly.status === 'investigating' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {anomaly.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RedisTransparencyDashboard;