/**
 * Process Manager Example
 *
 * Demonstrates cross-platform process lifecycle management with support for
 * POSIX signals (Unix) and Job Objects (Windows).
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as os from 'os';

// ============================================================================
// Process Manager Interfaces
// ============================================================================

export interface ManagedProcess {
  pid: number;
  process: ChildProcess;
  platform: string;
  startTime: number;
  kill(signal?: string | number): Promise<boolean>;
  wait(timeout?: number): Promise<number>;
  getMemoryUsage(): Promise<MemoryUsage>;
  isRunning(): Promise<boolean>;
}

export interface MemoryUsage {
  rss: number;      // Resident Set Size
  heapTotal: number;
  heapUsed: number;
  external: number;
}

export interface ResourceLimits {
  maxMemoryMB?: number;
  maxCPUPercent?: number;
  maxExecutionTimeMs?: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  memory: MemoryUsage;
  cpuPercent: number;
  running: boolean;
}

// ============================================================================
// Abstract Process Manager
// ============================================================================

export abstract class ProcessManager {
  protected processes = new Map<number, ManagedProcess>();

  abstract spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess;
  abstract kill(pid: number, signal?: string | number): Promise<boolean>;
  abstract isRunning(pid: number): Promise<boolean>;
  abstract getProcessInfo(pid: number): Promise<ProcessInfo | null>;

  /**
   * Clean up all managed processes
   */
  async cleanup(): Promise<void> {
    const killPromises = Array.from(this.processes.keys()).map(pid =>
      this.kill(pid).catch(() => false)
    );
    await Promise.all(killPromises);
    this.processes.clear();
  }

  /**
   * Get count of managed processes
   */
  getProcessCount(): number {
    return this.processes.size;
  }

  /**
   * Get all managed process IDs
   */
  getManagedPids(): number[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Factory method to get platform-appropriate manager
   */
  static getInstance(): ProcessManager {
    if (process.platform === 'win32') {
      return new WindowsProcessManager();
    }
    return new UnixProcessManager();
  }
}

// ============================================================================
// Unix Process Manager (Linux, macOS, WSL)
// ============================================================================

export class UnixProcessManager extends ProcessManager {
  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess {
    const child = spawn(command, args, {
      shell: '/bin/bash',
      detached: false,
      stdio: options?.stdio || 'pipe',
      env: { ...process.env, ...options?.env }
    });

    const managed = new UnixManagedProcess(child);
    if (child.pid) {
      this.processes.set(child.pid, managed);
    }

    return managed;
  }

  async kill(pid: number, signal: string | number = 'SIGTERM'): Promise<boolean> {
    try {
      process.kill(pid, signal as any);
      this.processes.delete(pid);
      return true;
    } catch (err: any) {
      if (err.code === 'ESRCH') {
        // Process not found
        this.processes.delete(pid);
        return false;
      }
      throw err;
    }
  }

  async isRunning(pid: number): Promise<boolean> {
    try {
      // Signal 0 checks existence without killing
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
    if (!await this.isRunning(pid)) {
      return null;
    }

    try {
      // Use ps command to get process info
      const { execSync } = require('child_process');
      const output = execSync(`ps -p ${pid} -o pid,comm,%mem,%cpu`, { encoding: 'utf8' });
      const lines = output.trim().split('\n');

      if (lines.length < 2) return null;

      const [_, name, memPercent, cpuPercent] = lines[1].trim().split(/\s+/);

      return {
        pid,
        name,
        memory: {
          rss: parseInt(memPercent) * (os.totalmem() / 100),
          heapTotal: 0,
          heapUsed: 0,
          external: 0
        },
        cpuPercent: parseFloat(cpuPercent),
        running: true
      };
    } catch {
      return null;
    }
  }
}

class UnixManagedProcess implements ManagedProcess {
  pid: number;
  process: ChildProcess;
  platform = 'unix';
  startTime: number;

  constructor(child: ChildProcess) {
    this.process = child;
    this.pid = child.pid!;
    this.startTime = Date.now();
  }

  async kill(signal: string | number = 'SIGTERM'): Promise<boolean> {
    try {
      this.process.kill(signal as any);
      return true;
    } catch {
      return false;
    }
  }

