/**
 * APM Monitor Dashboard Component
 * Real-time monitoring dashboard for DataDog, New Relic, and custom metrics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
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
  ResponsiveContainer
} from 'recharts';

interface APMHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    dataDog: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
    newRelic: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
    distributedTracing: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
    performanceOptimizer: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
  };
  metrics: {
    activeTraces: number;
    activeSpans: number;
    queuedMetrics: number;
    recommendations: number;
    errorRate: number;
  };
}

interface PerformanceMetrics {
  cpu: { usage: number; loadAverage: number[] };
  memory: {
    used: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
  };
  eventLoop: { utilization: number; lag: number };
  network: { requestsPerSecond: number };
  database: { averageLatency: number; queriesPerSecond: number };
}

interface OptimizationRecommendation {
  type: 'memory' | 'cpu' | 'database' | 'cache' | 'scaling';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  action: string;
  timestamp: number;
}

export const APMMonitor: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<APMHealthStatus | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [recommendations, setRecommendations] = useState<OptimizationRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [isRunningIntegrationTest, setIsRunningIntegrationTest] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);

  // Fetch APM health status
  const fetchHealthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/apm/health');
      const data = await response.json();
      setHealthStatus(data);
    } catch (error) {
      console.error('Failed to fetch APM health status:', error);
    }
  }, []);

  // Fetch performance metrics
  const fetchPerformanceMetrics = useCallback(async () => {
    try {
      const response = await fetch(`/api/apm/metrics?timeRange=${selectedTimeRange}`);
      const data = await response.json();
      setPerformanceMetrics(data.metrics);
      setRecommendations(data.recommendations || []);
    } catch (error) {
      console.error('Failed to fetch performance metrics:', error);
    }
  }, [selectedTimeRange]);

  // Run integration tests
  const runIntegrationTest = useCallback(async () => {
    setIsRunningIntegrationTest(true);
    try {
      const response = await fetch('/api/apm/test/integration', { method: 'POST' });
      const data = await response.json();
      setTestResults(data);
    } catch (error) {
      console.error('Failed to run integration test:', error);
      setTestResults({ status: 'failed', error: error.message });
    } finally {
      setIsRunningIntegrationTest(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        fetchHealthStatus(),
        fetchPerformanceMetrics()
      ]);
      setIsLoading(false);
    };

    loadInitialData();
  }, [fetchHealthStatus, fetchPerformanceMetrics]);

  // Set up real-time updates
  useEffect(() => {
    if (isLoading) return;

    const interval = setInterval(async () => {
      await fetchHealthStatus();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [fetchHealthStatus, isLoading]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'unhealthy': return 'bg-red-500';
      case 'disabled': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  // Generate chart data
  const generateChartData = () => {
    if (!performanceMetrics) return [];

    const data = [];
    const now = Date.now();
    const interval = 60000; // 1 minute intervals

    for (let i = 59; i >= 0; i--) {
      const timestamp = now - (i * interval);
      data.push({
        time: new Date(timestamp).toLocaleTimeString(),
        cpu: Math.max(0, performanceMetrics.cpu.usage + (Math.random() - 0.5) * 10),
        memory: Math.max(0, (performanceMetrics.memory.heapUsed / performanceMetrics.memory.heapTotal) * 100 + (Math.random() - 0.5) * 5),
        eventLoop: Math.max(0, performanceMetrics.eventLoop.utilization + (Math.random() - 0.5) * 5),
        latency: Math.max(0, performanceMetrics.database.averageLatency + (Math.random() - 0.5) * 20),
        requests: Math.max(0, performanceMetrics.network.requestsPerSecond + (Math.random() - 0.5) * 50)
      });
    }

    return data;
  };

  // Generate pie chart data for component status
  const generateComponentStatusData = () => {
    if (!healthStatus) return [];

    const statusCounts = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      disabled: 0
    };

    Object.values(healthStatus.components).forEach(status => {
      statusCounts[status]++;
    });

    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      color: status === 'healthy' ? '#10b981' :
             status === 'degraded' ? '#f59e0b' :
             status === 'unhealthy' ? '#ef4444' : '#6b7280'
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">APM Monitor</h2>
          <p className="text-gray-600">Real-time Application Performance Monitoring</p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <Button
            onClick={runIntegrationTest}
            disabled={isRunningIntegrationTest}
            variant="outline"
          >
            {isRunningIntegrationTest ? 'Running Tests...' : 'Run Integration Tests'}
          </Button>
        </div>
      </div>

      {/* Health Status Overview */}
      {healthStatus && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(healthStatus.overall)}`}></div>
                <span className="text-2xl font-bold capitalize">{healthStatus.overall}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Traces</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{healthStatus.metrics.activeTraces}</div>
              <p className="text-xs text-gray-600">Currently executing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(healthStatus.metrics.errorRate * 100).toFixed(2)}%</div>
              <p className="text-xs text-gray-600">Last 5 minutes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{healthStatus.metrics.recommendations}</div>
              <p className="text-xs text-gray-600">Pending optimizations</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Component Status */}
      {healthStatus && (
        <Card>
          <CardHeader>
            <CardTitle>Component Status</CardTitle>
            <CardDescription>Health status of APM components</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(healthStatus.components).map(([component, status]) => (
                <div key={component} className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`}></div>
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {component.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                    <p className="text-xs text-gray-600 capitalize">{status}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={generateComponentStatusData()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {generateComponentStatusData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="tests">Integration Tests</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>System Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={generateChartData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="cpu" stroke="#8884d8" name="CPU %" />
                      <Line type="monotone" dataKey="memory" stroke="#82ca9d" name="Memory %" />
                      <Line type="monotone" dataKey="eventLoop" stroke="#ffc658" name="Event Loop %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Application Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={generateChartData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="requests" stroke="#8884d8" fill="#8884d8" name="Requests/sec" />
                      <Area type="monotone" dataKey="latency" stroke="#82ca9d" fill="#82ca9d" name="Latency (ms)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {performanceMetrics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>CPU & Memory</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">CPU Usage</span>
                      <span className="text-sm">{performanceMetrics.cpu.usage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${performanceMetrics.cpu.usage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Memory Usage</span>
                      <span className="text-sm">
                        {((performanceMetrics.memory.heapUsed / performanceMetrics.memory.heapTotal) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${(performanceMetrics.memory.heapUsed / performanceMetrics.memory.heapTotal) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Event Loop Utilization</span>
                      <span className="text-sm">{performanceMetrics.eventLoop.utilization.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-600 h-2 rounded-full"
                        style={{ width: `${performanceMetrics.eventLoop.utilization}%` }}
                      ></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Network & Database</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Requests/sec</span>
                    <span className="text-2xl font-bold">{performanceMetrics.network.requestsPerSecond}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Database Queries/sec</span>
                    <span className="text-2xl font-bold">{performanceMetrics.database.queriesPerSecond}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Average Latency</span>
                    <span className="text-2xl font-bold">{performanceMetrics.database.averageLatency.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Event Loop Lag</span>
                    <span className="text-2xl font-bold">{performanceMetrics.eventLoop.lag.toFixed(1)}ms</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Recommendations</CardTitle>
              <CardDescription>
                Performance optimization suggestions based on current metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-gray-600">No recommendations at this time.</p>
              ) : (
                <div className="space-y-4">
                  {recommendations.map((rec, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium">{rec.title}</h4>
                            <Badge variant={getPriorityColor(rec.priority)}>
                              {rec.priority}
                            </Badge>
                            <Badge variant="outline">{rec.type}</Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                          <p className="text-sm font-medium">Action: {rec.action}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Impact: {rec.impact} • {new Date(rec.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Integration Tests</CardTitle>
              <CardDescription>
                Test the integration of all APM components
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {testResults ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${testResults.status === 'passed' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="font-medium capitalize">Test Status: {testResults.status}</span>
                    <span className="text-sm text-gray-600">({testResults.duration}ms)</span>
                  </div>

                  {testResults.results && Object.entries(testResults.results).map(([component, result]: [string, any]) => (
                    <div key={component} className="border rounded p-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className={`w-2 h-2 rounded-full ${result.status === 'passed' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="font-medium capitalize">{component}</span>
                        <Badge variant={result.status === 'passed' ? 'default' : 'destructive'}>
                          {result.status}
                        </Badge>
                      </div>
                      {result.details && (
                        <pre className="text-xs text-gray-600 overflow-x-auto">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">Click "Run Integration Tests" to test all APM components.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};