/**
 * GitHubCollaborationManager
 * Consolidated agent handling PR management, code review, and issue tracking
 */

import {
  GitHubConfig,
  Repository,
  PullRequest,
  Issue,
  GitHubError,
  HookContext,
  AgentCapabilities,
  CodeReviewContext
} from '../types';
import { GitHubClient, githubConnectionPool } from '../utils/github-client';

export class GitHubCollaborationManager {
  private client: GitHubClient;
  private agentId: string;
  private capabilities: AgentCapabilities;

  constructor(config: GitHubConfig, agentId: string = 'github-collaboration-manager') {
    this.client = githubConnectionPool.getClient(config);
    this.agentId = agentId;
    this.capabilities = {
      repositories: false,
      pull_requests: true,
      issues: true,
      workflows: false,
      releases: false,
      multi_repo: true
    };
  }

  // =============================================================================
  // PULL REQUEST MANAGEMENT
  // =============================================================================

  /**
   * Create a new pull request
   */
  async createPullRequest(
    repository: Repository,
    title: string,
    head: string,
    base: string,
    body?: string,
    draft: boolean = false
  ): Promise<PullRequest> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'create_pull_request',
      repository,
      metadata: { title, head, base, draft }
    };

    await this.executePreHook(context);

    try {
      const pr = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/pulls`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            head,
            base,
            body: body || '',
            draft
          }),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const pullRequest: PullRequest = {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        base: pr.base.ref,
        head: pr.head.ref,
        repository
      };

      await this.executePostHook({
        ...context,
        metadata: { ...context.metadata, pr_number: pr.number }
      });

      return pullRequest;
    } catch (error) {
      throw this.handleError(error, 'create_pull_request', repository);
    }
  }

  /**
   * Get pull requests with filtering and sorting
   */
  async getPullRequests(
    repository: Repository,
    options: {
      state?: 'open' | 'closed' | 'all';
      sort?: 'created' | 'updated' | 'popularity';
      direction?: 'asc' | 'desc';
      limit?: number;
    } = {}
  ): Promise<PullRequest[]> {
    try {
      const params = new URLSearchParams({
        state: options.state || 'open',
        sort: options.sort || 'created',
        direction: options.direction || 'desc',
        per_page: (options.limit || 30).toString()
      });

      const prs = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/pulls?${params}`
      );

      return prs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        base: pr.base.ref,
        head: pr.head.ref,
        repository
      }));
    } catch (error) {
      throw this.handleError(error, 'get_pull_requests', repository);
    }
  }

  /**
   * Update an existing pull request
   */
  async updatePullRequest(
    repository: Repository,
    prNumber: number,
    updates: Partial<{
      title: string;
      body: string;
      state: 'open' | 'closed';
      base: string;
    }>
  ): Promise<PullRequest> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'update_pull_request',
      repository,
      metadata: { pr_number: prNumber, updates }
    };

    await this.executePreHook(context);

    try {
      const pr = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/pulls/${prNumber}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const pullRequest: PullRequest = {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        base: pr.base.ref,
        head: pr.head.ref,
        repository
      };

      await this.executePostHook(context);
      return pullRequest;
    } catch (error) {
      throw this.handleError(error, 'update_pull_request', repository);
    }
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    repository: Repository,
    prNumber: number,
    options: {
      commit_title?: string;
      commit_message?: string;
      merge_method?: 'merge' | 'squash' | 'rebase';
    } = {}
  ): Promise<any> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'merge_pull_request',
      repository,
      metadata: { pr_number: prNumber, merge_method: options.merge_method || 'merge' }
    };

    await this.executePreHook(context);

    try {
      const result = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/pulls/${prNumber}/merge`,
        {
          method: 'PUT',
          body: JSON.stringify({
            commit_title: options.commit_title,
            commit_message: options.commit_message,
            merge_method: options.merge_method || 'merge'
          }),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      await this.executePostHook(context);
      return result;
    } catch (error) {
      throw this.handleError(error, 'merge_pull_request', repository);
    }
  }

  // =============================================================================
  // CODE REVIEW FUNCTIONALITY
  // =============================================================================

  /**
   * Create a comprehensive code review
   */
  async createCodeReview(
    repository: Repository,
    prNumber: number,
    reviewContext: CodeReviewContext
  ): Promise<any> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'create_code_review',
      repository,
      metadata: { pr_number: prNumber, review_type: reviewContext.review_type }
    };

    await this.executePreHook(context);

    try {
      // Get PR files and content
      const files = await this.getPullRequestFiles(repository, prNumber);

      // Analyze based on review type
      const analysis = await this.analyzeCodeChanges(files, reviewContext);

      // Create review comments
      const comments = this.generateReviewComments(analysis, reviewContext);

      // Submit review
      const review = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/pulls/${prNumber}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({
            body: this.generateReviewSummary(analysis, reviewContext),
            event: this.determineReviewEvent(analysis),
            comments: comments
          }),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      await this.executePostHook({
        ...context,
        metadata: { ...context.metadata, review_id: review.id, comments_count: comments.length }
      });

      return {
        review,
        analysis,
        comments_count: comments.length
      };
    } catch (error) {
      throw this.handleError(error, 'create_code_review', repository);
    }
  }

  /**
   * Get pull request files and changes
   */
  async getPullRequestFiles(repository: Repository, prNumber: number): Promise<any[]> {
    try {
      return await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/pulls/${prNumber}/files`
      );
    } catch (error) {
      throw this.handleError(error, 'get_pull_request_files', repository);
    }
  }

  /**
   * Add review comments to a PR
   */
  async addReviewComments(
    repository: Repository,
    prNumber: number,
    comments: Array<{
      path: string;
      position: number;
      body: string;
    }>
  ): Promise<any[]> {
    try {
      const results = [];

      for (const comment of comments) {
        const result = await this.client.request(
          `/repos/${repository.owner}/${repository.repo}/pulls/${prNumber}/comments`,
          {
            method: 'POST',
            body: JSON.stringify({
              body: comment.body,
              path: comment.path,
              position: comment.position
            }),
            headers: { 'Content-Type': 'application/json' }
          }
        );

        results.push(result);
      }

      return results;
    } catch (error) {
      throw this.handleError(error, 'add_review_comments', repository);
    }
  }

  // =============================================================================
  // ISSUE MANAGEMENT
  // =============================================================================

  /**
   * Create a new issue
   */
  async createIssue(
    repository: Repository,
    title: string,
    body?: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<Issue> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'create_issue',
      repository,
      metadata: { title, labels_count: labels?.length || 0 }
    };

    await this.executePreHook(context);

    try {
      const issue = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/issues`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            body: body || '',
            labels: labels || [],
            assignees: assignees || []
          }),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const issueObj: Issue = {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels?.map((l: any) => l.name) || [],
        assignees: issue.assignees?.map((a: any) => a.login) || [],
        repository
      };

      await this.executePostHook({
        ...context,
        metadata: { ...context.metadata, issue_number: issue.number }
      });

      return issueObj;
    } catch (error) {
      throw this.handleError(error, 'create_issue', repository);
    }
  }

  /**
   * Get issues with filtering and sorting
   */
  async getIssues(
    repository: Repository,
    options: {
      state?: 'open' | 'closed' | 'all';
      labels?: string[];
      sort?: 'created' | 'updated' | 'comments';
      direction?: 'asc' | 'desc';
      limit?: number;
    } = {}
  ): Promise<Issue[]> {
    try {
      const params = new URLSearchParams({
        state: options.state || 'open',
        sort: options.sort || 'created',
        direction: options.direction || 'desc',
        per_page: (options.limit || 30).toString()
      });

      if (options.labels?.length) {
        params.append('labels', options.labels.join(','));
      }

      const issues = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/issues?${params}`
      );

      return issues
        .filter((issue: any) => !issue.pull_request) // Filter out PRs
        .map((issue: any) => ({
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          labels: issue.labels?.map((l: any) => l.name) || [],
          assignees: issue.assignees?.map((a: any) => a.login) || [],
          repository
        }));
    } catch (error) {
      throw this.handleError(error, 'get_issues', repository);
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(
    repository: Repository,
    issueNumber: number,
    updates: Partial<{
      title: string;
      body: string;
      state: 'open' | 'closed';
      labels: string[];
      assignees: string[];
    }>
  ): Promise<Issue> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'update_issue',
      repository,
      metadata: { issue_number: issueNumber, updates }
    };

    await this.executePreHook(context);

    try {
      const issue = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/issues/${issueNumber}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const issueObj: Issue = {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels?.map((l: any) => l.name) || [],
        assignees: issue.assignees?.map((a: any) => a.login) || [],
        repository
      };

      await this.executePostHook(context);
      return issueObj;
    } catch (error) {
      throw this.handleError(error, 'update_issue', repository);
    }
  }

  /**
   * Triage issues automatically based on content and labels
   */
  async triageIssues(repository: Repository, limit: number = 20): Promise<any[]> {
    const context: HookContext = {
      agent_id: this.agentId,
      operation: 'triage_issues',
      repository,
      metadata: { limit }
    };

    await this.executePreHook(context);

    try {
      const issues = await this.getIssues(repository, {
        state: 'open',
        sort: 'created',
        limit
      });

      const triageResults = [];

      for (const issue of issues) {
        const triage = await this.analyzeIssueForTriage(issue);

        if (triage.suggested_labels.length > 0 || triage.suggested_assignees.length > 0) {
          const updates: any = {};

          if (triage.suggested_labels.length > 0) {
            updates.labels = [...(issue.labels || []), ...triage.suggested_labels];
          }

          if (triage.suggested_assignees.length > 0) {
            updates.assignees = triage.suggested_assignees;
          }

          const updatedIssue = await this.updateIssue(repository, issue.number, updates);

          triageResults.push({
            issue: updatedIssue,
            triage,
            updated: true
          });
        } else {
          triageResults.push({
            issue,
            triage,
            updated: false
          });
        }
      }

      await this.executePostHook({
        ...context,
        metadata: { ...context.metadata, triaged_count: triageResults.length }
      });

      return triageResults;
    } catch (error) {
      throw this.handleError(error, 'triage_issues', repository);
    }
  }

  // =============================================================================
  // PROJECT BOARD INTEGRATION
  // =============================================================================

  /**
   * Sync issues and PRs with project boards
   */
  async syncWithProjectBoards(
    repository: Repository,
    projectId?: number
  ): Promise<any> {
    try {
      // Get repository projects
      const projects = await this.client.request(
        `/repos/${repository.owner}/${repository.repo}/projects`
      );

      const targetProject = projectId
        ? projects.find((p: any) => p.id === projectId)
        : projects[0];

      if (!targetProject) {
        throw new Error('No project found for synchronization');
      }

      // Get project columns
      const columns = await this.client.request(`/projects/${targetProject.id}/columns`);

      // Get open issues and PRs
      const [issues, prs] = await Promise.all([
        this.getIssues(repository, { state: 'open' }),
        this.getPullRequests(repository, { state: 'open' })
      ]);

      const syncResults = {
        project: targetProject,
        synced_issues: 0,
        synced_prs: 0,
        errors: []
      };

      // Sync issues to appropriate columns
      for (const issue of issues) {
        try {
          await this.addToProjectBoard(targetProject.id, columns, 'issue', issue);
          syncResults.synced_issues++;
        } catch (error) {
          syncResults.errors.push({
            type: 'issue',
            id: issue.number,
            error: error.message
          });
        }
      }

      // Sync PRs to appropriate columns
      for (const pr of prs) {
        try {
          await this.addToProjectBoard(targetProject.id, columns, 'pull_request', pr);
          syncResults.synced_prs++;
        } catch (error) {
          syncResults.errors.push({
            type: 'pull_request',
            id: pr.number,
            error: error.message
          });
        }
      }

      return syncResults;
    } catch (error) {
      throw this.handleError(error, 'sync_with_project_boards', repository);
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async analyzeCodeChanges(files: any[], reviewContext: CodeReviewContext): Promise<any> {
    const analysis = {
      files_changed: files.length,
      lines_added: files.reduce((sum, f) => sum + f.additions, 0),
      lines_deleted: files.reduce((sum, f) => sum + f.deletions, 0),
      issues: [],
      suggestions: [],
      security_concerns: [],
      performance_concerns: []
    };

    for (const file of files) {
      // Analyze based on review type
      switch (reviewContext.review_type) {
        case 'security':
          analysis.security_concerns.push(...this.analyzeSecurityIssues(file));
          break;
        case 'performance':
          analysis.performance_concerns.push(...this.analyzePerformanceIssues(file));
          break;
        case 'quality':
          analysis.issues.push(...this.analyzeCodeQualityIssues(file));
          break;
        case 'style':
          analysis.suggestions.push(...this.analyzeStyleIssues(file));
          break;
      }
    }

    return analysis;
  }

  private analyzeSecurityIssues(file: any): any[] {
    const issues = [];
    const content = file.patch || '';

    // Simple security pattern detection
    const securityPatterns = [
      { pattern: /password\s*=\s*['"][^'"]+['"]/, message: 'Hardcoded password detected' },
      { pattern: /api_key\s*=\s*['"][^'"]+['"]/, message: 'Hardcoded API key detected' },
      { pattern: /eval\s*\(/i, message: 'Use of eval() detected - potential security risk' },
      { pattern: /innerHTML\s*=/i, message: 'Use of innerHTML - potential XSS risk' }
    ];

    for (const { pattern, message } of securityPatterns) {
      if (pattern.test(content)) {
        issues.push({
          file: file.filename,
          line: this.findLineNumber(content, pattern),
          message,
          severity: 'high'
        });
      }
    }

    return issues;
  }

  private analyzePerformanceIssues(file: any): any[] {
    const issues = [];
    const content = file.patch || '';

    const performancePatterns = [
      { pattern: /for\s*\([^)]*\)\s*{\s*for\s*\(/i, message: 'Nested loops detected - consider optimization' },
      { pattern: /querySelector\s*\(/i, message: 'Consider using more specific selectors or caching' },
      { pattern: /console\.log/i, message: 'Remove console.log statements in production' }
    ];

    for (const { pattern, message } of performancePatterns) {
      if (pattern.test(content)) {
        issues.push({
          file: file.filename,
          line: this.findLineNumber(content, pattern),
          message,
          severity: 'medium'
        });
      }
    }

    return issues;
  }

  private analyzeCodeQualityIssues(file: any): any[] {
    const issues = [];
    const content = file.patch || '';

    const qualityPatterns = [
      { pattern: /function\s+\w+\s*\([^)]*\)\s*{[^}]{500,}}/i, message: 'Large function detected - consider breaking into smaller functions' },
      { pattern: /\/\/\s*TODO|\/\/\s*FIXME|\/\/\s*HACK/i, message: 'TODO/FIXME comment found - consider addressing' },
      { pattern: /var\s+\w+/i, message: 'Use const or let instead of var' }
    ];

    for (const { pattern, message } of qualityPatterns) {
      if (pattern.test(content)) {
        issues.push({
          file: file.filename,
          line: this.findLineNumber(content, pattern),
          message,
          severity: 'low'
        });
      }
    }

    return issues;
  }

  private analyzeStyleIssues(file: any): any[] {
    const issues = [];
    const content = file.patch || '';

    const stylePatterns = [
      { pattern: /\s{5,}/g, message: 'Inconsistent indentation - consider using 2 or 4 spaces' },
      { pattern: /;\s*$/gm, message: 'Missing semicolon' },
      { pattern: /\{\s*\n\s*\n/g, message: 'Unnecessary blank line after opening brace' }
    ];

    for (const { pattern, message } of stylePatterns) {
      if (pattern.test(content)) {
        issues.push({
          file: file.filename,
          line: this.findLineNumber(content, pattern),
          message,
          severity: 'low'
        });
      }
    }

    return issues;
  }

  private findLineNumber(content: string, pattern: RegExp): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        return i + 1;
      }
    }
    return 1;
  }

  private generateReviewComments(analysis: any, reviewContext: CodeReviewContext): any[] {
    const comments = [];

    // Convert issues to review comments
    for (const issue of analysis.issues || []) {
      comments.push({
        path: issue.file,
        position: issue.line,
        body: `**${issue.severity.toUpperCase()}**: ${issue.message}`
      });
    }

    for (const concern of analysis.security_concerns || []) {
      comments.push({
        path: concern.file,
        position: concern.line,
        body: `🔒 **SECURITY**: ${concern.message}`
      });
    }

    for (const concern of analysis.performance_concerns || []) {
      comments.push({
        path: concern.file,
        position: concern.line,
        body: `⚡ **PERFORMANCE**: ${concern.message}`
      });
    }

    return comments.slice(0, 20); // Limit to prevent spam
  }

  private generateReviewSummary(analysis: any, reviewContext: CodeReviewContext): string {
    let summary = `## Code Review Summary (${reviewContext.review_type})\n\n`;

    summary += `**Changes Overview:**\n`;
    summary += `- Files changed: ${analysis.files_changed}\n`;
    summary += `- Lines added: ${analysis.lines_added}\n`;
    summary += `- Lines deleted: ${analysis.lines_deleted}\n\n`;

    if (analysis.security_concerns?.length > 0) {
      summary += `🔒 **Security Concerns:** ${analysis.security_concerns.length} found\n`;
    }

    if (analysis.performance_concerns?.length > 0) {
      summary += `⚡ **Performance Concerns:** ${analysis.performance_concerns.length} found\n`;
    }

    if (analysis.issues?.length > 0) {
      summary += `📝 **Quality Issues:** ${analysis.issues.length} found\n`;
    }

    if (reviewContext.automated) {
      summary += `\n*This review was generated automatically by the GitHub Collaboration Manager.*`;
    }

    return summary;
  }

  private determineReviewEvent(analysis: any): string {
    const totalIssues =
      (analysis.security_concerns?.length || 0) +
      (analysis.performance_concerns?.length || 0) +
      (analysis.issues?.length || 0);

    if (totalIssues === 0) return 'APPROVE';
    if (totalIssues > 10 || analysis.security_concerns?.some((c: any) => c.severity === 'high')) {
      return 'REQUEST_CHANGES';
    }
    return 'COMMENT';
  }

  private async analyzeIssueForTriage(issue: Issue): Promise<any> {
    const title = issue.title.toLowerCase();
    const body = (issue.body || '').toLowerCase();
    const content = `${title} ${body}`;

    const triage = {
      priority: 'medium',
      suggested_labels: [],
      suggested_assignees: [],
      category: 'general'
    };

    // Analyze priority
    if (content.includes('urgent') || content.includes('critical') || content.includes('broken')) {
      triage.priority = 'high';
      triage.suggested_labels.push('priority:high');
    } else if (content.includes('low') || content.includes('minor') || content.includes('enhancement')) {
      triage.priority = 'low';
      triage.suggested_labels.push('priority:low');
    }

    // Analyze category
    if (content.includes('bug') || content.includes('error') || content.includes('broken')) {
      triage.category = 'bug';
      triage.suggested_labels.push('bug');
    } else if (content.includes('feature') || content.includes('enhancement') || content.includes('improve')) {
      triage.category = 'enhancement';
      triage.suggested_labels.push('enhancement');
    } else if (content.includes('question') || content.includes('help') || content.includes('how')) {
      triage.category = 'question';
      triage.suggested_labels.push('question');
    } else if (content.includes('documentation') || content.includes('docs')) {
      triage.category = 'documentation';
      triage.suggested_labels.push('documentation');
    }

    return triage;
  }

  private async addToProjectBoard(
    projectId: number,
    columns: any[],
    type: 'issue' | 'pull_request',
    item: Issue | PullRequest
  ): Promise<any> {
    // Find appropriate column based on item state and type
    let targetColumn = columns.find(col =>
      col.name.toLowerCase().includes(type === 'pull_request' ? 'review' : 'todo')
    );

    if (!targetColumn) {
      targetColumn = columns[0]; // Use first column as fallback
    }

    // Create card in the column
    return await this.client.request(`/projects/columns/${targetColumn.id}/cards`, {
      method: 'POST',
      body: JSON.stringify({
        content_id: item.number,
        content_type: type === 'pull_request' ? 'PullRequest' : 'Issue'
      }),
      headers: { 'Content-Type': 'application/json' }
    });
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
      code: error.code || 'COLLABORATION_ERROR',
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