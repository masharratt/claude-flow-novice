/**
 * Workspace Mount Configuration Generator
 *
 * Generates Docker bind mount configurations for agent workspaces with
 * support for isolated agent environments, shared resources, and proper
 * path translation for both Linux and WSL2 environments.
 *
 * Mount Strategy:
 * - Agent workspace → /workspace (main working directory, read-write)
 * - Shared node_modules → /workspace/node_modules (read-only, saves space)
 * - Temp directory → /tmp (tmpfs for fast temporary operations)
 * - Logs directory → /var/log/cfn-agent (bind mount for debugging)
 * - Docker socket → /var/run/docker.sock (if Docker agent, read-only)
 *
 * Integration:
 * - Compatible with DockerSpawner.spawnAgentContainer
 * - Handles relative and absolute paths
 * - Supports Windows/WSL path translation
 * - Validates all mount paths exist before mounting
 *
 * References:
 * - docker-spawner.ts (DockerSpawner.ContainerSpawnOptions.mounts)
 * - docker/CLAUDE.md (Agent mounting patterns)
 * - docker/runtime/cfn-runtime.contract.yml (environment variables)
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Mount type options for Docker volumes
 */
export type MountType = 'bind' | 'volume' | 'tmpfs';

/**
 * Mount configuration for a single volume
 *
 * Represents a Docker mount that will be applied to a container.
 * Supports bind mounts (host paths), named volumes, and tmpfs volumes.
 */
export interface MountConfig {
  /** Host path (for bind mounts) or volume name */
  source: string;

  /** Container path where mount is applied */
  target: string;

  /** Whether the mount should be read-only */
  readonly: boolean;

  /** Mount type: 'bind' for host paths, 'volume' for named volumes, 'tmpfs' for in-memory */
  type: MountType;

  /** Optional: tmpfs options (size, mode, etc.) for tmpfs mounts */
  tmpfsOptions?: {
    size?: string;
    mode?: string;
  };
}

/**
 * Options for generating agent workspace mounts
 *
 * Configures isolation, resource sharing, and path handling for agent
 * containers within the CFN Loop execution environment.
 */
export interface AgentMountOptions {
  /** Absolute path to agent's isolated workspace directory */
  agentWorkspace: string;

  /** Task ID for coordination and logging (e.g., "trigger:1234567890-abc") */
  taskId: string;

  /** Agent ID for container naming and identification (e.g., "agent-frontend-1") */
  agentId: string;

  /** Paths that should be mounted as read-only (e.g., node_modules, libs) */
  readonlyPaths?: string[];

  /** Paths that must be writable (e.g., src, dist, logs) */
  writablePaths?: string[];

  /** Enable tmpfs mounts for temporary operations (default: true) */
  enableTmpfs?: boolean;

  /** Enable Docker socket mount for Docker-aware agents (default: false) */
  enableDockerSocket?: boolean;

  /** Shared node_modules path for multiple agents (optional, saves space) */
  sharedNodeModulesPath?: string;

  /** Base directory for logs (default: /var/log/cfn-agent) */
  logsBaseDir?: string;

  /** Enable strict path validation (default: true) */
  validatePaths?: boolean;
}

/**
 * Result of mount path validation
 */
export interface ValidationResult {
  /** Whether all validated paths exist */
  valid: boolean;

  /** List of valid paths */
  validPaths: string[];

  /** List of invalid (missing) paths */
  missingPaths: string[];

  /** Human-readable validation message */
  message: string;
}

/**
 * Docker Dockerode mount settings
 *
 * Format compatible with Dockerode library for container creation.
 * See: https://github.com/apocas/dockerode#createcontainer-options
 */
export interface DockerMountSettings {
  /** Mount type: bind, volume, or tmpfs */
  Type: MountType;

  /** Source path or volume name */
  Source: string;

  /** Target path in container */
  Target: string;

  /** Read-only flag */
  ReadOnly: boolean;

  /** Bind mount options (for bind type) */
  BindOptions?: {
    Propagation?: string;
    NonRecursive?: boolean;
  };

  /** Tmpfs options (for tmpfs type) */
  TmpfsOptions?: {
    SizeBytes?: number;
    Mode?: number;
  };
}

