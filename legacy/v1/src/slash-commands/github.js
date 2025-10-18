#!/usr/bin/env node

/**
 * GitHub Integration Slash Command
 * Usage: /github <action> [options]
 */

import { SlashCommand } from '../core/slash-command.js';

export class GitHubCommand extends SlashCommand {
  constructor() {
    super('github', 'Manage GitHub repositories, PRs, issues, and workflows');
  }

  getUsage() {
    return '/github <action> [options]';
  }

  getExamples() {
    return [
      '/github analyze owner/repo - Analyze repository code quality',
      '/github pr review 123 - Review pull request #123',
      '/github issue track owner/repo - Track and triage issues',
      '/github release owner/repo v1.0.0 - Coordinate release',
      '/github workflow owner/repo - Setup automation workflows',
      '/github sync repo1,repo2 - Sync multiple repositories',
      '/github metrics owner/repo - Get repository metrics'
    ];
  }

  async execute(args, context) {
    const [action, ...params] = args;

    if (!action) {
      return this.formatResponse({
        success: false,
        error: 'Action required',
        usage: this.getUsage(),
        availableActions: [
          'analyze', 'pr', 'issue', 'release', 'workflow',
          'sync', 'metrics', 'review', 'track', 'coordinate'
        ]
      });
    }

    try {
      let result;

      switch (action.toLowerCase()) {
        case 'analyze':
          result = await this.analyzeRepository(params);
          break;
        
        case 'pr':
          result = await this.managePullRequest(params);
          break;
        
        case 'issue':
          result = await this.manageIssues(params);
          break;
        
        case 'release':
          result = await this.coordinateRelease(params);
          break;
        
        case 'workflow':
          result = await this.manageWorkflows(params);
          break;
        
        case 'sync':
          result = await this.syncRepositories(params);
          break;
        
        case 'metrics':
          result = await this.getMetrics(params);
          break;
        
        case 'review':
          result = await this.codeReview(params);
          break;
        
        case 'track':
          result = await this.trackIssues(params);
          break;
        
        case 'coordinate':
          result = await this.coordinateProject(params);
          break;
        
        default:
          result = {
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: [
              'analyze', 'pr', 'issue', 'release', 'workflow',
              'sync', 'metrics', 'review', 'track', 'coordinate'
            ]
          };
      }

      return this.formatResponse(result);
    } catch (error) {
      return this.formatResponse({
        success: false,
        error: error.message,
        action: action
      });
    }
  }

