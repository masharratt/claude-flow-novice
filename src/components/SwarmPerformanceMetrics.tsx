import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  ReferenceLine
} from 'recharts';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Cpu,
  Memory,
  Zap,
  Clock,
  Users,
  CheckCircle,
  AlertCircle,
  Timer,
  BarChart3,
  PieChart as PieChartIcon,
  Download,
  RefreshCw
} from 'lucide-react';

interface PerformanceMetrics {
  timestamp: number;
  agents: {
    total: number;
    active: number;
    processing: number;
    idle: number;
    error: number;
  };
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
  };
  performance: {
    processingTime: number;
    networkLatency: number;
    throughput: number;
    successRate: number;
    averageConfidence: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    networkUsage: number;
    diskUsage: number;
  };
  quality: {
    codeQuality: number;
    testCoverage: number;
    securityScore: number;
    performanceScore: number;
  };
}

interface SwarmPerformanceMetricsProps {
  metrics: PerformanceMetrics[];
  historicalData?: PerformanceMetrics[];
  timeRange?: '1m' | '5m' | '15m' | '1h' | 'all';
  refreshInterval?: number;
  className?: string;
}

const SwarmPerformanceMetrics: React.FC<SwarmPerformanceMetricsProps> = ({
  metrics,
  historicalData = [],
  timeRange = '5m',
  refreshInterval = 1000,
  className
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Filter data based on time range
  const filteredData = useMemo(() => {
    const now = Date.now();
    const rangeMs = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      'all': Infinity
    }[selectedTimeRange];

    return historicalData.filter(m => now - m.timestamp <= rangeMs);
  }, [historicalData, selectedTimeRange]);

  // Current metrics (latest)
  const currentMetrics = useMemo(() => {
    if (metrics.length > 0) {
      return metrics[metrics.length - 1];
    }
    return filteredData[filteredData.length - 1] || {
      timestamp: Date.now(),
      agents: { total: 0, active: 0, processing: 0, idle: 0, error: 0 },
      tasks: { total: 0, completed: 0, inProgress: 0, pending: 0, failed: 0 },
      performance: { processingTime: 0, networkLatency: 0, throughput: 0, successRate: 0, averageConfidence: 0 },
      resources: { memoryUsage: 0, cpuUsage: 0, networkUsage: 0, diskUsage: 0 },
      quality: { codeQuality: 0, testCoverage: 0, securityScore: 0, performanceScore: 0 }
    };
  }, [metrics, filteredData]);

  // Auto-refresh
  useEffect(() => {
    if (isAutoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        setLastUpdate(new Date());
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, refreshInterval]);

  // Chart data preparation
  const timelineData = useMemo(() => {
    return filteredData.map(m => ({
      timestamp: new Date(m.timestamp).toLocaleTimeString(),
      processingTime: m.performance.processingTime,
      networkLatency: m.performance.networkLatency,
      throughput: m.performance.throughput,
      successRate: m.performance.successRate * 100,
      memoryUsage: m.resources.memoryUsage,
      cpuUsage: m.resources.cpuUsage,
      activeAgents: m.agents.active,
      completedTasks: m.tasks.completed,
      averageConfidence: m.performance.averageConfidence * 100
    }));
  }, [filteredData]);

  const agentStatusData = useMemo(() => [
    { name: 'Active', value: currentMetrics.agents.active, color: '#10b981' },
    { name: 'Processing', value: currentMetrics.agents.processing, color: '#3b82f6' },
    { name: 'Idle', value: currentMetrics.agents.idle, color: '#6b7280' },
    { name: 'Error', value: currentMetrics.agents.error, color: '#ef4444' }
  ], [currentMetrics.agents]);

  const taskStatusData = useMemo(() => [
    { name: 'Completed', value: currentMetrics.tasks.completed, color: '#10b981' },
    { name: 'In Progress', value: currentMetrics.tasks.inProgress, color: '#3b82f6' },
    { name: 'Pending', value: currentMetrics.tasks.pending, color: '#f59e0b' },
    { name: 'Failed', value: currentMetrics.tasks.failed, color: '#ef4444' }
  ], [currentMetrics.tasks]);

  const qualityMetricsData = useMemo(() => [
    { name: 'Code Quality', value: currentMetrics.quality.codeQuality, color: '#8b5cf6' },
    { name: 'Test Coverage', value: currentMetrics.quality.testCoverage, color: '#06b6d4' },
    { name: 'Security', value: currentMetrics.quality.securityScore, color: '#10b981' },
    { name: 'Performance', value: currentMetrics.quality.performanceScore, color: '#f59e0b' }
  ], [currentMetrics.quality]);

  // Metric card component
  const MetricCard = ({ title, value, unit, icon, trend, color }: {
    title: string;
    value: number | string;
    unit?: string;
    icon: React.ReactNode;
    trend?: { value: number; direction: 'up' | 'down' };
    color?: string;
  }) => (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold">{value}</span>
              {unit && <span className="text-sm text-gray-500">{unit}</span>}
            </div>
            {trend && (
              <div className={`flex items-center text-xs ${
                trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
              }`}>
                {trend.direction === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {Math.abs(trend.value)}%
              </div>
            )}
          </div>
          <div className={`p-2 rounded-lg ${color || 'bg-blue-50'}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Export data
  const exportData = () => {
    const dataStr = JSON.stringify(filteredData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swarm-metrics-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Performance Metrics
          </h2>
          <Badge variant="outline" className="text-sm">
            {filteredData.length} data points
          </Badge>
          {isAutoRefresh && (
            <Badge variant="outline" className="text-green-600">
              Live
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            className="px-3 py-1 border rounded text-sm"
          >
            <option value="1m">Last 1 min</option>
            <option value="5m">Last 5 min</option>
            <option value="15m">Last 15 min</option>
            <option value="1h">Last 1 hour</option>
            <option value="all">All time</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isAutoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>

          <div className="text-xs text-gray-500">
            Last update: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Agents"
          value={currentMetrics.agents.active}
          unit={`/ ${currentMetrics.agents.total}`}
          icon={<Users className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <MetricCard
          title="Success Rate"
          value={(currentMetrics.performance.successRate * 100).toFixed(1)}
          unit="%"
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          color="bg-green-50"
        />
        <MetricCard
          title="Avg Processing Time"
          value={currentMetrics.performance.processingTime}
          unit="ms"
          icon={<Timer className="w-5 h-5 text-yellow-600" />}
          color="bg-yellow-50"
        />
        <MetricCard
          title="Avg Confidence"
          value={(currentMetrics.performance.averageConfidence * 100).toFixed(1)}
          unit="%"
          icon={<Activity className="w-5 h-5 text-purple-600" />}
          color="bg-purple-50"
        />
      </div>

      {/* Detailed Metrics Tabs */}
      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="agents">Agent Status</TabsTrigger>
          <TabsTrigger value="tasks">Task Flow</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Processing Time & Latency</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="processingTime"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Processing Time (ms)"
                    />
                    <Line
                      type="monotone"
                      dataKey="networkLatency"
                      stroke="#ef4444"
                      strokeWidth={2}
                      name="Network Latency (ms)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Throughput & Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="throughput"
                      stackId="1"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.6}
                      name="Throughput (tasks/s)"
                    />
                    <Line
                      type="monotone"
                      dataKey="successRate"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      name="Success Rate (%)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Agent Status Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Agent Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={agentStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {agentStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Agents Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="activeAgents"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                      name="Active Agents"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Task Flow Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Task Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={taskStatusData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8884d8">
                      {taskStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Completed Tasks Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="completedTasks"
                      stroke="#10b981"
                      strokeWidth={2}
                      name="Completed Tasks"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Resource Usage Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="memoryUsage"
                      stackId="1"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.6}
                      name="Memory Usage (%)"
                    />
                    <Area
                      type="monotone"
                      dataKey="cpuUsage"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.6}
                      name="CPU Usage (%)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Resource Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Memory Usage</span>
                    <span className="text-sm">{currentMetrics.resources.memoryUsage}%</span>
                  </div>
                  <Progress value={currentMetrics.resources.memoryUsage} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">CPU Usage</span>
                    <span className="text-sm">{currentMetrics.resources.cpuUsage}%</span>
                  </div>
                  <Progress value={currentMetrics.resources.cpuUsage} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Network Usage</span>
                    <span className="text-sm">{currentMetrics.resources.networkUsage}%</span>
                  </div>
                  <Progress value={currentMetrics.resources.networkUsage} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Disk Usage</span>
                    <span className="text-sm">{currentMetrics.resources.diskUsage}%</span>
                  </div>
                  <Progress value={currentMetrics.resources.diskUsage} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Quality Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={qualityMetricsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8884d8">
                      {qualityMetricsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                    <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 5" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confidence Score Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="averageConfidence"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      name="Avg Confidence (%)"
                    />
                    <ReferenceLine y={85} stroke="#10b981" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SwarmPerformanceMetrics;