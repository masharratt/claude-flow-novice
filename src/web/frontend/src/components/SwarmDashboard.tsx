import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './SwarmDashboard.css';

// Types and Interfaces
interface Agent {
  id: string;
  type: 'researcher' | 'coder' | 'reviewer';
  name: string;
  status: 'active' | 'idle' | 'processing' | 'error';
  performance: number;
  tasksCompleted: number;
  currentTask?: string;
  lastActivity: Date;
  coordinationScore: number;
  efficiency: number;
}

interface Message {
  id: string;
  from: string;
  to: string;
  type: 'coordination' | 'data' | 'status' | 'error';
  content: string;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high';
}

interface SwarmMetrics {
  totalTasks: number;
  completedTasks: number;
  efficiency: number;
  coordinationScore: number;
  uptime: number;
  throughput: number;
  errorRate: number;
  responseTime: number;
}

interface SwarmRelaunch {
  id: string;
  timestamp: Date;
  reason: string;
  previousMetrics: SwarmMetrics;
  agents: Agent[];
  duration: number;
  success: boolean;
}

interface DecisionInsight {
  id: string;
  agentId: string;
  decision: string;
  reasoning: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  timestamp: Date;
}

interface SwarmDashboardProps {
  wsUrl?: string;
  refreshInterval?: number;
  maxRelaunches?: number;
  swarmData?: any;
  messages?: any[];
  agents?: any[];
  onSelectAgent?: (agentId: string) => void;
  playwrightTests?: any[];
  testMetrics?: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    coverage: number;
    averageDuration: number;
  };
}

