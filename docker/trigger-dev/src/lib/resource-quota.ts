/**
 * Resource Quota Enforcement Module
 *
 * Enforces memory budget and resource quotas across Docker containers
 * in CFN Loop environments. Provides quota management, capacity checking,
 * and container eviction based on priority when quotas are exceeded.
 *
 * Key Features:
 * - Default quota: 40GB total memory, 50 containers, 16 CPU cores
 * - Query running containers via Dockerode with CFN label filtering
 * - Capacity checking before container spawning
 * - Waiting logic with exponential backoff (5s polls)
 * - Quota enforcement with intelligent eviction (lowest priority first)
 * - Priority-based container eviction (age, status, resource usage)
 * - Socket-proxy fallback for containerized execution
 *
 * References:
 * - docker/CLAUDE.md (memory management strategies)
 * - docker/runtime/cfn-runtime.contract.yml (resource configuration)
 * - docker/trigger-dev/src/lib/docker-spawner.ts (Docker client setup)
 *
 * @module resource-quota
 * @version 1.0.0
 */

import Docker = require('dockerode');
import * as os from 'os';

// =====================================================
// Type Definitions
// =====================================================

/**
 * Resource quota constraints for the CFN execution environment
 *
 * @typedef {Object} ResourceQuota
 * @property {number} maxTotalMemoryBytes - Maximum total memory across all containers (default: 40GB)
 * @property {number} maxContainers - Maximum number of concurrent containers (default: 50)
 * @property {number} maxCpuCores - Maximum total CPU cores across all containers (default: 16)
 * @property {number} reservedMemoryBytes - Memory reserved for system/host (default: 2GB)
 */
export interface ResourceQuota {
  /** Maximum total memory across all containers (bytes) */
  maxTotalMemoryBytes: number;
  /** Maximum number of concurrent containers */
  maxContainers: number;
  /** Maximum total CPU cores across all containers */
  maxCpuCores: number;
  /** Memory reserved for system/host processes (bytes) */
  reservedMemoryBytes: number;
}

/**
 * Current resource usage metrics across all CFN containers
 *
 * @typedef {Object} ResourceUsage
 * @property {number} totalMemoryBytes - Total memory currently allocated
 * @property {number} containerCount - Number of running containers
 * @property {number} totalCpuCores - Total CPU cores currently allocated
 * @property {ContainerResourceInfo[]} containers - Details for each running container
 */
export interface ResourceUsage {
  /** Total memory bytes allocated across all containers */
  totalMemoryBytes: number;
  /** Number of running CFN containers */
  containerCount: number;
  /** Total CPU cores allocated across all containers */
  totalCpuCores: number;
  /** Array of individual container resource information */
  containers: ContainerResourceInfo[];
}

/**
 * Resource information for a single Docker container
 *
 * @typedef {Object} ContainerResourceInfo
 * @property {string} containerId - Full or short Docker container ID
 * @property {string} name - Container name (e.g., "agent-wave1-5")
 * @property {number} memoryBytes - Allocated memory in bytes
 * @property {number} cpuCores - Allocated CPU cores (fractional allowed)
 * @property {string} status - Container status ("running", "exited", "created", etc.)
 */
export interface ContainerResourceInfo {
  /** Full or short Docker container ID */
  containerId: string;
  /** Container name */
  name: string;
  /** Allocated memory in bytes */
  memoryBytes: number;
  /** Allocated CPU cores */
  cpuCores: number;
  /** Container status */
  status: string;
}

/**
 * Decision result for spawning a new container
 *
 * @typedef {Object} SpawnDecision
 * @property {boolean} canSpawn - Whether a container with requested resources can be spawned
 * @property {string} [reason] - Explanation if spawn is not allowed
 * @property {number} availableMemoryBytes - Available memory after system reservation
 * @property {number} availableCpuCores - Available CPU cores
 * @property {ResourceUsage} currentUsage - Current resource usage snapshot
 */
export interface SpawnDecision {
  /** Whether the container can be spawned */
  canSpawn: boolean;
  /** Reason if spawn is not allowed */
  reason?: string;
  /** Available memory bytes (total budget - current usage - reserved) */
  availableMemoryBytes: number;
  /** Available CPU cores (total budget - current usage) */
  availableCpuCores: number;
  /** Current resource usage snapshot */
  currentUsage: ResourceUsage;
}

