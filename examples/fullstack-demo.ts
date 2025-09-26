#!/usr/bin/env tsx

import { FullStackSwarmOrchestrator } from '../src/swarm-fullstack/core/fullstack-orchestrator';
import { configManager } from '../src/swarm-fullstack/config/fullstack-config';
import { ChromeMCPAdapter } from '../src/swarm-fullstack/adapters/chrome-mcp-adapter';
import { ShadcnMCPAdapter } from '../src/swarm-fullstack/adapters/shadcn-mcp-adapter';
import chalk from 'chalk';

/**
 * Full-Stack Swarm Demo
 *
 * This demo showcases the full-stack swarm system capabilities:
 * 1. Dynamic agent spawning based on feature complexity
 * 2. Chrome MCP integration for browser automation
 * 3. shadcn MCP for beautiful UI component generation
 * 4. End-to-end testing during development
 * 5. Real-time progress monitoring
 */

interface DemoScenario {
  name: string;
  description: string;
  featureRequest: string;
  expectedAgents: string[];
  complexity: 'low' | 'medium' | 'high';
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    name: 'Simple Landing Page',
    description: 'Create a responsive landing page with contact form',
    featureRequest: 'Build a modern responsive landing page with hero section, features grid, testimonials, and contact form with email validation',
    expectedAgents: ['frontend-developer', 'ui-designer', 'tester'],
    complexity: 'low'
  },
  {
    name: 'E-commerce Product Page',
    description: 'Build a complete product page with cart functionality',
    featureRequest: 'Create an e-commerce product page with image gallery, variant selection, add to cart, user reviews, and checkout flow with payment integration',
    expectedAgents: ['frontend-developer', 'backend-developer', 'ui-designer', 'api-developer', 'tester', 'reviewer'],
    complexity: 'medium'
  },
  {
    name: 'Real-time Chat Application',
    description: 'Full-stack real-time chat with authentication',
    featureRequest: 'Build a real-time chat application with user authentication, chat rooms, file sharing, emoji reactions, typing indicators, and mobile responsive design',
    expectedAgents: ['frontend-developer', 'backend-developer', 'ui-designer', 'api-developer', 'database-architect', 'devops-engineer', 'security-specialist', 'tester', 'reviewer'],
    complexity: 'high'
  }
];

class FullStackSwarmDemo {
  private orchestrator: FullStackSwarmOrchestrator;
  private isInitialized = false;

  constructor() {
    this.orchestrator = new FullStackSwarmOrchestrator();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log(chalk.blue.bold('\n🚀 Initializing Full-Stack Swarm Demo...\n'));

    try {
      // Load configuration
      const config = configManager.getConfigForEnvironment('development');
      console.log(chalk.green('✅ Configuration loaded'));

      // Initialize orchestrator
      await this.orchestrator.initialize(config);
      console.log(chalk.green('✅ Orchestrator initialized'));

      // Test MCP adapters
      await this.testAdapters();

      this.isInitialized = true;
      console.log(chalk.green.bold('\n✅ Demo initialization complete!\n'));
    } catch (error) {
      console.error(chalk.red('❌ Demo initialization failed:'), error);
      throw error;
    }
  }

  private async testAdapters(): Promise<void> {
    console.log(chalk.yellow('🔧 Testing MCP adapters...'));

    // Test Chrome MCP Adapter
    try {
      const chromeAdapter = new ChromeMCPAdapter({
        version: 'latest',
        headless: true,
        timeout: 10000
      });

      const chromeHealth = await chromeAdapter.healthCheck();
      if (chromeHealth.status === 'healthy') {
        console.log(chalk.green('  ✅ Chrome MCP adapter ready'));
      } else {
        console.log(chalk.yellow('  ⚠️  Chrome MCP adapter issues:'), chromeHealth.message);
      }
    } catch (error) {
      console.log(chalk.red('  ❌ Chrome MCP adapter failed:'), error.message);
    }

    // Test shadcn MCP Adapter
    try {
      const shadcnAdapter = new ShadcnMCPAdapter({
        cacheEnabled: true,
        defaultTheme: 'default',
        componentLibraryPath: './demo-components'
      });

      const shadcnHealth = await shadcnAdapter.healthCheck();
      if (shadcnHealth.status === 'healthy') {
        console.log(chalk.green('  ✅ shadcn MCP adapter ready'));
      } else {
        console.log(chalk.yellow('  ⚠️  shadcn MCP adapter issues:'), shadcnHealth.message);
      }
    } catch (error) {
      console.log(chalk.red('  ❌ shadcn MCP adapter failed:'), error.message);
    }
  }

  async runScenario(scenario: DemoScenario): Promise<void> {
    console.log(chalk.blue.bold(`\n📋 Running Scenario: ${scenario.name}`));
    console.log(chalk.gray(`Description: ${scenario.description}`));
    console.log(chalk.gray(`Complexity: ${scenario.complexity.toUpperCase()}`));
    console.log(chalk.gray(`Expected agents: ${scenario.expectedAgents.join(', ')}`));

    const startTime = Date.now();

    try {
      // Create feature request
      const featureRequest = {
        id: `demo-${Date.now()}`,
        name: scenario.name,
        description: scenario.featureRequest,
        priority: 'high' as const,
        requirements: {
          ui: scenario.complexity !== 'low',
          backend: scenario.complexity === 'high',
          testing: true,
          deployment: false
        },
        constraints: {
          timeoutMs: 300000, // 5 minutes for demo
          maxAgents: scenario.complexity === 'high' ? 10 : scenario.complexity === 'medium' ? 6 : 3
        }
      };

      // Execute feature development
      console.log(chalk.yellow('\n🏗️  Starting feature development...'));

      const result = await this.orchestrator.developFeature(featureRequest);

      // Display results
      const duration = Date.now() - startTime;
      console.log(chalk.green.bold(`\n✅ Scenario completed in ${duration}ms`));
      console.log(chalk.cyan('📊 Execution Results:'));
      console.log(`  Status: ${result.status}`);
      console.log(`  Active Agents: ${result.activeAgents}`);
      console.log(`  Completed Tasks: ${result.completedTasks}`);
      console.log(`  Progress: ${Math.round(result.progress * 100)}%`);

      if (result.metrics) {
        console.log(`  Messages Processed: ${result.metrics.messagesProcessed}`);
        console.log(`  Average Response Time: ${result.metrics.averageResponseTime}ms`);
        console.log(`  Success Rate: ${Math.round(result.metrics.successRate * 100)}%`);
      }

      if (result.artifacts && result.artifacts.length > 0) {
        console.log(chalk.magenta('\n📁 Generated Artifacts:'));
        result.artifacts.forEach(artifact => {
          console.log(`  - ${artifact.type}: ${artifact.path}`);
        });
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(chalk.red.bold(`\n❌ Scenario failed after ${duration}ms`));
      console.error(chalk.red(`Error: ${error.message}`));

      if (error.details) {
        console.error(chalk.red('Details:'), error.details);
      }
    }
  }

  async runAllScenarios(): Promise<void> {
    console.log(chalk.blue.bold('🎭 Running All Demo Scenarios\n'));

    for (const scenario of DEMO_SCENARIOS) {
      await this.runScenario(scenario);

      // Brief pause between scenarios
      if (scenario !== DEMO_SCENARIOS[DEMO_SCENARIOS.length - 1]) {
        console.log(chalk.gray('\n⏳ Waiting 2 seconds before next scenario...'));
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Final summary
    console.log(chalk.green.bold('\n🎉 All demo scenarios completed!'));
    console.log(chalk.cyan('💡 Next steps:'));
    console.log('  - Try the CLI: npm run fullstack:develop');
    console.log('  - Customize config: .claude-flow/fullstack-config.json');
    console.log('  - Explore examples: examples/ directory');
  }

  async demonstrateFeatures(): Promise<void> {
    console.log(chalk.blue.bold('\n🎪 Feature Demonstration\n'));

    // 1. Dynamic Agent Spawning
    console.log(chalk.yellow('1️⃣ Dynamic Agent Spawning'));
    console.log('   Analyzing feature complexity and determining optimal team composition...');

    const complexityAnalysis = await this.orchestrator.getDynamicAgentSpawner().analyzeFeatureAndPlanTeam({
      description: 'Build a social media dashboard with real-time analytics',
      requirements: ['frontend', 'backend', 'database', 'realtime', 'analytics'],
      constraints: { maxAgents: 8 }
    });

    console.log(`   Complexity Score: ${complexityAnalysis.complexity.score}/1.0`);
    console.log(`   Recommended Team Size: ${complexityAnalysis.teamPlan.recommendedAgents.length}`);
    console.log(`   Agent Types: ${complexityAnalysis.teamPlan.recommendedAgents.map(a => a.type).join(', ')}`);

    // 2. Chrome MCP Integration
    console.log(chalk.yellow('\n2️⃣ Chrome MCP Integration'));
    console.log('   Testing browser automation capabilities...');

    try {
      const chromeAdapter = this.orchestrator.getChromeAdapter();
      await chromeAdapter.navigate({ url: 'https://example.com' });
      await chromeAdapter.takeScreenshot({ filename: 'demo-screenshot.png' });
      console.log('   ✅ Successfully navigated and captured screenshot');
    } catch (error) {
      console.log(`   ⚠️ Chrome test skipped: ${error.message}`);
    }

    // 3. shadcn UI Generation
    console.log(chalk.yellow('\n3️⃣ shadcn UI Component Generation'));
    console.log('   Generating beautiful UI components...');

    try {
      const shadcnAdapter = this.orchestrator.getShadcnAdapter();
      const component = await shadcnAdapter.generateComponent({
        name: 'DemoCard',
        type: 'card',
        props: ['title', 'description', 'actions'],
        styling: { variant: 'outlined', size: 'medium' },
        theme: 'default'
      });

      console.log(`   ✅ Generated component: ${component.componentName}`);
      console.log(`   Files created: ${component.files.length}`);
    } catch (error) {
      console.log(`   ⚠️ shadcn test skipped: ${error.message}`);
    }

    // 4. Real-time Monitoring
    console.log(chalk.yellow('\n4️⃣ Real-time Swarm Monitoring'));
    console.log('   Demonstrating live progress tracking...');

    try {
      const status = await this.orchestrator.getSwarmStatus();
      console.log(`   Active Swarms: ${status.activeSwarms || 0}`);
      console.log(`   Total Agents: ${status.totalAgents || 0}`);
      console.log(`   System Health: ${status.health || 'unknown'}`);
      console.log(`   Uptime: ${Math.round((status.uptime || 0) / 1000)}s`);
    } catch (error) {
      console.log(`   ⚠️ Monitoring demo skipped: ${error.message}`);
    }

    console.log(chalk.green.bold('\n✨ Feature demonstration complete!'));
  }

  async cleanup(): Promise<void> {
    console.log(chalk.yellow('\n🧹 Cleaning up demo resources...'));

    try {
      await this.orchestrator.terminateAllSwarms();
      console.log(chalk.green('✅ All swarms terminated'));
    } catch (error) {
      console.error(chalk.red('❌ Cleanup error:'), error.message);
    }
  }
}

// CLI Interface
async function main() {
  const demo = new FullStackSwarmDemo();

  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  try {
    await demo.initialize();

    switch (command) {
      case 'scenarios':
      case 'all':
        await demo.runAllScenarios();
        break;

      case 'features':
        await demo.demonstrateFeatures();
        break;

      case 'scenario':
        const scenarioName = args[1];
        const scenario = DEMO_SCENARIOS.find(s =>
          s.name.toLowerCase().includes(scenarioName?.toLowerCase() || '')
        );

        if (scenario) {
          await demo.runScenario(scenario);
        } else {
          console.error(chalk.red('❌ Scenario not found. Available scenarios:'));
          DEMO_SCENARIOS.forEach(s => console.log(`  - ${s.name}`));
          process.exit(1);
        }
        break;

      default:
        console.log(chalk.blue.bold('Full-Stack Swarm Demo'));
        console.log(chalk.gray('Available commands:'));
        console.log('  npm run fullstack:demo [command]');
        console.log('');
        console.log('Commands:');
        console.log('  all        Run all demo scenarios (default)');
        console.log('  scenarios  Run all demo scenarios');
        console.log('  features   Demonstrate key features');
        console.log('  scenario <name>  Run specific scenario');
        console.log('');
        console.log('Available scenarios:');
        DEMO_SCENARIOS.forEach(s => console.log(`  - ${s.name.toLowerCase().replace(/\s+/g, '-')}`));
        break;
    }

  } catch (error) {
    console.error(chalk.red.bold('❌ Demo failed:'), error);
    process.exit(1);
  } finally {
    await demo.cleanup();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n🛑 Demo interrupted. Cleaning up...'));
  const demo = new FullStackSwarmDemo();
  await demo.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n🛑 Demo terminated. Cleaning up...'));
  const demo = new FullStackSwarmDemo();
  await demo.cleanup();
  process.exit(0);
});

// Run the demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}