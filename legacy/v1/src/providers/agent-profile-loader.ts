/**
 * Agent Profile Loader
 * Loads and parses agent profiles from .claude/agents/*.md files
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { LLMProvider } from './types.js';

export interface AgentProfile {
  name: string;
  model?: string;
  provider?: LLMProvider;
  description?: string;
  tools?: string[];
  color?: string;
  type?: string;
  capabilities?: string[];
}

export class AgentProfileLoader {
  private profileCache: Map<string, AgentProfile> = new Map();
  private agentsDir: string;

  constructor(agentsDir?: string) {
    // Default to .claude/agents in current working directory
    this.agentsDir = agentsDir || join(process.cwd(), '.claude', 'agents');
  }

  /**
   * Load agent profile from markdown file
   */
  loadProfile(agentType: string): AgentProfile | null {
    // Check cache first
    if (this.profileCache.has(agentType)) {
      return this.profileCache.get(agentType)!;
    }

    // Try multiple file paths
    const possiblePaths = [
      join(this.agentsDir, `${agentType}.md`),
      join(this.agentsDir, agentType, `${agentType}.md`),
      join(this.agentsDir, 'development', 'backend', `dev-${agentType}.md`),
      join(this.agentsDir, 'devops', 'ci-cd', `ops-${agentType}.md`),
      join(this.agentsDir, 'architecture', `${agentType}.md`),
      join(this.agentsDir, 'security', `${agentType}.md`),
      join(this.agentsDir, 'optimization', `${agentType}.md`),
      join(this.agentsDir, 'testing', `${agentType}.md`),
      join(this.agentsDir, 'frontend', `${agentType}.md`),
      join(this.agentsDir, 'data', 'ml', `data-ml-${agentType}.md`),
    ];

    for (const filePath of possiblePaths) {
      if (existsSync(filePath)) {
        const profile = this.parseProfileFile(filePath);
        if (profile) {
          this.profileCache.set(agentType, profile);
          return profile;
        }
      }
    }

    return null;
  }

  /**
   * Parse frontmatter from markdown file
   */
  private parseProfileFile(filePath: string): AgentProfile | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      // Handle both Unix (\n) and Windows (\r\n) line endings
      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

      if (!frontmatterMatch) {
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const profile: AgentProfile = {
        name: '',
      };

      // Parse YAML-like frontmatter
      const lines = frontmatter.split('\n');
      let currentKey: string | null = null;
      let currentArray: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip empty lines
        if (!trimmedLine) continue;

        // Array item
        if (trimmedLine.startsWith('- ')) {
          if (currentKey && currentArray) {
            currentArray.push(trimmedLine.substring(2).trim());
          }
          continue;
        }

        // Flush previous array
        if (currentKey && currentArray.length > 0) {
          this.setProfileValue(profile, currentKey, currentArray);
          currentArray = [];
        }

        // Key-value pair
        const colonIndex = trimmedLine.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmedLine.substring(0, colonIndex).trim();
          const value = trimmedLine.substring(colonIndex + 1).trim();

          currentKey = key;

          // Handle inline arrays (tools: [Read, Write, Edit])
          if (value.startsWith('[') && value.endsWith(']')) {
            const arrayValue = value
              .substring(1, value.length - 1)
              .split(',')
              .map((v) => v.trim());
            this.setProfileValue(profile, key, arrayValue);
            currentKey = null;
          }
          // Handle multiline description
          else if (value === '|') {
            currentArray = [];
          }
          // Handle simple value
          else if (value) {
            this.setProfileValue(profile, key, value);
            currentKey = null;
          } else {
            // Prepare for array
            currentArray = [];
          }
        }
      }

      // Flush final array
      if (currentKey && currentArray.length > 0) {
        this.setProfileValue(profile, currentKey, currentArray);
      }

      return profile.name ? profile : null;
    } catch (error) {
      console.warn(`Failed to parse agent profile: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Set profile value with type conversion
   */
  private setProfileValue(
    profile: AgentProfile,
    key: string,
    value: string | string[],
  ): void {
    switch (key) {
      case 'name':
        profile.name = Array.isArray(value) ? value.join(' ') : value;
        break;
      case 'model':
        profile.model = Array.isArray(value) ? value[0] : value;
        break;
      case 'provider':
        const providerValue = Array.isArray(value) ? value[0] : value;
        // Map 'zai' to 'custom' (ZaiProvider uses 'custom' internally)
        const mappedProvider = providerValue === 'zai' ? 'custom' : providerValue;
        // Validate provider value
        if (['anthropic', 'custom'].includes(mappedProvider)) {
          profile.provider = mappedProvider as LLMProvider;
        }
        break;
      case 'description':
        profile.description = Array.isArray(value) ? value.join('\n') : value;
        break;
      case 'tools':
        profile.tools = Array.isArray(value) ? value : [value];
        break;
      case 'color':
        profile.color = Array.isArray(value) ? value[0] : value;
        break;
      case 'type':
        profile.type = Array.isArray(value) ? value[0] : value;
        break;
      case 'capabilities':
        profile.capabilities = Array.isArray(value) ? value : [value];
        break;
    }
  }

  /**
   * Get provider preference from agent profile
   */
  getProviderPreference(agentType: string): LLMProvider | null {
    const profile = this.loadProfile(agentType);
    return profile?.provider || null;
  }

  /**
   * Clear profile cache
   */
  clearCache(): void {
    this.profileCache.clear();
  }
}
