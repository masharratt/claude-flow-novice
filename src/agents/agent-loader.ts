/**
 * Dynamic Agent Loader - Reads agent definitions from .claude/agents/ directory
 * Single source of truth for agent types in the system
 */

import { readFileSync, existsSync } from 'node:fs';
import { glob, GlobOptionsWithTypes } from 'glob';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

// Legacy agent type mapping for backward compatibility
const LEGACY_AGENT_MAPPING = {
  analyst: 'code-analyzer',
  coordinator: 'hierarchical-coordinator',
  optimizer: 'perf-analyzer',
  documenter: 'api-docs',
  monitor: 'performance-benchmarker',
  specialist: 'system-architect',
  architect: 'system-architect',
} as const;

/**
 * Resolve legacy agent types to current equivalents
 */
export function resolveLegacyAgentType(legacyType: string): string {
  return LEGACY_AGENT_MAPPING[legacyType as keyof typeof LEGACY_AGENT_MAPPING] || legacyType;
}

export interface AgentDefinition {
  name: string;
  type?: string;
  color?: string;
  description: string;
  tools?: string[];
  model?: string;
  capabilities?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  hooks?: {
    pre?: string;
    post?: string;
    task_complete?: string;
    on_rerun_request?: string;
    lifecycle?: Record<string, string>;
  };
  lifecycle?: {
    state_management?: boolean;
    persistent_memory?: boolean;
    max_retries?: number;
    timeout_ms?: number;
    auto_cleanup?: boolean;
  };
  content?: string;
}

export interface AgentCategory {
  name: string;
  agents: AgentDefinition[];
}

export class AgentLoader {
  private agentCache = new Map<string, AgentDefinition>();
  private categoriesCache: AgentCategory[] = [];
  private lastLoadTime = 0;
  private readonly CACHE_EXPIRY = 60_000; // 1 minute cache

  private getAgentsDirectory(): string {
    let currentDir = process.cwd();

    while (currentDir !== '/') {
      const claudeAgentsPath = resolve(currentDir, '.claude', 'agents');
      if (existsSync(claudeAgentsPath)) {
        return claudeAgentsPath;
      }
      currentDir = dirname(currentDir);
    }

    return resolve(process.cwd(), '.claude', 'agents');
  }

  private parseAgentFile(filePath: string): AgentDefinition | null {
    try {
      const content = readFileSync(filePath, 'utf-8');

      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        console.warn(`No frontmatter found in ${filePath}`);
        return null;
      }

      const [, yamlContent, markdownContent] = frontmatterMatch;
      const frontmatter = parseYaml(yamlContent) as Record<string, unknown>;

      const description = frontmatter.description;
      if (!frontmatter.name || !description) {
        console.warn(`Missing required fields (name, description) in ${filePath}`);
        return null;
      }

      return {
        name: String(frontmatter.name),
        type: frontmatter.type ? String(frontmatter.type) : undefined,
        color: frontmatter.color ? String(frontmatter.color) : undefined,
        description: String(description),
        model: frontmatter.model ? String(frontmatter.model) : undefined,
        capabilities: Array.isArray(frontmatter.capabilities)
          ? frontmatter.capabilities.map(String)
          : [],
        priority: ['low', 'medium', 'high', 'critical'].includes(String(frontmatter.priority))
          ? String(frontmatter.priority) as AgentDefinition['priority']
          : 'medium',
        tools: this.parseTools(frontmatter),
        hooks: frontmatter.hooks as AgentDefinition['hooks'],
        content: markdownContent.trim(),
      };
    } catch (error) {
      console.error(`Error parsing agent file ${filePath}:`, error);
      return null;
    }
  }

  private parseTools(frontmatter: Record<string, unknown>): string[] {
    const extractTools = (input: unknown): string[] => {
      if (Array.isArray(input)) return input.map(String);
      if (typeof input === 'string') {
        return input.split(/[,\s]+/).map(t => t.trim()).filter(t => t.length > 0);
      }
      return [];
    };

    // Safely handle tools and capabilities.tools
    const toolsFromFrontmatter = frontmatter.tools
      ? extractTools(frontmatter.tools)
      : [];

    const toolsFromCapabilities = frontmatter.capabilities && typeof frontmatter.capabilities === 'object'
      ? extractTools(Object(frontmatter.capabilities).tools)
      : [];

    return [...toolsFromFrontmatter, ...toolsFromCapabilities];
  }

  private async loadAgents(): Promise<void> {
    const agentsDir = this.getAgentsDirectory();

    if (!existsSync(agentsDir)) {
      console.warn(`Agents directory not found: ${agentsDir}`);
      return;
    }

    const agentFiles = await glob('**/*.md', {
      root: agentsDir,
      ignore: ['**/README.md', '**/MIGRATION_SUMMARY.md'],
      absolute: true,
    } as GlobOptionsWithTypes);

    this.agentCache.clear();
    this.categoriesCache = [];

    const categoryMap = new Map<string, AgentDefinition[]>();

    for (const filePath of agentFiles) {
      const agent = this.parseAgentFile(filePath);
      if (agent) {
        this.agentCache.set(agent.name, agent);

        const relativePath = filePath.replace(agentsDir, '');
        const pathParts = relativePath.split('/');
        const category = pathParts[1] || 'uncategorized';

        if (!categoryMap.has(category)) {
          categoryMap.set(category, []);
        }
        categoryMap.get(category)!.push(agent);
      }
    }

    this.categoriesCache = Array.from(categoryMap.entries()).map(([name, agents]) => ({
      name,
      agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
    }));

    this.lastLoadTime = Date.now();
  }

  // Rest of the methods remain similar to the original implementation
  private needsRefresh(): boolean {
    return Date.now() - this.lastLoadTime > this.CACHE_EXPIRY;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.agentCache.size === 0 || this.needsRefresh()) {
      await this.loadAgents();
    }
  }

  async getAvailableAgentTypes(): Promise<string[]> {
    await this.ensureLoaded();
    const currentTypes = Array.from(this.agentCache.keys());
    const legacyTypes = Object.keys(LEGACY_AGENT_MAPPING);
    return Array.from(new Set([...currentTypes, ...legacyTypes])).sort();
  }

  async getAgent(name: string): Promise<AgentDefinition | null> {
    await this.ensureLoaded();
    return this.agentCache.get(name) || this.agentCache.get(resolveLegacyAgentType(name)) || null;
  }

  async getAllAgents(): Promise<AgentDefinition[]> {
    await this.ensureLoaded();
    return Array.from(this.agentCache.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAgentCategories(): Promise<AgentCategory[]> {
    await this.ensureLoaded();
    return this.categoriesCache;
  }

  async searchAgents(query: string): Promise<AgentDefinition[]> {
    await this.ensureLoaded();
    const lowerQuery = query.toLowerCase();

    return Array.from(this.agentCache.values()).filter((agent) =>
      agent.name.toLowerCase().includes(lowerQuery) ||
      agent.description.toLowerCase().includes(lowerQuery) ||
      agent.capabilities?.some((cap) => cap.toLowerCase().includes(lowerQuery))
    );
  }

  async isValidAgentType(name: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.agentCache.has(name) || this.agentCache.has(resolveLegacyAgentType(name));
  }

  async getAgentsByCategory(category: string): Promise<AgentDefinition[]> {
    const categories = await this.getAgentCategories();
    const found = categories.find((cat) => cat.name === category);
    return found?.agents || [];
  }

  async refresh(): Promise<void> {
    this.lastLoadTime = 0;
    await this.loadAgents();
  }
}

// Singleton instance
export const agentLoader = new AgentLoader();

// Convenience exports for use in other modules
export const getAvailableAgentTypes = () => agentLoader.getAvailableAgentTypes();
export const getAgent = (name: string) => agentLoader.getAgent(name);
export const getAllAgents = () => agentLoader.getAllAgents();
export const getAgentCategories = () => agentLoader.getAgentCategories();
export const searchAgents = (query: string) => agentLoader.searchAgents(query);
export const isValidAgentType = (name: string) => agentLoader.isValidAgentType(name);
export const getAgentsByCategory = (category: string) => agentLoader.getAgentsByCategory(category);
export const refreshAgents = () => agentLoader.refresh();
