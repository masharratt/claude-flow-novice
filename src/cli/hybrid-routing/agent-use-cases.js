#!/usr/bin/env node

/**
 * Agent Use Case Registry
 *
 * Provides intelligent agent selection based on use cases rather than keyword matching.
 * This module serves as the coordinator's interface to the agent use case system.
 *
 * Usage:
 *   const agentRegistry = await AgentUseCaseRegistry.load();
 *   const recommendations = agentRegistry.recommendAgents("Build authentication system");
 *   const securityAgents = agentRegistry.getAgentsByDomain('security');
 */

import { readFileSync } from 'fs';
import { join } from 'path';

class AgentUseCaseRegistry {
  constructor() {
    this.agentDefinitions = null;
    this.useCaseMappings = null;
    this.domainMappings = null;
  }

  /**
   * Load the agent use case registry from the documentation file
   */
  static async load() {
    const registry = new AgentUseCaseRegistry();
    await registry.initialize();
    return registry;
  }

  /**
   * Initialize the registry by parsing the AVAILABLE-AGENTS.md file
   */
  async initialize() {
    try {
      const agentsDocPath = join(process.cwd(), 'src/cli/hybrid-routing/AVAILABLE-AGENTS.md');
      const content = readFileSync(agentsDocPath, 'utf-8');

      this.parseUseCaseDocumentation(content);
      console.log('✅ Agent Use Case Registry loaded successfully');
    } catch (error) {
      console.log('⚠️  Could not load use case registry, falling back to basic mappings');
      this.initializeFallbackMappings();
    }
  }

  /**
   * Parse the use case documentation to extract agent mappings
   */
  parseUseCaseDocumentation(content) {
    const lines = content.split('\n');
    let currentSection = null;
    let agentDefinitions = {};
    let domainMappings = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect section headers
      if (line.startsWith('## ') && line.includes('AGENTS')) {
        currentSection = this.extractSectionTitle(line);
        continue;
      }

      // Parse agent table rows
      if (line.startsWith('| **') && currentSection) {
        const agentInfo = this.parseAgentTableRow(line);
        if (agentInfo) {
          agentDefinitions[agentInfo.name] = {
            ...agentInfo,
            domain: currentSection,
            category: this.categorizeAgent(currentSection, agentInfo.name)
          };
        }
      }
    }

    this.agentDefinitions = agentDefinitions;
    this.buildDomainMappings();
    this.buildUseCaseMappings();
  }

  /**
   * Extract section title from markdown header
   */
  extractSectionTitle(headerLine) {
    return headerLine.replace('##', '').trim().toLowerCase();
  }

  /**
   * Parse an agent table row
   */
  parseAgentTableRow(line) {
    // Match pattern: | **agent-name** | description | capabilities |
    const match = line.match(/\*\*(.*?)\*\*\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|/);
    if (match) {
      return {
        name: match[1].trim(),
        whenToUse: match[2].trim(),
        capabilities: match[3].trim()
      };
    }
    return null;
  }

  /**
   * Categorize agent based on section and name
   */
  categorizeAgent(section, agentName) {
    const categoryMap = {
      'core development agents': 'development',
      'validation & quality assurance': 'validation',
      'security specialists': 'security',
      'architecture & system design': 'architecture',
      'devops & infrastructure': 'infrastructure',
      'coordination & project management': 'coordination',
      'specialized domains': 'specialized',
      'cfn loop specialists': 'cfn-loop',
      'analysis & research': 'analysis',
      'specialized development patterns': 'development-patterns',
      'testing & validation specialists': 'testing',
      'context & memory management': 'context'
    };

    return categoryMap[section] || 'general';
  }

  /**
   * Build domain-specific agent mappings
   */
  buildDomainMappings() {
    this.domainMappings = {
      security: this.getAgentsByCapability(/security|vulnerability|audit|authentication|encryption|threat/i),
      performance: this.getAgentsByCapability(/performance|optimization|benchmark|speed|latency/i),
      architecture: this.getAgentsByCapability(/architecture|design|system|structure/i),
      development: this.getAgentsByCapability(/implementation|coding|programming|development/i),
      testing: this.getAgentsByCapability(/test|validation|verification|quality/i),
      infrastructure: this.getAgentsByCapability(/infrastructure|deployment|docker|kubernetes|cloud/i),
      coordination: this.getAgentsByCapability(/coordination|orchestration|management|planning/i),
      mobile: this.getAgentsByCapability(/mobile|ios|android|react-native/i),
      frontend: this.getAgentsByCapability(/frontend|react|ui|user interface/i),
      backend: this.getAgentsByCapability(/backend|api|server|database/i),
      blockchain: this.getAgentsByCapability(/blockchain|consensus|distributed|cryptographic/i),
      documentation: this.getAgentsByCapability(/documentation|api docs|specification/i)
    };
  }

  /**
   * Build use case mappings for common scenarios
   */
  buildUseCaseMappings() {
    this.useCaseMappings = {
      'feature-development': {
        primary: ['architect', 'coder', 'tester'],
        secondary: ['code-analyzer'],
        domain: 'development'
      },
      'security-audit': {
        primary: ['security-specialist', 'code-analyzer', 'tester'],
        secondary: ['production-validator'],
        domain: 'security'
      },
      'performance-optimization': {
        primary: ['perf-analyzer', 'code-booster'],
        secondary: ['tester'],
        domain: 'performance'
      },
      'system-architecture': {
        primary: ['system-architect', 'architect'],
        secondary: ['devops-engineer', 'security-architect-persona'],
        domain: 'architecture'
      },
      'api-development': {
        primary: ['api-designer-persona', 'backend-dev', 'api-docs'],
        secondary: ['security-specialist', 'tester'],
        domain: 'development'
      },
      'mobile-development': {
        primary: ['mobile-dev', 'react-frontend-engineer'],
        secondary: ['tester'],
        domain: 'mobile'
      },
      'infrastructure-setup': {
        primary: ['devops-engineer', 'system-architect'],
        secondary: ['security-specialist'],
        domain: 'infrastructure'
      },
      'quality-assurance': {
        primary: ['tester', 'code-analyzer', 'code-quality-validator'],
        secondary: ['production-validator'],
        domain: 'testing'
      },
      'multi-agent-coordination': {
        primary: ['coordinator-hybrid', 'task-coordinator'],
        secondary: ['adaptive-coordinator'],
        domain: 'coordination'
      },
      'cfn-loop-mvp': {
        primary: ['cfn-coordinator-mvp'],
        secondary: ['architect', 'coder'],
        domain: 'cfn-loop'
      },
      'cfn-loop-standard': {
        primary: ['cfn-coordinator-standard'],
        secondary: ['architect', 'coder', 'tester'],
        domain: 'cfn-loop'
      },
      'cfn-loop-enterprise': {
        primary: ['cfn-coordinator-enterprise'],
        secondary: ['system-architect', 'security-specialist', 'tester'],
        domain: 'cfn-loop'
      }
    };
  }

  /**
   * Get agents by capability keyword matching
   */
  getAgentsByCapability(keywordRegex) {
    const matches = [];
    for (const [agentName, agentDef] of Object.entries(this.agentDefinitions)) {
      if (keywordRegex.test(agentDef.whenToUse + ' ' + agentDef.capabilities)) {
        matches.push({
          name: agentName,
          ...agentDef
        });
      }
    }
    return matches;
  }

  /**
   * Recommend agents based on task description
   */
  recommendAgents(taskDescription, options = {}) {
    const task = taskDescription.toLowerCase();
    const recommendations = {
      primary: [],
      secondary: [],
      reasoning: []
    };

    // Check for explicit use case matches
    for (const [useCase, mapping] of Object.entries(this.useCaseMappings)) {
      if (this.taskMatchesUseCase(task, useCase)) {
        recommendations.primary.push(...mapping.primary);
        recommendations.secondary.push(...mapping.secondary);
        recommendations.reasoning.push(`Matched use case: ${useCase}`);
        break;
      }
    }

    // Check domain-specific keywords
    for (const [domain, agents] of Object.entries(this.domainMappings)) {
      if (this.taskMatchesDomain(task, domain)) {
        const domainAgents = agents.map(a => a.name);
        recommendations.primary.push(...domainAgents.slice(0, 3));
        recommendations.secondary.push(...domainAgents.slice(3));
        recommendations.reasoning.push(`Matched domain: ${domain}`);
      }
    }

    // Add coordination for complex tasks
    if (this.isComplexTask(task)) {
      if (!recommendations.primary.includes('coordinator-hybrid')) {
        recommendations.primary.unshift('coordinator-hybrid');
        recommendations.reasoning.push('Complex task requires coordination');
      }
    }

    // Add validation for implementation tasks
    if (this.isImplementationTask(task)) {
      if (!recommendations.primary.includes('tester')) {
        recommendations.secondary.push('tester');
        recommendations.reasoning.push('Implementation requires testing');
      }
    }

    // Remove duplicates and limit results
    recommendations.primary = [...new Set(recommendations.primary)].slice(0, 5);
    recommendations.secondary = [...new Set(recommendations.secondary)].slice(0, 3);

    // Add agent details
    recommendations.primaryDetails = recommendations.primary.map(name =>
      this.agentDefinitions[name] || { name, whenToUse: 'Agent definition not found' }
    );
    recommendations.secondaryDetails = recommendations.secondary.map(name =>
      this.agentDefinitions[name] || { name, whenToUse: 'Agent definition not found' }
    );

    return recommendations;
  }

  /**
   * Check if task matches a specific use case
   */
  taskMatchesUseCase(task, useCase) {
    const useCaseKeywords = {
      'feature-development': ['feature', 'build', 'implement', 'create', 'develop', 'add'],
      'security-audit': ['security', 'audit', 'vulnerability', 'penetration test', 'secure'],
      'performance-optimization': ['performance', 'optimize', 'slow', 'speed', 'improve performance'],
      'system-architecture': ['architecture', 'design system', 'system design', 'architecture'],
      'api-development': ['api', 'rest', 'graphql', 'endpoint', 'interface'],
      'mobile-development': ['mobile', 'ios', 'android', 'react native', 'app'],
      'infrastructure-setup': ['infrastructure', 'deployment', 'docker', 'kubernetes', 'cloud'],
      'quality-assurance': ['quality', 'testing', 'validation', 'review', 'qa'],
      'multi-agent-coordination': ['coordinate', 'manage multiple', 'team', 'orchestrate'],
      'cfn-loop-mvp': ['mvp', 'prototype', 'rapid', 'quick'],
      'cfn-loop-standard': ['standard', 'balanced', 'production'],
      'cfn-loop-enterprise': ['enterprise', 'compliance', 'secure', 'scalable']
    };

    const keywords = useCaseKeywords[useCase] || [];
    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check if task matches a domain
   */
  taskMatchesDomain(task, domain) {
    const domainKeywords = {
      security: ['security', 'authentication', 'authorization', 'encryption', 'vulnerability'],
      performance: ['performance', 'optimize', 'slow', 'fast', 'scalable'],
      architecture: ['architecture', 'design', 'structure', 'system'],
      development: ['code', 'implement', 'develop', 'program', 'build'],
      testing: ['test', 'validate', 'verify', 'qa', 'quality'],
      infrastructure: ['infrastructure', 'deployment', 'docker', 'kubernetes', 'cloud'],
      coordination: ['coordinate', 'manage', 'orchestrate', 'plan'],
      mobile: ['mobile', 'ios', 'android', 'app'],
      frontend: ['frontend', 'ui', 'react', 'interface', 'user'],
      backend: ['backend', 'api', 'server', 'database'],
      blockchain: ['blockchain', 'consensus', 'distributed', 'cryptographic'],
      documentation: ['documentation', 'docs', 'api docs', 'specification']
    };

    const keywords = domainKeywords[domain] || [];
    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Determine if task is complex enough to require coordination
   */
  isComplexTask(task) {
    const complexityIndicators = [
      'system', 'architecture', 'multiple', 'integrate', 'coordinate',
      'enterprise', 'production', 'complete', 'end-to-end', 'full'
    ];
    return complexityIndicators.some(indicator => task.includes(indicator));
  }

  /**
   * Determine if task involves implementation
   */
  isImplementationTask(task) {
    const implementationIndicators = [
      'build', 'implement', 'create', 'develop', 'code', 'feature'
    ];
    return implementationIndicators.some(indicator => task.includes(indicator));
  }

  /**
   * Get agents by domain
   */
  getAgentsByDomain(domain) {
    return this.domainMappings[domain] || [];
  }

  /**
   * Get all agent definitions
   */
  getAllAgents() {
    return this.agentDefinitions;
  }

  /**
   * Get agent definition by name
   */
  getAgent(name) {
    return this.agentDefinitions[name];
  }

  /**
   * Print agent recommendations in a readable format
   */
  printRecommendations(task, recommendations) {
    console.log(`\n🎯 Agent Recommendations for: "${task}"`);
    console.log('═'.repeat(60));

    if (recommendations.reasoning.length > 0) {
      console.log('\n📋 Reasoning:');
      recommendations.reasoning.forEach(reason => {
        console.log(`  • ${reason}`);
      });
    }

    if (recommendations.primary.length > 0) {
      console.log('\n🚀 Primary Agents:');
      recommendations.primaryDetails.forEach(agent => {
        console.log(`  • ${agent.name}`);
        console.log(`    ${agent.whenToUse}`);
      });
    }

    if (recommendations.secondary.length > 0) {
      console.log('\n🔧 Secondary Agents:');
      recommendations.secondaryDetails.forEach(agent => {
        console.log(`  • ${agent.name}`);
        console.log(`    ${agent.whenToUse}`);
      });
    }

    console.log('\n═'.repeat(60));
  }

  /**
   * Initialize fallback mappings if documentation parsing fails
   */
  initializeFallbackMappings() {
    this.agentDefinitions = {
      'coordinator-hybrid': {
        name: 'coordinator-hybrid',
        whenToUse: 'Multi-agent coordination and task orchestration',
        capabilities: 'Intelligent task decomposition, agent selection, progress monitoring',
        domain: 'coordination',
        category: 'coordination'
      },
      'architect': {
        name: 'architect',
        whenToUse: 'System design, component architecture, technical decisions',
        capabilities: 'High-level system design, component boundaries, technical decisions',
        domain: 'architecture',
        category: 'architecture'
      },
      'coder': {
        name: 'coder',
        whenToUse: 'General implementation, feature development',
        capabilities: 'Code implementation across languages, problem-solving',
        domain: 'development',
        category: 'development'
      },
      'tester': {
        name: 'tester',
        whenToUse: 'Test creation, quality assurance, validation',
        capabilities: 'Unit tests, integration tests, TDD practices',
        domain: 'testing',
        category: 'testing'
      },
      'security-specialist': {
        name: 'security-specialist',
        whenToUse: 'Security audits, vulnerability assessment',
        capabilities: 'Security audits, vulnerability scanning, secure coding',
        domain: 'security',
        category: 'security'
      }
    };

    this.buildDomainMappings();
    this.buildUseCaseMappings();
  }
}

// Export for use in other modules
export default AgentUseCaseRegistry;

// CLI interface for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const task = process.argv[2];
  if (!task) {
    console.log('Usage: node agent-use-cases.js "task description"');
    process.exit(1);
  }

  AgentUseCaseRegistry.load().then(registry => {
    const recommendations = registry.recommendAgents(task);
    registry.printRecommendations(task, recommendations);
  });
}