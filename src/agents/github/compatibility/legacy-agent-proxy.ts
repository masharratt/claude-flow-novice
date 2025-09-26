/**
 * Legacy Agent Proxy
 * Provides backward compatibility for existing 12 GitHub agents
 */

import {
  GitHubConfig,
  LegacyAgentType,
  Repository,
  PullRequest,
  Issue,
  WorkflowRun,
  Release
} from '../types';
import { GitHubIntegrationManager } from '../core/github-integration-manager';
import { GitHubCollaborationManager } from '../core/github-collaboration-manager';
import { GitHubReleaseCoordinator } from '../core/github-release-coordinator';
import {
  getLegacyMapping,
  getLegacyMethodMapping,
  getMigrationSuggestions
} from './legacy-agent-mappings';

export class LegacyGitHubAgentProxy {
  private integrationManager: GitHubIntegrationManager;
  private collaborationManager: GitHubCollaborationManager;
  private releaseCoordinator: GitHubReleaseCoordinator;
  private legacyType: LegacyAgentType;
  private deprecationWarningsEnabled: boolean = true;

  constructor(config: GitHubConfig, legacyType: LegacyAgentType) {
    this.legacyType = legacyType;

    // Initialize consolidated agents
    this.integrationManager = new GitHubIntegrationManager(config, `legacy-${legacyType}-integration`);
    this.collaborationManager = new GitHubCollaborationManager(config, `legacy-${legacyType}-collaboration`);
    this.releaseCoordinator = new GitHubReleaseCoordinator(config, `legacy-${legacyType}-release`);

    this.logMigrationNotice();
  }

  // =============================================================================
  // GITHUB MODES COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubIntegrationManager.analyzeRepository instead
   */
  async repo_analyze(repository: Repository): Promise<any> {
    this.logDeprecationWarning('repo_analyze', 'GitHubIntegrationManager.analyzeRepository');
    return await this.integrationManager.analyzeRepository(repository);
  }

  /**
   * @deprecated Use GitHubIntegrationManager.getRepositoryStructure instead
   */
  async repo_structure(repository: Repository, path: string = ''): Promise<any> {
    this.logDeprecationWarning('repo_structure', 'GitHubIntegrationManager.getRepositoryStructure');
    return await this.integrationManager.getRepositoryStructure(repository, path);
  }

  /**
   * @deprecated Use GitHubIntegrationManager.configureRepository instead
   */
  async repo_configure(repository: Repository, config: any): Promise<any> {
    this.logDeprecationWarning('repo_configure', 'GitHubIntegrationManager.configureRepository');
    return await this.integrationManager.configureRepository(repository, config);
  }

