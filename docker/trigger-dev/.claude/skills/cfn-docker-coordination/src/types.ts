/**
 * Docker Coordination Types and Interfaces
 * Type-safe definitions for Docker container management
 */

/**
 * Container health status enumeration
 */
export enum ContainerHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  STARTING = 'starting',
  UNKNOWN = 'unknown'
}

/**
 * Container execution status enumeration
 */
export enum ContainerStatus {
  RUNNING = 'running',
  EXITED = 'exited',
  FAILED = 'failed',
  UNKNOWN = 'unknown'
}

/**
 * Container exit status enumeration
 */
export enum ExitStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  TIMEOUT = 'timeout'
}

/**
 * Memory limit tiers for container resource constraints
 */
export enum MemoryTier {
  SMALL = 512,      // 512 MB
  MEDIUM = 1024,    // 1 GB
  LARGE = 2048,     // 2 GB
  XLARGE = 4096     // 4 GB
}

/**
 * Container options for creation and configuration
 */
export interface ContainerOptions {
  /** Agent type identifier */
  agentType: string;

  /** Task ID for coordination */
  taskId: string;

  /** Agent ID for identification */
  agentId: string;

  /** Memory limit in MB */
  memoryLimit: number;

  /** CPU limit (0.5 = half a core) */
  cpuLimit?: number;

  /** Environment variables to inject */
  env?: Record<string, string>;

  /** Volume mounts as map of host:container */
  volumes?: Record<string, string>;

  /** Network to connect to */
  network?: string;

  /** Container name override */
  name?: string;

  /** Working directory in container */
  workdir?: string;

  /** Container restart policy */
  restartPolicy?: RestartPolicy;

  /** Container health check configuration */
  healthCheck?: HealthCheckConfig;
}

/**
 * Docker restart policy configuration
 */
export interface RestartPolicy {
  /** Restart policy name */
  Name: 'no' | 'always' | 'on-failure' | 'unless-stopped';

  /** Maximum retry count for on-failure policy */
  MaximumRetryCount?: number;
}

/**
 * Container health check configuration
 */
export interface HealthCheckConfig {
  /** Health check command */
  Test: string[];

  /** Interval between checks in seconds */
  Interval: number;

  /** Timeout per check in seconds */
  Timeout: number;

  /** Number of consecutive failures to mark unhealthy */
  Retries: number;

  /** Delay before starting checks in seconds */
  StartPeriod?: number;
}

/**
 * Container state information
 */
export interface ContainerState {
  /** Container ID */
  id: string;

  /** Container name */
  name: string;

  /** Current status */
  status: ContainerStatus;

  /** Exit code (if exited) */
  exitCode?: number;

  /** Exit status string */
  exitStatus?: ExitStatus;

  /** Whether container is running */
  isRunning: boolean;

  /** Timestamp when container started */
  startedAt?: Date;

  /** Timestamp when container finished */
  finishedAt?: Date;

  /** Health status */
  healthStatus?: ContainerHealthStatus;

  /** Memory usage in bytes */
  memoryUsage?: number;

  /** CPU usage percentage */
  cpuUsage?: number;
}

/**
 * Container manifest for tracking and monitoring
 */
export interface ContainerManifest {
  /** Unique container ID */
  container_id: string;

  /** Batch ID for grouping */
  batch_id: string;

  /** Resource tier */
  tier: number;

  /** Memory limit string (e.g., "1g") */
  memory_limit: string;

  /** Current status */
  status: 'running' | 'exited';

  /** ISO 8601 start timestamp */
  started_at: string;

  /** Exit code (populated on exit) */
  exit_code?: number;

  /** Exit status (success/failed/timeout) */
  exit_status?: ExitStatus;

  /** ISO 8601 finish timestamp */
  finished_at?: string;
}

/**
 * Network configuration and management
 */
export interface NetworkInfo {
  /** Network name */
  name: string;

  /** Network ID */
  id: string;

  /** Driver type */
  driver: string;

  /** Network CIDR range */
  ipam?: IpamConfig;

  /** Connected container IDs */
  containers: string[];
}

/**
 * IPAM (IP Address Management) configuration
 */
export interface IpamConfig {
  /** IPAM driver */
  Driver: string;

  /** Subnet configuration */
  Config: IpamSubnet[];
}

/**
 * IPAM subnet definition
 */
export interface IpamSubnet {
  /** Subnet CIDR */
  Subnet: string;

  /** Gateway IP */
  Gateway?: string;

  /** IP range */
  IPRange?: string;

  /** Aux addresses */
  AuxAddresses?: Record<string, string>;
}

/**
 * Volume configuration and metadata
 */
export interface VolumeInfo {
  /** Volume name */
  name: string;

  /** Volume driver */
  driver: string;

  /** Mount point on host */
  mountpoint: string;

  /** Volume labels */
  labels?: Record<string, string>;

  /** Whether volume is dangling */
  dangling?: boolean;

  /** Volume size estimate in bytes */
  size?: number;
}

/**
 * Docker resource usage metrics
 */
export interface ResourceMetrics {
  /** Container ID */
  containerId: string;

  /** CPU percentage (0-100) */
  cpuPercent: number;

  /** Memory usage in bytes */
  memoryUsage: number;

  /** Memory limit in bytes */
  memoryLimit: number;

  /** Network input bytes */
  networkInput: number;

  /** Network output bytes */
  networkOutput: number;

  /** Disk read bytes */
  blockInput: number;

  /** Disk write bytes */
  blockOutput: number;

  /** Process ID */
  pid: number;
}

/**
 * Execution summary with metrics
 */
export interface ExecutionSummary {
  /** Wave/batch number */
  wave_number: number;

  /** ISO 8601 timestamp */
  summary_time: string;

  /** Execution metrics */
  metrics: {
    /** Total containers */
    total: number;

    /** Successfully completed */
    success: number;

    /** Failed containers */
    failed: number;

    /** Timeout containers */
    timeout: number;
  };
}

/**
 * Memory size representation with unit
 */
export interface MemorySize {
  /** Numeric value */
  value: number;

  /** Unit suffix (B, KB, MB, GB) */
  unit: 'B' | 'KB' | 'MB' | 'GB';

  /** Total bytes */
  bytes: number;
}

/**
 * Environment variable with validation
 */
export interface EnvironmentVariable {
  /** Variable name */
  name: string;

  /** Variable value */
  value: string;

  /** Whether value is sanitized */
  sanitized: boolean;
}

/**
 * Docker error with context
 */
export class DockerError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'DockerError';
  }
}

/**
 * Container timeout error
 */
export class ContainerTimeoutError extends DockerError {
  constructor(
    containerId: string,
    timeoutMs: number
  ) {
    super(
      `Container ${containerId} exceeded timeout of ${timeoutMs}ms`,
      'CONTAINER_TIMEOUT'
    );
    this.name = 'ContainerTimeoutError';
  }
}

/**
 * Container health check error
 */
export class ContainerHealthCheckError extends DockerError {
  constructor(
    containerId: string,
    reason: string
  ) {
    super(
      `Health check failed for container ${containerId}: ${reason}`,
      'HEALTH_CHECK_FAILED'
    );
    this.name = 'ContainerHealthCheckError';
  }
}

/**
 * Network operation error
 */
export class NetworkError extends DockerError {
  constructor(message: string, originalError?: Error) {
    super(message, 'NETWORK_ERROR', originalError);
    this.name = 'NetworkError';
  }
}

/**
 * Validation error for environment or configuration
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Error message if invalid */
  error?: string;

  /** Sanitized/corrected value */
  value?: string;
}
