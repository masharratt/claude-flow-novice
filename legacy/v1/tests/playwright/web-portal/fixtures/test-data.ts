/**
 * @file Test Data Factories and Fixtures
 * @description Centralized test data generation and management
 */

export interface TestUser {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: string[];
  email?: string;
  createdAt: string;
}

export interface TestSwarm {
  id: string;
  name: string;
  topology: 'mesh' | 'hierarchical' | 'ring' | 'star';
  status: 'active' | 'idle' | 'initializing' | 'terminated';
  agents: string[];
  createdAt: string;
  metadata?: any;
}

export interface TestAgent {
  id: string;
  type: 'researcher' | 'coder' | 'tester' | 'reviewer' | 'analyzer';
  status: 'active' | 'idle' | 'busy' | 'error';
  swarmId: string;
  capabilities: string[];
  currentTask?: string;
  createdAt: string;
  metadata?: any;
}

export interface TestTask {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  agentId: string;
  swarmId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  estimatedCompletion?: string;
  dependencies?: string[];
  metadata?: any;
}

export interface TestIntervention {
  id: string;
  type: 'decision-required' | 'input-needed' | 'approval-required';
  agentId: string;
  taskId: string;
  question: string;
  options: Array<{
    id: string;
    label: string;
    pros?: string[];
    cons?: string[];
  }>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
  metadata?: any;
}

export interface TestMessage {
  id: string;
  agentId: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  taskId?: string;
  metadata?: any;
}

export interface TestAuditLog {
  id: string;
  timestamp: string;
  agentId?: string;
  taskId?: string;
  action: string;
  details: any;
  context?: any;
}

/**
 * Test Data Factory
 */
export class TestDataFactory {
  private static idCounter = 1000;

  private static generateId(prefix: string = 'test'): string {
    return `${prefix}-${this.idCounter++}-${Date.now().toString(36)}`;
  }

