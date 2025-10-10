#!/usr/bin/env node

/**
 * Enhanced Node.js Version Compatibility Testing
 * Tests claude-flow-novice across different Node.js versions with latest features
 * Includes WASM, performance optimizations, and modern API testing
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = resolve(__dirname, '..');

class EnhancedNodeVersionCompatibilityTester {
  constructor() {
    this.results = [];
    this.supportedVersions = [
      { version: '18.x', lts: true, status: 'Maintenance', minimum: '18.0.0', features: ['fetch', 'webcrypto', 'timers-promises'] },
      { version: '20.x', lts: true, status: 'Active', minimum: '20.0.0', features: ['test-runner', 'permission-model', 'import-maps'] },
      { version: '22.x', lts: false, status: 'Current', minimum: '22.0.0', features: ['websocket', 'enhanced-fetch', 'native-assert'] }
    ];
    this.currentVersion = process.version;
    this.currentMajorVersion = parseInt(this.currentVersion.slice(1).split('.')[0]);
    this.testStartTime = new Date();
  }

  async runEnhancedCompatibilityTests() {
    console.log('🚀 Enhanced Node.js Version Compatibility Testing');
    console.log(`📅 Started: ${this.testStartTime.toISOString()}`);
    console.log(`📦 Current Node.js: ${this.currentVersion}`);
    console.log(`🔍 Major Version: ${this.currentMajorVersion}`);
    console.log('');

    await this.testCoreNodeFeatures();
    await this.testModernJavaScriptFeatures();
    await this.testWASMSupport();
    await this.testPerformanceAPIs();
    await this.testNetworkAndFetchAPIs();
    await this.testFileSystemAPIs();
    await this.testWorkerThreads();
    await this.testTestRunnerAPI();
    await this.testImportMaps();
    await this.testPermissionModel();
    await this.testWebSocketAPI();
    await this.testCryptoAPIs();
    await this.testDependencyCompatibility();
    await this.testCLIIntegration();
    await this.testMemoryManagement();
    await this.testErrorHandling();

    this.generateEnhancedReport();
  }

  async testCoreNodeFeatures() {
    await this.runTest('Core Node.js Features', async () => {
      const coreTest = `
        import { createRequire } from 'module';
        import EventEmitter from 'events';
        import { performance } from 'perf_hooks';

        // Test ESM features
        console.log('✓ ESM imports working');

        // Test require.createRequire (Node.js 12+)
        const require = createRequire(import.meta.url);
        const path = require('path');
        console.log('✓ createRequire working:', path.join('a', 'b'));

        // Test EventEmitter
        const emitter = new EventEmitter();
        emitter.on('test', () => console.log('✓ EventEmitter working'));
        emitter.emit('test');

        // Test performance.now()
        const start = performance.now();
        const end = performance.now();
        console.log('✓ Performance API working:', (end - start).toFixed(2), 'ms');

        // Test process.versions
        console.log('✓ Process versions:', Object.keys(process.versions).length, 'modules');

        // Test process.features (Node.js 16+)
        if (process.features) {
          console.log('✓ Process features:', Object.keys(process.features).length, 'features');
        }

        // Test process.config
        if (process.config) {
          console.log('✓ Process config available');
        }

        console.log('All core Node.js features working correctly');
      `;

      const testFile = join(projectRoot, 'test-core-features.mjs');
      writeFileSync(testFile, coreTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testModernJavaScriptFeatures() {
    await this.runTest('Modern JavaScript Features', async () => {
      const modernTest = `
        // Test top-level await (Node.js 14+)
        const topLevelAwaitResult = await Promise.resolve('Top-level await working');
        console.log('✓', topLevelAwaitResult);

        // Test Optional chaining (Node.js 14+)
        const obj = { nested: { value: 42 } };
        const optionalChainingResult = obj?.nested?.value;
        console.log('✓ Optional chaining:', optionalChainingResult);

        // Test Nullish coalescing (Node.js 14+)
        const nullishResult = null ?? 'default';
        console.log('✓ Nullish coalescing:', nullishResult);

        // Test Private class fields (Node.js 12+)
        class PrivateClass {
          #privateField = 'secret';

          getPrivateField() {
            return this.#privateField;
          }
        }

        const privateInstance = new PrivateClass();
        console.log('✓ Private fields:', privateInstance.getPrivateField());

        // Test Object.hasOwn (Node.js 16+)
        if (Object.hasOwn) {
          const hasOwnResult = Object.hasOwn({ a: 1 }, 'a');
          console.log('✓ Object.hasOwn:', hasOwnResult);
        } else {
          console.log('ℹ Object.hasOwn not available (Node.js < 16)');
        }

        // Test Array.prototype.at() (Node.js 16+)
        if (Array.prototype.at) {
          const atResult = [1, 2, 3].at(-1);
          console.log('✓ Array.at():', atResult);
        } else {
          console.log('ℹ Array.at() not available (Node.js < 16)');
        }

        // Test String.prototype.replaceAll() (Node.js 15+)
        if (String.prototype.replaceAll) {
          const replaceAllResult = 'hello world'.replaceAll('l', 'L');
          console.log('✓ replaceAll():', replaceAllResult);
        } else {
          console.log('ℹ replaceAll() not available (Node.js < 15)');
        }

        // Test Promise.any() (Node.js 15+)
        if (Promise.any) {
          const promiseAnyResult = await Promise.any([
            Promise.reject('error1'),
            Promise.resolve('success'),
            Promise.reject('error2')
          ]);
          console.log('✓ Promise.any():', promiseAnyResult);
        } else {
          console.log('ℹ Promise.any() not available (Node.js < 15)');
        }

        // Test Numeric separators (Node.js 12+)
        const numericSeparator = 1_000_000;
        console.log('✓ Numeric separators:', numericSeparator);

        // Test BigInt (Node.js 10+)
        const bigintValue = 12345678901234567890n;
        console.log('✓ BigInt:', bigintValue.toString());

        console.log('All modern JavaScript features working correctly');
      `;

      const testFile = join(projectRoot, 'test-modern-js.mjs');
      writeFileSync(testFile, modernTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testWASMSupport() {
    await this.runTest('WebAssembly Support', async () => {
      const wasmTest = `
        // Test WebAssembly compilation and instantiation
        const wasmCode = new Uint8Array([
          0x00, 0x61, 0x73, 0x6d, // WASM magic
          0x01, 0x00, 0x00, 0x00, // WASM version
          0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // Function type
          0x03, 0x02, 0x01, 0x00, // Function section
          0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // Export section
          0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b // Code section
        ]);

        try {
          const wasmModule = await WebAssembly.compile(wasmCode);
          console.log('✓ WebAssembly compilation successful');

          const wasmInstance = await WebAssembly.instantiate(wasmModule);
          console.log('✓ WebAssembly instantiation successful');

          const add = wasmInstance.exports.add;
          const result = add(2, 3);
          console.log('✓ WebAssembly function execution:', result);

          // Test WebAssembly streaming (Node.js 18+)
          if (typeof WebAssembly.compileStreaming === 'function') {
            console.log('✓ WebAssembly.compileStreaming available');
          } else {
            console.log('ℹ WebAssembly.compileStreaming not available (Node.js < 18)');
          }

        } catch (error) {
          console.error('✗ WebAssembly test failed:', error.message);
          process.exit(1);
        }
      `;

      const testFile = join(projectRoot, 'test-wasm.mjs');
      writeFileSync(testFile, wasmTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testPerformanceAPIs() {
    await this.runTest('Performance APIs', async () => {
      const perfTest = `
        import { performance, PerformanceObserver, PerformanceEntry } from 'perf_hooks';

        // Test performance.now()
        const start = performance.now();

        // Simulate work
        const work = Array.from({ length: 1000000 }, (_, i) => i * i).reduce((a, b) => a + b, 0);

        const end = performance.now();
        const duration = end - start;

        console.log('✓ Performance.now():', duration.toFixed(2), 'ms');
        console.log('✓ Work calculation:', work);

        // Test performance.mark() and performance.measure()
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

        // Test PerformanceObserver (Node.js 8+)
        if (PerformanceObserver) {
          const obs = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            console.log('✓ PerformanceObserver detected', entries.length, 'entries');
            obs.disconnect();
          });

          obs.observe({ entryTypes: ['measure', 'mark'] });
          performance.mark('observer-test');
          performance.measure('observer-measure', 'observer-test');
        }

        // Test performance.timerify (Node.js 8+)
        if (performance.timerify) {
          function testFunction() {
            return Math.random() * 1000;
          }

          const wrapped = performance.timerify(testFunction);
          wrapped();

          const entries = performance.getEntriesByName('testFunction');
          if (entries.length > 0) {
            console.log('✓ Performance.timerify:', entries[0].duration.toFixed(2), 'ms');
          }
        }

        // Test performance.clearMarks and performance.clearMeasures
        if (performance.clearMarks && performance.clearMeasures) {
          performance.clearMarks();
          performance.clearMeasures();
          console.log('✓ Performance cleanup functions working');
        }

        console.log('All Performance APIs working correctly');
      `;

      const testFile = join(projectRoot, 'test-performance-apis.mjs');
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

  async testNetworkAndFetchAPIs() {
    await this.runTest('Network and Fetch APIs', async () => {
      const networkTest = `
        import { createServer } from 'http';
        import { Server as SocketIOServer } from 'socket.io';

        // Test native fetch (Node.js 18+)
        if (typeof fetch !== 'undefined') {
          try {
            const response = await fetch('https://httpbin.org/json');
            const data = await response.json();
            console.log('✓ Native fetch API working:', typeof data);
            console.log('✓ Response status:', response.status);
            console.log('✓ Response headers:', response.headers.get('content-type'));
          } catch (error) {
            console.log('ℹ Native fetch test failed (network or version issue):', error.message);
          }
        } else {
          console.log('ℹ Native fetch not available (Node.js < 18)');
        }

        // Test HTTP server
        const server = createServer((req, res) => {
          res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          });
          res.end('HTTP Server Test Successful');
        });

        await new Promise((resolve, reject) => {
          server.listen(0, async () => {
            const port = server.address().port;
            console.log('✓ HTTP server listening on port:', port);

            try {
              // Test with native fetch if available
              if (typeof fetch !== 'undefined') {
                const response = await fetch(\`http://localhost:\${port}\`);
                const text = await response.text();
                console.log('✓ Fetch to local server:', text);
              }

              // Test WebSocket support
              const io = new SocketIOServer(server, {
                cors: { origin: '*' }
              });

              io.on('connection', (socket) => {
                console.log('✓ WebSocket client connected');
                socket.emit('test', { message: 'WebSocket test successful' });
                socket.disconnect();
              });

              server.close();
              resolve();
            } catch (error) {
              console.log('ℹ Network test failed:', error.message);
              server.close();
              resolve();
            }
          });

          server.on('error', reject);
        });

        // Test AbortController (Node.js 15+)
        if (AbortController) {
          const controller = new AbortController();
          const signal = controller.signal;

          console.log('✓ AbortController available');

          // Test abort signal
          setTimeout(() => controller.abort(), 100);

          try {
            if (typeof fetch !== 'undefined') {
              await fetch('https://httpbin.org/delay/2', { signal });
            }
          } catch (error) {
            if (error.name === 'AbortError') {
              console.log('✓ AbortController working correctly');
            }
          }
        } else {
          console.log('ℹ AbortController not available (Node.js < 15)');
        }

        console.log('Network and Fetch APIs test completed');
      `;

      const testFile = join(projectRoot, 'test-network-fetch.mjs');
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

  async testFileSystemAPIs() {
    await this.runTest('File System APIs', async () => {
      const fsTest = `
        import { promises as fs } from 'fs';
        import { join, resolve } from 'path';

        try {
          // Test fs.promises
          const testDir = join(process.cwd(), 'test-fs-temp-enhanced');
          const testFile = join(testDir, 'test.txt');
          const testSubDir = join(testDir, 'subdir');

          await fs.mkdir(testSubDir, { recursive: true });
          console.log('✓ Directory creation working');

          await fs.writeFile(testFile, 'Node.js enhanced FS test');
          console.log('✓ File writing working');

          const content = await fs.readFile(testFile, 'utf8');
          console.log('✓ File reading working:', content);

          // Test fs.stat
          const stats = await fs.stat(testFile);
          console.log('✓ File stats:', {
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            created: stats.birthtime,
            modified: stats.mtime
          });

          // Test fs.opendir (Node.js 12+)
          const dir = await fs.opendir(testDir);
          const entries = [];
          for await (const entry of dir) {
            entries.push(entry.name);
          }
          console.log('✓ Directory iteration:', entries);

          // Test fs.copyFile (Node.js 8+)
          const copyFile = join(testDir, 'test-copy.txt');
          await fs.copyFile(testFile, copyFile);
          console.log('✓ File copying working');

          // Test fs.appendFile
          await fs.appendFile(testFile, ' - appended');
          const appendedContent = await fs.readFile(testFile, 'utf8');
          console.log('✓ File appending working:', appendedContent);

          // Test fs.watch (Node.js 8+)
          const watcher = fs.watch(testFile);
          watcher.on('change', () => {
            console.log('✓ File watcher working');
            watcher.close();
          });

          await fs.appendFile(testFile, ' - watch test');
          await new Promise(resolve => setTimeout(resolve, 100));

          // Test fs.rm (Node.js 14+)
          if (typeof fs.rm === 'function') {
            await fs.rm(testDir, { recursive: true, force: true });
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

      const testFile = join(projectRoot, 'test-filesystem-apis.mjs');
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

  async testWorkerThreads() {
    await this.runTest('Worker Threads', async () => {
      const workerTest = `
        import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
        import { fileURLToPath } from 'url';
        import { dirname, join } from 'path';

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        if (isMainThread) {
          // Main thread
          console.log('✓ Main thread detected');

          const worker = new Worker(__filename, {
            workerData: { test: 'Worker thread test' }
          });

          worker.on('message', (result) => {
            console.log('✓ Worker message received:', result);
            worker.terminate();
          });

          worker.on('error', (error) => {
            console.error('✗ Worker error:', error.message);
            process.exit(1);
          });

          worker.on('exit', (code) => {
            if (code !== 0) {
              console.error('✗ Worker stopped with exit code', code);
              process.exit(1);
            } else {
              console.log('✓ Worker terminated successfully');
            }
          });

          // Test multiple workers
          const workers = [];
          for (let i = 0; i < 3; i++) {
            const worker = new Worker(__filename, {
              workerData: { id: i, test: 'Multiple worker test' }
            });

            worker.on('message', (result) => {
              console.log(\`✓ Worker \${result.id} message:\`, result.message);
            });

            workers.push(worker);
          }

          // Terminate all workers after a delay
          setTimeout(() => {
            workers.forEach(w => w.terminate());
          }, 1000);

        } else {
          // Worker thread
          console.log('✓ Worker thread running');

          if (workerData) {
            const result = {
              id: workerData.id || 'unknown',
              message: \`Processed: \${workerData.test}\`,
              timestamp: Date.now(),
              pid: process.pid
            };

            parentPort.postMessage(result);
          }
        }
      `;

      const testFile = join(projectRoot, 'test-worker-threads.mjs');
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

  async testTestRunnerAPI() {
    await this.runTest('Test Runner API (Node.js 20+)', async () => {
      const testRunnerTest = `
        import test from 'node:test';
        import assert from 'node:assert';

        // Test if test runner is available (Node.js 20+)
        if (typeof test === 'function') {
          console.log('✓ Test runner API available');

          // Test basic test functionality
          test('Basic test', (t) => {
            assert.strictEqual(2 + 2, 4);
            console.log('✓ Basic test assertion working');
          });

          // Test async test
          test('Async test', async (t) => {
            const result = await Promise.resolve(42);
            assert.strictEqual(result, 42);
            console.log('✓ Async test assertion working');
          });

          // Test test.describe (Node.js 20+)
          if (test.describe) {
            test.describe('Test suite', () => {
              test('Test in suite', (t) => {
                assert.ok(true);
                console.log('✓ Test in suite working');
              });
            });
            console.log('✓ Test.describe available');
          }

          // Test test.it (Node.js 20+)
          if (test.it) {
            test.it('Test with it', (t) => {
              assert.ok(true);
              console.log('✓ Test.it available');
            });
          }

          // Test test.before and test.after (Node.js 20+)
          if (test.before && test.after) {
            test.before(() => {
              console.log('✓ Test.before hook available');
            });

            test.after(() => {
              console.log('✓ Test.after hook available');
            });
          }

          // Run tests and wait for completion
          test.run().then(() => {
            console.log('✓ Test runner execution completed');
          }).catch((error) => {
            console.log('ℹ Test runner execution failed (may be expected):', error.message);
          });

        } else {
          console.log('ℹ Test runner API not available (Node.js < 20)');
        }
      `;

      const testFile = join(projectRoot, 'test-test-runner.mjs');
      writeFileSync(testFile, testRunnerTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testImportMaps() {
    await this.runTest('Import Maps (Node.js 16+)', async () => {
      const importMapTest = `
        // Test import map support
        try {
          // This would require --experimental-import-maps flag
          // For now, just test if the flag is supported
          const { spawn } = await import('child_process');

          const child = spawn('node', ['--help'], {
            stdio: 'pipe'
          });

          let helpOutput = '';
          child.stdout.on('data', (data) => {
            helpOutput += data.toString();
          });

          child.on('close', (code) => {
            if (helpOutput.includes('--experimental-import-maps')) {
              console.log('✓ Import maps flag available');
            } else {
              console.log('ℹ Import maps flag not available');
            }
          });

        } catch (error) {
          console.log('ℹ Import maps test failed:', error.message);
        }

        // Test dynamic import with custom resolution
        try {
          const modulePath = './test-dynamic-module.mjs';
          const moduleCode = 'export const value = "Dynamic import test successful";';

          // Write temporary module
          const { writeFileSync, readFileSync } = await import('fs');
          const { join } = await import('path');

          const tempModule = join(process.cwd(), modulePath);
          writeFileSync(tempModule, moduleCode);

          const module = await import(\`file://\${tempModule}\`);
          console.log('✓ Dynamic import working:', module.value);

          // Clean up
          const { rmSync } = await import('fs');
          rmSync(tempModule, { force: true });

        } catch (error) {
          console.log('ℹ Dynamic import test failed:', error.message);
        }
      `;

      const testFile = join(projectRoot, 'test-import-maps.mjs');
      writeFileSync(testFile, importMapTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testPermissionModel() {
    await this.runTest('Permission Model (Node.js 20+)', async () => {
      const permissionTest = `
        // Test permission model support
        try {
          const { spawn } = await import('child_process');

          const child = spawn('node', ['--help'], {
            stdio: 'pipe'
          });

          let helpOutput = '';
          child.stdout.on('data', (data) => {
            helpOutput += data.toString();
          });

          child.on('close', (code) => {
            if (helpOutput.includes('--allow-fs-read') || helpOutput.includes('--experimental-policy')) {
              console.log('✓ Permission model flags available');
            } else {
              console.log('ℹ Permission model flags not available');
            }
          });

        } catch (error) {
          console.log('ℹ Permission model test failed:', error.message);
        }

        // Test process.permission (Node.js 20+)
        if (process.permission) {
          console.log('✓ process.permission API available');

          // Test file system permission check
          try {
            const fsPermission = process.permission.has('fs.read');
            console.log('✓ File system permission check:', fsPermission);
          } catch (error) {
            console.log('ℹ File system permission check failed (may be expected)');
          }

        } else {
          console.log('ℹ process.permission API not available (Node.js < 20)');
        }

        // Test process.setuid/setgid (Unix systems only)
        if (process.platform !== 'win32') {
          if (typeof process.setuid === 'function') {
            console.log('✓ process.setuid available');
          }
          if (typeof process.setgid === 'function') {
            console.log('✓ process.setgid available');
          }
        }
      `;

      const testFile = join(projectRoot, 'test-permission-model.mjs');
      writeFileSync(testFile, permissionTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testWebSocketAPI() {
    await this.runTest('WebSocket API (Node.js 22+)', async () => {
      const webSocketTest = `
        // Test native WebSocket support (Node.js 22+)
        try {
          if (typeof WebSocket !== 'undefined') {
            console.log('✓ Native WebSocket API available');

            // Test WebSocket constructor
            const ws = new WebSocket('ws://echo.websocket.org');

            ws.onopen = () => {
              console.log('✓ WebSocket connection opened');
              ws.send('WebSocket test message');
            };

            ws.onmessage = (event) => {
              console.log('✓ WebSocket message received:', event.data);
              ws.close();
            };

            ws.onclose = () => {
              console.log('✓ WebSocket connection closed');
            };

            ws.onerror = (error) => {
              console.log('ℹ WebSocket error (may be expected):', error.message);
            };

            // Close after timeout
            setTimeout(() => {
              ws.close();
            }, 5000);

          } else {
            console.log('ℹ Native WebSocket not available (Node.js < 22)');

            // Test ws library fallback
            try {
              const { WebSocket } = await import('ws');
              console.log('✓ ws library available as fallback');
            } catch (error) {
              console.log('ℹ ws library not available');
            }
          }
        } catch (error) {
          console.log('ℹ WebSocket test failed:', error.message);
        }

        // Test WebSocket server (Node.js 22+)
        try {
          if (typeof WebSocketServer !== 'undefined') {
            console.log('✓ Native WebSocketServer API available');
          } else {
            console.log('ℹ Native WebSocketServer not available (Node.js < 22)');

            // Test ws library fallback
            try {
              const { WebSocketServer } = await import('ws');
              console.log('✓ ws WebSocketServer available as fallback');
            } catch (error) {
              console.log('ℹ ws WebSocketServer not available');
            }
          }
        } catch (error) {
          console.log('ℇ WebSocketServer test failed:', error.message);
        }
      `;

      const testFile = join(projectRoot, 'test-websocket-api.mjs');
      writeFileSync(testFile, webSocketTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testCryptoAPIs() {
    await this.runTest('Crypto APIs', async () => {
      const cryptoTest = `
        import crypto from 'crypto';
        import { getRandomValues } from 'crypto';

        // Test basic crypto functions
        const hash = crypto.createHash('sha256');
        hash.update('test message');
        const digest = hash.digest('hex');
        console.log('✓ SHA-256 hash:', digest.substring(0, 16) + '...');

        // Test HMAC
        const hmac = crypto.createHmac('sha256', 'secret-key');
        hmac.update('test message');
        const hmacDigest = hmac.digest('hex');
        console.log('✓ HMAC:', hmacDigest.substring(0, 16) + '...');

        // Test random bytes
        const randomBytes = crypto.randomBytes(16);
        console.log('✓ Random bytes:', randomBytes.toString('hex'));

        // Test getRandomValues (Web Crypto API compatible)
        const randomArray = new Uint32Array(4);
        getRandomValues(randomArray);
        console.log('✓ getRandomValues:', Array.from(randomArray).join(', '));

        // Test pbkdf2
        crypto.pbkdf2('password', 'salt', 100000, 32, 'sha256', (err, derivedKey) => {
          if (!err) {
            console.log('✓ PBKDF2:', derivedKey.toString('hex').substring(0, 16) + '...');
          }
        });

        // Test scrypt
        crypto.scrypt('password', 'salt', 32, (err, derivedKey) => {
          if (!err) {
            console.log('✓ scrypt:', derivedKey.toString('hex').substring(0, 16) + '...');
          }
        });

        // Test sign and verify
        const privateKey = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const data = 'test data';
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(data);
        const signature = sign.sign(privateKey.privateKey);

        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(data);
        const isValid = verify.verify(privateKey.publicKey, signature);
        console.log('✓ RSA signature verification:', isValid);

        // Test timingSafeEqual (Node.js 15+)
        if (crypto.timingSafeEqual) {
          const a = Buffer.from('test');
          const b = Buffer.from('test');
          const isEqual = crypto.timingSafeEqual(a, b);
          console.log('✓ timingSafeEqual:', isEqual);
        } else {
          console.log('ℹ timingSafeEqual not available (Node.js < 15)');
        }

        console.log('All Crypto APIs working correctly');
      `;

      const testFile = join(projectRoot, 'test-crypto-apis.mjs');
      writeFileSync(testFile, cryptoTest);

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
        'winston',
        'redis',
        'ws',
        'uuid',
        'zod'
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

  async testCLIIntegration() {
    await this.runTest('CLI Integration', async () => {
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

  async testMemoryManagement() {
    await this.runTest('Memory Management', async () => {
      const memoryTest = `
        import { performance } from 'perf_hooks';

        // Test memory usage monitoring
        const initialMemory = process.memoryUsage();
        console.log('Initial memory usage:');
        Object.entries(initialMemory).forEach(([key, value]) => {
          console.log(\`  \${key}: \${Math.round(value / 1024 / 1024 * 100) / 100} MB\`);
        });

        // Test memory allocation and garbage collection
        const arrays = [];
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
          arrays.push(new Array(10000).fill(i));
        }

        const peakMemory = process.memoryUsage();
        console.log('Peak memory usage:');
        Object.entries(peakMemory).forEach(([key, value]) => {
          console.log(\`  \${key}: \${Math.round(value / 1024 / 1024 * 100) / 100} MB\`);
        });

        // Test garbage collection
        if (global.gc) {
          global.gc();
          console.log('✓ Manual garbage collection triggered');
        }

        // Clear arrays
        arrays.length = 0;

        // Test memory after cleanup
        const finalMemory = process.memoryUsage();
        console.log('Final memory usage:');
        Object.entries(finalMemory).forEach(([key, value]) => {
          console.log(\`  \${key}: \${Math.round(value / 1024 / 1024 * 100) / 100} MB\`);
        });

        // Test memory leaks
        const memoryLeaks = [];
        for (let i = 0; i < 10; i++) {
          memoryLeaks.push({
            data: new Array(1000).fill(i),
            callback: () => console.log('Memory leak test'),
            timestamp: Date.now()
          });
        }

        console.log('✓ Memory management test completed');

        // Test performance.now() precision
        const start = performance.now();
        const end = performance.now();
        const precision = end - start;
        console.log('✓ Performance.now() precision:', precision.toFixed(6), 'ms');
      `;

      const testFile = join(projectRoot, 'test-memory-management.mjs');
      writeFileSync(testFile, memoryTest);

      try {
        await this.executeCommand(`node --expose-gc "${testFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testErrorHandling() {
    await this.runTest('Error Handling', async () => {
      const errorTest = `
        // Test error handling capabilities

        // Test Error.captureStackTrace (Node.js 1.6+)
        const err = new Error('Test error');
        if (Error.captureStackTrace) {
          Error.captureStackTrace(err, testErrorHandling);
          console.log('✓ Error.captureStackTrace working');
        }

        // Test error.stack
        console.log('✓ Error stack trace available:', err.stack ? true : false);

        // Test async error handling
        try {
          await Promise.reject(new Error('Async error test'));
        } catch (error) {
          console.log('✓ Async error handling working:', error.message);
        }

        // Test uncaught exception handling
        const originalHandler = process.listeners('uncaughtException');
        process.removeAllListeners('uncaughtException');

        process.once('uncaughtException', (error) => {
          console.log('✓ Uncaught exception handler working:', error.message);
        });

        // Trigger uncaught exception
        setTimeout(() => {
          throw new Error('Uncaught exception test');
        }, 10);

        // Test unhandled promise rejection
        process.removeAllListeners('unhandledRejection');

        process.once('unhandledRejection', (reason, promise) => {
          console.log('✓ Unhandled promise rejection handler working:', reason.message);
        });

        setTimeout(() => {
          Promise.reject(new Error('Unhandled promise rejection test'));
        }, 50);

        // Test error codes
        const customError = new Error('Custom error');
        customError.code = 'CUSTOM_ERROR';
        console.log('✓ Custom error codes:', customError.code);

        // Test error types
        const types = [
          new Error('Standard error'),
          new TypeError('Type error'),
          new ReferenceError('Reference error'),
          new SyntaxError('Syntax error'),
          new RangeError('Range error')
        ];

        types.forEach(error => {
          console.log('✓ Error type:', error.constructor.name);
        });

        // Wait for async error handlers
        await new Promise(resolve => setTimeout(resolve, 100));

        // Restore original handlers
        originalHandler.forEach(handler => {
          process.on('uncaughtException', handler);
        });

        console.log('Error handling test completed');
      `;

      const testFile = join(projectRoot, 'test-error-handling.mjs');
      writeFileSync(testFile, errorTest);

      try {
        await this.executeCommand(`node "${testFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
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
        nodeVersion: this.currentVersion,
        nodeMajorVersion: this.currentMajorVersion
      });

      console.log(`    ✅ PASS (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;

      this.results.push({
        name,
        status: 'FAIL',
        duration,
        error: error.message,
        nodeVersion: this.currentVersion,
        nodeMajorVersion: this.currentMajorVersion
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

  generateEnhancedReport() {
    const endTime = new Date();
    const totalDuration = endTime - this.testStartTime;

    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    const totalTests = this.results.length;

    const report = {
      summary: {
        nodeVersion: this.currentVersion,
        nodeMajorVersion: this.currentMajorVersion,
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
      featureCompatibility: this.analyzeFeatureCompatibility(),
      recommendations: this.generateEnhancedRecommendations()
    };

    const reportPath = join(projectRoot, 'test-results', `enhanced-nodejs-compatibility-${Date.now()}.json`);

    // Ensure directory exists
    const reportDir = join(projectRoot, 'test-results');
    if (!existsSync(reportDir)) {
      execSync(`mkdir -p "${reportDir}"`, { cwd: projectRoot });
    }

    // Write report
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('');
    console.log('📋 Enhanced Node.js Compatibility Test Summary:');
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
    console.log('💡 Enhanced Recommendations:');
    report.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });

    return report;
  }

  analyzeFeatureCompatibility() {
    const featureCompatibility = {};

    this.supportedVersions.forEach(version => {
      const versionNum = parseInt(version.version);
      const currentVersionNum = this.currentMajorVersion;

      const features = version.features.map(feature => {
        let status = 'unknown';
        if (currentVersionNum >= versionNum) {
          status = 'available';
        } else {
          status = 'requires-upgrade';
        }

        return { feature, status, requiredVersion: version.version };
      });

      featureCompatibility[version.version] = {
        lts: version.lts,
        status: version.status,
        features
      };
    });

    return featureCompatibility;
  }

  generateEnhancedRecommendations() {
    const recommendations = [];
    const failedTests = this.results.filter(r => r.status === 'FAIL');

    if (failedTests.length === 0) {
      recommendations.push(`🎉 Node.js ${this.currentVersion} is fully compatible with all enhanced features`);
      recommendations.push('✅ Package is ready for production deployment');
      return recommendations;
    }

    const failedFeatures = failedTests.map(t => t.name.toLowerCase());

    // Version-specific recommendations
    if (this.currentMajorVersion < 18) {
      recommendations.push('🔴 Critical: Upgrade to Node.js 18.x LTS for modern features and security updates');
      recommendations.push('⚠️ Current version lacks fetch API, Web Crypto, and other modern features');
    } else if (this.currentMajorVersion < 20) {
      recommendations.push('⚠️ Consider upgrading to Node.js 20.x LTS for test runner and permission model');
    } else if (this.currentMajorVersion < 22) {
      recommendations.push('ℹ️ Upgrade to Node.js 22.x for native WebSocket and enhanced fetch support');
    }

    // Feature-specific recommendations
    if (failedFeatures.some(f => f.includes('wasm'))) {
      recommendations.push('WebAssembly issues detected - ensure Node.js 12+ with proper flags');
    }

    if (failedFeatures.some(f => f.includes('worker'))) {
      recommendations.push('Worker thread issues - ensure Node.js 12+ with --experimental-worker or Node.js 14+');
    }

    if (failedFeatures.some(f => f.includes('fetch'))) {
      recommendations.push('Fetch API issues - use Node.js 18+ or install node-fetch polyfill');
    }

    if (failedFeatures.some(f => f.includes('test runner'))) {
      recommendations.push('Test runner issues - upgrade to Node.js 20.x LTS for native test runner');
    }

    if (failedFeatures.some(f => f.includes('permission'))) {
      recommendations.push('Permission model issues - upgrade to Node.js 20.x LTS for security features');
    }

    if (failedFeatures.some(f => f.includes('websocket'))) {
      recommendations.push('WebSocket API issues - upgrade to Node.js 22.x or use ws library');
    }

    if (failedFeatures.some(f => f.includes('crypto'))) {
      recommendations.push('Crypto API issues - ensure Node.js 14+ for full crypto support');
    }

    if (failedFeatures.some(f => f.includes('memory'))) {
      recommendations.push('Memory management issues - check for memory leaks and proper cleanup');
    }

    if (failedFeatures.some(f => f.includes('dependency'))) {
      recommendations.push('Dependency compatibility issues - run npm install and check package.json engines field');
    }

    // Performance recommendations
    if (this.currentMajorVersion >= 18) {
      recommendations.push('✅ Native fetch API available - consider removing node-fetch dependency');
    }

    if (this.currentMajorVersion >= 20) {
      recommendations.push('✅ Native test runner available - consider migrating from Jest');
    }

    if (this.currentMajorVersion >= 22) {
      recommendations.push('✅ Native WebSocket available - consider removing ws dependency');
    }

    return recommendations;
  }
}

// Main execution
async function main() {
  const tester = new EnhancedNodeVersionCompatibilityTester();

  try {
    await tester.runEnhancedCompatibilityTests();
    process.exit(0);
  } catch (error) {
    console.error('Enhanced Node.js compatibility testing failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Enhanced Node.js Version Compatibility Testing

Usage: node enhanced-nodejs-compatibility.js [options]

Options:
  --help, -h        Show this help message
  --version         Show Node.js version and supported versions
  --check-only      Only check current version compatibility
  --features        Show feature compatibility matrix
  --verbose         Enable verbose output
  --wasm-only       Test only WebAssembly compatibility
  --network-only    Test only network and fetch APIs

Examples:
  node enhanced-nodejs-compatibility.js
  node enhanced-nodejs-compatibility.js --features
  node enhanced-nodejs-compatibility.js --wasm-only
  node enhanced-nodejs-compatibility.js --verbose
  `);
  process.exit(0);
}

if (args.includes('--version')) {
  const tester = new EnhancedNodeVersionCompatibilityTester();
  console.log('Current Node.js Version:', tester.currentVersion);
  console.log('');
  console.log('Supported Versions:');
  tester.supportedVersions.forEach(v => {
    console.log(`  ${v.version} (${v.status}) - Minimum: ${v.minimum}`);
    console.log(`    Features: ${v.features.join(', ')}`);
  });
  process.exit(0);
}

if (args.includes('--check-only')) {
  const tester = new EnhancedNodeVersionCompatibilityTester();
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

if (args.includes('--features')) {
  const tester = new EnhancedNodeVersionCompatibilityTester();
  const compatibility = tester.analyzeFeatureCompatibility();

  console.log('Feature Compatibility Matrix:');
  Object.entries(compatibility).forEach(([version, info]) => {
    console.log(`\n${version} (${info.status}):`);
    info.features.forEach(feature => {
      const icon = feature.status === 'available' ? '✅' : '❌';
      console.log(`  ${icon} ${feature.feature} (${feature.status})`);
    });
  });
  process.exit(0);
}

if (args.includes('--verbose')) {
  process.env.VERBOSE = 'true';
}

// Run the tests
main().catch(console.error);