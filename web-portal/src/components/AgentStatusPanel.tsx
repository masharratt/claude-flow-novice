import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './AgentStatusPanel.css';

// Type definitions for agent status and control
export interface AgentStatus {
  id: string;
  name: string;
  type: 'researcher' | 'coder' | 'reviewer' | 'planner' | 'coordinator' | 'specialist';
  status: 'idle' | 'busy' | 'error' | 'offline' | 'paused';
  health: number; // 0-100
  performance: {
    tasksCompleted: number;
    averageTime: number;
    errorRate: number;
    efficiency: number;
  };
  currentTask?: {
    id: string;
    description: string;
    startTime: Date;
    progress: number;
    estimatedCompletion?: Date;
  };
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
    network: number;
  };
  lastActivity: Date;
  configuration: {
    priority: 'low' | 'medium' | 'high';
    maxConcurrentTasks: number;
    timeout: number;
  };
  metrics: {
    totalTasks: number;
    successRate: number;
    averageResponseTime: number;
    tokensUsed: number;
  };
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}

export interface InterventionAction {
  agentId?: string;
  message: string;
  action: 'pause' | 'resume' | 'stop' | 'restart' | 'adjust-priority' | 'send-message' | 'redirect-task';
  metadata?: any;
}

interface AgentStatusPanelProps {
  agents: AgentStatus[];
  selectedAgent?: string;
  onAgentSelect: (agentId: string) => void;
  onSendIntervention: (intervention: InterventionAction) => void;
  websocketUrl?: string;
  theme?: 'light' | 'dark';
  className?: string;
  enableRealTimeUpdates?: boolean;
}

