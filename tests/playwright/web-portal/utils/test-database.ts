/**
 * @file Test Database for Web Portal Testing
 * @description In-memory database for test data management
 */

export class TestDatabase {
  private data: Map<string, any[]> = new Map();

  constructor() {
    this.initialize();
  }

  public async initialize(): Promise<void> {
    console.log('Initializing test database...');

    // Initialize collections
    this.data.set('users', []);
    this.data.set('swarms', []);
    this.data.set('agents', []);
    this.data.set('tasks', []);
    this.data.set('interventions', []);
    this.data.set('audit_logs', []);

    // Seed initial data
    await this.seedData();
  }

  private async seedData(): Promise<void> {
    // Default test user
    this.data.get('users')!.push({
      id: 'test-user-1',
      username: 'test-admin',
      password: 'test-password',
      role: 'admin',
      permissions: ['read', 'write', 'admin'],
      createdAt: new Date().toISOString()
    });

    // Test swarms
    this.data.get('swarms')!.push(
      {
        id: 'test-swarm-1',
        name: 'Development Swarm',
        topology: 'hierarchical',
        status: 'active',
        createdAt: new Date().toISOString(),
        metadata: {
          description: 'Primary development swarm for testing',
          tags: ['development', 'test']
        }
      },
      {
        id: 'test-swarm-2',
        name: 'Analysis Swarm',
        topology: 'mesh',
        status: 'idle',
        createdAt: new Date().toISOString(),
        metadata: {
          description: 'Analysis and review swarm',
          tags: ['analysis', 'review']
        }
      }
    );

    // Test agents
    this.data.get('agents')!.push(
      {
        id: 'agent-1',
        type: 'researcher',
        status: 'active',
        swarmId: 'test-swarm-1',
        capabilities: ['research', 'analysis', 'documentation'],
        currentTask: 'task-1',
        createdAt: new Date().toISOString(),
        metadata: {
          version: '1.0.0',
          specialization: 'API research'
        }
      },
      {
        id: 'agent-2',
        type: 'coder',
        status: 'idle',
        swarmId: 'test-swarm-1',
        capabilities: ['coding', 'implementation', 'debugging'],
        currentTask: null,
        createdAt: new Date().toISOString(),
        metadata: {
          version: '1.0.0',
          specialization: 'Backend development'
        }
      },
      {
        id: 'agent-3',
        type: 'tester',
        status: 'busy',
        swarmId: 'test-swarm-1',
        capabilities: ['testing', 'validation', 'quality-assurance'],
        currentTask: 'task-3',
        createdAt: new Date().toISOString(),
        metadata: {
          version: '1.0.0',
          specialization: 'E2E testing'
        }
      }
    );

    // Test tasks
    this.data.get('tasks')!.push(
      {
        id: 'task-1',
        description: 'Research API patterns for authentication service',
        status: 'in-progress',
        agentId: 'agent-1',
        swarmId: 'test-swarm-1',
        priority: 'high',
        progress: 65,
        startedAt: new Date(Date.now() - 1800000).toISOString(),
        estimatedCompletion: new Date(Date.now() + 600000).toISOString(),
        metadata: {
          category: 'research',
          complexity: 'medium'
        }
      },
      {
        id: 'task-2',
        description: 'Implement JWT authentication middleware',
        status: 'pending',
        agentId: 'agent-2',
        swarmId: 'test-swarm-1',
        priority: 'high',
        progress: 0,
        dependencies: ['task-1'],
        metadata: {
          category: 'implementation',
          complexity: 'high'
        }
      },
      {
        id: 'task-3',
        description: 'Write integration tests for auth flow',
        status: 'in-progress',
        agentId: 'agent-3',
        swarmId: 'test-swarm-1',
        priority: 'medium',
        progress: 30,
        startedAt: new Date(Date.now() - 900000).toISOString(),
        metadata: {
          category: 'testing',
          complexity: 'medium'
        }
      }
    );

    // Test interventions
    this.data.get('interventions')!.push({
      id: 'intervention-1',
      type: 'decision-required',
      agentId: 'agent-1',
      taskId: 'task-1',
      question: 'Should we use OAuth 2.0 or custom JWT implementation?',
      options: [
        {
          id: 'oauth2',
          label: 'OAuth 2.0',
          pros: ['Industry standard', 'Highly secure', 'Third-party integration'],
          cons: ['Complex setup', 'Learning curve', 'Additional dependencies']
        },
        {
          id: 'jwt',
          label: 'Custom JWT',
          pros: ['Simple implementation', 'Lightweight', 'Full control'],
          cons: ['Custom security implementation', 'Maintenance overhead']
        }
      ],
      priority: 'high',
      createdAt: new Date(Date.now() - 300000).toISOString(),
      status: 'pending',
      metadata: {
        category: 'architecture-decision',
        impact: 'high'
      }
    });

    console.log('✅ Test database seeded with initial data');
  }

  public find<T = any>(collection: string, query?: any): T[] {
    const items = this.data.get(collection) || [];
    if (!query) return items;

    return items.filter(item => {
      return Object.keys(query).every(key => {
        if (query[key] === undefined) return true;
        return item[key] === query[key];
      });
    });
  }

  public findOne<T = any>(collection: string, query: any): T | null {
    const results = this.find<T>(collection, query);
    return results.length > 0 ? results[0] : null;
  }

  public insert<T = any>(collection: string, item: T): T {
    if (!this.data.has(collection)) {
      this.data.set(collection, []);
    }

    const items = this.data.get(collection)!;
    const newItem = {
      ...item,
      id: (item as any).id || `${collection}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    };

    items.push(newItem);
    return newItem as T;
  }

  public update<T = any>(collection: string, query: any, updates: Partial<T>): T | null {
    const items = this.data.get(collection) || [];
    const itemIndex = items.findIndex(item => {
      return Object.keys(query).every(key => item[key] === query[key]);
    });

    if (itemIndex === -1) return null;

    const updatedItem = {
      ...items[itemIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    items[itemIndex] = updatedItem;
    return updatedItem as T;
  }

  public delete(collection: string, query: any): boolean {
    const items = this.data.get(collection) || [];
    const initialLength = items.length;

    const filteredItems = items.filter(item => {
      return !Object.keys(query).every(key => item[key] === query[key]);
    });

    this.data.set(collection, filteredItems);
    return filteredItems.length < initialLength;
  }

  public clear(collection?: string): void {
    if (collection) {
      this.data.set(collection, []);
    } else {
      this.data.clear();
    }
  }

  public count(collection: string, query?: any): number {
    return this.find(collection, query).length;
  }

  public getStats(): any {
    const stats: any = {};
    for (const [collection, items] of this.data.entries()) {
      stats[collection] = {
        count: items.length,
        lastUpdated: items.length > 0 ?
          Math.max(...items.map(item => new Date(item.updatedAt || item.createdAt).getTime())) :
          null
      };
    }
    return stats;
  }

  public async reset(): Promise<void> {
    this.data.clear();
    await this.initialize();
    console.log('✅ Test database reset completed');
  }
}