  static createUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      id: this.generateId('user'),
      username: 'test-admin',
      password: 'test-password',
      role: 'admin',
      permissions: ['read', 'write', 'admin'],
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      ...overrides
    };
  }

  static createSwarm(overrides: Partial<TestSwarm> = {}): TestSwarm {
    return {
      id: this.generateId('swarm'),
      name: 'Test Development Swarm',
      topology: 'hierarchical',
      status: 'active',
      agents: [],
      createdAt: new Date().toISOString(),
      metadata: {
        description: 'Test swarm for development activities',
        tags: ['development', 'test']
      },
      ...overrides
    };
  }

  static createAgent(overrides: Partial<TestAgent> = {}): TestAgent {
    return {
      id: this.generateId('agent'),
      type: 'researcher',
      status: 'idle',
      swarmId: 'test-swarm-1',
      capabilities: ['research', 'analysis'],
      createdAt: new Date().toISOString(),
      metadata: {
        version: '1.0.0',
        specialization: 'General purpose'
      },
      ...overrides
    };
  }

  static createTask(overrides: Partial<TestTask> = {}): TestTask {
    return {
      id: this.generateId('task'),
      description: 'Test task for automated processing',
      status: 'pending',
      agentId: 'test-agent-1',
      swarmId: 'test-swarm-1',
      priority: 'medium',
      progress: 0,
      startedAt: new Date().toISOString(),
      estimatedCompletion: new Date(Date.now() + 3600000).toISOString(),
      metadata: {
        category: 'test',
        complexity: 'medium'
      },
      ...overrides
    };
  }

  static createIntervention(overrides: Partial<TestIntervention> = {}): TestIntervention {
    return {
      id: this.generateId('intervention'),
      type: 'decision-required',
      agentId: 'test-agent-1',
      taskId: 'test-task-1',
      question: 'Should we proceed with approach A or B?',
      options: [
        {
          id: 'option-a',
          label: 'Approach A',
          pros: ['Faster implementation', 'Lower risk'],
          cons: ['Limited flexibility']
        },
        {
          id: 'option-b',
          label: 'Approach B',
          pros: ['More flexible', 'Better long-term'],
          cons: ['Takes longer', 'Higher complexity']
        }
      ],
      priority: 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        category: 'architecture-decision'
      },
      ...overrides
    };
  }

  static createMessage(overrides: Partial<TestMessage> = {}): TestMessage {
    return {
      id: this.generateId('message'),
      agentId: 'test-agent-1',
      message: 'Test message from agent',
      type: 'info',
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'test-factory'
      },
      ...overrides
    };
  }

  static createAuditLog(overrides: Partial<TestAuditLog> = {}): TestAuditLog {
    return {
      id: this.generateId('log'),
      timestamp: new Date().toISOString(),
      agentId: 'test-agent-1',
      taskId: 'test-task-1',
      action: 'task-started',
      details: {
        task: 'Test task execution',
        reasoning: 'Automated test execution'
      },
      context: {
        environment: 'test',
        session: 'playwright-test'
      },
      ...overrides
    };
  }

  /**
   * Create a complete test scenario with related entities
   */
  static createScenario(scenarioType: 'basic' | 'complex' | 'stress'): {
    users: TestUser[];
    swarms: TestSwarm[];
    agents: TestAgent[];
    tasks: TestTask[];
    interventions: TestIntervention[];
    messages: TestMessage[];
    auditLogs: TestAuditLog[];
  } {
    const scenario = {
      users: [],
      swarms: [],
      agents: [],
      tasks: [],
      interventions: [],
      messages: [],
      auditLogs: []
    };

    switch (scenarioType) {
      case 'basic':
        scenario.users.push(this.createUser());
        scenario.swarms.push(this.createSwarm());
        scenario.agents.push(this.createAgent());
        scenario.tasks.push(this.createTask());
        scenario.messages.push(this.createMessage());
        scenario.auditLogs.push(this.createAuditLog());
        break;

      case 'complex':
        // Multiple swarms with agents and tasks
        scenario.users.push(this.createUser());

        const swarm1 = this.createSwarm({ name: 'Development Swarm', topology: 'hierarchical' });
        const swarm2 = this.createSwarm({ name: 'Analysis Swarm', topology: 'mesh' });
        scenario.swarms.push(swarm1, swarm2);

        // Agents for first swarm
        const agents1 = [
          this.createAgent({ type: 'researcher', swarmId: swarm1.id, status: 'active' }),
          this.createAgent({ type: 'coder', swarmId: swarm1.id, status: 'idle' }),
          this.createAgent({ type: 'tester', swarmId: swarm1.id, status: 'busy' })
        ];
        scenario.agents.push(...agents1);

        // Agents for second swarm
        const agents2 = [
          this.createAgent({ type: 'analyzer', swarmId: swarm2.id, status: 'active' }),
          this.createAgent({ type: 'reviewer', swarmId: swarm2.id, status: 'idle' })
        ];
        scenario.agents.push(...agents2);

        // Tasks
        scenario.tasks.push(
          this.createTask({ agentId: agents1[0].id, swarmId: swarm1.id, status: 'in-progress', priority: 'high' }),
          this.createTask({ agentId: agents1[1].id, swarmId: swarm1.id, status: 'pending', priority: 'medium' }),
          this.createTask({ agentId: agents1[2].id, swarmId: swarm1.id, status: 'in-progress', priority: 'high' }),
          this.createTask({ agentId: agents2[0].id, swarmId: swarm2.id, status: 'completed', priority: 'low' })
        );

        // Intervention
        scenario.interventions.push(
          this.createIntervention({
            agentId: agents1[0].id,
            taskId: scenario.tasks[0].id,
            priority: 'high'
          })
        );

        // Messages
        scenario.messages.push(
          ...agents1.map(agent => this.createMessage({ agentId: agent.id })),
          ...agents2.map(agent => this.createMessage({ agentId: agent.id }))
        );

        // Audit logs
        scenario.auditLogs.push(
          ...scenario.tasks.map(task =>
            this.createAuditLog({
              agentId: task.agentId,
              taskId: task.id,
              action: 'task-created'
            })
          )
        );
        break;

      case 'stress':
        // Large number of entities for performance testing
        scenario.users.push(this.createUser());

        // Multiple swarms
        for (let i = 0; i < 5; i++) {
          scenario.swarms.push(
            this.createSwarm({
              name: `Stress Test Swarm ${i + 1}`,
              topology: ['mesh', 'hierarchical', 'ring', 'star'][i % 4] as any
            })
          );
        }

        // Many agents
        for (let i = 0; i < 20; i++) {
          const swarmId = scenario.swarms[i % scenario.swarms.length].id;
          scenario.agents.push(
            this.createAgent({
              type: ['researcher', 'coder', 'tester', 'reviewer', 'analyzer'][i % 5] as any,
              swarmId,
              status: ['active', 'idle', 'busy'][i % 3] as any
            })
          );
        }

        // Many tasks
        for (let i = 0; i < 50; i++) {
          const agent = scenario.agents[i % scenario.agents.length];
          scenario.tasks.push(
            this.createTask({
              agentId: agent.id,
              swarmId: agent.swarmId,
              status: ['pending', 'in-progress', 'completed'][i % 3] as any,
              priority: ['low', 'medium', 'high', 'critical'][i % 4] as any
            })
          );
        }

        // Many messages
        for (let i = 0; i < 100; i++) {
          const agent = scenario.agents[i % scenario.agents.length];
          scenario.messages.push(
            this.createMessage({
              agentId: agent.id,
              message: `Stress test message ${i + 1}`,
              type: ['info', 'success', 'warning', 'error'][i % 4] as any
            })
          );
        }

        // Many audit logs
        for (let i = 0; i < 100; i++) {
          const task = scenario.tasks[i % scenario.tasks.length];
          scenario.auditLogs.push(
            this.createAuditLog({
              agentId: task.agentId,
              taskId: task.id,
              action: `stress-test-action-${i}`
            })
          );
        }
        break;
    }

    return scenario;
  }

  /**
   * Create test data for specific test cases
   */
  static createTestCaseData(testCase: string): any {
    switch (testCase) {
      case 'websocket-communication':
        return {
          agents: [
            this.createAgent({ id: 'ws-agent-1', status: 'active' }),
            this.createAgent({ id: 'ws-agent-2', status: 'idle' }),
            this.createAgent({ id: 'ws-agent-3', status: 'busy' })
          ],
          messages: Array.from({ length: 10 }, (_, i) =>
            this.createMessage({
              agentId: `ws-agent-${(i % 3) + 1}`,
              message: `WebSocket test message ${i + 1}`,
              timestamp: new Date(Date.now() + i * 1000).toISOString()
            })
          )
        };

      case 'human-intervention':
        const agent = this.createAgent({ id: 'intervention-agent' });
        const task = this.createTask({
          id: 'intervention-task',
          agentId: agent.id,
          status: 'in-progress',
          description: 'Task requiring human decision'
        });

        return {
          agent,
          task,
          intervention: this.createIntervention({
            agentId: agent.id,
            taskId: task.id,
            question: 'Should we use OAuth 2.0 or custom JWT implementation?',
            options: [
              {
                id: 'oauth2',
                label: 'OAuth 2.0',
                pros: ['Industry standard', 'Highly secure', 'Third-party integration'],
                cons: ['Complex setup', 'Learning curve']
              },
              {
                id: 'jwt',
                label: 'Custom JWT',
                pros: ['Simple implementation', 'Lightweight', 'Full control'],
                cons: ['Custom security implementation', 'Maintenance overhead']
              }
            ]
          })
        };

      case 'mcp-integration':
        return {
          tools: [
            {
              name: 'swarm_init',
              description: 'Initialize a new swarm with specified topology',
              parameters: { topology: 'mesh', maxAgents: 3 },
              expectedResult: 'Swarm initialized successfully'
            },
            {
              name: 'agent_spawn',
              description: 'Spawn a new agent in the swarm',
              parameters: { type: 'researcher', capabilities: ['research'] },
              expectedResult: 'Agent spawned successfully'
            },
            {
              name: 'task_orchestrate',
              description: 'Orchestrate a task across the swarm',
              parameters: { task: 'Test task', priority: 'medium' },
              expectedResult: 'Task orchestrated successfully'
            }
          ]
        };

      case 'transparency-logging':
        return {
          auditLogs: [
            this.createAuditLog({
              action: 'task-started',
              details: {
                task: 'Research API patterns',
                reasoning: 'High priority authentication requirement'
              }
            }),
            this.createAuditLog({
              action: 'research-progress',
              details: {
                findings: ['OAuth 2.0 standard', 'JWT lightweight option'],
                progress: 45,
                nextSteps: ['Compare security implications']
              }
            }),
            this.createAuditLog({
              action: 'intervention-resolved',
              details: {
                decision: 'oauth2',
                reasoning: 'Better security and industry standard'
              }
            })
          ]
        };

      default:
        return this.createScenario('basic');
    }
  }
}