/**
 * Claude Flow Personal - Transparent Web Portal
 * Main React application for real-time agent message display and human intervention
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import SwarmDashboard from './components/SwarmDashboard';
import MessageViewer from './components/MessageViewer';
import InterventionPanel from './components/InterventionPanel';
import AgentStatusPanel from './components/AgentStatusPanel';
import TransparencyInsights from './components/TransparencyInsights';
import FilterControls from './components/FilterControls';
import MCPIntegrationPanel from './components/MCPIntegrationPanel';
// PlaywrightTestPanel would be imported here if it exists
// import PlaywrightTestPanel from './components/PlaywrightTestPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { AccessibleButton, AccessibilityToolbar, ScreenReaderAnnouncer, SkipLink } from './components/AccessibilityEnhancements';
import { sanitizeInput, validateInput, ValidationRule } from './components/InputValidator';
import { ContentSanitizer, InputValidator as SecurityValidator, SecurityLogger, RateLimiter } from './utils/security';
import { withPerformanceMonitoring, PerformanceMonitor } from './components/PerformanceOptimizer';
import './styles/App.css';

export interface AppState {
  connected: boolean;
  currentSwarmId?: string;
  swarmData: any;
  messages: any[];
  agents: any[];
  interventions: any[];
  transparencyInsights: any[];
  filters: any;
  selectedAgent?: string;
  viewMode: 'dashboard' | 'messages' | 'agents' | 'transparency' | 'mcp' | 'playwright';
  playwrightTests: any[];
  testMetrics: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    coverage: number;
    averageDuration: number;
  };
}

// Security-enhanced App component with performance monitoring
const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<AppState>({
    connected: false,
    swarmData: null,
    messages: [],
    agents: [],
    interventions: [],
    transparencyInsights: [],
    filters: {},
    viewMode: 'dashboard',
    playwrightTests: [],
    testMetrics: {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      coverage: 0,
      averageDuration: 0
    }
  });

  // Security and rate limiting
  const [securityConfig] = useState(() => ({
    sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    maxConnectionAttempts: 5,
    connectionWindow: 60000 // 1 minute
  }));

  // Form validation rules
  const swarmIdValidationRules: ValidationRule[] = useMemo(() => [
    {
      type: 'required',
      message: 'Swarm ID is required'
    },
    {
      type: 'length',
      value: { minLength: 3, maxLength: 100 },
      message: 'Swarm ID must be between 3 and 100 characters'
    },
    {
      type: 'custom',
      validator: (value: string) => SecurityValidator.validateNoSQL(value) && SecurityValidator.validateSQL(value),
      message: 'Swarm ID contains invalid characters'
    }
  ], []);

  // Enhanced socket connection with security
  const initializeSocket = useCallback(() => {
    // Rate limiting check
    if (!RateLimiter.isAllowed(`socket-connection-${securityConfig.sessionId}`,
                                securityConfig.maxConnectionAttempts,
                                securityConfig.connectionWindow)) {
      SecurityLogger.logSecurityEvent({
        type: 'unauthorized_access',
        severity: 'medium',
        details: {
          action: 'rate_limit_exceeded',
          endpoint: 'socket-connection',
          sessionId: securityConfig.sessionId
        }
      });
      return;
    }

    try {
      const websocketUrl = process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:3001';
      const sanitizedUrl = ContentSanitizer.sanitizeURL(websocketUrl);

      const newSocket = io(sanitizedUrl, {
        timeout: 10000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      newSocket.on('connect', () => {
        console.log('Connected to Claude Flow Personal portal');
        setState(prev => ({ ...prev, connected: true }));
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from portal');
        setState(prev => ({ ...prev, connected: false }));
      });

      // Enhanced event handlers with security
      newSocket.on('agent-message', (message) => {
        // Sanitize incoming message content
        const sanitizedMessage = {
          ...message,
          content: sanitizeInput(message.content || ''),
          agentId: sanitizeInput(message.agentId || ''),
          messageType: sanitizeInput(message.messageType || '')
        };

        setState(prev => ({
          ...prev,
          messages: [sanitizedMessage, ...prev.messages].slice(0, 1000)
        }));
      });

      newSocket.on('agent-status', (status) => {
        const sanitizedStatus = {
          ...status,
          agentId: sanitizeInput(status.agentId || ''),
          status: sanitizeInput(status.status || '')
        };

        setState(prev => ({
          ...prev,
          agents: prev.agents.map(agent =>
            agent.id === sanitizedStatus.agentId ? { ...agent, ...sanitizedStatus } : agent
          )
        }));
      });

      newSocket.on('human-intervention', (intervention) => {
        const sanitizedIntervention = {
          ...intervention,
          agentId: sanitizeInput(intervention.agentId || ''),
          message: sanitizeInput(intervention.message || ''),
          action: sanitizeInput(intervention.action || '')
        };

        setState(prev => ({
          ...prev,
          interventions: [sanitizedIntervention, ...prev.interventions].slice(0, 100)
        }));
      });

      newSocket.on('swarm-status', (data) => {
        setState(prev => ({
          ...prev,
          swarmData: data.status,
          currentSwarmId: sanitizeInput(data.swarmId || '')
        }));
      });

      setSocket(newSocket);

    } catch (error) {
      SecurityLogger.logSecurityEvent({
        type: 'invalid_input',
        severity: 'medium',
        details: {
          action: 'socket_initialization_failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }, [securityConfig]);

  // Initialize socket connection with enhanced security
  useEffect(() => {
    initializeSocket();

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [initializeSocket]);

  // Enhanced join swarm with validation and security
  const joinSwarm = useCallback((rawSwarmId: string) => {
    // Validate input
    const validation = validateInput(rawSwarmId, swarmIdValidationRules);
    if (!validation.isValid) {
      SecurityLogger.logSecurityEvent({
        type: 'invalid_input',
        severity: 'low',
        details: {
          action: 'join_swarm_validation_failed',
          errors: validation.errors,
          input: rawSwarmId
        }
      });
      return;
    }

    const sanitizedSwarmId = sanitizeInput(rawSwarmId);

    if (socket && sanitizedSwarmId) {
      socket.emit('join-swarm', {
        swarmId: sanitizedSwarmId,
        userId: sanitizeInput('web-user')
      });
      setState(prev => ({ ...prev, currentSwarmId: sanitizedSwarmId }));
    }
  }, [socket, swarmIdValidationRules]);

  const leaveSwarm = () => {
    if (socket && state.currentSwarmId) {
      socket.emit('leave-swarm', { swarmId: state.currentSwarmId });
      setState(prev => ({
        ...prev,
        currentSwarmId: undefined,
        swarmData: null,
        messages: [],
        agents: []
      }));
    }
  };

  // Enhanced send intervention with security
  const sendIntervention = useCallback((intervention: {
    agentId?: string;
    message: string;
    action: string;
    metadata?: any;
  }) => {
    // Validate and sanitize intervention data
    const sanitizedIntervention = {
      agentId: intervention.agentId ? sanitizeInput(intervention.agentId) : undefined,
      message: sanitizeInput(intervention.message),
      action: sanitizeInput(intervention.action),
      metadata: intervention.metadata ? JSON.parse(JSON.stringify(intervention.metadata)) : undefined
    };

    // Validate required fields
    if (!sanitizedIntervention.message || sanitizedIntervention.message.length === 0) {
      SecurityLogger.logSecurityEvent({
        type: 'invalid_input',
        severity: 'low',
        details: {
          action: 'send_intervention_validation_failed',
          reason: 'Empty message'
        }
      });
      return;
    }

    if (socket && state.currentSwarmId) {
      socket.emit('send-intervention', {
        swarmId: state.currentSwarmId,
        ...sanitizedIntervention
      });
    }
  }, [socket, state.currentSwarmId]);

  const updateFilters = (filters: any) => {
    if (socket) {
      socket.emit('set-filter', filters);
      setState(prev => ({ ...prev, filters }));
    }
  };

  const sendMCPCommand = (system: 'claude-flow' | 'ruv-swarm' | 'playwright', command: string, params?: any) => {
    if (socket) {
      let eventName = 'claude-flow-command';
      if (system === 'ruv-swarm') {
        eventName = 'ruv-swarm-command';
      } else if (system === 'playwright') {
        eventName = 'playwright-command';
      }

      socket.emit(eventName, {
        command,
        params,
        swarmId: state.currentSwarmId
      });
    }
  };

  const renderCurrentView = () => {
    switch (state.viewMode) {
      case 'dashboard':
        return (
          <SwarmDashboard
            swarmData={state.swarmData}
            messages={state.messages}
            agents={state.agents}
            onSelectAgent={(agentId) => setState(prev => ({ ...prev, selectedAgent: agentId }))}
            playwrightTests={state.playwrightTests}
            testMetrics={state.testMetrics}
          />
        );

      case 'messages':
        return (
          <MessageViewer
            messages={state.messages}
            filters={state.filters}
            selectedAgent={state.selectedAgent}
            onMessageSelect={(messageId) => console.log('Message selected:', messageId)}
          />
        );

      case 'agents':
        return (
          <AgentStatusPanel
            agents={state.agents}
            selectedAgent={state.selectedAgent}
            onAgentSelect={(agentId) => setState(prev => ({ ...prev, selectedAgent: agentId }))}
            onSendIntervention={sendIntervention}
          />
        );

      case 'transparency':
        return (
          <TransparencyInsights
            insights={state.transparencyInsights}
            swarmId={state.currentSwarmId}
            messages={state.messages}
            playwrightTests={state.playwrightTests}
            testMetrics={state.testMetrics}
          />
        );

      case 'mcp':
        return (
          <MCPIntegrationPanel
            swarmId={state.currentSwarmId}
            onSendCommand={sendMCPCommand}
            connected={state.connected}
          />
        );

      case 'playwright':
        return (
          <div className="playwright-panel" style={{ padding: '20px' }}>
            <h2>Playwright Tests</h2>
            <div style={{ marginBottom: '16px' }}>
              <strong>Total Tests:</strong> {state.testMetrics.totalTests}<br />
              <strong>Passed:</strong> {state.testMetrics.passedTests}<br />
              <strong>Failed:</strong> {state.testMetrics.failedTests}<br />
              <strong>Skipped:</strong> {state.testMetrics.skippedTests}<br />
              <strong>Coverage:</strong> {state.testMetrics.coverage.toFixed(2)}%<br />
              <strong>Average Duration:</strong> {state.testMetrics.averageDuration.toFixed(2)}ms
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <AccessibleButton
                onClick={() => {
                  sendMCPCommand('playwright', 'test_run', {
                    testPath: 'all',
                    options: { coverage: true }
                  });
                }}
                variant="primary"
                disabled={!state.connected}
              >
                Run All Tests
              </AccessibleButton>
              <AccessibleButton
                onClick={() => {
                  sendMCPCommand('playwright', 'test_coverage');
                }}
                variant="secondary"
                disabled={!state.connected}
              >
                Get Coverage
              </AccessibleButton>
            </div>
            <div>
              <h3>Recent Test Runs</h3>
              {state.playwrightTests.length === 0 ? (
                <p>No tests run yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {state.playwrightTests.map((test) => (
                    <div
                      key={test.id}
                      style={{
                        padding: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: test.status === 'passed' ? '#d4edda' :
                                       test.status === 'failed' ? '#f8d7da' : '#fff3cd'
                      }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{test.testPath}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Status: {test.status || 'Unknown'}
                        {test.duration && ` | Duration: ${test.duration}ms`}
                        {test.progress && ` | Progress: ${test.progress}%`}
                      </div>
                      {test.error && (
                        <div style={{ color: '#d63031', fontSize: '12px', marginTop: '4px' }}>
                          Error: {test.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <div className="app">
        {/* Accessibility features */}
        <SkipLink href="#main-content">Skip to main content</SkipLink>
        <ScreenReaderAnnouncer />
        <AccessibilityToolbar />
        <PerformanceMonitor />

        <header className="app-header" role="banner">
          <div className="header-left">
            <h1>Claude Flow Personal</h1>
            <div className="connection-status" role="status" aria-live="polite">
              <span
                className={`status-indicator ${state.connected ? 'connected' : 'disconnected'}`}
                aria-hidden="true"
              />
              {state.connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          <div className="header-right">
            {state.currentSwarmId ? (
              <div className="swarm-info" role="group" aria-label="Swarm information">
                <span>Swarm: {ContentSanitizer.sanitizeText(state.currentSwarmId)}</span>
                <AccessibleButton
                  onClick={leaveSwarm}
                  variant="secondary"
                  aria-label="Leave current swarm"
                >
                  Leave Swarm
                </AccessibleButton>
              </div>
            ) : (
              <div className="swarm-connection" role="group" aria-label="Swarm connection">
                <input
                  type="text"
                  placeholder="Enter Swarm ID"
                  aria-label="Swarm ID"
                  maxLength={100}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement;
                      joinSwarm(input.value);
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    marginRight: '8px'
                  }}
                />
                <AccessibleButton
                  onClick={() => {
                    const input = document.querySelector('input') as HTMLInputElement;
                    if (input?.value) {
                      joinSwarm(input.value);
                    }
                  }}
                  variant="primary"
                  aria-label="Join swarm with entered ID"
                >
                  Join Swarm
                </AccessibleButton>
              </div>
            )}
          </div>
        </header>

      <nav className="app-nav" role="navigation" aria-label="Main navigation">
        <AccessibleButton
          onClick={() => setState(prev => ({ ...prev, viewMode: 'dashboard' }))}
          variant={state.viewMode === 'dashboard' ? 'primary' : 'secondary'}
          aria-current={state.viewMode === 'dashboard' ? 'page' : undefined}
        >
          Dashboard
        </AccessibleButton>
        <AccessibleButton
          onClick={() => setState(prev => ({ ...prev, viewMode: 'messages' }))}
          variant={state.viewMode === 'messages' ? 'primary' : 'secondary'}
          aria-current={state.viewMode === 'messages' ? 'page' : undefined}
          aria-label={`Messages, ${state.messages.length} items`}
        >
          Messages ({state.messages.length})
        </AccessibleButton>
        <AccessibleButton
          onClick={() => setState(prev => ({ ...prev, viewMode: 'agents' }))}
          variant={state.viewMode === 'agents' ? 'primary' : 'secondary'}
          aria-current={state.viewMode === 'agents' ? 'page' : undefined}
          aria-label={`Agents, ${state.agents.length} active`}
        >
          Agents ({state.agents.length})
        </AccessibleButton>
        <AccessibleButton
          onClick={() => setState(prev => ({ ...prev, viewMode: 'transparency' }))}
          variant={state.viewMode === 'transparency' ? 'primary' : 'secondary'}
          aria-current={state.viewMode === 'transparency' ? 'page' : undefined}
        >
          Transparency
        </AccessibleButton>
        <AccessibleButton
          onClick={() => setState(prev => ({ ...prev, viewMode: 'mcp' }))}
          variant={state.viewMode === 'mcp' ? 'primary' : 'secondary'}
          aria-current={state.viewMode === 'mcp' ? 'page' : undefined}
        >
          MCP Integration
        </AccessibleButton>
        <AccessibleButton
          onClick={() => setState(prev => ({ ...prev, viewMode: 'playwright' }))}
          variant={state.viewMode === 'playwright' ? 'primary' : 'secondary'}
          aria-current={state.viewMode === 'playwright' ? 'page' : undefined}
          aria-label={`Playwright tests, ${state.playwrightTests.length} tests`}
        >
          🎭 Playwright ({state.playwrightTests.length})
        </AccessibleButton>
      </nav>

      <div className="app-content">
        <div className="main-content" id="main-content" role="main">
          <ErrorBoundary>
            {renderCurrentView()}
          </ErrorBoundary>
        </div>

        <aside className="sidebar" role="complementary">
          <ErrorBoundary>
            <FilterControls
              filters={state.filters}
              onUpdateFilters={updateFilters}
              messages={state.messages}
            />
          </ErrorBoundary>

          <ErrorBoundary>
            <InterventionPanel
              swarmId={state.currentSwarmId}
              agents={state.agents}
              interventions={state.interventions}
              onSendIntervention={sendIntervention}
            />
          </ErrorBoundary>
        </aside>
      </div>

      {/* Real-time notifications */}
      <div
        className="notifications"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {state.messages.slice(0, 3).map((message, index) => (
          <div
            key={message.id}
            className={`notification notification-${message.messageType}`}
            style={{
              backgroundColor: message.messageType === 'error' ? '#ffe0e0' : '#e8f4fd',
              color: message.messageType === 'error' ? '#d63031' : '#0984e3',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              maxWidth: '300px',
              wordWrap: 'break-word'
            }}
          >
            <span className="agent-id" style={{ fontWeight: 'bold' }}>
              {ContentSanitizer.sanitizeText(message.agentId)}
            </span>: {ContentSanitizer.sanitizeText(message.content.substring(0, 100))}...
          </div>
        ))}
      </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;