const SwarmDashboard: React.FC<SwarmDashboardProps> = ({
  wsUrl = 'ws://localhost:8080/swarm',
  refreshInterval = 1000,
  maxRelaunches = 10,
  swarmData,
  messages: externalMessages,
  agents: externalAgents,
  onSelectAgent,
  playwrightTests = [],
  testMetrics = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    coverage: 0,
    averageDuration: 0
  }
}) => {
  // State Management
  const [agents, setAgents] = useState<Agent[]>([
    {
      id: 'agent-1',
      type: 'researcher',
      name: 'Research Agent Alpha',
      status: 'active',
      performance: 87,
      tasksCompleted: 23,
      currentTask: 'Analyzing market trends',
      lastActivity: new Date(),
      coordinationScore: 92,
      efficiency: 89
    },
    {
      id: 'agent-2',
      type: 'coder',
      name: 'Coder Agent Beta',
      status: 'processing',
      performance: 94,
      tasksCompleted: 31,
      currentTask: 'Implementing authentication service',
      lastActivity: new Date(Date.now() - 30000),
      coordinationScore: 88,
      efficiency: 96
    },
    {
      id: 'agent-3',
      type: 'reviewer',
      name: 'Reviewer Agent Gamma',
      status: 'idle',
      performance: 91,
      tasksCompleted: 18,
      currentTask: undefined,
      lastActivity: new Date(Date.now() - 120000),
      coordinationScore: 95,
      efficiency: 85
    }
  ]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SwarmMetrics>({
    totalTasks: 72,
    completedTasks: 68,
    efficiency: 89.4,
    coordinationScore: 91.7,
    uptime: 98.2,
    throughput: 2.3,
    errorRate: 1.2,
    responseTime: 245
  });

  const [relaunches, setRelaunches] = useState<SwarmRelaunch[]>([]);
  const [insights, setInsights] = useState<DecisionInsight[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebSocket Connection
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          setIsConnected(true);
          console.log('WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        };

        wsRef.current.onclose = () => {
          setIsConnected(false);
          console.log('WebSocket disconnected');
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setIsConnected(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [wsUrl]);

  // Handle WebSocket Messages
  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'agent_update':
        setAgents(prev => prev.map(agent =>
          agent.id === data.agentId ? { ...agent, ...data.updates } : agent
        ));
        break;
      case 'metrics_update':
        setMetrics(data.metrics);
        break;
      case 'new_message':
        setMessages(prev => [...prev.slice(-49), data.message]);
        break;
      case 'decision_insight':
        setInsights(prev => [...prev.slice(-19), data.insight]);
        break;
      case 'swarm_relaunch':
        setRelaunches(prev => [...prev.slice(-(maxRelaunches - 1)), data.relaunch]);
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }, [maxRelaunches]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Simulated real-time updates (fallback when WebSocket is not connected)
  useEffect(() => {
    if (isConnected) return;

    const interval = setInterval(() => {
      // Simulate agent status changes
      setAgents(prev => prev.map(agent => ({
        ...agent,
        performance: Math.min(100, agent.performance + (Math.random() - 0.5) * 2),
        efficiency: Math.min(100, agent.efficiency + (Math.random() - 0.5) * 1.5),
        coordinationScore: Math.min(100, agent.coordinationScore + (Math.random() - 0.5) * 1),
        lastActivity: Math.random() > 0.7 ? new Date() : agent.lastActivity,
        status: Math.random() > 0.8 ?
          (['active', 'idle', 'processing'] as const)[Math.floor(Math.random() * 3)] :
          agent.status
      })));

      // Simulate new messages
      if (Math.random() > 0.6) {
        const agentIds = ['agent-1', 'agent-2', 'agent-3'];
        const messageTypes: Message['type'][] = ['coordination', 'data', 'status'];

        const newMessage: Message = {
          id: `msg-${Date.now()}`,
          from: agentIds[Math.floor(Math.random() * agentIds.length)],
          to: agentIds[Math.floor(Math.random() * agentIds.length)],
          type: messageTypes[Math.floor(Math.random() * messageTypes.length)],
          content: `Simulated message at ${new Date().toLocaleTimeString()}`,
          timestamp: new Date(),
          priority: (['low', 'medium', 'high'] as const)[Math.floor(Math.random() * 3)]
        };

        setMessages(prev => [...prev.slice(-49), newMessage]);
      }

      // Update metrics
      setMetrics(prev => ({
        ...prev,
        efficiency: Math.min(100, Math.max(0, prev.efficiency + (Math.random() - 0.5) * 2)),
        coordinationScore: Math.min(100, Math.max(0, prev.coordinationScore + (Math.random() - 0.5) * 1.5)),
        throughput: Math.max(0, prev.throughput + (Math.random() - 0.5) * 0.2),
        responseTime: Math.max(50, prev.responseTime + (Math.random() - 0.5) * 20),
        errorRate: Math.max(0, Math.min(10, prev.errorRate + (Math.random() - 0.5) * 0.5))
      }));
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [isConnected, refreshInterval]);

  // Computed Values
  const activeAgents = useMemo(() =>
    agents.filter(agent => agent.status === 'active').length, [agents]);

  const averagePerformance = useMemo(() =>
    agents.reduce((sum, agent) => sum + agent.performance, 0) / agents.length, [agents]);

  const totalTasksCompleted = useMemo(() =>
    agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0), [agents]);

  // Event Handlers
  const handleAgentSelect = useCallback((agentId: string) => {
    setSelectedAgent(prev => prev === agentId ? null : agentId);
  }, []);

  const handleSwarmRestart = useCallback(async () => {
    setIsRestarting(true);

    try {
      // Create relaunch record
      const relaunch: SwarmRelaunch = {
        id: `relaunch-${Date.now()}`,
        timestamp: new Date(),
        reason: 'Manual restart',
        previousMetrics: { ...metrics },
        agents: [...agents],
        duration: 0,
        success: false
      };

      // Simulate restart process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update agents to idle state
      setAgents(prev => prev.map(agent => ({
        ...agent,
        status: 'idle' as const,
        currentTask: undefined,
        lastActivity: new Date()
      })));

      // Simulate successful restart
      setTimeout(() => {
        setAgents(prev => prev.map((agent, index) => ({
          ...agent,
          status: index === 0 ? 'active' : 'idle' as const,
          performance: Math.min(100, agent.performance + 5),
          efficiency: Math.min(100, agent.efficiency + 3)
        })));

        const completedRelaunch: SwarmRelaunch = {
          ...relaunch,
          duration: 2000,
          success: true
        };

        setRelaunches(prev => [...prev.slice(-(maxRelaunches - 1)), completedRelaunch]);
      }, 1000);

    } catch (error) {
      console.error('Failed to restart swarm:', error);
    } finally {
      setIsRestarting(false);
    }
  }, [agents, metrics, maxRelaunches]);

  const getAgentTypeIcon = (type: Agent['type']) => {
    switch (type) {
      case 'researcher': return '🔍';
      case 'coder': return '💻';
      case 'reviewer': return '🔍';
      default: return '🤖';
    }
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active': return 'var(--success-color)';
      case 'processing': return 'var(--warning-color)';
      case 'idle': return 'var(--info-color)';
      case 'error': return 'var(--error-color)';
      default: return 'var(--neutral-color)';
    }
  };

  const getPriorityColor = (priority: Message['priority']) => {
    switch (priority) {
      case 'high': return 'var(--error-color)';
      case 'medium': return 'var(--warning-color)';
      case 'low': return 'var(--success-color)';
      default: return 'var(--neutral-color)';
    }
  };

  return (
    <div className="swarm-dashboard">
      <div className="dashboard-header">
        <h1>🚀 Claude Flow Swarm Dashboard</h1>
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></div>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Agent Status Panel */}
        <div className="panel agent-status-panel">
          <div className="panel-header">
            <h2>🤖 Agent Status</h2>
            <div className="agent-summary">
              {activeAgents}/{agents.length} Active
            </div>
          </div>
          <div className="agents-container">
            {agents.map(agent => (
              <div
                key={agent.id}
                className={`agent-card ${selectedAgent === agent.id ? 'selected' : ''}`}
                onClick={() => handleAgentSelect(agent.id)}
              >
                <div className="agent-header">
                  <div className="agent-icon">
                    {getAgentTypeIcon(agent.type)}
                  </div>
                  <div className="agent-info">
                    <h3>{agent.name}</h3>
                    <span className="agent-type">{agent.type}</span>
                  </div>
                  <div
                    className="agent-status"
                    style={{ backgroundColor: getStatusColor(agent.status) }}
                  >
                    {agent.status}
                  </div>
                </div>

                <div className="agent-metrics">
                  <div className="metric">
                    <label>Performance</label>
                    <div className="metric-bar">
                      <div
                        className="metric-fill performance"
                        style={{ width: `${agent.performance}%` }}
                      ></div>
                      <span>{agent.performance.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="metric">
                    <label>Efficiency</label>
                    <div className="metric-bar">
                      <div
                        className="metric-fill efficiency"
                        style={{ width: `${agent.efficiency}%` }}
                      ></div>
                      <span>{agent.efficiency.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="metric">
                    <label>Coordination</label>
                    <div className="metric-bar">
                      <div
                        className="metric-fill coordination"
                        style={{ width: `${agent.coordinationScore}%` }}
                      ></div>
                      <span>{agent.coordinationScore.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                <div className="agent-details">
                  <div className="detail-row">
                    <span>Tasks Completed:</span>
                    <span className="value">{agent.tasksCompleted}</span>
                  </div>
                  {agent.currentTask && (
                    <div className="detail-row">
                      <span>Current Task:</span>
                      <span className="value current-task">{agent.currentTask}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span>Last Activity:</span>
                    <span className="value">{agent.lastActivity.toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Metrics Panel */}
        <div className="panel metrics-panel">
          <div className="panel-header">
            <h2>📊 Swarm Metrics</h2>
          </div>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon">⚡</div>
              <div className="metric-content">
                <h3>Efficiency</h3>
                <div className="metric-value">{metrics.efficiency.toFixed(1)}%</div>
                <div className="metric-change positive">+2.1%</div>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">🎯</div>
              <div className="metric-content">
                <h3>Coordination</h3>
                <div className="metric-value">{metrics.coordinationScore.toFixed(1)}%</div>
                <div className="metric-change positive">+1.4%</div>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">📈</div>
              <div className="metric-content">
                <h3>Throughput</h3>
                <div className="metric-value">{metrics.throughput.toFixed(1)}/s</div>
                <div className="metric-change negative">-0.2/s</div>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">⏱️</div>
              <div className="metric-content">
                <h3>Response Time</h3>
                <div className="metric-value">{metrics.responseTime}ms</div>
                <div className="metric-change positive">-15ms</div>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">🔥</div>
              <div className="metric-content">
                <h3>Uptime</h3>
                <div className="metric-value">{metrics.uptime.toFixed(1)}%</div>
                <div className="metric-change positive">+0.1%</div>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">⚠️</div>
              <div className="metric-content">
                <h3>Error Rate</h3>
                <div className="metric-value">{metrics.errorRate.toFixed(1)}%</div>
                <div className="metric-change positive">-0.3%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Message Flow Panel */}
        <div className="panel message-flow-panel">
          <div className="panel-header">
            <h2>💬 Message Flow</h2>
            <div className="message-stats">
              {messages.length} messages
            </div>
          </div>
          <div className="messages-container">
            {messages.slice(-20).map(message => (
              <div key={message.id} className="message-item">
                <div className="message-header">
                  <span className="message-from">{message.from}</span>
                  <span className="message-arrow">→</span>
                  <span className="message-to">{message.to}</span>
                  <span
                    className="message-priority"
                    style={{ color: getPriorityColor(message.priority) }}
                  >
                    {message.priority}
                  </span>
                  <span className="message-time">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">{message.content}</div>
                <div className="message-type">{message.type}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Decision Insights Panel */}
        <div className="panel insights-panel">
          <div className="panel-header">
            <h2>🧠 Decision Insights</h2>
          </div>
          <div className="insights-container">
            {insights.slice(-10).map(insight => (
              <div key={insight.id} className="insight-item">
                <div className="insight-header">
                  <span className="insight-agent">{insight.agentId}</span>
                  <span
                    className={`insight-impact ${insight.impact}`}
                  >
                    {insight.impact} impact
                  </span>
                  <span className="insight-confidence">
                    {(insight.confidence * 100).toFixed(0)}% confident
                  </span>
                </div>
                <div className="insight-decision">{insight.decision}</div>
                <div className="insight-reasoning">{insight.reasoning}</div>
                <div className="insight-time">
                  {insight.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Swarm Control Panel */}
        <div className="panel control-panel">
          <div className="panel-header">
            <h2>🎛️ Swarm Controls</h2>
          </div>
          <div className="control-content">
            <div className="control-section">
              <h3>Swarm Management</h3>
              <button
                className={`control-button restart ${isRestarting ? 'loading' : ''}`}
                onClick={handleSwarmRestart}
                disabled={isRestarting}
              >
                {isRestarting ? '🔄 Restarting...' : '🔄 Restart Swarm'}
              </button>
            </div>

            <div className="control-section">
              <h3>Relaunch History ({relaunches.length}/{maxRelaunches})</h3>
              <div className="relaunch-history">
                {relaunches.slice(-5).map(relaunch => (
                  <div key={relaunch.id} className="relaunch-item">
                    <div className="relaunch-header">
                      <span className={`relaunch-status ${relaunch.success ? 'success' : 'failure'}`}>
                        {relaunch.success ? '✅' : '❌'}
                      </span>
                      <span className="relaunch-time">
                        {relaunch.timestamp.toLocaleString()}
                      </span>
                    </div>
                    <div className="relaunch-reason">{relaunch.reason}</div>
                    <div className="relaunch-duration">
                      Duration: {(relaunch.duration / 1000).toFixed(1)}s
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Playwright Test Status Panel */}
        <div className="panel playwright-panel">
          <div className="panel-header">
            <h2>🎭 Playwright Test Status</h2>
          </div>
          <div className="playwright-content">
            <div className="test-metrics-grid">
              <div className="test-metric">
                <div className="metric-icon">🧪</div>
                <div className="metric-content">
                  <h3>Total Tests</h3>
                  <div className="metric-value">{testMetrics.totalTests}</div>
                  <div className="metric-subtext">Across all suites</div>
                </div>
              </div>

              <div className="test-metric passed">
                <div className="metric-icon">✅</div>
                <div className="metric-content">
                  <h3>Passed</h3>
                  <div className="metric-value">{testMetrics.passedTests}</div>
                  <div className="metric-subtext">
                    {testMetrics.totalTests > 0 ? ((testMetrics.passedTests / testMetrics.totalTests) * 100).toFixed(1) : 0}% success rate
                  </div>
                </div>
              </div>

              <div className="test-metric failed">
                <div className="metric-icon">❌</div>
                <div className="metric-content">
                  <h3>Failed</h3>
                  <div className="metric-value">{testMetrics.failedTests}</div>
                  <div className="metric-subtext">Need attention</div>
                </div>
              </div>

              <div className="test-metric coverage">
                <div className="metric-icon">📊</div>
                <div className="metric-content">
                  <h3>Coverage</h3>
                  <div className="metric-value">{testMetrics.coverage.toFixed(1)}%</div>
                  <div className="coverage-bar">
                    <div
                      className="coverage-fill"
                      style={{ width: `${testMetrics.coverage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="recent-tests">
              <h3>Recent Test Activity</h3>
              <div className="test-activity-list">
                {playwrightTests.slice(0, 5).map(test => (
                  <div key={test.id} className="test-activity-item">
                    <span className={`test-status-icon ${test.status}`}>
                      {test.status === 'running' ? '🔄' :
                       test.status === 'passed' ? '✅' :
                       test.status === 'failed' ? '❌' : '⏸️'}
                    </span>
                    <span className="test-name">{test.name || test.path}</span>
                    <span className="test-time">
                      {test.timestamp ? new Date(test.timestamp).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                ))}
                {playwrightTests.length === 0 && (
                  <div className="no-tests">No recent test activity</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Statistics Panel */}
        <div className="panel summary-panel">
          <div className="panel-header">
            <h2>📈 Summary Statistics</h2>
          </div>
          <div className="summary-content">
            <div className="summary-stat">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <h3>Total Tasks</h3>
                <div className="stat-value">{metrics.totalTasks}</div>
                <div className="stat-subtext">
                  {metrics.completedTasks} completed ({((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(1)}%)
                </div>
              </div>
            </div>

            <div className="summary-stat">
              <div className="stat-icon">🎯</div>
              <div className="stat-content">
                <h3>Average Performance</h3>
                <div className="stat-value">{averagePerformance.toFixed(1)}%</div>
                <div className="stat-subtext">Across all agents</div>
              </div>
            </div>

            <div className="summary-stat">
              <div className="stat-icon">🔄</div>
              <div className="stat-content">
                <h3>Total Relaunches</h3>
                <div className="stat-value">{relaunches.length}</div>
                <div className="stat-subtext">
                  {relaunches.filter(r => r.success).length} successful
                </div>
              </div>
            </div>

            <div className="summary-stat">
              <div className="stat-icon">⚡</div>
              <div className="stat-content">
                <h3>System Health</h3>
                <div className="stat-value">
                  {((metrics.efficiency + metrics.coordinationScore + metrics.uptime) / 3).toFixed(1)}%
                </div>
                <div className="stat-subtext">Overall system score</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwarmDashboard;