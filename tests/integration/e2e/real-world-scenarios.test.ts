/**
 * E2E Real-World Usage Scenarios Tests
 * Tests complete workflows that users would actually perform
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

describe('Real-World Usage Scenarios', () => {
  const testDir = path.join(process.cwd(), 'tests', 'integration', 'temp-scenarios');
  const cliPath = path.join(process.cwd(), 'src', 'cli', 'main.ts');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterAll(async () => {
    process.chdir(process.cwd().replace(path.sep + 'tests' + path.sep + 'integration' + path.sep + 'temp-scenarios', ''));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Full-Stack Development Workflow', () => {
    test('should coordinate full-stack development with swarm', async () => {
      // Initialize project
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });

      // Spawn full-stack development team
      const backendSpawn = execAsync(`tsx ${cliPath} swarm spawn coder "Build REST API with Express and PostgreSQL"`, { timeout: 15000 });
      const frontendSpawn = execAsync(`tsx ${cliPath} swarm spawn coder "Create React frontend with TypeScript"`, { timeout: 15000 });
      const testSpawn = execAsync(`tsx ${cliPath} swarm spawn tester "Write comprehensive test suite"`, { timeout: 15000 });
      const devopsSpawn = execAsync(`tsx ${cliPath} swarm spawn analyst "Setup CI/CD pipeline and Docker"`, { timeout: 15000 });

      // Wait for all agents to spawn
      const results = await Promise.all([backendSpawn, frontendSpawn, testSpawn, devopsSpawn]);

      // Verify all spawned successfully
      results.forEach(({ stdout, stderr }) => {
        expect(stderr).toBe('');
        expect(stdout).toMatch(/agent|spawn|task/i);
      });

      // Check swarm status
      const { stdout: statusOut } = await execAsync(`tsx ${cliPath} swarm status`, { timeout: 5000 });
      expect(statusOut).toMatch(/4.*agents|active|mesh/i);
    }, 70000);

    test('should orchestrate complex multi-step development task', async () => {
      await execAsync(`tsx ${cliPath} swarm init hierarchical`, { timeout: 10000 });

      const command = `tsx ${cliPath} task orchestrate "Create e-commerce platform with user auth, product catalog, shopping cart, and payment processing" --strategy adaptive --priority high`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/task.*orchestrat|adaptive|high.*priority/i);
    }, 35000);
  });

  describe('SPARC-Driven Development Workflow', () => {
    test('should complete full SPARC workflow for feature development', async () => {
      const feature = "User authentication system with JWT tokens, password hashing, and role-based access control";

      // Run complete SPARC TDD workflow
      const command = `tsx ${cliPath} sparc tdd "${feature}"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 45000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/sparc|specification|pseudocode|architecture|refinement|completion/i);
    }, 50000);

    test('should handle iterative SPARC development with refinement', async () => {
      // Initial specification
      const spec = await execAsync(`tsx ${cliPath} sparc run spec-pseudocode "API rate limiting middleware"`, { timeout: 15000 });
      expect(spec.stdout).toMatch(/specification|pseudocode/i);

      // Architecture design
      const arch = await execAsync(`tsx ${cliPath} sparc run architect "API rate limiting middleware"`, { timeout: 15000 });
      expect(arch.stdout).toMatch(/architect|design/i);

      // Implementation with refinement
      const impl = await execAsync(`tsx ${cliPath} sparc run refinement "API rate limiting middleware"`, { timeout: 20000 });
      expect(impl.stdout).toMatch(/refinement|implementation/i);
    }, 60000);
  });

  describe('Enterprise Development Scenarios', () => {
    test('should handle large team coordination', async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh --max-agents 10`, { timeout: 10000 });

      // Spawn enterprise development team
      const teamRoles = [
        'coder:Build microservice architecture',
        'tester:Automated testing strategy',
        'analyst:Performance monitoring',
        'coordinator:Project management',
        'researcher:Technology evaluation',
        'architect:System design'
      ];

      const spawnPromises = teamRoles.map(role => {
        const [agentType, task] = role.split(':');
        return execAsync(`tsx ${cliPath} swarm spawn ${agentType} "${task}"`, { timeout: 15000 });
      });

      const results = await Promise.allSettled(spawnPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;

      expect(successful).toBeGreaterThan(3); // At least majority should succeed
    }, 100000);

    test('should coordinate microservices development', async () => {
      await execAsync(`tsx ${cliPath} swarm init hierarchical`, { timeout: 10000 });

      const command = `tsx ${cliPath} task orchestrate "Develop microservices architecture with API gateway, user service, order service, payment service, and notification service" --strategy parallel --priority critical`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/microservices|parallel|critical/i);
    }, 35000);
  });

  describe('DevOps and Deployment Scenarios', () => {
    test('should setup complete CI/CD pipeline', async () => {
      await execAsync(`tsx ${cliPath} swarm init star`, { timeout: 10000 });

      const command = `tsx ${cliPath} task orchestrate "Setup CI/CD pipeline with GitHub Actions, Docker containerization, Kubernetes deployment, and monitoring" --strategy sequential`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 25000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/ci.*cd|pipeline|sequential/i);
    }, 30000);

    test('should handle deployment coordination', async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });

      // Spawn deployment team
      const deploymentTeam = [
        execAsync(`tsx ${cliPath} swarm spawn analyst "Infrastructure provisioning"`, { timeout: 15000 }),
        execAsync(`tsx ${cliPath} swarm spawn coder "Deployment scripts"`, { timeout: 15000 }),
        execAsync(`tsx ${cliPath} swarm spawn tester "Deployment verification"`, { timeout: 15000 })
      ];

      const results = await Promise.all(deploymentTeam);
      results.forEach(({ stdout, stderr }) => {
        expect(stderr).toBe('');
        expect(stdout).toMatch(/agent|spawn/i);
      });
    }, 50000);
  });

  describe('Learning and Documentation Scenarios', () => {
    test('should coordinate documentation generation', async () => {
      await execAsync(`tsx ${cliPath} swarm init ring`, { timeout: 10000 });

      const command = `tsx ${cliPath} task orchestrate "Generate comprehensive project documentation including API docs, user guides, and developer onboarding" --strategy adaptive`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 20000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/documentation|adaptive/i);
    }, 25000);

    test('should handle code review and knowledge sharing', async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });

      // Store knowledge for sharing
      await execAsync(`tsx ${cliPath} memory store code-review.guidelines "Use consistent naming conventions and add comprehensive tests"`, { timeout: 5000 });

      const command = `tsx ${cliPath} task orchestrate "Perform code review with knowledge sharing and best practices documentation"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 15000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/code.*review|knowledge|best.*practices/i);
    }, 25000);
  });

  describe('Performance and Optimization Scenarios', () => {
    test('should coordinate performance optimization workflow', async () => {
      await execAsync(`tsx ${cliPath} swarm init hierarchical`, { timeout: 10000 });

      const command = `tsx ${cliPath} task orchestrate "Optimize application performance including database queries, caching, CDN setup, and code splitting" --priority high`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 25000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/performance|optimization|high/i);
    }, 30000);

    test('should run comprehensive benchmarking', async () => {
      const command = `tsx ${cliPath} benchmark run --type all`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 20000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/benchmark|performance|result/i);
    }, 25000);
  });

  describe('Integration with External Tools', () => {
    test('should handle git workflow integration', async () => {
      // Initialize git repo
      await execAsync('git init', { timeout: 5000 });
      await execAsync('git config user.email "test@example.com"', { timeout: 5000 });
      await execAsync('git config user.name "Test User"', { timeout: 5000 });

      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });

      const command = `tsx ${cliPath} task orchestrate "Implement feature with proper git workflow including branch creation, commits, and PR preparation"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 20000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/git|workflow|branch|commit/i);
    }, 30000);

    test('should coordinate with package managers', async () => {
      // Create package.json
      await fs.writeFile('package.json', JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        scripts: {
          test: 'echo "test"',
          build: 'echo "build"'
        }
      }));

      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });

      const command = `tsx ${cliPath} task orchestrate "Setup project dependencies, configure build system, and prepare for deployment"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 15000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/dependencies|build|deployment/i);
    }, 20000);
  });
});