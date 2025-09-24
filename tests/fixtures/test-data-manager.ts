import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Test Data Management and Fixtures System
 *
 * Manages test data lifecycle:
 * - Database seeding and cleanup
 * - Mock data generation
 * - Fixture management
 * - Test isolation
 * - Data consistency across tests
 */

export interface TestFixture {
  id: string;
  name: string;
  description: string;
  data: any;
  dependencies?: string[];
  cleanup?: boolean;
  scope: 'global' | 'suite' | 'test';
}

export interface DatabaseFixture {
  table: string;
  data: any[];
  cleanup: boolean;
  dependencies?: string[];
}

export interface APIFixture {
  endpoint: string;
  method: string;
  response: any;
  status: number;
  delay?: number;
}

export class TestDataManager {
  private fixtures: Map<string, TestFixture> = new Map();
  private databaseFixtures: Map<string, DatabaseFixture> = new Map();
  private apiFixtures: Map<string, APIFixture> = new Map();
  private fixturesDir: string;
  private tempData: Set<string> = new Set();

  constructor(fixturesDir: string = './tests/fixtures/data') {
    this.fixturesDir = fixturesDir;
    this.ensureFixturesDirectory();
    this.loadExistingFixtures();
  }

  /**
   * Load fixtures from files
   */
  private loadExistingFixtures(): void {
    try {
      const fixturesPath = join(this.fixturesDir, 'fixtures.json');
      if (existsSync(fixturesPath)) {
        const fixturesData = JSON.parse(readFileSync(fixturesPath, 'utf8'));

        fixturesData.fixtures?.forEach((fixture: TestFixture) => {
          this.fixtures.set(fixture.id, fixture);
        });

        fixturesData.databaseFixtures?.forEach((dbFixture: DatabaseFixture & { id: string }) => {
          this.databaseFixtures.set(dbFixture.id, dbFixture);
        });

        fixturesData.apiFixtures?.forEach((apiFixture: APIFixture & { id: string }) => {
          this.apiFixtures.set(apiFixture.id, apiFixture);
        });
      }
    } catch (error) {
      console.warn('Failed to load existing fixtures:', error);
    }
  }

  /**
   * Ensure fixtures directory exists
   */
  private ensureFixturesDirectory(): void {
    if (!existsSync(this.fixturesDir)) {
      mkdirSync(this.fixturesDir, { recursive: true });
    }
  }

  /**
   * Create a new test fixture
   */
  createFixture(fixture: TestFixture): void {
    this.fixtures.set(fixture.id, fixture);
    this.saveFixturesToFile();
  }

  /**
   * Get a fixture by ID
   */
  getFixture(id: string): TestFixture | undefined {
    return this.fixtures.get(id);
  }

  /**
   * Create database fixture
   */
  createDatabaseFixture(id: string, fixture: DatabaseFixture): void {
    this.databaseFixtures.set(id, fixture);
    this.saveFixturesToFile();
  }

  /**
   * Create API mock fixture
   */
  createAPIFixture(id: string, fixture: APIFixture): void {
    this.apiFixtures.set(id, fixture);
    this.saveFixturesToFile();
  }

  /**
   * Save all fixtures to file
   */
  private saveFixturesToFile(): void {
    const fixturesData = {
      fixtures: Array.from(this.fixtures.values()),
      databaseFixtures: Array.from(this.databaseFixtures.entries()).map(([id, fixture]) => ({
        id,
        ...fixture
      })),
      apiFixtures: Array.from(this.apiFixtures.entries()).map(([id, fixture]) => ({
        id,
        ...fixture
      }))
    };

    const fixturesPath = join(this.fixturesDir, 'fixtures.json');
    writeFileSync(fixturesPath, JSON.stringify(fixturesData, null, 2));
  }

  /**
   * Generate mock agent data
   */
  generateMockAgents(count: number = 10): any[] {
    const agentTypes = ['coder', 'tester', 'reviewer', 'researcher', 'coordinator'];
    const statuses = ['active', 'inactive', 'busy', 'error'];

    return Array.from({ length: count }, (_, index) => ({
      id: `agent-${index + 1}`,
      name: `Test Agent ${index + 1}`,
      type: agentTypes[index % agentTypes.length],
      status: statuses[index % statuses.length],
      created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastActive: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
      capabilities: this.generateCapabilities(agentTypes[index % agentTypes.length]),
      metrics: {
        tasksCompleted: Math.floor(Math.random() * 100),
        averageResponseTime: Math.floor(Math.random() * 5000) + 100,
        successRate: Math.random() * 0.3 + 0.7,
        cpuUsage: Math.random() * 80,
        memoryUsage: Math.random() * 70
      }
    }));
  }

  /**
   * Generate capabilities based on agent type
   */
  private generateCapabilities(agentType: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      coder: ['javascript', 'python', 'typescript', 'react', 'node.js', 'debugging'],
      tester: ['unit-testing', 'integration-testing', 'automation', 'jest', 'cypress'],
      reviewer: ['code-review', 'security-audit', 'best-practices', 'documentation'],
      researcher: ['data-analysis', 'documentation', 'trend-analysis', 'benchmarking'],
      coordinator: ['task-management', 'scheduling', 'communication', 'optimization']
    };

