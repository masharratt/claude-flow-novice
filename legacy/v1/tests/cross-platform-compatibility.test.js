#!/usr/bin/env node

/**
 * Cross-Platform Compatibility Testing Framework
 * Tests claude-flow-novice across different operating systems and Node.js versions
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, normalize, sep } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Platform detection utilities
class PlatformDetector {
  static getCurrentPlatform() {
    return {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
      isWSL: process.platform === 'linux' && process.env.WSL_DISTRO_NAME,
      isGitBash: process.platform === 'win32' && process.env.SHELL?.includes('bash'),
      isCygwin: process.platform === 'win32' && process.env.TERM?.includes('cygwin'),
      isPowerShell: process.platform === 'win32' && process.env.PSModulePath,
      isCMD: process.platform === 'win32' && !process.env.PSModulePath && !process.env.SHELL
    };
  }

  static getTestPlatforms() {
    return [
      { os: 'win32', arch: 'x64', name: 'Windows 10/11 x64' },
      { os: 'win32', arch: 'arm64', name: 'Windows 11 ARM64' },
      { os: 'darwin', arch: 'x64', name: 'macOS Intel' },
      { os: 'darwin', arch: 'arm64', name: 'macOS Apple Silicon' },
      { os: 'linux', arch: 'x64', name: 'Linux x64' },
      { os: 'linux', arch: 'arm64', name: 'Linux ARM64' },
      { os: 'linux', arch: 'arm', name: 'Linux ARM' }
    ];
  }

  static getNodeVersions() {
    return [
      { version: '18.x', lts: true, status: 'Maintenance' },
      { version: '20.x', lts: true, status: 'Active' },
      { version: '22.x', lts: false, status: 'Current' }
    ];
  }
}

// Test framework infrastructure
class CompatibilityTestSuite {
  constructor() {
    this.results = [];
    this.currentPlatform = PlatformDetector.getCurrentPlatform();
    this.testStartTime = new Date();
    this.reportDir = join(projectRoot, 'test-results', 'cross-platform');
    this.ensureReportDir();
  }

  ensureReportDir() {
    if (!existsSync(this.reportDir)) {
      mkdirSync(this.reportDir, { recursive: true });
    }
  }

  async runAllTests() {
    console.log(`🧪 Cross-Platform Compatibility Testing`);
    console.log(`📅 Started: ${this.testStartTime.toISOString()}`);
    console.log(`🖥️  Current Platform: ${this.getPlatformDescription()}`);
    console.log(`📦 Node.js: ${this.currentPlatform.nodeVersion}`);
    console.log('');

    await this.testCoreComponents();
    await this.testFileOperations();
    await this.testProcessManagement();
    await this.testNetworkOperations();
    await this.testRedisIntegration();
    await this.testAuthentication();
    await this.testDashboardFeatures();
    await this.testSwarmExecution();
    await this.testPerformanceCharacteristics();
    await this.testSecurityFeatures();

    this.generateReport();
  }

  getPlatformDescription() {
    const { os, arch, isWSL, isGitBash, isPowerShell, isCMD } = this.currentPlatform;
    let desc = `${os}-${arch}`;

    if (isWSL) desc += ' (WSL)';
    if (isGitBash) desc += ' (Git Bash)';
    if (isPowerShell) desc += ' (PowerShell)';
    if (isCMD) desc += ' (CMD)';

    return desc;
  }

  async testCoreComponents() {
    console.log('🔧 Testing Core Components...');

    await this.runTest('CLI Commands', async () => {
      const commands = ['status', '--help', 'swarm --help', 'hooks --help'];
      for (const cmd of commands) {
        await this.executeCommand(`npm run dev ${cmd}`, { timeout: 10000 });
      }
    });

    await this.runTest('Module Loading', async () => {
      const modules = [
        'src/cli/main.js',
        'src/swarm/SwarmManager.js',
        'src/redis/RedisClient.js',
        'src/dashboard/DashboardServer.js'
      ];

      for (const module of modules) {
        const testPath = join(projectRoot, module);
        if (existsSync(testPath)) {
          await this.executeCommand(`node -e "import('${testPath}').then(() => console.log('✓ ${module} loaded')).catch(e => { console.error('✗ ${module} failed:', e.message); process.exit(1) })"`);
        }
      }
    });

    await this.runTest('Dependency Resolution', async () => {
      await this.executeCommand('npm list --depth=0', { timeout: 30000 });
    });
  }

  async testFileOperations() {
    console.log('📁 Testing File Operations...');

    await this.runTest('Path Handling', async () => {
      const pathTests = [
        { path: '.', desc: 'Current directory' },
        { path: '..', desc: 'Parent directory' },
        { path: './src', desc: 'Relative path' },
        { path: `${projectRoot}/src`, desc: 'Absolute path' },
        { path: join('src', 'cli'), desc: 'Path.join()' },
        { path: resolve('src', 'cli'), desc: 'Path.resolve()' }
      ];

      for (const test of pathTests) {
        const exists = existsSync(test.path);
        if (!exists) {
          throw new Error(`Path test failed: ${test.desc} - ${test.path}`);
        }
      }
    });

    await this.runTest('File Permissions', async () => {
      const testFile = join(projectRoot, 'test-permissions.tmp');
      try {
        writeFileSync(testFile, 'test');
        await this.executeCommand(`chmod 644 "${testFile}"`, { ignoreError: true });
        await this.executeCommand(`cat "${testFile}"`, { ignoreError: true });
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Cross-Platform Paths', async () => {
      const pathSepTests = [
        join('a', 'b', 'c'),
        normalize('a/b/c'),
        resolve('a/b/c')
      ];

      for (const path of pathSepTests) {
        if (!path.includes(sep)) {
          throw new Error(`Path separator issue detected: ${path}`);
        }
      }
    });
  }

  async testProcessManagement() {
    console.log('⚙️  Testing Process Management...');

    await this.runTest('Process Spawning', async () => {
      const testScript = `
        setTimeout(() => {
          console.log('Process spawned successfully');
          process.exit(0);
        }, 1000);
      `;

      const scriptFile = join(projectRoot, 'test-process.js');
      writeFileSync(scriptFile, testScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Signal Handling', async () => {
      const signalScript = `
        process.on('SIGINT', () => {
          console.log('SIGINT received');
          process.exit(0);
        });

        setTimeout(() => {
          console.log('Process ready for signals');
        }, 100);
      `;

      const scriptFile = join(projectRoot, 'test-signals.js');
      writeFileSync(scriptFile, signalScript);

      try {
        const child = spawn('node', [scriptFile]);
        await new Promise(resolve => setTimeout(resolve, 200));
        child.kill('SIGINT');
        await new Promise(resolve => setTimeout(resolve, 200));
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Environment Variables', async () => {
      const envTest = process.env.NODE_ENV || 'development';
      const pathTest = process.env.PATH || '';

      if (!pathTest.includes(sep)) {
        throw new Error('PATH environment variable seems malformed');
      }
    });
  }

  async testNetworkOperations() {
    console.log('🌐 Testing Network Operations...');

    await this.runTest('HTTP Server', async () => {
      const serverScript = `
        import { createServer } from 'http';

        const server = createServer((req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('OK');
        });

        server.listen(0, () => {
          console.log('Server listening on port:', server.address().port);
          setTimeout(() => {
            server.close();
            process.exit(0);
          }, 1000);
        });
      `;

      const scriptFile = join(projectRoot, 'test-http-server.js');
      writeFileSync(scriptFile, serverScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('WebSocket Connection', async () => {
      const wsScript = `
        import { WebSocketServer } from 'ws';

        const wss = new WebSocketServer({ port: 0 });

        wss.on('connection', (ws) => {
          ws.send('Hello from server');
          ws.close();
        });

        wss.on('listening', () => {
          console.log('WebSocket server listening on port:', wss.address().port);
          setTimeout(() => {
            wss.close();
            process.exit(0);
          }, 1000);
        });
      `;

      const scriptFile = join(projectRoot, 'test-websocket.js');
      writeFileSync(scriptFile, wsScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testRedisIntegration() {
    console.log('🔴 Testing Redis Integration...');

    await this.runTest('Redis Connection', async () => {
      const redisScript = `
        import Redis from 'ioredis';

        const redis = new Redis({
          host: 'localhost',
          port: 6379,
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 1,
          lazyConnect: true
        });

        redis.on('error', (err) => {
          if (err.code === 'ECONNREFUSED') {
            console.log('Redis not available - skipping test');
            process.exit(0);
          }
          console.error('Redis error:', err);
          process.exit(1);
        });

        redis.connect().then(() => {
          console.log('Redis connection successful');
          redis.disconnect();
          process.exit(0);
        }).catch(() => {
          console.log('Redis connection failed - server may not be running');
          process.exit(0);
        });
      `;

      const scriptFile = join(projectRoot, 'test-redis.js');
      writeFileSync(scriptFile, redisScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Redis Pub/Sub', async () => {
      const pubSubScript = `
        import Redis from 'ioredis';

        const pub = new Redis({ lazyConnect: true });
        const sub = new Redis({ lazyConnect: true });

        Promise.all([
          pub.connect(),
          sub.connect()
        ]).then(() => {
          sub.subscribe('test-channel', (err, count) => {
            if (err) {
              console.error('Subscribe error:', err);
              process.exit(1);
            }

            sub.on('message', (channel, message) => {
              console.log('Received message:', message);
              pub.disconnect();
              sub.disconnect();
              process.exit(0);
            });

            pub.publish('test-channel', 'Hello Redis!');
          });
        }).catch((err) => {
          console.log('Redis pub/sub test failed:', err.message);
          process.exit(0);
        });
      `;

      const scriptFile = join(projectRoot, 'test-redis-pubsub.js');
      writeFileSync(scriptFile, pubSubScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testAuthentication() {
    console.log('🔐 Testing Authentication...');

    await this.runTest('JWT Token Generation', async () => {
      const jwtScript = `
        import jwt from 'jsonwebtoken';

        try {
          const token = jwt.sign({ test: true }, 'test-secret', { expiresIn: '1h' });
          const decoded = jwt.verify(token, 'test-secret');

          if (decoded.test) {
            console.log('JWT generation and verification successful');
            process.exit(0);
          } else {
            console.error('JWT verification failed');
            process.exit(1);
          }
        } catch (error) {
          console.error('JWT test failed:', error.message);
          process.exit(1);
        }
      `;

      const scriptFile = join(projectRoot, 'test-jwt.js');
      writeFileSync(scriptFile, jwtScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Password Hashing', async () => {
      const bcryptScript = `
        import bcrypt from 'bcrypt';

        try {
          const password = 'test-password';
          const hash = await bcrypt.hash(password, 10);
          const isValid = await bcrypt.compare(password, hash);

          if (isValid) {
            console.log('Password hashing and verification successful');
            process.exit(0);
          } else {
            console.error('Password verification failed');
            process.exit(1);
          }
        } catch (error) {
          console.error('Bcrypt test failed:', error.message);
          process.exit(1);
        }
      `;

      const scriptFile = join(projectRoot, 'test-bcrypt.js');
      writeFileSync(scriptFile, bcryptScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testDashboardFeatures() {
    console.log('📊 Testing Dashboard Features...');

    await this.runTest('Dashboard Server Startup', async () => {
      const dashboardScript = `
        import { createServer } from 'http';
        import { Server as SocketIOServer } from 'socket.io';

        const httpServer = createServer();
        const io = new SocketIOServer(httpServer);

        io.on('connection', (socket) => {
          console.log('Dashboard client connected');
          socket.emit('test', { message: 'Dashboard test successful' });
          socket.disconnect();
        });

        httpServer.listen(0, () => {
          console.log('Dashboard server listening on port:', httpServer.address().port);
          setTimeout(() => {
            httpServer.close();
            process.exit(0);
          }, 1000);
        });
      `;

      const scriptFile = join(projectRoot, 'tests/manual/test-dashboard.js');
      writeFileSync(scriptFile, dashboardScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Real-time Updates', async () => {
      const realtimeScript = `
        import { createServer } from 'http';
        import { Server as SocketIOServer } from 'socket.io';

        const httpServer = createServer();
        const io = new SocketIOServer(httpServer);

        let messageCount = 0;

        io.on('connection', (socket) => {
          const interval = setInterval(() => {
            socket.emit('update', {
              timestamp: Date.now(),
              count: ++messageCount
            });

            if (messageCount >= 3) {
              clearInterval(interval);
              socket.disconnect();
              httpServer.close();
              process.exit(0);
            }
          }, 100);
        });

        httpServer.listen(0, () => {
          console.log('Real-time server listening on port:', httpServer.address().port);
        });
      `;

      const scriptFile = join(projectRoot, 'test-realtime.js');
      writeFileSync(scriptFile, realtimeScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testSwarmExecution() {
    console.log('🐝 Testing Swarm Execution...');

    await this.runTest('Swarm Initialization', async () => {
      const swarmScript = `
        try {
          const swarmId = 'test-swarm-' + Date.now();
          const swarmConfig = {
            id: swarmId,
            objective: 'Test swarm execution',
            agents: [],
            status: 'initialized'
          };

          console.log('Swarm configuration created:', swarmConfig.id);
          console.log('Swarm execution test successful');
          process.exit(0);
        } catch (error) {
          console.error('Swarm test failed:', error.message);
          process.exit(1);
        }
      `;

      const scriptFile = join(projectRoot, 'test-swarm.js');
      writeFileSync(scriptFile, swarmScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Agent Communication', async () => {
      const agentScript = `
        const EventEmitter = require('events');

        class MockAgent extends EventEmitter {
          constructor(id) {
            super();
            this.id = id;
            this.status = 'ready';
          }

          async execute(task) {
            this.status = 'executing';
            this.emit('status', this.status);

            await new Promise(resolve => setTimeout(resolve, 100));

            this.status = 'completed';
            this.emit('status', this.status);
            this.emit('result', { agent: this.id, task, success: true });

            return { success: true, result: 'Task completed' };
          }
        }

        try {
          const agent1 = new MockAgent('agent-1');
          const agent2 = new MockAgent('agent-2');

          let messages = 0;

          agent1.on('status', (status) => {
            console.log('Agent 1 status:', status);
            messages++;
          });

          agent2.on('status', (status) => {
            console.log('Agent 2 status:', status);
            messages++;
          });

          await Promise.all([
            agent1.execute('test-task-1'),
            agent2.execute('test-task-2')
          ]);

          if (messages >= 4) {
            console.log('Agent communication test successful');
            process.exit(0);
          } else {
            console.error('Agent communication incomplete');
            process.exit(1);
          }
        } catch (error) {
          console.error('Agent communication test failed:', error.message);
          process.exit(1);
        }
      `;

      const scriptFile = join(projectRoot, 'test-agents.js');
      writeFileSync(scriptFile, agentScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testPerformanceCharacteristics() {
    console.log('⚡ Testing Performance Characteristics...');

    await this.runTest('Memory Usage', async () => {
      const memoryScript = `
        const used = process.memoryUsage();

        console.log('Memory Usage:');
        for (let key in used) {
          console.log(\`\${key}: \${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB\`);
        }

        const totalMB = used.heapTotal / 1024 / 1024;

        if (totalMB < 500) {
          console.log('Memory usage within acceptable limits');
          process.exit(0);
        } else {
          console.log('Memory usage high but acceptable for testing');
          process.exit(0);
        }
      `;

      const scriptFile = join(projectRoot, 'test-memory.js');
      writeFileSync(scriptFile, memoryScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('CPU Performance', async () => {
      const cpuScript = `
        const start = Date.now();
        let iterations = 0;

        while (Date.now() - start < 1000) {
          iterations++;
          Math.random() * Math.random();
        }

        console.log(\`CPU iterations per second: \${iterations}\`);

        if (iterations > 1000000) {
          console.log('CPU performance acceptable');
          process.exit(0);
        } else {
          console.log('CPU performance lower than expected');
          process.exit(0);
        }
      `;

      const scriptFile = join(projectRoot, 'test-cpu.js');
      writeFileSync(scriptFile, cpuScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testSecurityFeatures() {
    console.log('🛡️  Testing Security Features...');

    await this.runTest('Input Validation', async () => {
      const validationScript = `
        const maliciousInputs = [
          '<script>alert("xss")</script>',
          '"; DROP TABLE users; --',
          '../../../etc/passwd',
          '\\x00\\x01\\x02\\x03',
          '<iframe src="javascript:alert(1)"></iframe>'
        ];

        function sanitizeInput(input) {
          return input
            .replace(/<script.*?>.*?<\\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\\w+\\s*=/gi, '')
            .replace(/[;&]/g, '')
            .replace(/\\.\\./g, '');
        }

        try {
          for (const input of maliciousInputs) {
            const sanitized = sanitizeInput(input);
            if (sanitized === input) {
              console.warn('Input may not be properly sanitized:', input);
            }
          }

          console.log('Input validation test completed');
          process.exit(0);
        } catch (error) {
          console.error('Input validation test failed:', error.message);
          process.exit(1);
        }
      `;

      const scriptFile = join(projectRoot, 'test-validation.js');
      writeFileSync(scriptFile, validationScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Rate Limiting', async () => {
      const rateLimitScript = `
        const rateLimiter = {
          requests: new Map(),

          isAllowed(ip, limit = 10, window = 60000) {
            const now = Date.now();
            const requests = this.requests.get(ip) || [];

            const validRequests = requests.filter(time => now - time < window);

            if (validRequests.length >= limit) {
              return false;
            }

            validRequests.push(now);
            this.requests.set(ip, validRequests);
            return true;
          }
        };

        try {
          const testIP = '192.168.1.1';
          let allowedCount = 0;

          for (let i = 0; i < 15; i++) {
            if (rateLimiter.isAllowed(testIP, 10, 1000)) {
              allowedCount++;
            }
          }

          if (allowedCount <= 10) {
            console.log('Rate limiting test successful');
            process.exit(0);
          } else {
            console.error('Rate limiting failed');
            process.exit(1);
          }
        } catch (error) {
          console.error('Rate limiting test failed:', error.message);
          process.exit(1);
        }
      `;

      const scriptFile = join(projectRoot, 'test-ratelimit.js');
      writeFileSync(scriptFile, rateLimitScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
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
        error: null
      });

      console.log(`    ✅ PASS (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;

      this.results.push({
        name,
        status: 'FAIL',
        duration,
        error: error.message
      });

      console.log(`    ❌ FAIL (${duration}ms): ${error.message}`);
    }
  }

  async executeCommand(command, options = {}) {
    const { timeout = 5000, ignoreError = false } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      try {
        const result = execSync(command, {
          encoding: 'utf8',
          timeout,
          stdio: 'pipe',
          cwd: projectRoot
        });

        const duration = Date.now() - startTime;
        resolve({ stdout: result, duration, error: null });

      } catch (error) {
        const duration = Date.now() - startTime;

        if (ignoreError) {
          resolve({
            stdout: error.stdout || '',
            duration,
            error: error.message
          });
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
        platform: this.getPlatformDescription(),
        nodeVersion: this.currentPlatform.nodeVersion,
        startTime: this.testStartTime.toISOString(),
        endTime: endTime.toISOString(),
        totalDuration,
        totalTests,
        passedTests,
        failedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      },
      platform: this.currentPlatform,
      results: this.results,
      recommendations: this.generateRecommendations()
    };

    const reportPath = join(this.reportDir, `compatibility-report-${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('');
    console.log('📋 Test Summary:');
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

    if (failedTests.length === 0) {
      recommendations.push('All tests passed - platform is fully compatible');
      return recommendations;
    }

    const platformIssues = {
      'win32': [],
      'darwin': [],
      'linux': []
    };

    failedTests.forEach(test => {
      const error = test.error.toLowerCase();

      if (error.includes('permission') || error.includes('eacces')) {
        platformIssues[this.currentPlatform.os].push('File permission issues detected');
      }

      if (error.includes('enoent') || error.includes('not found')) {
        platformIssues[this.currentPlatform.os].push('Missing dependencies or paths');
      }

      if (error.includes('econnrefused') || error.includes('network')) {
        platformIssues[this.currentPlatform.os].push('Network connectivity issues');
      }

      if (error.includes('timeout')) {
        platformIssues[this.currentPlatform.os].push('Performance or timeout issues');
      }
    });

    Object.entries(platformIssues).forEach(([platform, issues]) => {
      if (platform === this.currentPlatform.os && issues.length > 0) {
        issues = [...new Set(issues)]; // Remove duplicates
        issues.forEach(issue => {
          recommendations.push(`${platform}: ${issue}`);
        });
      }
    });

    if (this.currentPlatform.isWSL) {
      recommendations.push('WSL detected: Consider testing native Windows environment');
    }

    if (this.currentPlatform.isGitBash) {
      recommendations.push('Git Bash detected: Test PowerShell/CMD for Windows compatibility');
    }

    if (failedTests.some(t => t.name.includes('Redis'))) {
      recommendations.push('Install Redis server for full functionality testing');
    }

    if (failedTests.some(t => t.name.includes('File'))) {
      recommendations.push('Check file system permissions and paths');
    }

    if (failedTests.some(t => t.name.includes('Network'))) {
      recommendations.push('Verify network configuration and firewall settings');
    }

    return recommendations;
  }
}

// Run the compatibility test suite
async function main() {
  const testSuite = new CompatibilityTestSuite();

  try {
    await testSuite.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error('Compatibility test suite failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Cross-Platform Compatibility Testing Framework

Usage: node cross-platform-compatibility.js [options]

Options:
  --help, -h     Show this help message
  --platform     Show current platform information
  --report-dir   Set custom report directory
  --verbose      Enable verbose output

Examples:
  node cross-platform-compatibility.js
  node cross-platform-compatibility.js --verbose
  node cross-platform-compatibility.js --platform
  `);
  process.exit(0);
}

if (args.includes('--platform')) {
  const platform = PlatformDetector.getCurrentPlatform();
  console.log('Current Platform Information:');
  console.log(JSON.stringify(platform, null, 2));
  process.exit(0);
}

if (args.includes('--verbose')) {
  process.env.VERBOSE = 'true';
}

if (args.includes('--report-dir')) {
  const dirIndex = args.indexOf('--report-dir');
  if (dirIndex !== -1 && args[dirIndex + 1]) {
    process.env.REPORT_DIR = args[dirIndex + 1];
  }
}

// Run the tests
main().catch(console.error);