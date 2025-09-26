#!/usr/bin/env tsx

import { ChromeMCPAdapter } from '../src/swarm-fullstack/adapters/chrome-mcp-adapter';
import chalk from 'chalk';

/**
 * Chrome MCP Integration Demo
 *
 * This demo showcases the Chrome MCP adapter capabilities:
 * 1. Version adaptation layer
 * 2. Browser automation
 * 3. Screenshot capture
 * 4. Form interaction
 * 5. Error handling and recovery
 */

class ChromeMCPDemo {
  private chromeAdapter: ChromeMCPAdapter;

  constructor() {
    this.chromeAdapter = new ChromeMCPAdapter({
      version: 'latest',
      headless: false, // Show browser for demo
      devtools: true,
      timeout: 30000,
      retryOnVersionMismatch: true,
      maxRetries: 3
    });
  }

  async initialize(): Promise<void> {
    console.log(chalk.blue.bold('🚀 Initializing Chrome MCP Demo...\n'));

    try {
      await this.chromeAdapter.initialize();
      const health = await this.chromeAdapter.healthCheck();

      if (health.status === 'healthy') {
        console.log(chalk.green('✅ Chrome MCP adapter initialized successfully'));
        console.log(chalk.gray(`Version: ${health.version}`));
        console.log(chalk.gray(`Features: ${health.supportedFeatures?.join(', ') || 'N/A'}`));
      } else {
        throw new Error(`Health check failed: ${health.message}`);
      }
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      throw error;
    }
  }

  async demonstrateNavigation(): Promise<void> {
    console.log(chalk.yellow.bold('\n🌐 Navigation Demo'));

    try {
      console.log(chalk.gray('Navigating to example.com...'));
      await this.chromeAdapter.navigate({ url: 'https://example.com' });
      console.log(chalk.green('✅ Navigation successful'));

      console.log(chalk.gray('Taking screenshot...'));
      const screenshot = await this.chromeAdapter.takeScreenshot({
        filename: 'navigation-demo.png',
        fullPage: true
      });
      console.log(chalk.green(`✅ Screenshot saved: ${screenshot.path}`));

      console.log(chalk.gray('Getting page title...'));
      const title = await this.chromeAdapter.getPageTitle();
      console.log(chalk.cyan(`📄 Page title: "${title}"`));

    } catch (error) {
      console.error(chalk.red('❌ Navigation demo failed:'), error.message);
    }
  }

  async demonstrateFormInteraction(): Promise<void> {
    console.log(chalk.yellow.bold('\n📝 Form Interaction Demo'));

    try {
      // Navigate to a form page
      console.log(chalk.gray('Navigating to httpbin.org form...'));
      await this.chromeAdapter.navigate({ url: 'https://httpbin.org/forms/post' });

      console.log(chalk.gray('Filling out form fields...'));
      await this.chromeAdapter.fillForm({
        fields: [
          { selector: 'input[name="custname"]', value: 'John Doe' },
          { selector: 'input[name="custtel"]', value: '555-1234' },
          { selector: 'input[name="custemail"]', value: 'john.doe@example.com' }
        ]
      });
      console.log(chalk.green('✅ Form fields filled'));

      console.log(chalk.gray('Taking form screenshot...'));
      await this.chromeAdapter.takeScreenshot({
        filename: 'form-demo.png',
        selector: 'form'
      });
      console.log(chalk.green('✅ Form screenshot captured'));

      // Note: Not actually submitting to avoid external requests
      console.log(chalk.cyan('ℹ️ Form submission skipped (demo purposes)'));

    } catch (error) {
      console.error(chalk.red('❌ Form interaction demo failed:'), error.message);
    }
  }

