/**
 * GitHub Agent Architecture - Type Definitions
 * Consolidated types for the 3-agent GitHub system
 */

export interface GitHubConfig {
  token: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

export interface Repository {
  owner: string;
  repo: string;
  full_name?: string;
  default_branch?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  base: string;
  head: string;
  repository: Repository;
}

export interface Issue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
  repository: Repository;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped';
  repository: Repository;
}

export interface Release {
  id: number;
  tag_name: string;
  name: string;
  body?: string;
  draft: boolean;
  prerelease: boolean;
  repository: Repository;
}

export interface GitHubMetrics {
  api_calls: number;
  rate_limit_remaining: number;
  cache_hits: number;
  errors: number;
  response_time_avg: number;
}

export interface AgentCapabilities {
  repositories: boolean;
  pull_requests: boolean;
  issues: boolean;
  workflows: boolean;
  releases: boolean;
  multi_repo: boolean;
}

export interface HookContext {
  agent_id: string;
  operation: string;
  repository?: Repository;
  metadata?: Record<string, any>;
}

export interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  ttl: number;
}

export interface GitHubError {
  code: string;
  message: string;
  status?: number;
  repository?: Repository;
  context?: Record<string, any>;
}

export interface MultiRepoOperation {
  repositories: Repository[];
  operation: string;
  parallel: boolean;
  continue_on_error: boolean;
}

export interface CodeReviewContext {
  pull_request: PullRequest;
  files_changed: string[];
  review_type: 'security' | 'performance' | 'quality' | 'style';
  automated: boolean;
}

export interface ReleaseCoordination {
  repositories: Repository[];
  version: string;
  changelog: string;
  dependencies: Record<string, string[]>;
  rollback_plan: boolean;
}

// Legacy agent type mappings for backward compatibility
export type LegacyAgentType =
  | 'github-modes'
  | 'pr-manager'
  | 'code-review-swarm'
  | 'issue-tracker'
  | 'release-manager'
  | 'workflow-automation'
  | 'project-board-sync'
  | 'repo-architect'
  | 'multi-repo-swarm'
  | 'github-integration'
  | 'github-analytics'
  | 'github-security';

export interface LegacyAgentMapping {
  legacy_type: LegacyAgentType;
  consolidated_agent: 'integration' | 'collaboration' | 'release';
  methods: string[];
}