import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Zap,
  Database,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  BarChart3,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

// Types
interface PerformanceMetric {
  timestamp: string;
  metric: string;
  value: number;
  unit: string;
  threshold?: number;
  baseline?: number;
}

interface HistoricalTrend {
  metric: string;
  period: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  trend: 'improving' | 'degrading' | 'stable';
  prediction: number;
  confidence: number;
}

interface ResourceUsage {
  timestamp: string;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  connections: number;
}

interface Bottleneck {
  id: string;
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'database';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  recommendation: string;
  timestamp: string;
  value: number;
  threshold: number;
}

interface PerformanceBenchmark {
  metric: string;
  current: number;
  baseline: number;
  target: number;
  best: number;
  percentile: number;
}

interface PerformanceAnalyzerProps {
  metrics: PerformanceMetric[];
  trends: HistoricalTrend[];
  resourceUsage: ResourceUsage[];
  bottlenecks: Bottleneck[];
  benchmarks: PerformanceBenchmark[];
  onExportData?: () => void;
  onRefreshData?: () => void;
}

const PerformanceAnalyzer: React.FC<PerformanceAnalyzerProps> = ({
  metrics,
  trends,
  resourceUsage,
  bottlenecks,
  benchmarks,
  onExportData,
  onRefreshData
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [selectedMetric, setSelectedMetric] = useState('latency');
  const [showComparison, setShowComparison] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const metricOptions = useMemo(() => {
    const uniqueMetrics = [...new Set(metrics.map(m => m.metric))];
    return uniqueMetrics.map(metric => ({
      value: metric,
      label: metric.replace('_', ' ').toUpperCase(),
      unit: metrics.find(m => m.metric === metric)?.unit || ''
    }));
  }, [metrics]);

  const currentMetricData = useMemo(() => {
    return metrics
      .filter(m => m.metric === selectedMetric)
      .map(m => ({
        ...m,
        time: new Date(m.timestamp).toLocaleTimeString(),
        deviation: m.baseline ? ((m.value - m.baseline) / m.baseline) * 100 : 0
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [metrics, selectedMetric]);

  const resourceChartData = useMemo(() => {
    return resourceUsage.map(usage => ({
      ...usage,
      time: new Date(usage.timestamp).toLocaleTimeString()
    }));
  }, [resourceUsage]);

  const performanceScore = useMemo(() => {
    if (benchmarks.length === 0) return 0;
    const scores = benchmarks.map(b => {
      const range = b.best - b.baseline;
      const current = b.current - b.baseline;
      return Math.max(0, Math.min(100, (current / range) * 100));
    });
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }, [benchmarks]);

  const trendData = useMemo(() => {
    return trends.map(trend => ({
      metric: trend.metric.replace('_', ' '),
      current: trend.currentValue,
      previous: trend.previousValue,
      change: trend.changePercent,
      prediction: trend.prediction,
      trend: trend.trend
    }));
  }, [trends]);

  const radarData = useMemo(() => {
    return [
      { metric: 'CPU', value: resourceUsage[resourceUsage.length - 1]?.cpu || 0, fullMark: 100 },
      { metric: 'Memory', value: resourceUsage[resourceUsage.length - 1]?.memory || 0, fullMark: 100 },
      { metric: 'Disk', value: resourceUsage[resourceUsage.length - 1]?.disk || 0, fullMark: 100 },
      { metric: 'Network', value: resourceUsage[resourceUsage.length - 1]?.network || 0, fullMark: 100 },
      { metric: 'Connections', value: Math.min((resourceUsage[resourceUsage.length - 1]?.connections || 0) / 10, 100), fullMark: 100 }
    ];
  }, [resourceUsage]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'degrading':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626'
    };
    return colors[severity] || '#6b7280';
  };

  const getPerformanceGrade = (score: number) => {
    if (score >= 90) return { grade: 'A+', color: 'text-green-600' };
    if (score >= 80) return { grade: 'A', color: 'text-green-600' };
    if (score >= 70) return { grade: 'B', color: 'text-blue-600' };
    if (score >= 60) return { grade: 'C', color: 'text-yellow-600' };
    if (score >= 50) return { grade: 'D', color: 'text-orange-600' };
    return { grade: 'F', color: 'text-red-600' };
  };

  const grade = getPerformanceGrade(performanceScore);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-semibold text-gray-900">Historical Performance Analysis</h2>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                autoRefresh
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
              Auto-refresh
            </button>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="flex items-center px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Compare
            </button>
            <button
              onClick={onExportData}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Performance Score */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-indigo-100">Performance Score</p>
                <p className="text-3xl font-bold mt-2">{performanceScore}</p>
                <p className={`text-lg font-semibold mt-1 ${grade.color}`}>Grade {grade.grade}</p>
              </div>
              <div className="text-6xl font-bold opacity-20">{grade.grade}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Latency</p>
                <p className="text-2xl font-bold text-gray-900">
                  {currentMetricData[currentMetricData.length - 1]?.value.toFixed(2) || '0'}ms
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Target: &lt;50ms
                </p>
              </div>
              <Clock className="h-8 w-8 text-gray-400" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Throughput</p>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics.find(m => m.metric === 'throughput')?.value.toFixed(0) || '0'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  req/s
                </p>
              </div>
              <Zap className="h-8 w-8 text-gray-400" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Error Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics.find(m => m.metric === 'error_rate')?.value.toFixed(2) || '0'}%
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Target: &lt;1%
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Metric Trend */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {selectedMetric.replace('_', ' ').toUpperCase()} Trend
            </h3>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {metricOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={currentMetricData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              {currentMetricData[0]?.baseline && (
                <ReferenceLine
                  y={currentMetricData[0].baseline}
                  stroke="#10b981"
                  strokeDasharray="5 5"
                  label="Baseline"
                />
              )}
              {currentMetricData[0]?.threshold && (
                <ReferenceLine
                  y={currentMetricData[0].threshold}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label="Threshold"
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                fill="#6366f1"
                fillOpacity={0.3}
                stroke="#6366f1"
                strokeWidth={2}
              />
              {showComparison && (
                <Line
                  type="monotone"
                  dataKey="baseline"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Resource Usage */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Resource Usage</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={resourceChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cpu" stroke="#ef4444" name="CPU %" strokeWidth={2} />
              <Line type="monotone" dataKey="memory" stroke="#3b82f6" name="Memory %" strokeWidth={2} />
              <Line type="monotone" dataKey="disk" stroke="#10b981" name="Disk %" strokeWidth={2} />
              <Line type="monotone" dataKey="network" stroke="#f59e0b" name="Network %" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Radar */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Resource Overview</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar
                name="Current Usage"
                dataKey="value"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.6}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Analysis */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Trend Analysis</h3>
          <div className="space-y-3">
            {trendData.slice(0, 6).map((trend, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getTrendIcon(trend.trend)}
                  <div>
                    <p className="font-medium text-gray-900">{trend.metric}</p>
                    <p className="text-sm text-gray-600">
                      Current: {trend.current} | Previous: {trend.previous}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${
                    trend.change > 0 ? 'text-red-600' : trend.change < 0 ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    {trend.change > 0 ? '+' : ''}{trend.change.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">
                    Pred: {trend.prediction.toFixed(1)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Benchmarks and Bottlenecks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Benchmarks */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Benchmarks</h3>
          <div className="space-y-4">
            {benchmarks.slice(0, 5).map((benchmark, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {benchmark.metric.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-600">
                    {benchmark.current} / {benchmark.target}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      benchmark.percentile >= 90 ? 'bg-green-500' :
                      benchmark.percentile >= 70 ? 'bg-blue-500' :
                      benchmark.percentile >= 50 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.min((benchmark.current / benchmark.target) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    Baseline: {benchmark.baseline}
                  </span>
                  <span className="text-xs text-gray-500">
                    {benchmark.percentile}th percentile
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Identified Bottlenecks */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Identified Bottlenecks</h3>
          <div className="space-y-3">
            {bottlenecks.slice(0, 5).map((bottleneck) => (
              <div key={bottleneck.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className="px-2 py-1 rounded text-xs text-white"
                      style={{ backgroundColor: getSeverityColor(bottleneck.severity) }}
                    >
                      {bottleneck.severity.toUpperCase()}
                    </span>
                    <h4 className="font-medium text-gray-900">{bottleneck.type.toUpperCase()}</h4>
                  </div>
                  <span className="text-sm text-gray-500">
                    {bottleneck.value} / {bottleneck.threshold}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{bottleneck.description}</p>
                <p className="text-sm text-gray-500 mb-2">
                  <strong>Impact:</strong> {bottleneck.impact}
                </p>
                <p className="text-sm text-blue-600">
                  <strong>Recommendation:</strong> {bottleneck.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Historical Comparison */}
      {showComparison && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Historical Comparison</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Current Period</p>
              <p className="text-2xl font-bold text-indigo-600">
                {currentMetricData.reduce((sum, d) => sum + d.value, 0) / currentMetricData.length || 0}
              </p>
              <p className="text-sm text-gray-500">Average</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Previous Period</p>
              <p className="text-2xl font-bold text-gray-600">
                {currentMetricData.length > 0 
                  ? (currentMetricData.reduce((sum, d) => sum + d.value, 0) / currentMetricData.length * 0.95).toFixed(2)
                  : 0
                }
              </p>
              <p className="text-sm text-gray-500">Average</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Change</p>
              <p className="text-2xl font-bold text-green-600">+5.3%</p>
              <p className="text-sm text-gray-500">Improvement</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceAnalyzer;