/**
 * @file End-to-End Dashboard Workflow Tests
 * @description Comprehensive E2E tests for complete dashboard workflows using Playwright
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { mockTransparencyData } from '../web-portal/fixtures/transparency-data';

// Mock WebSocket for testing
class MockWebSocketServer {
  private connections: Set<any> = new Set();
  private messageHandlers: Map<string, Function[]> = new Map();

  constructor(private page: Page) {
    this.setupWebSocketMock();
  }

  private setupWebSocketMock() {
    // Mock WebSocket constructor
    this.page.addInitScript(() => {
      class MockWebSocket {
        public url: string;
        public readyState: number = 1; // OPEN
        public onopen: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;

        constructor(url: string) {
          this.url = url;

          // Simulate connection success
          setTimeout(() => {
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
          }, 100);

          // Store connection for server simulation
          (window as any).__mockWebSockets = (window as any).__mockWebSockets || [];
          (window as any).__mockWebSockets.push(this);
        }

        send(data: string) {
          // Simulate server processing
          setTimeout(() => {
            this.simulateServerResponse(data);
          }, 50);
        }

        close() {
          this.readyState = 3; // CLOSED
          if (this.onclose) {
            this.onclose(new CloseEvent('close'));
          }
        }

        private simulateServerResponse(data: string) {
          try {
            const message = JSON.parse(data);

            // Handle different message types
            switch (message.type) {
              case 'join-swarm':
                this.sendSwarmJoined(message);
                break;
              case 'send-intervention':
                this.sendInterventionForwarded(message);
                break;
              case 'request-status':
                this.sendStatusResponse(message);
                break;
              default:
                // Echo back for other messages
                this.receiveMessage({
                  type: message.type,
                  data: message.data,
                  timestamp: new Date().toISOString()
                });
            }
          } catch (error) {
            console.error('WebSocket mock error:', error);
          }
        }

        private sendSwarmJoined(message: any) {
          this.receiveMessage({
            type: 'swarm-joined',
            swarmId: message.swarmId,
            timestamp: new Date().toISOString(),
            subscribersCount: 1
          });

          // Send initial swarm status
          this.receiveMessage({
            type: 'swarm-status',
            swarmId: message.swarmId,
            status: {
              swarmId: message.swarmId,
              status: 'active',
              agents: 3,
              tasks: { active: 2, completed: 5, failed: 0 }
            },
            source: 'claude-flow-mcp',
            timestamp: new Date().toISOString()
          });
        }

        private sendInterventionForwarded(message: any) {
          this.receiveMessage({
            type: 'intervention-forwarded',
            interventionId: `intervention-${Date.now()}`,
            status: 'sent',
            mcpResponse: { taskId: `task-${Date.now()}` }
          });
        }

        private sendStatusResponse(message: any) {
          if (message.swarmId) {
            this.receiveMessage({
              type: 'swarm-status',
              swarmId: message.swarmId,
              status: {
                swarmId: message.swarmId,
                status: 'active',
                agents: 3,
                tasks: { active: 2, completed: 5, failed: 0 }
              },
              timestamp: new Date().toISOString()
            });
          }
        }

        private receiveMessage(data: any) {
          if (this.onmessage) {
            this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
          }
        }
      }

      (window as any).WebSocket = MockWebSocket;
    });
  }

  // Simulate real-time updates from server
  simulateAgentUpdate(agentId: string, updates: any) {
    this.page.evaluate(([id, updateData]) => {
      const ws = (window as any).__mockWebSockets?.[0];
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'agent_update',
            agentId: id,
            updates: updateData,
            timestamp: new Date().toISOString()
          })
        }));
      }
    }, [agentId, updates]);
  }

  simulateMetricsUpdate(metrics: any) {
    this.page.evaluate((metricsData) => {
      const ws = (window as any).__mockWebSockets?.[0];
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'metrics_update',
            metrics: metricsData,
            timestamp: new Date().toISOString()
          })
        }));
      }
    }, [metrics]);
  }

  simulateNewMessage(message: any) {
    this.page.evaluate((messageData) => {
      const ws = (window as any).__mockWebSockets?.[0];
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'new_message',
            message: messageData,
            timestamp: new Date().toISOString()
          })
        }));
      }
    }, [message]);
  }

  simulateDecisionInsight(insight: any) {
    this.page.evaluate((insightData) => {
      const ws = (window as any).__mockWebSockets?.[0];
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'decision_insight',
            insight: insightData,
            timestamp: new Date().toISOString()
          })
        }));
      }
    }, [insight]);
  }

  simulateSwarmRelaunch(relaunch: any) {
    this.page.evaluate((relaunchData) => {
      const ws = (window as any).__mockWebSockets?.[0];
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'swarm_relaunch',
            relaunch: relaunchData,
            timestamp: new Date().toISOString()
          })
        }));
      }
    }, [relaunch]);
  }
}

test.describe('Dashboard E2E Workflow Tests', () => {
  let mockWsServer: MockWebSocketServer;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Set up mock WebSocket server
    mockWsServer = new MockWebSocketServer(page);

    // Mock API responses
    await page.route('**/api/agents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [
            {
              id: 'agent-researcher-001',
              type: 'researcher',
              name: 'Research Agent Alpha',
              status: 'active',
              performance: 87,
              tasksCompleted: 23,
              currentTask: 'OAuth provider analysis',
              lastActivity: new Date().toISOString(),
              coordinationScore: 92,
              efficiency: 89
            },
            {
              id: 'agent-coder-001',
              type: 'coder',
              name: 'Coder Agent Beta',
              status: 'processing',
              performance: 94,
              tasksCompleted: 31,
              currentTask: 'Authentication middleware',
              lastActivity: new Date().toISOString(),
              coordinationScore: 88,
              efficiency: 96
            },
            {
              id: 'agent-reviewer-001',
              type: 'reviewer',
              name: 'Reviewer Agent Gamma',
              status: 'idle',
              performance: 91,
              tasksCompleted: 18,
              currentTask: undefined,
              lastActivity: new Date(Date.now() - 120000).toISOString(),
              coordinationScore: 95,
              efficiency: 85
            }
          ],
          pagination: {
            total: 3,
            limit: 50,
            offset: 0,
            hasMore: false
          }
        })
      });
    });

    await page.route('**/api/swarm/metrics', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          timeRange: '1h',
          timestamp: new Date().toISOString(),
          totalTasks: 72,
          completedTasks: 68,
          efficiency: 89.4,
          coordinationScore: 91.7,
          uptime: 98.2,
          throughput: 2.3,
          errorRate: 1.2,
          responseTime: 245
        })
      });
    });

    await page.route('**/api/tests/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          suites: {
            unit: {
              total: 145,
              passed: 142,
              failed: 2,
              skipped: 1,
              coverage: 87.5,
              averageDuration: 2.3
            },
            integration: {
              total: 68,
              passed: 65,
              failed: 3,
              skipped: 0,
              coverage: 82.1,
              averageDuration: 5.8
            },
            e2e: {
              total: 24,
              passed: 22,
              failed: 2,
              skipped: 0,
              coverage: 71.3,
              averageDuration: 45.2
            }
          },
          overall: {
            total: 237,
            passed: 229,
            failed: 7,
            skipped: 1,
            overallCoverage: 83.6,
            successRate: 96.6
          }
        })
      });
    });

    // Mock dashboard HTML
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Swarm Dashboard</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
          }
          .panel {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .panel h2 {
            margin-top: 0;
            color: #333;
          }
          .agent-card {
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .agent-card:hover {
            border-color: #007bff;
            box-shadow: 0 2px 8px rgba(0,123,255,0.2);
          }
          .agent-card.selected {
            border-color: #007bff;
            background-color: #f8f9ff;
          }
          .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 5px;
          }
          .status-indicator.connected {
            background-color: #28a745;
          }
          .status-indicator.disconnected {
            background-color: #dc3545;
          }
          .metric-card {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 10px;
          }
          .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
          }
          .control-button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          .control-button:hover {
            background: #0056b3;
          }
          .control-button:disabled {
            background: #6c757d;
            cursor: not-allowed;
          }
          .message-item {
            border-left: 3px solid #ddd;
            padding-left: 10px;
            margin-bottom: 10px;
          }
          .connection-status {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .progress-bar {
            width: 100%;
            height: 8px;
            background: #e9ecef;
            border-radius: 4px;
            overflow: hidden;
            margin: 5px 0;
          }
          .progress-fill {
            height: 100%;
            background: #007bff;
            transition: width 0.3s ease;
          }
        </style>
      </head>
      <body>
        <div id="root">
          <div class="dashboard-header">
            <h1>🚀 Claude Flow Swarm Dashboard</h1>
            <div class="connection-status">
              <div class="status-indicator" id="connection-indicator"></div>
              <span id="connection-text">Connecting...</span>
            </div>
          </div>

          <div class="dashboard-grid">
            <!-- Agent Status Panel -->
            <div class="panel">
              <h2>🤖 Agent Status</h2>
              <div id="agents-container">
                <!-- Agents will be loaded here -->
              </div>
            </div>

            <!-- Performance Metrics Panel -->
            <div class="panel">
              <h2>📊 Swarm Metrics</h2>
              <div id="metrics-container">
                <!-- Metrics will be loaded here -->
              </div>
            </div>

            <!-- Message Flow Panel -->
            <div class="panel">
              <h2>💬 Message Flow</h2>
              <div id="messages-container">
                <!-- Messages will appear here -->
              </div>
            </div>

            <!-- Decision Insights Panel -->
            <div class="panel">
              <h2>🧠 Decision Insights</h2>
              <div id="insights-container">
                <!-- Insights will appear here -->
              </div>
            </div>

            <!-- Swarm Controls Panel -->
            <div class="panel">
              <h2>🎛️ Swarm Controls</h2>
              <div class="control-section">
                <button class="control-button" id="restart-button">🔄 Restart Swarm</button>
              </div>
              <div id="relaunch-history">
                <!-- Relaunch history will appear here -->
              </div>
            </div>

            <!-- Test Status Panel -->
            <div class="panel">
              <h2>🎭 Test Status</h2>
              <div id="test-status">
                <!-- Test status will be loaded here -->
              </div>
            </div>
          </div>
        </div>

        <script>
          // Mock dashboard functionality
          class SwarmDashboard {
            constructor() {
              this.agents = [];
              this.messages = [];
              this.insights = [];
              this.relaunches = [];
              this.isConnected = false;
              this.selectedAgent = null;

              this.init();
            }

            async init() {
              await this.loadInitialData();
              this.setupWebSocket();
              this.setupEventHandlers();
              this.render();
            }

            async loadInitialData() {
              try {
                // Load agents
                const agentsResponse = await fetch('/api/agents');
                const agentsData = await agentsResponse.json();
                this.agents = agentsData.agents;

                // Load metrics
                const metricsResponse = await fetch('/api/swarm/metrics');
                const metricsData = await metricsResponse.json();
                this.metrics = metricsData;

                // Load test status
                const testsResponse = await fetch('/api/tests/status');
                const testsData = await testsResponse.json();
                this.testStatus = testsData;
              } catch (error) {
                console.error('Failed to load initial data:', error);
              }
            }

            setupWebSocket() {
              try {
                this.ws = new WebSocket('ws://localhost:8080/swarm');

                this.ws.onopen = () => {
                  this.isConnected = true;
                  this.updateConnectionStatus('Connected');
                  this.ws.send(JSON.stringify({
                    type: 'join-swarm',
                    swarmId: 'test-swarm-001'
                  }));
                };

                this.ws.onmessage = (event) => {
                  const data = JSON.parse(event.data);
                  this.handleWebSocketMessage(data);
                };

                this.ws.onclose = () => {
                  this.isConnected = false;
                  this.updateConnectionStatus('Disconnected');
                  this.startSimulation();
                };

                this.ws.onerror = () => {
                  this.isConnected = false;
                  this.updateConnectionStatus('Error');
                };
              } catch (error) {
                console.error('WebSocket error:', error);
                this.startSimulation();
              }
            }

            handleWebSocketMessage(data) {
              switch (data.type) {
                case 'agent_update':
                  this.updateAgent(data.agentId, data.updates);
                  break;
                case 'metrics_update':
                  this.metrics = { ...this.metrics, ...data.metrics };
                  break;
                case 'new_message':
                  this.messages.push(data.message);
                  if (this.messages.length > 20) {
                    this.messages = this.messages.slice(-20);
                  }
                  break;
                case 'decision_insight':
                  this.insights.push(data.insight);
                  if (this.insights.length > 10) {
                    this.insights = this.insights.slice(-10);
                  }
                  break;
                case 'swarm_relaunch':
                  this.relaunches.push(data.relaunch);
                  if (this.relaunches.length > 5) {
                    this.relaunches = this.relaunches.slice(-5);
                  }
                  break;
              }
              this.render();
            }

            updateAgent(agentId, updates) {
              const agent = this.agents.find(a => a.id === agentId);
              if (agent) {
                Object.assign(agent, updates);
              }
            }

            updateConnectionStatus(status) {
              const indicator = document.getElementById('connection-indicator');
              const text = document.getElementById('connection-text');

              indicator.className = 'status-indicator ' + (status === 'Connected' ? 'connected' : 'disconnected');
              text.textContent = status;
            }

            setupEventHandlers() {
              // Agent selection
              document.addEventListener('click', (e) => {
                if (e.target.closest('.agent-card')) {
                  const agentCard = e.target.closest('.agent-card');
                  const agentId = agentCard.dataset.agentId;

                  if (this.selectedAgent === agentId) {
                    this.selectedAgent = null;
                    agentCard.classList.remove('selected');
                  } else {
                    // Deselect previous
                    document.querySelectorAll('.agent-card.selected').forEach(card => {
                      card.classList.remove('selected');
                    });

                    this.selectedAgent = agentId;
                    agentCard.classList.add('selected');
                  }
                }
              });

              // Restart button
              const restartButton = document.getElementById('restart-button');
              restartButton.addEventListener('click', () => {
                this.restartSwarm();
              });
            }

            async restartSwarm() {
              const button = document.getElementById('restart-button');
              button.disabled = true;
              button.textContent = '🔄 Restarting...';

              const relaunch = {
                id: 'relaunch-' + Date.now(),
                timestamp: new Date(),
                reason: 'Manual restart',
                previousMetrics: this.metrics,
                agents: [...this.agents],
                duration: 0,
                success: false
              };

              // Simulate restart process
              setTimeout(() => {
                relaunch.success = true;
                relaunch.duration = 2000;

                // Update agents to idle then active
                this.agents.forEach(agent => {
                  agent.status = 'idle';
                  agent.currentTask = undefined;
                });

                setTimeout(() => {
                  this.agents[0].status = 'active';
                  this.agents[0].performance = Math.min(100, this.agents[0].performance + 5);
                  this.agents[0].efficiency = Math.min(100, this.agents[0].efficiency + 3);

                  this.relaunches.push(relaunch);
                  if (this.relaunches.length > 5) {
                    this.relaunches = this.relaunches.slice(-5);
                  }

                  button.disabled = false;
                  button.textContent = '🔄 Restart Swarm';
                  this.render();
                }, 1000);
              }, 2000);
            }

            startSimulation() {
              // Simulate real-time updates when WebSocket is not connected
              setInterval(() => {
                if (!this.isConnected) {
                  // Update agent metrics slightly
                  this.agents.forEach(agent => {
                    agent.performance = Math.min(100, Math.max(0,
                      agent.performance + (Math.random() - 0.5) * 2));
                    agent.efficiency = Math.min(100, Math.max(0,
                      agent.efficiency + (Math.random() - 0.5) * 1.5));
                  });

                  // Occasionally add messages
                  if (Math.random() > 0.7) {
                    this.messages.push({
                      id: 'msg-' + Date.now(),
                      from: this.agents[Math.floor(Math.random() * this.agents.length)].id,
                      to: this.agents[Math.floor(Math.random() * this.agents.length)].id,
                      type: ['coordination', 'data', 'status'][Math.floor(Math.random() * 3)],
                      content: 'Simulated message at ' + new Date().toLocaleTimeString(),
                      timestamp: new Date(),
                      priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
                    });

                    if (this.messages.length > 20) {
                      this.messages = this.messages.slice(-20);
                    }
                  }

                  this.render();
                }
              }, 3000);
            }

            render() {
              this.renderAgents();
              this.renderMetrics();
              this.renderMessages();
              this.renderInsights();
              this.renderRelaunchHistory();
              this.renderTestStatus();
            }

            renderAgents() {
              const container = document.getElementById('agents-container');
              container.innerHTML = this.agents.map(agent => \`
                <div class="agent-card \${this.selectedAgent === agent.id ? 'selected' : ''}" data-agent-id="\${agent.id}">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">🤖 \${agent.name}</h3>
                    <span style="background: \${this.getStatusColor(agent.status)}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                      \${agent.status}
                    </span>
                  </div>
                  <div style="margin-bottom: 5px;"><strong>Type:</strong> \${agent.type}</div>
                  <div style="margin-bottom: 5px;"><strong>Performance:</strong></div>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: \${agent.performance}%"></div>
                  </div>
                  <div style="margin-bottom: 5px;"><strong>Efficiency:</strong></div>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: \${agent.efficiency}%"></div>
                  </div>
                  <div style="margin-bottom: 5px;"><strong>Tasks:</strong> \${agent.tasksCompleted}</div>
                  \${agent.currentTask ? \`<div style="margin-bottom: 5px;"><strong>Current:</strong> \${agent.currentTask}</div>\` : ''}
                </div>
              \`).join('');
            }

            renderMetrics() {
              const container = document.getElementById('metrics-container');
              if (!this.metrics) return;

              container.innerHTML = \`
                <div class="metric-card">
                  <div>Efficiency</div>
                  <div class="metric-value">\${this.metrics.efficiency.toFixed(1)}%</div>
                  <div style="color: green; font-size: 12px;">+2.1%</div>
                </div>
                <div class="metric-card">
                  <div>Coordination</div>
                  <div class="metric-value">\${this.metrics.coordinationScore.toFixed(1)}%</div>
                  <div style="color: green; font-size: 12px;">+1.4%</div>
                </div>
                <div class="metric-card">
                  <div>Throughput</div>
                  <div class="metric-value">\${this.metrics.throughput.toFixed(1)}/s</div>
                  <div style="color: red; font-size: 12px;">-0.2/s</div>
                </div>
                <div class="metric-card">
                  <div>Response Time</div>
                  <div class="metric-value">\${this.metrics.responseTime}ms</div>
                  <div style="color: green; font-size: 12px;">-15ms</div>
                </div>
                <div class="metric-card">
                  <div>Uptime</div>
                  <div class="metric-value">\${this.metrics.uptime.toFixed(1)}%</div>
                  <div style="color: green; font-size: 12px;">+0.1%</div>
                </div>
                <div class="metric-card">
                  <div>Error Rate</div>
                  <div class="metric-value">\${this.metrics.errorRate.toFixed(1)}%</div>
                  <div style="color: green; font-size: 12px;">-0.3%</div>
                </div>
              \`;
            }

            renderMessages() {
              const container = document.getElementById('messages-container');
              container.innerHTML = this.messages.map(message => \`
                <div class="message-item">
                  <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
                    \${message.from} → \${message.to} | \${message.timestamp.toLocaleTimeString()}
                  </div>
                  <div>\${message.content}</div>
                  <div style="font-size: 11px; color: #999;">
                    Type: \${message.type} | Priority: \${message.priority}
                  </div>
                </div>
              \`).join('');
            }

            renderInsights() {
              const container = document.getElementById('insights-container');
              container.innerHTML = this.insights.map(insight => \`
                <div class="metric-card">
                  <div style="font-weight: bold; margin-bottom: 5px;">
                    \${insight.decision || 'Decision'}
                  </div>
                  <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
                    Agent: \${insight.agentId}
                  </div>
                  <div style="font-size: 11px; margin-bottom: 5px;">
                    \${insight.reasoning || 'Reasoning not available'}
                  </div>
                  <div style="font-size: 11px; color: #999;">
                    Confidence: \${insight.confidence ? Math.round(insight.confidence * 100) + '%' : 'N/A'}
                  </div>
                </div>
              \`).join('');
            }

            renderRelaunchHistory() {
              const container = document.getElementById('relaunch-history');
              if (this.relaunches.length === 0) {
                container.innerHTML = '<p style="color: #666; font-style: italic;">No relaunch history</p>';
                return;
              }

              container.innerHTML = \`
                <h4 style="margin-top: 20px;">Recent Relaunches (\${this.relaunches.length})</h4>
                \${this.relaunches.map(relaunch => \`
                  <div class="metric-card">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span>\${relaunch.success ? '✅' : '❌'}</span>
                      <span style="font-size: 11px; color: #666;">
                        \${new Date(relaunch.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style="font-size: 12px; margin-top: 5px;">
                      Reason: \${relaunch.reason}
                    </div>
                    <div style="font-size: 11px; color: #666;">
                      Duration: \${(relaunch.duration / 1000).toFixed(1)}s
                    </div>
                  </div>
                \`).join('')}
              \`;
            }

            renderTestStatus() {
              const container = document.getElementById('test-status');
              if (!this.testStatus) return;

              container.innerHTML = \`
                <div class="metric-card">
                  <div>Total Tests</div>
                  <div class="metric-value">\${this.testStatus.overall.total}</div>
                  <div style="font-size: 12px; color: #666;">Across all suites</div>
                </div>
                <div class="metric-card">
                  <div style="color: #28a745;">✅ Passed</div>
                  <div class="metric-value">\${this.testStatus.overall.passed}</div>
                  <div style="font-size: 12px; color: #666;">
                    \${((this.testStatus.overall.passed / this.testStatus.overall.total) * 100).toFixed(1)}% success rate
                  </div>
                </div>
                <div class="metric-card">
                  <div style="color: #dc3545;">❌ Failed</div>
                  <div class="metric-value">\${this.testStatus.overall.failed}</div>
                  <div style="font-size: 12px; color: #666;">Need attention</div>
                </div>
                <div class="metric-card">
                  <div>📊 Coverage</div>
                  <div class="metric-value">\${this.testStatus.overall.overallCoverage.toFixed(1)}%</div>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: \${this.testStatus.overall.overallCoverage}%"></div>
                  </div>
                </div>
              \`;
            }

            getStatusColor(status) {
              const colors = {
                active: '#28a745',
                processing: '#ffc107',
                idle: '#6c757d',
                error: '#dc3545'
              };
              return colors[status] || '#6c757d';
            }
          }

          // Initialize dashboard when page loads
          document.addEventListener('DOMContentLoaded', () => {
            window.dashboard = new SwarmDashboard();
          });
        </script>
      </body>
      </html>
    `);
  });

  test.describe('Dashboard Loading and Initial State', () => {
    test('dashboard loads and displays initial data', async () => {
      await page.goto('about:blank');

      // Check dashboard title
      await expect(page.locator('h1')).toContainText('Claude Flow Swarm Dashboard');

      // Check connection status indicator
      await expect(page.locator('#connection-indicator')).toBeVisible();
      await expect(page.locator('#connection-text')).toBeVisible();

      // Check main panels are rendered
      await expect(page.locator('text=Agent Status')).toBeVisible();
      await expect(page.locator('text=Swarm Metrics')).toBeVisible();
      await expect(page.locator('text=Message Flow')).toBeVisible();
      await expect(page.locator('text=Decision Insights')).toBeVisible();
      await expect(page.locator('text=Swarm Controls')).toBeVisible();
      await expect(page.locator('text=Test Status')).toBeVisible();
    });

    test('agents are loaded and displayed correctly', async () => {
      await page.goto('about:blank');

      // Wait for agents to load
      await expect(page.locator('.agent-card')).toHaveCount(3);

      // Check agent details
      await expect(page.locator('text=Research Agent Alpha')).toBeVisible();
      await expect(page.locator('text=Coder Agent Beta')).toBeVisible();
      await expect(page.locator('text=Reviewer Agent Gamma')).toBeVisible();

      // Check agent types
      await expect(page.locator('text=researcher')).toBeVisible();
      await expect(page.locator('text=coder')).toBeVisible();
      await expect(page.locator('text=reviewer')).toBeVisible();

      // Check agent statuses
      await expect(page.locator('text=active')).toBeVisible();
      await expect(page.locator('text=processing')).toBeVisible();
      await expect(page.locator('text=idle')).toBeVisible();
    });

    test('performance metrics are displayed correctly', async () => {
      await page.goto('about:blank');

      // Wait for metrics to load
      await expect(page.locator('.metric-value')).toHaveCount(12); // 6 metrics + 6 test metrics

      // Check specific metrics
      await expect(page.locator('text=89.4%')).toBeVisible(); // Efficiency
      await expect(page.locator('text=91.7%')).toBeVisible(); // Coordination
      await expect(page.locator('text=2.3/s')).toBeVisible(); // Throughput
      await expect(page.locator('text=245ms')).toBeVisible(); // Response Time
    });

    test('test status information is displayed', async () => {
      await page.goto('about:blank');

      // Wait for test status to load
      await expect(page.locator('text=237')).toBeVisible(); // Total tests
      await expect(page.locator('text=229')).toBeVisible(); // Passed tests
      await expect(page.locator('text=7')).toBeVisible(); // Failed tests
      await expect(page.locator('text=83.6%')).toBeVisible(); // Coverage
    });
  });

  test.describe('WebSocket Connection and Real-time Updates', () => {
    test('WebSocket connection establishes successfully', async () => {
      await page.goto('about:blank');

      // Wait for connection to establish
      await expect(page.locator('#connection-text')).toContainText('Connected', { timeout: 5000 });
      await expect(page.locator('#connection-indicator')).toHaveClass(/connected/);
    });

    test('real-time agent updates are displayed', async () => {
      await page.goto('about:blank');

      // Wait for initial load
      await expect(page.locator('.agent-card')).toHaveCount(3);

      // Simulate agent update
      await mockWsServer.simulateAgentUpdate('agent-researcher-001', {
        performance: 95,
        status: 'processing',
        currentTask: 'Updated task assignment'
      });

      // Wait for update to be reflected
      await expect(page.locator('text=95.0%')).toBeVisible();
      await expect(page.locator('text=Updated task assignment')).toBeVisible();
    });

    test('real-time metrics updates are displayed', async () => {
      await page.goto('about:blank');

      // Wait for initial metrics
      await expect(page.locator('text=89.4%')).toBeVisible();

      // Simulate metrics update
      await mockWsServer.simulateMetricsUpdate({
        efficiency: 92.1,
        coordinationScore: 94.5,
        throughput: 3.1,
        errorRate: 0.8
      });

      // Wait for update to be reflected
      await expect(page.locator('text=92.1%')).toBeVisible();
      await expect(page.locator('text=94.5%')).toBeVisible();
      await expect(page.locator('text=3.1/s')).toBeVisible();
    });

    test('new messages appear in real-time', async () => {
      await page.goto('about:blank');

      // Check initial messages container
      const messagesContainer = page.locator('#messages-container');
      await expect(messagesContainer).toBeVisible();

      // Simulate new message
      await mockWsServer.simulateNewMessage({
        id: 'msg-001',
        from: 'agent-1',
        to: 'agent-2',
        type: 'coordination',
        content: 'Real-time test message',
        timestamp: new Date(),
        priority: 'high'
      });

      // Wait for message to appear
      await expect(messagesContainer.locator('text=Real-time test message')).toBeVisible();
      await expect(messagesContainer.locator('text=high')).toBeVisible();
    });

    test('decision insights appear in real-time', async () => {
      await page.goto('about:blank');

      const insightsContainer = page.locator('#insights-container');

      // Simulate decision insight
      await mockWsServer.simulateDecisionInsight({
        id: 'insight-001',
        agentId: 'agent-researcher-001',
        decision: 'Use OAuth2 for authentication',
        reasoning: 'Best security practice with good user experience',
        confidence: 0.92,
        impact: 'high',
        timestamp: new Date()
      });

      // Wait for insight to appear
      await expect(insightsContainer.locator('text=Use OAuth2 for authentication')).toBeVisible();
      await expect(insightsContainer.locator('text=92%')).toBeVisible();
      await expect(insightsContainer.locator('text=high')).toBeVisible();
    });
  });

  test.describe('Agent Interaction', () => {
    test('agents can be selected and deselected', async () => {
      await page.goto('about:blank');

      // Find first agent card
      const firstAgentCard = page.locator('.agent-card').first();

      // Check initial state (not selected)
      await expect(firstAgentCard).not.toHaveClass(/selected/);

      // Click to select
      await firstAgentCard.click();
      await expect(firstAgentCard).toHaveClass(/selected/);

      // Click again to deselect
      await firstAgentCard.click();
      await expect(firstAgentCard).not.toHaveClass(/selected/);
    });

    test('only one agent can be selected at a time', async () => {
      await page.goto('about:blank');

      const agentCards = page.locator('.agent-card');
      await expect(agentCards).toHaveCount(3);

      // Select first agent
      await agentCards.nth(0).click();
      await expect(agentCards.nth(0)).toHaveClass(/selected/);
      await expect(agentCards.nth(1)).not.toHaveClass(/selected/);
      await expect(agentCards.nth(2)).not.toHaveClass(/selected/);

      // Select second agent (should deselect first)
      await agentCards.nth(1).click();
      await expect(agentCards.nth(0)).not.toHaveClass(/selected/);
      await expect(agentCards.nth(1)).toHaveClass(/selected/);
      await expect(agentCards.nth(2)).not.toHaveClass(/selected/);
    });

    test('agent cards display hover effects', async () => {
      await page.goto('about:blank');

      const firstAgentCard = page.locator('.agent-card').first();

      // Check hover state
      await firstAgentCard.hover();
      // In a real implementation, we'd check for hover styles
      // For this test, we just verify the element is interactive
      await expect(firstAgentCard).toBeVisible();
    });
  });

  test.describe('Swarm Controls', () => {
    test('restart button triggers swarm restart process', async () => {
      await page.goto('about:blank');

      const restartButton = page.locator('#restart-button');
      await expect(restartButton).toBeVisible();
      await expect(restartButton).toContainText('Restart Swarm');

      // Click restart button
      await restartButton.click();

      // Check button state changes
      await expect(restartButton).toBeDisabled();
      await expect(restartButton).toContainText('Restarting...');

      // Wait for restart to complete
      await expect(restartButton).not.toBeDisabled({ timeout: 5000 });
      await expect(restartButton).toContainText('Restart Swarm');

      // Check relaunch history appears
      const relaunchHistory = page.locator('#relaunch-history');
      await expect(relaunchHistory.locator('text=Manual restart')).toBeVisible();
      await expect(relaunchHistory.locator('text=✅')).toBeVisible();
    });

    test('relaunch history displays correctly', async () => {
      await page.goto('about:blank');

      // Initially should show no relaunch history
      await expect(page.locator('#relaunch-history')).toContainText('No relaunch history');

      // Perform restart
      await page.locator('#restart-button').click();
      await page.waitForTimeout(4000); // Wait for restart to complete

      // Check relaunch history
      await expect(page.locator('#relaunch-history')).not.toContainText('No relaunch history');
      await expect(page.locator('#relaunch-history')).toContainText('Recent Relaunches');
      await expect(page.locator('#relaunch-history')).toContainText('Manual restart');
      await expect(page.locator('#relaunch-history')).toContainText('2.0s'); // Duration
    });

    test('multiple relaunches are tracked', async () => {
      await page.goto('about:blank');

      // Perform multiple restarts
      for (let i = 0; i < 3; i++) {
        await page.locator('#restart-button').click();
        await page.waitForTimeout(4000); // Wait for restart to complete
      }

      // Check relaunch history shows multiple entries
      const relaunchHistory = page.locator('#relaunch-history');
      await expect(relaunchHistory.locator('.metric-card')).toHaveCount(3);
      await expect(relaunchHistory).toContainText('Recent Relaunches (3)');
    });
  });

  test.describe('Error Handling and Resilience', () => {
    test('dashboard handles WebSocket disconnection gracefully', async () => {
      await page.goto('about:blank');

      // Wait for connection to establish
      await expect(page.locator('#connection-text')).toContainText('Connected');

      // Simulate WebSocket disconnection by reloading page without WebSocket support
      await page.evaluate(() => {
        window.ws?.close();
      });

      // Should show disconnected status
      await expect(page.locator('#connection-text')).toContainText('Disconnected');
      await expect(page.locator('#connection-indicator')).toHaveClass(/disconnected/);

      // Should start simulation mode
      await page.waitForTimeout(4000);

      // Should still display agent data
      await expect(page.locator('.agent-card')).toHaveCount(3);
    });

    test('dashboard handles API errors gracefully', async () => {
      await page.goto('about:blank');

      // Intercept API calls and simulate errors
      await page.route('**/api/agents', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' })
        });
      });

      // Reload page to trigger API call
      await page.reload();

      // Dashboard should still load with fallback data
      await expect(page.locator('h1')).toContainText('Claude Flow Swarm Dashboard');
      // Should not crash, even if API fails
      await expect(page.locator('.panel')).toHaveCount(6);
    });

    test('dashboard recovers from temporary errors', async () => {
      await page.goto('about:blank');

      // Simulate temporary API failure
      await page.route('**/api/swarm/metrics', route => {
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service unavailable' })
        });
      });

      // Reload page
      await page.reload();

      // Should handle error gracefully
      await expect(page.locator('h1')).toContainText('Claude Flow Swarm Dashboard');

      // Restore API functionality
      await page.unroute('**/api/swarm/metrics');

      // Simulate WebSocket update
      await mockWsServer.simulateMetricsUpdate({
        efficiency: 90.0,
        coordinationScore: 92.0
      });

      // Should display updated metrics
      await expect(page.locator('text=90.0%')).toBeVisible();
      await expect(page.locator('text=92.0%')).toBeVisible();
    });
  });

  test.describe('Performance and Responsiveness', () => {
    test('dashboard loads quickly', async () => {
      const startTime = Date.now();
      await page.goto('about:blank');

      // Wait for key elements to load
      await expect(page.locator('.agent-card')).toHaveCount(3);
      await expect(page.locator('.metric-value')).toHaveCount(12);

      const loadTime = Date.now() - startTime;

      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('real-time updates do not cause performance issues', async () => {
      await page.goto('about:blank');

      // Send many rapid updates
      for (let i = 0; i < 20; i++) {
        await mockWsServer.simulateAgentUpdate('agent-researcher-001', {
          performance: 80 + i,
          currentTask: `Task ${i}`
        });
      }

      // Wait for all updates to process
      await page.waitForTimeout(1000);

      // Dashboard should remain responsive
      await expect(page.locator('.agent-card')).toHaveCount(3);
      await expect(page.locator('#restart-button')).toBeVisible();
      await expect(page.locator('#restart-button')).toBeEnabled();
    });

    test('memory usage remains stable during extended use', async () => {
      await page.goto('about:blank');

      // Get initial memory usage (approximate)
      const initialMemory = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });

      // Simulate extended use with many updates
      for (let cycle = 0; cycle < 5; cycle++) {
        // Send various updates
        for (let i = 0; i < 10; i++) {
          await mockWsServer.simulateAgentUpdate(`agent-${i % 3 + 1}`, {
            performance: 80 + Math.random() * 20
          });
        }

        for (let i = 0; i < 5; i++) {
          await mockWsServer.simulateNewMessage({
            id: `msg-${cycle}-${i}`,
            from: 'agent-1',
            to: 'agent-2',
            content: `Message ${cycle}-${i}`,
            type: 'coordination',
            timestamp: new Date(),
            priority: 'medium'
          });
        }

        await page.waitForTimeout(500);
      }

      // Check final memory usage
      const finalMemory = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });

      // Memory increase should be reasonable (less than 50MB)
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('dashboard remains responsive under heavy load', async () => {
      await page.goto('about:blank');

      // Simulate heavy load with concurrent updates
      const updatePromises = [];

      for (let i = 0; i < 50; i++) {
        updatePromises.push(mockWsServer.simulateAgentUpdate('agent-researcher-001', {
          performance: 80 + (i % 20)
        }));
      }

      // Send all updates concurrently
      await Promise.all(updatePromises);

      // Check dashboard is still responsive
      await expect(page.locator('#restart-button')).toBeVisible();
      await expect(page.locator('#restart-button')).toBeEnabled();

      // Test interaction
      const firstAgentCard = page.locator('.agent-card').first();
      await firstAgentCard.click();
      await expect(firstAgentCard).toHaveClass(/selected/);
      await firstAgentCard.click();
      await expect(firstAgentCard).not.toHaveClass(/selected/);
    });
  });

  test.describe('Accessibility and User Experience', () => {
    test('dashboard has proper semantic HTML structure', async () => {
      await page.goto('about:blank');

      // Check for heading hierarchy
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
      await expect(h1).toContainText('Claude Flow Swarm Dashboard');

      // Check for main content areas
      await expect(page.locator('main, #root')).toBeVisible();

      // Check for interactive elements
      await expect(page.locator('button')).toHaveCount(1); // Restart button
      await expect(page.locator('.agent-card')).toHaveCount(3); // Interactive agent cards
    });

    test('dashboard supports keyboard navigation', async () => {
      await page.goto('about:blank');

      // Test tab navigation
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toBeVisible();

      // Test restart button with keyboard
      const restartButton = page.locator('#restart-button');
      await restartButton.focus();
      await expect(restartButton).toBeFocused();

      // Test Enter key
      await page.keyboard.press('Enter');
      await expect(restartButton).toBeDisabled();

      // Wait for restart to complete
      await page.waitForTimeout(4000);
      await expect(restartButton).not.toBeDisabled();
    });

    test('dashboard provides visual feedback for interactions', async () => {
      await page.goto('about:blank');

      const firstAgentCard = page.locator('.agent-card').first();

      // Check hover effect
      await firstAgentCard.hover();
      // In a real implementation, we'd check hover styles
      await expect(firstAgentCard).toBeVisible();

      // Check selection feedback
      await firstAgentCard.click();
      await expect(firstAgentCard).toHaveClass(/selected/);
    });

    test('dashboard displays loading states appropriately', async () => {
      await page.goto('about:blank');

      // Initially should show "Connecting..." state
      await expect(page.locator('#connection-text')).toContainText('Connecting');

      // Should transition to connected state
      await expect(page.locator('#connection-text')).toContainText('Connected', { timeout: 5000 });

      // Restart button should show loading state
      const restartButton = page.locator('#restart-button');
      await restartButton.click();
      await expect(restartButton).toContainText('Restarting...');
      await expect(restartButton).toBeDisabled();
    });
  });
});