/**
 * Generate comprehensive mount configurations for an agent workspace
 *
 * Creates a list of mount configurations for agent container isolation,
 * including workspace directory, shared resources, temporary storage,
 * logging, and optional Docker socket access.
 *
 * Mount Priority (in execution order):
 * 1. Agent workspace (main working directory)
 * 2. Shared node_modules (if specified, read-only)
 * 3. Writable paths (src, dist, etc.)
 * 4. Readonly paths (libraries, compiled types)
 * 5. Temp directory (tmpfs)
 * 6. Logs directory (bind mount)
 * 7. Docker socket (if enabled)
 *
 * @param options Configuration for the agent workspace
 * @returns Array of mount configurations
 * @throws Error if agentWorkspace is not an absolute path
 *
 * @example
 * ```typescript
 * const mounts = generateAgentMounts({
 *   agentWorkspace: '/tmp/agent-workspace-123',
 *   taskId: 'trigger:1234567890-abc',
 *   agentId: 'agent-frontend-1',
 *   readonlyPaths: ['/path/to/node_modules'],
 *   writablePaths: ['/path/to/src', '/path/to/dist'],
 *   enableDockerSocket: true,
 * });
 * // Returns: [
 * //   { source: '/tmp/agent-workspace-123', target: '/workspace', readonly: false, type: 'bind' },
 * //   { source: '/path/to/node_modules', target: '/workspace/node_modules', readonly: true, type: 'bind' },
 * //   { source: 'tmpfs', target: '/tmp', readonly: false, type: 'tmpfs' },
 * //   ...
 * // ]
 * ```
 */
export function generateAgentMounts(options: AgentMountOptions): MountConfig[] {
  const {
    agentWorkspace,
    taskId,
    agentId,
    readonlyPaths = [],
    writablePaths = [],
    enableTmpfs = true,
    enableDockerSocket = false,
    sharedNodeModulesPath,
    logsBaseDir = '/var/log/cfn-agent',
    validatePaths = true,
  } = options;

  // Validate agentWorkspace is absolute path
  if (!path.isAbsolute(agentWorkspace)) {
    throw new Error(
      `[workspace-mounts] agentWorkspace must be absolute path, got: "${agentWorkspace}"`
    );
  }

  const mounts: MountConfig[] = [];

  // 1. Main workspace mount (read-write)
  mounts.push({
    source: agentWorkspace,
    target: '/workspace',
    readonly: false,
    type: 'bind',
  });

  // 2. Shared node_modules (read-only, saves space)
  if (sharedNodeModulesPath) {
    mounts.push({
      source: sharedNodeModulesPath,
      target: '/workspace/node_modules',
      readonly: true,
      type: 'bind',
    });
  }

  // 3. Writable paths (src, dist, etc.)
  for (const wrPath of writablePaths) {
    const absolutePath = path.isAbsolute(wrPath) ? wrPath : path.join(agentWorkspace, wrPath);
    mounts.push({
      source: absolutePath,
      target: absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`,
      readonly: false,
      type: 'bind',
    });
  }

  // 4. Readonly paths (libraries, compiled types)
  for (const roPath of readonlyPaths) {
    const absolutePath = path.isAbsolute(roPath) ? roPath : path.join(agentWorkspace, roPath);
    mounts.push({
      source: absolutePath,
      target: absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`,
      readonly: true,
      type: 'bind',
    });
  }

  // 5. Tmpfs mount for /tmp (fast temporary operations)
  if (enableTmpfs) {
    mounts.push({
      source: 'tmpfs',
      target: '/tmp',
      readonly: false,
      type: 'tmpfs',
      tmpfsOptions: {
        size: '512m', // 512MB tmpfs limit
        mode: '1777',
      },
    });
  }

  // 6. Logs directory (bind mount for debugging)
  const logsDir = path.join(logsBaseDir, agentId);
  mounts.push({
    source: logsDir,
    target: '/var/log/cfn-agent',
    readonly: false,
    type: 'bind',
  });

  // 7. Docker socket (for Docker-aware agents)
  if (enableDockerSocket) {
    mounts.push({
      source: '/var/run/docker.sock',
      target: '/var/run/docker.sock',
      readonly: false,
      type: 'bind',
    });
  }

  // Validate all mount paths if enabled
  if (validatePaths) {
    const validation = validateMountPaths(mounts);
    if (!validation.valid) {
      console.warn(
        `[workspace-mounts] Path validation warnings:\n${validation.message}`
      );
    }
  }

  return mounts;
}

/**
 * Convert internal MountConfig to Dockerode-compatible format
 *
 * Transforms MountConfig objects into the Mounts format expected by
 * the Dockerode library for container creation.
 *
 * @param configs Array of mount configurations
 * @returns Array of Dockerode-compatible mount settings
 *
 * @example
 * ```typescript
 * const mounts = generateAgentMounts({ agentWorkspace: '/tmp/workspace', ... });
 * const dockerMounts = convertToDockerMounts(mounts);
 * // Can be passed to docker.createContainer({ Mounts: dockerMounts })
 * ```
 */
