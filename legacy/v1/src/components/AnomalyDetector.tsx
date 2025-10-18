import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Bar
} from 'recharts';
import {
  AlertTriangle,
  Shield,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Bell,
  Filter,
  Search,
  Eye,
  Settings,
  Play,
  Pause
} from 'lucide-react';

// Types
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

interface AnomalyPattern {
  id: string;
  type: string;
  frequency: number;
  confidence: number;
  description: string;
  lastDetected: string;
  occurrences: number;
}

interface MetricData {
  timestamp: string;
  value: number;
  threshold: number;
  anomaly?: boolean;
  anomalyId?: string;
}

interface DetectionRule {
  id: string;
  name: string;
  type: string;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'spike' | 'drop' | 'pattern';
  threshold: number;
  sensitivity: number;
  enabled: boolean;
  lastTriggered?: string;
}

interface AnomalyDetectorProps {
  anomalies: Anomaly[];
  patterns: AnomalyPattern[];
  metrics: Record<string, MetricData[]>;
  rules: DetectionRule[];
  onAnomalyAcknowledge?: (anomalyId: string) => void;
  onRuleToggle?: (ruleId: string, enabled: boolean) => void;
  onThresholdAdjust?: (ruleId: string, threshold: number) => void;
}

const AnomalyDetector: React.FC<AnomalyDetectorProps> = ({
  anomalies,
  patterns,
  metrics,
  rules,
  onAnomalyAcknowledge,
  onRuleToggle,
  onThresholdAdjust
}) => {
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>('latency');
  const [timeRange, setTimeRange] = useState('1h');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoDetect, setAutoDetect] = useState(true);
  const [showRules, setShowRules] = useState(false);

  const selectedAnomaly = useMemo(() => 
    anomalies.find(a => a.id === selectedAnomalyId),
    [anomalies, selectedAnomalyId]
  );

  const filteredAnomalies = useMemo(() => {
    let filtered = [...anomalies];
    
    if (severityFilter !== 'all') {
      filtered = filtered.filter(a => a.severity === severityFilter);
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(a => 
        a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.source.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [anomalies, severityFilter, statusFilter, searchTerm]);

  const anomalyStats = useMemo(() => {
    const stats = {
      total: anomalies.length,
      active: anomalies.filter(a => a.status === 'active').length,
      critical: anomalies.filter(a => a.severity === 'critical').length,
      resolved: anomalies.filter(a => a.status === 'resolved').length,
      investigating: anomalies.filter(a => a.status === 'investigating').length
    };
    return stats;
  }, [anomalies]);

  const metricChartData = useMemo(() => {
    const data = metrics[selectedMetric] || [];
    return data.map(point => ({
      ...point,
      time: new Date(point.timestamp).toLocaleTimeString(),
      deviation: point.threshold ? Math.abs(point.value - point.threshold) / point.threshold : 0
    }));
  }, [metrics, selectedMetric]);

  const anomalyTimeline = useMemo(() => {
    const grouped = filteredAnomalies.reduce((acc, anomaly) => {
      const hour = new Date(anomaly.timestamp).getHours();
      const key = `${hour}:00`;
      if (!acc[key]) {
        acc[key] = { time: key, low: 0, medium: 0, high: 0, critical: 0 };
      }
      acc[key][anomaly.severity]++;
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(grouped).sort((a: any, b: any) => a.time.localeCompare(b.time));
  }, [filteredAnomalies]);

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626'
    };
    return colors[severity] || '#6b7280';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'investigating':
        return <Eye className="h-4 w-4 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'false_positive':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getAnomalyScore = (anomaly: Anomaly) => {
    const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
    const confidenceWeight = anomaly.confidence;
    return severityWeight[anomaly.severity] * confidenceWeight;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Shield className="h-6 w-6 text-red-600" />
            <h2 className="text-xl font-semibold text-gray-900">Anomaly Detection & Alerting</h2>
            {autoDetect && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-700 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Auto-detect Active</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setAutoDetect(!autoDetect)}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                autoDetect
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {autoDetect ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {autoDetect ? 'Pause' : 'Resume'} Detection
            </button>
            <button
              onClick={() => setShowRules(!showRules)}
              className="flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            >
              <Settings className="h-4 w-4 mr-2" />
              Detection Rules
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Anomalies</p>
                <p className="text-2xl font-bold text-gray-900">{anomalyStats.total}</p>
              </div>
              <Activity className="h-8 w-8 text-gray-400" />
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-2xl font-bold text-red-600">{anomalyStats.active}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Critical</p>
                <p className="text-2xl font-bold text-orange-600">{anomalyStats.critical}</p>
              </div>
              <Zap className="h-8 w-8 text-orange-400" />
            </div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Investigating</p>
                <p className="text-2xl font-bold text-yellow-600">{anomalyStats.investigating}</p>
              </div>
              <Eye className="h-8 w-8 text-yellow-400" />
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Resolved</p>
                <p className="text-2xl font-bold text-green-600">{anomalyStats.resolved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search anomalies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False Positive</option>
          </select>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="latency">Latency</option>
            <option value="error_rate">Error Rate</option>
            <option value="memory_usage">Memory Usage</option>
            <option value="cpu_usage">CPU Usage</option>
            <option value="throughput">Throughput</option>
            <option value="connection_count">Connection Count</option>
          </select>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Anomaly List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metric Chart */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {selectedMetric.replace('_', ' ').toUpperCase()} Trends
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={metricChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <ReferenceLine y={metricChartData[0]?.threshold} stroke="#ef4444" strokeDasharray="5 5" />
                <Area
                  type="monotone"
                  dataKey="value"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                  stroke="#3b82f6"
                  name="Value"
                />
                <Line
                  type="monotone"
                  dataKey="threshold"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Threshold"
                />
                {metricChartData.filter(d => d.anomaly).map((point, index) => (
                  <ReferenceLine
                    key={index}
                    x={point.time}
                    stroke="#ef4444"
                    strokeWidth={2}
                    label="Anomaly"
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Anomaly Timeline */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Anomaly Timeline</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={anomalyTimeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="critical" stackId="a" fill="#dc2626" name="Critical" />
                <Bar dataKey="high" stackId="a" fill="#ef4444" name="High" />
                <Bar dataKey="medium" stackId="a" fill="#f59e0b" name="Medium" />
                <Bar dataKey="low" stackId="a" fill="#10b981" name="Low" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Anomaly List */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Detected Anomalies</h3>
            <div className="space-y-3">
              {filteredAnomalies.slice(0, 10).map((anomaly) => (
                <div
                  key={anomaly.id}
                  onClick={() => setSelectedAnomalyId(anomaly.id === selectedAnomalyId ? null : anomaly.id)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedAnomalyId === anomaly.id
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getStatusIcon(anomaly.status)}
                        <h4 className="font-medium text-gray-900">{anomaly.title}</h4>
                        <span
                          className="px-2 py-1 rounded text-xs text-white"
                          style={{ backgroundColor: getSeverityColor(anomaly.severity) }}
                        >
                          {anomaly.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{anomaly.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>Source: {anomaly.source}</span>
                        <span>Value: {anomaly.value}</span>
                        <span>Threshold: {anomaly.threshold}</span>
                        <span>Confidence: {(anomaly.confidence * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {new Date(anomaly.timestamp).toLocaleString()}
                      </p>
                      {anomaly.status === 'active' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAnomalyAcknowledge?.(anomaly.id);
                          }}
                          className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Selected Anomaly Details */}
          {selectedAnomaly && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Anomaly Details</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Type</p>
                  <p className="font-medium">{selectedAnomaly.type.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Severity</p>
                  <span
                    className="inline-block px-3 py-1 rounded text-sm text-white"
                    style={{ backgroundColor: getSeverityColor(selectedAnomaly.severity) }}
                  >
                    {selectedAnomaly.severity.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Score</p>
                  <p className="font-medium">{getAnomalyScore(selectedAnomaly).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Detected</p>
                  <p className="font-medium">{new Date(selectedAnomaly.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Affected Components</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedAnomaly.affectedComponents.map((component, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                      >
                        {component}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Deviation</p>
                  <p className="font-medium">
                    {Math.abs(((selectedAnomaly.value - selectedAnomaly.expectedValue) / selectedAnomaly.expectedValue) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Detection Patterns */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Detection Patterns</h3>
            <div className="space-y-3">
              {patterns.slice(0, 5).map((pattern) => (
                <div key={pattern.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm text-gray-900">{pattern.type}</h4>
                    <span className="text-xs text-gray-500">
                      {(pattern.confidence * 100).toFixed(1)}% confidence
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{pattern.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{pattern.occurrences} occurrences</span>
                    <span>{new Date(pattern.lastDetected).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Health */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
            <div className="space-y-3">
              {Object.entries(metrics).slice(0, 5).map(([metricName, data]) => {
                const latest = data[data.length - 1];
                const hasAnomaly = latest?.anomaly;
                return (
                  <div key={metricName} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {metricName.replace('_', ' ')}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium">{latest?.value || 0}</span>
                      {hasAnomaly && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Detection Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Detection Rules</h3>
              <button
                onClick={() => setShowRules(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-4">
              {rules.map((rule) => (
                <div key={rule.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">{rule.name}</h4>
                      <p className="text-sm text-gray-600">
                        {rule.metric} {rule.condition.replace('_', ' ')} {rule.threshold}
                      </p>
                    </div>
                    <button
                      onClick={() => onRuleToggle?.(rule.id, !rule.enabled)}
                      className={`px-3 py-1 rounded text-sm ${
                        rule.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span>Sensitivity: {(rule.sensitivity * 100).toFixed(0)}%</span>
                    {rule.lastTriggered && (
                      <span>Last triggered: {new Date(rule.lastTriggered).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnomalyDetector;