/**
 * Environment Configuration and Validation
 *
 * Validates all required environment variables at startup and
 * provides a strongly-typed configuration object.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EnvironmentConfig,
  EnvironmentValidationError,
  VolumeValidationError,
  ValidatedEnvironment,
} from './types.js';

/**
 * Validate and load environment configuration
 *
 * @throws EnvironmentValidationError if any required variable is missing
 * @throws VolumeValidationError if workspace is not accessible
 */
export function validateEnvironment(): ValidatedEnvironment {
  const errors: string[] = [];

  // Required: TRIGGER_API_KEY
  const triggerApiKey = process.env.TRIGGER_API_KEY;
  if (!triggerApiKey) {
    errors.push('TRIGGER_API_KEY environment variable is required');
  }

  // Required: TRIGGER_PROJECT_SLUG
  const triggerProjectSlug = process.env.TRIGGER_PROJECT_SLUG;
  if (!triggerProjectSlug) {
    errors.push('TRIGGER_PROJECT_SLUG environment variable is required');
  }

  // Docker configuration: Either DOCKER_HOST or DOCKER_SOCKET must be set
  const dockerHost = process.env.DOCKER_HOST;
  const dockerSocket = process.env.DOCKER_SOCKET;

  if (!dockerHost && !dockerSocket) {
    errors.push(
      'Either DOCKER_HOST or DOCKER_SOCKET environment variable must be configured'
    );
  }

  // Workspace path validation
  const workspacePath = process.env.WORKSPACE_PATH || '/workspace';
  if (!validateWorkspacePath(workspacePath)) {
    errors.push(`WORKSPACE_PATH is not accessible or not writable: ${workspacePath}`);
  }

  // If there are validation errors, throw them all
  if (errors.length > 0) {
    throw new EnvironmentValidationError(errors);
  }

  // All validations passed
  const config: ValidatedEnvironment = {
    triggerApiKey: triggerApiKey!,
    triggerProjectSlug: triggerProjectSlug!,
    triggerApiUrl: process.env.TRIGGER_API_URL || 'http://localhost:3000',
    dockerHost: dockerHost || '',
    dockerSocket: dockerSocket || '',
    workspacePath: workspacePath,
    triggerOrgSlug: process.env.TRIGGER_ORG_SLUG || '',
    validated: true,
    validationTime: new Date(),
  };

  return config;
}

/**
 * Validate that workspace path exists and is writable
 */
function validateWorkspacePath(workspacePath: string): boolean {
  try {
    // Check if path exists
    if (!fs.existsSync(workspacePath)) {
      console.warn(`Workspace path does not exist: ${workspacePath}`);
      return false;
    }

    // Check if path is a directory
    const stats = fs.statSync(workspacePath);
    if (!stats.isDirectory()) {
      console.warn(`Workspace path is not a directory: ${workspacePath}`);
      return false;
    }

    // Check if we can write to the directory
    const testFile = path.join(workspacePath, `.test-write-${Date.now()}`);
    try {
      fs.writeFileSync(testFile, 'test', { flag: 'w' });
      fs.unlinkSync(testFile);
      return true;
    } catch (writeError) {
      console.warn(`Workspace path is not writable: ${workspacePath}`);
      return false;
    }
  } catch (error) {
    console.warn(`Error validating workspace path: ${error}`);
    return false;
  }
}

/**
 * Validate Docker configuration
 */
export function validateDockerConfig(config: ValidatedEnvironment): boolean {
  const { dockerHost, dockerSocket } = config;

  if (dockerHost) {
    // Validate DOCKER_HOST format (should be unix:// or tcp://)
    if (
      !dockerHost.startsWith('unix://') &&
      !dockerHost.startsWith('tcp://') &&
      !dockerHost.startsWith('ssh://')
    ) {
      console.warn(`Invalid DOCKER_HOST format: ${dockerHost}`);
      return false;
    }
    return true;
  }

  if (dockerSocket) {
    // Validate that socket file exists
    if (!fs.existsSync(dockerSocket)) {
      console.warn(`Docker socket not found: ${dockerSocket}`);
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Validate volume mount configuration
 */
export function validateVolumeMount(
  sourcePath: string,
  containerPath: string,
  mode: 'ro' | 'rw' = 'rw'
): { valid: boolean; error?: string } {
  // Check source path exists
  if (!fs.existsSync(sourcePath)) {
    return {
      valid: false,
      error: `Source path does not exist: ${sourcePath}`,
    };
  }

  // For read-write, check writeability
  if (mode === 'rw') {
    try {
      const testFile = path.join(sourcePath, `.test-rw-${Date.now()}`);
      fs.writeFileSync(testFile, 'test', { flag: 'w' });
      fs.unlinkSync(testFile);
    } catch (error) {
      return {
        valid: false,
        error: `Source path is not writable: ${sourcePath}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Create configured client with validated environment
 */
export function getConfiguredClient(config: ValidatedEnvironment) {
  const { TriggerClient } = require('@trigger.dev/sdk');

  return new TriggerClient({
    id: config.triggerProjectSlug,
    apiKey: config.triggerApiKey,
    apiUrl: config.triggerApiUrl,
  });
}

/**
 * Export validated environment as singleton
 */
let cachedConfig: ValidatedEnvironment | null = null;

export function getValidatedConfig(): ValidatedEnvironment {
  if (!cachedConfig) {
    cachedConfig = validateEnvironment();
  }
  return cachedConfig;
}

/**
 * Reset cached config (for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}
