#!/usr/bin/env tsx

import { ShadcnMCPAdapter } from '../src/swarm-fullstack/adapters/shadcn-mcp-adapter';
import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * shadcn MCP Integration Demo
 *
 * This demo showcases the shadcn MCP adapter capabilities:
 * 1. Component generation
 * 2. Theme customization
 * 3. Component caching
 * 4. Validation and optimization
 * 5. Integration with build systems
 */

interface ComponentDemoScenario {
  name: string;
  description: string;
  request: any;
  expectedFiles: string[];
}

const COMPONENT_SCENARIOS: ComponentDemoScenario[] = [
  {
    name: 'Basic Button',
    description: 'Generate a simple button component with variants',
    request: {
      name: 'CustomButton',
      type: 'button',
      props: ['children', 'variant', 'size', 'disabled'],
      styling: { variant: 'default', size: 'medium' },
      theme: 'default'
    },
    expectedFiles: ['custom-button.tsx', 'custom-button.stories.tsx']
  },
  {
    name: 'Data Card',
    description: 'Create a data display card with header and actions',
    request: {
      name: 'DataCard',
      type: 'card',
      props: ['title', 'description', 'data', 'actions', 'loading'],
      styling: { variant: 'outlined', size: 'medium', shadow: true },
      theme: 'default',
      features: ['loading-state', 'responsive', 'accessibility']
    },
    expectedFiles: ['data-card.tsx', 'data-card.test.tsx', 'data-card.stories.tsx']
  },
  {
    name: 'Form Input',
    description: 'Advanced form input with validation and error states',
    request: {
      name: 'FormInput',
      type: 'input',
      props: ['label', 'placeholder', 'value', 'onChange', 'error', 'required'],
      styling: { variant: 'outlined', size: 'medium' },
      theme: 'default',
      features: ['validation', 'error-states', 'accessibility', 'form-integration']
    },
    expectedFiles: ['form-input.tsx', 'form-input.test.tsx', 'form-input.stories.tsx']
  },
  {
    name: 'Navigation Menu',
    description: 'Complex navigation component with dropdown support',
    request: {
      name: 'NavigationMenu',
      type: 'navigation',
      props: ['items', 'activeItem', 'onItemClick', 'collapsible'],
      styling: { variant: 'horizontal', size: 'medium', theme: 'dark' },
      theme: 'dark',
      features: ['dropdown', 'keyboard-navigation', 'mobile-responsive', 'accessibility']
    },
    expectedFiles: ['navigation-menu.tsx', 'navigation-menu.test.tsx', 'navigation-menu.stories.tsx']
  },
  {
    name: 'Data Table',
    description: 'Full-featured data table with sorting and filtering',
    request: {
      name: 'DataTable',
      type: 'table',
      props: ['data', 'columns', 'sortable', 'filterable', 'pagination'],
      styling: { variant: 'striped', size: 'compact', responsive: true },
      theme: 'default',
      features: ['sorting', 'filtering', 'pagination', 'selection', 'export', 'accessibility']
    },
    expectedFiles: ['data-table.tsx', 'data-table.test.tsx', 'data-table.stories.tsx', 'data-table.css']
  }
];

const THEMES_TO_TEST = [
  { name: 'default', description: 'Default shadcn theme' },
  { name: 'dark', description: 'Dark mode variant' },
  { name: 'custom', description: 'Custom brand theme', customColors: {
    primary: '#3b82f6',
    secondary: '#64748b',
    accent: '#f59e0b',
    destructive: '#ef4444'
  }}
];

class ShadcnMCPDemo {
  private shadcnAdapter: ShadcnMCPAdapter;
  private outputDir: string;

  constructor() {
    this.outputDir = join(process.cwd(), 'demo-components');
    this.shadcnAdapter = new ShadcnMCPAdapter({
      cacheEnabled: true,
      defaultTheme: 'default',
      componentLibraryPath: this.outputDir,
      cacheTimeout: 3600000, // 1 hour
      maxCacheSize: 50
    });
  }

  async initialize(): Promise<void> {
    console.log(chalk.blue.bold('🎨 Initializing shadcn MCP Demo...\n'));

    try {
      // Create output directory
      if (!existsSync(this.outputDir)) {
        mkdirSync(this.outputDir, { recursive: true });
        console.log(chalk.green(`✅ Created output directory: ${this.outputDir}`));
      }

      // Initialize adapter
      await this.shadcnAdapter.initialize();
      const health = await this.shadcnAdapter.healthCheck();

      if (health.status === 'healthy') {
        console.log(chalk.green('✅ shadcn MCP adapter initialized successfully'));
        console.log(chalk.gray(`Version: ${health.version || 'N/A'}`));
        console.log(chalk.gray(`Available themes: ${health.availableThemes?.join(', ') || 'default'}`));
        console.log(chalk.gray(`Cache status: ${health.cacheStatus || 'enabled'}`));
      } else {
        throw new Error(`Health check failed: ${health.message}`);
      }
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      throw error;
    }
  }

  async demonstrateComponentGeneration(): Promise<void> {
    console.log(chalk.yellow.bold('\n🔧 Component Generation Demo'));

    for (const scenario of COMPONENT_SCENARIOS) {
      console.log(chalk.cyan(`\n📋 Generating: ${scenario.name}`));
      console.log(chalk.gray(`Description: ${scenario.description}`));

      try {
        const startTime = Date.now();

        const result = await this.shadcnAdapter.generateComponent(scenario.request);

        const duration = Date.now() - startTime;
        console.log(chalk.green(`✅ Generated in ${duration}ms`));

        if (result.success) {
          console.log(chalk.cyan('📁 Generated files:'));
          result.files.forEach(file => {
            console.log(`  - ${file.path} (${file.size} bytes)`);
          });

          if (result.dependencies && result.dependencies.length > 0) {
            console.log(chalk.magenta('📦 Dependencies:'));
            result.dependencies.forEach(dep => {
              console.log(`  - ${dep.name}@${dep.version}`);
            });
          }

          if (result.features && result.features.length > 0) {
            console.log(chalk.blue('✨ Features:'));
            result.features.forEach(feature => {
              console.log(`  - ${feature}`);
            });
          }
        } else {
          console.log(chalk.red(`❌ Generation failed: ${result.error}`));
        }

      } catch (error) {
        console.error(chalk.red(`❌ Component generation failed: ${error.message}`));
      }
    }
  }

  async demonstrateThemeCustomization(): Promise<void> {
    console.log(chalk.yellow.bold('\n🎨 Theme Customization Demo'));

    for (const theme of THEMES_TO_TEST) {
      console.log(chalk.cyan(`\n🎭 Testing theme: ${theme.name}`));
      console.log(chalk.gray(`Description: ${theme.description}`));

      try {
        // Apply theme
        if (theme.name === 'custom' && theme.customColors) {
          await this.shadcnAdapter.customizeTheme({
            name: 'custom',
            colors: theme.customColors,
            fonts: {
              primary: 'Inter, sans-serif',
              heading: 'Poppins, sans-serif'
            },
            spacing: {
              unit: '4px',
              scale: 1.25
            }
          });
          console.log(chalk.green('✅ Custom theme applied'));
        }

        // Generate a button with the current theme
        const buttonResult = await this.shadcnAdapter.generateComponent({
          name: `ThemedButton_${theme.name}`,
          type: 'button',
          theme: theme.name,
          props: ['children', 'variant'],
          styling: { variant: 'default', size: 'medium' }
        });

        if (buttonResult.success) {
          console.log(chalk.green(`✅ Themed button generated`));
          console.log(chalk.gray(`Files: ${buttonResult.files.map(f => f.name).join(', ')}`));
        }

      } catch (error) {
        console.error(chalk.red(`❌ Theme test failed: ${error.message}`));
      }
    }
  }

