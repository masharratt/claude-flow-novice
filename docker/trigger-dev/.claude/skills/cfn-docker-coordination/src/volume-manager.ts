/**
 * Volume Manager
 * Handles Docker volume creation and cleanup for CFN agents
 */

import Docker from 'dockerode';
import { DockerError, VolumeInfo } from './types';

/**
 * Docker volume manager for persistent storage
 */
export class VolumeManager {
  private docker: Docker;

  /**
   * Initialize volume manager
   * @param socketPath Path to Docker socket
   */
  constructor(socketPath: string = '/var/run/docker.sock') {
    this.docker = new Docker({
      socketPath: socketPath
    });
  }

  /**
   * Create a named volume
   * @param volumeName Name of the volume
   * @param driver Volume driver (default: local)
   * @param labels Volume labels for organization
   * @returns Volume object
   */
  async createVolume(
    volumeName: string,
    driver: string = 'local',
    labels?: Record<string, string>
  ): Promise<Docker.Volume> {
    try {
      // Check if volume already exists
      try {
        return await this.getVolume(volumeName);
      } catch {
        // Volume doesn't exist, create it
      }

      await this.docker.createVolume({
        Name: volumeName,
        Driver: driver,
        Labels: {
          'cfn-managed': 'true',
          ...labels
        }
      });

      // Return the volume object after creation
      return await this.getVolume(volumeName);
    } catch (error) {
      throw new DockerError(
        `Failed to create volume: ${volumeName}`,
        'CREATE_VOLUME_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get volume by name
   * @param volumeName Volume name
   * @returns Volume object
   */
  async getVolume(volumeName: string): Promise<Docker.Volume> {
    try {
      return this.docker.getVolume(volumeName);
    } catch (error) {
      throw new DockerError(
        `Volume not found: ${volumeName}`,
        'VOLUME_NOT_FOUND',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List all volumes
   * @param dangling Only list dangling volumes
   * @returns Array of volume information
   */
  async listVolumes(dangling: boolean = false): Promise<VolumeInfo[]> {
    try {
      const filters = dangling ? { dangling: ['true'] } : undefined;
      const result = await this.docker.listVolumes({ filters });

      return result.Volumes?.map(v => this.convertToVolumeInfo(v)) || [];
    } catch (error) {
      throw new DockerError(
        'Failed to list volumes',
        'LIST_VOLUMES_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List all CFN-managed volumes
   * @returns Array of CFN volume information
   */
  async listCfnVolumes(): Promise<VolumeInfo[]> {
    try {
      const result = await this.docker.listVolumes();

      return (result.Volumes || [])
        .filter(v => v.Labels?.['cfn-managed'] === 'true')
        .map(v => this.convertToVolumeInfo(v));
    } catch (error) {
      throw new DockerError(
        'Failed to list CFN volumes',
        'LIST_CFN_VOLUMES_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Remove a volume
   * @param volume Docker volume instance
   * @param force Force remove even if in use
   */
  async removeVolume(volume: Docker.Volume, force: boolean = false): Promise<void> {
    try {
      await volume.remove({ force });
    } catch (error) {
      throw new DockerError(
        'Failed to remove volume',
        'REMOVE_VOLUME_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Remove volume by name
   * @param volumeName Volume name
   * @param force Force remove even if in use
   */
  async removeVolumeByName(volumeName: string, force: boolean = false): Promise<void> {
    try {
      const volume = await this.getVolume(volumeName);
      await this.removeVolume(volume, force);
    } catch (error) {
      throw new DockerError(
        `Failed to remove volume: ${volumeName}`,
        'REMOVE_VOLUME_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Remove all dangling volumes
   * @returns Number of volumes removed
   */
  async removeDanglingVolumes(): Promise<number> {
    try {
      const volumes = await this.listVolumes(true);
      let removed = 0;

      for (const volumeInfo of volumes) {
        try {
          const volume = await this.getVolume(volumeInfo.name);
          await this.removeVolume(volume, true);
          removed++;
        } catch {
          // Continue with next volume
        }
      }

      return removed;
    } catch (error) {
      throw new DockerError(
        'Failed to remove dangling volumes',
        'REMOVE_DANGLING_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get volume information
   * @param volume Docker volume instance
   * @returns Volume information
   */
  async getVolumeInfo(volume: Docker.Volume): Promise<VolumeInfo> {
    try {
      const inspect = await volume.inspect();
      return this.convertToVolumeInfo(inspect);
    } catch (error) {
      throw new DockerError(
        'Failed to inspect volume',
        'INSPECT_VOLUME_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if volume exists
   * @param volumeName Volume name
   * @returns true if volume exists
   */
  async volumeExists(volumeName: string): Promise<boolean> {
    try {
      await this.getVolume(volumeName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create or get volume
   * @param volumeName Volume name
   * @param driver Volume driver
   * @param labels Volume labels
   * @returns Volume object
   */
  async ensureVolume(
    volumeName: string,
    driver: string = 'local',
    labels?: Record<string, string>
  ): Promise<Docker.Volume> {
    const exists = await this.volumeExists(volumeName);

    if (exists) {
      return await this.getVolume(volumeName);
    }

    return await this.createVolume(volumeName, driver, labels);
  }

  /**
   * Prune unused volumes
   * @returns Number of volumes removed and space reclaimed
   */
  async pruneVolumes(): Promise<{
    VolumesDeleted: string[];
    SpaceReclaimed: number;
  }> {
    try {
      const result = await this.docker.pruneVolumes();
      return {
        VolumesDeleted: result.VolumesDeleted || [],
        SpaceReclaimed: result.SpaceReclaimed || 0
      };
    } catch (error) {
      throw new DockerError(
        'Failed to prune volumes',
        'PRUNE_VOLUMES_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create volume for agent
   * @param agentId Agent ID
   * @param agentType Agent type
   * @returns Volume object
   */
  async createAgentVolume(
    agentId: string,
    agentType: string
  ): Promise<Docker.Volume> {
    const volumeName = `cfn-${agentId}`;

    return await this.createVolume(volumeName, 'local', {
      'cfn-agent-id': agentId,
      'cfn-agent-type': agentType,
      'cfn-created': new Date().toISOString()
    });
  }

  /**
   * Remove agent volume
   * @param agentId Agent ID
   * @param force Force removal
   */
  async removeAgentVolume(agentId: string, force: boolean = false): Promise<void> {
    const volumeName = `cfn-${agentId}`;
    await this.removeVolumeByName(volumeName, force);
  }

  /**
   * Get agent volumes
   * @param agentId Agent ID filter (optional)
   * @returns Array of agent volume information
   */
  async getAgentVolumes(agentId?: string): Promise<VolumeInfo[]> {
    try {
      const cfnVolumes = await this.listCfnVolumes();

      if (agentId) {
        return cfnVolumes.filter(v =>
          v.labels?.['cfn-agent-id'] === agentId
        );
      }

      return cfnVolumes.filter(v =>
        v.labels?.['cfn-agent-id'] !== undefined
      );
    } catch (error) {
      throw new DockerError(
        'Failed to get agent volumes',
        'GET_AGENT_VOLUMES_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Cleanup all agent volumes
   * @param agentId Optional agent ID to filter
   * @param force Force removal
   * @returns Number of volumes removed
   */
  async cleanupAgentVolumes(agentId?: string, force: boolean = false): Promise<number> {
    try {
      const volumes = await this.getAgentVolumes(agentId);
      let removed = 0;

      for (const volumeInfo of volumes) {
        try {
          await this.removeVolumeByName(volumeInfo.name, force);
          removed++;
        } catch {
          // Continue with next volume
        }
      }

      return removed;
    } catch (error) {
      throw new DockerError(
        'Failed to cleanup agent volumes',
        'CLEANUP_VOLUMES_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Convert Docker volume inspect result to VolumeInfo
   * @param volume Docker volume inspect result
   * @returns VolumeInfo object
   */
  private convertToVolumeInfo(volume: Docker.VolumeInspectInfo): VolumeInfo {
    return {
      name: volume.Name,
      driver: volume.Driver,
      mountpoint: volume.Mountpoint,
      labels: volume.Labels,
      dangling: Object.keys(volume.UsageData || {}).length === 0,
      size: (volume.UsageData as any)?.Size
    };
  }

  /**
   * Get volume mount string for Docker API
   * @param volumeName Volume name
   * @param containerPath Path inside container
   * @returns Mount string in format "volume:/path"
   */
  static getVolumeMount(volumeName: string, containerPath: string): string {
    return `${volumeName}:${containerPath}`;
  }

  /**
   * Get bind mount string for Docker API
   * @param hostPath Host filesystem path
   * @param containerPath Path inside container
   * @param readOnly Whether to mount as read-only
   * @returns Mount string in format "host:/container" or "host:/container:ro"
   */
  static getBindMount(
    hostPath: string,
    containerPath: string,
    readOnly: boolean = false
  ): string {
    const mode = readOnly ? ':ro' : '';
    return `${hostPath}:${containerPath}${mode}`;
  }
}
