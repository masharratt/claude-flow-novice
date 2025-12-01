/**
 * Docker Coordination Module
 * Complete Docker orchestration for CFN agents
 */

// Export types and interfaces
export * from './types';

// Export main classes
export { DockerClient } from './docker-client';
export { AgentContainerManager } from './agent-container';
export { NetworkManager } from './network-manager';
export { VolumeManager } from './volume-manager';
export { HealthChecker } from './health-checker';

// Export factory function for easy initialization
import { DockerClient } from './docker-client';
import { AgentContainerManager } from './agent-container';
import { NetworkManager } from './network-manager';
import { VolumeManager } from './volume-manager';
import { HealthChecker } from './health-checker';

/**
 * Create Docker coordination manager with all components
 * @param socketPath Path to Docker socket
 * @returns Manager object with all components
 */
export function createDockerManager(socketPath: string = '/var/run/docker.sock') {
  const dockerClient = new DockerClient(socketPath);
  const agentManager = new AgentContainerManager(dockerClient);
  const networkManager = new NetworkManager(socketPath);
  const volumeManager = new VolumeManager(socketPath);
  const healthChecker = new HealthChecker(dockerClient);

  return {
    docker: dockerClient,
    agents: agentManager,
    networks: networkManager,
    volumes: volumeManager,
    health: healthChecker
  };
}

// Type definition for the manager
export type DockerManager = ReturnType<typeof createDockerManager>;
