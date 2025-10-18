/**
 * GitHubReleaseCoordinator
 * Consolidated agent handling multi-repo coordination, releases, and deployment
 */

import {
  GitHubConfig,
  Repository,
  Release,
  GitHubError,
  HookContext,
  AgentCapabilities,
  MultiRepoOperation,
  ReleaseCoordination,
} from '../types';
import { GitHubClient, githubConnectionPool } from '../utils/github-client';

export class GitHubReleaseCoordinator {
  private client: GitHubClient;
  private agentId: string;
  private capabilities: AgentCapabilities;

  constructor(config: GitHubConfig, agentId: string = 'github-release-coordinator') {
    this.client = githubConnectionPool.getClient(config);
    this.agentId = agentId;
    this.capabilities = {
      repositories: true,
      pull_requests: false,
      issues: false,
      workflows: false,
      releases: true,
      multi_repo: true,
    };
  }

  // =============================================================================
  // RELEASE MANAGEMENT
  // =============================================================================

  /**
   * Create a new release
   */
  async createRelease(
    repository: Repository,
    tagName: string,
    options: {
      name?: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
      targetCommitish?: string;
      generateReleaseNotes?: boolean;
    } = {},
  ): Promise<Release> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'create_release',
      repository,
      metadata: {
        tag_name: tagName,
        draft: options.draft || false,
        prerelease: options.prerelease || false,
      },
    };

    await this.executePreHook(context);

    try {
      const releaseData: any = {
        tag_name: tagName,
        name: options.name || tagName,
        body: options.body || '',
        draft: options.draft || false,
        prerelease: options.prerelease || false,
      };

      if (options.targetCommitish) {
        releaseData.target_commitish = options.targetCommitish;
      }

      if (options.generateReleaseNotes) {
        releaseData.generate_release_notes = true;
      }

      const release = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/releases`,
        {
          method: 'POST',
          body: JSON.stringify(releaseData),
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const releaseObj: Release = {
        id: release.id,
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        repository,
      };

      await this.executePostHook({
        ...context,
        metadata: { ...context.metadata, release_id: release.id },
      });

      return releaseObj;
    } catch (error) {
      throw this.handleError(error, 'create_release', repository);
    }
  }

  /**
   * Get releases for a repository
   */
  async getReleases(
    repository: Repository,
    options: {
      limit?: number;
      includeDrafts?: boolean;
      includePreleases?: boolean;
    } = {},
  ): Promise<Release[]> {
    try {
      const params = new URLSearchParams({
        per_page: (options.limit || 30).toString(),
      });

      const releases = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/releases?${params}`,
      );

      let filteredReleases = releases;

      if (!options.includeDrafts) {
        filteredReleases = filteredReleases.filter((r: any) => !r.draft);
      }

      if (!options.includePreleases) {
        filteredReleases = filteredReleases.filter((r: any) => !r.prerelease);
      }

      return filteredReleases.map((release: any) => ({
        id: release.id,
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        repository,
      }));
    } catch (error) {
      throw this.handleError(error, 'get_releases', repository);
    }
  }

  /**
   * Update an existing release
   */
  async updateRelease(
    repository: Repository,
    releaseId: number,
    updates: Partial<{
      tag_name: string;
      name: string;
      body: string;
      draft: boolean;
      prerelease: boolean;
    }>,
  ): Promise<Release> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'update_release',
      repository,
      metadata: { release_id: releaseId, updates },
    };

    await this.executePreHook(context);

    try {
      const release = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/releases/${releaseId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const releaseObj: Release = {
        id: release.id,
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        repository,
      };

      await this.executePostHook(context);
      return releaseObj;
    } catch (error) {
      throw this.handleError(error, 'update_release', repository);
    }
  }

  /**
   * Delete a release
   */
  async deleteRelease(repository: Repository, releaseId: number): Promise<void> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'delete_release',
      repository,
      metadata: { release_id: releaseId },
    };

    await this.executePreHook(context);

    try {
      await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/releases/${releaseId}`,
        { method: 'DELETE' },
      );

      await this.executePostHook(context);
    } catch (error) {
      throw this.handleError(error, 'delete_release', repository);
    }
  }

  // =============================================================================
  // MULTI-REPOSITORY COORDINATION
  // =============================================================================

  /**
   * Coordinate releases across multiple repositories
   */
  async coordinateMultiRepoRelease(coordination: ReleaseCoordination): Promise<any> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'coordinate_multi_repo_release',
      metadata: {
        repository_count: coordination.repositories.length,
        version: coordination.version,
        has_rollback_plan: coordination.rollback_plan,
      },
    };

    await this.executePreHook(context);

    try {
      // Phase 1: Validate all repositories
      const validationResults = await this.validateRepositoriesForRelease(
        coordination.repositories,
        coordination.version,
      );

      if (validationResults.some((r) => !r.valid)) {
        throw new Error(
          `Release validation failed for some repositories: ${validationResults
            .filter((r) => !r.valid)
            .map((r) => r.repository.full_name)
            .join(', ')}`,
        );
      }

      // Phase 2: Check dependencies
      const dependencyOrder = this.resolveDependencyOrder(
        coordination.repositories,
        coordination.dependencies,
      );

      // Phase 3: Create releases in dependency order
      const releaseResults = [];

      for (const repo of dependencyOrder) {
        try {
          // Wait for dependencies to be released first
          await this.waitForDependencies(repo, coordination.dependencies, releaseResults);

          const release = await this.createRelease(repo, coordination.version, {
            name: `Release ${coordination.version}`,
            body: coordination.changelog,
            draft: false,
            prerelease:
              coordination.version.includes('alpha') || coordination.version.includes('beta'),
          });

          releaseResults.push({
            repository: repo,
            release,
            success: true,
            timestamp: new Date().toISOString(),
          });

          console.log(`[${this.agentId}] Released ${repo.full_name} v${coordination.version}`);
        } catch (error) {
          releaseResults.push({
            repository: repo,
            error: error.message,
            success: false,
            timestamp: new Date().toISOString(),
          });

          if (coordination.rollback_plan) {
            console.log(
              `[${this.agentId}] Release failed for ${repo.full_name}, initiating rollback`,
            );
            await this.rollbackReleases(releaseResults.filter((r) => r.success));
            throw error;
          }
        }
      }

      // Phase 4: Post-release validation
      await this.validateReleasesDeployed(releaseResults.filter((r) => r.success));

      await this.executePostHook({
        ...context,
        metadata: {
          ...context.metadata,
          successful_releases: releaseResults.filter((r) => r.success).length,
          failed_releases: releaseResults.filter((r) => !r.success).length,
        },
      });

      return {
        coordination,
        results: releaseResults,
        dependency_order: dependencyOrder,
        summary: {
          total: coordination.repositories.length,
          successful: releaseResults.filter((r) => r.success).length,
          failed: releaseResults.filter((r) => !r.success).length,
        },
      };
    } catch (error) {
      throw this.handleError(error, 'coordinate_multi_repo_release', null);
    }
  }

  /**
   * Sync releases across repositories
   */
  async syncReleases(
    repositories: Repository[],
    targetVersion: string,
    options: {
      dryRun?: boolean;
      forceUpdate?: boolean;
    } = {},
  ): Promise<any[]> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'sync_releases',
      metadata: {
        repository_count: repositories.length,
        target_version: targetVersion,
        dry_run: options.dryRun || false,
      },
    };

    await this.executePreHook(context);

    try {
      const syncResults = [];

      for (const repo of repositories) {
        try {
          const releases = await this.getReleases(repo, { limit: 10 });
          const latestRelease = releases[0];

          const needsUpdate =
            !latestRelease || latestRelease.tag_name !== targetVersion || options.forceUpdate;

          if (needsUpdate) {
            if (options.dryRun) {
              syncResults.push({
                repository: repo,
                action: 'would_update',
                from: latestRelease?.tag_name || 'none',
                to: targetVersion,
                success: true,
              });
            } else {
              const release = await this.createRelease(repo, targetVersion, {
                name: `Sync Release ${targetVersion}`,
                body: `Synchronized release to version ${targetVersion}`,
                draft: false,
              });

              syncResults.push({
                repository: repo,
                action: 'updated',
                release,
                from: latestRelease?.tag_name || 'none',
                to: targetVersion,
                success: true,
              });
            }
          } else {
            syncResults.push({
              repository: repo,
              action: 'up_to_date',
              current_version: latestRelease.tag_name,
              success: true,
            });
          }
        } catch (error) {
          syncResults.push({
            repository: repo,
            action: 'failed',
            error: error.message,
            success: false,
          });
        }
      }

      await this.executePostHook({
        ...context,
        metadata: {
          ...context.metadata,
          updated_count: syncResults.filter((r) => r.action === 'updated').length,
          failed_count: syncResults.filter((r) => !r.success).length,
        },
      });

      return syncResults;
    } catch (error) {
      throw this.handleError(error, 'sync_releases', null);
    }
  }

  // =============================================================================
  // DEPLOYMENT COORDINATION
  // =============================================================================

  /**
   * Trigger deployment workflows across repositories
   */
  async triggerDeployments(
    repositories: Repository[],
    environment: string,
    version: string,
    options: {
      parallel?: boolean;
      waitForCompletion?: boolean;
      rollbackOnFailure?: boolean;
    } = {},
  ): Promise<any[]> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'trigger_deployments',
      metadata: {
        repository_count: repositories.length,
        environment,
        version,
        parallel: options.parallel || false,
      },
    };

    await this.executePreHook(context);

    try {
      const deploymentResults = [];

      if (options.parallel) {
        const promises = repositories.map(async (repo) => {
          try {
            return await this.triggerSingleDeployment(repo, environment, version);
          } catch (error) {
            return {
              repository: repo,
              error: error.message,
              success: false,
            };
          }
        });

        const results = await Promise.all(promises);
        deploymentResults.push(...results);
      } else {
        for (const repo of repositories) {
          try {
            const result = await this.triggerSingleDeployment(repo, environment, version);
            deploymentResults.push(result);

            if (options.waitForCompletion) {
              await this.waitForDeploymentCompletion(result.deployment_id, repo);
            }
          } catch (error) {
            const failureResult = {
              repository: repo,
              error: error.message,
              success: false,
            };

            deploymentResults.push(failureResult);

            if (options.rollbackOnFailure) {
              console.log(
                `[${this.agentId}] Deployment failed for ${repo.full_name}, initiating rollback`,
              );
              await this.rollbackDeployments(deploymentResults.filter((r) => r.success));
              throw error;
            }
          }
        }
      }

      await this.executePostHook({
        ...context,
        metadata: {
          ...context.metadata,
          successful_deployments: deploymentResults.filter((r) => r.success).length,
          failed_deployments: deploymentResults.filter((r) => !r.success).length,
        },
      });

      return deploymentResults;
    } catch (error) {
      throw this.handleError(error, 'trigger_deployments', null);
    }
  }

  /**
   * Monitor deployment status across repositories
   */
  async monitorDeployments(
    repositories: Repository[],
    environment: string,
    timeoutMs: number = 300000, // 5 minutes default
  ): Promise<any[]> {
    try {
      const startTime = Date.now();
      const deploymentStatuses = [];

      while (Date.now() - startTime < timeoutMs) {
        deploymentStatuses.length = 0; // Clear previous results

        for (const repo of repositories) {
          try {
            const deployments = await this.client.request(
              `/repos/${repo.owner}/${repo.repo}/deployments`,
            );

            const latestDeployment = deployments
              .filter((d: any) => d.environment === environment)
              .sort(
                (a: any, b: any) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              )[0];

            if (latestDeployment) {
              const statuses = await this.client.request(
                `/repos/${repo.owner}/${repo.repo}/deployments/${latestDeployment.id}/statuses`,
              );

              const latestStatus = statuses[0];

              deploymentStatuses.push({
                repository: repo,
                deployment: latestDeployment,
                status: latestStatus?.state || 'unknown',
                created_at: latestDeployment.created_at,
                updated_at: latestStatus?.updated_at || latestDeployment.updated_at,
              });
            } else {
              deploymentStatuses.push({
                repository: repo,
                status: 'no_deployment',
                message: 'No deployment found for environment',
              });
            }
          } catch (error) {
            deploymentStatuses.push({
              repository: repo,
              status: 'error',
              error: error.message,
            });
          }
        }

        // Check if all deployments are complete
        const pendingDeployments = deploymentStatuses.filter(
          (d) => d.status === 'pending' || d.status === 'in_progress',
        );

        if (pendingDeployments.length === 0) {
          break;
        }

        // Wait 10 seconds before next check
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      return deploymentStatuses;
    } catch (error) {
      throw this.handleError(error, 'monitor_deployments', null);
    }
  }

  // =============================================================================
  // ANALYTICS AND REPORTING
  // =============================================================================

  /**
   * Generate release analytics report
   */
  async generateReleaseAnalytics(
    repositories: Repository[],
    timeframe: {
      start: string;
      end: string;
    },
  ): Promise<any> {
    try {
      const analytics = {
        timeframe,
        repositories: repositories.length,
        total_releases: 0,
        releases_by_repo: {},
        release_frequency: {},
        deployment_success_rate: 0,
        common_issues: [],
        recommendations: [],
      };

      for (const repo of repositories) {
        const releases = await this.getReleases(repo, { limit: 100 });

        const timeframeReleases = releases.filter((r) => {
          const releaseDate = new Date(r.tag_name); // Simplified date parsing
          return releaseDate >= new Date(timeframe.start) && releaseDate <= new Date(timeframe.end);
        });

        analytics.total_releases += timeframeReleases.length;
        analytics.releases_by_repo[repo.full_name] = {
          count: timeframeReleases.length,
          releases: timeframeReleases.map((r) => ({
            version: r.tag_name,
            name: r.name,
            draft: r.draft,
            prerelease: r.prerelease,
          })),
        };
      }

      // Calculate release frequency
      const daysDiff = Math.ceil(
        (new Date(timeframe.end).getTime() - new Date(timeframe.start).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      analytics.release_frequency = {
        releases_per_day: analytics.total_releases / daysDiff,
        releases_per_week: (analytics.total_releases / daysDiff) * 7,
        releases_per_month: (analytics.total_releases / daysDiff) * 30,
      };

      // Generate recommendations
      analytics.recommendations = this.generateReleaseRecommendations(analytics);

      return analytics;
    } catch (error) {
      throw this.handleError(error, 'generate_release_analytics', null);
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async validateRepositoriesForRelease(
    repositories: Repository[],
    version: string,
  ): Promise<any[]> {
    const validations = [];

    for (const repo of repositories) {
      try {
        // Check if version already exists
        const existingReleases = await this.getReleases(repo, { limit: 10 });
        const versionExists = existingReleases.some((r) => r.tag_name === version);

        // Check if there are uncommitted changes
        const branches = await this.client.request(`/repos/${repo.owner}/${repo.repo}/branches`);

        const defaultBranch = branches.find((b: any) => b.name === 'main' || b.name === 'master');

        validations.push({
          repository: repo,
          valid: !versionExists,
          issues: versionExists ? [`Version ${version} already exists`] : [],
          default_branch: defaultBranch?.name || 'unknown',
        });
      } catch (error) {
        validations.push({
          repository: repo,
          valid: false,
          issues: [`Validation failed: ${error.message}`],
          error: true,
        });
      }
    }

    return validations;
  }

  private resolveDependencyOrder(
    repositories: Repository[],
    dependencies: Record<string, string[]>,
  ): Repository[] {
    const repoMap = new Map(repositories.map((repo) => [repo.full_name, repo]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: Repository[] = [];

    const visit = (repoName: string) => {
      if (visiting.has(repoName)) {
        throw new Error(`Circular dependency detected involving ${repoName}`);
      }
      if (visited.has(repoName)) {
        return;
      }

      visiting.add(repoName);

      const deps = dependencies[repoName] || [];
      for (const dep of deps) {
        if (repoMap.has(dep)) {
          visit(dep);
        }
      }

      visiting.delete(repoName);
      visited.add(repoName);

      const repo = repoMap.get(repoName);
      if (repo) {
        sorted.push(repo);
      }
    };

    for (const repo of repositories) {
      if (!visited.has(repo.full_name)) {
        visit(repo.full_name);
      }
    }

    return sorted;
  }

  private async waitForDependencies(
    repository: Repository,
    dependencies: Record<string, string[]>,
    completedReleases: any[],
  ): Promise<void> {
    const deps = dependencies[repository.full_name] || [];
    const completedRepoNames = completedReleases
      .filter((r) => r.success)
      .map((r) => r.repository.full_name);

    const missingDeps = deps.filter((dep) => !completedRepoNames.includes(dep));

    if (missingDeps.length > 0) {
      throw new Error(
        `Cannot release ${repository.full_name}: waiting for dependencies ${missingDeps.join(', ')}`,
      );
    }
  }

  private async rollbackReleases(successfulReleases: any[]): Promise<void> {
    console.log(`[${this.agentId}] Rolling back ${successfulReleases.length} releases`);

    for (const releaseResult of successfulReleases.reverse()) {
      try {
        await this.deleteRelease(releaseResult.repository, releaseResult.release.id);
        console.log(
          `[${this.agentId}] Rolled back release for ${releaseResult.repository.full_name}`,
        );
      } catch (error) {
        console.error(
          `[${this.agentId}] Failed to rollback ${releaseResult.repository.full_name}:`,
          error,
        );
      }
    }
  }

  private async validateReleasesDeployed(successfulReleases: any[]): Promise<void> {
    // Validate that releases are properly tagged and accessible
    for (const releaseResult of successfulReleases) {
      try {
        const release = await this.client.request(
          `/repos/${releaseResult.repository.owner}/${releaseResult.repository.repo}/releases/${releaseResult.release.id}`,
        );

        if (!release || release.draft) {
          console.warn(
            `[${this.agentId}] Release validation warning for ${releaseResult.repository.full_name}: release is draft or not found`,
          );
        }
      } catch (error) {
        console.error(
          `[${this.agentId}] Release validation failed for ${releaseResult.repository.full_name}:`,
          error,
        );
      }
    }
  }

  private async triggerSingleDeployment(
    repository: Repository,
    environment: string,
    version: string,
  ): Promise<any> {
    try {
      // Create deployment
      const deployment = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/deployments`,
        {
          method: 'POST',
          body: JSON.stringify({
            ref: version,
            environment,
            description: `Deploy ${version} to ${environment}`,
            auto_merge: false,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      );

      return {
        repository,
        deployment,
        deployment_id: deployment.id,
        environment,
        version,
        success: true,
        triggered_at: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to trigger deployment for ${repository.full_name}: ${error.message}`);
    }
  }

  private async waitForDeploymentCompletion(
    deploymentId: number,
    repository: Repository,
    timeoutMs: number = 300000,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const statuses = await this.client.request(
          `/repos/${repository.owner}/${repository.repo}/deployments/${deploymentId}/statuses`,
        );

        const latestStatus = statuses[0];

        if (latestStatus?.state === 'success') {
          return;
        } else if (latestStatus?.state === 'failure' || latestStatus?.state === 'error') {
          throw new Error(`Deployment failed: ${latestStatus.description || 'Unknown error'}`);
        }

        // Wait 10 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 10000));
      } catch (error) {
        throw new Error(`Failed to monitor deployment: ${error.message}`);
      }
    }

    throw new Error('Deployment timeout');
  }

  private async rollbackDeployments(successfulDeployments: any[]): Promise<void> {
    console.log(`[${this.agentId}] Rolling back ${successfulDeployments.length} deployments`);

    // Implementation would depend on deployment system
    // This is a placeholder for rollback logic
    for (const deployment of successfulDeployments.reverse()) {
      console.log(
        `[${this.agentId}] Would rollback deployment for ${deployment.repository.full_name}`,
      );
    }
  }

  private generateReleaseRecommendations(analytics: any): string[] {
    const recommendations = [];

    // Release frequency recommendations
    if (analytics.release_frequency.releases_per_month < 1) {
      recommendations.push(
        'Consider increasing release frequency - less than 1 release per month detected',
      );
    } else if (analytics.release_frequency.releases_per_day > 1) {
      recommendations.push('High release frequency detected - consider batching changes');
    }

    // Repository-specific recommendations
    const repoEntries = Object.entries(analytics.releases_by_repo);
    const noReleases = repoEntries.filter(([_, data]: [string, any]) => data.count === 0);

    if (noReleases.length > 0) {
      recommendations.push(`${noReleases.length} repositories have no releases in the timeframe`);
    }

    // Pre-release recommendations
    const totalPreReleases = repoEntries.reduce((sum, [_, data]: [string, any]) => {
      return sum + data.releases.filter((r: any) => r.prerelease).length;
    }, 0);

    if (totalPreReleases / analytics.total_releases > 0.3) {
      recommendations.push(
        'High percentage of pre-releases - consider more stable release process',
      );
    }

    return recommendations;
  }

  private async executePreHook(context: HookContext): Promise<void> {
    try {
      console.log(`[${this.agentId}] Executing pre-hook for ${context.operation}`);
    } catch (error) {
      console.warn(`[${this.agentId}] Pre-hook failed:`, error);
    }
  }

  private async executePostHook(context: HookContext): Promise<void> {
    try {
      console.log(`[${this.agentId}] Executing post-hook for ${context.operation}`);
    } catch (error) {
      console.warn(`[${this.agentId}] Post-hook failed:`, error);
    }
  }

  private handleError(error: any, operation: string, repository: Repository | null): GitHubError {
    const gitHubError: GitHubError = {
      code: error.code || 'RELEASE_ERROR',
      message: `${operation} failed: ${error.message}`,
      status: error.status,
      repository: repository || undefined,
      context: { operation, agent_id: this.agentId },
    };

    console.error(`[${this.agentId}] Error in ${operation}:`, gitHubError);
    return gitHubError;
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  getCapabilities(): AgentCapabilities {
    return { ...this.capabilities };
  }

  getMetrics(): any {
    return {
      ...this.client.getMetrics(),
      agent_id: this.agentId,
      capabilities: this.capabilities,
    };
  }
}