  async analyzeRepository(params) {
    const [repo, analysisType = 'code_quality'] = params;

    if (!repo) {
      return {
        success: false,
        error: 'Repository required (format: owner/repo)'
      };
    }

    const validAnalysisTypes = ['code_quality', 'performance', 'security'];
    if (!validAnalysisTypes.includes(analysisType)) {
      return {
        success: false,
        error: `Invalid analysis type. Valid options: ${validAnalysisTypes.join(', ')}`
      };
    }

    console.log(`🔍 Analyzing repository ${repo} for ${analysisType}...`);

    const prompt = `
🔍 **GITHUB REPOSITORY ANALYSIS**

**Repository:** ${repo}
**Analysis Type:** ${analysisType}

**Analyze repository with coordinated agents:**

\`\`\`javascript
// Repository analysis with MCP tools
mcp__claude-flow__github_repo_analyze({
  repo: "${repo}",
  analysis_type: "${analysisType}"
});

// Spawn specialized analysis agents with Claude Code's Task tool
Task("Code Analyzer", "Analyze code quality, patterns, and architecture in ${repo}", "code-analyzer")
Task("Security Auditor", "Perform security analysis on ${repo}", "security-manager")
Task("Performance Analyst", "Analyze performance bottlenecks in ${repo}", "perf-analyzer")
Task("Documentation Reviewer", "Review and improve documentation in ${repo}", "api-docs")
\`\`\`

**Analysis Coverage:**
- 📈 Code quality metrics
- 🔒 Security vulnerability assessment
- ⚡ Performance bottleneck identification
- 📝 Documentation completeness
- 🎨 Code style consistency
- 🔄 Architecture analysis

**Execute repository analysis now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo,
      analysisType: analysisType
    };
  }

  async managePullRequest(params) {
    const [action, repo, prNumber] = params;

    if (!action || !repo) {
      return {
        success: false,
        error: 'Action and repository required',
        usage: '/github pr <review|merge|close> <owner/repo> [pr_number]'
      };
    }

    const validActions = ['review', 'merge', 'close'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid PR action. Valid options: ${validActions.join(', ')}`
      };
    }

    console.log(`📝 Managing PR ${prNumber ? `#${prNumber}` : ''} in ${repo}: ${action}`);

    const prompt = `
📝 **PULL REQUEST MANAGEMENT**

**Repository:** ${repo}
**Action:** ${action}
**PR Number:** ${prNumber || 'auto-detect'}

**Manage pull request with coordinated review:**

\`\`\`javascript
// PR management with MCP tools
mcp__claude-flow__github_pr_manage({
  repo: "${repo}",
  action: "${action}",
  ${prNumber ? `pr_number: ${prNumber}` : ''}
});

// Spawn PR review agents with Claude Code's Task tool
Task("Code Reviewer", "Review code changes in PR${prNumber ? ` #${prNumber}` : ''} for ${repo}", "reviewer")
Task("Test Coordinator", "Ensure comprehensive testing for PR changes", "tester")
Task("Security Reviewer", "Security review of PR changes", "security-manager")
Task("Documentation Updater", "Update documentation based on PR changes", "api-docs")
\`\`\`

**PR Review Process:**
- 📈 Code quality assessment
- ⚙️ Test coverage validation
- 🔒 Security impact analysis
- 📝 Documentation updates
- 🎨 Style guide compliance
- 🔄 Integration testing

**Execute PR management now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo,
      action: action,
      prNumber: prNumber
    };
  }

  async manageIssues(params) {
    const [action, repo] = params;

    if (!action || !repo) {
      return {
        success: false,
        error: 'Action and repository required',
        usage: '/github issue <track|triage|assign> <owner/repo>'
      };
    }

    console.log(`📝 Managing issues in ${repo}: ${action}`);

    const prompt = `
📝 **ISSUE MANAGEMENT**

**Repository:** ${repo}
**Action:** ${action}

**Manage repository issues with coordination:**

\`\`\`javascript
// Issue tracking & triage
mcp__claude-flow__github_issue_track({
  repo: "${repo}",
  action: "${action}"
});

// Spawn issue management agents with Claude Code's Task tool
Task("Issue Triager", "Triage and categorize issues in ${repo}", "analyst")
Task("Bug Hunter", "Identify and prioritize bugs in ${repo}", "reviewer")
Task("Feature Planner", "Plan and scope feature requests for ${repo}", "planner")
Task("Community Manager", "Manage community interactions and responses", "coordinator")
\`\`\`

**Issue Management:**
- 🏷️ Automatic labeling and categorization
- 📉 Priority assessment and ranking
- 👥 Assignment to appropriate developers
- 📝 Template compliance checking
- 🔄 Status tracking and updates

**Execute issue management now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo,
      action: action
    };
  }

  async coordinateRelease(params) {
    const [repo, version] = params;

    if (!repo || !version) {
      return {
        success: false,
        error: 'Repository and version required',
        usage: '/github release <owner/repo> <version>'
      };
    }

    console.log(`🚀 Coordinating release ${version} for ${repo}...`);

    const prompt = `
🚀 **RELEASE COORDINATION**

**Repository:** ${repo}
**Version:** ${version}

**Coordinate release with automated workflow:**

\`\`\`javascript
// Release coordination
mcp__claude-flow__github_release_coord({
  repo: "${repo}",
  version: "${version}"
});

// Spawn release coordination agents with Claude Code's Task tool
Task("Release Manager", "Coordinate release ${version} for ${repo}", "release-manager")
Task("QA Coordinator", "Ensure quality for release ${version}", "tester")
Task("Documentation Lead", "Update release documentation", "api-docs")
Task("Deployment Engineer", "Handle release deployment and rollout", "cicd-engineer")
\`\`\`

**Release Checklist:**
- ✅ Code freeze and branch creation
- ✅ Comprehensive testing suite
- ✅ Documentation updates
- ✅ Changelog generation
- ✅ Security audit completion
- ✅ Performance validation
- ✅ Deployment preparation

**Execute release coordination now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo,
      version: version
    };
  }

  async manageWorkflows(params) {
    const [repo, ...workflowParams] = params;

    if (!repo) {
      return {
        success: false,
        error: 'Repository required',
        usage: '/github workflow <owner/repo> [workflow_config]'
      };
    }

    console.log(`⚙️ Managing workflows for ${repo}...`);

    const prompt = `
⚙️ **WORKFLOW AUTOMATION**

**Repository:** ${repo}

**Setup automated workflows:**

\`\`\`javascript
// Workflow automation
mcp__claude-flow__github_workflow_auto({
  repo: "${repo}",
  workflow: {
    ci: true,
    cd: true,
    codeReview: true,
    security: true
  }
});

// Spawn workflow setup agents with Claude Code's Task tool
Task("DevOps Engineer", "Setup CI/CD workflows for ${repo}", "cicd-engineer")
Task("Security Engineer", "Configure security workflows", "security-manager")
Task("Quality Engineer", "Setup code quality workflows", "reviewer")
Task("Automation Specialist", "Configure automation rules", "coordinator")
\`\`\`

**Workflow Features:**
- 🔄 Continuous Integration (CI)
- 🚀 Continuous Deployment (CD)
- 📝 Automated code review
- 🔒 Security scanning
- 📈 Performance monitoring
- 🏷️ Automatic labeling

**Execute workflow setup now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo
    };
  }

  async syncRepositories(params) {
    const repos = params[0] ? params[0].split(',') : [];

    if (repos.length === 0) {
      return {
        success: false,
        error: 'Repository list required',
        usage: '/github sync repo1,repo2,repo3'
      };
    }

    console.log(`🔄 Synchronizing repositories: ${repos.join(', ')}`);

    const prompt = `
🔄 **MULTI-REPOSITORY SYNC**

**Repositories:** ${repos.join(', ')}

**Coordinate multi-repo synchronization:**

\`\`\`javascript
// Multi-repo sync coordination
mcp__claude-flow__github_sync_coord({
  repos: [${repos.map(r => `"${r}"`).join(', ')}]
});

// Spawn sync coordination agents with Claude Code's Task tool
Task("Sync Coordinator", "Coordinate synchronization across ${repos.length} repositories", "sync-coordinator")
Task("Merge Specialist", "Handle merge conflicts and resolution", "reviewer")
Task("Release Coordinator", "Coordinate synchronized releases", "release-manager")
Task("Quality Assurance", "Ensure quality across all repositories", "tester")
\`\`\`

**Synchronization Features:**
- 🔄 Branch synchronization
- 🏷️ Consistent labeling
- 📝 Documentation alignment
- ⚙️ Workflow standardization
- 🚀 Coordinated releases

**Execute repository sync now**:
`;

    return {
      success: true,
      prompt: prompt,
      repositories: repos
    };
  }

  async getMetrics(params) {
    const [repo] = params;

    if (!repo) {
      return {
        success: false,
        error: 'Repository required',
        usage: '/github metrics <owner/repo>'
      };
    }

    console.log(`📈 Getting metrics for ${repo}...`);

    const prompt = `
📈 **REPOSITORY METRICS**

**Repository:** ${repo}

**Collect comprehensive repository metrics:**

\`\`\`javascript
// Repository metrics
mcp__claude-flow__github_metrics({
  repo: "${repo}"
});
\`\`\`

**Metrics Dashboard:**
- 📉 Contribution statistics
- 📝 Issue and PR metrics
- 📈 Code quality trends
- ⚡ Performance indicators
- 👥 Community engagement
- 🔒 Security status

**Execute metrics collection now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo
    };
  }

  async codeReview(params) {
    const [repo, prNumber] = params;

    if (!repo || !prNumber) {
      return {
        success: false,
        error: 'Repository and PR number required',
        usage: '/github review <owner/repo> <pr_number>'
      };
    }

    console.log(`📝 Performing automated code review for PR #${prNumber} in ${repo}...`);

    const prompt = `
📝 **AUTOMATED CODE REVIEW**

**Repository:** ${repo}
**PR Number:** #${prNumber}

**Perform comprehensive code review:**

\`\`\`javascript
// Automated code review
mcp__claude-flow__github_code_review({
  repo: "${repo}",
  pr: ${prNumber}
});

// Spawn code review agents with Claude Code's Task tool
Task("Senior Reviewer", "Comprehensive code review for PR #${prNumber}", "reviewer")
Task("Security Auditor", "Security review of changes", "security-manager")
Task("Performance Analyst", "Performance impact analysis", "perf-analyzer")
Task("Style Checker", "Code style and consistency review", "code-analyzer")
\`\`\`

**Review Checklist:**
- ✅ Code quality and best practices
- ✅ Security vulnerability assessment
- ✅ Performance impact analysis
- ✅ Test coverage validation
- ✅ Documentation updates
- ✅ Style guide compliance

**Execute automated code review now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo,
      prNumber: prNumber
    };
  }

  async trackIssues(params) {
    const [repo] = params;

    if (!repo) {
      return {
        success: false,
        error: 'Repository required',
        usage: '/github track <owner/repo>'
      };
    }

    console.log(`📝 Tracking issues for ${repo}...`);

    const prompt = `
📝 **ISSUE TRACKING**

**Repository:** ${repo}

**Setup comprehensive issue tracking:**

\`\`\`javascript
// Issue tracking & triage
mcp__claude-flow__github_issue_track({
  repo: "${repo}",
  action: "track"
});

// Spawn issue tracking agents with Claude Code's Task tool
Task("Issue Tracker", "Track and categorize issues in ${repo}", "swarm-issue")
Task("Bug Triager", "Triage and prioritize bugs", "analyst")
Task("Feature Coordinator", "Coordinate feature requests", "planner")
\`\`\`

**Execute issue tracking now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo
    };
  }

  async coordinateProject(params) {
    const [repo] = params;

    if (!repo) {
      return {
        success: false,
        error: 'Repository required',
        usage: '/github coordinate <owner/repo>'
      };
    }

    console.log(`🎯 Coordinating project for ${repo}...`);

    const prompt = `
🎯 **PROJECT COORDINATION**

**Repository:** ${repo}

**Setup comprehensive project coordination:**

\`\`\`javascript
// Multi-repo project coordination
mcp__claude-flow__github_sync_coord({
  repos: ["${repo}"]
});

// Spawn project coordination agents with Claude Code's Task tool
Task("Project Manager", "Overall project coordination for ${repo}", "coordinator")
Task("Release Manager", "Coordinate releases and deployments", "release-manager")
Task("Quality Lead", "Ensure quality across all aspects", "tester")
Task("Community Manager", "Manage community and contributions", "analyst")
\`\`\`

**Execute project coordination now**:
`;

    return {
      success: true,
      prompt: prompt,
      repository: repo
    };
  }
}

export default GitHubCommand;