    const base = capabilityMap[agentType] || [];
    const additional = ['git', 'docker', 'ci-cd', 'monitoring'];

    return [...base, ...additional.slice(0, Math.floor(Math.random() * 3))];
  }

  /**
   * Generate mock swarm data
   */
  generateMockSwarms(count: number = 5): any[] {
    const topologies = ['hierarchical', 'mesh', 'star', 'ring'];
    const strategies = ['balanced', 'adaptive', 'specialized'];

    return Array.from({ length: count }, (_, index) => ({
      id: `swarm-${index + 1}`,
      name: `Test Swarm ${index + 1}`,
      topology: topologies[index % topologies.length],
      strategy: strategies[index % strategies.length],
      status: index === 0 ? 'active' : ['active', 'paused', 'terminated'][index % 3],
      agentCount: Math.floor(Math.random() * 8) + 2,
      maxAgents: Math.floor(Math.random() * 5) + 10,
      created: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
      performance: {
        tasksThroughput: Math.floor(Math.random() * 50) + 10,
        averageTaskTime: Math.floor(Math.random() * 10000) + 1000,
        coordinationEfficiency: Math.random() * 0.3 + 0.7,
        resourceUtilization: Math.random() * 0.4 + 0.5
      }
    }));
  }

  /**
   * Generate mock task data
   */
  generateMockTasks(count: number = 20): any[] {
    const taskTypes = ['development', 'testing', 'review', 'research', 'deployment'];
    const priorities = ['low', 'medium', 'high', 'critical'];
    const statuses = ['queued', 'in-progress', 'completed', 'failed', 'cancelled'];

    return Array.from({ length: count }, (_, index) => ({
      id: `task-${index + 1}`,
      title: `Test Task ${index + 1}`,
      description: `Description for test task ${index + 1} with detailed requirements`,
      type: taskTypes[index % taskTypes.length],
      priority: priorities[index % priorities.length],
      status: statuses[index % statuses.length],
      assignedAgent: index % 3 === 0 ? `agent-${(index % 10) + 1}` : null,
      assignedSwarm: index % 2 === 0 ? `swarm-${(index % 5) + 1}` : null,
      created: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString(),
      dueDate: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      estimatedTime: Math.floor(Math.random() * 480) + 30, // 30 minutes to 8 hours
      actualTime: index % 3 === 0 ? Math.floor(Math.random() * 600) + 30 : null,
      dependencies: index > 0 && index % 4 === 0 ? [`task-${index}`] : [],
      tags: this.generateRandomTags(),
      metadata: {
        complexity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        technology: ['javascript', 'python', 'docker', 'react'][Math.floor(Math.random() * 4)]
      }
    }));
  }

  /**
   * Generate random tags for tasks
   */
  private generateRandomTags(): string[] {
    const allTags = ['urgent', 'bug-fix', 'feature', 'enhancement', 'security', 'performance', 'ui', 'backend', 'database'];
    const tagCount = Math.floor(Math.random() * 3) + 1;
    return allTags.sort(() => Math.random() - 0.5).slice(0, tagCount);
  }

  /**
   * Generate performance metrics data
   */
  generatePerformanceMetrics(): any {
    const now = new Date();
    const timePoints = Array.from({ length: 24 }, (_, i) => {
      const time = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      return {
        timestamp: time.toISOString(),
        cpuUsage: Math.random() * 80 + 10,
        memoryUsage: Math.random() * 70 + 15,
        activeAgents: Math.floor(Math.random() * 20) + 5,
        tasksPerHour: Math.floor(Math.random() * 50) + 10,
        averageResponseTime: Math.random() * 2000 + 200,
        errorRate: Math.random() * 0.05,
        throughput: Math.random() * 100 + 50
      };
    });

    return {
      summary: {
        totalTasks: Math.floor(Math.random() * 1000) + 500,
        completedTasks: Math.floor(Math.random() * 800) + 400,
        activeAgents: Math.floor(Math.random() * 15) + 5,
        activeSwarms: Math.floor(Math.random() * 5) + 1,
        systemUptime: Math.floor(Math.random() * 30) + 1, // days
        averageTaskTime: Math.floor(Math.random() * 3600) + 300 // seconds
      },
      timeSeries: timePoints,
      agentPerformance: this.generateAgentPerformanceData(),
      swarmPerformance: this.generateSwarmPerformanceData()
    };
  }

  /**
   * Generate agent performance data
   */
  private generateAgentPerformanceData(): any[] {
    return Array.from({ length: 10 }, (_, index) => ({
      agentId: `agent-${index + 1}`,
      tasksCompleted: Math.floor(Math.random() * 50) + 10,
      averageTime: Math.random() * 3000 + 500,
      successRate: Math.random() * 0.2 + 0.8,
      resourceUsage: {
        cpu: Math.random() * 60 + 20,
        memory: Math.random() * 50 + 25,
        network: Math.random() * 30 + 10
      }
    }));
  }

  /**
   * Generate swarm performance data
   */
  private generateSwarmPerformanceData(): any[] {
    return Array.from({ length: 5 }, (_, index) => ({
      swarmId: `swarm-${index + 1}`,
      coordinationEfficiency: Math.random() * 0.3 + 0.7,
      taskDistributionTime: Math.random() * 1000 + 100,
      communicationLatency: Math.random() * 50 + 10,
      resourceBalancing: Math.random() * 0.2 + 0.8
    }));
  }

  /**
   * Setup database with test data
   */
  async setupDatabase(): Promise<void> {
    try {
      console.log('Setting up test database...');

      // Reset database
      if (process.env.NODE_ENV === 'test') {
        execSync('npm run db:reset:test', { stdio: 'inherit' });
      }

      // Seed with test data
      const agents = this.generateMockAgents(15);
      const swarms = this.generateMockSwarms(5);
      const tasks = this.generateMockTasks(30);

      await this.seedTable('agents', agents);
      await this.seedTable('swarms', swarms);
      await this.seedTable('tasks', tasks);

      console.log('Test database setup completed');
    } catch (error) {
      console.error('Database setup failed:', error);
      throw error;
    }
  }

  /**
   * Seed a database table with data
   */
  private async seedTable(table: string, data: any[]): Promise<void> {
    const seedFile = join(this.fixturesDir, `seed-${table}.json`);
    writeFileSync(seedFile, JSON.stringify(data, null, 2));

    // Execute seed script
    try {
      execSync(`npm run db:seed:${table} -- --file=${seedFile}`, { stdio: 'inherit' });
    } catch (error) {
      console.warn(`Failed to seed ${table}:`, error);
    }
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    try {
      // Clean database fixtures
      for (const [id, fixture] of this.databaseFixtures) {
        if (fixture.cleanup) {
          await this.cleanupDatabaseFixture(id, fixture);
        }
      }

      // Clean temporary data
      for (const tempId of this.tempData) {
        this.fixtures.delete(tempId);
      }
      this.tempData.clear();

      console.log('Test data cleanup completed');
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  /**
   * Clean up database fixture
   */
  private async cleanupDatabaseFixture(id: string, fixture: DatabaseFixture): Promise<void> {
    try {
      execSync(`npm run db:clean:${fixture.table}`, { stdio: 'pipe' });
    } catch (error) {
      console.warn(`Failed to clean ${fixture.table}:`, error);
    }
  }

  /**
   * Create temporary fixture (auto-cleanup)
   */
  createTempFixture(fixture: Omit<TestFixture, 'id'>): string {
    const id = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tempFixture: TestFixture = { ...fixture, id };

    this.fixtures.set(id, tempFixture);
    this.tempData.add(id);

    return id;
  }

  /**
   * Get all fixtures for a specific scope
   */
  getFixturesByScope(scope: TestFixture['scope']): TestFixture[] {
    return Array.from(this.fixtures.values()).filter(fixture => fixture.scope === scope);
  }

  /**
   * Load fixture dependencies
   */
  async loadFixtureDependencies(fixtureId: string): Promise<void> {
    const fixture = this.fixtures.get(fixtureId);
    if (!fixture?.dependencies) return;

    for (const depId of fixture.dependencies) {
      const dependency = this.fixtures.get(depId);
      if (!dependency) {
        throw new Error(`Dependency ${depId} not found for fixture ${fixtureId}`);
      }

      // Load dependency recursively
      await this.loadFixtureDependencies(depId);

      // Apply dependency data
      if (dependency.data) {
        await this.applyFixtureData(dependency);
      }
    }
  }

  /**
   * Apply fixture data to the system
   */
  private async applyFixtureData(fixture: TestFixture): Promise<void> {
    // Implementation depends on your data layer
    console.log(`Applying fixture data: ${fixture.name}`);
  }

  /**
   * Export fixtures for sharing between environments
   */
  exportFixtures(fixtureIds?: string[]): string {
    const fixturesToExport = fixtureIds
      ? fixtureIds.map(id => this.fixtures.get(id)).filter(Boolean)
      : Array.from(this.fixtures.values());

    return JSON.stringify({
      fixtures: fixturesToExport,
      exportDate: new Date().toISOString(),
      version: '1.0'
    }, null, 2);
  }

  /**
   * Import fixtures from exported data
   */
  importFixtures(fixtureData: string): void {
    try {
      const data = JSON.parse(fixtureData);

      data.fixtures.forEach((fixture: TestFixture) => {
        this.fixtures.set(fixture.id, fixture);
      });

      this.saveFixturesToFile();
    } catch (error) {
      console.error('Failed to import fixtures:', error);
      throw error;
    }
  }
}

/**
 * Factory function for creating test data manager
 */
export function createTestDataManager(fixturesDir?: string): TestDataManager {
  return new TestDataManager(fixturesDir);
}

/**
 * Global test data manager instance
 */
export const testDataManager = new TestDataManager();