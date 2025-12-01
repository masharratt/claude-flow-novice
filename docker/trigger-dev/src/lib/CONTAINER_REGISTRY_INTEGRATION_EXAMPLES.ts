/**
 * Container Registry Module - Integration Examples
 *
 * This file demonstrates how to integrate the container-registry module
 * into CFN Loop agent orchestration and Docker container management.
 *
 * All examples are TypeScript with proper error handling.
 */

import {
  getImageForAgentType,
  getImagesForAgentTypes,
  getRegistryUrl,
  isImageAvailable,
  checkImagesAvailable,
  pullImage,
  pullImages,
  validateImagePath,
  validateRegistry,
  getRegistrySummary,
  AGENT_IMAGE_MAP,
  RegistryConfig,
  ImageCheckResult,
  ImagePullResult,
} from './container-registry.js';

// =============================================
// Example 1: Application Startup
// =============================================

/**
 * Initialize application with registry validation
 * Run this during application startup to ensure registry is ready
 */
export async function initializeApplication(): Promise<void> {
  console.log('Starting application initialization...');

  // Step 1: Display registry configuration
  console.log(getRegistrySummary());

  // Step 2: Validate registry connectivity
  const validation = await validateRegistry();

  if (!validation.valid) {
    console.error('Registry validation failed:');
    validation.errors.forEach((err: string) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('✓ Registry ready');
}

// =============================================
// Example 2: Agent Image Selection
// =============================================

/**
 * Select appropriate image for an agent based on task type
 */
export function selectAgentImage(taskType: string): string {
  // Map task type to agent type
  const agentTypeMap: Record<string, string> = {
    'type-checking': 'typescript-specialist',
    'backend-api': 'backend-developer',
    'frontend-ui': 'react-frontend-engineer',
    'data-processing': 'python-developer',
    'infrastructure': 'docker-specialist',
  };

  const agentType = agentTypeMap[taskType] || 'default';

  // Resolve to full image path
  const image = getImageForAgentType(agentType);

  console.log(`Task: ${taskType} → Agent: ${agentType} → Image: ${image}`);

  return image;
}

// =============================================
// Example 3: Multi-Agent Image Resolution
// =============================================

/**
 * Get all unique images needed for a set of agents
 * Useful for pre-warming caches
 */
export async function prepareAgentImages(agentTypes: string[]): Promise<void> {
  console.log(`Preparing images for ${agentTypes.length} agent types...`);

  // Step 1: Get unique images
  const images = getImagesForAgentTypes(agentTypes);
  console.log(`Resolved to ${images.length} unique images`);

  // Step 2: Check availability
  console.log('Checking image availability...');
  const availabilityResults = await checkImagesAvailable(images);

  const available = availabilityResults.filter((r: ImageCheckResult) => r.available);
  const missing = availabilityResults.filter((r: ImageCheckResult) => !r.available);

  console.log(`✓ Available: ${available.length}`);
  if (missing.length > 0) {
    console.warn(`⚠ Missing: ${missing.length}`);
    missing.forEach((r: ImageCheckResult) => console.warn(`  - ${r.image}`));
  }

  // Step 3: Pre-pull available images
  if (available.length > 0) {
    console.log('Pre-pulling images...');
    const pullResults = await pullImages(images.filter((img: string) =>
      availabilityResults.find((r: ImageCheckResult) => r.image === img && r.available)
    ));

    pullResults.forEach((result: ImagePullResult) => {
      console.log(`${result.success ? '✓' : '✗'} ${result.image} (${result.method})`);
    });
  }
}

// =============================================
// Example 4: Docker Container Spawning
// =============================================

/**
 * Example of spawning a Docker container with resolved image
 * Uses dockerode library (not included in example)
 */
export async function spawnAgentContainer(
  agentType: string,
  taskId: string,
  workspaceDir: string,
): Promise<string> {
  // Step 1: Resolve image
  const image = getImageForAgentType(agentType);

  // Step 2: Validate image path
  const validation = validateImagePath(image);
  if (!validation.valid) {
    throw new Error(`Invalid image path: ${validation.errors[0]}`);
  }

  // Step 3: Check if image is available
  const availability = await isImageAvailable(image);
  if (!availability.available) {
    console.log(`Image not available locally, pulling: ${image}`);
    const pullResult = await pullImage(image);

    if (!pullResult.success) {
      throw new Error(`Failed to pull image: ${pullResult.error}`);
    }
  }

  // Step 4: (Hypothetical) Create and start container using Docker API
  console.log(`Spawning container:
    Agent Type: ${agentType}
    Image: ${image}
    Task ID: ${taskId}
    Workspace: ${workspaceDir}
  `);

  // In real implementation:
  // const container = await docker.createContainer({
  //   Image: image,
  //   name: `agent-${taskId}`,
  //   HostConfig: {
  //     Memory: 512 * 1024 * 1024, // 512MB
  //     Binds: [`${workspaceDir}:/workspace:rw`],
  //     NetworkMode: 'cfn-network'
  //   }
  // });
  // await container.start();
  // return container.id;

  const containerId = `container-${taskId}`;
  console.log(`✓ Container spawned: ${containerId}`);

  return containerId;
}

// =============================================
// Example 5: Coordinator Initialization
// =============================================

/**
 * Initialize CFN Loop coordinator with image management
 */
export async function initializeCoordinator(agentTypes: string[]): Promise<void> {
  console.log('Initializing CFN Loop Coordinator...');

  // Step 1: Validate registry
  const validation = await validateRegistry();
  if (!validation.valid) {
    throw new Error(`Registry validation failed: ${validation.errors.join(', ')}`);
  }

  // Step 2: Prepare all required agent images
  const images = getImagesForAgentTypes(agentTypes);
  console.log(`Required agent images: ${images.length}`);

  // Step 3: Check and pull images
  console.log('Checking and pulling agent images...');
  const pullResults = await pullImages(images);

  const successful = pullResults.filter((r: ImagePullResult) => r.success).length;
  const failed = pullResults.filter((r: ImagePullResult) => !r.success).length;

  console.log(`✓ Ready: ${successful}/${pullResults.length}`);

  if (failed > 0) {
    console.warn(`⚠ Failed to pull ${failed} images`);
    pullResults
      .filter((r: ImagePullResult) => !r.success)
      .forEach((r: ImagePullResult) => console.warn(`  - ${r.image}: ${r.error}`));

    // Decide whether to fail or continue
    if (failed > images.length / 2) {
      throw new Error('Too many image pull failures');
    }
  }

  console.log('✓ Coordinator ready');
}

// =============================================
// Example 6: Batch Agent Spawning
// =============================================

/**
 * Spawn multiple agents in parallel with coordinated image resolution
 */
export async function spawnAgentBatch(
  agents: Array<{ type: string; taskId: string }>,
  workspaceDir: string,
): Promise<string[]> {
  console.log(`Spawning ${agents.length} agents...`);

  // Step 1: Resolve all images upfront
  const agentTypes = agents.map((a: { type: string; taskId: string }) => a.type);
  const images = getImagesForAgentTypes(agentTypes);

  // Step 2: Pre-check all images exist
  console.log(`Checking ${images.length} unique images...`);
  const availability = await checkImagesAvailable(images);

  const missing = availability.filter((r: ImageCheckResult) => !r.available);
  if (missing.length > 0) {
    console.warn(`Missing images: ${missing.map((r: ImageCheckResult) => r.image).join(', ')}`);
    // Optionally pull missing images
    for (const result of missing) {
      console.log(`Pulling: ${result.image}`);
      await pullImage(result.image);
    }
  }

  // Step 3: Spawn agents in parallel
  const containerPromises = agents.map((agent: { type: string; taskId: string }) =>
    spawnAgentContainer(agent.type, agent.taskId, workspaceDir)
  );

  const containerIds = await Promise.all(containerPromises);

  console.log(`✓ Spawned ${containerIds.length} agents`);

  return containerIds;
}

// =============================================
// Example 7: Health Check with Image Validation
// =============================================

/**
 * Periodic health check for registry and agent images
 */
export async function healthCheck(agentTypes: string[]): Promise<{
  healthy: boolean;
  details: string[];
}> {
  const details: string[] = [];

  // Check 1: Registry connectivity
  try {
    const validation = await validateRegistry();
    if (validation.valid) {
      details.push('✓ Registry reachable');
    } else {
      details.push(`✗ Registry issues: ${validation.errors.join(', ')}`);
    }
  } catch (error) {
    details.push(`✗ Registry check failed: ${error}`);
  }

  // Check 2: Required images
  const images = getImagesForAgentTypes(agentTypes);
  const availability = await checkImagesAvailable(images);

  const available = availability.filter(r => r.available).length;
  details.push(`Image availability: ${available}/${availability.length}`);

  // Determine health
  const healthy = availability.every(r => r.available);

  return {
    healthy,
    details,
  };
}

// =============================================
// Example 8: Error Handling Pattern
// =============================================

/**
 * Robust error handling with fallback strategies
 */
export async function robustImageResolution(
  agentType: string,
  fallbackAgentType: string = 'backend-developer',
): Promise<string | null> {
  try {
    // Try primary agent type
    const image = getImageForAgentType(agentType);

    // Validate path
    const validation = validateImagePath(image);
    if (!validation.valid) {
      console.warn(`Invalid image path for ${agentType}, trying fallback`);
      return getImageForAgentType(fallbackAgentType);
    }

    // Check availability
    const availability = await isImageAvailable(image);
    if (!availability.available) {
      console.warn(`Image not available for ${agentType}, trying fallback`);
      return getImageForAgentType(fallbackAgentType);
    }

    return image;
  } catch (error) {
    console.error(`Error resolving image for ${agentType}: ${error}`);

    // Final fallback
    try {
      const fallback = getImageForAgentType(fallbackAgentType);
      console.log(`Using fallback image: ${fallback}`);
      return fallback;
    } catch (fallbackError) {
      console.error(`Fallback also failed: ${fallbackError}`);
      return null;
    }
  }
}

// =============================================
// Example 9: Configuration Validation
// =============================================

/**
 * Validate all agent type images at startup
 */
export async function validateAllAgentImages(): Promise<{
  totalTypes: number;
  available: number;
  missing: string[];
}> {
  const agentTypes = Object.keys(AGENT_IMAGE_MAP).filter((k: string) => k !== 'default');

  console.log(`Validating ${agentTypes.length} agent type images...`);

  const images = getImagesForAgentTypes(agentTypes);
  const results = await checkImagesAvailable(images);

  const missing = results.filter((r: ImageCheckResult) => !r.available).map((r: ImageCheckResult) => r.image);

  return {
    totalTypes: agentTypes.length,
    available: results.filter((r: ImageCheckResult) => r.available).length,
    missing,
  };
}

// =============================================
// Example 10: Registry Configuration Debugging
// =============================================

/**
 * Debug function to display and validate registry configuration
 */
export async function debugRegistryConfiguration(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Registry Configuration Debug Report       ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // Display config
  console.log(getRegistrySummary());

  console.log('\nEnvironment Variables:');
  const envVars = [
    'CFN_REGISTRY_HOST',
    'CFN_AGENT_IMAGE_PREFIX',
    'CFN_REGISTRY_PROTOCOL',
    'CFN_REGISTRY_INSECURE',
  ];

  envVars.forEach((varName: string) => {
    const value = process.env[varName] || '(not set)';
    console.log(`  ${varName}: ${value}`);
  });

  // Test agent type resolution
  console.log('\nAgent Type Resolution:');
  const testTypes = ['typescript-specialist', 'backend-developer', 'unknown-type'];
  testTypes.forEach((type: string) => {
    const image = getImageForAgentType(type);
    console.log(`  ${type}: ${image}`);
  });

  // Test image validation
  console.log('\nImage Path Validation:');
  const testPaths = [
    getImageForAgentType('typescript-specialist'),
    'invalid!path',
    '',
  ];

  testPaths.forEach((path: string) => {
    const validation = validateImagePath(path);
    const display = path || '(empty)';
    console.log(`  "${display}": ${validation.valid ? 'Valid' : 'Invalid'}`);
  });

  // Test registry connectivity
  console.log('\nRegistry Connectivity:');
  const registryUrl = getRegistryUrl();
  console.log(`  Registry URL: ${registryUrl}`);

  const validation = await validateRegistry();
  console.log(`  Validation: ${validation.valid ? 'Passed' : 'Failed'}`);

  if (!validation.valid) {
    console.log('  Errors:');
    validation.errors.forEach(err => console.log(`    - ${err}`));
  }

  console.log('\n');
}

// =============================================
// Export Examples
// =============================================

export {
  // Core functions
  getImageForAgentType,
  getImagesForAgentTypes,
  getRegistryUrl,
  // Async operations
  isImageAvailable,
  checkImagesAvailable,
  pullImage,
  pullImages,
  // Validation
  validateImagePath,
  validateRegistry,
  // Utilities
  getRegistrySummary,
  AGENT_IMAGE_MAP,
};
