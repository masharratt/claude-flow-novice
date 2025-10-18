import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Sankey,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Treemap
} from 'recharts';
import {
  Users,
  GitBranch,
  MessageSquare,
  Clock,
  TrendingUp,
  Activity,
  Zap,
  Eye,
  Handshake,
  ArrowRight,
  RefreshCw,
  Filter,
  Search
} from 'lucide-react';

// Types
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

interface CollaborationMetrics {
  agentId: string;
  totalCollaborations: number;
  successfulCollaborations: number;
  avgResponseTime: number;
  collaborationScore: number;
  partners: string[];
  frequentPartners: Array<{ agentId: string; count: number }>;
  collaborationTypes: Record<string, number>;
}

interface CollaborationNetwork {
  nodes: Array<{ id: string; name: string; role: string; group: number }>;
  links: Array<{ source: string; target: string; value: number; type: string }>;
}

interface CollaborationTrackerProps {
  agents: Agent[];
  events: CollaborationEvent[];
  metrics: CollaborationMetrics[];
  network: CollaborationNetwork;
  onAgentSelect?: (agentId: string) => void;
  onEventFilter?: (filters: any) => void;
}

const CollaborationTracker: React.FC<CollaborationTrackerProps> = ({
  agents,
  events,
  metrics,
  network,
  onAgentSelect,
  onEventFilter
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'metrics' | 'network' | 'timeline'>('metrics');

  const selectedAgent = useMemo(() => 
    agents.find(a => a.id === selectedAgentId),
    [agents, selectedAgentId]
  );

  const selectedAgentMetrics = useMemo(() => 
    metrics.find(m => m.agentId === selectedAgentId),
    [metrics, selectedAgentId]
  );

  const filteredEvents = useMemo(() => {
    let filtered = [...events];
    
    if (selectedAgentId) {
      filtered = filtered.filter(e => 
        e.sourceAgentId === selectedAgentId || e.targetAgentId === selectedAgentId
      );
    }
    
    if (selectedEventType !== 'all') {
      filtered = filtered.filter(e => e.type === selectedEventType);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(e => {
        const sourceAgent = agents.find(a => a.id === e.sourceAgentId);
        const targetAgent = agents.find(a => a.id === e.targetAgentId);
        return (
          sourceAgent?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          targetAgent?.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }
    
    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [events, selectedAgentId, selectedEventType, searchTerm, agents]);

  const collaborationTimeline = useMemo(() => {
    const grouped = filteredEvents.reduce((acc, event) => {
      const hour = new Date(event.timestamp).getHours();
      const key = `${hour}:00`;
      if (!acc[key]) acc[key] = { time: key, count: 0, success: 0, failed: 0 };
      acc[key].count++;
      if (event.success) acc[key].success++;
      else acc[key].failed++;
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(grouped).sort((a: any, b: any) => a.time.localeCompare(b.time));
  }, [filteredEvents]);

  const collaborationByType = useMemo(() => {
    const typeCount = filteredEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(typeCount).map(([type, count]) => ({
      type: type.replace('_', ' '),
      count,
      percentage: Math.round((count / filteredEvents.length) * 100)
    }));
  }, [filteredEvents]);

  const agentPerformanceData = useMemo(() => {
    return metrics.map(metric => {
      const agent = agents.find(a => a.id === metric.agentId);
      return {
        name: agent?.name || 'Unknown',
        collaborations: metric.totalCollaborations,
        successRate: (metric.successfulCollaborations / metric.totalCollaborations) * 100,
        responseTime: metric.avgResponseTime,
        score: metric.collaborationScore,
        role: agent?.role || 'Unknown'
      };
    }).sort((a, b) => b.score - a.score);
  }, [metrics, agents]);

  const networkData = useMemo(() => {
    if (!selectedAgentId) return network;
    
    const relatedLinks = network.links.filter(
      link => link.source === selectedAgentId || link.target === selectedAgentId
    );
    const relatedNodeIds = new Set([
      selectedAgentId,
      ...relatedLinks.map(link => link.source === selectedAgentId ? link.target : link.source)
    ]);
    const relatedNodes = network.nodes.filter(node => relatedNodeIds.has(node.id));
    
    return { nodes: relatedNodes, links: relatedLinks };
  }, [network, selectedAgentId]);

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      message: '#3b82f6',
      task_handoff: '#10b981',
      data_share: '#f59e0b',
      coordination: '#8b5cf6',
      review: '#ec4899'
    };
    return colors[type] || '#6b7280';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626'
    };
    return colors[priority] || '#6b7280';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <div className="w-3 h-3 bg-green-500 rounded-full" />;
      case 'busy':
        return <div className="w-3 h-3 bg-yellow-500 rounded-full" />;
      case 'offline':
        return <div className="w-3 h-3 bg-gray-400 rounded-full" />;
      default:
        return <div className="w-3 h-3 bg-gray-400 rounded-full" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Users className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Cross-Agent Collaboration Tracking</h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Events</option>
              <option value="message">Messages</option>
              <option value="task_handoff">Task Handoffs</option>
              <option value="data_share">Data Sharing</option>
              <option value="coordination">Coordination</option>
              <option value="review">Reviews</option>
            </select>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex space-x-1 p-1 bg-gray-100 rounded-lg">
          {[
            { id: 'metrics', label: 'Metrics', icon: BarChart3 },
            { id: 'network', label: 'Network', icon: GitBranch },
            { id: 'timeline', label: 'Timeline', icon: Clock }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id as any)}
              className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                viewMode === mode.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <mode.icon className="h-4 w-4 mr-2" />
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h3 className="font-medium text-gray-900 mb-4">Active Agents</h3>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedAgentId === agent.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(agent.status)}
                    <div>
                      <p className="font-medium text-sm text-gray-900">{agent.name}</p>
                      <p className="text-xs text-gray-600">{agent.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-600">Score</p>
                    <p className="text-sm font-medium">
                      {metrics.find(m => m.agentId === agent.id)?.collaborationScore.toFixed(1) || '0.0'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3 space-y-6">
          {viewMode === 'metrics' && (
            <>
              {/* Performance Chart */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Collaboration Performance</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="collaborations" fill="#3b82f6" name="Total Collaborations" />
                    <Bar dataKey="successRate" fill="#10b981" name="Success Rate %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Collaboration Types */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Collaboration by Type</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={collaborationByType}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ type, percentage }) => `${type}: ${percentage}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {collaborationByType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getEventTypeColor(entry.type.replace(' ', '_'))} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Selected Agent Details */}
                {selectedAgent && selectedAgentMetrics && (
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {selectedAgent.name} - Collaboration Details
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-600">Total Collaborations</p>
                          <p className="text-xl font-semibold text-gray-900">
                            {selectedAgentMetrics.totalCollaborations}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-600">Success Rate</p>
                          <p className="text-xl font-semibold text-green-600">
                            {((selectedAgentMetrics.successfulCollaborations / selectedAgentMetrics.totalCollaborations) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-600">Avg Response Time</p>
                          <p className="text-xl font-semibold text-blue-600">
                            {selectedAgentMetrics.avgResponseTime}ms
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-600">Collaboration Score</p>
                          <p className="text-xl font-semibold text-purple-600">
                            {selectedAgentMetrics.collaborationScore.toFixed(1)}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-2">Frequent Partners</p>
                        <div className="space-y-2">
                          {selectedAgentMetrics.frequentPartners.slice(0, 3).map((partner) => {
                            const partnerAgent = agents.find(a => a.id === partner.agentId);
                            return (
                              <div key={partner.agentId} className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">{partnerAgent?.name || 'Unknown'}</span>
                                <span className="text-sm font-medium">{partner.count} collaborations</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {viewMode === 'network' && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Collaboration Network</h3>
              <ResponsiveContainer width="100%" height={400}>
                <Treemap
                  data={[
                    {
                      name: 'Collaborations',
                      children: networkData.links.map(link => ({
                        name: `${link.source} → ${link.target}`,
                        size: link.value,
                        type: link.type
                      }))
                    }
                  ]}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  stroke="#fff"
                  fill="#8884d8"
                />
              </ResponsiveContainer>
            </div>
          )}

          {viewMode === 'timeline' && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Collaboration Timeline</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={collaborationTimeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" name="Total Events" />
                  <Line type="monotone" dataKey="success" stroke="#10b981" name="Successful" />
                  <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Failed" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent Events */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Collaboration Events</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Time</th>
                    <th className="text-left py-2">From</th>
                    <th className="text-left py-2">To</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Priority</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.slice(0, 10).map((event) => {
                    const sourceAgent = agents.find(a => a.id === event.sourceAgentId);
                    const targetAgent = agents.find(a => a.id === event.targetAgentId);
                    return (
                      <tr key={event.id} className="border-b hover:bg-gray-50">
                        <td className="py-2">{new Date(event.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2">{sourceAgent?.name || 'Unknown'}</td>
                        <td className="py-2">{targetAgent?.name || 'Unknown'}</td>
                        <td className="py-2">
                          <span
                            className="px-2 py-1 rounded text-xs text-white"
                            style={{ backgroundColor: getEventTypeColor(event.type) }}
                          >
                            {event.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2">
                          <span
                            className="px-2 py-1 rounded text-xs text-white"
                            style={{ backgroundColor: getPriorityColor(event.priority) }}
                          >
                            {event.priority}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            event.success
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {event.success ? 'Success' : 'Failed'}
                          </span>
                        </td>
                        <td className="py-2">{event.duration ? `${event.duration}ms` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborationTracker;