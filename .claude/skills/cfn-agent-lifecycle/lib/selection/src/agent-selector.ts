import * as fs from 'fs';
import * as path from 'path';

/**
 * Task classification result
 */
export interface TaskClassification {
  category: string;
  confidence: number;
  keywords: string[];
}

/**
 * Agent selection result with Loop 3, Loop 2, and Product Owner
 */
export interface AgentSelection {
  loop3: string[];
  loop2: string[];
  product_owner: string;
  category: string;
  confidence: number;
}

/**
 * Agent mapping configuration for a single category
 */
export interface CategoryMapping {
  loop3: string[];
  loop2: string[];
  keywords: string[];
  confidence: number;
}

/**
 * Full agent mappings configuration
 */
export interface AgentAliasCost {
  tokens: number;
  time_ms: number;
  dollars: number;
}

export interface AgentAliasObject {
  path: string;
  cost?: AgentAliasCost;
}

export type AgentAliasEntry = string | AgentAliasObject;

export interface AgentMappings {
  categories: {
    [key: string]: Omit<CategoryMapping, 'keywords'>;
  };
  product_owner: string;
  agent_aliases: {
    [key: string]: AgentAliasEntry;
  };
}

/**
 * Task classification keywords for each category
 */
const CLASSIFICATION_KEYWORDS: Record<string, string[]> = {
  security: [
    'security', 'vulnerability', 'exploit', 'encryption', 'ssl', 'tls',
    'certificate', 'oauth', 'saml', 'rbac', 'permission', 'auth', 'jwt',
    'authentication', 'authorization'
  ],
  infrastructure: [
    'docker', 'kubernetes', 'k8s', 'helm', 'deployment', 'ci/cd', 'pipeline',
    'aws', 'gcp', 'azure', 'cloud', 'terraform', 'ansible', 'infrastructure'
  ],
  mobile: [
    'mobile', 'ios', 'android', 'react-native', 'react native', 'swift',
    'kotlin', 'flutter', 'app store', 'play store'
  ],
  frontend: [
    'react', 'vue', 'angular', 'svelte', 'typescript', 'javascript', 'css',
    'scss', 'tailwind', 'ui', 'ux', 'design', 'component', 'frontend',
    'next.js', 'remix'
  ],
  database: [
    'schema', 'migration', 'index', 'database', 'sql', 'nosql', 'postgres',
    'mongodb', 'redis', 'mysql', 'table design', 'create table'
  ],
  'backend-api': [
    'api', 'rest', 'graphql', 'endpoint', 'middleware', 'express', 'fastify',
    'nest.js', 'backend', 'server', 'microservice'
  ],
  performance: [
    'performance', 'benchmark', 'latency', 'throughput', 'profiling',
    'memory leak', 'cpu usage', 'slow', 'optimize'
  ],
  fullstack: [
    'fullstack', 'full-stack', 'full stack'
  ],
  default: []
};

/**
 * Keyword categories sorted by priority (highest first)
 */
const CATEGORY_PRIORITY = [
  'security',
  'infrastructure',
  'mobile',
  'fullstack',
  'performance',
  'database',
  'frontend',
  'backend-api',
  'default'
];

/**
 * Agent Selection class for task classification and agent selection
 */
export class AgentSelector {
  private agentMappings: AgentMappings | null = null;
  private mappingsPath: string;
  private agentsDir: string;

  constructor(
    mappingsPath: string = '.claude/skills/cfn-agent-selection-with-fallback/agent-mappings.json',
    agentsDir: string = '.claude/agents/cfn-dev-team'
  ) {
    this.mappingsPath = mappingsPath;
    this.agentsDir = agentsDir;
  }

  /**
   * Load agent mappings from JSON file
   */
  async loadMappings(): Promise<AgentMappings> {
    if (this.agentMappings !== null) {
      return this.agentMappings;
    }

    try {
      const mappingsContent = await fs.promises.readFile(this.mappingsPath, 'utf-8');
      const parsed = JSON.parse(mappingsContent) as AgentMappings;
      this.agentMappings = parsed;
      return parsed;
    } catch (error) {
      console.error(`Failed to load agent mappings from ${this.mappingsPath}:`, error);
      throw new Error(`Cannot load agent mappings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Classify a task description into a category
   * Returns the category with highest confidence score
   */
  async classifyTask(description: string): Promise<TaskClassification> {
    if (!description || description.trim().length === 0) {
      return {
        category: 'default',
        confidence: 0.0,
        keywords: []
      };
    }

    const lowerDesc = description.toLowerCase();
    const scores: Record<string, { count: number; keywords: string[] }> = {};

    // Initialize scores for all categories
    for (const category of CATEGORY_PRIORITY) {
      scores[category] = { count: 0, keywords: [] };
    }

    // Special handling for fullstack (requires both frontend AND backend keywords)
    const hasFrontend = this.hasKeywords(lowerDesc, ['react', 'vue', 'angular', 'svelte', 'typescript', 'javascript', 'css', 'scss', 'tailwind', 'ui', 'component', 'frontend']);
    const hasBackend = this.hasKeywords(lowerDesc, ['api', 'backend', 'server', 'database', 'endpoint']);
    const hasFullstackKeyword = this.hasKeywords(lowerDesc, ['fullstack', 'full-stack', 'full stack']);

    if (hasFullstackKeyword || (hasFrontend && hasBackend)) {
      scores['fullstack'].count = 3; // High score for fullstack
      scores['fullstack'].keywords = ['fullstack'];
    }

    // Score other categories
    for (const category of CATEGORY_PRIORITY) {
      if (category === 'fullstack' || category === 'default') continue;

      const keywords = CLASSIFICATION_KEYWORDS[category] || [];
      for (const keyword of keywords) {
        if (lowerDesc.includes(keyword)) {
          scores[category].count++;
          scores[category].keywords.push(keyword);
        }
      }
    }

    // Find category with highest score
    let bestCategory = 'default';
    let bestScore = 0;
    let bestKeywords: string[] = [];

    for (const category of CATEGORY_PRIORITY) {
      if (scores[category].count > bestScore) {
        bestScore = scores[category].count;
        bestCategory = category;
        bestKeywords = scores[category].keywords;
      }
    }

    // Map bestScore to confidence (normalize to 0.0-1.0)
    const confidence = bestCategory === 'default' ? 0.0 : Math.min(1.0, 0.5 + (bestScore * 0.1));

    return {
      category: bestCategory,
      confidence: Math.round(confidence * 100) / 100,
      keywords: bestKeywords
    };
  }

  /**
   * Check if description contains any of the given keywords
   */
  private hasKeywords(description: string, keywords: string[]): boolean {
    return keywords.some(keyword => description.includes(keyword));
  }

  /**
   * Select agents for the given task description
   */
  async selectAgents(
    description: string,
    minValidators: number = 3
  ): Promise<AgentSelection> {
    const mappings = await this.loadMappings();
    const classification = await this.classifyTask(description);

    // Validate category exists in mappings
    let category = classification.category;
    if (!mappings.categories[category]) {
      console.warn(`[WARN] Invalid category '${category}', falling back to 'default'`);
      category = 'default';
    }

    const categoryMapping = mappings.categories[category];
    if (!categoryMapping) {
      throw new Error(`Category '${category}' not found in mappings`);
    }

    // Extract agents for category
    let loop3Agents = Array.isArray(categoryMapping.loop3) ? [...categoryMapping.loop3] : [];
    let loop2Agents = Array.isArray(categoryMapping.loop2) ? [...categoryMapping.loop2] : [];

    // Fallback if empty Loop 3 agents
    if (loop3Agents.length === 0) {
      console.warn(`[WARN] Empty Loop 3 agents for category '${category}', using default`);
      const defaultMapping = mappings.categories['default'];
      loop3Agents = Array.isArray(defaultMapping.loop3) ? [...defaultMapping.loop3] : [];
    }

    // Fallback if empty Loop 2 agents
    if (loop2Agents.length === 0) {
      console.warn(`[WARN] Empty Loop 2 agents for category '${category}', using default`);
      const defaultMapping = mappings.categories['default'];
      loop2Agents = Array.isArray(defaultMapping.loop2) ? [...defaultMapping.loop2] : [];
    }

    // Validate agents exist in agent profiles
    const validatedLoop3 = await this.validateAndFixAgents(loop3Agents, 'backend-developer');
    const validatedLoop2 = await this.validateAndFixAgents(loop2Agents, 'tester');

    // Ensure minimum 2 Loop 3 agents
    if (validatedLoop3.length < 2) {
      console.warn('[WARN] Less than 2 Loop 3 agents, adding devops-engineer');
      validatedLoop3.push('devops-engineer');
    }

    // Ensure minimum validators for Loop 2
    while (validatedLoop2.length < minValidators) {
      console.warn(`[WARN] Less than ${minValidators} Loop 2 validators, adding code-quality-validator`);
      validatedLoop2.push('code-quality-validator');
    }

    const productOwner = mappings.product_owner || 'product-owner';

    return {
      loop3: validatedLoop3,
      loop2: validatedLoop2,
      product_owner: productOwner,
      category,
      confidence: categoryMapping.confidence || 0.70
    };
  }

  /**
   * Validate agents and replace invalid ones with fallback
   */
  private async validateAndFixAgents(
    agents: string[],
    fallbackAgent: string
  ): Promise<string[]> {
    const mappings = await this.loadMappings();
    const validated: string[] = [];

    for (const agent of agents) {
      if (await this.validateAgent(agent, mappings)) {
        validated.push(agent);
      } else {
        console.warn(`[WARN] Invalid agent '${agent}', replacing with ${fallbackAgent}`);
        validated.push(fallbackAgent);
      }
    }

    return validated.length > 0 ? validated : [fallbackAgent];
  }

  /**
   * Validate that an agent exists in the agent profiles
   */
  private async validateAgent(agentName: string, mappings: AgentMappings): Promise<boolean> {
    const agentAliases = mappings.agent_aliases || {};
    const aliasEntry = agentAliases[agentName];

    if (!aliasEntry) {
      return false;
    }

    const resolvedPath = typeof aliasEntry === 'string' ? aliasEntry : aliasEntry.path;
    const fullPath = path.join(this.agentsDir, resolvedPath);

    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);

      // Verify path stays within agents directory (security check)
      const realPath = await fs.promises.realpath(fullPath);
      const realAgentsDir = await fs.promises.realpath(this.agentsDir);
      return realPath.startsWith(realAgentsDir);
    } catch {
      return false;
    }
  }

  /**
   * Validate agents exist in agent profiles
   */
  async validateAgents(agents: string[]): Promise<string[]> {
    const mappings = await this.loadMappings();
    const validated: string[] = [];

    for (const agent of agents) {
      if (await this.validateAgent(agent, mappings)) {
        validated.push(agent);
      }
    }

    return validated;
  }
}

/**
 * Create a default agent selector with standard paths
 */
export async function createDefaultSelector(): Promise<AgentSelector> {
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const mappingsPath = path.join(projectRoot, '.claude/skills/cfn-agent-selection-with-fallback/agent-mappings.json');
  const agentsDir = path.join(projectRoot, '.claude/agents/cfn-dev-team');
  return new AgentSelector(mappingsPath, agentsDir);
}
