/**
 * Legacy Agent Mappings
 * Backward compatibility layer for existing 12 GitHub agents
 */

import {
  LegacyAgentType,
  LegacyAgentMapping,
  GitHubConfig,
  Repository,
  PullRequest,
  Issue,
  WorkflowRun,
  Release
} from '../types';

export const LEGACY_AGENT_MAPPINGS: LegacyAgentMapping[] = [
  {
    legacy_type: 'github-modes',
    consolidated_agent: 'integration',
    methods: [
      'analyzeRepository',
      'getRepositoryStructure',
      'configureRepository',
      'getWorkflows',
      'monitorWorkflows'
    ]
  },
  {
    legacy_type: 'pr-manager',
    consolidated_agent: 'collaboration',
    methods: [
      'createPullRequest',
      'getPullRequests',
      'updatePullRequest',
      'mergePullRequest'
    ]
  },
  {
    legacy_type: 'code-review-swarm',
    consolidated_agent: 'collaboration',
    methods: [
      'createCodeReview',
      'getPullRequestFiles',
      'addReviewComments'
    ]
  },
  {
    legacy_type: 'issue-tracker',
    consolidated_agent: 'collaboration',
    methods: [
      'createIssue',
      'getIssues',
      'updateIssue',
      'triageIssues'
    ]
  },
  {
    legacy_type: 'release-manager',
    consolidated_agent: 'release',
    methods: [
      'createRelease',
      'getReleases',
      'updateRelease',
      'deleteRelease'
    ]
  },
  {
    legacy_type: 'workflow-automation',
    consolidated_agent: 'integration',
    methods: [
      'getWorkflows',
      'triggerWorkflow',
      'monitorWorkflows'
    ]
  },
  {
    legacy_type: 'project-board-sync',
    consolidated_agent: 'collaboration',
    methods: [
      'syncWithProjectBoards'
    ]
  },
  {
    legacy_type: 'repo-architect',
    consolidated_agent: 'integration',
    methods: [
      'analyzeRepository',
      'analyzeArchitecture',
      'configureRepository'
    ]
  },
  {
    legacy_type: 'multi-repo-swarm',
    consolidated_agent: 'release',
    methods: [
      'coordinateMultiRepoRelease',
      'syncReleases',
      'triggerDeployments',
      'monitorDeployments'
    ]
  },
  {
    legacy_type: 'github-integration',
    consolidated_agent: 'integration',
    methods: [
      'analyzeRepository',
      'executeMultiRepoOperation',
      'syncRepositoryConfigurations'
    ]
  },
  {
    legacy_type: 'github-analytics',
    consolidated_agent: 'release',
    methods: [
      'generateReleaseAnalytics'
    ]
  },
  {
    legacy_type: 'github-security',
    consolidated_agent: 'integration',
    methods: [
      'analyzeRepository' // Security analysis is part of repository analysis
    ]
  }
];

export const LEGACY_METHOD_MAPPINGS: Record<string, {
  consolidated_agent: 'integration' | 'collaboration' | 'release';
  method_name: string;
  parameter_mapping?: (args: any[]) => any[];
}> = {
  // GitHub Modes (Integration Manager)
  'repo_analyze': {
    consolidated_agent: 'integration',
    method_name: 'analyzeRepository'
  },
  'repo_structure': {
    consolidated_agent: 'integration',
    method_name: 'getRepositoryStructure'
  },
  'repo_configure': {
    consolidated_agent: 'integration',
    method_name: 'configureRepository'
  },
  'workflow_list': {
    consolidated_agent: 'integration',
    method_name: 'getWorkflows'
  },
  'workflow_trigger': {
    consolidated_agent: 'integration',
    method_name: 'triggerWorkflow'
  },
  'workflow_monitor': {
    consolidated_agent: 'integration',
    method_name: 'monitorWorkflows'
  },

  // PR Manager (Collaboration Manager)
  'pr_create': {
    consolidated_agent: 'collaboration',
    method_name: 'createPullRequest'
  },
  'pr_list': {
    consolidated_agent: 'collaboration',
    method_name: 'getPullRequests'
  },
  'pr_update': {
    consolidated_agent: 'collaboration',
    method_name: 'updatePullRequest'
  },
  'pr_merge': {
    consolidated_agent: 'collaboration',
    method_name: 'mergePullRequest'
  },

  // Code Review Swarm (Collaboration Manager)
  'review_create': {
    consolidated_agent: 'collaboration',
    method_name: 'createCodeReview'
  },
  'review_files': {
    consolidated_agent: 'collaboration',
    method_name: 'getPullRequestFiles'
  },
  'review_comment': {
    consolidated_agent: 'collaboration',
    method_name: 'addReviewComments'
  },

  // Issue Tracker (Collaboration Manager)
  'issue_create': {
    consolidated_agent: 'collaboration',
    method_name: 'createIssue'
  },
  'issue_list': {
    consolidated_agent: 'collaboration',
    method_name: 'getIssues'
  },
  'issue_update': {
    consolidated_agent: 'collaboration',
    method_name: 'updateIssue'
  },
  'issue_triage': {
    consolidated_agent: 'collaboration',
    method_name: 'triageIssues'
  },

  // Release Manager (Release Coordinator)
  'release_create': {
    consolidated_agent: 'release',
    method_name: 'createRelease'
  },
  'release_list': {
    consolidated_agent: 'release',
    method_name: 'getReleases'
  },
  'release_update': {
    consolidated_agent: 'release',
    method_name: 'updateRelease'
  },
  'release_delete': {
    consolidated_agent: 'release',
    method_name: 'deleteRelease'
  },

  // Multi-Repo Operations (Release Coordinator)
  'multi_repo_release': {
    consolidated_agent: 'release',
    method_name: 'coordinateMultiRepoRelease'
  },
  'sync_releases': {
    consolidated_agent: 'release',
    method_name: 'syncReleases'
  },
  'deploy_trigger': {
    consolidated_agent: 'release',
    method_name: 'triggerDeployments'
  },
  'deploy_monitor': {
    consolidated_agent: 'release',
    method_name: 'monitorDeployments'
  },

  // Project Board Sync (Collaboration Manager)
  'board_sync': {
    consolidated_agent: 'collaboration',
    method_name: 'syncWithProjectBoards'
  },

  // Repository Architecture (Integration Manager)
  'arch_analyze': {
    consolidated_agent: 'integration',
    method_name: 'analyzeArchitecture'
  },

  // Analytics (Release Coordinator)
  'analytics_generate': {
    consolidated_agent: 'release',
    method_name: 'generateReleaseAnalytics'
  }
};

/**
 * Maps legacy agent types to their consolidated counterparts
 */
export function getLegacyMapping(legacyType: LegacyAgentType): LegacyAgentMapping | null {
  return LEGACY_AGENT_MAPPINGS.find(mapping => mapping.legacy_type === legacyType) || null;
}

/**
 * Maps legacy method calls to consolidated agent methods
 */
export function getLegacyMethodMapping(legacyMethod: string): {
  consolidated_agent: 'integration' | 'collaboration' | 'release';
  method_name: string;
  parameter_mapping?: (args: any[]) => any[];
} | null {
  return LEGACY_METHOD_MAPPINGS[legacyMethod] || null;
}

/**
 * Get all legacy agent types that map to a consolidated agent
 */
export function getLegacyTypesForConsolidatedAgent(
  consolidatedAgent: 'integration' | 'collaboration' | 'release'
): LegacyAgentType[] {
  return LEGACY_AGENT_MAPPINGS
    .filter(mapping => mapping.consolidated_agent === consolidatedAgent)
    .map(mapping => mapping.legacy_type);
}

/**
 * Get all methods available for a legacy agent type
 */
export function getLegacyAgentMethods(legacyType: LegacyAgentType): string[] {
  const mapping = getLegacyMapping(legacyType);
  return mapping ? mapping.methods : [];
}

/**
 * Check if a legacy method is supported
 */
export function isLegacyMethodSupported(legacyMethod: string): boolean {
  return legacyMethod in LEGACY_METHOD_MAPPINGS;
}

/**
 * Get migration suggestions for legacy code
 */
export function getMigrationSuggestions(legacyType: LegacyAgentType): {
  consolidated_agent: string;
  migration_steps: string[];
  breaking_changes: string[];
  compatibility_notes: string[];
} {
  const mapping = getLegacyMapping(legacyType);

  if (!mapping) {
    return {
      consolidated_agent: 'unknown',
      migration_steps: ['Legacy agent type not recognized'],
      breaking_changes: [],
      compatibility_notes: []
    };
  }

  const suggestions = {
    consolidated_agent: mapping.consolidated_agent,
    migration_steps: [
      `Replace '${legacyType}' with '${mapping.consolidated_agent}' agent`,
      `Update method calls to use consolidated agent methods`,
      `Review parameter structures for any changes`,
      `Test functionality with new agent implementation`
    ],
    breaking_changes: [],
    compatibility_notes: [
      'All legacy methods are supported through compatibility layer',
      'Performance improvements may change timing behavior',
      'Error handling has been improved and may return different error structures'
    ]
  };

  // Add specific breaking changes based on legacy type
  switch (legacyType) {
    case 'github-modes':
      suggestions.breaking_changes.push(
        'Mode-specific methods consolidated into general repository operations'
      );
      break;
    case 'code-review-swarm':
      suggestions.breaking_changes.push(
        'Swarm coordination replaced with single agent review capabilities'
      );
      break;
    case 'multi-repo-swarm':
      suggestions.breaking_changes.push(
        'Swarm-based coordination replaced with dependency-aware release coordination'
      );
      break;
  }

  return suggestions;
}