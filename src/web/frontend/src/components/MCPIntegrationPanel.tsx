/**
 * MCPIntegrationPanel - Direct control interface for Claude Flow and ruv-swarm MCP systems
 * Coordinated by Claude Flow MCP mcp-integration-specialist agent
 */

import React, { useState, useEffect } from 'react';
import './MCPIntegrationPanel.css';

export interface MCPIntegrationPanelProps {
  swarmId?: string;
  onSendCommand: (system: 'claude-flow' | 'ruv-swarm', command: string, params?: any) => void;
  connected: boolean;
}

interface MCPCommand {
  system: 'claude-flow' | 'ruv-swarm';
  command: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  category: 'swarm' | 'agent' | 'task' | 'neural' | 'system' | 'testing';
}

interface CommandHistory {
  id: string;
  system: 'claude-flow' | 'ruv-swarm';
  command: string;
  params: any;
  timestamp: string;
  status: 'sent' | 'success' | 'error' | 'running';
  result?: any;
  error?: string;
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    coverage?: number;
  };
}

const MCPIntegrationPanel: React.FC<MCPIntegrationPanelProps> = ({
  swarmId,
  onSendCommand,
  connected
}) => {
  const [selectedSystem, setSelectedSystem] = useState<'claude-flow' | 'ruv-swarm' | 'playwright'>('claude-flow');
  const [selectedCategory, setSelectedCategory] = useState<string>('swarm');
  const [selectedCommand, setSelectedCommand] = useState<MCPCommand | null>(null);
  const [commandParams, setCommandParams] = useState<Record<string, any>>({});
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const availableCommands: MCPCommand[] = [
    // Claude Flow MCP Commands
    {
      system: 'claude-flow',
      command: 'swarm_init',
      description: 'Initialize a new swarm with specified topology',
      category: 'swarm',
      params: [
        { name: 'topology', type: 'select', required: true, description: 'Swarm topology (hierarchical, mesh, ring, star)' },
        { name: 'maxAgents', type: 'number', required: false, description: 'Maximum number of agents' },
        { name: 'strategy', type: 'select', required: false, description: 'Distribution strategy' }
      ]
    },
    {
      system: 'claude-flow',
      command: 'swarm_status',
      description: 'Get current swarm status and metrics',
      category: 'swarm',
      params: [
        { name: 'swarmId', type: 'text', required: false, description: 'Specific swarm ID' }
      ]
    },
    {
      system: 'claude-flow',
      command: 'agent_spawn',
      description: 'Create a new specialized agent',
      category: 'agent',
      params: [
        { name: 'type', type: 'select', required: true, description: 'Agent type' },
        { name: 'name', type: 'text', required: false, description: 'Custom agent name' },
        { name: 'capabilities', type: 'textarea', required: false, description: 'JSON array of capabilities' }
      ]
    },
    {
      system: 'claude-flow',
      command: 'agent_list',
      description: 'List all active agents',
      category: 'agent',
      params: [
        { name: 'filter', type: 'select', required: false, description: 'Filter by status' }
      ]
    },
    {
      system: 'claude-flow',
      command: 'task_orchestrate',
      description: 'Orchestrate a complex task across agents',
      category: 'task',
      params: [
        { name: 'task', type: 'textarea', required: true, description: 'Task description' },
        { name: 'strategy', type: 'select', required: false, description: 'Execution strategy' },
        { name: 'priority', type: 'select', required: false, description: 'Task priority' }
      ]
    },
    {
      system: 'claude-flow',
      command: 'neural_status',
      description: 'Check neural network status',
      category: 'neural'
    },
    {
      system: 'claude-flow',
      command: 'neural_train',
      description: 'Train neural patterns',
      category: 'neural',
      params: [
        { name: 'pattern_type', type: 'select', required: true, description: 'Pattern type to train' },
        { name: 'training_data', type: 'textarea', required: true, description: 'Training data' }
      ]
    },

    // ruv-swarm MCP Commands
    {
      system: 'ruv-swarm',
      command: 'swarm_init',
      description: 'Initialize ruv-swarm topology',
      category: 'swarm',
      params: [
        { name: 'topology', type: 'select', required: true, description: 'Swarm topology' },
        { name: 'maxAgents', type: 'number', required: false, description: 'Maximum agents' }
      ]
    },
    {
      system: 'ruv-swarm',
      command: 'swarm_status',
      description: 'Get ruv-swarm status',
      category: 'swarm',
      params: [
        { name: 'verbose', type: 'checkbox', required: false, description: 'Detailed information' }
      ]
    },
    {
      system: 'ruv-swarm',
      command: 'agent_spawn',
      description: 'Spawn ruv-swarm agent',
      category: 'agent',
      params: [
        { name: 'type', type: 'select', required: true, description: 'Agent type' },
        { name: 'capabilities', type: 'textarea', required: false, description: 'Agent capabilities' }
      ]
    },
    {
      system: 'ruv-swarm',
      command: 'benchmark_run',
      description: 'Execute performance benchmarks',
      category: 'system',
      params: [
        { name: 'type', type: 'select', required: false, description: 'Benchmark type' },
        { name: 'iterations', type: 'number', required: false, description: 'Number of iterations' }
      ]
    },
    {
      system: 'ruv-swarm',
      command: 'memory_usage',
      description: 'Get memory usage statistics',
      category: 'system'
    },

    // Playwright MCP Commands
    {
      system: 'playwright',
      command: 'test_run',
      description: 'Execute Playwright test suite',
      category: 'testing',
      params: [
        { name: 'testPath', type: 'text', required: false, description: 'Specific test file or directory path' },
        { name: 'browser', type: 'select', required: false, description: 'Browser to run tests on' },
        { name: 'headless', type: 'checkbox', required: false, description: 'Run tests in headless mode' },
        { name: 'workers', type: 'number', required: false, description: 'Number of parallel workers' },
        { name: 'timeout', type: 'number', required: false, description: 'Test timeout in milliseconds' }
      ]
    },
    {
      system: 'playwright',
      command: 'test_status',
      description: 'Get current test execution status',
      category: 'testing',
      params: [
        { name: 'testId', type: 'text', required: false, description: 'Specific test run ID' }
      ]
    },
    {
      system: 'playwright',
      command: 'test_debug',
      description: 'Run tests in debug mode with trace collection',
      category: 'testing',
      params: [
        { name: 'testPath', type: 'text', required: true, description: 'Test file to debug' },
        { name: 'browser', type: 'select', required: false, description: 'Browser for debugging' },
        { name: 'slowMo', type: 'number', required: false, description: 'Slow motion delay (ms)' }
      ]
    },
    {
      system: 'playwright',
      command: 'test_generate',
      description: 'Generate new Playwright tests using codegen',
      category: 'testing',
      params: [
        { name: 'url', type: 'text', required: true, description: 'Target URL for test generation' },
        { name: 'outputFile', type: 'text', required: false, description: 'Output test file path' },
        { name: 'browser', type: 'select', required: false, description: 'Browser for code generation' },
        { name: 'device', type: 'select', required: false, description: 'Device emulation' }
      ]
    },
    {
      system: 'playwright',
      command: 'test_report',
      description: 'Generate and view test reports',
      category: 'testing',
      params: [
        { name: 'format', type: 'select', required: false, description: 'Report format' },
        { name: 'outputDir', type: 'text', required: false, description: 'Output directory for reports' }
      ]
    },
    {
      system: 'playwright',
      command: 'browser_launch',
      description: 'Launch browser for interactive testing',
      category: 'testing',
      params: [
        { name: 'browser', type: 'select', required: false, description: 'Browser type' },
        { name: 'headless', type: 'checkbox', required: false, description: 'Headless mode' },
        { name: 'slowMo', type: 'number', required: false, description: 'Slow motion delay' }
      ]
    },
    {
      system: 'playwright',
      command: 'trace_view',
      description: 'View Playwright trace files',
      category: 'testing',
      params: [
        { name: 'tracePath', type: 'text', required: true, description: 'Path to trace file' }
      ]
    },
    {
      system: 'playwright',
      command: 'config_update',
      description: 'Update Playwright configuration',
      category: 'testing',
      params: [
        { name: 'configFile', type: 'text', required: false, description: 'Configuration file path' },
        { name: 'options', type: 'textarea', required: true, description: 'Configuration options (JSON)' }
      ]
    },
    {
      system: 'playwright',
      command: 'test_orchestrate',
      description: 'Orchestrate complex test workflows across agents',
      category: 'testing',
      params: [
        { name: 'testSuites', type: 'textarea', required: true, description: 'Test suites to orchestrate (JSON array)' },
        { name: 'strategy', type: 'select', required: false, description: 'Orchestration strategy' },
        { name: 'priority', type: 'select', required: false, description: 'Test priority level' },
        { name: 'agents', type: 'textarea', required: false, description: 'Specific agents to use (JSON array)' }
      ]
    }
  ];

  const getFilteredCommands = () => {
    return availableCommands.filter(cmd =>
      cmd.system === selectedSystem &&
      (selectedCategory === 'all' || cmd.category === selectedCategory)
    );
  };

  const handleCommandSelect = (command: MCPCommand) => {
    setSelectedCommand(command);
    setCommandParams({});
  };

  const handleParamChange = (paramName: string, value: any) => {
    setCommandParams(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const executeCommand = async () => {
    if (!selectedCommand) return;

    setIsLoading(true);

    const historyEntry: CommandHistory = {
      id: `cmd_${Date.now()}`,
      system: selectedCommand.system,
      command: selectedCommand.command,
      params: { ...commandParams },
      timestamp: new Date().toISOString(),
      status: 'sent'
    };

    setCommandHistory(prev => [historyEntry, ...prev.slice(0, 19)]);

    try {
      await onSendCommand(selectedCommand.system, selectedCommand.command, commandParams);

      // Update history with success
      setCommandHistory(prev =>
        prev.map(entry =>
          entry.id === historyEntry.id
            ? { ...entry, status: 'success' as const }
            : entry
        )
      );
    } catch (error) {
      // Update history with error
      setCommandHistory(prev =>
        prev.map(entry =>
          entry.id === historyEntry.id
            ? {
                ...entry,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            : entry
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderParameterInput = (param: any) => {
    const value = commandParams[param.name] || '';

    switch (param.type) {
      case 'select':
        let options: string[] = [];

        if (param.name === 'topology') {
          options = ['hierarchical', 'mesh', 'ring', 'star'];
        } else if (param.name === 'strategy') {
          options = ['balanced', 'specialized', 'adaptive'];
        } else if (param.name === 'type' && selectedCommand?.category === 'agent') {
          options = ['coordinator', 'analyst', 'optimizer', 'researcher', 'coder', 'tester'];
        } else if (param.name === 'priority') {
          options = ['low', 'medium', 'high', 'critical'];
        } else if (param.name === 'filter') {
          options = ['all', 'active', 'idle', 'busy'];
        } else if (param.name === 'pattern_type') {
          options = ['coordination', 'optimization', 'prediction'];
        } else if (param.name === 'browser') {
          options = ['chromium', 'firefox', 'webkit'];
        } else if (param.name === 'device') {
          options = ['iPhone 12', 'iPad', 'Galaxy S9+', 'Desktop Chrome', 'Desktop Firefox'];
        } else if (param.name === 'format') {
          options = ['html', 'json', 'junit', 'line', 'dot'];
        }

        return (
          <select
            value={value}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            className="param-input"
          >
            <option value="">Select {param.name}</option>
            {options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleParamChange(param.name, parseInt(e.target.value) || 0)}
            className="param-input"
            min="1"
            max="100"
          />
        );

      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => handleParamChange(param.name, e.target.checked)}
            className="param-checkbox"
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            className="param-textarea"
            rows={3}
            placeholder={param.description}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            className="param-input"
            placeholder={param.description}
          />
        );
    }
  };

  return (
    <div className="mcp-integration-panel">
      <div className="panel-header">
        <h2>MCP Integration Control</h2>
        <div className="connection-status">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="mcp-controls">
        <div className="system-selector">
          <label>MCP System:</label>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                value="claude-flow"
                checked={selectedSystem === 'claude-flow'}
                onChange={(e) => setSelectedSystem(e.target.value as any)}
              />
              Claude Flow MCP
            </label>
            <label>
              <input
                type="radio"
                value="ruv-swarm"
                checked={selectedSystem === 'ruv-swarm'}
                onChange={(e) => setSelectedSystem(e.target.value as any)}
              />
              ruv-swarm MCP
            </label>
            <label>
              <input
                type="radio"
                value="playwright"
                checked={selectedSystem === 'playwright'}
                onChange={(e) => setSelectedSystem(e.target.value as any)}
              />
              Playwright MCP
            </label>
          </div>
        </div>

        <div className="category-selector">
          <label>Category:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Commands</option>
            <option value="swarm">Swarm Management</option>
            <option value="agent">Agent Control</option>
            <option value="task">Task Orchestration</option>
            <option value="neural">Neural Networks</option>
            <option value="system">System Operations</option>
            <option value="testing">Testing & QA</option>
          </select>
        </div>
      </div>

      <div className="command-section">
        <h3>Available Commands</h3>
        <div className="commands-list">
          {getFilteredCommands().map((command, index) => (
            <div
              key={index}
              className={`command-item ${selectedCommand?.command === command.command ? 'selected' : ''}`}
              onClick={() => handleCommandSelect(command)}
            >
              <div className="command-name">{command.command}</div>
              <div className="command-description">{command.description}</div>
              <div className="command-meta">
                <span className={`system-badge system-${command.system}`}>
                  {command.system}
                </span>
                <span className={`category-badge category-${command.category}`}>
                  {command.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedCommand && (
        <div className="parameter-section">
          <h3>Command Parameters</h3>
          <div className="parameters-form">
            {selectedCommand.params?.map((param) => (
              <div key={param.name} className="param-group">
                <label className="param-label">
                  {param.name}
                  {param.required && <span className="required">*</span>}
                </label>
                {renderParameterInput(param)}
                <div className="param-description">{param.description}</div>
              </div>
            )) || (
              <div className="no-params">This command requires no parameters</div>
            )}

            {swarmId && (
              <div className="param-group">
                <label className="param-label">Target Swarm ID</label>
                <input
                  type="text"
                  value={swarmId}
                  readOnly
                  className="param-input readonly"
                />
              </div>
            )}

            <div className="execute-section">
              <button
                onClick={executeCommand}
                disabled={!connected || isLoading}
                className="execute-button"
              >
                {isLoading ? (
                  <>
                    <span className="spinner" />
                    Executing...
                  </>
                ) : (
                  `Execute ${selectedCommand.command}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="history-section">
        <h3>Command History</h3>
        <div className="history-list">
          {commandHistory.length === 0 ? (
            <div className="no-history">No commands executed yet</div>
          ) : (
            commandHistory.map((entry) => (
              <div key={entry.id} className="history-item">
                <div className="history-header">
                  <span className={`system-badge system-${entry.system}`}>
                    {entry.system}
                  </span>
                  <span className="command-name">{entry.command}</span>
                  <span className={`status-badge status-${entry.status}`}>
                    {entry.status}
                  </span>
                  <span className="timestamp">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {Object.keys(entry.params).length > 0 && (
                  <div className="history-params">
                    <strong>Parameters:</strong>
                    <pre>{JSON.stringify(entry.params, null, 2)}</pre>
                  </div>
                )}

                {entry.testResults && (
                  <div className="test-results">
                    <strong>Test Results:</strong>
                    <div className="test-summary">
                      <span className="test-stat passed">✅ {entry.testResults.passed} passed</span>
                      <span className="test-stat failed">❌ {entry.testResults.failed} failed</span>
                      <span className="test-stat skipped">⏭️ {entry.testResults.skipped} skipped</span>
                      <span className="test-stat duration">⏱️ {entry.testResults.duration}ms</span>
                      {entry.testResults.coverage && (
                        <span className="test-stat coverage">📊 {entry.testResults.coverage}% coverage</span>
                      )}
                    </div>
                  </div>
                )}

                {entry.result && !entry.testResults && (
                  <div className="history-result">
                    <strong>Result:</strong>
                    <pre>{JSON.stringify(entry.result, null, 2)}</pre>
                  </div>
                )}

                {entry.error && (
                  <div className="history-error">
                    <strong>Error:</strong>
                    <span className="error-message">{entry.error}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MCPIntegrationPanel;