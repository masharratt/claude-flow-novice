/**
 * GitHubIntegrationManager
 * Consolidated agent handling repository operations, workflows, and architecture
 */

import {
  GitHubConfig,
  Repository,
  WorkflowRun,
  GitHubError,
  HookContext,
  AgentCapabilities,
  MultiRepoOperation
} from '../types';
import { GitHubClient, githubConnectionPool } from '../utils/github-client';

export class GitHubIntegrationManager {
  private client: GitHubClient;
  private agentId: string;
  private capabilities: AgentCapabilities;

  constructor(config: GitHubConfig, agentId: string = 'github-integration-manager') {
    this.client = githubConnectionPool.getClient(config);
    this.agentId = agentId;
    this.capabilities = {
      repositories: true,
      pull_requests: false,
      issues: false,
      workflows: true,
      releases: false,
      multi_repo: true
    };
  }

  // =============================================================================
  // REPOSITORY OPERATIONS
  // =============================================================================

  /**
   * Analyze repository structure, dependencies, and architecture
   */
  async analyzeRepository(repository: Repository): Promise<any> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'analyze_repository',
      repository,
      metadata: { analysis_type: 'comprehensive' }
    };

    await this.executePreHook(context);

    try {
      const [
        repoData,
        languages,
        topics,
        branches,
        contributors,
        commits,
        dependencies
      ] = await Promise.all([
        this.client.request(`/repos/${repository.owner}/${repository.repo}`),
        this.client.request(`/repos/${repository.owner}/${repository.repo}/languages`),
        this.client.request(`/repos/${repository.owner}/${repository.repo}/topics`),
        this.client.request(`/repos/${repository.owner}/${repository.repo}/branches`),
        this.client.request(`/repos/${repository.owner}/${repository.repo}/contributors`),
        this.client.request(`/repos/${repository.owner}/${repository.repo}/commits?per_page=100`),
        this.analyzeDependencies(repository)
      ]);

      const analysis = {
        repository: repoData,
        architecture: {
          languages,
          primary_language: repoData.language,
          size: repoData.size,
          structure: await this.analyzeStructure(repository)
        },
        collaboration: {
          contributors_count: contributors.length,
          recent_commits: commits.length,
          active_branches: branches.length
        },
        dependencies,
        topics: topics.names,
        health_score: this.calculateHealthScore({
          commits: commits.length,
          contributors: contributors.length,
          issues: repoData.open_issues_count,
          stars: repoData.stargazers_count,
          forks: repoData.forks_count
        }),
        recommendations: this.generateRecommendations(repoData, languages)
      };

      await this.executePostHook({
        ...context,
        metadata: { ...context.metadata, analysis_results: analysis }
      });

      return analysis;
    } catch (error) {
      throw this.handleError(error, 'analyze_repository', repository);
    }
  }

  /**
   * Get repository structure and file tree
   */
  async getRepositoryStructure(repository: Repository, path: string = ''): Promise<any> {
    try {
      const response = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/contents/${path}`
      );

      if (Array.isArray(response)) {
        const structure = [];
        for (const item of response) {
          if (item.type === 'dir') {
            structure.push({
              ...item,
              children: await this.getRepositoryStructure(repository, item.path)
            });
          } else {
            structure.push(item);
          }
        }
        return structure;
      }

      return response;
    } catch (error) {
      throw this.handleError(error, 'get_repository_structure', repository);
    }
  }

  /**
   * Create or update repository configuration
   */
  async configureRepository(repository: Repository, config: any): Promise<any> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'configure_repository',
      repository,
      metadata: { config_changes: config }
    };

    await this.executePreHook(context);

    try {
      const updates = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}`,
        {
          method: 'PATCH',
          body: JSON.stringify(config),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      await this.executePostHook(context);
      return updates;
    } catch (error) {
      throw this.handleError(error, 'configure_repository', repository);
    }
  }

  // =============================================================================
  // WORKFLOW OPERATIONS
  // =============================================================================

  /**
   * List and analyze GitHub Actions workflows
   */
  async getWorkflows(repository: Repository): Promise<WorkflowRun[]> {
    try {
      const workflows = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/actions/workflows`
      );

      return workflows.workflows.map((workflow: any) => ({
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
        created_at: workflow.created_at,
        updated_at: workflow.updated_at,
        repository
      }));
    } catch (error) {
      throw this.handleError(error, 'get_workflows', repository);
    }
  }

  /**
   * Trigger workflow run
   */
  async triggerWorkflow(
    repository: Repository,
    workflowId: number,
    ref: string = 'main',
    inputs: any = {}
  ): Promise<any> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'trigger_workflow',
      repository,
      metadata: { workflow_id: workflowId, ref, inputs }
    };

    await this.executePreHook(context);

    try {
      const run = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/actions/workflows/${workflowId}/dispatches`,
        {
          method: 'POST',
          body: JSON.stringify({ ref, inputs }),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      await this.executePostHook(context);
      return run;
    } catch (error) {
      throw this.handleError(error, 'trigger_workflow', repository);
    }
  }

  /**
   * Monitor workflow runs and get status
   */
  async monitorWorkflows(repository: Repository, limit: number = 50): Promise<WorkflowRun[]> {
    try {
      const runs = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/actions/runs?per_page=${limit}`
      );

      return runs.workflow_runs.map((run: any) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        created_at: run.created_at,
        updated_at: run.updated_at,
        repository
      }));
    } catch (error) {
      throw this.handleError(error, 'monitor_workflows', repository);
    }
  }

  // =============================================================================
  // MULTI-REPOSITORY OPERATIONS
  // =============================================================================

  /**
   * Execute operations across multiple repositories
   */
  async executeMultiRepoOperation(operation: MultiRepoOperation): Promise<any[]> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'multi_repo_operation',
      metadata: {
        operation_type: operation.operation,
        repository_count: operation.repositories.length,
        parallel: operation.parallel
      }
    };

    await this.executePreHook(context);

    try {
      let results: any[];

      if (operation.parallel) {
        const promises = operation.repositories.map(async (repo) => {
          try {
            return await this.executeSingleRepoOperation(repo, operation.operation);
          } catch (error) {
            if (operation.continue_on_error) {
              return { repository: repo, error: error.message };
            }
            throw error;
          }
        });

        results = await Promise.all(promises);
      } else {
        results = [];
        for (const repo of operation.repositories) {
          try {
            const result = await this.executeSingleRepoOperation(repo, operation.operation);
            results.push(result);
          } catch (error) {
            if (operation.continue_on_error) {
              results.push({ repository: repo, error: error.message });
            } else {
              throw error;
            }
          }
        }
      }

      await this.executePostHook({
        ...context,
        metadata: { ...context.metadata, results_count: results.length }
      });

      return results;
    } catch (error) {
      throw this.handleError(error, 'multi_repo_operation', null);
    }
  }

  /**
   * Sync configurations across multiple repositories
   */
  async syncRepositoryConfigurations(
    repositories: Repository[],
    template: any
  ): Promise<any[]> {
    const operation: MultiRepoOperation = {
      repositories,
      operation: 'sync_config',
      parallel: true,
      continue_on_error: true
    };

    const results = [];
    for (const repo of repositories) {
      try {
        const result = await this.configureRepository(repo, template);
        results.push({ repository: repo, success: true, result });
      } catch (error) {
        results.push({ repository: repo, success: false, error: error.message });
      }
    }

    return results;
  }

  // =============================================================================
  // ARCHITECTURE ANALYSIS
  // =============================================================================

  /**
   * Analyze repository architecture and provide recommendations
   */
  async analyzeArchitecture(repository: Repository): Promise<any> {
    try {
      const [structure, dependencies, workflows, security] = await Promise.all([
        this.analyzeStructure(repository),
        this.analyzeDependencies(repository),
        this.getWorkflows(repository),
        this.analyzeSecurityFeatures(repository)
      ]);

      const architecture = {
        structure,
        dependencies,
        ci_cd: {
          workflows_count: workflows.length,
          automated_testing: workflows.some(w => w.name.includes('test')),
          automated_deployment: workflows.some(w => w.name.includes('deploy'))
        },
        security,
        recommendations: this.generateArchitectureRecommendations({
          structure,
          dependencies,
          workflows,
          security
        })
      };

      return architecture;
    } catch (error) {
      throw this.handleError(error, 'analyze_architecture', repository);
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async analyzeStructure(repository: Repository): Promise<any> {
    try {
      const contents = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/contents`
      );

      const structure = {
        has_readme: contents.some((item: any) =>
          item.name.toLowerCase().startsWith('readme')),
        has_license: contents.some((item: any) =>
          item.name.toLowerCase().includes('license')),
        has_contributing: contents.some((item: any) =>
          item.name.toLowerCase().includes('contributing')),
        has_tests: contents.some((item: any) =>
          item.name.toLowerCase().includes('test') || item.name === 'tests'),
        has_docs: contents.some((item: any) =>
          item.name.toLowerCase() === 'docs' || item.name.toLowerCase() === 'documentation'),
        has_ci: contents.some((item: any) =>
          item.name === '.github' || item.name === '.gitlab-ci.yml'),
        directories: contents.filter((item: any) => item.type === 'dir').length,
        files: contents.filter((item: any) => item.type === 'file').length
      };

      return structure;
    } catch (error) {
      return { error: 'Could not analyze structure' };
    }
  }

  private async analyzeDependencies(repository: Repository): Promise<any> {
    try {
      const packageFiles = [
        'package.json',
        'requirements.txt',
        'Gemfile',
        'pom.xml',
        'Cargo.toml',
        'go.mod',
        'composer.json'
      ];

      const dependencies: any = {};

      for (const file of packageFiles) {
        try {
          const content = await this.client.request(
            `/repos/${repository.owner}/${repository.repo}/contents/${file}`
          );

          if (content.content) {
            const decoded = Buffer.from(content.content, 'base64').toString();
            dependencies[file] = this.parseDependencyFile(file, decoded);
          }
        } catch (error) {
          // File doesn't exist, continue
        }
      }

      return dependencies;
    } catch (error) {
      return { error: 'Could not analyze dependencies' };
    }
  }

  private async analyzeSecurityFeatures(repository: Repository): Promise<any> {
    try {
      const [dependabot, security] = await Promise.all([
        this.client.request(
          `/repos/${repository.owner}/${repository.repo}/contents/.github/dependabot.yml`
        ).catch(() => null),
        this.client.request(
          `/repos/${repository.owner}/${repository.repo}/vulnerability-alerts`
        ).catch(() => null)
      ]);

      return {
        has_dependabot: !!dependabot,
        has_security_policy: false, // Would need to check for SECURITY.md
        vulnerability_alerts_enabled: !!security,
        branch_protection: await this.checkBranchProtection(repository)
      };
    } catch (error) {
      return { error: 'Could not analyze security features' };
    }
  }

  private async checkBranchProtection(repository: Repository): Promise<boolean> {
    try {
      await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/branches/main/protection`
      );
      return true;
    } catch (error) {
      try {
        await this.client.request(
          `/repos/${repository.owner}/${repository.repo}/branches/master/protection`
        );
        return true;
      } catch (error) {
        return false;
      }
    }
  }

  private parseDependencyFile(filename: string, content: string): any {
    try {
      switch (filename) {
        case 'package.json':
          const pkg = JSON.parse(content);
          return {
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
            scripts: Object.keys(pkg.scripts || {})
          };
        case 'requirements.txt':
          return {
            dependencies: content.split('\n')
              .filter(line => line.trim() && !line.startsWith('#'))
              .map(line => line.split('==')[0].split('>=')[0].split('<=')[0].trim())
          };
        default:
          return { raw: content.substring(0, 500) };
      }
    } catch (error) {
      return { error: 'Could not parse dependency file' };
    }
  }

  private calculateHealthScore(metrics: any): number {
    let score = 0;

    // Recent activity (40%)
    if (metrics.commits > 10) score += 40;
    else if (metrics.commits > 5) score += 20;
    else if (metrics.commits > 0) score += 10;

    // Community engagement (30%)
    if (metrics.contributors > 5) score += 15;
    if (metrics.stars > 10) score += 10;
    if (metrics.forks > 5) score += 5;

    // Maintenance (30%)
    if (metrics.issues < 10) score += 15;
    else if (metrics.issues < 20) score += 10;
    else if (metrics.issues < 50) score += 5;

    return Math.min(score, 100);
  }

  private generateRecommendations(repoData: any, languages: any): string[] {
    const recommendations = [];

    if (!repoData.description) {
      recommendations.push('Add a repository description');
    }

    if (repoData.open_issues_count > 20) {
      recommendations.push('Consider addressing open issues');
    }

    if (!repoData.license) {
      recommendations.push('Add a license file');
    }

    if (Object.keys(languages).length > 5) {
      recommendations.push('Consider consolidating programming languages');
    }

    return recommendations;
  }

  private generateArchitectureRecommendations(analysis: any): string[] {
    const recommendations = [];

    if (!analysis.structure.has_readme) {
      recommendations.push('Add a comprehensive README file');
    }

    if (!analysis.structure.has_tests) {
      recommendations.push('Implement automated testing');
    }

    if (!analysis.structure.has_ci) {
      recommendations.push('Set up continuous integration');
    }

    if (!analysis.security.has_dependabot) {
      recommendations.push('Enable Dependabot for security updates');
    }

    if (!analysis.security.branch_protection) {
      recommendations.push('Enable branch protection rules');
    }

    return recommendations;
  }

  private async executeSingleRepoOperation(repository: Repository, operation: string): Promise<any> {
    switch (operation) {
      case 'analyze':
        return this.analyzeRepository(repository);
      case 'get_workflows':
        return this.getWorkflows(repository);
      case 'analyze_architecture':
        return this.analyzeArchitecture(repository);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async executePreHook(context: HookContext): Promise<void> {
    try {
      // Execute pre-operation hooks for coordination
      console.log(`[${this.agentId}] Executing pre-hook for ${context.operation}`);
    } catch (error) {
      console.warn(`[${this.agentId}] Pre-hook failed:`, error);
    }
  }

  private async executePostHook(context: HookContext): Promise<void> {
    try {
      // Execute post-operation hooks for coordination
      console.log(`[${this.agentId}] Executing post-hook for ${context.operation}`);
    } catch (error) {
      console.warn(`[${this.agentId}] Post-hook failed:`, error);
    }
  }

  private handleError(error: any, operation: string, repository: Repository | null): GitHubError {
    const gitHubError: GitHubError = {
      code: error.code || 'INTEGRATION_ERROR',
      message: `${operation} failed: ${error.message}`,
      status: error.status,
      repository: repository || undefined,
      context: { operation, agent_id: this.agentId }
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
      capabilities: this.capabilities
    };
  }
}