  async demonstrateCaching(): Promise<void> {
    console.log(chalk.yellow.bold('\n💾 Caching Demo'));

    const testComponent = {
      name: 'CacheTestButton',
      type: 'button',
      props: ['children', 'onClick'],
      theme: 'default'
    };

    try {
      console.log(chalk.gray('Generating component (first time - no cache)...'));
      const startTime1 = Date.now();
      const result1 = await this.shadcnAdapter.generateComponent(testComponent);
      const duration1 = Date.now() - startTime1;

      console.log(chalk.cyan(`📊 First generation: ${duration1}ms`));
      console.log(chalk.gray(`Cache hit: ${result1.fromCache ? 'YES' : 'NO'}`));

      console.log(chalk.gray('Generating same component (should use cache)...'));
      const startTime2 = Date.now();
      const result2 = await this.shadcnAdapter.generateComponent(testComponent);
      const duration2 = Date.now() - startTime2;

      console.log(chalk.cyan(`📊 Second generation: ${duration2}ms`));
      console.log(chalk.gray(`Cache hit: ${result2.fromCache ? 'YES' : 'NO'}`));

      if (result2.fromCache && duration2 < duration1) {
        const speedup = Math.round((duration1 / duration2) * 100) / 100;
        console.log(chalk.green(`✅ Cache performance: ${speedup}x faster`));
      }

      // Cache statistics
      const cacheStats = await this.shadcnAdapter.getCacheStats();
      console.log(chalk.magenta('\n📈 Cache Statistics:'));
      console.log(`  Cache size: ${cacheStats.size}/${cacheStats.maxSize}`);
      console.log(`  Hit rate: ${Math.round(cacheStats.hitRate * 100)}%`);
      console.log(`  Memory usage: ${Math.round(cacheStats.memoryUsage / 1024)}KB`);

    } catch (error) {
      console.error(chalk.red(`❌ Caching demo failed: ${error.message}`));
    }
  }

  async demonstrateValidation(): Promise<void> {
    console.log(chalk.yellow.bold('\n🛡️ Validation Demo'));

    const validationTests = [
      {
        name: 'Valid Component',
        request: {
          name: 'ValidButton',
          type: 'button',
          props: ['children'],
          theme: 'default'
        },
        shouldPass: true
      },
      {
        name: 'Invalid Component Name',
        request: {
          name: 'invalid-name!',
          type: 'button',
          props: ['children'],
          theme: 'default'
        },
        shouldPass: false
      },
      {
        name: 'Unsupported Type',
        request: {
          name: 'UnsupportedWidget',
          type: 'unsupported-type',
          props: ['data'],
          theme: 'default'
        },
        shouldPass: false
      },
      {
        name: 'Invalid Theme',
        request: {
          name: 'ThemedButton',
          type: 'button',
          props: ['children'],
          theme: 'nonexistent-theme'
        },
        shouldPass: false
      }
    ];

    for (const test of validationTests) {
      console.log(chalk.cyan(`\n🧪 Testing: ${test.name}`));

      try {
        const isValid = await this.shadcnAdapter.validateComponentRequest(test.request);

        if (test.shouldPass) {
          if (isValid.valid) {
            console.log(chalk.green('✅ Validation passed (expected)'));
          } else {
            console.log(chalk.red(`❌ Validation failed unexpectedly: ${isValid.errors?.join(', ')}`));
          }
        } else {
          if (!isValid.valid) {
            console.log(chalk.green(`✅ Validation failed (expected): ${isValid.errors?.join(', ')}`));
          } else {
            console.log(chalk.red('❌ Validation passed unexpectedly'));
          }
        }

      } catch (error) {
        console.error(chalk.red(`❌ Validation test error: ${error.message}`));
      }
    }
  }

  async demonstrateOptimization(): Promise<void> {
    console.log(chalk.yellow.bold('\n⚡ Optimization Demo'));

    try {
      console.log(chalk.gray('Generating optimized component...'));

      const optimizedResult = await this.shadcnAdapter.generateComponent({
        name: 'OptimizedCard',
        type: 'card',
        props: ['title', 'content', 'actions'],
        styling: { variant: 'elevated', size: 'medium' },
        theme: 'default',
        optimization: {
          minify: true,
          treeshake: true,
          bundleSize: true,
          performance: true
        }
      });

      if (optimizedResult.success) {
        console.log(chalk.green('✅ Optimized component generated'));

        if (optimizedResult.optimization) {
          console.log(chalk.cyan('📊 Optimization Results:'));
          console.log(`  Bundle size: ${optimizedResult.optimization.bundleSize}KB`);
          console.log(`  Minified: ${optimizedResult.optimization.minified ? 'YES' : 'NO'}`);
          console.log(`  Tree-shaken: ${optimizedResult.optimization.treeShaken ? 'YES' : 'NO'}`);
          console.log(`  Performance score: ${optimizedResult.optimization.performanceScore}/100`);
        }

        if (optimizedResult.metrics) {
          console.log(chalk.magenta('📈 Performance Metrics:'));
          console.log(`  Render time: ${optimizedResult.metrics.renderTime}ms`);
          console.log(`  Memory usage: ${optimizedResult.metrics.memoryUsage}KB`);
          console.log(`  DOM nodes: ${optimizedResult.metrics.domNodes}`);
        }
      }

    } catch (error) {
      console.error(chalk.red(`❌ Optimization demo failed: ${error.message}`));
    }
  }

