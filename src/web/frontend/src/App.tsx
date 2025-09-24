/**
 * Claude Flow Personal - Transparent Web Portal
 * Main React application for real-time agent message display and human intervention
 */

import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import SwarmDashboard from './components/SwarmDashboard';
import MessageViewer from './components/MessageViewer';
import InterventionPanel from './components/InterventionPanel';
import AgentStatusPanel from './components/AgentStatusPanel';
import TransparencyInsights from './components/TransparencyInsights';
import FilterControls from './components/FilterControls';
import MCPIntegrationPanel from './components/MCPIntegrationPanel';
import PlaywrightTestPanel from './components/PlaywrightTestPanel';
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

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:3001');

    newSocket.on('connect', () => {
      console.log('Connected to Claude Flow Personal portal');
      setState(prev => ({ ...prev, connected: true }));
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from portal');
      setState(prev => ({ ...prev, connected: false }));
    });

    // Handle swarm events
    newSocket.on('swarm-status', (data) => {
      setState(prev => ({
        ...prev,
        swarmData: data.status,
        currentSwarmId: data.swarmId
      }));
    });

    newSocket.on('agent-message', (message) => {
      setState(prev => ({
        ...prev,
        messages: [message, ...prev.messages].slice(0, 1000) // Keep last 1000 messages
      }));
    });

    newSocket.on('agent-status', (status) => {
      setState(prev => ({
        ...prev,
        agents: prev.agents.map(agent =>
          agent.id === status.agentId ? { ...agent, ...status } : agent
        )
      }));
    });

    newSocket.on('human-intervention', (intervention) => {
      setState(prev => ({
        ...prev,
        interventions: [intervention, ...prev.interventions].slice(0, 100)
      }));
    });

    newSocket.on('transparency-insight', (insight) => {
      setState(prev => ({
        ...prev,
        transparencyInsights: [insight, ...prev.transparencyInsights].slice(0, 50)
      }));
    });

    // Claude Flow MCP events
    newSocket.on('claude-flow-response', (response) => {
      console.log('Claude Flow MCP response:', response);
    });

    newSocket.on('ruv-swarm-response', (response) => {
      console.log('ruv-swarm MCP response:', response);
    });

    // Playwright MCP events
    newSocket.on('playwright-response', (response) => {
      console.log('Playwright MCP response:', response);
    });

    newSocket.on('test-started', (testData) => {
      setState(prev => ({
        ...prev,
        playwrightTests: [testData, ...prev.playwrightTests].slice(0, 100)
      }));
    });

    newSocket.on('test-completed', (testResult) => {
      setState(prev => {
        const updatedTests = prev.playwrightTests.map(test =>
          test.id === testResult.id ? { ...test, ...testResult } : test
        );

        // Update test metrics
        const totalTests = testResult.summary?.total || 0;
        const passedTests = testResult.summary?.passed || 0;
        const failedTests = testResult.summary?.failed || 0;
        const skippedTests = testResult.summary?.skipped || 0;
        const coverage = testResult.coverage || 0;
        const duration = testResult.duration || 0;

        return {
          ...prev,
          playwrightTests: updatedTests,
          testMetrics: {
            totalTests: prev.testMetrics.totalTests + totalTests,
            passedTests: prev.testMetrics.passedTests + passedTests,
            failedTests: prev.testMetrics.failedTests + failedTests,
            skippedTests: prev.testMetrics.skippedTests + skippedTests,
            coverage: coverage,
            averageDuration: (prev.testMetrics.averageDuration + duration) / 2
          }
        };
      });
    });

    newSocket.on('test-progress', (progress) => {
      setState(prev => ({
        ...prev,
        playwrightTests: prev.playwrightTests.map(test =>
          test.id === progress.testId ? { ...test, progress: progress.progress } : test
        )
      }));
    });

    newSocket.on('test-error', (error) => {
      setState(prev => ({
        ...prev,
        playwrightTests: prev.playwrightTests.map(test =>
          test.id === error.testId ? { ...test, error: error.message, status: 'failed' } : test
        )
      }));
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      newSocket.close();
    };
  }, []);

  const joinSwarm = (swarmId: string) => {
    if (socket) {
      socket.emit('join-swarm', { swarmId, userId: 'web-user' });
      setState(prev => ({ ...prev, currentSwarmId: swarmId }));
    }
  };

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

  const sendIntervention = (intervention: {
    agentId?: string;
    message: string;
    action: string;
    metadata?: any;
  }) => {
    if (socket && state.currentSwarmId) {
      socket.emit('send-intervention', {
        swarmId: state.currentSwarmId,
        ...intervention
      });
    }
  };

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
          <PlaywrightTestPanel
            tests={state.playwrightTests}
            testMetrics={state.testMetrics}
            onRunTest={(testPath, options) => {
              sendMCPCommand('playwright', 'test_run', {
                testPath,
                ...options
              });
            }}
            onStopTest={(testId) => {
              sendMCPCommand('playwright', 'test_stop', { testId });
            }}
            connected={state.connected}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Claude Flow Personal</h1>
          <div className="connection-status">
            <span className={`status-indicator ${state.connected ? 'connected' : 'disconnected'}`} />
            {state.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        <div className="header-right">
          {state.currentSwarmId ? (
            <div className="swarm-info">
              <span>Swarm: {state.currentSwarmId}</span>
              <button onClick={leaveSwarm} className="btn btn-secondary">
                Leave Swarm
              </button>
            </div>
          ) : (
            <div className="swarm-connection">
              <input
                type="text"
                placeholder="Enter Swarm ID"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    joinSwarm((e.target as HTMLInputElement).value);
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = document.querySelector('input') as HTMLInputElement;
                  if (input.value) joinSwarm(input.value);
                }}
                className="btn btn-primary"
              >
                Join Swarm
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className="app-nav">
        <button
          className={`nav-button ${state.viewMode === 'dashboard' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, viewMode: 'dashboard' }))}
        >
          Dashboard
        </button>
        <button
          className={`nav-button ${state.viewMode === 'messages' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, viewMode: 'messages' }))}
        >
          Messages ({state.messages.length})
        </button>
        <button
          className={`nav-button ${state.viewMode === 'agents' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, viewMode: 'agents' }))}
        >
          Agents ({state.agents.length})
        </button>
        <button
          className={`nav-button ${state.viewMode === 'transparency' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, viewMode: 'transparency' }))}
        >
          Transparency
        </button>
        <button
          className={`nav-button ${state.viewMode === 'mcp' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, viewMode: 'mcp' }))}
        >
          MCP Integration
        </button>
        <button
          className={`nav-button ${state.viewMode === 'playwright' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, viewMode: 'playwright' }))}
        >
          🎭 Playwright ({state.playwrightTests.length})
        </button>
      </nav>

      <div className="app-content">
        <div className="main-content">
          {renderCurrentView()}
        </div>

        <div className="sidebar">
          <FilterControls
            filters={state.filters}
            onUpdateFilters={updateFilters}
            messages={state.messages}
          />

          <InterventionPanel
            swarmId={state.currentSwarmId}
            agents={state.agents}
            interventions={state.interventions}
            onSendIntervention={sendIntervention}
          />
        </div>
      </div>

      {/* Real-time notifications */}
      <div className="notifications">
        {state.messages.slice(0, 3).map((message, index) => (
          <div key={message.id} className={`notification notification-${message.messageType}`}>
            <span className="agent-id">{message.agentId}</span>: {message.content.substring(0, 100)}...
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;