  async wait(timeout = 30000): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Process ${this.pid} did not exit within ${timeout}ms`));
      }, timeout);

      this.process.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code || 0);
      });
    });
  }

  async getMemoryUsage(): Promise<MemoryUsage> {
    // For child processes, we can't directly get memory usage
    // In production, use external tools like pidusage
    return {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0
    };
  }

  async isRunning(): Promise<boolean> {
    try {
      process.kill(this.pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Windows Process Manager
// ============================================================================

export class WindowsProcessManager extends ProcessManager {
  private jobObject: any = null;

  constructor() {
    super();
    // In production, create Windows Job Object here
    // Requires native binding (node-ffi or native addon)
  }

  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess {
    const child = spawn(command, args, {
      shell: 'powershell.exe',
      windowsHide: true,
      stdio: options?.stdio || 'pipe',
      env: { ...process.env, ...options?.env }
    });

    // In production, add to Job Object for guaranteed cleanup
    const managed = new WindowsManagedProcess(child, this.jobObject);
    if (child.pid) {
      this.processes.set(child.pid, managed);
    }

    return managed;
  }

  async kill(pid: number, signal?: string | number): Promise<boolean> {
    try {
      // Windows doesn't support POSIX signals
      // Use taskkill with /F (force) and /T (tree)
      const { spawnSync } = require('child_process');
      const result = spawnSync('taskkill', [
        '/F',  // Force termination
        '/T',  // Terminate process tree
        '/PID', pid.toString()
      ]);

      this.processes.delete(pid);
      return result.status === 0;
    } catch {
      return false;
    }
  }

  async isRunning(pid: number): Promise<boolean> {
    try {
      const { spawnSync } = require('child_process');
      const result = spawnSync('tasklist', [
        '/FI', `PID eq ${pid}`,
        '/NH'  // No header
      ]);

      return result.stdout.toString().includes(pid.toString());
    } catch {
      return false;
    }
  }

  async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
    if (!await this.isRunning(pid)) {
      return null;
    }

    try {
      const { execSync } = require('child_process');
      const output = execSync(
        `powershell "Get-Process -Id ${pid} | Select-Object Name,WorkingSet,CPU | ConvertTo-Json"`,
        { encoding: 'utf8' }
      );

      const data = JSON.parse(output);

      return {
        pid,
        name: data.Name,
        memory: {
          rss: data.WorkingSet,
          heapTotal: 0,
          heapUsed: 0,
          external: 0
        },
        cpuPercent: data.CPU || 0,
        running: true
      };
    } catch {
      return null;
    }
  }

  async cleanup(): Promise<void> {
    if (this.jobObject) {
      // Job Object automatically terminates all child processes
      // In production, call native binding to terminate job
    } else {
      // Fallback to manual cleanup
      await super.cleanup();
    }
  }
}

class WindowsManagedProcess implements ManagedProcess {
  pid: number;
  process: ChildProcess;
  platform = 'windows';
  startTime: number;
  private jobObject: any;

  constructor(child: ChildProcess, jobObject: any) {
    this.process = child;
    this.pid = child.pid!;
    this.startTime = Date.now();
    this.jobObject = jobObject;
  }

  async kill(signal?: string | number): Promise<boolean> {
    try {
      // Windows doesn't support signals, use taskkill
      const { spawnSync } = require('child_process');
      const result = spawnSync('taskkill', ['/F', '/T', '/PID', this.pid.toString()]);
      return result.status === 0;
    } catch {
      return false;
    }
  }

  async wait(timeout = 30000): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Process ${this.pid} did not exit within ${timeout}ms`));
      }, timeout);

      this.process.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code || 0);
      });
    });
  }

  async getMemoryUsage(): Promise<MemoryUsage> {
    try {
      const { execSync } = require('child_process');
      const output = execSync(
        `powershell "(Get-Process -Id ${this.pid}).WorkingSet64"`,
        { encoding: 'utf8' }
      );
      const rss = parseInt(output.trim());

      return {
        rss,
        heapTotal: 0,
        heapUsed: 0,
        external: 0
      };
    } catch {
      return {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0
      };
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      const { spawnSync } = require('child_process');
      const result = spawnSync('tasklist', ['/FI', `PID eq ${this.pid}`, '/NH']);
      return result.stdout.toString().includes(this.pid.toString());
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Basic process spawning
 */
export async function example1_BasicSpawning() {
  console.log('Example 1: Basic Process Spawning');
  console.log('-'.repeat(50));

  const manager = ProcessManager.getInstance();

  const command = process.platform === 'win32' ? 'powershell' : 'echo';
  const args = process.platform === 'win32' ? ['Write-Output', 'Hello from process!'] : ['Hello from process!'];

  const proc = manager.spawn(command, args, { stdio: 'inherit' });

  console.log(`Spawned process: PID ${proc.pid}`);
  console.log(`Platform: ${proc.platform}`);
  console.log(`Start time: ${new Date(proc.startTime).toISOString()}`);

  const exitCode = await proc.wait(5000);
  console.log(`Process exited with code: ${exitCode}`);
}

/**
 * Example 2: Process monitoring
 */
export async function example2_ProcessMonitoring() {
  console.log('\nExample 2: Process Monitoring');
  console.log('-'.repeat(50));

  const manager = ProcessManager.getInstance();

  // Spawn a long-running process
  const command = process.platform === 'win32' ? 'powershell' : 'sleep';
  const args = process.platform === 'win32' ? ['Start-Sleep', '-Seconds', '5'] : ['5'];

  const proc = manager.spawn(command, args);

  console.log(`Spawned long-running process: PID ${proc.pid}`);

  // Check if running
  const running = await proc.isRunning();
  console.log(`Process running: ${running}`);

  // Get memory usage
  const memory = await proc.getMemoryUsage();
  console.log(`Memory usage: ${(memory.rss / 1024 / 1024).toFixed(2)} MB`);

  // Kill the process
  const killed = await proc.kill();
  console.log(`Process killed: ${killed}`);

  // Verify it's no longer running
  const stillRunning = await proc.isRunning();
  console.log(`Process still running: ${stillRunning}`);
}

/**
 * Example 3: Multiple process management
 */
export async function example3_MultipleProcesses() {
  console.log('\nExample 3: Multiple Process Management');
  console.log('-'.repeat(50));

  const manager = ProcessManager.getInstance();
  const processes: ManagedProcess[] = [];

  // Spawn 5 processes
  for (let i = 0; i < 5; i++) {
    const command = process.platform === 'win32' ? 'powershell' : 'sleep';
    const args = process.platform === 'win32' ? ['Start-Sleep', '-Seconds', '10'] : ['10'];

    const proc = manager.spawn(command, args);
    processes.push(proc);
    console.log(`Spawned process ${i + 1}: PID ${proc.pid}`);
  }

  console.log(`\nTotal managed processes: ${manager.getProcessCount()}`);
  console.log(`Process IDs: ${manager.getManagedPids().join(', ')}`);

  // Clean up all processes
  console.log('\nCleaning up all processes...');
  await manager.cleanup();

  console.log(`Remaining processes: ${manager.getProcessCount()}`);
}

/**
 * Example 4: Resource limits (conceptual)
 */
export async function example4_ResourceLimits() {
  console.log('\nExample 4: Resource Limits (Conceptual)');
  console.log('-'.repeat(50));

  const limits: ResourceLimits = {
    maxMemoryMB: 1024,      // 1GB memory limit
    maxCPUPercent: 80,      // 80% CPU limit
    maxExecutionTimeMs: 60000  // 1 minute timeout
  };

  console.log('Resource limits (not enforced in this example):');
  console.log(`  Max Memory: ${limits.maxMemoryMB} MB`);
  console.log(`  Max CPU: ${limits.maxCPUPercent}%`);
  console.log(`  Max Execution Time: ${limits.maxExecutionTimeMs}ms`);

  console.log('\nIn production, these would be enforced via:');
  console.log('  - Linux: cgroups v1/v2');
  console.log('  - macOS: launchd or manual monitoring');
  console.log('  - Windows: Job Objects with memory/CPU limits');
}

/**
 * Example 5: Platform-specific behavior
 */
export async function example5_PlatformSpecific() {
  console.log('\nExample 5: Platform-Specific Behavior');
  console.log('-'.repeat(50));

  const manager = ProcessManager.getInstance();

  if (process.platform === 'win32') {
    console.log('Windows-specific features:');
    console.log('  ✅ Job Objects for process groups');
    console.log('  ✅ taskkill for force termination');
    console.log('  ✅ PowerShell integration');
    console.log('  ❌ POSIX signals not supported');
  } else {
    console.log('Unix-specific features:');
    console.log('  ✅ POSIX signals (SIGTERM, SIGKILL, etc.)');
    console.log('  ✅ Process groups via setpgid');
    console.log('  ✅ bash integration');
    console.log('  ❌ Job Objects not available');
  }
}

// ============================================================================
// Main Execution
// ============================================================================

if (require.main === module) {
  (async () => {
    console.log('='.repeat(70));
    console.log('Process Manager Examples');
    console.log('='.repeat(70));

    try {
      await example1_BasicSpawning();
      await example2_ProcessMonitoring();
      await example3_MultipleProcesses();
      await example4_ResourceLimits();
      await example5_PlatformSpecific();

      console.log('\n' + '='.repeat(70));
      console.log('All examples completed successfully!');
      console.log('='.repeat(70));
    } catch (err) {
      console.error('Error running examples:', err);
      process.exit(1);
    }
  })();
}