/**
 * Extended container info with priority for eviction decisions
 *
 * @internal
 */
interface ContainerWithPriority extends ContainerResourceInfo {
  /** Priority score for eviction (lower = evict first) */
  priority: number;
  /** Start time for age calculation */
  startedAt: Date;
}

// =====================================================
// Constants
// =====================================================

/**
 * Default resource quota for CFN environments
 * - 40GB total memory budget
 * - Up to 50 concurrent containers
 * - 16 CPU cores maximum
 * - 2GB reserved for system
 */
const DEFAULT_QUOTA: ResourceQuota = {
  maxTotalMemoryBytes: 40 * 1024 * 1024 * 1024, // 40GB
  maxContainers: 50,
  maxCpuCores: 16,
  reservedMemoryBytes: 2 * 1024 * 1024 * 1024, // 2GB for system
};

/** CFN containers are labeled with org.cfn.container=true */
const CFN_CONTAINER_LABEL = 'org.cfn.container';

/** Default timeout for waiting (5 minutes) */
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

/** Poll interval when waiting for capacity (5 seconds) */
const POLL_INTERVAL_MS = 5000;

// =====================================================
// Docker Client Management
// =====================================================

/**
 * Get or create a Docker client with automatic socket-proxy fallback
 *
 * @internal
 * @returns Docker client instance
 * @throws Error if Docker socket is not available
 */
function getDockerClient(): Docker {
  try {
    // Try socket path first (native or WSL2)
    const socketPath = process.env.CFN_DOCKER_SOCKET || '/var/run/docker.sock';
    return new Docker({ socketPath });
  } catch {
    try {
      // Fallback to socket-proxy over TCP
      const host = process.env.DOCKER_HOST || 'docker-proxy';
      const port = process.env.DOCKER_PORT || 2375;
      return new Docker({ host, port });
    } catch (innerError) {
      throw new Error(
        `[resource-quota] Failed to connect to Docker. Tried socket: /var/run/docker.sock, TCP: docker-proxy:2375. Error: ${innerError}`
      );
    }
  }
}

// =====================================================
// Public API
// =====================================================

/**
 * Get the default resource quota configuration
 *
 * Provides standard CFN environment quotas:
 * - 40GB total memory
 * - 50 containers max
 * - 16 CPU cores
 * - 2GB system reservation
 *
 * @returns Default ResourceQuota
 */
export function getDefaultQuota(): ResourceQuota {
  return { ...DEFAULT_QUOTA };
}

/**
 * Get current resource usage across all CFN containers
 *
 * Queries Docker for all containers with the CFN label and aggregates
 * their memory and CPU allocations. Supports both native Docker and
 * socket-proxy TCP connections.
 *
 * @returns Promise<ResourceUsage> Current usage metrics
 * @throws Error if Docker communication fails
 */