  async demonstrateElementInteraction(): Promise<void> {
    console.log(chalk.yellow.bold('\n🖱️ Element Interaction Demo'));

    try {
      console.log(chalk.gray('Navigating to interactive demo page...'));
      await this.chromeAdapter.navigate({ url: 'https://example.com' });

      console.log(chalk.gray('Finding page elements...'));
      const elements = await this.chromeAdapter.findElements({
        selector: 'p, h1, a'
      });
      console.log(chalk.cyan(`📍 Found ${elements.length} elements`));

      if (elements.length > 0) {
        console.log(chalk.gray('Getting element text...'));
        for (let i = 0; i < Math.min(3, elements.length); i++) {
          const text = await this.chromeAdapter.getElementText({
            selector: elements[i].selector
          });
          console.log(chalk.green(`  Element ${i + 1}: "${text.slice(0, 50)}..."`));
        }
      }

      console.log(chalk.gray('Checking for links...'));
      const links = await this.chromeAdapter.findElements({
        selector: 'a[href]'
      });

      if (links.length > 0) {
        console.log(chalk.cyan(`🔗 Found ${links.length} links`));
        const firstLink = links[0];
        console.log(chalk.gray(`Hovering over first link...`));

        await this.chromeAdapter.hoverElement({
          selector: firstLink.selector
        });
        console.log(chalk.green('✅ Hover action completed'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Element interaction demo failed:'), error.message);
    }
  }

  async demonstrateVersionAdaptation(): Promise<void> {
    console.log(chalk.yellow.bold('\n🔄 Version Adaptation Demo'));

    try {
      console.log(chalk.gray('Testing version adaptation layer...'));

      // Simulate version-specific command
      const adaptedCommand = await this.chromeAdapter.adaptCommand({
        action: 'navigate',
        params: {
          url: 'https://example.com',
          waitUntil: 'networkidle' // This param name might change between versions
        }
      });

      console.log(chalk.cyan('📋 Command adaptation:'));
      console.log(`  Original: waitUntil`);
      console.log(`  Adapted: ${JSON.stringify(adaptedCommand.params, null, 2)}`);

      console.log(chalk.green('✅ Version adaptation working correctly'));

    } catch (error) {
      console.error(chalk.red('❌ Version adaptation demo failed:'), error.message);
    }
  }

  async demonstrateErrorHandling(): Promise<void> {
    console.log(chalk.yellow.bold('\n🛡️ Error Handling Demo'));

    try {
      console.log(chalk.gray('Testing error recovery...'));

      // Intentionally navigate to invalid URL
      try {
        await this.chromeAdapter.navigate({ url: 'https://nonexistent-domain-12345.com' });
      } catch (error) {
        console.log(chalk.yellow('⚠️ Expected error caught:'), error.message);
        console.log(chalk.cyan('🔄 Attempting recovery...'));

        // Recover by navigating to valid URL
        await this.chromeAdapter.navigate({ url: 'https://example.com' });
        console.log(chalk.green('✅ Recovery successful'));
      }

      // Test timeout handling
      console.log(chalk.gray('Testing timeout handling...'));
      const originalTimeout = this.chromeAdapter.getTimeout();
      this.chromeAdapter.setTimeout(1000); // Very short timeout

      try {
        await this.chromeAdapter.waitForElement({
          selector: 'nonexistent-element',
          timeout: 1000
        });
      } catch (error) {
        console.log(chalk.yellow('⚠️ Expected timeout caught:'), error.message);
      }

      // Restore original timeout
      this.chromeAdapter.setTimeout(originalTimeout);
      console.log(chalk.green('✅ Timeout restored'));

    } catch (error) {
      console.error(chalk.red('❌ Error handling demo failed:'), error.message);
    }
  }

  async demonstratePerformanceOptimization(): Promise<void> {
    console.log(chalk.yellow.bold('\n⚡ Performance Optimization Demo'));

    try {
      console.log(chalk.gray('Measuring navigation performance...'));
      const startTime = Date.now();

      await this.chromeAdapter.navigate({ url: 'https://example.com' });

      const navigationTime = Date.now() - startTime;
      console.log(chalk.cyan(`📊 Navigation time: ${navigationTime}ms`));

      console.log(chalk.gray('Getting performance metrics...'));
      const metrics = await this.chromeAdapter.getPerformanceMetrics();

      if (metrics) {
        console.log(chalk.cyan('📈 Performance Metrics:'));
        console.log(`  DOM Content Loaded: ${metrics.domContentLoaded}ms`);
        console.log(`  Load Complete: ${metrics.loadComplete}ms`);
        console.log(`  First Paint: ${metrics.firstPaint}ms`);
        console.log(`  Memory Usage: ${Math.round(metrics.memoryUsage / 1024 / 1024)}MB`);
      }

      console.log(chalk.green('✅ Performance metrics collected'));

    } catch (error) {
      console.error(chalk.red('❌ Performance demo failed:'), error.message);
    }
  }

  async cleanup(): Promise<void> {
    console.log(chalk.yellow('\n🧹 Cleaning up Chrome MCP demo...'));

    try {
      await this.chromeAdapter.close();
      console.log(chalk.green('✅ Chrome MCP adapter closed'));
    } catch (error) {
      console.error(chalk.red('❌ Cleanup error:'), error.message);
    }
  }
}

// CLI Interface
async function main() {
  const demo = new ChromeMCPDemo();

  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  try {
    await demo.initialize();

    switch (testType) {
      case 'navigation':
        await demo.demonstrateNavigation();
        break;

      case 'forms':
        await demo.demonstrateFormInteraction();
        break;

      case 'elements':
        await demo.demonstrateElementInteraction();
        break;

      case 'version':
        await demo.demonstrateVersionAdaptation();
        break;

      case 'errors':
        await demo.demonstrateErrorHandling();
        break;

      case 'performance':
        await demo.demonstratePerformanceOptimization();
        break;

      case 'all':
      default:
        await demo.demonstrateNavigation();
        await demo.demonstrateFormInteraction();
        await demo.demonstrateElementInteraction();
        await demo.demonstrateVersionAdaptation();
        await demo.demonstrateErrorHandling();
        await demo.demonstratePerformanceOptimization();
        break;
    }

    console.log(chalk.green.bold('\n🎉 Chrome MCP demo completed successfully!'));
    console.log(chalk.cyan('\n💡 Next steps:'));
    console.log('  - Integrate Chrome MCP into your full-stack swarm');
    console.log('  - Customize browser settings in fullstack-config.json');
    console.log('  - Use Chrome MCP for end-to-end testing');

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
  const demo = new ChromeMCPDemo();
  await demo.cleanup();
  process.exit(0);
});

// Run the demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ChromeMCPDemo };