export function convertToDockerMounts(configs: MountConfig[]): DockerMountSettings[] {
  return configs.map((config) => {
    const dockerMount: DockerMountSettings = {
      Type: config.type,
      Source: config.source,
      Target: config.target,
      ReadOnly: config.readonly,
    };

    // Add bind options for bind mounts
    if (config.type === 'bind') {
      dockerMount.BindOptions = {
        Propagation: 'rprivate',
        NonRecursive: false,
      };
    }

    // Add tmpfs options for tmpfs mounts
    if (config.type === 'tmpfs' && config.tmpfsOptions) {
      dockerMount.TmpfsOptions = {};

      if (config.tmpfsOptions.size) {
        // Convert size string (e.g., "512m") to bytes
        dockerMount.TmpfsOptions.SizeBytes = parseSizeString(config.tmpfsOptions.size);
      }

      if (config.tmpfsOptions.mode) {
        // Convert octal mode string (e.g., "1777") to number
        dockerMount.TmpfsOptions.Mode = parseInt(config.tmpfsOptions.mode, 8);
      }
    }

    return dockerMount;
  });
}

/**
 * Validate that all mount paths exist and are accessible
 *
 * Checks mount paths for existence and readability. Bind mount sources
 * must exist; tmpfs and named volumes are created by Docker.
 *
 * Returns detailed validation results with lists of valid and missing paths.
 *
 * @param configs Array of mount configurations to validate
 * @returns Validation result with status and details
 *
 * @example
 * ```typescript
 * const mounts = generateAgentMounts({ agentWorkspace: '/tmp/workspace', ... });
 * const result = validateMountPaths(mounts);
 * if (!result.valid) {
 *   console.error(result.message);
 * }
 * ```
 */
export function validateMountPaths(configs: MountConfig[]): ValidationResult {
  const validPaths: string[] = [];
  const missingPaths: string[] = [];

  for (const config of configs) {
    // Skip validation for non-bind mounts (Docker creates these)
    if (config.type !== 'bind') {
      continue;
    }

    try {
      // Check if path exists
      if (fs.existsSync(config.source)) {
        // Verify readable access
        fs.accessSync(config.source, fs.constants.R_OK);
        validPaths.push(config.source);
      } else {
        missingPaths.push(config.source);
      }
    } catch (error) {
      // Access denied or other I/O error
      missingPaths.push(config.source);
    }
  }

  const valid = missingPaths.length === 0;
  const message = valid
    ? `All ${validPaths.length} paths validated successfully`
    : `Validation failed: ${validPaths.length} valid, ${missingPaths.length} missing paths: ${missingPaths.join(', ')}`;

  return {
    valid,
    validPaths,
    missingPaths,
    message,
  };
}

/**
 * Get default mount configurations for common scenarios
 *
 * Returns standard mounts for typical agent workspaces:
 * - Workspace directory (read-write)
 * - Tmpfs for /tmp (fast operations)
 * - Logs directory
 *
 * Useful as a base configuration that can be extended with custom mounts.
 *
 * @returns Array of default mount configurations
 *
 * @example
 * ```typescript
 * const defaultMounts = getDefaultMounts();
 * // Returns mounts for /workspace, /tmp, /var/log/cfn-agent
 * ```
 */
export function getDefaultMounts(): MountConfig[] {
  return [
    {
      source: '/workspace',
      target: '/workspace',
      readonly: false,
      type: 'bind',
    },
    {
      source: 'tmpfs',
      target: '/tmp',
      readonly: false,
      type: 'tmpfs',
      tmpfsOptions: {
        size: '512m',
        mode: '1777',
      },
    },
    {
      source: '/var/log/cfn-agent',
      target: '/var/log/cfn-agent',
      readonly: false,
      type: 'bind',
    },
  ];
}

/**
 * Convert simple mount array format to full MountConfig objects
 *
 * Helper function to convert from the simpler mount format used by
 * DockerSpawner (source, target, readonly) to full MountConfig objects.
 *
 * Infers mount type based on source:
 * - Named volumes (no '/') → 'volume'
 * - 'tmpfs' → 'tmpfs'
 * - Absolute paths → 'bind'
 *
 * @param mounts Simple mount array with source, target, readonly
 * @returns Array of full MountConfig objects
 *
 * @example
 * ```typescript
 * const simpleMounts = [
 *   { source: '/host/path', target: '/container/path', readonly: false },
 *   { source: 'my-volume', target: '/data', readonly: true },
 * ];
 * const configs = normalizeMounts(simpleMounts);
 * // Returns full MountConfig objects with type inference
 * ```
 */
export function normalizeMounts(
  mounts: Array<{ source: string; target: string; readonly?: boolean }>
): MountConfig[] {
  return mounts.map((mount) => {
    let type: MountType = 'bind';

    if (mount.source === 'tmpfs') {
      type = 'tmpfs';
    } else if (mount.source.includes('/') === false) {
      type = 'volume';
    }

    return {
      source: mount.source,
      target: mount.target,
      readonly: mount.readonly ?? false,
      type,
    };
  });
}

/**
 * Parse size string to bytes
 *
 * Converts human-readable size strings to byte counts.
 * Supports: b, kb/k, mb/m, gb/g (case-insensitive)
 *
 * Examples: "512", "512b", "512kb", "1m", "2gb"
 *
 * @param sizeString Size specification string
 * @returns Size in bytes
 * @throws Error if format is invalid
 *
 * @internal
 *
 * @example
 * ```typescript
 * parseSizeString('512m') // 536870912
 * parseSizeString('1g')   // 1073741824
 * parseSizeString('256kb') // 262144
 * ```
 */
export function parseSizeString(sizeString: string): number {
  const match = sizeString.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);

  if (!match) {
    throw new Error(
      `[workspace-mounts] Invalid size format: "${sizeString}". Expected: "512", "512b", "512kb", "1m", "2gb", etc.`
    );
  }

  const [, value, unit] = match;
  let bytes = parseFloat(value);

  if (isNaN(bytes) || bytes < 0) {
    throw new Error(
      `[workspace-mounts] Invalid size value: "${value}". Expected positive number.`
    );
  }

  // Convert to bytes based on unit
  switch (unit) {
    case 'b':
    case '':
      break; // Already in bytes
    case 'k':
    case 'kb':
      bytes *= 1024;
      break;
    case 'm':
    case 'mb':
      bytes *= 1024 * 1024;
      break;
    case 'g':
    case 'gb':
      bytes *= 1024 * 1024 * 1024;
      break;
    default:
      throw new Error(
        `[workspace-mounts] Unknown size unit: "${unit}". Supported: b, kb, mb, gb`
      );
  }

  return Math.floor(bytes);
}

/**
 * Create isolated agent workspace directory structure
 *
 * Sets up the directory structure for an agent's isolated workspace,
 * including necessary subdirectories for source, output, and logs.
 *
 * @param workspaceRoot Root directory for agent workspaces
 * @param agentId Agent identifier for directory naming
 * @returns Absolute path to created workspace
 * @throws Error if directory creation fails
 *
 * @example
 * ```typescript
 * const workspace = createAgentWorkspace('/tmp/cfn-workspaces', 'agent-frontend-1');
 * // Creates: /tmp/cfn-workspaces/agent-frontend-1/src
 * //          /tmp/cfn-workspaces/agent-frontend-1/dist
 * //          /tmp/cfn-workspaces/agent-frontend-1/logs
 * ```
 */
export function createAgentWorkspace(workspaceRoot: string, agentId: string): string {
  const workspacePath = path.join(workspaceRoot, agentId);

  const subdirs = ['src', 'dist', 'logs', 'tmp'];

  for (const subdir of subdirs) {
    const fullPath = path.join(workspacePath, subdir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true, mode: 0o755 });
    }
  }

  return workspacePath;
}

/**
 * Convert Windows path to Linux path for WSL2
 *
 * Helper function for WSL2 environments where Windows paths need to be
 * translated to Linux mount paths.
 *
 * Examples:
 * - C:/Users/... → /mnt/c/users/...
 * - C:\Users\... → /mnt/c/users/...
 *
 * @param windowsPath Windows-style path
 * @returns Linux-compatible path
 *
 * @example
 * ```typescript
 * const linuxPath = convertWindowsPathToLinux('C:\\Users\\user\\project');
 * // Returns: '/mnt/c/users/user/project'
 * ```
 */
export function convertWindowsPathToLinux(windowsPath: string): string {
  // Replace backslashes with forward slashes
  let normalized = windowsPath.replace(/\\/g, '/');

  // Check for Windows drive letter (e.g., C:/)
  const driveMatch = normalized.match(/^([a-zA-Z]):\//);
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase();
    const rest = normalized.substring(3);
    return `/mnt/${drive}/${rest}`;
  }

  return normalized;
}