const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({
  agents,
  selectedAgent,
  onAgentSelect,
  onSendIntervention,
  websocketUrl,
  theme = 'light',
  className = '',
  enableRealTimeUpdates = true
}) => {
  // State management
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'health' | 'performance'>('name');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [interventionForm, setInterventionForm] = useState<{
    agentId: string;
    action: string;
    message: string;
  } | null>(null);
  const [realTimeData, setRealTimeData] = useState<Map<string, any>>(new Map());

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!enableRealTimeUpdates || !websocketUrl) return;

    const ws = new WebSocket(websocketUrl);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'agent-status-update') {
          setRealTimeData(prev => {
            const newData = new Map(prev);
            newData.set(data.agentId, data.status);
            return newData;
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [websocketUrl, enableRealTimeUpdates]);

  // Merge agents with real-time data
  const enhancedAgents = useMemo(() => {
    return agents.map(agent => {
      const realTimeUpdate = realTimeData.get(agent.id);
      return realTimeUpdate ? { ...agent, ...realTimeUpdate } : agent;
    });
  }, [agents, realTimeData]);

  // Filter and sort agents
  const filteredAgents = useMemo(() => {
    let filtered = [...enhancedAgents];

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(agent => agent.status === filterStatus);
    }

    // Sort agents
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'health':
          return b.health - a.health;
        case 'performance':
          return b.performance.efficiency - a.performance.efficiency;
        default:
          return 0;
      }
    });

    return filtered;
  }, [enhancedAgents, filterStatus, sortBy]);

  // Handle intervention sending
  const handleSendIntervention = useCallback((intervention: InterventionAction) => {
    onSendIntervention(intervention);
    setInterventionForm(null);
  }, [onSendIntervention]);

  // Get status color
  const getStatusColor = (status: string) => {
    const colors = {
      idle: '#10B981',
      busy: '#F59E0B',
      error: '#EF4444',
      offline: '#6B7280',
      paused: '#8B5CF6'
    };
    return colors[status as keyof typeof colors] || '#6B7280';
  };

  // Get health color
  const getHealthColor = (health: number) => {
    if (health >= 80) return '#10B981';
    if (health >= 60) return '#F59E0B';
    if (health >= 40) return '#EF4444';
    return '#7C2D12';
  };

  // Format time duration
  const formatDuration = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // Format last activity
  const formatLastActivity = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Agent control actions
  const renderAgentControls = (agent: AgentStatus) => {
    return (
      <div className="agent-controls">
        <button
          className="control-btn pause"
          onClick={() => handleSendIntervention({
            agentId: agent.id,
            action: agent.status === 'paused' ? 'resume' : 'pause',
            message: agent.status === 'paused' ? 'Resume agent' : 'Pause agent'
          })}
          disabled={agent.status === 'offline'}
        >
          {agent.status === 'paused' ? '▶️' : '⏸️'}
        </button>
        
        <button
          className="control-btn restart"
          onClick={() => handleSendIntervention({
            agentId: agent.id,
            action: 'restart',
            message: 'Restart agent'
          })}
          disabled={agent.status === 'offline'}
        >
          🔄
        </button>
        
        <button
          className="control-btn stop"
          onClick={() => handleSendIntervention({
            agentId: agent.id,
            action: 'stop',
            message: 'Stop agent'
          })}
          disabled={agent.status === 'offline'}
        >
          ⏹️
        </button>
        
        <button
          className="control-btn message"
          onClick={() => setInterventionForm({
            agentId: agent.id,
            action: 'send-message',
            message: ''
          })}
          disabled={agent.status === 'offline'}
        >
          💬
        </button>
      </div>
    );
  };

  return (
    <div className={`agent-status-panel ${theme} ${className}`}>
      {/* Header */}
      <div className="panel-header">
        <h2>Agent Status</h2>
        <div className="header-controls">
          <div className="filter-controls">
            <label>Filter:</label>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="idle">Idle</option>
              <option value="busy">Busy</option>
              <option value="error">Error</option>
              <option value="offline">Offline</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          
          <div className="sort-controls">
            <label>Sort by:</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="health">Health</option>
              <option value="performance">Performance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="agents-grid">
        {filteredAgents.map(agent => (
          <div 
            key={agent.id}
            className={`agent-card ${selectedAgent === agent.id ? 'selected' : ''}`}
            onClick={() => onAgentSelect(agent.id)}
          >
            {/* Agent Header */}
            <div className="agent-header">
              <div className="agent-info">
                <h3 className="agent-name">{agent.name}</h3>
                <span className="agent-type">{agent.type}</span>
              </div>
              
              <div className="agent-status">
                <span 
                  className="status-indicator"
                  style={{ backgroundColor: getStatusColor(agent.status) }}
                >
                  {agent.status.toUpperCase()}
                </span>
                <div 
                  className="connection-indicator"
                  title={`Connection: ${agent.connectionStatus}`}
                >
                  {agent.connectionStatus === 'connected' ? '🟢' : 
                   agent.connectionStatus === 'reconnecting' ? '🟡' : '🔴'}
                </div>
              </div>
            </div>

            {/* Health Bar */}
            <div className="health-section">
              <div className="health-label">
                Health: {agent.health}%
              </div>
              <div className="health-bar">
                <div 
                  className="health-fill"
                  style={{ 
                    width: `${agent.health}%`,
                    backgroundColor: getHealthColor(agent.health)
                  }}
                />
              </div>
            </div>

            {/* Current Task */}
            {agent.currentTask && (
              <div className="current-task">
                <div className="task-info">
                  <span className="task-label">Current Task:</span>
                  <span className="task-description">
                    {agent.currentTask.description.substring(0, 50)}...
                  </span>
                </div>
                <div className="task-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${agent.currentTask.progress}%` }}
                    />
                  </div>
                  <span className="progress-text">{agent.currentTask.progress}%</span>
                </div>
              </div>
            )}

            {/* Performance Metrics */}
            <div className="performance-metrics">
              <div className="metric">
                <span className="metric-label">Tasks:</span>
                <span className="metric-value">{agent.performance.tasksCompleted}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Efficiency:</span>
                <span className="metric-value">{(agent.performance.efficiency * 100).toFixed(1)}%</span>
              </div>
              <div className="metric">
                <span className="metric-label">Avg Time:</span>
                <span className="metric-value">{formatDuration(agent.performance.averageTime)}</span>
              </div>
            </div>

            {/* Resource Usage */}
            <div className="resource-usage">
              <div className="resource">
                <span className="resource-label">CPU:</span>
                <div className="resource-bar">
                  <div 
                    className="resource-fill cpu"
                    style={{ width: `${agent.resources.cpu}%` }}
                  />
                </div>
                <span className="resource-value">{agent.resources.cpu}%</span>
              </div>
              <div className="resource">
                <span className="resource-label">Memory:</span>
                <div className="resource-bar">
                  <div 
                    className="resource-fill memory"
                    style={{ width: `${agent.resources.memory}%` }}
                  />
                </div>
                <span className="resource-value">{agent.resources.memory}%</span>
              </div>
            </div>

            {/* Agent Controls */}
            {renderAgentControls(agent)}

            {/* Last Activity */}
            <div className="last-activity">
              <span className="activity-label">Last Active:</span>
              <span className="activity-time">{formatLastActivity(agent.lastActivity)}</span>
            </div>

            {/* Details Toggle */}
            <button
              className="details-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(showDetails === agent.id ? null : agent.id);
              }}
            >
              {showDetails === agent.id ? '▼ Less' : '▶ More'}
            </button>

            {/* Expanded Details */}
            {showDetails === agent.id && (
              <div className="agent-details">
                <div className="details-section">
                  <h4>Capabilities</h4>
                  <div className="capabilities">
                    {agent.capabilities.map(cap => (
                      <span key={cap} className="capability-tag">{cap}</span>
                    ))}
                  </div>
                </div>
                
                <div className="details-section">
                  <h4>Configuration</h4>
                  <div className="config-items">
                    <div>Priority: <span className="config-value">{agent.configuration.priority}</span></div>
                    <div>Max Tasks: <span className="config-value">{agent.configuration.maxConcurrentTasks}</span></div>
                    <div>Timeout: <span className="config-value">{formatDuration(agent.configuration.timeout)}</span></div>
                  </div>
                </div>
                
                <div className="details-section">
                  <h4>Metrics</h4>
                  <div className="metrics-grid">
                    <div>Total Tasks: <span className="metric-value">{agent.metrics.totalTasks}</span></div>
                    <div>Success Rate: <span className="metric-value">{(agent.metrics.successRate * 100).toFixed(1)}%</span></div>
                    <div>Response Time: <span className="metric-value">{formatDuration(agent.metrics.averageResponseTime)}</span></div>
                    <div>Tokens Used: <span className="metric-value">{agent.metrics.tokensUsed.toLocaleString()}</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Intervention Form Modal */}
      {interventionForm && (
        <div className="intervention-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Send Intervention</h3>
              <button 
                className="close-btn"
                onClick={() => setInterventionForm(null)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Agent:</label>
                <span>{filteredAgents.find(a => a.id === interventionForm.agentId)?.name}</span>
              </div>
              
              <div className="form-group">
                <label>Action:</label>
                <select 
                  value={interventionForm.action}
                  onChange={(e) => setInterventionForm(prev => 
                    prev ? { ...prev, action: e.target.value } : null
                  )}
                >
                  <option value="send-message">Send Message</option>
                  <option value="pause">Pause</option>
                  <option value="resume">Resume</option>
                  <option value="restart">Restart</option>
                  <option value="adjust-priority">Adjust Priority</option>
                  <option value="redirect-task">Redirect Task</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Message:</label>
                <textarea
                  value={interventionForm.message}
                  onChange={(e) => setInterventionForm(prev => 
                    prev ? { ...prev, message: e.target.value } : null
                  )}
                  placeholder="Enter your intervention message..."
                  rows={4}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-primary"
                onClick={() => interventionForm && handleSendIntervention({
                  agentId: interventionForm.agentId,
                  action: interventionForm.action as any,
                  message: interventionForm.message
                })}
                disabled={!interventionForm.message.trim()}
              >
                Send Intervention
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setInterventionForm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-label">Total Agents:</span>
          <span className="stat-value">{filteredAgents.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Active:</span>
          <span className="stat-value">{filteredAgents.filter(a => a.status === 'busy').length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Idle:</span>
          <span className="stat-value">{filteredAgents.filter(a => a.status === 'idle').length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Errors:</span>
          <span className="stat-value">{filteredAgents.filter(a => a.status === 'error').length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Avg Health:</span>
          <span className="stat-value">
            {filteredAgents.length > 0 ? 
              Math.round(filteredAgents.reduce((sum, a) => sum + a.health, 0) / filteredAgents.length) : 0
            }%
          </span>
        </div>
      </div>
    </div>
  );
};

export default AgentStatusPanel;