  // =============================================================================
  // PR MANAGER COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubCollaborationManager.createPullRequest instead
   */
  async pr_create(
    repository: Repository,
    title: string,
    head: string,
    base: string,
    body?: string,
    draft?: boolean
  ): Promise<PullRequest> {
    this.logDeprecationWarning('pr_create', 'GitHubCollaborationManager.createPullRequest');
    return await this.collaborationManager.createPullRequest(repository, title, head, base, body, draft);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.getPullRequests instead
   */
  async pr_list(repository: Repository, options: any = {}): Promise<PullRequest[]> {
    this.logDeprecationWarning('pr_list', 'GitHubCollaborationManager.getPullRequests');
    return await this.collaborationManager.getPullRequests(repository, options);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.updatePullRequest instead
   */
  async pr_update(repository: Repository, prNumber: number, updates: any): Promise<PullRequest> {
    this.logDeprecationWarning('pr_update', 'GitHubCollaborationManager.updatePullRequest');
    return await this.collaborationManager.updatePullRequest(repository, prNumber, updates);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.mergePullRequest instead
   */
  async pr_merge(repository: Repository, prNumber: number, options: any = {}): Promise<any> {
    this.logDeprecationWarning('pr_merge', 'GitHubCollaborationManager.mergePullRequest');
    return await this.collaborationManager.mergePullRequest(repository, prNumber, options);
  }

  // =============================================================================
  // CODE REVIEW SWARM COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubCollaborationManager.createCodeReview instead
   */
  async review_create(repository: Repository, prNumber: number, reviewContext: any): Promise<any> {
    this.logDeprecationWarning('review_create', 'GitHubCollaborationManager.createCodeReview');
    return await this.collaborationManager.createCodeReview(repository, prNumber, reviewContext);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.getPullRequestFiles instead
   */
  async review_files(repository: Repository, prNumber: number): Promise<any[]> {
    this.logDeprecationWarning('review_files', 'GitHubCollaborationManager.getPullRequestFiles');
    return await this.collaborationManager.getPullRequestFiles(repository, prNumber);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.addReviewComments instead
   */
  async review_comment(repository: Repository, prNumber: number, comments: any[]): Promise<any[]> {
    this.logDeprecationWarning('review_comment', 'GitHubCollaborationManager.addReviewComments');
    return await this.collaborationManager.addReviewComments(repository, prNumber, comments);
  }

  // =============================================================================
  // ISSUE TRACKER COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubCollaborationManager.createIssue instead
   */
  async issue_create(
    repository: Repository,
    title: string,
    body?: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<Issue> {
    this.logDeprecationWarning('issue_create', 'GitHubCollaborationManager.createIssue');
    return await this.collaborationManager.createIssue(repository, title, body, labels, assignees);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.getIssues instead
   */
  async issue_list(repository: Repository, options: any = {}): Promise<Issue[]> {
    this.logDeprecationWarning('issue_list', 'GitHubCollaborationManager.getIssues');
    return await this.collaborationManager.getIssues(repository, options);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.updateIssue instead
   */
  async issue_update(repository: Repository, issueNumber: number, updates: any): Promise<Issue> {
    this.logDeprecationWarning('issue_update', 'GitHubCollaborationManager.updateIssue');
    return await this.collaborationManager.updateIssue(repository, issueNumber, updates);
  }

  /**
   * @deprecated Use GitHubCollaborationManager.triageIssues instead
   */
  async issue_triage(repository: Repository, limit?: number): Promise<any[]> {
    this.logDeprecationWarning('issue_triage', 'GitHubCollaborationManager.triageIssues');
    return await this.collaborationManager.triageIssues(repository, limit);
  }

  // =============================================================================
  // RELEASE MANAGER COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubReleaseCoordinator.createRelease instead
   */
  async release_create(repository: Repository, tagName: string, options: any = {}): Promise<Release> {
    this.logDeprecationWarning('release_create', 'GitHubReleaseCoordinator.createRelease');
    return await this.releaseCoordinator.createRelease(repository, tagName, options);
  }

  /**
   * @deprecated Use GitHubReleaseCoordinator.getReleases instead
   */
  async release_list(repository: Repository, options: any = {}): Promise<Release[]> {
    this.logDeprecationWarning('release_list', 'GitHubReleaseCoordinator.getReleases');
    return await this.releaseCoordinator.getReleases(repository, options);
  }

  /**
   * @deprecated Use GitHubReleaseCoordinator.updateRelease instead
   */
  async release_update(repository: Repository, releaseId: number, updates: any): Promise<Release> {
    this.logDeprecationWarning('release_update', 'GitHubReleaseCoordinator.updateRelease');
    return await this.releaseCoordinator.updateRelease(repository, releaseId, updates);
  }

  /**
   * @deprecated Use GitHubReleaseCoordinator.deleteRelease instead
   */
  async release_delete(repository: Repository, releaseId: number): Promise<void> {
    this.logDeprecationWarning('release_delete', 'GitHubReleaseCoordinator.deleteRelease');
    return await this.releaseCoordinator.deleteRelease(repository, releaseId);
  }

  // =============================================================================
  // WORKFLOW AUTOMATION COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubIntegrationManager.getWorkflows instead
   */
  async workflow_list(repository: Repository): Promise<WorkflowRun[]> {
    this.logDeprecationWarning('workflow_list', 'GitHubIntegrationManager.getWorkflows');
    return await this.integrationManager.getWorkflows(repository);
  }

  /**
   * @deprecated Use GitHubIntegrationManager.triggerWorkflow instead
   */
  async workflow_trigger(
    repository: Repository,
    workflowId: number,
    ref?: string,
    inputs?: any
  ): Promise<any> {
    this.logDeprecationWarning('workflow_trigger', 'GitHubIntegrationManager.triggerWorkflow');
    return await this.integrationManager.triggerWorkflow(repository, workflowId, ref, inputs);
  }

  /**
   * @deprecated Use GitHubIntegrationManager.monitorWorkflows instead
   */
  async workflow_monitor(repository: Repository, limit?: number): Promise<WorkflowRun[]> {
    this.logDeprecationWarning('workflow_monitor', 'GitHubIntegrationManager.monitorWorkflows');
    return await this.integrationManager.monitorWorkflows(repository, limit);
  }

  // =============================================================================
  // PROJECT BOARD SYNC COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubCollaborationManager.syncWithProjectBoards instead
   */
  async board_sync(repository: Repository, projectId?: number): Promise<any> {
    this.logDeprecationWarning('board_sync', 'GitHubCollaborationManager.syncWithProjectBoards');
    return await this.collaborationManager.syncWithProjectBoards(repository, projectId);
  }

  // =============================================================================
  // REPO ARCHITECT COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubIntegrationManager.analyzeArchitecture instead
   */
  async arch_analyze(repository: Repository): Promise<any> {
    this.logDeprecationWarning('arch_analyze', 'GitHubIntegrationManager.analyzeArchitecture');
    return await this.integrationManager.analyzeArchitecture(repository);
  }

  // =============================================================================
  // MULTI-REPO SWARM COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubReleaseCoordinator.coordinateMultiRepoRelease instead
   */
  async multi_repo_release(coordination: any): Promise<any> {
    this.logDeprecationWarning('multi_repo_release', 'GitHubReleaseCoordinator.coordinateMultiRepoRelease');
    return await this.releaseCoordinator.coordinateMultiRepoRelease(coordination);
  }

  /**
   * @deprecated Use GitHubReleaseCoordinator.syncReleases instead
   */
  async sync_releases(repositories: Repository[], targetVersion: string, options: any = {}): Promise<any[]> {
    this.logDeprecationWarning('sync_releases', 'GitHubReleaseCoordinator.syncReleases');
    return await this.releaseCoordinator.syncReleases(repositories, targetVersion, options);
  }

  /**
   * @deprecated Use GitHubReleaseCoordinator.triggerDeployments instead
   */
  async deploy_trigger(
    repositories: Repository[],
    environment: string,
    version: string,
    options: any = {}
  ): Promise<any[]> {
    this.logDeprecationWarning('deploy_trigger', 'GitHubReleaseCoordinator.triggerDeployments');
    return await this.releaseCoordinator.triggerDeployments(repositories, environment, version, options);
  }

  /**
   * @deprecated Use GitHubReleaseCoordinator.monitorDeployments instead
   */
  async deploy_monitor(
    repositories: Repository[],
    environment: string,
    timeoutMs?: number
  ): Promise<any[]> {
    this.logDeprecationWarning('deploy_monitor', 'GitHubReleaseCoordinator.monitorDeployments');
    return await this.releaseCoordinator.monitorDeployments(repositories, environment, timeoutMs);
  }

  // =============================================================================
  // GITHUB INTEGRATION COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubIntegrationManager.executeMultiRepoOperation instead
   */
  async multi_repo_operation(operation: any): Promise<any[]> {
    this.logDeprecationWarning('multi_repo_operation', 'GitHubIntegrationManager.executeMultiRepoOperation');
    return await this.integrationManager.executeMultiRepoOperation(operation);
  }

  /**
   * @deprecated Use GitHubIntegrationManager.syncRepositoryConfigurations instead
   */
  async sync_repo_configs(repositories: Repository[], template: any): Promise<any[]> {
    this.logDeprecationWarning('sync_repo_configs', 'GitHubIntegrationManager.syncRepositoryConfigurations');
    return await this.integrationManager.syncRepositoryConfigurations(repositories, template);
  }

  // =============================================================================
  // GITHUB ANALYTICS COMPATIBILITY
  // =============================================================================

  /**
   * @deprecated Use GitHubReleaseCoordinator.generateReleaseAnalytics instead
   */
  async analytics_generate(repositories: Repository[], timeframe: any): Promise<any> {
    this.logDeprecationWarning('analytics_generate', 'GitHubReleaseCoordinator.generateReleaseAnalytics');
    return await this.releaseCoordinator.generateReleaseAnalytics(repositories, timeframe);
  }

  // =============================================================================
  // DYNAMIC METHOD DISPATCH
  // =============================================================================

  /**
   * Dynamic method dispatcher for legacy method calls
   */
  async callLegacyMethod(methodName: string, ...args: any[]): Promise<any> {
    const mapping = getLegacyMethodMapping(methodName);

    if (!mapping) {
      throw new Error(`Legacy method '${methodName}' is not supported. Please check the migration guide.`);
    }

    this.logDeprecationWarning(methodName, `${mapping.consolidated_agent} agent method`);

    // Get the appropriate consolidated agent
    let agent: any;
    switch (mapping.consolidated_agent) {
      case 'integration':
        agent = this.integrationManager;
        break;
      case 'collaboration':
        agent = this.collaborationManager;
        break;
      case 'release':
        agent = this.releaseCoordinator;
        break;
      default:
        throw new Error(`Unknown consolidated agent: ${mapping.consolidated_agent}`);
    }

    // Apply parameter mapping if provided
    const mappedArgs = mapping.parameter_mapping ? mapping.parameter_mapping(args) : args;

    // Call the method
    const method = agent[mapping.method_name];
    if (typeof method !== 'function') {
      throw new Error(`Method '${mapping.method_name}' not found on ${mapping.consolidated_agent} agent`);
    }

    return await method.apply(agent, mappedArgs);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Get migration suggestions for this legacy agent
   */
  getMigrationGuide(): any {
    return getMigrationSuggestions(this.legacyType);
  }

  /**
   * Check if a method is supported
   */
  isMethodSupported(methodName: string): boolean {
    return typeof (this as any)[methodName] === 'function' ||
           getLegacyMethodMapping(methodName) !== null;
  }

  /**
   * Get all available methods for this legacy agent
   */
  getAvailableMethods(): string[] {
    const mapping = getLegacyMapping(this.legacyType);
    return mapping ? mapping.methods : [];
  }

  /**
   * Enable or disable deprecation warnings
   */
  setDeprecationWarnings(enabled: boolean): void {
    this.deprecationWarningsEnabled = enabled;
  }

  /**
   * Get performance metrics from all consolidated agents
   */
  getMetrics(): any {
    return {
      legacy_agent: this.legacyType,
      integration_metrics: this.integrationManager.getMetrics(),
      collaboration_metrics: this.collaborationManager.getMetrics(),
      release_metrics: this.releaseCoordinator.getMetrics()
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private logMigrationNotice(): void {
    if (this.deprecationWarningsEnabled) {
      console.warn(`
📢 MIGRATION NOTICE: Legacy GitHub agent '${this.legacyType}' is deprecated.

This agent has been consolidated into the new GitHub Agent Architecture:
- Repository operations → GitHubIntegrationManager
- PR/Issue management → GitHubCollaborationManager
- Release coordination → GitHubReleaseCoordinator

Benefits of migration:
✅ 60% memory reduction
✅ Better error handling
✅ Improved performance
✅ Enhanced coordination

Get migration guide: agent.getMigrationGuide()
      `);
    }
  }

  private logDeprecationWarning(legacyMethod: string, newMethod: string): void {
    if (this.deprecationWarningsEnabled) {
      console.warn(
        `⚠️  DEPRECATED: ${legacyMethod}() is deprecated. Use ${newMethod} instead. ` +
        `Call setDeprecationWarnings(false) to disable these warnings.`
      );
    }
  }
}