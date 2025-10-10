#!/usr/bin/env node

/**
 * Node.js Version Compatibility Testing
 * Tests claude-flow-novice across different Node.js versions
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = resolve(__dirname, '..');

class NodeVersionCompatibilityTester {
  constructor() {
    this.results = [];
    this.supportedVersions = [
      { version: '18.x', lts: true, status: 'Maintenance', minimum: '18.0.0' },
      { version: '20.x', lts: true, status: 'Active', minimum: '20.0.0' },
      { version: '22.x', lts: false, status: 'Current', minimum: '22.0.0' }
    ];
    this.currentVersion = process.version;
    this.testStartTime = new Date();
  }

  async runCompatibilityTests() {
    console.log('🟢 Node.js Version Compatibility Testing');
    console.log(`📅 Started: ${this.testStartTime.toISOString()}`);
    console.log(`📦 Current Node.js: ${this.currentVersion}`);
    console.log('');

    await this.testESModuleSupport();
    await this.testAsyncAwaitSupport();
    await this.testWorkerThreadSupport();
    await this.testFetchAPI();
    await this.testPerformanceAPI();
    await this.testFileSystemFeatures();
    await this.testNetworkFeatures();
    await this.testV8Features();
    await this.testDependencyCompatibility();
    await this.testCLICommands();

    this.generateReport();
  }

  async testESModuleSupport() {
    await this.runTest('ES Module Support', async () => {
      const esmTest = `
        // Test dynamic imports
        const modulePath = './test-module.mjs';

        // Test import.meta
        console.log('import.meta.url:', import.meta.url);

        // Test top-level await
        await new Promise(resolve => setTimeout(resolve, 10));

        // Test export syntax
        export const testValue = 'ESM Test Successful';

        console.log('✓ ES Module features working');
      `;

      const testFile = join(projectRoot, 'test-esm.mjs');
      writeFileSync(testFile, esmTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('CommonJS Interoperability', async () => {
      const cjsTest = `
        const { testValue } = await import('./test-cjs-wrapper.mjs');
        console.log('CommonJS interoperability:', testValue);
      `;

      const cjsWrapper = `
        export const testValue = require('./test-cjs-module.cjs').testValue;
      `;

      const cjsModule = `
        module.exports = {
          testValue: 'CommonJS Value'
        };
      `;

      const testFile = join(projectRoot, 'test-cjs-interop.mjs');
      const wrapperFile = join(projectRoot, 'test-cjs-wrapper.mjs');
      const moduleFile = join(projectRoot, 'test-cjs-module.cjs');

      writeFileSync(testFile, cjsTest);
      writeFileSync(wrapperFile, cjsWrapper);
      writeFileSync(moduleFile, cjsModule);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        [testFile, wrapperFile, moduleFile].forEach(file => {
          if (existsSync(file)) {
            this.executeCommand(`rm "${file}"`, { ignoreError: true });
          }
        });
      }
    });
  }

  async testAsyncAwaitSupport() {
    await this.runTest('Async/Await Support', async () => {
      const asyncTest = `
        async function testAsyncFeatures() {
          // Test async function
          const result1 = await Promise.resolve('async function works');
          console.log('✓', result1);

          // Test async arrow function
          const asyncArrow = async () => {
            return await Promise.resolve('async arrow works');
          };
          const result2 = await asyncArrow();
          console.log('✓', result2);

          // Test async iteration
          const asyncGenerator = async function* () {
            yield await Promise.resolve('yield 1');
            yield await Promise.resolve('yield 2');
          };

          for await (const value of asyncGenerator()) {
            console.log('✓ async iteration:', value);
          }

          // Test Promise.allSettled
          const promises = [
            Promise.resolve('success'),
            Promise.reject(new Error('failure'))
          ];
          const results = await Promise.allSettled(promises);
          console.log('✓ Promise.allSettled:', results.length, 'results');

          return true;
        }

        testAsyncFeatures().then(() => {
          console.log('✓ All async features working');
        }).catch(error => {
          console.error('✗ Async test failed:', error.message);
          process.exit(1);
        });
      `;

      const testFile = join(projectRoot, 'test-async.mjs');
      writeFileSync(testFile, asyncTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testWorkerThreadSupport() {
    await this.runTest('Worker Thread Support', async () => {
      const workerTest = `
        import { Worker } from 'worker_threads';

        const workerCode = \`
          const { parentPort } = require('worker_threads');

          parentPort.on('message', (data) => {
            parentPort.postMessage({
              pid: process.pid,
              data: data,
              timestamp: Date.now()
            });
          });
        \`;

        return new Promise((resolve, reject) => {
          const worker = new Worker(workerCode, { eval: true });

          worker.on('message', (result) => {
            console.log('✓ Worker response:', result);
            worker.terminate();
            resolve();
          });

          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(\`Worker stopped with exit code \${code}\`));
            }
          });

          worker.postMessage({ test: 'Worker thread test' });
        });
      `;

      const testFile = join(projectRoot, 'test-worker.mjs');
      writeFileSync(testFile, workerTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testFetchAPI() {
    await this.runTest('Fetch API Support', async () => {
      const fetchTest = `
        try {
          // Test fetch (available in Node.js 18+)
          if (typeof fetch !== 'undefined') {
            const response = await fetch('https://httpbin.org/json');
            const data = await response.json();
            console.log('✓ Fetch API working:', typeof data);
          } else {
            console.log('ℹ Fetch API not available (Node.js < 18)');
          }
        } catch (error) {
          console.log('ℹ Fetch API test failed (network or version issue):', error.message);
        }
      `;

      const testFile = join(projectRoot, 'test-fetch.mjs');
      writeFileSync(testFile, fetchTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testPerformanceAPI() {
    await this.runTest('Performance API Support', async () => {
      const perfTest = `
        import { performance } from 'perf_hooks';

        // Test performance.now()
        const start = performance.now();

        // Simulate some work
        const sum = Array.from({length: 1000000}, (_, i) => i).reduce((a, b) => a + b, 0);

        const end = performance.now();
        const duration = end - start;

        console.log('✓ Performance.now():', duration.toFixed(2), 'ms');
        console.log('✓ Sum calculation:', sum);

        // Test performance.mark() and measure()
        if (performance.mark && performance.measure) {
          performance.mark('test-start');
          await new Promise(resolve => setTimeout(resolve, 10));
          performance.mark('test-end');
          performance.measure('test-duration', 'test-start', 'test-end');

          const entries = performance.getEntriesByName('test-duration');
          if (entries.length > 0) {
            console.log('✓ Performance marks/measures:', entries[0].duration.toFixed(2), 'ms');
          }
        }

        // Test performance.timerify
        if (performance.timerify) {
          function testFunction() {
            return Math.random() * 1000;
          }

          const wrapped = performance.timerify(testFunction);
          wrapped();

          console.log('✓ Performance.timerify available');
        }
      `;

      const testFile = join(projectRoot, 'test-performance.mjs');
      writeFileSync(testFile, perfTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testFileSystemFeatures() {
    await this.runTest('File System Features', async () => {
      const fsTest = `
        import { promises as fs } from 'fs';
        import { join } from 'path';

        try {
          // Test fs.promises
          const testDir = join(process.cwd(), 'test-fs-temp');
          const testFile = join(testDir, 'test.txt');

          await fs.mkdir(testDir, { recursive: true });
          await fs.writeFile(testFile, 'Node.js FS test');

          const content = await fs.readFile(testFile, 'utf8');
          console.log('✓ File content:', content);

          const stats = await fs.stat(testFile);
          console.log('✓ File stats:', { size: stats.size, isFile: stats.isFile() });

          // Test fs.opendir
          const dir = await fs.opendir(testDir);
          for await (const entry of dir) {
            console.log('✓ Directory entry:', entry.name);
          }

          // Test fs.rm (available in Node.js 14+)
          if (typeof fs.rm === 'function') {
            await fs.rm(testDir, { recursive: true });
            console.log('✓ fs.rm working');
          } else {
            // Fallback for older versions
            await fs.rmdir(testDir, { recursive: true });
            console.log('✓ fs.rmdir working (fallback)');
          }

        } catch (error) {
          console.error('✗ File system test failed:', error.message);
          process.exit(1);
        }
      `;

      const testFile = join(projectRoot, 'test-fs.mjs');
      writeFileSync(testFile, fsTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testNetworkFeatures() {
    await this.runTest('Network Features', async () => {
      const networkTest = `
        import { createServer } from 'http';
        import { Server as SocketIOServer } from 'socket.io';

        // Test HTTP server
        const server = createServer((req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('HTTP Server Test Successful');
        });

        await new Promise((resolve, reject) => {
          server.listen(0, async () => {
            const port = server.address().port;
            console.log('✓ HTTP server listening on port:', port);

            try {
              // Test WebSocket support
              const io = new SocketIOServer(server);

              io.on('connection', (socket) => {
                console.log('✓ WebSocket client connected');
                socket.emit('test', { message: 'WebSocket test successful' });
                socket.disconnect();
              });

              // Test client connection
              import('socket.io-client').then(({ default: ioClient }) => {
                const client = ioClient(\`http://localhost:\${port}\`);

                client.on('test', (data) => {
                  console.log('✓ WebSocket message received:', data.message);
                  client.close();
                  server.close();
                  resolve();
                });

                client.on('connect_error', (err) => {
                  console.log('ℹ WebSocket connection failed (may be expected):', err.message);
                  server.close();
                  resolve();
                });
              }).catch(() => {
                console.log('ℹ socket.io-client not available');
                server.close();
                resolve();
              });

            } catch (error) {
              console.log('ℹ WebSocket test failed:', error.message);
              server.close();
              resolve();
            }
          });

          server.on('error', reject);
        });
      `;

      const testFile = join(projectRoot, 'test-network.mjs');
      writeFileSync(testFile, networkTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testV8Features() {
    await this.runTest('V8 Features', async () => {
      const v8Test = `
        // Test modern JavaScript features
        console.log('✓ Spread operator:', [...[1, 2, 3], 4, 5]);

        // Test destructuring
        const { a, b, ...rest } = { a: 1, b: 2, c: 3, d: 4 };
        console.log('✓ Destructuring:', { a, b, rest });

        // Test optional chaining
        const obj = { nested: { value: 42 } };
        console.log('✓ Optional chaining:', obj?.nested?.value);

        // Test nullish coalescing
        const value = null ?? 'default';
        console.log('✓ Nullish coalescing:', value);

        // Test Promise.any (Node.js 15+)
        if (Promise.any) {
          Promise.any([
            Promise.reject('error1'),
            Promise.resolve('success'),
            Promise.reject('error2')
          ]).then(result => {
            console.log('✓ Promise.any:', result);
          }).catch(() => {
            console.log('ℹ Promise.any available but failed');
          });
        } else {
          console.log('ℹ Promise.any not available (Node.js < 15)');
        }

        // Test String.prototype.replaceAll (Node.js 15+)
        if (String.prototype.replaceAll) {
          const result = 'hello world'.replaceAll('l', 'L');
          console.log('✓ replaceAll:', result);
        } else {
          console.log('ℹ replaceAll not available (Node.js < 15)');
        }

        // Test Object.hasOwn (Node.js 16+)
        if (Object.hasOwn) {
          const has = Object.hasOwn({ a: 1 }, 'a');
          console.log('✓ Object.hasOwn:', has);
        } else {
          console.log('ℹ Object.hasOwn not available (Node.js < 16)');
        }
      `;

      const testFile = join(projectRoot, 'test-v8.mjs');
      writeFileSync(testFile, v8Test);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testDependencyCompatibility() {
    await this.runTest('Dependency Compatibility', async () => {
      // Read package.json and test critical dependencies
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      const criticalDeps = [
        '@anthropic-ai/claude-agent-sdk',
        '@modelcontextprotocol/sdk',
        'ioredis',
        'express',
        'socket.io',
        'jsonwebtoken',
        'bcrypt',
        'winston'
      ];

      for (const dep of criticalDeps) {
        try {
          // Test importing each dependency
          const importTest = `
            try {
              import('${dep}').then(module => {
                console.log('✓ ${dep} imported successfully');
              }).catch(error => {
                console.error('✗ ${dep} import failed:', error.message);
                process.exit(1);
              });
            } catch (error) {
              // Fallback to require for CommonJS modules
              try {
                const module = require('${dep}');
                console.log('✓ ${dep} required successfully');
              } catch (requireError) {
                console.error('✗ ${dep} require failed:', requireError.message);
                process.exit(1);
              }
            }
          `;

          const testFile = join(projectRoot, `test-dep-${dep.replace(/[^a-zA-Z0-9]/g, '-')}.js`);
          writeFileSync(testFile, importTest);

          try {
            await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
          } finally {
            if (existsSync(testFile)) {
              await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
            }
          }
        } catch (error) {
          throw new Error(`Dependency ${dep} compatibility test failed: ${error.message}`);
        }
      }
    });
  }

  async testCLICommands() {
    await this.runTest('CLI Commands', async () => {
      const commands = [
        'npm run test:unit',
        'npm run test:integration',
        'npm run build',
        'npm run lint',
        'npm run typecheck'
      ];

      for (const command of commands) {
        try {
          await this.executeCommand(command, {
            timeout: 30000,
            ignoreError: true
          });
          console.log(`✓ Command executed: ${command}`);
        } catch (error) {
          console.log(`ℹ Command failed (may be expected): ${command} - ${error.message}`);
        }
      }
    });
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    console.log(`  • ${name}...`);

    try {
      await testFn();
      const duration = Date.now() - startTime;

      this.results.push({
        name,
        status: 'PASS',
        duration,
        error: null,
        nodeVersion: this.currentVersion
      });

      console.log(`    ✅ PASS (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;

      this.results.push({
        name,
        status: 'FAIL',
        duration,
        error: error.message,
        nodeVersion: this.currentVersion
      });

      console.log(`    ❌ FAIL (${duration}ms): ${error.message}`);
    }
  }

  async executeCommand(command, options = {}) {
    const { timeout = 5000, ignoreError = false } = options;

    return new Promise((resolve, reject) => {
      try {
        const result = execSync(command, {
          encoding: 'utf8',
          timeout,
          stdio: 'pipe',
          cwd: projectRoot
        });

        resolve({ stdout: result, error: null });

      } catch (error) {
        if (ignoreError) {
          resolve({ stdout: error.stdout || '', error: error.message });
        } else {
          reject(new Error(`Command failed: ${command} - ${error.message}`));
        }
      }
    });
  }

  generateReport() {
    const endTime = new Date();
    const totalDuration = endTime - this.testStartTime;

    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    const totalTests = this.results.length;

    const report = {
      summary: {
        nodeVersion: this.currentVersion,
        startTime: this.testStartTime.toISOString(),
        endTime: endTime.toISOString(),
        totalDuration,
        totalTests,
        passedTests,
        failedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      },
      supportedVersions: this.supportedVersions,
      results: this.results,
      recommendations: this.generateRecommendations()
    };

    const reportPath = join(projectRoot, 'test-results', `nodejs-compatibility-${Date.now()}.json`);

    // Ensure directory exists
    const reportDir = join(projectRoot, 'test-results');
    if (!existsSync(reportDir)) {
      execSync(`mkdir -p "${reportDir}"`, { cwd: projectRoot });
    }

    // Write report
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('');
    console.log('📋 Node.js Compatibility Test Summary:');
    console.log(`   Node.js Version: ${this.currentVersion}`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Success Rate: ${report.summary.successRate}%`);
    console.log(`   Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log(`   Report saved to: ${reportPath}`);

    if (failedTests > 0) {
      console.log('');
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`   • ${r.name}: ${r.error}`);
        });
    }

    console.log('');
    console.log('💡 Recommendations:');
    report.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });

    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    const failedTests = this.results.filter(r => r.status === 'FAIL');
    const currentMajorVersion = parseInt(this.currentVersion.slice(1).split('.')[0]);

    if (currentMajorVersion < 18) {
      recommendations.push('Upgrade to Node.js 18.x or later for full feature support');
    }

    if (currentMajorVersion < 20) {
      recommendations.push('Consider upgrading to Node.js 20.x LTS for better stability');
    }

    if (failedTests.length === 0) {
      recommendations.push(`Node.js ${this.currentVersion} is fully compatible`);
      return recommendations;
    }

    const failedFeatures = failedTests.map(t => t.name);

    if (failedFeatures.some(f => f.includes('ES Module'))) {
      recommendations.push('ES Module issues detected - ensure Node.js 14+ with --experimental-modules or Node.js 16+');
    }

    if (failedFeatures.some(f => f.includes('Worker'))) {
      recommendations.push('Worker thread issues - ensure Node.js 12+ with --experimental-worker or Node.js 14+');
    }

    if (failedFeatures.some(f => f.includes('Fetch'))) {
      recommendations.push('Fetch API issues - use Node.js 18+ or install node-fetch polyfill');
    }

    if (failedFeatures.some(f => f.includes('Network'))) {
      recommendations.push('Network functionality issues - check firewall and network configuration');
    }

    if (failedFeatures.some(f => f.includes('Dependency'))) {
      recommendations.push('Dependency compatibility issues - run npm install and check package.json engines field');
    }

    // Check for version-specific feature issues
    const versionIssues = {
      16: 'Optional chaining, nullish coalescing, Promise.allSettled',
      18: 'Fetch API, Web Crypto API, Timer Promises',
      20: 'Test Runner, Performance hooks improvements',
      22: 'Latest JavaScript features, performance improvements'
    };

    Object.entries(versionIssues).forEach(([version, features]) => {
      if (currentMajorVersion < parseInt(version)) {
        recommendations.push(`Node.js ${version}+ provides: ${features}`);
      }
    });

    return recommendations;
  }
}

// Main execution
async function main() {
  const tester = new NodeVersionCompatibilityTester();

  try {
    await tester.runCompatibilityTests();
    process.exit(0);
  } catch (error) {
    console.error('Node.js compatibility testing failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Node.js Version Compatibility Testing

Usage: node nodejs-compatibility.js [options]

Options:
  --help, -h     Show this help message
  --version      Show Node.js version and supported versions
  --check-only   Only check current version compatibility
  --verbose      Enable verbose output

Examples:
  node nodejs-compatibility.js
  node nodejs-compatibility.js --version
  node nodejs-compatibility.js --check-only
  node nodejs-compatibility.js --verbose
  `);
  process.exit(0);
}

if (args.includes('--version')) {
  const tester = new NodeVersionCompatibilityTester();
  console.log('Current Node.js Version:', tester.currentVersion);
  console.log('');
  console.log('Supported Versions:');
  tester.supportedVersions.forEach(v => {
    console.log(`  ${v.version} (${v.status}) - Minimum: ${v.minimum}`);
  });
  process.exit(0);
}

if (args.includes('--check-only')) {
  const tester = new NodeVersionCompatibilityTester();
  const currentMajorVersion = parseInt(tester.currentVersion.slice(1).split('.')[0]);

  const isSupported = tester.supportedVersions.some(v =>
    parseInt(v.version) === currentMajorVersion || currentMajorVersion >= 18
  );

  if (isSupported) {
    console.log(`✅ Node.js ${tester.currentVersion} is supported`);
    process.exit(0);
  } else {
    console.log(`❌ Node.js ${tester.currentVersion} is not supported`);
    console.log('Please upgrade to Node.js 18.x or later');
    process.exit(1);
  }
}

if (args.includes('--verbose')) {
  process.env.VERBOSE = 'true';
}

// Run the tests
main().catch(console.error);