  async generateProjectSummary(): Promise<void> {
    console.log(chalk.yellow.bold('\n📋 Generating Project Summary'));

    try {
      const summary = await this.shadcnAdapter.generateProjectSummary();

      console.log(chalk.cyan('📊 Component Library Summary:'));
      console.log(`  Total components: ${summary.totalComponents}`);
      console.log(`  Component types: ${summary.componentTypes.join(', ')}`);
      console.log(`  Themes used: ${summary.themes.join(', ')}`);
      console.log(`  Total size: ${Math.round(summary.totalSize / 1024)}KB`);

      if (summary.dependencies && summary.dependencies.length > 0) {
        console.log(chalk.magenta('\n📦 Project Dependencies:'));
        summary.dependencies.forEach(dep => {
          console.log(`  ${dep.name}@${dep.version} (${dep.size})`);
        });
      }

      // Generate package.json for the component library
      const packageJson = {
        name: 'shadcn-demo-components',
        version: '1.0.0',
        description: 'Generated component library from shadcn MCP demo',
        main: 'index.js',
        dependencies: summary.dependencies.reduce((acc, dep) => {
          acc[dep.name] = dep.version;
          return acc;
        }, {} as Record<string, string>),
        peerDependencies: {
          'react': '^18.0.0',
          'react-dom': '^18.0.0',
          '@types/react': '^18.0.0'
        },
        scripts: {
          build: 'tsc',
          test: 'jest',
          storybook: 'storybook dev -p 6006'
        }
      };

      const packagePath = join(this.outputDir, 'package.json');
      writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
      console.log(chalk.green(`✅ Generated package.json: ${packagePath}`));

    } catch (error) {
      console.error(chalk.red(`❌ Summary generation failed: ${error.message}`));
    }
  }

  async cleanup(): Promise<void> {
    console.log(chalk.yellow('\n🧹 Cleaning up shadcn MCP demo...'));

    try {
      await this.shadcnAdapter.clearCache();
      console.log(chalk.green('✅ Cache cleared'));

      // Optionally clean up generated files
      // (Comment out to keep generated files for inspection)
      // await fs.rm(this.outputDir, { recursive: true, force: true });
      // console.log(chalk.green('✅ Generated files cleaned up'));

      console.log(chalk.cyan(`💡 Generated components are available in: ${this.outputDir}`));
    } catch (error) {
      console.error(chalk.red('❌ Cleanup error:'), error.message);
    }
  }
}

// CLI Interface
async function main() {
  const demo = new ShadcnMCPDemo();

  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  try {
    await demo.initialize();

    switch (testType) {
      case 'generate':
        await demo.demonstrateComponentGeneration();
        break;

      case 'themes':
        await demo.demonstrateThemeCustomization();
        break;

      case 'cache':
        await demo.demonstrateCaching();
        break;

      case 'validation':
        await demo.demonstrateValidation();
        break;

      case 'optimization':
        await demo.demonstrateOptimization();
        break;

      case 'summary':
        await demo.generateProjectSummary();
        break;

      case 'all':
      default:
        await demo.demonstrateComponentGeneration();
        await demo.demonstrateThemeCustomization();
        await demo.demonstrateCaching();
        await demo.demonstrateValidation();
        await demo.demonstrateOptimization();
        await demo.generateProjectSummary();
        break;
    }

    console.log(chalk.green.bold('\n🎉 shadcn MCP demo completed successfully!'));
    console.log(chalk.cyan('\n💡 Next steps:'));
    console.log('  - Explore generated components in demo-components/');
    console.log('  - Integrate shadcn MCP into your full-stack swarm');
    console.log('  - Customize themes in fullstack-config.json');
    console.log('  - Use components in your React applications');

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
  const demo = new ShadcnMCPDemo();
  await demo.cleanup();
  process.exit(0);
});

// Run the demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ShadcnMCPDemo };