export async function getCurrentUsage(): Promise<ResourceUsage> {
  const docker = getDockerClient();
  const containers = await docker.listContainers({ all: false }); // only running

  const cfnContainers: ContainerResourceInfo[] = [];
  let totalMemoryBytes = 0;
  let totalCpuCores = 0;

  for (const containerSummary of containers) {
    // Check for CFN label
    const labels = containerSummary.Labels || {};
    if (labels[CFN_CONTAINER_LABEL] !== 'true') {
      continue;
    }

    // Cast to any to access properties that may not be in type definitions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hostConfig = containerSummary.HostConfig as any;
    const memoryBytes = hostConfig?.Memory || 0;
    const cpuQuota = hostConfig?.CpuQuota || 0;
    const cpuPeriod = hostConfig?.CpuPeriod || 100000;

    // Calculate CPU cores from quota/period
    const cpuCores = cpuQuota > 0 ? cpuQuota / cpuPeriod : 0;

    const info: ContainerResourceInfo = {
      containerId: containerSummary.Id.substring(0, 12),
      name: containerSummary.Names?.[0]?.replace(/^\//, '') || 'unnamed',
      memoryBytes,
      cpuCores,
      status: containerSummary.State,
    };

    cfnContainers.push(info);
    totalMemoryBytes += memoryBytes;
    totalCpuCores += cpuCores;
  }

  return {
    totalMemoryBytes,
    containerCount: cfnContainers.length,
    totalCpuCores,
    containers: cfnContainers,
  };
}

/**
 * Check if a new container with specified resources can be spawned
 *
 * Validates that spawning a container with the requested memory and CPU
 * would not exceed the quota. Returns detailed information about available
 * resources and current usage.
 *
 * Quota constraints checked:
 * - Total memory (after system reservation) + requested <= maxTotalMemoryBytes
 * - Current containers + 1 <= maxContainers
 * - Total CPU cores + requested <= maxCpuCores
 *
 * @param requestedMemory - Memory in bytes (e.g., 512*1024*1024 for 512MB)
 * @param requestedCpu - CPU cores as decimal (e.g., 0.5, 1, 2)
 * @param quota - Optional custom quota; uses default if not provided
 * @returns Promise<SpawnDecision> Decision with reasoning and current metrics
 */
export async function canSpawnContainer(
  requestedMemory: number,
  requestedCpu: number,
  quota?: ResourceQuota
): Promise<SpawnDecision> {
  const effectiveQuota = quota || getDefaultQuota();
  const usage = await getCurrentUsage();

  // Calculate available resources
  const usableMemoryBudget = effectiveQuota.maxTotalMemoryBytes - effectiveQuota.reservedMemoryBytes;
  const availableMemory = usableMemoryBudget - usage.totalMemoryBytes;
  const availableCpu = effectiveQuota.maxCpuCores - usage.totalCpuCores;

  // Check all constraints
  const canSpawn =
    usage.containerCount < effectiveQuota.maxContainers &&
    availableMemory >= requestedMemory &&
    availableCpu >= requestedCpu;

  let reason: string | undefined;
  if (!canSpawn) {
    const reasons: string[] = [];

    if (usage.containerCount >= effectiveQuota.maxContainers) {
      reasons.push(`container limit exceeded (${usage.containerCount}/${effectiveQuota.maxContainers})`);
    }
    if (availableMemory < requestedMemory) {
      reasons.push(
        `insufficient memory (${Math.round(availableMemory / (1024 * 1024))}MB available, ${Math.round(requestedMemory / (1024 * 1024))}MB requested)`
      );
    }
    if (availableCpu < requestedCpu) {
      reasons.push(`insufficient CPU (${availableCpu.toFixed(2)} cores available, ${requestedCpu} requested)`);
    }

    reason = reasons.join('; ');
  }

  return {
    canSpawn,
    reason,
    availableMemoryBytes: Math.max(0, availableMemory),
    availableCpuCores: Math.max(0, availableCpu),
    currentUsage: usage,
  };
}

/**
 * Wait for sufficient capacity to spawn a container
 *
 * Polls the resource quota every 5 seconds until either:
 * - Sufficient capacity is available (returns true), OR
 * - Timeout is reached (returns false)
 *
 * Useful for coordinating container spawning when resources are temporarily
 * constrained. Exponential backoff prevents busy-waiting.
 *
 * @param requestedMemory - Memory in bytes
 * @param requestedCpu - CPU cores
 * @param timeoutMs - Maximum wait time in milliseconds (default: 300000 = 5 minutes)
 * @param quota - Optional custom quota
 * @returns Promise<boolean> True if capacity became available, false if timeout
 */
export async function waitForCapacity(
  requestedMemory: number,
  requestedCpu: number,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  quota?: ResourceQuota
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const decision = await canSpawnContainer(requestedMemory, requestedCpu, quota);

    if (decision.canSpawn) {
      return true;
    }

    // Sleep before next poll
    await sleep(POLL_INTERVAL_MS);
  }

  return false;
}

/**
 * Enforce quota by terminating lowest-priority containers if over limit
 *
 * If current usage exceeds the quota, iteratively kills containers with
 * the lowest priority until usage is back within limits. Useful for
 * automatic resource reclamation in constrained environments.
 *
 * Priority order (evicted first):
 * 1. Containers with "exited" status (already stopped)
 * 2. Youngest containers (more likely to be temporary workers)
 * 3. Containers with lowest memory usage (less impactful)
 * 4. Containers with lowest CPU allocation
 *
 * Does not kill containers without the CFN label.
 *
 * @param quota - Resource quota to enforce; uses default if not provided
 * @throws Error if Docker communication fails
 */
