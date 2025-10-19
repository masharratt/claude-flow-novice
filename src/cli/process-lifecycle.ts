import { EventEmitter } from "events";
import { readFile } from "fs/promises";
import { join } from "path";

export enum ProcessType {
  EVENT_BUS = "EVENT_BUS",
  ORCHESTRATOR = "ORCHESTRATOR",
  MEMORY_MANAGER = "MEMORY_MANAGER",
  TERMINAL_POOL = "TERMINAL_POOL",
  COORDINATOR = "COORDINATOR",
  MCP_SERVER = "MCP_SERVER",
}

export enum ProcessStatus {
  STOPPED = "STOPPED",
  STARTING = "STARTING",
  RUNNING = "RUNNING",
  STOPPING = "STOPPING",
  ERROR = "ERROR",
}

export interface ProcessInfo {
  id: string;
  name: string;
  type: ProcessType;
  status: ProcessStatus;
  startTime?: number;
  pid?: number;
  metrics?: ProcessMetrics;
}

export interface ProcessMetrics {
  lastError?: string;
  uptime?: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface SystemStats {
  totalProcesses: number;
  runningProcesses: number;
  stoppedProcesses: number;
  errorProcesses: number;
  systemUptime: number;
  totalMemory: number;
  totalCpu: number;
}

export interface ProcessLifecycleConfig {
  processTypes: {
    [key in ProcessType]: {
      dependencies: ProcessType[];
      restartPolicy: "always" | "on-failure" | "never";
    };
  };
  monitoringConfig: {
    pollingInterval: number;
    healthCheckTimeout: number;
    metricCollectionEnabled: boolean;
  };
}

export class ProcessLifecycleManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private config: ProcessLifecycleConfig;
  private configPath: string;

  constructor(
    configPath: string = join(
      __dirname,
      "..",
      "..",
      ".claude",
      "skills",
      "process-lifecycle",
      "config.json",
    ),
  ) {
    super();
    this.configPath = configPath;
  }

  async initialize(): Promise<void> {
    try {
      const configData = await readFile(this.configPath, "utf-8");
      this.config = JSON.parse(configData);
      this.initializeProcesses();
      this.emit("initialized", { config: this.config });
    } catch (error) {
      this.emit("error", { component: "ProcessLifecycleManager", error });
      throw error;
    }
  }

  private initializeProcesses(): void {
    const processDefinitions: ProcessInfo[] = Object.entries(
      this.config.processTypes,
    ).map(([type, details]) => ({
      id: type,
      name: this.formatProcessName(type),
      type: type as ProcessType,
      status: ProcessStatus.STOPPED,
    }));

    for (const process of processDefinitions) {
      this.processes.set(process.id, process);
    }
  }

  private formatProcessName(type: string): string {
    return type
      .split("_")
      .map((word) => word[0] + word.slice(1).toLowerCase())
      .join(" ");
  }

  async startProcess(processId: string): Promise<void> {
    const process = this.processes.get(processId);
    if (!process) {
      throw new Error(`Unknown process: ${processId}`);
    }

    if (process.status === ProcessStatus.RUNNING) {
      throw new Error(`Process ${processId} is already running`);
    }

    // Validate dependencies
    const processConfig = this.config.processTypes[process.type as ProcessType];
    const missingDependencies = processConfig.dependencies.filter(
      (dep) => this.processes.get(dep)?.status !== ProcessStatus.RUNNING,
    );

    if (missingDependencies.length > 0) {
      throw new Error(
        `Missing dependencies for ${processId}: ${missingDependencies.join(", ")}`,
      );
    }

    this.updateProcessStatus(processId, ProcessStatus.STARTING);

    try {
      // Simulated process start - in real implementation, this would start actual processes
      process.startTime = Date.now();
      process.pid = process.id.charCodeAt(0); // Simulated PID

      this.updateProcessStatus(processId, ProcessStatus.RUNNING);
      this.emit("processStarted", { processId, process });
    } catch (error) {
      this.updateProcessStatus(processId, ProcessStatus.ERROR);
      process.metrics = {
        ...process.metrics,
        lastError: (error as Error).message,
      };
      this.emit("processError", { processId, error });
      throw error;
    }
  }

  async stopProcess(processId: string): Promise<void> {
    const process = this.processes.get(processId);
    if (!process || process.status !== ProcessStatus.RUNNING) {
      throw new Error(`Process ${processId} is not running`);
    }

    // Check if any running processes depend on this one
    const dependentProcesses = Array.from(this.processes.values()).filter(
      (p) =>
        this.config.processTypes[p.type as ProcessType].dependencies.includes(
          process.type as ProcessType,
        ) && p.status === ProcessStatus.RUNNING,
    );

    if (dependentProcesses.length > 0) {
      throw new Error(
        `Cannot stop ${processId}, dependent processes are running: ${dependentProcesses.map((p) => p.id).join(", ")}`,
      );
    }

    this.updateProcessStatus(processId, ProcessStatus.STOPPING);

    try {
      // Simulated process stop
      this.updateProcessStatus(processId, ProcessStatus.STOPPED);
      this.emit("processStopped", { processId });
    } catch (error) {
      this.updateProcessStatus(processId, ProcessStatus.ERROR);
      this.emit("processError", { processId, error });
      throw error;
    }
  }

  async restartProcess(processId: string): Promise<void> {
    await this.stopProcess(processId);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief delay
    await this.startProcess(processId);
  }

  async startAll(): Promise<void> {
    // Start in dependency order
    const startOrder = Object.values(ProcessType);

    for (const processId of startOrder) {
      try {
        await this.startProcess(processId);
      } catch (error) {
        console.error(
          `Failed to start ${processId}:`,
          (error as Error).message,
        );
        // Continue with other processes
      }
    }
  }

  async stopAll(): Promise<void> {
    // Stop in reverse dependency order
    const stopOrder = Object.values(ProcessType).reverse();

    for (const processId of stopOrder) {
      const process = this.processes.get(processId);
      if (process && process.status === ProcessStatus.RUNNING) {
        try {
          await this.stopProcess(processId);
        } catch (error) {
          console.error(
            `Failed to stop ${processId}:`,
            (error as Error).message,
          );
        }
      }
    }
  }

  getProcess(processId: string): ProcessInfo | undefined {
    return this.processes.get(processId);
  }

  getAllProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  getSystemStats(): SystemStats {
    const processes = this.getAllProcesses();
    const runningProcesses = processes.filter(
      (p) => p.status === ProcessStatus.RUNNING,
    );
    const stoppedProcesses = processes.filter(
      (p) => p.status === ProcessStatus.STOPPED,
    );
    const errorProcesses = processes.filter(
      (p) => p.status === ProcessStatus.ERROR,
    );

    return {
      totalProcesses: processes.length,
      runningProcesses: runningProcesses.length,
      stoppedProcesses: stoppedProcesses.length,
      errorProcesses: errorProcesses.length,
      systemUptime: this.getSystemUptime(),
      totalMemory: this.getTotalMemoryUsage(),
      totalCpu: this.getTotalCpuUsage(),
    };
  }

  private updateProcessStatus(processId: string, status: ProcessStatus): void {
    const process = this.processes.get(processId);
    if (process) {
      process.status = status;
      this.emit("statusChanged", { processId, status });
    }
  }

  private getSystemUptime(): number {
    const firstRunningProcess = Array.from(this.processes.values()).find(
      (p) => p.status === ProcessStatus.RUNNING && p.startTime,
    );

    return firstRunningProcess && firstRunningProcess.startTime
      ? Date.now() - firstRunningProcess.startTime
      : 0;
  }

  private getTotalMemoryUsage(): number {
    // Placeholder for actual memory monitoring
    return 0;
  }

  private getTotalCpuUsage(): number {
    // Placeholder for actual CPU monitoring
    return 0;
  }

  async getProcessLogs(
    processId: string,
    lines: number = 50,
  ): Promise<string[]> {
    // Placeholder for actual logging system
    return [
      `[${new Date().toISOString()}] Process ${processId} started`,
      `[${new Date().toISOString()}] Process ${processId} is running normally`,
    ];
  }
}