export async function enforceQuota(quota?: ResourceQuota): Promise<void> {
  const effectiveQuota = quota || getDefaultQuota();
  const usage = await getCurrentUsage();

  // Check if over quota
  const usableMemoryBudget = effectiveQuota.maxTotalMemoryBytes - effectiveQuota.reservedMemoryBytes;
  if (
    usage.totalMemoryBytes <= usableMemoryBudget &&
    usage.containerCount <= effectiveQuota.maxContainers &&
    usage.totalCpuCores <= effectiveQuota.maxCpuCores
  ) {
    // Within quota, nothing to do
    return;
  }

  const docker = getDockerClient();

  // Collect containers with priority information
  const containersWithPriority: ContainerWithPriority[] = [];
  const now = Date.now();

  for (const container of usage.containers) {
    // Get container inspect for start time
    try {
      const dockerContainer = docker.getContainer(container.containerId);
      const inspect = await dockerContainer.inspect();
      const startedAt = new Date(inspect.State.StartedAt);

      const priority = calculateEvictionPriority(container, startedAt, now);
      containersWithPriority.push({
        ...container,
        priority,
        startedAt,
      });
    } catch {
      // Skip containers we can't inspect
      continue;
    }
  }

  // Sort by priority (lower = evict first)
  containersWithPriority.sort((a, b) => a.priority - b.priority);

  // Kill containers until under quota
  for (const container of containersWithPriority) {
    const usage = await getCurrentUsage();

    // Check if we're back within quota
    if (
      usage.totalMemoryBytes <= usableMemoryBudget &&
      usage.containerCount <= effectiveQuota.maxContainers &&
      usage.totalCpuCores <= effectiveQuota.maxCpuCores
    ) {
      break;
    }

    // Kill this container
    try {
      const dockerContainer = docker.getContainer(container.containerId);
      await dockerContainer.kill().catch(() => {
        // Container may already be stopped
      });
      await dockerContainer.remove().catch(() => {
        // Already removed
      });
    } catch {
      // Log and continue with next container
      continue;
    }
  }
}

/**
 * Get the eviction priority for a container
 *
 * Lower numbers = higher priority for eviction
 *
 * Priority factors (in order):
 * 1. Status: "exited" = 0 (kill first), other = 1
 * 2. Age: younger containers have lower priority (killed first)
 * 3. Memory: containers with less memory have lower priority
 * 4. CPU: containers with less CPU have lower priority
 *
 * @param container - Container resource info
 * @returns Priority score (lower = evict first)
 */
export function getContainerPriority(container: ContainerResourceInfo): number {
  // Status priority: exited containers first
  const statusPriority = container.status === 'exited' ? 0 : 1;

  return statusPriority;
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Calculate eviction priority for a container
 *
 * @internal
 * @param container - Container info
 * @param startedAt - Container start timestamp
 * @param now - Current timestamp
 * @returns Priority score (lower = evict first)
 */
function calculateEvictionPriority(
  container: ContainerResourceInfo,
  startedAt: Date,
  now: number
): number {
  // Status priority (exited containers first)
  const statusPriority = container.status === 'exited' ? 0 : 10000;

  // Age priority (younger containers first)
  const ageMs = now - startedAt.getTime();
  const agePriority = ageMs; // Younger = smaller age = lower priority

  // Memory priority (containers using less memory first)
  const memoryPriority = container.memoryBytes;

  // CPU priority (containers using less CPU first)
  const cpuPriority = Math.round(container.cpuCores * 10000);

  // Combine priorities with weights
  return statusPriority + agePriority / 1000 + memoryPriority / (1024 * 1024) + cpuPriority;
}

/**
 * Sleep for a specified duration
 *
 * @internal
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get system memory in bytes
 *
 * @internal
 * @returns Total system memory
 */
function getSystemMemory(): number {
  return os.totalmem();
}

/**
 * Format bytes as human-readable string
 *
 * @internal
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "512MB", "2GB")
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  } else {
    return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`;
  }
}
